import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * targetAContactEnrich — Standalone owner-contact resolution.
 *
 * Runs ONCE after Target A is confirmed best. NEVER inside parcel candidate loops.
 * NEVER on Target B or C unless they later get promoted to Target A.
 *
 * Cascade (phone and email resolved INDEPENDENTLY, per-field short-circuit):
 *   TIER 1: Enformion (Endato) Contact/Enrich   → confidence "high"
 *   TIER 2A: apify one-api/skip-trace           → confidence "medium" (multi-source)
 *   TIER 2B: apify brilliant_gum/skip-trace     → confidence "medium" (multi-source, requires US res. proxy)
 *   // TIER 2C: reserved — no maintained name+address-in contact-returning actor
 *   //          exists beyond 2A/2B coverage as of 2026-05-28.
 *
 * INPUT:  { owner_name (req), owner_mailing_address (req), site_name (opt) }
 * OUTPUT: { phone, email, phone_source, email_source, _contact_confidence, _meta }
 *
 * NEVER throws on total miss — returns nulls + "missing" sources + "none" confidence.
 */

// ─────────────────────── helpers ───────────────────────

const APIFY_BASE = "https://api.apify.com/v2";
const APIFY_2A_ACTOR = "one-api~skip-trace";              // 6,533 users / 99.9% / verified phone+email schema
const APIFY_2B_ACTOR = "brilliant_gum~skip-trace-people-search"; // multi-source merge, requires US res proxy

const ENFORMION_URL = "https://devapi.endato.com/Contact/Enrich";

const VALID_PHONE_RX = /^[\d\-\+\(\)\s\.]{7,20}$/;
const VALID_EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidPhone(p) {
  if (!p || typeof p !== "string") return false;
  const digits = p.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 && VALID_PHONE_RX.test(p);
}
function isValidEmail(e) {
  if (!e || typeof e !== "string") return false;
  return VALID_EMAIL_RX.test(e.trim());
}

/**
 * Parse "John Q Doe" or "John Doe" → { firstName, lastName }.
 * For business entities (LLC, INC, TRUST, etc.) returns nulls — Enformion
 * needs a real person, not a corporate name.
 */
function parseOwnerName(fullName) {
  if (!fullName || typeof fullName !== "string") return { firstName: null, lastName: null, isEntity: false };
  const upper = fullName.toUpperCase();
  const ENTITY_MARKERS = /\b(LLC|L\.L\.C|INC|INCORPORATED|CORP|CORPORATION|TRUST|LP|LLP|LTD|HOSPITAL|CHURCH|COMPANY|CO\.|HOLDINGS|PROPERTIES|PARTNERS|ASSOC|ASSOCIATION|AUTHORITY|FOUNDATION|FUND|GROUP)\b/;
  if (ENTITY_MARKERS.test(upper)) return { firstName: null, lastName: null, isEntity: true };
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] || null, lastName: null, isEntity: false };
  return { firstName: parts[0], lastName: parts[parts.length - 1], isEntity: false };
}

/**
 * Parse a mailing address like "123 MAIN ST, ST PETERSBURG, FL 33705" into parts.
 * Best-effort regex parser — Enformion accepts partial parts.
 */
