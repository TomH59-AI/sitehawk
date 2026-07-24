import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { jsPDF } from 'npm:jspdf@4.0.0';

// TalonFit® Compliance Report — generated ONLY server-side from the immutable
// TalonFitRunLog audit record. Returns the PDF as base64 for download.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { run_id } = await req.json();
    if (!run_id) return Response.json({ error: 'run_id required' }, { status: 400 });

    const runs = await base44.asServiceRole.entities.TalonFitRunLog.filter({ run_id }, '-created_date', 1);
    const run = runs[0];
    if (!run) return Response.json({ error: 'TalonFit run not found' }, { status: 404 });
    if (run.user_id !== user.id && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const reportId = `TF-${String(run_id).replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const generatedUtc = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const runUtc = run.run_timestamp_utc
      ? String(run.run_timestamp_utc).replace('T', ' ').slice(0, 19) + ' UTC'
      : generatedUtc;

    const doc = new jsPDF();
    const W = 210;

    // ── Cover header band ──
    doc.setFillColor(11, 27, 46);
    doc.rect(0, 0, W, 62, 'F');
    doc.setTextColor(56, 189, 248);
    doc.setFontSize(10);
    doc.text('SITEHAWK', 14, 16);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.text('TalonFit\u2122 Certified', 14, 32);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text('Timestamped Compliance Report', 14, 42);
    doc.setFontSize(10);
    doc.setTextColor(148, 200, 255);
    doc.text('Powered by SiteHawk TalonFit\u00AE proprietary feasibility engine', 14, 52);

    // ── Report meta ──
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.text(`Report ID: ${reportId}`, 14, 74);
    doc.text(`Report generated: ${generatedUtc}`, 14, 80);
    doc.text(`Run ID: ${run.run_id}`, 14, 86);
    doc.text(`Run timestamp: ${runUtc}`, 14, 92);

    // ── Details table ──
    const rows = [
      ['Site coordinates', `${Number(run.latitude).toFixed(6)}, ${Number(run.longitude).toFixed(6)}`],
      ['Parcel ID (APN)', run.parcel_id || '\u2014'],
      ['Jurisdiction', run.jurisdiction || '\u2014'],
      ['Evaluated tower height', run.tower_height_ft != null ? `${run.tower_height_ft} ft` : '\u2014'],
      ['Final max buildable height', run.max_height_ft != null ? `${run.max_height_ft} ft` : '\u2014'],
      ['Binding constraint', run.binding_constraint || '\u2014'],
      ['Feasibility result', run.feasible ? 'PASS \u2014 TalonFit\u2122 Certified' : `${run.result_class || 'Not certified'}`],
      ['Executed by', run.user_email || run.user_id],
      ['Organization', run.organization_id || '\u2014'],
      ['TalonFit surface', run.source === 'hawkperch' ? 'HawkPerch (HawkFit Map)' : 'Tower Siter'],
    ];
    let y = 106;
    doc.setFontSize(11);
    rows.forEach(([label, value], i) => {
      if (i % 2 === 0) {
        doc.setFillColor(241, 245, 249);
        doc.rect(12, y - 5.5, W - 24, 9, 'F');
      }
      doc.setFont('helvetica', 'bold');
      doc.text(label, 14, y);
      doc.setFont('helvetica', 'normal');
      const wrapped = doc.splitTextToSize(String(value), 110);
      doc.text(wrapped, 84, y);
      y += Math.max(9, wrapped.length * 6 + 3);
    });

    // ── Certification note ──
    y += 6;
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const note = doc.splitTextToSize(
      'This compliance report was generated exclusively by the SiteHawk TalonFit\u00AE feasibility engine from an immutable server-side audit record. It cannot be recreated or modified client-side. Preliminary feasibility screen only \u2014 not a stamped survey, zoning determination, or final tower location.',
      W - 28,
    );
    doc.text(note, 14, y);

    // ── Footer ──
    doc.setFillColor(11, 27, 46);
    doc.rect(0, 282, W, 15, 'F');
    doc.setTextColor(148, 200, 255);
    doc.setFontSize(9);
    doc.text('Generated exclusively by SiteHawk TalonFit\u00AE', 14, 291);
    doc.text(reportId, W - 14, 291, { align: 'right' });

    const pdfBase64 = doc.output('datauristring').split('base64,')[1];

    await base44.asServiceRole.entities.TalonFitRunLog.update(run.id, {
      report_id: reportId,
      report_generated_at: new Date().toISOString(),
    });

    return Response.json({ report_id: reportId, pdf_base64: pdfBase64 });
  } catch (error) {
    console.error('talonfitReport error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});