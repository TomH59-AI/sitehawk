import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

// Scrapes jurisdiction rollups from the National Zoning Atlas (edit.zoningatlas.org)
// through the OxyLabs Web Scraper API (bypasses Cloudflare), then imports them into
// JurisdictionRegistry. Admin-only. Nothing is fabricated — records carry only what
// the Atlas returns; unknown state codes and unmapped fields stay blank.

const STATE_CODES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'puerto rico': 'PR',
};

function toStateCode(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  return STATE_CODES[v.toLowerCase()] || '';
}

// CBSA rollups carry no state_name — the state sits at the end of the name,
// e.g. "Abilene, TX" or "Kansas City, MO-KS" (multi-state CBSA → first code).
function stateFromName(name) {
  const tail = String(name || '').split(',').pop() || '';
  const m = tail.trim().match(/^([A-Za-z]{2})(?:[-–][A-Za-z]{2})*$/);
  return m ? m[1].toUpperCase() : '';
}

function extractId(url) {
  const m = String(url || '').match(/\/(\d+)\/$/);
  return m ? m[1] : '';
}

// Only enum values allowed by JurisdictionRegistry.jurisdiction_type are returned.
function getJurisdictionType(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('township')) return 'township';
  if (lower.includes(' city')) return 'city';
  if (lower.includes('village')) return 'village';
  if (lower.includes('county') || lower.includes('parish')) return 'county';
  return 'municipality';
}

function parseName(name) {
  const parts = String(name || '').split(', ');
  const city = parts[0] || String(name || '');
  let county = parts[1] || '';
  if (county.endsWith(' County')) county = county.slice(0, -7);
  if (county.endsWith(' Parish')) county = county.slice(0, -7);
  if (county.endsWith(' Borough')) county = county.slice(0, -8);
  return { city, county };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const areaType = body.area_type || 'jurisdiction';
    const username = body.oxylabs_username || secrets.get('OXYLABS_USERNAME');
    const password = body.oxylabs_password || secrets.get('OXYLABS_PASSWORD');

    if (!username || !password) {
      return Response.json({ error: 'Missing OxyLabs credentials' }, { status: 400 });
    }
    const validTypes = ['jurisdiction', 'county', 'cbsa', 'state'];
    if (!validTypes.includes(areaType)) {
      return Response.json({ error: 'Invalid area_type' }, { status: 400 });
    }

    const url = `https://edit.zoningatlas.org/statsrollup/${areaType}/?format=json`;
    const creds = btoa(`${username}:${password}`);
    const oxyRes = await fetch('https://realtime.oxylabs.io/v1/queries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${creds}` },
      body: JSON.stringify({ source: 'universal', url, render: 'html' }),
    });

    const oxyData = await oxyRes.json().catch(() => null);
    const content = oxyData?.results?.[0]?.content;
    if (!content) {
      return Response.json(
        { error: 'OxyLabs returned no content', status: oxyRes.status },
        { status: 502 },
      );
    }

    let parsed;
    try {
      parsed = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (e) {
      return Response.json({ error: 'Zoning Atlas response was not JSON' }, { status: 502 });
    }
    const areas = Array.isArray(parsed?.areas) ? parsed.areas : [];

    const records = areas
      .map((a) => {
        const isCbsa = areaType === 'cbsa';
        const { city, county } = parseName(a?.name);
        return {
          name: String(a?.name || ''),
          state: toStateCode(a?.state_name) || stateFromName(a?.name),
          county: isCbsa ? '' : county,
          jurisdiction_type: isCbsa ? 'cbsa' : getJurisdictionType(city),
          fips_code: extractId(a?.url),
          boundary_reference: String(a?.url || ''),
          active: true,
        };
      })
      .filter((r) => r.name && r.state);

    const skipped = areas.length - records.length;

    const BATCH_SIZE = 200;
    let created = 0;
    const errors = [];
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      try {
        await base44.asServiceRole.entities.JurisdictionRegistry.bulkCreate(batch);
        created += batch.length;
      } catch (err) {
        for (const record of batch) {
          try {
            await base44.asServiceRole.entities.JurisdictionRegistry.create(record);
            created += 1;
          } catch (e) {
            errors.push({ record: record.name, error: e.message });
          }
        }
      }
    }

    return Response.json({
      success: true,
      area_type: areaType,
      total_found: areas.length,
      total_created: created,
      skipped_missing_name_or_state: skipped,
      error_count: errors.length,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}