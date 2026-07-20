/*
 * ============================================================================
 *  CONTACT DATA (Scrapfly) v2 — 2026-07-20
 * ----------------------------------------------------------------------------
 *  Owner phone/email resolution for the bottom-of-page "Hawk Skip-Trace"
 *  contact step. This REPLACES the previous Enformion + Apify cascade with
 *  Scrapfly-powered scraping of public people-search services, per the
 *  "contactdata" workspace skill.
 *
 *  SOURCES (order of preference, all scraped through Scrapfly's ASP + JS render):
 *    1. TruthFinder            (https://www.truthfinder.com/)
 *    2. WhitePages             (https://www.whitepages.com/)
 *    3. Spokeo                 (https://www.spokeo.com/)
 *    4. CyberBackgroundChecks  (https://www.cyberbackgroundchecks.com/)
 *
 *  Each source is scraped in parallel. Phone numbers + emails are extracted
 *  from the rendered page text, deduped (E.164), and ranked by how many
 *  sources reported the number. Nothing is fabricated — a source that returns
 *  no verifiable number simply contributes nothing.
 *
 *  ENV VARS USED: SCRAPFLY_API_KEY.
 *
 *  I/O CONTRACT is UNCHANGED from v1 so the frontend (SkipTraceStep,
 *  Section4MapSuite, TargetLanePipeline) keeps working without edits:
 *    in : { owner_name, mailing_address, target_label }
 *    out: { is_entity_owner, phone, display, source, source_count, phones[],
 *           email, email_source, emails[], _meta }
 * ============================================================================
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SCRAPFLY_URL = "https://api.scrapfly.io/scrape";
const PER_SOURCE_TIMEOUT_MS = 45000;
const TOTAL_BUDGET_MS = 60000;
const VALID_PHONE_RX = /^[\d\-\+\(\)\s\.]{7,20}$/;

const US_STATES = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california",
  CO: "colorado", CT: "connecticut", DE: "delaware", FL: "florida", GA: "georgia",
  HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa",
  KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland",
  MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi", MO: "missouri",
  MT: "montana", NE: "nebraska", NV: "nevada", NH: "new-hampshire", NJ: "new-jersey",
  NM: "new-mexico", NY: "new-york", NC: "north-carolina", ND: "north-dakota", OH: "ohio",
  OK: "oklahoma", OR: "oregon", PA: "pennsylvania", RI: "rhode-island", SC: "south-carolina",
  SD: "south-dakota", TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont",
  VA: "virginia", WA: "washington", WV: "west-virginia", WI: "wisconsin", WY: "wyoming",
  DC: "district-of-columbia",
};

function isValidPhone(p) {
  if (!p || typeof p !== "string") return false;
  const digits = p.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 && VALID_PHONE_RX.test(p);
}

function toE164(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return null;
  // First digit of area code + exchange must be 2-9 (valid NANP).
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(d)) return null;
  return `+1${d}`;
}

function prettyPhone(e164) {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "").slice(-10);
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// "LAST, FIRST" or "FIRST LAST"; flags business entities (can't be skip-traced).
function parseOwnerName(fullName) {
  if (!fullName || typeof fullName !== "string") return { firstName: null, lastName: null, isEntity: false };
  const ENTITY_MARKERS = /\b(LLC|L\.L\.C|INC|INCORPORATED|CORP|CORPORATION|TRUST|LP|LLP|LTD|HOSPITAL|CHURCH|COMPANY|CO\.|HOLDINGS|PROPERTIES|PARTNERS|ASSOC|ASSOCIATION|AUTHORITY|FOUNDATION|FUND|GROUP|CITY OF|COUNTY OF|STATE OF|DEPT OF|DEPARTMENT)\b/;
  if (ENTITY_MARKERS.test(fullName.toUpperCase())) return { firstName: null, lastName: null, isEntity: true };
  const cleaned = fullName.trim().replace(/\s+/g, " ");
  if (cleaned.includes(",")) {
    const [lastPart, restPart] = cleaned.split(",").map((s) => s.trim());
    const restTokens = (restPart || "").split(/\s+/).filter(Boolean);
    return { firstName: restTokens[0] || null, lastName: lastPart || null, isEntity: false };
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] || null, lastName: null, isEntity: false };
  return { firstName: parts[0], lastName: parts[parts.length - 1], isEntity: false };
}

function parseAddress(addr) {
  if (!addr || typeof addr !== "string") return { street: null, city: null, state: null, zip: null };
  const trimmed = addr.trim();
  const zip = (trimmed.match(/(\d{5}(?:-\d{4})?)\s*$/) || [])[1] || null;
  const state = (trimmed.match(/\b([A-Z]{2})\s+\d{5}/) || [])[1] || null;
  const parts = trimmed.split(",").map((s) => s.trim());
  let street = null, city = null;
  if (parts.length >= 3) { street = parts[0]; city = parts[1]; }
  else if (parts.length === 2) { street = parts[0]; city = parts[1].replace(/\b[A-Z]{2}\s+\d{5}.*$/, "").trim() || null; }
  else street = parts[0];
  return { street, city, state, zip };
}

// ── Scrapfly fetch — ASP (anti-bot bypass) + JS render, US proxy ─────────────
async function scrapfly(targetUrl, timeoutMs) {
  const key = Deno.env.get("SCRAPFLY_API_KEY");
  if (!key) return { ok: false, error: "missing_scrapfly_key", html: "" };
  const u = new URL(SCRAPFLY_URL);
  u.searchParams.set("key", key);
  u.searchParams.set("url", targetUrl);
  u.searchParams.set("asp", "true");
  u.searchParams.set("render_js", "true");
  u.searchParams.set("country", "us");

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(u.toString(), { signal: ctl.signal });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    const html = json?.result?.content || "";
    return { ok: r.ok, status: r.status, html };
  } catch (e) {
    return { ok: false, status: 0, error: e.message, html: "" };
  } finally {
    clearTimeout(t);
  }
}

// Strip scripts/styles/tags and pull cleanly-formatted US phone numbers.
function extractPhones(html) {
  if (!html || html.length < 500) return [];
  if (/captcha|are you a human|access denied|request blocked/i.test(html.slice(0, 4000))) return [];
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  // (XXX) XXX-XXXX or XXX-XXX-XXXX / XXX.XXX.XXXX — area code starts 2-9.
  const matches = text.match(/\(?\b[2-9]\d{2}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g) || [];
  return matches.slice(0, 25);
}

function extractEmails(html, sourceDomain) {
  if (!html) return [];
  const all = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  // Drop the site's own support/no-reply addresses.
  return all
    .filter((e) => !e.toLowerCase().includes(sourceDomain))
    .filter((e) => !/(no-?reply|support|privacy|abuse|help|info)@/i.test(e))
    // Drop asset filenames that look like emails (logo@2x.png, sprite@1.5x.webp…).
    .filter((e) => !/\.(png|jpe?g|gif|svg|webp|ico|css|js|woff2?)$/i.test(e))
    .filter((e) => /\.[a-z]{2,}$/i.test(e) && !/@\dx?\./i.test(e))
    .slice(0, 15);
}

// A "found phone" record: { phone (E.164), source }
function pushPhone(out, raw, source) {
  const e164 = isValidPhone(raw) ? toE164(raw) : null;
  if (!e164) return;
  out.push({ phone: e164, source });
}
function pushEmail(out, raw, source) {
  const e = String(raw || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return;
  out.push({ email: e, source });
}

// ── Per-source scrapers ──────────────────────────────────────────────────────
async function scrapeSource(sourceName, targetUrl, sourceDomain, diag, phonesOut, emailsOut) {
  const res = await scrapfly(targetUrl, PER_SOURCE_TIMEOUT_MS);
  if (!res.ok) { diag(sourceName, res.error || `http_${res.status}`, 0); return; }
  const phones = extractPhones(res.html);
  for (const p of phones) pushPhone(phonesOut, p, sourceName);
  for (const e of extractEmails(res.html, sourceDomain)) pushEmail(emailsOut, e, sourceName);
  diag(sourceName, "ok", phones.length);
}

function buildUrls({ firstName, lastName, city, state }) {
  const first = (firstName || "").toLowerCase().replace(/[^a-z]/g, "");
  const last = (lastName || "").toLowerCase().replace(/[^a-z]/g, "");
  const nameSlug = [first, last].filter(Boolean).join("-");
  const stateFull = state ? US_STATES[state.toUpperCase()] : null;
  const citySlug = city ? city.toLowerCase().replace(/[^a-z]+/g, "-") : null;
  const nameQuery = [firstName, lastName].filter(Boolean).join(" ");

  const urls = {};
  if (nameSlug) {
    urls.CyberBackgroundChecks = `https://www.cyberbackgroundchecks.com/people/${nameSlug}${stateFull ? `/${stateFull}` : ""}`;
    urls.Spokeo = `https://www.spokeo.com/${firstName}-${lastName}${stateFull ? `/${stateFull}` : ""}`.replace(/\s+/g, "-");
    urls.WhitePages = citySlug && state
      ? `https://www.whitepages.com/name/${firstName}-${lastName}/${citySlug}-${state.toUpperCase()}`.replace(/\s+/g, "-")
      : `https://www.whitepages.com/name/${firstName}-${lastName}`.replace(/\s+/g, "-");
  }
  if (nameQuery) {
    urls.TruthFinder = `https://www.truthfinder.com/results/?firstName=${encodeURIComponent(firstName || "")}&lastName=${encodeURIComponent(lastName || "")}${state ? `&state=${state.toUpperCase()}` : ""}`;
  }
  return urls;
}

// Dedupe by E.164, count sources, rank by source count.
function aggregate(found) {
  const byNum = new Map();
  for (const f of found) {
    const cur = byNum.get(f.phone) || { phone: f.phone, sources: new Set() };
    cur.sources.add(f.source);
    byNum.set(f.phone, cur);
  }
  const list = [...byNum.values()].map((x) => ({
    phone: x.phone, display: prettyPhone(x.phone),
    sources: [...x.sources], source_count: x.sources.size, mobile: false, lastReported: null,
  }));
  list.sort((a, b) => b.source_count - a.source_count || a.phone.localeCompare(b.phone));
  return list;
}

function aggregateEmails(found) {
  const byAddr = new Map();
  for (const f of found) {
    const cur = byAddr.get(f.email) || { email: f.email, sources: new Set() };
    cur.sources.add(f.source);
    byAddr.set(f.email, cur);
  }
  const list = [...byAddr.values()].map((x) => ({
    email: x.email, sources: [...x.sources], source_count: x.sources.size,
  }));
  list.sort((a, b) => b.source_count - a.source_count || a.email.localeCompare(b.email));
  return list;
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { owner_name, mailing_address, target_label = "" } = (await req.json()) || {};
    if (!owner_name) return Response.json({ error: "owner_name required" }, { status: 400 });

    if (!Deno.env.get("SCRAPFLY_API_KEY")) {
      console.warn(`[CONTACTDATA DIAG] SCRAPFLY_API_KEY missing — cannot scrape.`);
    }

    const { firstName, lastName, isEntity } = parseOwnerName(owner_name);
    const { city, state } = parseAddress(mailing_address || "");

    const diag = (source, result, count) =>
      console.log(`[CONTACTDATA DIAG] source=${source} target=${target_label || "?"} owner="${owner_name}" result=${result} count=${count}`);

    // Entity owners (LLC/Trust/Corp) can't be matched by people-search.
    if (isEntity) {
      diag("entity_gate", "entity_owner", 0);
      return Response.json({
        is_entity_owner: true,
        phone: null, display: "", source: null, source_count: 0, phones: [],
        email: null, email_source: null, emails: [],
        _meta: { owner_name, target_label, is_entity: true, duration_ms: Date.now() - t0 },
      });
    }

    const urls = buildUrls({ firstName, lastName, city, state });
    const domains = {
      TruthFinder: "truthfinder.com",
      WhitePages: "whitepages.com",
      Spokeo: "spokeo.com",
      CyberBackgroundChecks: "cyberbackgroundchecks.com",
    };

    const phonesFound = [];
    const emailsFound = [];

    // Scrape all available sources in parallel, within the total budget.
    const guard = (pms) => Promise.race([
      pms,
      new Promise((resolve) => setTimeout(resolve, TOTAL_BUDGET_MS)),
    ]);
    await Promise.all(
      Object.entries(urls).map(([name, url]) =>
        guard(scrapeSource(name, url, domains[name], diag, phonesFound, emailsFound))
          .catch((e) => diag(name, e.message, 0))
      )
    );

    const phones = aggregate(phonesFound);
    const top = phones[0] || null;
    const emails = aggregateEmails(emailsFound);
    const topEmail = emails[0] || null;

    diag("AGGREGATE", top ? "hit" : "no_match", phones.length);
    diag("AGGREGATE_EMAIL", topEmail ? "hit" : "no_email", emails.length);

    return Response.json({
      is_entity_owner: false,
      phone: top?.phone || null,
      display: top?.display || "",
      source: top ? (top.source_count > 1 ? `Aggregated: ${top.source_count} sources` : top.sources[0]) : null,
      source_count: top?.source_count || 0,
      phones,
      email: topEmail?.email || null,
      email_source: topEmail ? (topEmail.source_count > 1 ? `Aggregated: ${topEmail.source_count} sources` : topEmail.sources[0]) : null,
      emails,
      _meta: {
        owner_name, target_label,
        scrapfly_enabled: !!Deno.env.get("SCRAPFLY_API_KEY"),
        sources_tried: Object.keys(urls),
        total_found: phonesFound.length,
        duration_ms: Date.now() - t0,
      },
    });
  } catch (error) {
    console.log(`[CONTACTDATA DIAG] fatal error=${error.message}`);
    return Response.json({ is_entity_owner: false, phone: null, display: "", source: null, source_count: 0, phones: [], emails: [], _meta: { error: error.message } });
  }
});