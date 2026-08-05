/**
 * hawkPermitDocFetch — finds a jurisdiction's BUILDING PERMIT APPLICATION and
 * ZONING PERMIT APPLICATION documents using the Oxylabs Web Scraper API
 * (google_search source). Returns ONLY links Oxylabs actually returned from
 * official sources — nothing is invented. Empty array = no data available.
 *
 * POST { jurisdiction, state } -> { building: [...], zoning: [...], source }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

const OFFICIAL = /\.(gov|us)(\/|$)|\.gov\.|municode|ecode360|amlegal/i;

async function oxylabsSearch(query, auth) {
  const r = await fetch('https://realtime.oxylabs.io/v1/queries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({
      source: 'google_search',
      query,
      parse: true,
      geo_location: 'United States',
      user_agent_type: 'desktop',
    }),
  });
  if (!r.ok) {
    const t = (await r.text()).slice(0, 200);
    console.error(`[hawkPermitDocFetch] Oxylabs HTTP ${r.status}: ${t}`);
    throw new Error(`Oxylabs HTTP ${r.status}: ${t}`);
  }
  const data = await r.json().catch(() => null);
  const content = data?.results?.[0]?.content;
  const organic = content?.results?.organic || content?.results?.[0]?.organic || [];
  console.log(`[hawkPermitDocFetch] "${query}" -> organic ${organic.length}; keys ${Object.keys(content?.results || {}).join(',')}`);
  return organic
    .filter((o) => o?.url && OFFICIAL.test(o.url))
    .slice(0, 5)
    .map((o) => ({ title: o.title || o.url, url: o.url, pdf: /\.pdf($|\?)/i.test(o.url) }));
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { jurisdiction, state } = await req.json();
    if (!jurisdiction || !state) {
      return Response.json({ error: 'jurisdiction and state required' }, { status: 400 });
    }

    const username = secrets.get('OXYLABS_USERNAME') || Deno.env.get('OXYLABS_USERNAME');
    const password = secrets.get('OXYLABS_PASSWORD') || Deno.env.get('OXYLABS_PASSWORD');
    if (!username || !password) {
      return Response.json({ error: 'Oxylabs credentials not configured' }, { status: 500 });
    }
    const auth = `Basic ${btoa(`${username}:${password}`)}`;
    const place = `${jurisdiction} ${state}`;

    const [building, zoning] = await Promise.all([
      oxylabsSearch(`${place} building permit application form filetype:pdf`, auth),
      oxylabsSearch(`${place} zoning permit application form filetype:pdf`, auth),
    ]);

    return Response.json({ building, zoning, source: 'Oxylabs Web Scraper API (Google)' });
  } catch (error) {
    console.error('hawkPermitDocFetch error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}