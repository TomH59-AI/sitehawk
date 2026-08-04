import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

function normalizeJurisdiction(value) {
  return String(value || '').toUpperCase().replace(/\bCITY OF\b/g, '').replace(/\bCOUNTY\b/g, '').replace(/\s+/g, ' ').trim();
}

function cleanHtml(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, ' ').trim();
}

function verifiedPatch(extracted) {
  const patch = {};
  for (const field of ['height_limit_ft', 'setback_ft', 'fall_zone_ft', 'residential_separation_ft', 'tower_separation_ft']) {
    const value = extracted?.[field];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) patch[field] = value;
  }
  for (const field of ['permit_type', 'setback_rule', 'section_ref']) {
    const value = extracted?.[field];
    if (typeof value === 'string' && value.trim()) patch[field] = value.trim();
  }
  for (const field of ['pe_fall_zone_allowed', 'stealth_required', 'collocation_required']) {
    if (typeof extracted?.[field] === 'boolean') patch[field] = extracted[field];
  }
  return patch;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });
    const body = await req.json().catch(() => ({}));

    const supabaseUrl = String(secrets.get('HAWK_SUPABASE_URL') || '').replace(/^['"\\\s]+/, '').replace(/\/+$/, '');
    const serviceKey = secrets.get('HAWK_SUPABASE_SERVICE_ROLE_KEY') || secrets.get('SUPABASE_SERVICE_ROLE_KEY');
    const oxyUser = secrets.get('OXYLABS_USERNAME');
    const oxyPassword = secrets.get('OXYLABS_PASSWORD');
    const scrapflyKey = secrets.get('SCRAPFLY_API_KEY');
    if (!supabaseUrl || !serviceKey || !scrapflyKey) return Response.json({ error: 'Supabase or Scrapfly ordinance-drip configuration is missing' }, { status: 500 });

    const supabaseHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    const countResponse = await fetch(`${supabaseUrl}/rest/v1/telecom_ordinances?select=jurisdiction`, { method: 'HEAD', headers: { ...supabaseHeaders, Prefer: 'count=exact' } });
    const count = Number((countResponse.headers.get('content-range') || '').split('/')[1] || 0);
    if (!countResponse.ok || !count) return Response.json({ error: 'No Supabase telecom ordinances are available to refresh' }, { status: 502 });

    const dailyIndex = Math.floor(Date.now() / 86400000) % count;
    const select = 'id,jurisdiction,state,source_url,section_ref,height_limit_ft,setback_ft,fall_zone_ft,residential_separation_ft,tower_separation_ft,permit_type,setback_rule,pe_fall_zone_allowed,stealth_required,collocation_required';
    const rowResponse = await fetch(`${supabaseUrl}/rest/v1/telecom_ordinances?select=${select}&source_url=not.is.null&order=jurisdiction.asc&limit=1&offset=${dailyIndex}`, { headers: supabaseHeaders });
    let rows = rowResponse.ok ? await rowResponse.json() : [];
    if (!rows.length) {
      const fallback = await fetch(`${supabaseUrl}/rest/v1/telecom_ordinances?select=${select}&source_url=not.is.null&order=jurisdiction.asc&limit=1`, { headers: supabaseHeaders });
      rows = fallback.ok ? await fallback.json() : [];
    }
    const row = rows[0];
    if (!row?.source_url) return Response.json({ error: 'No ordinance row with an official source URL was found' }, { status: 422 });

    let sourceContent = '';
    let scraper = 'Scrapfly';
    if (oxyUser && oxyPassword) {
      const oxyResponse = await fetch('https://realtime.oxylabs.io/v1/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${btoa(`${oxyUser}:${oxyPassword}`)}` },
        body: JSON.stringify({ source: 'universal', url: row.source_url, render: 'html', geo_location: 'United States', user_agent_type: 'desktop' }),
      });
      if (oxyResponse.ok) {
        const oxyData = await oxyResponse.json();
        sourceContent = oxyData?.results?.[0]?.content || '';
        scraper = 'OxyLabs';
      } else {
        console.warn(`[ordinanceDrip] OxyLabs HTTP ${oxyResponse.status}; using Scrapfly fallback`);
      }
    }
    if (!sourceContent) {
      const params = new URLSearchParams({ key: scrapflyKey, url: row.source_url, asp: 'true', render_js: 'true', country: 'US' });
      const scrapflyResponse = await fetch(`https://api.scrapfly.io/scrape?${params}`);
      if (!scrapflyResponse.ok) return Response.json({ error: `Official ordinance scrape failed with HTTP ${scrapflyResponse.status}` }, { status: 502 });
      const scrapflyData = await scrapflyResponse.json();
      sourceContent = scrapflyData?.result?.content || '';
    }
    const sourceText = cleanHtml(sourceContent).slice(0, 150000);
    if (sourceText.length < 200) return Response.json({ error: 'Official ordinance source returned no usable text' }, { status: 502 });

    const extracted = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'gemini_3_flash',
      prompt: `Extract current wireless telecommunications tower rules for ${row.jurisdiction}, ${row.state} from the official ordinance text below.\n\nSTRICT ACCURACY RULES:\n- Return a numeric feet value only when the text explicitly states that exact number for the named rule. Preserve the number exactly; do not convert, infer, average, or round.\n- Return section_ref only when the exact section identifier appears in the text.\n- Return booleans only when the text explicitly requires or allows the item.\n- Omit every field that is absent or ambiguous. Never fabricate a value.\n- The source is ${row.source_url}.\n\nOFFICIAL TEXT:\n${sourceText}`,
      response_json_schema: {
        type: 'object',
        properties: {
          height_limit_ft: { type: 'number' }, setback_ft: { type: 'number' }, fall_zone_ft: { type: 'number' }, residential_separation_ft: { type: 'number' }, tower_separation_ft: { type: 'number' }, permit_type: { type: 'string' }, setback_rule: { type: 'string' }, pe_fall_zone_allowed: { type: 'boolean' }, stealth_required: { type: 'boolean' }, collocation_required: { type: 'boolean' }, section_ref: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, verification_notes: { type: 'string' }
        }
      }
    });

    const patch = verifiedPatch(extracted);
    if (!Object.keys(patch).length) return Response.json({ ok: true, updated: false, jurisdiction: row.jurisdiction, state: row.state, source_url: row.source_url, reason: 'No explicitly verified rule changes were extracted' });
    if (body.dry_run === true) return Response.json({ ok: true, dry_run: true, updated: false, jurisdiction: row.jurisdiction, state: row.state, source_url: row.source_url, verified_fields: Object.keys(patch), confidence: extracted?.confidence || null });

    const matchQuery = row.id ? `id=eq.${encodeURIComponent(row.id)}` : `jurisdiction=eq.${encodeURIComponent(row.jurisdiction)}&state=eq.${encodeURIComponent(row.state)}`;
    const updateResponse = await fetch(`${supabaseUrl}/rest/v1/telecom_ordinances?${matchQuery}`, { method: 'PATCH', headers: { ...supabaseHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(patch) });
    if (!updateResponse.ok) {
      const detail = await updateResponse.text();
      console.error(`[ordinanceDrip] Supabase update HTTP ${updateResponse.status}: ${detail.slice(0, 500)}`);
      return Response.json({ error: `Supabase ordinance update failed with HTTP ${updateResponse.status}` }, { status: 502 });
    }

    const normalized = normalizeJurisdiction(row.jurisdiction);
    const registryRows = await base44.asServiceRole.entities.TelecomOrdinance.filter({ state: String(row.state).toUpperCase(), jurisdiction_normalized: normalized }, null, 10);
    const sameType = /\b(COUNTY|PARISH)\b/i.test(row.jurisdiction || '');
    const registry = registryRows.find((item) => /\b(COUNTY|PARISH)\b/i.test(item.jurisdiction || '') === sameType);
    if (registry) await base44.asServiceRole.entities.TelecomOrdinance.update(registry.id, patch);

    console.log(`[ordinanceDrip] refreshed ${row.jurisdiction}, ${row.state}: ${Object.keys(patch).join(', ')}`);
    return Response.json({ ok: true, updated: true, jurisdiction: row.jurisdiction, state: row.state, source_url: row.source_url, verified_fields: Object.keys(patch), confidence: extracted?.confidence || null, completed_at: new Date().toISOString() });
  } catch (error) {
    console.error('[ordinanceDrip] error:', error?.message || String(error));
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}