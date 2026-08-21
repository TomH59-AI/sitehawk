/**
 * CodeHawk — shared ordinance-harvesting pipeline.
 *
 * This module is the engine behind the CodeHawk Super Agent. It fixes the two
 * structural problems the old pipeline had:
 *
 *   1. The scraper and the extractor were not connected. OxyLabs returned the
 *      ordinance text and the extractor then kicked off its OWN research pass,
 *      burning time and credits re-finding a page we were already holding.
 *      Here, fetchOrdinanceSource() hands its actual text straight to
 *      extractOrdinanceFields() — one fetch, one extraction.
 *
 *   2. Nothing was cited at the field level, so a height limit and a guess
 *      looked identical in the registry. Every value now carries its own
 *      verbatim quote, section number, source URL, confidence, and verified
 *      date, and a value only lands in TelecomOrdinance if its quote is
 *      programmatically found in the source text AND a second QC pass confirms
 *      it. Everything else goes to OrdinanceReviewQueue instead of being guessed.
 *
 * Fetch escalation is direct-first and deliberately cost-aware:
 *   every candidate is tried directly, in parallel, and only if ALL of them
 *   fail does one single candidate get escalated through a tiered Scrapfly
 *   request, then OxyLabs only as a final fallback. Paid scraping is capped,
 *   measured, and never the default path.
 *
 * Secrets are passed IN by the calling function (which imports base44:runtime
 * statically) rather than read here, so this module stays bundler-safe.
 */

// The six values that decide whether a tower can actually be sited.
export const CRITICAL_FIELDS = [
  'height_limit_ft',
  'setback_ft',
  'fall_zone_ft',
  'residential_separation_ft',
  'tower_separation_ft',
  'pe_fall_zone_allowed',
];

export const NUMERIC_FIELDS = [
  'height_limit_ft',
  'setback_ft',
  'fall_zone_ft',
  'fall_zone_pct_of_height',
  'residential_separation_ft',
  'tower_separation_ft',
];

export const BOOLEAN_FIELDS = [
  'pe_fall_zone_allowed',
  'pe_letter_required',
  'stealth_required',
  'collocation_required',
];

export const STRING_FIELDS = ['permit_type', 'setback_rule'];

export const EXTRACTED_FIELDS = [...NUMERIC_FIELDS, ...BOOLEAN_FIELDS, ...STRING_FIELDS];

export const FIELD_LABELS = {
  height_limit_ft: 'Maximum tower height (ft)',
  setback_ft: 'Setback from property line (ft)',
  fall_zone_ft: 'Fall zone (ft)',
  fall_zone_pct_of_height: 'Fall zone (% of height)',
  residential_separation_ft: 'Residential separation (ft)',
  tower_separation_ft: 'Tower-to-tower separation (ft)',
  pe_fall_zone_allowed: 'PE letter can reduce fall zone / setback',
  pe_letter_required: 'PE letter required',
  stealth_required: 'Stealth / concealment required',
  collocation_required: 'Collocation required first',
  permit_type: 'Approval path',
  setback_rule: 'Setback rule (formula)',
};

/* ------------------------------------------------------------------ *
 * Nationwide governing-body rules
 *
 * "The county" is not a safe universal fallback. The United States does not
 * name or empower its county-equivalents consistently, and getting this wrong
 * means citing a body that has no land-use authority over the site:
 *   - Louisiana calls them Parishes.
 *   - Alaska calls them Boroughs and Census Areas — and roughly half the state
 *     sits in the Unorganized Borough, which has NO local government and no
 *     zoning at all.
 *   - Pennsylvania and New Jersey use "Borough" for MUNICIPALITIES, so the word
 *     means the opposite thing there.
 *   - Connecticut and Rhode Island have no county governments; the town governs
 *     land use.
 *   - Virginia has 38 independent cities that belong to no county.
 * ------------------------------------------------------------------ */

// State → what its county-equivalent is actually called.
const COUNTY_EQUIVALENT_SUFFIX = { LA: 'Parish', AK: 'Borough' };

// Counties exist here as geography but not as a land-use government.
export const NO_COUNTY_GOVERNMENT = new Set(['CT', 'RI']);

// Words that mark a county-equivalent. Borough only counts in Alaska — in PA/NJ
// a borough is a municipality, and treating it as a county would match the
// wrong record entirely.
export function countyWordPattern(stateCode) {
  const st = String(stateCode || '').toUpperCase();
  return st === 'AK' ? /\b(COUNTY|PARISH|BOROUGH|CENSUS AREA|MUNICIPALITY)\b/i : /\b(COUNTY|PARISH)\b/i;
}

export function isCountyEquivalentName(stateCode, name) {
  return countyWordPattern(stateCode).test(String(name || ''));
}

/**
 * Build the name the registry would actually store for a county-equivalent,
 * e.g. "Brevard" + FL -> "Brevard County", "Orleans" + LA -> "Orleans Parish",
 * "Matanuska-Susitna" + AK -> "Matanuska-Susitna Borough". Returns null where
 * the county is not a governing body, so callers do not fall back to it.
 */
export function countyEquivalentLabel(stateCode, countyName) {
  const st = String(stateCode || '').toUpperCase();
  const name = String(countyName || '').trim();
  if (!name) return null;
  if (NO_COUNTY_GOVERNMENT.has(st)) return null;
  if (isCountyEquivalentName(st, name)) return name;
  return `${name} ${COUNTY_EQUIVALENT_SUFFIX[st] || 'County'}`;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

export function normalizeJurisdiction(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/\bCITY OF\b/g, '')
    .replace(/\bTOWN OF\b/g, '')
    .replace(/\bVILLAGE OF\b/g, '')
    .replace(/\bBOROUGH OF\b/g, '')
    .replace(/\bCOUNTY\b/g, '')
    .replace(/\bPARISH\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&sect;/gi, '§')
    .replace(/\s+/g, ' ')
    .trim();
}

