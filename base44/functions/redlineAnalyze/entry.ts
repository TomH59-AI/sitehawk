// redlineAnalyze — Hawk Redline Counter backend function (Base44).
// Compares the carrier's ORIGINAL lease against the LANDLORD ATTORNEY'S REDLINED
// version clause-by-clause and, from the CARRIER side, recommends
// accept / reject / counter for each change with a plain-English "why" and
// concrete counter language. Uses Base44's built-in Claude (InvokeLLM) — no
// external API key needed.
//
// NOT LEGAL ADVICE: refuses to run unless disclaimerAck is true.
//
// Input (JSON): { reviewId, originalText, redlinedText, disclaimerAck }
// Output (JSON): the comparison object (also persisted on the record)

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const MODEL = 'claude_opus_4_8';
const MAX_CHARS = 120_000;

const COMPARISON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          clause: { type: 'string' },
          original_text: { type: 'string' },
          redlined_text: { type: 'string' },
          change_type: { type: 'string', enum: ['added', 'removed', 'modified'] },
          recommendation: { type: 'string', enum: ['accept', 'reject', 'counter'] },
          impact: { type: 'string', enum: ['GREEN', 'YELLOW', 'RED'] },
          why: { type: 'string' },
          counter_language: { type: 'string' },
        },
      },
    },
  },
  required: ['summary', 'changes'],
};

function buildPrompt(originalText, redlinedText) {
  return `You are Hawk Redline Counter, a telecom ground-lease analyst for a site-acquisition platform.
You represent the CARRIER / TENANT (the wireless company). You are given the carrier's ORIGINAL lease and the LANDLORD ATTORNEY'S REDLINED version of that same lease.
Compare them clause-by-clause and, from the CARRIER's perspective, recommend how to respond to each change the landlord made.

CRITICAL RULES:
- This is ANALYSIS, NOT LEGAL ADVICE. Do not claim to be a lawyer.
- Only report changes that actually differ between the two documents. Do not invent changes.
- Quote lease language briefly (under 20 words) when citing; otherwise paraphrase.
- Focus on substantive changes (rent, term, escalations, assignment, termination, access, removal/restoration, indemnity, default). Ignore trivial formatting.

For EACH meaningful change provide:
  clause           — the clause name (e.g. "Rent Escalation", "Assignment")
  original_text     — short plain-English summary of what the carrier's version said
  redlined_text     — short plain-English summary of what the landlord changed it to
  change_type       — added | removed | modified
  recommendation    — accept | reject | counter (from the CARRIER side)
  impact            — GREEN (good/neutral for carrier) | YELLOW (negotiable) | RED (harmful to carrier)
  why               — plain-English reason for the recommendation, from the carrier's interest
  counter_language  — concrete redline language the carrier should send back (empty string if accepting)

Also provide a top-level summary (2-3 sentences) of what the landlord changed overall and the carrier-side posture.

CARRIER ORIGINAL LEASE:
"""
${String(originalText).slice(0, MAX_CHARS)}
"""

LANDLORD REDLINED LEASE:
"""
${String(redlinedText).slice(0, MAX_CHARS)}
"""`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { reviewId, originalText, redlinedText, disclaimerAck } = body ?? {};

    if (!reviewId) return Response.json({ error: 'reviewId is required' }, { status: 400 });
    if (!disclaimerAck) return Response.json({ error: 'You must acknowledge that this is analysis, not legal advice.' }, { status: 400 });
    if (!originalText || String(originalText).trim().length < 50) return Response.json({ error: 'Original lease text is missing or too short.' }, { status: 400 });
    if (!redlinedText || String(redlinedText).trim().length < 50) return Response.json({ error: 'Redlined lease text is missing or too short.' }, { status: 400 });

    let rec;
    try {
      rec = await base44.entities.RedlineReview.get(reviewId);
    } catch (_e) {
      return Response.json({ error: 'Redline record not found.' }, { status: 404 });
    }

    // Already completed — return stored comparison, no re-spend.
    if (rec?.status === 'completed' && Array.isArray(rec?.changes) && rec.changes.length) {
      return Response.json({ summary: rec.summary, changes: rec.changes, served_from_cache: true });
    }

    try {
      await base44.entities.RedlineReview.update(reviewId, { status: 'analyzing', model_used: MODEL });
    } catch (_e) { /* continue */ }

    let result;
    try {
      result = await base44.integrations.Core.InvokeLLM({
        prompt: buildPrompt(originalText, redlinedText),
        response_json_schema: COMPARISON_SCHEMA,
        model: MODEL,
      });
    } catch (e) {
      await base44.entities.RedlineReview.update(reviewId, { status: 'failed' }).catch(() => {});
      return Response.json({ error: 'Analysis service error.', detail: String(e?.message ?? e) }, { status: 502 });
    }

    if (!result || typeof result !== 'object' || !Array.isArray(result.changes)) {
      await base44.entities.RedlineReview.update(reviewId, { status: 'failed' }).catch(() => {});
      return Response.json({ error: 'Could not parse comparison output.' }, { status: 502 });
    }

    try {
      await base44.entities.RedlineReview.update(reviewId, {
        summary: result.summary || '',
        changes: result.changes,
        status: 'completed',
        analyzed_at: new Date().toISOString(),
      });
    } catch (_e) { /* still return */ }

    return Response.json({ summary: result.summary, changes: result.changes, served_from_cache: false });
  } catch (err) {
    console.error('redlineAnalyze error:', err);
    return Response.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
});