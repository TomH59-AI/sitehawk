// hawkDocAnalyze — Hawk Document Intelligence backend (Base44).
// Reads an uploaded zoning / building-permit application (text extracted client-side
// from PDF or DOCX) and returns every form field with:
//   - a plain-English explanation of what the field is asking for
//   - a pre-filled value drawn from a chosen SCIP/Target record where possible
//   - whether it's required and which section it belongs to
// v1 scope: Read form + explain each field + Q&A to fill it. No fee calc / e-sign yet.
//
// Input (JSON): { documentId, docText, scipId, targetIndex }
// Output (JSON): { doc_type, doc_summary, fields:[...] } (also persisted on the record)

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MODEL = 'claude_opus_4_8';
const MAX_DOC_CHARS = 180_000;

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    doc_type: { type: 'string' },
    doc_summary: { type: 'string' },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          label: { type: 'string' },
          explanation: { type: 'string' },
          value: { type: 'string' },
          source: { type: 'string', enum: ['scip', 'user', 'empty'] },
          required: { type: 'boolean' },
          section: { type: 'string' },
          field_type: { type: 'string' },
        },
        required: ['key', 'label', 'explanation'],
      },
    },
  },
  required: ['doc_type', 'doc_summary', 'fields'],
};

// Build a compact, human-readable context block from the chosen SCIP + Target.
function buildScipContext(scip, targetIndex) {
  if (!scip) return 'No SCIP record was linked — leave applicant/site fields empty unless obvious.';
  const t = (scip.parcel_targets || [])[targetIndex || 0] || {};
  const lines = [
    `SCIP site name: ${scip.site_name || ''}`,
    `Agent (applicant): ${scip.agent_name || ''}, phone ${scip.agent_phone || ''}, email ${scip.agent_email || ''}`,
    `County / State: ${scip.county || ''} / ${scip.state || ''}`,
    `Latitude / Longitude: ${scip.latitude ?? ''}, ${scip.longitude ?? ''}`,
    `Zoning jurisdiction: ${scip.zoning_jurisdiction || ''}`,
    `--- Target (${t.label || 'Target A'}) ---`,
    `Owner name: ${t.owner_name || ''}`,
    `Parcel / situs address: ${t.parcel_address || ''}`,
    `APN / parcel ID: ${t.apn || ''}`,
    `Acreage: ${t.acreage ?? ''}`,
    `Zoning classification: ${t.zoning_classification || ''}`,
    `Owner mailing address: ${t.mailing_address || ''}`,
    `Land use: ${t.land_use || ''}`,
    `FEMA flood: ${t.fema_risk_factor || ''}`,
  ];
  return lines.filter((l) => !/:\s*$/.test(l)).join('\n');
}

function buildPrompt(docText, scipContext) {
  return `You are Hawk Document Intelligence, an assistant that helps a cell-tower site acquisition agent complete a government ZONING or BUILDING-PERMIT application.

You are given (1) the full text of an uploaded application form and (2) known site data from the agent's SCIP record. Your job:
1. Identify what this document is (doc_type) and write a short plain-English doc_summary of what it is and what approval it seeks.
2. Extract EVERY fillable field / blank / question on the form, in document order.
3. For each field provide:
   - key: short snake_case id
   - label: the field's printed label as it appears on the form
   - explanation: one short, plain-English sentence telling the agent exactly what to put here and why the jurisdiction wants it (so a non-expert gets it right)
   - value: pre-fill ONLY when the SCIP data clearly supplies it; otherwise empty string ""
   - source: 'scip' if you pre-filled it from the SCIP data, else 'empty'
   - required: true if the form marks it required or it is obviously mandatory
   - section: the form section/heading this field falls under (e.g. 'Applicant Information', 'Property Information', 'Project Details')
   - field_type: one of 'text','number','date','address','phone','email','checkbox','signature','money','long_text'
4. NEVER invent site facts. If the SCIP data doesn't clearly contain a value, leave value "" and source 'empty'.

KNOWN SITE DATA (SCIP):
"""
${scipContext}
"""

APPLICATION FORM TEXT:
"""
${String(docText).slice(0, MAX_DOC_CHARS)}
"""`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { documentId, docText, scipId, targetIndex } = (await req.json()) ?? {};
    if (!documentId) return Response.json({ error: 'documentId is required' }, { status: 400 });
    if (!docText || String(docText).trim().length < 40) {
      return Response.json({ error: 'Could not read enough text from this file. Make sure it is a text-based PDF or DOCX (not a scanned image).' }, { status: 400 });
    }

    // Optional SCIP context
    let scip = null;
    if (scipId) {
      try { scip = await base44.entities.ScipRecord.get(scipId); } catch (_e) { /* optional */ }
    }
    const scipContext = buildScipContext(scip, targetIndex);

    await base44.entities.HawkDocument.update(documentId, { status: 'analyzing' }).catch(() => {});

    let result;
    try {
      result = await base44.integrations.Core.InvokeLLM({
        prompt: buildPrompt(docText, scipContext),
        response_json_schema: RESULT_SCHEMA,
        model: MODEL,
      });
    } catch (e) {
      await base44.entities.HawkDocument.update(documentId, { status: 'failed' }).catch(() => {});
      return Response.json({ error: 'Analysis service error.', detail: String(e?.message ?? e) }, { status: 502 });
    }

    if (!result || !Array.isArray(result.fields)) {
      await base44.entities.HawkDocument.update(documentId, { status: 'failed' }).catch(() => {});
      return Response.json({ error: 'Could not extract fields from this document.' }, { status: 502 });
    }

    // Normalize fields (guard missing props).
    const fields = result.fields.map((f, i) => ({
      key: f.key || `field_${i}`,
      label: f.label || `Field ${i + 1}`,
      explanation: f.explanation || '',
      value: f.value || '',
      source: f.value ? (f.source || 'scip') : 'empty',
      required: !!f.required,
      section: f.section || 'General',
      field_type: f.field_type || 'text',
    }));

    const update = {
      doc_type: result.doc_type || 'Application',
      doc_summary: result.doc_summary || '',
      fields,
      status: 'ready',
      analyzed_at: new Date().toISOString(),
      linked_scip_id: scipId || '',
      linked_target_index: targetIndex || 0,
    };
    await base44.entities.HawkDocument.update(documentId, update).catch(() => {});

    console.log(`hawkDocAnalyze: ${fields.length} fields, type="${update.doc_type}" user=${user.email}`);
    return Response.json(update);
  } catch (err) {
    console.error('hawkDocAnalyze error:', err);
    return Response.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
});