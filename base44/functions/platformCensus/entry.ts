// platformCensus — stamps WHERE each jurisdiction's code actually lives, so the
// scrapers route instead of rediscovering the publisher on every single hunt.
//
// The problem this kills: national_jurisdictions carried 3,221 counties and
// scrape_queue 9,739 municipalities, and virtually none of them said which
// codifier publishes their code. Every CodeHawk hunt therefore burned most of
// its 45-second budget on an LLM web search just to find the code's front door.
//
// This function walks the publisher DIRECTORIES instead — one cheap listing per
// state classifies every client in that state at once:
//   - Municode: public JSON API (api.municode.com). Authoritative; also yields
//     the ClientID, which lets CodeHawk read telecom sections via the API with
//     no scraping at all.
//   - American Legal: codelibrary.amlegal.com/regions/{st} HTML, parsed for
//     /codes/{slug}/latest links.
//   - eCode360 / Code Publishing (ICC): JS-only directories with no static
//     listing — NOT probed. Rows they host stay 'unlisted' and keep flowing
//     through CodeHawk's LLM discovery, which handles them today.
//
// Matching is exact on normalized names with county-ness required to agree, so
// "York" the city can never claim "York County" 's directory entry.
//
// Runs in batches of states, stamps platform_checked_at on every row it
// examines (matched or not), and re-checks rows older than recheck_days.
// Call it nightly and it first works through the backlog, then keeps the
// census fresh forever. Idempotent; safe to fire twice.
//
// Auth: x-webhook-secret header (n8n / workflow) OR a signed-in admin.
// Args: { states_per_run?: 8, recheck_days?: 90, states?: ['OK','TX'] }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

const MUNICODE_API = 'https://api.municode.com';
const TIME_BUDGET_MS = 4.5 * 60 * 1000;

