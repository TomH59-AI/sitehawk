/*
 * ============================================================================
 *  SKIP-TRACE CASCADE v1 — 2026-06-01
 * ----------------------------------------------------------------------------
 *  Multi-source owner-phone resolution for Section 3 Target Parcels. Replaces
 *  the old "Enformion-only, stop at first hit" path (~40% hit rate) with a
 *  cascade that COLLECTS phones from every source, dedupes, and ranks them.
 *
 *  SOURCES (4, mapped to the REAL working actors that return phone numbers —
 *  there are no standalone WhitePages / TruthFinder actors on Apify; the
 *  one-api actor already scrapes TruePeopleSearch, FastPeopleSearch,
 *  Truthfinder, Spokeo, BeenVerified & PeopleFinders, and brilliant_gum scrapes
 *  ThatsThem + Radaris + Spokeo):
 *    1. Enformion   — devapi.endato.com Contact/Enrich        (cheapest, first)
 *    2. one-api      — apify: one-api~skip-trace               (Spokeo/Truthfinder/TPS/etc.)
 *    3. brilliant_gum — apify: brilliant_gum~skip-trace-people-search (ThatsThem/Radaris/Spokeo)
 *    4. (TruthFinder coverage is folded into one-api — it is one of its sites)
 *
 *  CASCADE ORDER: Enformion runs FIRST (synchronous, cheapest). If it returns a
 *  phone we still fire the two Apify actors IN PARALLEL to enrich the popup,
 *  but if Enformion already has a hit and the parallel actors miss/time out we
 *  return immediately. Per-actor timeout 30s, total budget ~35s.
 *
 *  ENV VARS USED: ENFORMION_AP_NAME, ENFORMION_AP_PASSWORD, APIFY_API_TOKEN.
 *  If APIFY_API_TOKEN is missing → logs a warning and runs Enformion-only.
 *
 *  AGGREGATION: every phone normalized to E.164 (US +1), deduped, mobile
 *  preferred over landline, most-recently-reported preferred. confidence =
 *  number of distinct sources that returned the winning number.
 *
 *  ENTITY OWNERS (LLC/Trust/Corp): short-circuited — people-search can't match
 *  them. Returns is_entity_owner:true so the UI shows "manual lookup required".
 * ============================================================================
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ONE_API = "one-api~skip-trace";
const ACTOR_BRILLIANT_GUM = "brilliant_gum~skip-trace-people-search";
const ENFORMION_URL = "https://devapi.endato.com/Contact/Enrich";

// one-api/Spokeo returns in ~25-30s. brilliant_gum (ThatsThem/Radaris/Spokeo via
// residential proxy) is slower — 60-92s observed — so it gets a longer cap.
// "Try hard, never miss" mode: we wait the full window rather than racing.
const PER_ACTOR_TIMEOUT_MS = 30000;
const BRILLIANT_GUM_TIMEOUT_MS = 110000;
const TOTAL_BUDGET_MS = 120000;

const VALID_PHONE_RX = /^[\d\-\+\(\)\s\.]{7,20}$/;

function isValidPhone(p) {
  if (!p || typeof p !== "string") return false;
  const digits = p.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 && VALID_PHONE_RX.test(p);
}

// Normalize a US phone to E.164 (+1XXXXXXXXXX) for dedupe.
function toE164(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return null;
  return `+1${d}`;
}

function prettyPhone(e164) {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "").slice(-10);
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function isMobile(type) {
  return typeof type === "string" && /wireless|mobile|cell/i.test(type);
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

async function fetchWithTimeout(url, opts = {}, timeoutMs = PER_ACTOR_TIMEOUT_MS) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { ok: r.ok, status: r.status, json };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  } finally {
    clearTimeout(t);
  }
}

// A "found phone" record: { phone (E.164), source, type, lastReported }
function pushPhone(out, raw, source, type, lastReported) {
  const e164 = isValidPhone(raw) ? toE164(raw) : null;
  if (!e164) return;
  out.push({ phone: e164, source, type: type || null, lastReported: lastReported || null });
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function isValidEmail(e) {
  return typeof e === "string" && EMAIL_RX.test(e.trim());
}
// A "found email" record: { email (lowercased), source }
function pushEmail(out, raw, source) {
  if (!isValidEmail(raw)) return;
  out.push({ email: String(raw).trim().toLowerCase(), source });
}

// ── SOURCE 1: Enformion ─────────────────────────────────────────────────────
async function srcEnformion({ firstName, lastName, street, city, state, zip }, diag, emailsOut = []) {
  const apName = Deno.env.get("ENFORMION_AP_NAME");
  const apPwd = Deno.env.get("ENFORMION_AP_PASSWORD");
  const out = [];
  if (!apName || !apPwd) { diag("Enformion", "missing_credentials", 0); return out; }
  if (!firstName || !lastName) { diag("Enformion", "missing_name", 0); return out; }

  const res = await fetchWithTimeout(ENFORMION_URL, {
    method: "POST",
    headers: {
      "galaxy-ap-name": apName, "galaxy-ap-password": apPwd,
      "galaxy-search-type": "DevAPIContactEnrich", "Content-Type": "application/json",
    },
    body: JSON.stringify({
      FirstName: firstName, LastName: lastName,
      Address: { AddressLine1: street, AddressLine2: [city, state, zip].filter(Boolean).join(" ") },
    }),
  }, 20000);

  if (!res.ok) { diag("Enformion", res.error || `http_${res.status}`, 0); return out; }
  const d = res.json?.person || res.json?.Person || res.json || {};
  const phones = d.phones || d.Phones || [];
  for (const p of phones) {
    pushPhone(out, p.phoneNumber || p.PhoneNumber || p.number, "Enformion", p.phoneType || p.PhoneType, p.lastReportedDate);
  }
  const emails = d.emails || d.Emails || [];
  for (const e of emails) {
    pushEmail(emailsOut, typeof e === "string" ? e : (e.email || e.Email || e.emailAddress || e.EmailAddress), "Enformion");
  }
  diag("Enformion", "ok", out.length);
  return out;
}

// ── SOURCE 2: one-api (Spokeo / Truthfinder / TruePeopleSearch / etc.) ───────
async function srcOneApi({ ownerName, street, city, state, zip }, token, diag, emailsOut = []) {
  const out = [];
  if (!token) { diag("Spokeo/one-api", "missing_apify_token", 0); return out; }
  const csz = [city, state, zip].filter(Boolean).join(", ");
  const input = {
    max_results: 1,
    name: ownerName && csz ? [`${ownerName}; ${csz}`] : ownerName ? [ownerName] : undefined,
    street_citystatezip: street && csz ? [`${street}; ${csz}`] : undefined,
  };
  Object.keys(input).forEach((k) => input[k] === undefined && delete input[k]);

  // one-api/skip-trace is a pay-per-result actor — the run-sync endpoint REQUIRES
  // a maxItems billing cap > 0 or it returns http_400 (max-items-must-be-greater-than-zero).
  const url = `${APIFY_BASE}/acts/${ACTOR_ONE_API}/run-sync-get-dataset-items?token=${token}&maxItems=5`;
  const res = await fetchWithTimeout(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }, PER_ACTOR_TIMEOUT_MS);

  if (!res.ok) {
    const detail = res.error || `http_${res.status}: ${JSON.stringify(res.json).slice(0, 200)}`;
    diag("Spokeo/one-api", detail, 0);
    return out;
  }
  const items = Array.isArray(res.json) ? res.json : [];
  const rec = items[0] || {};
  for (let i = 1; i <= 5; i++) {
    // "Phone-N Type" = Wireless/LandLine (mobile detection);
    // "Phone-N Last Reported" = most-recent-use date (recency ranking).
    pushPhone(out, rec[`Phone-${i}`], "Spokeo", rec[`Phone-${i} Type`], rec[`Phone-${i} Last Reported`]);
  }
  // "Email-N" columns carry the owner's reported email addresses.
  for (let i = 1; i <= 5; i++) pushEmail(emailsOut, rec[`Email-${i}`] || rec[`Email ${i}`], "Spokeo");
  diag("Spokeo/one-api", "ok", out.length);
  return out;
}

// ── SOURCE 3: brilliant_gum (ThatsThem / Radaris / Spokeo) ───────────────────
async function srcBrilliantGum({ firstName, lastName, street, city, state, zip }, token, diag, emailsOut = []) {
  const out = [];
  if (!token) { diag("WhitePages/brilliant_gum", "missing_apify_token", 0); return out; }
  const input = {
    searchType: "name",
    firstName: firstName || undefined, lastName: lastName || undefined,
    city: city || undefined, state: state || undefined, street: street || undefined, zip: zip || undefined,
    sources: ["thatsThem", "radaris", "spokeo"], maxResults: 1,
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: "US" },
  };
  Object.keys(input).forEach((k) => input[k] === undefined && delete input[k]);

  const url = `${APIFY_BASE}/acts/${ACTOR_BRILLIANT_GUM}/run-sync-get-dataset-items?token=${token}`;
  const res = await fetchWithTimeout(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }, BRILLIANT_GUM_TIMEOUT_MS);

  if (!res.ok) { diag("WhitePages/brilliant_gum", res.error || `http_${res.status}`, 0); return out; }
  const items = Array.isArray(res.json) ? res.json : [];
  const rec = items[0] || {};
  const phones = rec.phones || rec.phoneNumbers || [];
  for (const p of phones) {
    const num = p?.number || p?.phone || (typeof p === "string" ? p : null);
    pushPhone(out, num, "WhitePages", p?.type || p?.lineType, p?.lastReported || p?.date);
  }
  const emails = rec.emails || rec.emailAddresses || [];
  for (const e of emails) {
    pushEmail(emailsOut, typeof e === "string" ? e : (e?.email || e?.address || e?.value), "WhitePages");
  }
  diag("WhitePages/brilliant_gum", "ok", out.length);
  return out;
}

// Parse a "last reported" label into a sortable epoch (ms). Sources report it as
// free text like "Last reported Jul 2018", "Mar 2026", or ISO dates — plain string
// compare sorts those alphabetically (wrong). Returns 0 when unparseable.
const MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
function reportedToEpoch(raw) {
  if (!raw) return 0;
  const s = String(raw);
  // "Mon YYYY" (with or without a "Last reported" prefix).
  const m = s.match(/([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()] != null) return Date.UTC(Number(m[2]), MONTHS[m[1].toLowerCase()], 1);
  // Bare 4-digit year.
  const y = s.match(/\b(19|20)\d{2}\b/);
  if (y) return Date.UTC(Number(y[0]), 0, 1);
  // ISO / parseable date string.
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

// Aggregate: dedupe by E.164, count sources, prefer mobile then recency.
function aggregate(found) {
  const byNum = new Map();
  for (const f of found) {
    const cur = byNum.get(f.phone) || { phone: f.phone, sources: new Set(), mobile: false, lastReported: null, reportedEpoch: 0 };
    cur.sources.add(f.source);
    if (isMobile(f.type)) cur.mobile = true;
    const epoch = reportedToEpoch(f.lastReported);
    // Keep the MOST RECENT report label/date seen for this number.
    if (epoch > cur.reportedEpoch) { cur.reportedEpoch = epoch; cur.lastReported = f.lastReported; }
    else if (!cur.lastReported && f.lastReported) cur.lastReported = f.lastReported;
    byNum.set(f.phone, cur);
  }
  const list = [...byNum.values()].map((x) => ({
    phone: x.phone, display: prettyPhone(x.phone),
    sources: [...x.sources], source_count: x.sources.size, mobile: x.mobile,
    lastReported: x.lastReported, reportedEpoch: x.reportedEpoch,
  }));
  // Rank: most recently reported → more sources → mobile. Recency first so a
  // fresh, callable number always beats a decade-old one.
  list.sort((a, b) =>
    b.reportedEpoch - a.reportedEpoch ||
    b.source_count - a.source_count ||
    (b.mobile === a.mobile ? 0 : b.mobile ? 1 : -1)
  );
  return list;
}

// Aggregate emails: dedupe by address, count distinct sources, rank by source count.
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

    const apifyToken = Deno.env.get("APIFY_API_TOKEN");
    if (!apifyToken) {
      console.warn(`[SKIPTRACE DIAG] APIFY_API_TOKEN missing — Enformion-only mode (no Apify fallback).`);
    }

    const { firstName, lastName, isEntity } = parseOwnerName(owner_name);
    const { street, city, state, zip } = parseAddress(mailing_address || "");

    const diag = (source, result, count) =>
      console.log(`[SKIPTRACE DIAG] source=${source} target=${target_label || "?"} owner="${owner_name}" result=${result} count=${count}`);

    // ── Entity gate ──
    if (isEntity) {
      diag("entity_gate", "entity_owner_skipped", 0);
      return Response.json({
        is_entity_owner: true, phone: null, display: "", source: null, source_count: 0,
        phones: [], email: null, email_source: null, emails: [],
        _meta: { owner_name, target_label, duration_ms: Date.now() - t0 },
      });
    }

    // Shared sink — every source also drops any emails it returns here.
    const emailsFound = [];

    // ── SOURCE 1: Enformion (synchronous, cheapest) ──
    const enformionPhones = await srcEnformion({ firstName, lastName, street, city, state, zip }, diag, emailsFound);

    // ── SOURCES 2 & 3: Apify actors IN PARALLEL (only if token present) ──
    let apifyResults = [[], []];
    if (apifyToken) {
      const remaining = Math.max(5000, TOTAL_BUDGET_MS - (Date.now() - t0));
      const guard = (pms) => Promise.race([
        pms,
        new Promise((resolve) => setTimeout(() => resolve([]), remaining)),
      ]);
      apifyResults = await Promise.all([
        guard(srcOneApi({ ownerName: owner_name, street, city, state, zip }, apifyToken, diag, emailsFound)).catch((e) => { diag("Spokeo/one-api", e.message, 0); return []; }),
        guard(srcBrilliantGum({ firstName, lastName, street, city, state, zip }, apifyToken, diag, emailsFound)).catch((e) => { diag("WhitePages/brilliant_gum", e.message, 0); return []; }),
      ]);
    }

    const found = [...enformionPhones, ...apifyResults[0], ...apifyResults[1]];
    const phones = aggregate(found);
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
        apify_enabled: !!apifyToken,
        total_found: found.length,
        duration_ms: Date.now() - t0,
      },
    });
  } catch (error) {
    console.log(`[SKIPTRACE DIAG] fatal error=${error.message}`);
    return Response.json({ is_entity_owner: false, phone: null, display: "", source: null, source_count: 0, phones: [], _meta: { error: error.message } });
  }
});