export function completenessScore(record) {
  if (!record) return 0;
  return CRITICAL_FIELDS.filter((f) => record[f] !== null && record[f] !== undefined && record[f] !== '').length;
}

export function asText(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Run async work with a hard concurrency cap so a 50-item batch can't stampede. */
export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { ok: false, error: String(error?.message || error).slice(0, 300) };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Programmatic quote verification — the real guard against a confident model
 * inventing an ordinance sentence. The quote must actually be present in the
 * text we scraped, allowing only for whitespace/quote-mark drift and minor
 * elision in the middle of a long passage.
 */
export function quoteAppears(quote, sourceText) {
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[‘’“”]/g, '"')
      .replace(/[ \s]+/g, ' ')
      .trim();
  const q = norm(quote);
  const t = norm(sourceText);
  if (!q || !t || q.length < 15) return false;
  if (t.includes(q)) return true;
  // Tolerate an elided middle: a distinctive 45-character run must still match.
  const probe = 45;
  if (q.length <= probe) return false;
  for (let i = 0; i + probe <= q.length; i += 12) {
    if (t.includes(q.slice(i, i + probe))) return true;
  }
  return false;
}

/**
 * Land development codes routinely run past any model's context window, and the
 * tower article is rarely in the first 140k characters. Rather than truncating
 * blindly, keep the windows where the wireless-tower language actually lives.
 * Quote verification still runs against the FULL text, so windowing can only
 * cost us a field, never fabricate one.
 */
export function focusOrdinanceText(text, limit = 45000) {
  const source = String(text || '');
  if (source.length <= limit) return source;

  const marker = /(wireless|telecommunicat|communication tower|antenna|monopole|fall zone|tower height|collocat|co-locat)/gi;
  const hits = [];
  let match;
  while ((match = marker.exec(source)) !== null) hits.push(match.index);
  if (!hits.length) return source.slice(0, limit);

  const WINDOW = 15000;
  const density = new Map();
  for (const index of hits) {
    const bucket = Math.floor(index / WINDOW);
    density.set(bucket, (density.get(bucket) || 0) + 1);
  }

  const chosen = [];
  let budget = limit;
  for (const [bucket] of [...density.entries()].sort((a, b) => b[1] - a[1])) {
    if (budget < WINDOW) break;
    chosen.push(bucket);
    budget -= WINDOW;
  }
  chosen.sort((a, b) => a - b);
  return chosen.map((bucket) => source.slice(bucket * WINDOW, (bucket + 1) * WINDOW)).join('\n[…]\n');
}

/* ------------------------------------------------------------------ *
 * Tier 1 — direct fetch
 * ------------------------------------------------------------------ */

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/pdf,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const BLOCK_MARKERS =
  /(just a moment|checking your browser|cloudflare|access denied|request unsuccessful|are you a robot|captcha|enable javascript to|please enable js)/i;

// Base44 workers have a finite memory ceiling. Stream remote bodies into a
// bounded buffer so one unusually large code book cannot kill the whole run.
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_DIRECT_HTML_BYTES = 4 * 1024 * 1024;
const MAX_RENDERED_TEXT_CHARS = 1_500_000;

async function readBodyBytesCapped(res, maxBytes) {
  const declared = Number(res.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    return { ok: false, reason: `source_too_large:${declared}` };
  }

  if (!res.body) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.byteLength <= maxBytes
      ? { ok: true, bytes }
      : { ok: false, reason: `source_too_large:${bytes.byteLength}` };
  }

  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, reason: `source_too_large:${total}` };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

/**
 * Signals that we got an app shell instead of the ordinance text.
 * The markup-ratio test only fires on genuinely short output — a long, legitimate
 * ordinance page buried in heavy markup must NOT be pushed to paid scraping.
 */
function looksJsOnly(text, rawHtml) {
  if (text.length < 900) return true;
  if (BLOCK_MARKERS.test(text.slice(0, 4000))) return true;
  if (text.length < 6000 && rawHtml && rawHtml.length > 20000 && text.length < rawHtml.length * 0.02) return true;
  return false;
}

/** How much this text actually looks like a wireless-tower ordinance. */
export function towerSignal(text) {
  const t = String(text || '').toLowerCase();
  const terms = [
    'fall zone',
    'setback',
    'telecommunication',
    'wireless',
    'antenna',
    'tower height',
    'collocation',
    'co-location',
    'separation',
    'monopole',
    'communication tower',
    'support structure',
  ];
  return terms.reduce((score, term) => score + (t.includes(term) ? 1 : 0), 0);
}

/** A page is worth extracting from only if it is both on-topic AND substantial. */
export function isUsableSource(source) {
  if (!source?.ok) return false;
  if (source.file_url) return true;
  return towerSignal(source.text) >= 4 && (source.text?.length || 0) >= 3000;
}

async function directFetch(base44, url) {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(25000) });
    const contentType = (res.headers.get('content-type') || '').toLowerCase();

    if (!res.ok) {
      return { ok: false, reason: `http_${res.status}` };
    }

    // PDF codes: hand the file to the model directly rather than mangling bytes.
    if (contentType.includes('pdf') || /\.pdf($|\?)/i.test(url)) {
      const body = await readBodyBytesCapped(res, MAX_PDF_BYTES);
      if (!body.ok) return { ok: false, reason: body.reason };
      const bytes = body.bytes;
      if (bytes.byteLength < 1000) return { ok: false, reason: 'empty_pdf' };
      const file = new File([bytes], 'ordinance.pdf', { type: 'application/pdf' });
      const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });
      if (!uploaded?.file_url) return { ok: false, reason: 'pdf_upload_failed' };
      return { ok: true, method: 'direct_pdf', file_url: uploaded.file_url, text: '', chars: bytes.byteLength };
    }

    const body = await readBodyBytesCapped(res, MAX_DIRECT_HTML_BYTES);
    if (!body.ok) return { ok: false, reason: body.reason };
    const rawHtml = new TextDecoder().decode(body.bytes);
    const text = cleanHtml(rawHtml);
    if (looksJsOnly(text, rawHtml)) {
      return { ok: false, reason: text.length < 900 ? 'empty_or_js_only' : 'blocked_or_js_only' };
    }
    return { ok: true, method: 'direct_html', text, chars: text.length };
  } catch (error) {
    return { ok: false, reason: `fetch_error:${String(error?.message || error).slice(0, 80)}` };
  }
}

