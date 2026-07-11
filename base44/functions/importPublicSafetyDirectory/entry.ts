// One-shot importer: loads the FL/GA Police & Fire directory XLSX into the
// PublicSafetyAgency entity. Re-runnable — wipes and reloads each state+category
// group it imports, so it never duplicates. Admin only.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import * as XLSX from 'npm:xlsx@0.18.5';

const SHEETS = [
  { sheet: 'Florida Police', category: 'police', state: 'FL' },
  { sheet: 'Florida Fire',   category: 'fire',   state: 'FL' },
  { sheet: 'Georgia Police', category: 'police', state: 'GA' },
  { sheet: 'Georgia Fire',   category: 'fire',   state: 'GA' },
];

const str = (v) => (v == null ? undefined : String(v).trim() || undefined);
const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? undefined : Number(v));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { file_url } = await req.json();
    if (!file_url) return Response.json({ error: 'file_url required' }, { status: 400 });

    const buf = await (await fetch(file_url)).arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });

    const summary = {};
    for (const { sheet, category, state } of SHEETS) {
      const ws = wb.Sheets[sheet];
      if (!ws) { summary[sheet] = 'sheet not found'; continue; }
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      // Find the real header row ("Department Name"), data starts after it.
      const headerIdx = rows.findIndex((r) => r?.[0] === 'Department Name');
      if (headerIdx < 0) { summary[sheet] = 'header row not found'; continue; }

      const records = [];
      for (const r of rows.slice(headerIdx + 1)) {
        const name = str(r[0]);
        if (!name) continue;
        records.push({
          category,
          name,
          state,
          county: str(r[2])?.toUpperCase(),
          city: str(r[3]),
          street_address: str(r[4]),
          zip: str(r[5]),
          phone: str(r[6]),
          email: str(r[7]),
          website: str(r[8]),
          department_type: str(r[9]),
          agency_id: str(r[10]),
          latitude: num(r[11]),
          longitude: num(r[12]),
          source_url: str(r[13]),
        });
      }

      // Re-runnable: clear this exact group before reloading it.
      await base44.asServiceRole.entities.PublicSafetyAgency.deleteMany({ category, state });
      for (let i = 0; i < records.length; i += 200) {
        await base44.asServiceRole.entities.PublicSafetyAgency.bulkCreate(records.slice(i, i + 200));
      }
      summary[sheet] = records.length;
    }

    return Response.json({ ok: true, imported: summary });
  } catch (error) {
    console.error('importPublicSafetyDirectory failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});