function parseAddress(addr) {
  if (!addr || typeof addr !== "string") return { street: null, city: null, state: null, zip: null };
  const trimmed = addr.trim();
  // ZIP at end
  const zipMatch = trimmed.match(/(\d{5}(?:-\d{4})?)\s*$/);
  const zip = zipMatch ? zipMatch[1] : null;
  // State (2-letter) before ZIP
  const stateMatch = trimmed.match(/\b([A-Z]{2})\s+\d{5}/);
  const state = stateMatch ? stateMatch[1] : null;
  // City: text between last comma and the state
  const parts = trimmed.split(",").map((s) => s.trim());
  let street = null, city = null;
  if (parts.length >= 3) {
    street = parts[0];
    city = parts[1];
  } else if (parts.length === 2) {
    street = parts[0];
    // last segment is "CITY ST ZIP" — strip state+zip
    city = parts[1].replace(/\b[A-Z]{2}\s+\d{5}.*$/, "").trim() || null;
  } else {
    street = parts[0];
  }
  return { street, city, state, zip };
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 30000) {
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

// ─────────────────────── TIER 1: Enformion ───────────────────────

async function tier1Enformion({ firstName, lastName, street, city, state, zip }) {
  const apName = Deno.env.get("ENFORMION_AP_NAME");
  const apPwd = Deno.env.get("ENFORMION_AP_PASSWORD");
  if (!apName || !apPwd) return { ok: false, error: "missing_credentials" };

  const body = {
    FirstName: firstName,
    LastName: lastName,
    Address: { AddressLine1: street, AddressLine2: [city, state, zip].filter(Boolean).join(" ") },
  };

  const res = await fetchWithTimeout(ENFORMION_URL, {
    method: "POST",
    headers: {
      "galaxy-ap-name": apName,
      "galaxy-ap-password": apPwd,
      "galaxy-search-type": "DevAPIContactEnrich",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, 20000);

  if (!res.ok) return { ok: false, error: res.error || `enformion_http_${res.status}` };

  const d = res.json?.person || res.json?.Person || res.json || {};
  const phones = d.phones || d.Phones || [];
  const emails = d.emails || d.Emails || [];

  const phone = phones.find((p) => isValidPhone(p.phoneNumber || p.PhoneNumber || p.number))?.phoneNumber
             || phones.find((p) => isValidPhone(p.phoneNumber || p.PhoneNumber || p.number))?.PhoneNumber
             || phones.find((p) => isValidPhone(p.phoneNumber || p.PhoneNumber || p.number))?.number
             || null;
  const email = emails.find((e) => isValidEmail(e.email || e.Email || e.address))?.email
             || emails.find((e) => isValidEmail(e.email || e.Email || e.address))?.Email
             || emails.find((e) => isValidEmail(e.email || e.Email || e.address))?.address
             || null;

  return { ok: true, phone, email };
}

// ─────────────────────── TIER 2A: one-api/skip-trace ───────────────────────

/**
 * Output schema (verified): { Phone-1..5, Phone-N Provider, Phone-N Type, Email-1..5, ... }
 * NOTE: schema doesn't expose underlying source site per phone — provider field is the
 * carrier (e.g. "AT&T"), not the source site (TruePeopleSearch vs Spokeo). So we tag
 * "apify:one-api" as the granular-as-possible source per your rule: don't fabricate.
 */
async function tier2A_OneApi({ ownerName, street, city, state, zip }) {
  const apifyToken = Deno.env.get("APIFY_API_TOKEN");
  if (!apifyToken) return { ok: false, error: "missing_apify_token" };

  // Input shape per verified schema: name OR street_citystatezip arrays (semicolon-separated entries)
  const citystatezip = [city, state, zip].filter(Boolean).join(", ");
  const input = {
    max_results: 1,
    name: ownerName && citystatezip ? [`${ownerName}; ${citystatezip}`] : ownerName ? [ownerName] : undefined,
    street_citystatezip: street && citystatezip ? [`${street}; ${citystatezip}`] : undefined,
  };
  // Strip undefined to keep payload clean
  Object.keys(input).forEach((k) => input[k] === undefined && delete input[k]);

  const url = `${APIFY_BASE}/acts/${APIFY_2A_ACTOR}/run-sync-get-dataset-items?token=${apifyToken}&timeout=60`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }, 75000);

  if (!res.ok) return { ok: false, error: res.error || `apify_2a_http_${res.status}` };

  const items = Array.isArray(res.json) ? res.json : [];
  if (!items.length) return { ok: true, phone: null, email: null };

  // Pick first valid phone across all Phone-1..5 fields (highest = lowest index = most recent)
  const rec = items[0];
  let phone = null;
  for (let i = 1; i <= 5; i++) {
    const p = rec[`Phone-${i}`];
    if (isValidPhone(p)) { phone = p; break; }
  }
  let email = null;
  for (let i = 1; i <= 5; i++) {
    const e = rec[`Email-${i}`];
    if (isValidEmail(e)) { email = e; break; }
  }

  return { ok: true, phone, email };
}

// ─────────────────────── TIER 2B: brilliant_gum/skip-trace-people-search ───────────────────────

/**
 * Output: merged person record with phones/emails/addresses across ThatsThem + Radaris + Spokeo.
 * REQUIRES US residential proxy — explicitly wired in input below.
 */
async function tier2B_BrilliantGum({ firstName, lastName, street, city, state, zip }) {
  const apifyToken = Deno.env.get("APIFY_API_TOKEN");
  if (!apifyToken) return { ok: false, error: "missing_apify_token" };

  const input = {
    searchType: "name",
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    city: city || undefined,
    state: state || undefined,
    street: street || undefined,
    zip: zip || undefined,
    sources: ["thatsThem", "radaris", "spokeo"],
    maxResults: 1,
    // EXPLICIT residential proxy — 2B will fail at runtime without this
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ["RESIDENTIAL"],
      apifyProxyCountry: "US",
    },
  };
  Object.keys(input).forEach((k) => input[k] === undefined && delete input[k]);

  const url = `${APIFY_BASE}/acts/${APIFY_2B_ACTOR}/run-sync-get-dataset-items?token=${apifyToken}&timeout=90`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }, 100000);

  if (!res.ok) return { ok: false, error: res.error || `apify_2b_http_${res.status}` };

  const items = Array.isArray(res.json) ? res.json : [];
  if (!items.length) return { ok: true, phone: null, email: null };

  const rec = items[0];
  // Brilliant gum schema (per README): merged record with phones[]/emails[] arrays + source provenance
  const phones = rec.phones || rec.phoneNumbers || [];
  const emails = rec.emails || rec.emailAddresses || [];

  let phone = null, phoneSubSource = null;
  for (const p of phones) {
    const num = p?.number || p?.phone || (typeof p === "string" ? p : null);
    if (isValidPhone(num)) { phone = num; phoneSubSource = p?.source || null; break; }
  }
  let email = null, emailSubSource = null;
  for (const e of emails) {
    const addr = e?.address || e?.email || (typeof e === "string" ? e : null);
    if (isValidEmail(addr)) { email = addr; emailSubSource = e?.source || null; break; }
  }

  return { ok: true, phone, email, phoneSubSource, emailSubSource };
}