/* ------------------------------------------------------------------ *
 * Paid escalation — Scrapfly first, then OxyLabs as the final fallback.
 *
 * Scrapfly is deliberately tiered. A cached datacenter request is cheapest;
 * browser rendering is added only when the plain response is not usable; ASP
 * is the last Scrapfly step and carries its own per-request cost budget.
 * ------------------------------------------------------------------ */

async function oxylabsFetch(url, creds) {
  const username = creds?.oxylabs_username;
  const password = creds?.oxylabs_password;
  if (!username || !password) return { ok: false, reason: 'oxylabs_not_configured' };
  try {
    const res = await fetch('https://realtime.oxylabs.io/v1/queries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${btoa(`${username}:${password}`)}` },
      body: JSON.stringify({
        source: 'universal',
        url,
        render: 'html',
        geo_location: 'United States',
        user_agent_type: 'desktop',
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) return { ok: false, reason: `oxylabs_http_${res.status}` };
    const data = await res.json();
    const text = cleanHtml(data?.results?.[0]?.content || '');
    if (text.length < 500) return { ok: false, reason: 'oxylabs_empty' };
    return { ok: true, method: 'oxylabs', text, chars: text.length };
  } catch (error) {
    return { ok: false, reason: `oxylabs_error:${String(error?.message || error).slice(0, 80)}` };
  }
}

function asFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scrapflyResponseCost(res, data) {
  const fromHeader = asFiniteNumber(res.headers.get('X-Scrapfly-Api-Cost'));
  if (fromHeader !== null) return fromHeader;

  const cost = data?.context?.cost;
  const direct = asFiniteNumber(cost);
  if (direct !== null) return direct;
  if (cost && typeof cost === 'object') {
    for (const key of ['total', 'total_cost', 'credits', 'api_credits']) {
      const candidate = asFiniteNumber(cost[key]);
      if (candidate !== null) return candidate;
    }
  }
  return 0;
}

async function scrapflyFetch(url, creds, counters = {}) {
  const key = creds?.scrapfly_key;
  if (!key) return { ok: false, reason: 'scrapfly_not_configured', tier_attempts: [] };

  const callLimit = asFiniteNumber(creds?.scrapfly_call_limit);
  const aspBudget = Math.max(25, Math.min(asFiniteNumber(creds?.scrapfly_asp_cost_budget) || 50, 100));
  const tiers = [
    { name: 'plain_cached', params: {} },
    { name: 'browser_cached', params: { render_js: 'true', rendering_stage: 'domcontentloaded' } },
    { name: 'asp_cached', params: { render_js: 'true', asp: 'true', cost_budget: String(aspBudget) } },
  ];
  const tierAttempts = [];
  let lastReason = 'scrapfly_empty';

  for (const tier of tiers) {
    if (callLimit !== null && (counters.scrapfly_calls || 0) >= callLimit) {
      counters.scrapfly_budget_exhausted = (counters.scrapfly_budget_exhausted || 0) + 1;
      return { ok: false, reason: 'scrapfly_run_call_limit_reached', tier_attempts: tierAttempts };
    }

    counters.scrapfly_calls = (counters.scrapfly_calls || 0) + 1;
    try {
      const params = new URLSearchParams({
        key,
        url,
        country: 'US',
        format: 'markdown:no_links,no_images,only_content',
        cache: 'true',
        cache_ttl: '604800',
        retry: 'false',
        ...tier.params,
      });
      const res = await fetch(`https://api.scrapfly.io/scrape?${params}`, {
        signal: AbortSignal.timeout(120000),
      });
      const data = await res.json().catch(() => ({}));
      const cost = scrapflyResponseCost(res, data);
      counters.scrapfly_credits = (counters.scrapfly_credits || 0) + cost;

      const remaining = asFiniteNumber(res.headers.get('X-Scrapfly-Remaining-Api-Credit'));
      if (remaining !== null) counters.scrapfly_remaining_credits = remaining;

      const cacheState = String(data?.context?.cache?.state || '').toUpperCase();
      if (cacheState === 'HIT') {
        counters.scrapfly_cache_hits = (counters.scrapfly_cache_hits || 0) + 1;
      }

      if (!res.ok) {
        lastReason = `scrapfly_http_${res.status}`;
        tierAttempts.push({ tier: tier.name, ok: false, reason: lastReason, cost, cache_state: cacheState || null });
        continue;
      }

      let rawContent = data?.result?.content || '';
      if (String(data?.result?.format || '').toLowerCase() === 'clob' && /^https?:\/\//i.test(String(rawContent))) {
        const clob = await fetch(String(rawContent), { signal: AbortSignal.timeout(30000) });
        if (clob.ok) {
          const clobBody = await readBodyBytesCapped(clob, MAX_RENDERED_TEXT_CHARS * 2);
          rawContent = clobBody.ok ? new TextDecoder().decode(clobBody.bytes) : '';
        }
      }

      rawContent = String(rawContent).slice(0, MAX_RENDERED_TEXT_CHARS);
      const text = cleanHtml(rawContent);
      const usable = !BLOCK_MARKERS.test(text.slice(0, 4000)) && isUsableSource({ ok: true, text });
      lastReason = text.length < 500 ? 'scrapfly_empty' : 'scrapfly_low_signal';
      tierAttempts.push({
        tier: tier.name,
        ok: usable,
        reason: usable ? null : lastReason,
        chars: text.length,
        signal: towerSignal(text),
        cost,
        cache_state: cacheState || null,
      });

      if (usable) {
        return {
          ok: true,
          method: 'scrapfly',
          scrapfly_tier: tier.name,
          text,
          chars: text.length,
          tier_attempts: tierAttempts,
        };
      }
    } catch (error) {
      lastReason = `scrapfly_error:${String(error?.message || error).slice(0, 80)}`;
      tierAttempts.push({ tier: tier.name, ok: false, reason: lastReason });
    }
  }

  return { ok: false, reason: lastReason || 'scrapfly_failed', tier_attempts: tierAttempts };
}

/**
 * Fetch one ordinance URL, escalating only as far as necessary.
 * Returns { ok, method, text | file_url, chars, attempts, reason }.
 */
export async function fetchOrdinanceSource(base44, url, counters = {}, creds = {}, allowPaid = true) {
  const attempts = [];

  counters.direct_fetch_calls = (counters.direct_fetch_calls || 0) + 1;
  const direct = await directFetch(base44, url);
  attempts.push({ tier: 'direct', ok: direct.ok, reason: direct.reason || null });
  if (direct.ok && (!allowPaid || isUsableSource(direct))) return { ...direct, url, attempts };

  if (!allowPaid) return { ok: false, url, attempts, reason: direct.reason || 'direct_failed' };

  const scrapfly = await scrapflyFetch(url, creds, counters);
  attempts.push({
    tier: 'scrapfly',
    ok: scrapfly.ok,
    reason: scrapfly.reason || null,
    modes: scrapfly.tier_attempts || [],
  });
  if (scrapfly.ok) return { ...scrapfly, url, attempts };

  let oxy = { ok: false, reason: 'oxylabs_not_configured' };
  if (creds?.oxylabs_username && creds?.oxylabs_password) {
    counters.oxylabs_calls = (counters.oxylabs_calls || 0) + 1;
    oxy = await oxylabsFetch(url, creds);
  }
  attempts.push({ tier: 'oxylabs', ok: oxy.ok, reason: oxy.reason || null });
  if (oxy.ok) return { ...oxy, url, attempts };

  return { ok: false, url, attempts, reason: scrapfly.reason || direct.reason || oxy.reason || 'all_tiers_failed' };
}

/* ------------------------------------------------------------------ *
 * Tier 0 — the SiteHawk scrape cache (municode_ordinances in Supabase)
 *
 * The n8n "SiteHawk Zoning Scrapfly Intake" pipeline lands the FULL,
 * untruncated ordinance text (markdown, nav links stripped) in Supabase.
 * Reading it here means a jurisdiction that has already been scraped enriches
 * with zero network fetches and zero paid-scraper spend. The length gate
 * (>= 5,000 chars) keeps the pre-fix truncated rows (~2k, March 2026) and
 * failed "Loading, please wait" scrapes from ever being used as a source, and
 * the caller still applies isUsableSource() so off-topic text falls through
 * to the normal fetch chain.
 * ------------------------------------------------------------------ */

export async function fetchCachedOrdinanceText(jurisdiction, state, creds) {
  const base = String(creds?.supabase_url || '').replace(/^['"\\\s]+/, '').replace(/\/+$/, '');
  const key = creds?.supabase_key;
  if (!base || !key) return { ok: false, reason: 'cache_not_configured' };

  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const stateCode = String(state || '').toUpperCase();
  const select = 'jurisdiction,full_text,municode_url,fetched_at';
  const wantsCounty = countyWordPattern(stateCode).test(String(jurisdiction || ''));

  // Exact name first; then a normalized fuzzy pass so "City of Rockledge"
  // still finds rows stored as "Rockledge".
  const queries = [
    `jurisdiction=eq.${encodeURIComponent(jurisdiction)}`,
    `jurisdiction=ilike.${encodeURIComponent('%' + normalizeJurisdiction(jurisdiction) + '%')}`,
  ];

  for (const q of queries) {
    try {
      const res = await fetch(
        `${base}/rest/v1/municode_ordinances?select=${select}&${q}&state=eq.${encodeURIComponent(stateCode)}&order=fetched_at.desc&limit=8`,
        { headers, signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) continue;
      const rows = (await res.json()) || [];
      const best = rows
        // County-ness must agree, so "Alachua" (the city) never borrows
        // "Alachua County" text — the same guard the registry matcher uses.
        .filter((r) => countyWordPattern(stateCode).test(String(r.jurisdiction || '')) === wantsCounty)
        .filter((r) => (r.full_text || '').length >= 5000)
        .sort((a, b) => (b.full_text || '').length - (a.full_text || '').length)[0];
      if (best) {
        return {
          ok: true,
          method: 'supabase_cache',
          text: focusOrdinanceText(best.full_text, 180000),
          chars: best.full_text.length,
          url: best.municode_url || '',
          cached_at: best.fetched_at || null,
        };
      }
    } catch {
      /* the cache is an optimization — any failure falls through to live fetching */
    }
  }
  return { ok: false, reason: 'cache_miss' };
}

/* ------------------------------------------------------------------ *
 * Tier 0.5 — the platform census (national_jurisdictions / scrape_queue)
 *
 * platformCensus stamps each jurisdiction with the codifier that publishes
 * its code (municode / amlegal / unlisted) plus a direct URL — and for
 * Municode, the ClientID. Reading it here means a censused jurisdiction
 * skips LLM source discovery entirely: Municode clients are read through
 * the free public API, AmLegal clients get their known URL tried directly.
 * The census is a hint, never a verdict — any miss falls through to the
 * normal discovery fan-out unchanged.
 * ------------------------------------------------------------------ */

export async function fetchCensusHint(jurisdiction, state, creds) {
  const base = String(creds?.supabase_url || '').replace(/^['"\\\s]+/, '').replace(/\/+$/, '');
  const key = creds?.supabase_key;
  if (!base || !key) return null;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const stateCode = String(state || '').toUpperCase();
  const wantsCounty = countyWordPattern(stateCode).test(String(jurisdiction || ''));
  const norm = normalizeJurisdiction(jurisdiction);
  if (!norm) return null;

  try {
    if (wantsCounty) {
      const res = await fetch(
        `${base}/rest/v1/national_jurisdictions?select=scrape_platform,municode_url,ordinance_url,municode_client_id,county_name` +
          `&state_abbr=eq.${stateCode}&county_name=ilike.${encodeURIComponent('%' + norm + '%')}&limit=5`,
        { headers, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) return null;
      const rows = (await res.json()) || [];
      const hit = rows.find((r) => normalizeJurisdiction(r.county_name) === norm) || null;
      if (!hit || !hit.scrape_platform || hit.scrape_platform === 'unlisted') return null;
      return {
        platform: hit.scrape_platform,
        url: hit.municode_url || hit.ordinance_url || null,
        client_id: hit.municode_client_id || null,
      };
    }
    const res = await fetch(
      `${base}/rest/v1/scrape_queue?select=scrape_platform,ordinance_url,municode_client_id,jurisdiction` +
        `&state=eq.${stateCode}&jurisdiction=ilike.${encodeURIComponent('%' + norm + '%')}&limit=5`,
      { headers, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) || [];
    const hit = rows.find(
      (r) => normalizeJurisdiction(r.jurisdiction) === norm && !countyWordPattern(stateCode).test(String(r.jurisdiction || ''))
    ) || null;
    if (!hit || !hit.scrape_platform || hit.scrape_platform === 'unlisted') return null;
    return {
      platform: hit.scrape_platform,
      url: hit.ordinance_url || null,
      client_id: hit.municode_client_id || null,
    };
  } catch {
    return null; // the census is an optimization — never let it break a hunt
  }
}

/* ------------------------------------------------------------------ *
 * Municode public API reader — telecom sections by ClientID
 *
 * When the census knows the Municode ClientID, the telecom sections can be
 * read straight from api.municode.com: no rendering, no proxy, no LLM. This
 * is the same strategy municodeTelecomFetch uses interactively, condensed
 * for the hunt path. Returns a source-shaped object so isUsableSource and
 * the extraction pipeline treat it exactly like any fetched page.
 * ------------------------------------------------------------------ */

const MUNICODE_API_BASE = 'https://api.municode.com';
const MUNICODE_SEARCH_TERMS = ['telecommunications tower', 'wireless facility', 'communication tower', 'antenna'];

async function municodeApiGet(path, params) {
  const url = new URL(`${MUNICODE_API_BASE}${path}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`municode ${path} -> ${r.status}`);
  return r.json();
}

function municodeHtmlToText(h) {
  let t = String(h || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:p|div)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  for (const [e, c] of [['&nbsp;', ' '], ['&amp;', '&'], ['&lt;', '<'], ['&gt;', '>'], ['&#8217;', "'"], ['&#8220;', '"'], ['&#8221;', '"']]) {
    t = t.split(e).join(c);
  }
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

export async function fetchMunicodeTelecomByClientId(clientId, sourceUrl) {
  try {
    const prods = await municodeApiGet(`/Products/clientId/${clientId}`);
    const products = [];
    for (const p of prods ?? []) {
      try {
        const job = await municodeApiGet(`/Jobs/latest/${p.ProductID}`);
        products.push({ pid: p.ProductID, jid: job.Id });
      } catch { /* product with no published job */ }
    }
    if (!products.length) return { ok: false, reason: 'municode_no_products' };

    const parts = [];
    const seen = new Set();
    for (const { pid, jid } of products) {
      if (parts.length >= 8) break;
      for (const term of MUNICODE_SEARCH_TERMS) {
        if (parts.length >= 8) break;
        let hits = [];
        try {
          const data = await municodeApiGet('/search', {
            searchText: term, clientId, contentTypeId: 'CODES', searchMode: 'CLIENTMODE',
          });
          hits = data?.Hits ?? [];
        } catch { continue; }
        for (const hit of hits) {
          if (parts.length >= 8) break;
          const nid = hit.NodeId;
          if (!nid || seen.has(nid)) continue;
          seen.add(nid);
          try {
            const data = await municodeApiGet('/CodesContent', { productId: pid, jobId: jid, nodeId: nid });
            const text = (data?.Docs ?? [])
              .filter((d) => d.Content)
              .map((d) => (d.Title ? `=== ${d.Title} ===\n${municodeHtmlToText(d.Content)}` : municodeHtmlToText(d.Content)))
              .join('\n\n');
            if (text.length > 200) parts.push(text.slice(0, 40000));
          } catch { /* single node failed — keep going */ }
        }
      }
    }

    const text = parts.join('\n\n\n');
    if (text.length < 500) return { ok: false, reason: 'municode_no_telecom_sections' };
    return { ok: true, method: 'municode_api', text, chars: text.length, url: sourceUrl || '' };
  } catch (e) {
    return { ok: false, reason: `municode_api_error: ${e?.message || e}` };
  }
}

/* ------------------------------------------------------------------ *
 * Source discovery — the parallel research fan-out
 * ------------------------------------------------------------------ */

const SOURCE_SCHEMA = {
  type: 'object',
  properties: {
    governing_body: {
      type: 'string',
      description: 'The body that actually adopts land-use regulation here — the municipality if the place is incorporated, otherwise the county-equivalent.',
    },
    place_incorporated: {
      type: 'boolean',
      description: 'True if the named place is an incorporated municipality. False for a census-designated place, unincorporated community, or other unincorporated area.',
    },
    code_type: {
      type: 'string',
      enum: ['udo', 'land_development_code', 'zoning_ordinance', 'municipal_code', 'none'],
      description: 'What instrument carries the tower rules. Unincorporated county land is usually governed by a UDO or a Land Development Code rather than a municipal code.',
    },
    no_local_code: {
      type: 'boolean',
      description: 'True ONLY when the governing body has adopted no zoning or land-development regulation at all — an unzoned county, or land with no local government. This is a real and correct answer in parts of the country.',
    },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          publisher: { type: 'string' },
          section_hint: { type: 'string' },
          why: { type: 'string' },
        },
      },
    },
  },
};

/**
 * Ask for the official telecom-section URLs for a jurisdiction. Returns up to
 * `limit` candidate URLs; the caller fetches them in parallel and keeps the one
 * whose text actually reads like a tower ordinance.
 */
export async function discoverSourceCandidates(base44, jurisdiction, state, limit = 4) {
  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    model: 'gemini_3_flash',
    add_context_from_internet: true,
    prompt: `Find the OFFICIAL published code that contains the wireless telecommunications TOWER AND ANTENNA regulations governing ${jurisdiction}, ${state}.

FIRST, establish who actually regulates land use at this location:
- If ${jurisdiction} is an INCORPORATED municipality, its own code governs.
- If it is an unincorporated community or a census-designated place, it has no code of its own and the COUNTY-EQUIVALENT governs. In that case find the county's rules, which are usually in a UNIFIED DEVELOPMENT ORDINANCE (UDO), a Land Development Code (LDC), or Land Development Regulations (LDR) rather than a "municipal code".
- Set place_incorporated and governing_body accordingly, and set code_type to whichever instrument you actually found.

Search library.municode.com, ecode360.com, library.amlegal.com, codelibrary.amlegal.com, municipal.codes, and the governing body's own .gov site. Search for the UDO / land development code / land development regulations by name as well as for "zoning ordinance".

Return up to ${limit} candidate URLs, best first. Rules:
- Prefer the DEEP LINK to the wireless/telecommunications/tower article or section, not the code's table of contents or home page.
- A direct PDF of the UDO or land development code chapter is acceptable and often better.
- Only return URLs you actually saw in search results. Never invent a URL pattern.
- section_hint: the article/section identifier you expect to find there (e.g. "Sec. 62-2109" or "Article XII, Div. 3").
- publisher: municode | ecode360 | amlegal | official_gov | other.
- If the governing body has adopted NO zoning or land-development regulation at all (an unzoned county, or land with no local government such as Alaska's Unorganized Borough), set no_local_code true, set code_type to "none", and return an empty candidates array. That is a correct, useful answer — do not substitute a neighbouring jurisdiction's code or a state statute to avoid returning nothing.
- If a code exists but you simply cannot locate it, leave no_local_code false and return an empty candidates array.`,
    response_json_schema: SOURCE_SCHEMA,
  });

  const seen = new Set();
  const candidates = (result?.candidates || [])
    .map((c) => ({ ...c, url: String(c?.url || '').trim() }))
    .filter((c) => {
      if (!/^https?:\/\//i.test(c.url) || seen.has(c.url)) return false;
      seen.add(c.url);
      return true;
    })
    .slice(0, limit);

  return {
    candidates,
    governance: {
      governing_body: result?.governing_body || null,
      place_incorporated: typeof result?.place_incorporated === 'boolean' ? result.place_incorporated : null,
      code_type: result?.code_type || null,
      no_local_code: result?.no_local_code === true,
    },
  };
}

/**
 * Try every candidate DIRECTLY and in parallel first — that is the cheap path,
 * and for most jurisdictions it is the only path needed. Paid scraping is only
 * reached if every direct attempt failed, and even then only ONE candidate is
 * escalated rather than all of them. This is what stops a 25-jurisdiction night
 * from turning into an uncontrolled paid-scraping bill.
 */
export async function resolveBestSource(base44, candidates, counters = {}, creds = {}) {
  if (!candidates?.length) return { ok: false, reason: 'no_candidates', tried: [] };

  const describe = (f) => ({
    url: f.url,
    ok: f.ok,
    method: f.method || null,
    signal: f.signal ?? 0,
    chars: f.chars || 0,
    reason: f.reason || null,
  });

  // Phase 1 — free, parallel, no paid scraping.
  const directPass = await Promise.all(
    candidates.map(async (candidate) => {
      const source = await fetchOrdinanceSource(base44, candidate.url, counters, creds, false);
      return { ...source, candidate, signal: source.ok ? (source.file_url ? 8 : towerSignal(source.text)) : 0 };
    })
  );

  const tried = directPass.map(describe);
  const usable = directPass.filter(isUsableSource).sort((a, b) => b.signal - a.signal);
  if (usable.length) {
    return { ...usable[0], tried, alternates: usable.slice(1, 3).map((f) => f.url) };
  }

  // Phase 2 — escalate exactly one candidate: the best-ranked URL that was
  // blocked or JS-only, since those are the ones a renderer can actually fix.
  const blocked = directPass.find((f) => /js_only|http_40|http_429|http_503|fetch_error/.test(f.reason || ''));
  const escalate = blocked || directPass[0];
  if (!escalate) return { ok: false, reason: 'no_usable_source', tried };

  const rendered = await fetchOrdinanceSource(base44, escalate.url, counters, creds, true);
  const withSignal = { ...rendered, candidate: escalate.candidate, signal: rendered.ok ? (rendered.file_url ? 8 : towerSignal(rendered.text)) : 0 };
  tried.push(describe(withSignal));

  if (!isUsableSource(withSignal)) return { ok: false, reason: 'no_usable_source', tried };
  return { ...withSignal, tried, alternates: [] };
}

/* ------------------------------------------------------------------ *
 * Extraction — text in, cited fields out
 * ------------------------------------------------------------------ */

const citedField = (valueType, description) => ({
  type: 'object',
  description,
  properties: {
    value: { type: valueType },
    quote: {
      type: 'string',
      description:
        'The VERBATIM sentence or clause from the ordinance text that states this value. Copy it character-for-character from the source. Leave empty if you cannot copy an exact supporting sentence.',
    },
    section_ref: { type: 'string', description: 'The exact section identifier the quote came from, as printed in the code.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
});

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    jurisdiction_confirmed: {
      type: 'boolean',
      description: 'True only if the text is clearly the code of THIS jurisdiction (not a neighbouring city, a county code for a city, or a state statute).',
    },
    height_limit_ft: citedField('number', 'Maximum permitted height of a freestanding tower, in feet.'),
    setback_ft: citedField('number', 'Minimum setback of the tower from a property line, in feet, when stated as a fixed distance.'),
    fall_zone_ft: citedField('number', 'Required fall zone / collapse radius in feet, when stated as a fixed distance.'),
    fall_zone_pct_of_height: citedField('number', 'Fall zone expressed as a percentage of tower height (e.g. 100 for "100% of tower height").'),
    residential_separation_ft: citedField('number', 'Required separation from residential structures or residentially zoned land, in feet.'),
    tower_separation_ft: citedField('number', 'Required separation from other existing towers, in feet.'),
    pe_fall_zone_allowed: citedField(
      'boolean',
      'TRUE only if the code lets a licensed Professional Engineer\'s sealed letter/certification REDUCE the fall zone, setback, or separation. FALSE only if the code sets a fixed requirement with no engineer-reduction path.'
    ),
    pe_letter_required: citedField('boolean', 'TRUE if a sealed PE letter or certification is mandatory as part of the application.'),
    stealth_required: citedField('boolean', 'TRUE if stealth/concealment/camouflage design is required.'),
    collocation_required: citedField('boolean', 'TRUE if collocation on existing structures must be pursued or proven infeasible before a new tower.'),
    permit_type: citedField('string', 'The approval path — conditional use permit, special exception, special use permit, administrative review, by right, etc.'),
    setback_rule: citedField('string', 'The setback/fall-zone rule verbatim when it is a formula rather than a fixed number (e.g. "1.5x tower height from all property lines").'),
    section_ref: { type: 'string', description: 'The primary telecom article/section identifier for this jurisdiction.' },
    extraction_notes: { type: 'string', description: 'One or two sentences: what the code covers, and which of the six critical values it simply does not address.' },
  },
};

/**
 * Extract cited ordinance fields from text we ALREADY HAVE. No re-research, no
 * second scrape — this is the handoff the old pipeline was missing.
 */
export async function extractOrdinanceFields(base44, { jurisdiction, state, url, text, file_url }) {
  const rules = `You are reading the published municipal code for ${jurisdiction}, ${state}. Source URL: ${url}

Extract ONLY the wireless telecommunications TOWER AND ANTENNA rules that this text explicitly states.

ABSOLUTE RULES:
- Every field you fill MUST come with a verbatim quote copied exactly from the text. If you cannot copy an exact supporting sentence, OMIT the field entirely.
- Never convert, average, round, infer, or combine numbers. If the code says 1.5 times the tower height, that belongs in setback_rule, not setback_ft.
- Never carry a value over from a different jurisdiction, a state statute, or your own prior knowledge.
- Distinguish carefully: setback (distance to property line), fall zone (collapse radius), residential separation (distance to homes or residential zoning), tower separation (distance to other towers). Do not use one to fill another.
- pe_fall_zone_allowed is about RELIEF: can a PE's sealed letter shrink the required fall zone or setback? Only mark TRUE when the code says so.
- Set jurisdiction_confirmed FALSE if this text is actually some other jurisdiction's code or a state statute.
- Omit any field the code does not address. An omitted field is a correct answer; a guessed field is a defect.`;

  if (file_url) {
    return await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'gemini_3_flash',
      response_json_schema: EXTRACTION_SCHEMA,
      prompt: `${rules}\n\nThe ordinance is the attached PDF. Read it and extract the fields.`,
      file_urls: [file_url],
    });
  }

  return await base44.asServiceRole.integrations.Core.InvokeLLM({
    model: 'gemini_3_flash',
    response_json_schema: EXTRACTION_SCHEMA,
    prompt: `${rules}\n\nORDINANCE TEXT:\n${focusOrdinanceText(text)}`,
  });
}

/* ------------------------------------------------------------------ *
 * Quality control — an independent second pass
 * ------------------------------------------------------------------ */

const QC_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          verdict: { type: 'string', enum: ['confirmed', 'rejected', 'uncertain'] },
          reason: { type: 'string' },
        },
      },
    },
    overall_note: { type: 'string' },
  },
};

/**
 * Re-read the same source against the draft and try to knock values down.
 * Deliberately adversarial: the default answer is 'rejected'.
 */
export async function qualityControlPass(base44, { jurisdiction, state, url, text, file_url, draft }) {
  const claims = EXTRACTED_FIELDS.filter((f) => draft?.[f]?.value !== undefined && draft?.[f]?.value !== null).map((f) => ({
    field: f,
    label: FIELD_LABELS[f],
    value: draft[f].value,
    quote: draft[f].quote || '',
    section_ref: draft[f].section_ref || '',
  }));

  if (!claims.length) return { verdicts: [], overall_note: 'Nothing extracted to verify.' };

  const rules = `You are the quality-control check on an ordinance extraction for ${jurisdiction}, ${state} (${url}).

For each claim below, decide whether the SOURCE genuinely supports it.

Mark 'confirmed' ONLY when all of these hold:
- The quote appears in the source essentially word-for-word.
- The quote actually states that value for that specific rule (not a neighbouring rule, not a different facility type, not a different jurisdiction).
- The section_ref matches where the quote lives.
- The value was not converted, rounded, or inferred from the quote.

Mark 'rejected' when the quote is absent, paraphrased, about a different rule, or does not state the number/answer claimed.
Mark 'uncertain' only when the source is genuinely ambiguous.
Default to 'rejected' when you are unsure. A wrong value in the registry is far worse than an empty field.

CLAIMS:
${JSON.stringify(claims, null, 1)}`;

  if (file_url) {
    return await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'gemini_3_flash',
      response_json_schema: QC_SCHEMA,
      prompt: `${rules}\n\nThe source is the attached PDF.`,
      file_urls: [file_url],
    });
  }

  return await base44.asServiceRole.integrations.Core.InvokeLLM({
    model: 'gemini_3_flash',
    response_json_schema: QC_SCHEMA,
    prompt: `${rules}\n\nSOURCE TEXT:\n${focusOrdinanceText(text)}`,
  });
}

/* ------------------------------------------------------------------ *
 * The strict gate — write, or queue for a human
 * ------------------------------------------------------------------ */

function coerce(field, raw) {
  if (NUMERIC_FIELDS.includes(field)) return num(raw);
  if (BOOLEAN_FIELDS.includes(field)) return typeof raw === 'boolean' ? raw : null;
  const s = raw === null || raw === undefined ? '' : String(raw).trim();
  return s || null;
}

const isPopulated = (v) => v !== null && v !== undefined && v !== '';

/**
 * Decide, field by field, what may be written and what a human has to look at.
 *
 * A field is auto-written only when it has a value, a verbatim quote that is
 * actually present in the source, a section reference, a confirmed QC verdict,
 * confidence above 'low', and no disagreement with what the registry already
 * holds. Everything else becomes a review-queue item; nothing is overwritten.
 */
export function gateExtraction({ jurisdiction, state, existing, draft, qc, source, runId }) {
  const patch = {};
  const citations = { ...(existing?.field_citations || {}) };
  const queue = [];
  const verifiedAt = new Date().toISOString();
  const verdictOf = Object.fromEntries((qc?.verdicts || []).map((v) => [v.field, v]));
  const haveText = Boolean(source?.text);
  // An explicit false means the scraped page belongs to some other jurisdiction.
  const wrongJurisdiction = draft?.jurisdiction_confirmed === false;

  for (const field of EXTRACTED_FIELDS) {
    const claim = draft?.[field];
    if (!claim) continue;
    const value = coerce(field, claim.value);
    if (value === null) continue;

    const quote = String(claim.quote || '').trim();
    const sectionRef = String(claim.section_ref || draft?.section_ref || '').trim();
    const rawConfidence = String(claim.confidence || 'low').toLowerCase();
    const confidence = ['high', 'medium', 'low'].includes(rawConfidence) ? rawConfidence : 'low';
    const verdict = verdictOf[field] || { verdict: 'uncertain', reason: 'No QC verdict returned for this field.' };
    const currentValue = existing?.[field] ?? null;

    const item = {
      jurisdiction: existing?.jurisdiction || jurisdiction || '',
      state: String(existing?.state || state || '').toUpperCase(),
      ordinance_id: existing?.id || undefined,
      field_name: field,
      proposed_value: asText(value),
      current_value: asText(currentValue),
      quote: quote.slice(0, 1500),
      section_ref: sectionRef,
      source_url: source?.url || '',
      confidence,
      qc_verdict: `${verdict.verdict}: ${String(verdict.reason || '').slice(0, 400)}`,
      status: 'pending',
      run_id: runId || undefined,
    };

    // Ordered so the queue reason names the FIRST thing that actually blocked it.
    let blocked = null;
    if (wrongJurisdiction) blocked = 'ambiguous_source';
    else if (!quote) blocked = 'no_quote';
    else if (haveText && !quoteAppears(quote, source.text)) blocked = 'no_quote';
    else if (!sectionRef) blocked = 'no_section_ref';
    else if (verdict.verdict !== 'confirmed') blocked = 'qc_failed';
    else if (confidence === 'low') blocked = 'low_confidence';
    // PDF sources can't be quote-checked locally, so they must clear a higher bar.
    else if (!haveText && confidence !== 'high') blocked = 'low_confidence';
    else if (isPopulated(currentValue) && String(currentValue) !== String(value)) blocked = 'conflict_with_existing';

    if (blocked) {
      queue.push({ ...item, reason: blocked });
      continue;
    }

    const citation = {
      value,
      quote: quote.slice(0, 1500),
      section_ref: sectionRef,
      source_url: source?.url || '',
      confidence,
      verified_date: verifiedAt,
      method: source?.method || null,
      qc_verdict: verdict.verdict,
    };

    // Same value, freshly re-verified — refresh the citation, skip the write.
    if (isPopulated(currentValue) && String(currentValue) === String(value)) {
      citations[field] = citation;
      continue;
    }

    patch[field] = value;
    citations[field] = citation;
  }

  return { patch, citations, queue, verifiedAt, wrongJurisdiction };
}

/**
 * Roll the gated result up into the registry-level status fields.
 */
export function buildRecordPatch({ existing, patch, citations, queue, source, runId, notes }) {
  const merged = { ...(existing || {}), ...patch };
  const score = completenessScore(merged);
  const citedCritical = CRITICAL_FIELDS.filter((f) => isPopulated(merged[f]) && citations?.[f]?.quote).length;

  let status = 'unverified';
  if (queue.length) status = queue.some((q) => q.reason === 'conflict_with_existing') ? 'conflict' : 'needs_review';
  else if (score > 0 && citedCritical === score) status = score >= CRITICAL_FIELDS.length ? 'verified' : 'partial';
  else if (score > 0) status = 'partial';

  return {
    ...patch,
    field_citations: citations,
    completeness_score: score,
    verification_status: status,
    last_verified_date: new Date().toISOString(),
    last_source_method: source?.method || 'registry_only',
    review_required: queue.length > 0,
    codehawk_run_id: runId || undefined,
    ...(source?.url ? { source_url: source.url } : {}),
    ...(notes ? { extraction_notes: String(notes).slice(0, 1200) } : {}),
  };
}