function clean(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

// County-equivalent words by state. PA/NJ/NY/CT boroughs are MUNICIPALITIES,
// so BOROUGH only counts as a county word in Alaska.
function countyWord(state) {
  if (state === 'AK') return /\b(BOROUGH|CENSUS AREA)\b/i;
  if (state === 'LA') return /\b(PARISH|COUNTY)\b/i;
  return /\bCOUNTY\b/i;
}

function normalizeName(name, state) {
  return clean(name)
    .toUpperCase()
    .replace(/\b(CITY|TOWN|VILLAGE|TOWNSHIP)\s+OF\s+/g, '')
    .replace(countyWord(state), ' ')
    .replace(/\bPARISH\b/gi, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const municodeSlug = (name) =>
  clean(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

async function fetchJson(url, timeoutMs = 20000) {
  const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

// ─── Publisher directories, one state at a time ─────────────────────────────

let municodeStateIds = null; // cached across states within one invocation

async function municodeDirectory(state) {
  if (!municodeStateIds) {
    const states = await fetchJson(`${MUNICODE_API}/states`);
    municodeStateIds = new Map(states.map((s) => [s.StateAbbreviation, s.StateID]));
  }
  const sid = municodeStateIds.get(state);
  if (!sid) return [];
  const clients = await fetchJson(`${MUNICODE_API}/Clients/stateId/${sid}`);
  return (clients || []).map((c) => ({
    name: clean(c.ClientName),
    platform: 'municode',
    url: `https://library.municode.com/${state.toLowerCase()}/${municodeSlug(c.ClientName)}`,
    client_id: String(c.ClientID),
  }));
}

async function amlegalDirectory(state) {
  const r = await fetch(`https://codelibrary.amlegal.com/regions/${state.toLowerCase()}`, {
    headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 (SiteHawk platform census)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) return [];
  const html = await r.text();
  const out = [];
  const seen = new Set();
  // <a href="/codes/{slug}/latest/...">Name</a> — anchor text may wrap markup.
  const re = /href="(?:https:\/\/codelibrary\.amlegal\.com)?(\/codes\/([a-z0-9_-]+)\/latest[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const name = clean(m[3].replace(/<[^>]+>/g, ''));
    if (!name || seen.has(m[2])) continue;
    seen.add(m[2]);
    out.push({
      name,
      platform: 'amlegal',
      url: `https://codelibrary.amlegal.com/codes/${m[2]}/latest/overview`,
      client_id: null,
    });
  }
  return out;
}

// ─── Supabase REST ──────────────────────────────────────────────────────────

function sb() {
  const base = String(secrets.get('HAWK_SUPABASE_URL') || '').replace(/\/+$/, '');
  const key = secrets.get('HAWK_SUPABASE_SERVICE_ROLE_KEY') || secrets.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !key) throw new Error('Supabase credentials not configured');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  return {
    async get(path) {
      const r = await fetch(`${base}/rest/v1/${path}`, { headers, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
      return r.json();
    },
    async patch(path, body) {
      const r = await fetch(`${base}/rest/v1/${path}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error(`PATCH ${path} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
    },
  };
}

async function inBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

// ─── One state end to end ───────────────────────────────────────────────────

async function censusState(db, state, recheckBefore, stats) {
  // Directory failures are per-publisher, not fatal — a state with a working
  // Municode list still gets classified even if AmLegal times out.
  const [muni, aml] = await Promise.all([
    municodeDirectory(state).catch((e) => { stats.errors.push(`${state} municode: ${e.message}`); return []; }),
    amlegalDirectory(state).catch((e) => { stats.errors.push(`${state} amlegal: ${e.message}`); return []; }),
  ]);

  // Index by normalized name, split by county-ness. Municode wins conflicts —
  // its API is authoritative and it carries the client_id CodeHawk can use.
  const counties = new Map();
  const places = new Map();
  for (const entry of [...aml, ...muni]) { // municode LAST so it overwrites
    const isCounty = countyWord(state).test(entry.name);
    const key = normalizeName(entry.name, state);
    if (!key) continue;
    (isCounty ? counties : places).set(key, entry);
  }
  stats.directory_sizes[state] = { municode: muni.length, amlegal: aml.length };

  const now = new Date().toISOString();
  const stamp = (row, entry, table) => {
    const patch = { platform_checked_at: now };
    if (entry) {
      patch.scrape_platform = entry.platform;
      patch.municode_client_id = entry.client_id;
      if (table === 'national_jurisdictions') {
        if (entry.platform === 'municode') patch.municode_url = entry.url;
        else patch.ordinance_url = entry.url;
      } else {
        patch.ordinance_url = entry.url;
      }
      stats[entry.platform]++;
    } else {
      // Only claim 'unlisted' when nothing was ever set by hand.
      if (!row.scrape_platform) patch.scrape_platform = 'unlisted';
      stats.unlisted++;
    }
    return patch;
  };

  // Counties (national_jurisdictions) — match against county-named entries.
  const natRows = await db.get(
    `national_jurisdictions?select=id,county_name,scrape_platform&state_abbr=eq.${state}` +
    `&or=(platform_checked_at.is.null,platform_checked_at.lt.${encodeURIComponent(recheckBefore)})&limit=1000`
  );
  await inBatches(natRows, 10, async (row) => {
    const entry = counties.get(normalizeName(row.county_name, state)) || null;
    await db.patch(`national_jurisdictions?id=eq.${row.id}`, stamp(row, entry, 'national_jurisdictions'))
      .catch((e) => stats.errors.push(`nat ${row.id}: ${e.message}`));
  });

  // Municipalities (scrape_queue) — match against non-county entries.
  const qRows = await db.get(
    `scrape_queue?select=id,jurisdiction,jurisdiction_type,scrape_platform&state=eq.${state}` +
    `&or=(platform_checked_at.is.null,platform_checked_at.lt.${encodeURIComponent(recheckBefore)})&limit=3000`
  );
  await inBatches(qRows, 10, async (row) => {
    const wantsCounty = row.jurisdiction_type === 'county' || countyWord(state).test(row.jurisdiction || '');
    const pool = wantsCounty ? counties : places;
    const entry = pool.get(normalizeName(row.jurisdiction, state)) || null;
    await db.patch(`scrape_queue?id=eq.${row.id}`, stamp(row, entry, 'scrape_queue'))
      .catch((e) => stats.errors.push(`sq ${row.id}: ${e.message}`));
  });

  stats.rows_checked += natRows.length + qRows.length;
}

// ─── Entry ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const started = Date.now();
  try {
    // Webhook secret (workflow / n8n) or a signed-in admin.
    const secret = secrets.get('WEBHOOK_SECRET');
    const viaWebhook = secret && (req.headers.get('x-webhook-secret') || '') === secret;
    if (!viaWebhook) {
      const base44 = createClientFromRequest(req);
      const user = await base44.auth.me().catch(() => null);
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await req.json().catch(() => ({}));
    const statesPerRun = Math.min(Number(body.states_per_run) || 8, 15);
    const recheckDays = Number(body.recheck_days) || 90;
    const recheckBefore = new Date(Date.now() - recheckDays * 86400000).toISOString();

    const db = sb();

    // Which states still have unchecked (or stale) rows? Backlog first, by size.
    let targetStates = Array.isArray(body.states) && body.states.length
      ? body.states.map((s) => String(s).toUpperCase())
      : null;
    if (!targetStates) {
      const [nat, sq] = await Promise.all([
        db.get(`national_jurisdictions?select=state_abbr&or=(platform_checked_at.is.null,platform_checked_at.lt.${encodeURIComponent(recheckBefore)})&limit=5000`),
        db.get(`scrape_queue?select=state&or=(platform_checked_at.is.null,platform_checked_at.lt.${encodeURIComponent(recheckBefore)})&limit=15000`),
      ]);
      const countByState = new Map();
      for (const r of nat) countByState.set(r.state_abbr, (countByState.get(r.state_abbr) || 0) + 1);
      for (const r of sq) countByState.set(r.state, (countByState.get(r.state) || 0) + 1);
      targetStates = [...countByState.entries()]
        .filter(([s]) => /^[A-Z]{2}$/.test(String(s || '')))
        .sort((a, b) => b[1] - a[1])
        .map(([s]) => s);
    }

    const stats = {
      states_processed: [], rows_checked: 0,
      municode: 0, amlegal: 0, unlisted: 0,
      directory_sizes: {}, errors: [],
    };

    for (const state of targetStates) {
      if (stats.states_processed.length >= statesPerRun) break;
      if (Date.now() - started > TIME_BUDGET_MS) { stats.time_budget_hit = true; break; }
      await censusState(db, state, recheckBefore, stats);
      stats.states_processed.push(state);
    }

    stats.remaining_states = targetStates.length - stats.states_processed.length;
    stats.duration_ms = Date.now() - started;
    stats.errors = stats.errors.slice(0, 20);
    console.log(
      `platformCensus: states=[${stats.states_processed.join(',')}] rows=${stats.rows_checked} ` +
      `municode=${stats.municode} amlegal=${stats.amlegal} unlisted=${stats.unlisted} remaining=${stats.remaining_states}`
    );
    return Response.json({ ok: true, ...stats });
  } catch (error) {
    console.error('platformCensus error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
