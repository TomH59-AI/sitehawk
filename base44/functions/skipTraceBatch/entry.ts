/*
 * ============================================================================
 *  SKIP-TRACE BATCH v2 — 2026-06-19
 * ----------------------------------------------------------------------------
 *  Replaces the old Supabase-proxy path with the same multi-source cascade
 *  used by skipTraceCascade: Enformion → one-api/Spokeo → brilliant_gum.
 *
 *  MODES:
 *    single  — { owner_name, mailing_address, candidate_id?, search_id? }
 *    batch   — { mode:"batch", candidates: [{ owner_name, owner_mailing_address, id, search_id }] }
 *
 *  OUTPUT (single): { phones, emails, phone, email, status, is_entity_owner, ... }
 *  OUTPUT (batch):  { results: [...] }
 * ============================================================================
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ONE_API    = "one-api~skip-trace";
const ACTOR_BRILLIANT  = "brilliant_gum~skip-trace-people-search";
const ENFORMION_URL    = "https://devapi.endato.com/Contact/Enrich";

const PER_ACTOR_MS     = 30000;
const BRILLIANT_MS     = 110000;
const TOTAL_BUDGET_MS  = 120000;

const VALID_PHONE_RX = /^[\d\-\+\(\)\s\.]{7,20}$/;

function isValidPhone(p) {
  if (!p || typeof p !== "string") return false;
  const d = p.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 15 && VALID_PHONE_RX.test(p);
}

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
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
}

function isMobile(t) { return typeof t === "string" && /wireless|mobile|cell/i.test(t); }

function pushPhone(out, raw, source, type, lastReported) {
  const e164 = isValidPhone(raw) ? toE164(raw) : null;
  if (!e164) return;
  out.push({ phone: e164, source, type: type || null, lastReported: lastReported || null });
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function pushEmail(out, raw, source) {
  if (typeof raw !== "string" || !EMAIL_RX.test(raw.trim())) return;
  out.push({ email: raw.trim().toLowerCase(), source });
}

function parseOwnerName(fullName) {
  if (!fullName || typeof fullName !== "string") return { firstName: null, lastName: null, isEntity: false };
  const ENTITY = /\b(LLC|L\.L\.C|INC|INCORPORATED|CORP|CORPORATION|TRUST|LP|LLP|LTD|HOSPITAL|CHURCH|COMPANY|CO\.|HOLDINGS|PROPERTIES|PARTNERS|ASSOC|ASSOCIATION|AUTHORITY|FOUNDATION|FUND|GROUP|CITY OF|COUNTY OF|STATE OF|DEPT OF|DEPARTMENT)\b/;
  if (ENTITY.test(fullName.toUpperCase())) return { firstName: null, lastName: null, isEntity: true };
  const cleaned = fullName.trim().replace(/\s+/g, " ");
  if (cleaned.includes(",")) {
    const [last, rest = ""] = cleaned.split(",").map(s => s.trim());
    const tokens = rest.split(/\s+/).filter(Boolean);
    return { firstName: tokens[0] || null, lastName: last || null, isEntity: false };
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] || null, lastName: null, isEntity: false };
  return { firstName: parts[0], lastName: parts[parts.length - 1], isEntity: false };
}

function parseAddress(addr) {
  if (!addr || typeof addr !== "string") return { street: null, city: null, state: null, zip: null };
  const trimmed = addr.trim();
  const zip   = (trimmed.match(/(\d{5}(?:-\d{4})?)\s*$/) || [])[1] || null;
  const state = (trimmed.match(/\b([A-Z]{2})\s+\d{5}/) || [])[1] || null;
  const parts = trimmed.split(",").map(s => s.trim());
  let street = null, city = null;
  if (parts.length >= 3) { street = parts[0]; city = parts[1]; }
  else if (parts.length === 2) { street = parts[0]; city = parts[1].replace(/\b[A-Z]{2}\s+\d{5}.*$/, "").trim() || null; }
  else street = parts[0];
  return { street, city, state, zip };
}

async function fetchWT(url, opts = {}, ms = PER_ACTOR_MS) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { ok: r.ok, status: r.status, json };
  } catch(e) {
    return { ok: false, status: 0, error: e.message };
  } finally { clearTimeout(t); }
}

// ── SOURCE 1: Enformion ──────────────────────────────────────────────────────
async function srcEnformion({ firstName, lastName, street, city, state, zip }, emailsOut) {
  const apName = Deno.env.get("ENFORMION_AP_NAME");
  const apPwd  = Deno.env.get("ENFORMION_AP_PASSWORD");
  const out = [];
  if (!apName || !apPwd || !firstName || !lastName) return out;
  const res = await fetchWT(ENFORMION_URL, {
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
  if (!res.ok) return out;
  const d = res.json?.person || res.json?.Person || res.json || {};
  for (const p of (d.phones || d.Phones || [])) pushPhone(out, p.phoneNumber || p.PhoneNumber || p.number, "Enformion", p.phoneType || p.PhoneType, p.lastReportedDate);
  for (const e of (d.emails || d.Emails || [])) pushEmail(emailsOut, typeof e === "string" ? e : (e.email || e.Email || e.emailAddress || e.EmailAddress), "Enformion");
  return out;
}

// ── SOURCE 2: one-api (Spokeo / TruePeopleSearch / Truthfinder / BeenVerified) ─
async function srcOneApi({ ownerName, street, city, state, zip }, token, emailsOut) {
  const out = [];
  if (!token) return out;
  const csz = [city, state, zip].filter(Boolean).join(", ");
  const input = { max_results: 1 };
  if (ownerName && csz) input.name = [`${ownerName}; ${csz}`];
  else if (ownerName) input.name = [ownerName];
  if (street && csz) input.street_citystatezip = [`${street}; ${csz}`];

  const url = `${APIFY_BASE}/acts/${ACTOR_ONE_API}/run-sync-get-dataset-items?token=${token}&maxItems=5`;
  const res = await fetchWT(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }, PER_ACTOR_MS);
  if (!res.ok) return out;

  const items = Array.isArray(res.json) ? res.json : [];
  const rec = items[0] || {};
  for (let i = 1; i <= 5; i++) pushPhone(out, rec[`Phone-${i}`], "Spokeo", rec[`Phone-${i} Type`], rec[`Phone-${i} Last Reported`]);
  for (let i = 1; i <= 5; i++) pushEmail(emailsOut, rec[`Email-${i}`] || rec[`Email ${i}`], "Spokeo");
  return out;
}

// ── SOURCE 3: brilliant_gum (ThatsThem / Radaris / Spokeo) ───────────────────
async function srcBrilliantGum({ firstName, lastName, street, city, state, zip }, token, emailsOut) {
  const out = [];
  if (!token) return out;
  const input = {
    searchType: "name",
    firstName: firstName || undefined, lastName: lastName || undefined,
    city: city || undefined, state: state || undefined,
    street: street || undefined, zip: zip || undefined,
    sources: ["thatsThem", "radaris", "spokeo"], maxResults: 1,
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: "US" },
  };
  Object.keys(input).forEach(k => input[k] === undefined && delete input[k]);

  const url = `${APIFY_BASE}/acts/${ACTOR_BRILLIANT}/run-sync-get-dataset-items?token=${token}`;
  const res = await fetchWT(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }, BRILLIANT_MS);
  if (!res.ok) return out;

  const items = Array.isArray(res.json) ? res.json : [];
  const rec = items[0] || {};
  for (const p of (rec.phones || rec.phoneNumbers || [])) {
    const num = p?.number || p?.phone || (typeof p === "string" ? p : null);
    pushPhone(out, num, "WhitePages", p?.type || p?.lineType, p?.lastReported || p?.date);
  }
  for (const e of (rec.emails || rec.emailAddresses || [])) {
    pushEmail(emailsOut, typeof e === "string" ? e : (e?.email || e?.address || e?.value), "WhitePages");
  }
  return out;
}

const MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
function reportedToEpoch(raw) {
  if (!raw) return 0;
  const s = String(raw);
  const m = s.match(/([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()] != null) return Date.UTC(Number(m[2]), MONTHS[m[1].toLowerCase()], 1);
  const y = s.match(/\b(19|20)\d{2}\b/);
  if (y) return Date.UTC(Number(y[0]), 0, 1);
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

function aggregate(found) {
  const byNum = new Map();
  for (const f of found) {
    const cur = byNum.get(f.phone) || { phone: f.phone, sources: new Set(), mobile: false, lastReported: null, reportedEpoch: 0 };
    cur.sources.add(f.source);
    if (isMobile(f.type)) cur.mobile = true;
    const epoch = reportedToEpoch(f.lastReported);
    if (epoch > cur.reportedEpoch) { cur.reportedEpoch = epoch; cur.lastReported = f.lastReported; }
    else if (!cur.lastReported && f.lastReported) cur.lastReported = f.lastReported;
    byNum.set(f.phone, cur);
  }
  return [...byNum.values()]
    .map(x => ({
      // Normalize to the shape SkipTraceButton already reads: { number, type, confidence }
      number: prettyPhone(x.phone),
      phone: x.phone,
      type: x.mobile ? "mobile" : "unknown",
      confidence: x.sources.size > 1 ? "high" : "medium",
      sources: [...x.sources], source_count: x.sources.size,
      mobile: x.mobile, lastReported: x.lastReported,
    }))
    .sort((a, b) =>
      reportedToEpoch(b.lastReported) - reportedToEpoch(a.lastReported) ||
      b.source_count - a.source_count ||
      (b.mobile === a.mobile ? 0 : b.mobile ? 1 : -1)
    );
}

function aggregateEmails(found) {
  const byAddr = new Map();
  for (const f of found) {
    const cur = byAddr.get(f.email) || { email: f.email, sources: new Set() };
    cur.sources.add(f.source);
    byAddr.set(f.email, cur);
  }
  return [...byAddr.values()]
    .map(x => ({
      // Normalize to { address, type, confidence } shape SkipTraceButton reads
      address: x.email,
      email: x.email,
      type: "email",
      confidence: x.sources.size > 1 ? "high" : "medium",
      sources: [...x.sources], source_count: x.sources.size,
    }))
    .sort((a, b) => b.source_count - a.source_count || a.email.localeCompare(b.email));
}

// ── Core cascade runner ──────────────────────────────────────────────────────
async function runCascade(ownerName, mailingAddress, t0 = Date.now()) {
  const { firstName, lastName, isEntity } = parseOwnerName(ownerName);
  if (isEntity) {
    return {
      is_entity_owner: true, phones: [], emails: [],
      phone: null, email: null, status: "entity",
      associated_llcs: [], sunbiz_verified: false, registered_agent: null,
    };
  }

  const { street, city, state, zip } = parseAddress(mailingAddress || "");
  const token = Deno.env.get("APIFY_API_TOKEN");
  const emailsFound = [];

  // Enformion first (sync, cheapest)
  const enformionPhones = await srcEnformion({ firstName, lastName, street, city, state, zip }, emailsFound);

  // Apify actors in parallel
  let apifyResults = [[], []];
  if (token) {
    const remaining = Math.max(5000, TOTAL_BUDGET_MS - (Date.now() - t0));
    const guard = p => Promise.race([p, new Promise(r => setTimeout(() => r([]), remaining))]);
    apifyResults = await Promise.all([
      guard(srcOneApi({ ownerName, street, city, state, zip }, token, emailsFound)).catch(() => []),
      guard(srcBrilliantGum({ firstName, lastName, street, city, state, zip }, token, emailsFound)).catch(() => []),
    ]);
  }

  const phones = aggregate([...enformionPhones, ...apifyResults[0], ...apifyResults[1]]);
  const emails = aggregateEmails(emailsFound);
  const topPhone = phones[0] || null;
  const topEmail = emails[0] || null;

  const status = phones.length || emails.length
    ? (phones.length && emails.length ? "found" : "partial")
    : "not_found";

  return {
    is_entity_owner: false,
    phones, emails,
    phone: topPhone?.number || null,
    email: topEmail?.address || null,
    status,
    associated_llcs: [],
    sunbiz_verified: false,
    registered_agent: null,
    source: topPhone ? (topPhone.source_count > 1 ? `Aggregated: ${topPhone.source_count} sources` : topPhone.sources[0]) : null,
    _meta: { apify_enabled: !!token, duration_ms: Date.now() - t0 },
  };
}

// ── Tier gate ────────────────────────────────────────────────────────────────
function isAllowed(user) {
  const tier = user.tier || "blind";
  if (user.role === "admin") return true;
  const isFreeTrialSkip = (tier === "blind" || tier === "free") && user.free_trial_used && !user.free_trial_skip_trace_used;
  if (isFreeTrialSkip) return "free_trial";
  return !["blind", "free"].includes(tier);
}

// Rate limit: max 10/minute per user
const rateLimitMap = new Map();
function checkRateLimit(userId, count = 1) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId) || { count: 0, windowStart: now };
  if (now - entry.windowStart > 60000) { rateLimitMap.set(userId, { count, windowStart: now }); return false; }
  if (entry.count + count > 10) return true;
  entry.count += count;
  rateLimitMap.set(userId, entry);
  return false;
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const allowed = isAllowed(user);
    if (!allowed) return Response.json({ error: "Upgrade required" }, { status: 403 });

    const body = await req.json();
    const { mode, owner_name, mailing_address, candidate_id, search_id, candidates } = body;

    // ── SINGLE MODE ─────────────────────────────────────────────────────────
    if (mode !== "batch") {
      if (checkRateLimit(user.id, 1)) return Response.json({ error: "Too many requests." }, { status: 429 });

      console.log(`[SKIPTRACE] single user=${user.email} owner=${owner_name}`);
      const result = await runCascade(owner_name, mailing_address, t0);

      // Mark free trial used
      if (allowed === "free_trial") {
        const users = await base44.asServiceRole.entities.User.filter({ email: user.email });
        if (users.length) await base44.asServiceRole.entities.User.update(users[0].id, { free_trial_skip_trace_used: true });
      }

      // Log to SkipTraceLog
      if (candidate_id) {
        const existing = await base44.asServiceRole.entities.SkipTraceLog.filter({ candidate_id });
        await base44.asServiceRole.entities.SkipTraceLog.create({
          candidate_id, search_id, owner_name, mailing_address,
          phones: result.phones, emails: result.emails,
          associated_llcs: result.associated_llcs,
          raw_result: JSON.stringify(result),
          status: result.status,
          attempt_number: (existing?.length || 0) + 1,
        });
      }

      return Response.json(result);
    }

    // ── BATCH MODE ───────────────────────────────────────────────────────────
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return Response.json({ error: "candidates array required for batch mode" }, { status: 400 });
    }
    const batchSize = Math.min(candidates.length, 10);
    if (checkRateLimit(user.id, batchSize)) return Response.json({ error: "Rate limit exceeded." }, { status: 429 });

    console.log(`[SKIPTRACE] batch user=${user.email} count=${batchSize}`);

    const results = await Promise.allSettled(
      candidates.slice(0, batchSize).map(async (c) => {
        const result = await runCascade(c.owner_name, c.owner_mailing_address, t0);

        if (c.id) {
          const existing = await base44.asServiceRole.entities.SkipTraceLog.filter({ candidate_id: c.id });
          await base44.asServiceRole.entities.SkipTraceLog.create({
            candidate_id: c.id, search_id: c.search_id,
            owner_name: c.owner_name, mailing_address: c.owner_mailing_address,
            phones: result.phones, emails: result.emails,
            associated_llcs: result.associated_llcs,
            raw_result: JSON.stringify(result),
            status: result.status,
            attempt_number: (existing?.length || 0) + 1,
          });
        }

        return { candidate_id: c.id, owner_name: c.owner_name, ...result };
      })
    );

    const output = results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { candidate_id: candidates[i]?.id, owner_name: candidates[i]?.owner_name, status: "error", error: r.reason?.message }
    );

    return Response.json({ results: output });

  } catch (error) {
    console.error("[SKIPTRACE] fatal:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});