// ─────────────────────── orchestrator ───────────────────────

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      owner_name,
      owner_mailing_address,
      site_name = null,
      _force_skip_enformion = false, // test hook for protocol step (b)
      _force_skip_2a = false,        // test hook for protocol step (d)
    } = body || {};

    if (!owner_name || !owner_mailing_address) {
      return Response.json({ error: "owner_name and owner_mailing_address required" }, { status: 400 });
    }

    const { firstName, lastName, isEntity } = parseOwnerName(owner_name);
    const { street, city, state, zip } = parseAddress(owner_mailing_address);

    const fallbacks = [];
    let phone = null, email = null;
    let phoneSource = "missing", emailSource = "missing";
    let confidence = "none";
    let enformionHit = false;

    // ─── TIER 1: Enformion (skip for entities — needs a real person) ───
    if (!_force_skip_enformion && !isEntity && firstName && lastName) {
      const t1 = await tier1Enformion({ firstName, lastName, street, city, state, zip });
      if (t1.ok) {
        enformionHit = !!(t1.phone || t1.email);
        if (t1.phone) { phone = t1.phone; phoneSource = "enformion"; }
        if (t1.email) { email = t1.email; emailSource = "enformion"; }
        if (enformionHit) confidence = "high";
      } else {
        fallbacks.push(`enformion:${t1.error}`);
      }
    } else {
      const reason = _force_skip_enformion ? "forced_skip" : isEntity ? "entity_owner" : "missing_name";
      fallbacks.push(`enformion:${reason}`);
      console.log(`[INFO] CONTACT_FALLBACK enformion_skipped reason=${reason} owner="${owner_name}" site="${site_name}"`);
    }

    // ─── TIER 2A: one-api/skip-trace — fires per-field for anything still null ───
    const need2A_phone = !phone;
    const need2A_email = !email;
    if (!_force_skip_2a && (need2A_phone || need2A_email)) {
      console.log(`[INFO] CONTACT_FALLBACK tier2a_fire need_phone=${need2A_phone} need_email=${need2A_email} owner="${owner_name}"`);
      const t2a = await tier2A_OneApi({ ownerName: owner_name, street, city, state, zip });
      if (t2a.ok) {
        if (need2A_phone && t2a.phone) {
          phone = t2a.phone;
          phoneSource = "apify:one-api"; // schema doesn't expose underlying source site — don't fabricate
          if (confidence === "none") confidence = "medium";
        }
        if (need2A_email && t2a.email) {
          email = t2a.email;
          emailSource = "apify:one-api";
          if (confidence === "none") confidence = "medium";
        }
      } else {
        fallbacks.push(`apify_2a:${t2a.error}`);
      }
    } else if (_force_skip_2a) {
      fallbacks.push(`apify_2a:forced_skip`);
      console.log(`[INFO] CONTACT_FALLBACK tier2a_skipped reason=forced_skip owner="${owner_name}"`);
    }

    // ─── TIER 2B: brilliant_gum — fires per-field for anything STILL null ───
    const need2B_phone = !phone;
    const need2B_email = !email;
    if (need2B_phone || need2B_email) {
      console.log(`[INFO] CONTACT_FALLBACK tier2b_fire need_phone=${need2B_phone} need_email=${need2B_email} owner="${owner_name}"`);
      const t2b = await tier2B_BrilliantGum({ firstName, lastName, street, city, state, zip });
      if (t2b.ok) {
        if (need2B_phone && t2b.phone) {
          phone = t2b.phone;
          phoneSource = t2b.phoneSubSource ? `apify:brilliant_gum:${t2b.phoneSubSource}` : "apify:brilliant_gum";
          if (confidence === "none") confidence = "medium";
        }
        if (need2B_email && t2b.email) {
          email = t2b.email;
          emailSource = t2b.emailSubSource ? `apify:brilliant_gum:${t2b.emailSubSource}` : "apify:brilliant_gum";
          if (confidence === "none") confidence = "medium";
        }
      } else {
        fallbacks.push(`apify_2b:${t2b.error}`);
      }
    }

    // TIER 2C: reserved — no maintained name+address-in contact-returning actor
    //          exists beyond 2A/2B coverage as of 2026-05-28.

    if (!phone && !email) {
      console.log(`[INFO] CONTACT_FALLBACK total_miss owner="${owner_name}" site="${site_name}"`);
    }

    return Response.json({
      phone,
      email,
      phone_source: phoneSource,
      email_source: emailSource,
      _contact_confidence: confidence,
      _meta: {
        owner_name,
        site_name,
        is_entity_owner: isEntity,
        fallbacks,
        enformion_hit: enformionHit,
        duration_ms: Date.now() - t0,
      },
    });
  } catch (error) {
    console.log(`[ERROR] targetAContactEnrich: ${error.message}`);
    return Response.json({
      phone: null,
      email: null,
      phone_source: "missing",
      email_source: "missing",
      _contact_confidence: "none",
      _meta: { error: error.message, duration_ms: Date.now() - t0 },
    });
  }
});