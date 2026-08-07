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
import { sunbizEntityLookup } from '../../shared/sunbizEntityLookup.ts';

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
async function scrapfly(targetUrl, timeoutMs, opts = {}) {
  const key = Deno.env.get("SCRAPFLY_API_KEY");
  if (!key) return { ok: false, error: "missing_scrapfly_key", html: "" };
  const u = new URL(SCRAPFLY_URL);
  u.searchParams.set("key", key);
  u.searchParams.set("url", targetUrl);
  u.searchParams.set("asp", "true");
  u.searchParams.set("render_js", "true");
  u.searchParams.set("country", "us");
  // Some directories only pass anti-bot behind a residential exit node.
  if (opts.residential) u.searchParams.set("proxy_pool", "public_residential_pool");

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
  // Drop the site's own support/no-reply addresses, and any placeholder/sample
  // address baked into page markup — those are NOT owner data and must never
  // reach a subscriber as if they were.
  const PLACEHOLDER_DOMAIN = /@(example|domain|yourdomain|test|email|sample|mysite|website)\.(com|net|org)$/i;
  const PLACEHOLDER_LOCAL = /^(email|e-?mail|name|yourname|your-?email|user|username|firstname|lastname|someone|test|sample|foo|bar|john\.?doe|jane\.?doe|address)@/i;
  return all
    .filter((e) => !e.toLowerCase().includes(sourceDomain))
    .filter((e) => !/(no-?reply|support|privacy|abuse|help|info|legal|press|careers|sales|contact|webmaster|postmaster|optout|unsubscribe|dmca)@/i.test(e))
    .filter((e) => !PLACEHOLDER_DOMAIN.test(e))
    .filter((e) => !PLACEHOLDER_LOCAL.test(e))
    .filter((e) => !/(sentry|cloudflare|googlemail\.com$|\.local$|\.invalid$)/i.test(e))
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

/**
 * FastPeopleSearch publishes phones + emails on the PERSON DETAIL page, not on
 * the name-listing page, and only passes anti-bot through a residential exit.
 * Two hops: listing → first detail record → extract contacts.
 */
async function scrapeFastPeopleSearch(listingUrl, diag, phonesOut, emailsOut) {
  const NAME = "FastPeopleSearch";
  const list = await scrapfly(listingUrl, PER_SOURCE_TIMEOUT_MS, { residential: true });
  if (!list.ok) { diag(NAME, list.error || `http_${list.status}`, 0); return; }

  const detailPath = (list.html.match(/href="(\/[a-z0-9-]+_id_[A-Za-z0-9-]+)"/i) || [])[1];
  if (!detailPath) { diag(NAME, "no_detail_record", 0); return; }

  const detail = await scrapfly(
    `https://www.fastpeoplesearch.com${detailPath}`, PER_SOURCE_TIMEOUT_MS, { residential: true },
  );
  if (!detail.ok) { diag(`${NAME}/detail`, detail.error || `http_${detail.status}`, 0); return; }

  const phones = extractPhones(detail.html);
  for (const p of phones) pushPhone(phonesOut, p, NAME);
  const emails = extractEmails(detail.html, "fastpeoplesearch.com");
  for (const e of emails) pushEmail(emailsOut, e, NAME);
  diag(NAME, "ok", phones.length);
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
  // Nationwide free-tier directories — these publish phones AND email
  // addresses without a paywall, so they carry the whole United States rather
  // than one state's registry.
  if (nameSlug) {
    urls.FastPeopleSearch = citySlug && state
      ? `https://www.fastpeoplesearch.com/name/${nameSlug}_${citySlug}-${state.toLowerCase()}`
      : `https://www.fastpeoplesearch.com/name/${nameSlug}`;
    const tt = [firstName, lastName].filter(Boolean).join("-").replace(/\s+/g, "-");
    urls.ThatsThem = citySlug && state
      ? `https://thatsthem.com/name/${tt}/${citySlug}-${state.toUpperCase()}`
      : `https://thatsthem.com/name/${tt}`;
  }
  return urls;
}

const SOURCE_DOMAINS = {
  TruthFinder: "truthfinder.com",
  WhitePages: "whitepages.com",
  Spokeo: "spokeo.com",
  CyberBackgroundChecks: "cyberbackgroundchecks.com",
  FastPeopleSearch: "fastpeoplesearch.com",
  ThatsThem: "thatsthem.com",
};

// Run every people-search source in parallel for one human name.
async function runPeopleSearch({ firstName, lastName, city, state }, diag, phonesOut, emailsOut) {
  const urls = buildUrls({ firstName, lastName, city, state });
  const guard = (pms) =>
    Promise.race([pms, new Promise((resolve) => setTimeout(resolve, TOTAL_BUDGET_MS))]);
  await Promise.all(
    Object.entries(urls).map(([name, url]) =>
      guard(
        name === "FastPeopleSearch"
          ? scrapeFastPeopleSearch(url, diag, phonesOut, emailsOut)
          : scrapeSource(name, url, SOURCE_DOMAINS[name], diag, phonesOut, emailsOut)
      ).catch((e) => diag(name, e.message, 0))
    )
  );
  return Object.keys(urls);
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

    const { owner_name, mailing_address, target_label = "", scip_record_id = null } = (await req.json()) || {};
    if (!owner_name) return Response.json({ error: "owner_name required" }, { status: 400 });

    if (!Deno.env.get("SCRAPFLY_API_KEY")) {
      console.warn(`[CONTACTDATA DIAG] SCRAPFLY_API_KEY missing — cannot scrape.`);
    }

    const { firstName, lastName, isEntity } = parseOwnerName(owner_name);
    const { city, state } = parseAddress(mailing_address || "");

    const diag = (source, result, count) =>
      console.log(`[CONTACTDATA DIAG] source=${source} target=${target_label || "?"} owner="${owner_name}" result=${result} count=${count}`);

    // ── Entity owners (LLC / Trust / Corp) ──────────────────────────────────
    // People-search cannot trace a company. For FLORIDA entities, Sunbiz
    // publishes the registered agent + officers — real humans we can then run
    // through the nationwide people-search pass. Outside Florida there is no
    // registry wired up yet, so the entity stays a dead end (reported honestly,
    // never guessed).
    const entityPhones = [];
    const entityEmails = [];
    let sunbiz = null;
    if (isEntity && (state || "").toUpperCase() === "FL") {
      sunbiz = await sunbizEntityLookup(owner_name, async (url) => {
        const r = await scrapfly(url, PER_SOURCE_TIMEOUT_MS);
        return r.ok ? r.html : "";
      });
      diag("Sunbiz", sunbiz.found ? "ok" : (sunbiz.error || "no_match"), sunbiz.people.length);

      if (sunbiz.found) {
        // Trace the registered agent plus one officer — each name costs a full
        // six-source pass, so the list is capped to keep the step responsive.
        for (const person of sunbiz.people.slice(0, 2)) {
          const p = parseOwnerName(person);
          if (!p.firstName || !p.lastName) continue;
          await runPeopleSearch(
            { firstName: p.firstName, lastName: p.lastName, city, state },
            (src, res, n) => diag(`${src}(via Sunbiz: ${person})`, res, n),
            entityPhones,
            entityEmails,
          );
        }
        const ePhones = aggregate(entityPhones);
        const eEmails = aggregateEmails(entityEmails);
        const eTop = ePhones[0] || null;
        const eTopEmail = eEmails[0] || null;
        diag("AGGREGATE", eTop ? "hit_via_sunbiz" : "no_match", ePhones.length);

        if (scip_record_id) {
          try {
            await base44.entities.ScipRecord.update(scip_record_id, {
              owner_contacts: {
                best_phone: eTop?.phone || null,
                best_email: eTopEmail?.email || null,
                is_entity_owner: true,
                traced_at: new Date().toISOString(),
                phones: ePhones.map((p) => ({ phone: p.phone, display: p.display, sources: p.sources, source_count: p.source_count, mobile: p.mobile })),
                emails: eEmails.map((e) => ({ email: e.email, sources: e.sources, source_count: e.source_count })),
              },
            });
          } catch (e) { console.log(`[CONTACTDATA] persist sunbiz owner_contacts failed: ${e.message}`); }
        }

        return Response.json({
          is_entity_owner: true,
          phone: eTop?.phone || null,
          display: eTop?.display || "",
          source: eTop ? (eTop.source_count > 1 ? `Aggregated: ${eTop.source_count} sources` : eTop.sources[0]) : null,
          source_count: eTop?.source_count || 0,
          phones: ePhones,
          email: eTopEmail?.email || null,
          email_source: eTopEmail ? (eTopEmail.source_count > 1 ? `Aggregated: ${eTopEmail.source_count} sources` : eTopEmail.sources[0]) : null,
          emails: eEmails,
          entity_registry: {
            source: "Sunbiz — Florida Division of Corporations",
            registered_agent: sunbiz.registered_agent,
            officers: sunbiz.officers,
            principal_address: sunbiz.principal_address,
            detail_url: sunbiz.detail_url,
          },
          _meta: { owner_name, target_label, is_entity: true, traced_via: "sunbiz", duration_ms: Date.now() - t0 },
        });
      }
    }

    if (isEntity) {
      diag("entity_gate", sunbiz ? `sunbiz_${sunbiz.error || "no_person"}` : "entity_owner_no_registry", 0);
      if (scip_record_id) {
        try {
          await base44.entities.ScipRecord.update(scip_record_id, {
            owner_contacts: { best_phone: null, best_email: null, is_entity_owner: true, traced_at: new Date().toISOString(), phones: [], emails: [] },
          });
        } catch (e) { console.log(`[CONTACTDATA] persist entity owner_contacts failed: ${e.message}`); }
      }
      return Response.json({
        is_entity_owner: true,
        phone: null, display: "", source: null, source_count: 0, phones: [],
        email: null, email_source: null, emails: [],
        entity_registry: {
          source: (state || "").toUpperCase() === "FL"
            ? "Sunbiz — Florida Division of Corporations"
            : `No business registry wired up for ${state || "this state"} — Sunbiz covers Florida only`,
          registered_agent: null, officers: [], principal_address: null, detail_url: sunbiz?.detail_url || null,
        },
        _meta: { owner_name, target_label, is_entity: true, duration_ms: Date.now() - t0 },
      });
    }

    const phonesFound = [];
    const emailsFound = [];
    const sourcesTried = await runPeopleSearch(
      { firstName, lastName, city, state }, diag, phonesFound, emailsFound,
    );

    const phones = aggregate(phonesFound);
    const top = phones[0] || null;
    const emails = aggregateEmails(emailsFound);
    const topEmail = emails[0] || null;

    diag("AGGREGATE", top ? "hit" : "no_match", phones.length);
    diag("AGGREGATE_EMAIL", topEmail ? "hit" : "no_email", emails.length);

    if (scip_record_id) {
      try {
        await base44.entities.ScipRecord.update(scip_record_id, {
          owner_contacts: {
            best_phone: top?.phone || null,
            best_email: topEmail?.email || null,
            is_entity_owner: false,
            traced_at: new Date().toISOString(),
            phones: phones.map((p) => ({ phone: p.phone, display: p.display, sources: p.sources, source_count: p.source_count, mobile: p.mobile })),
            emails: emails.map((e) => ({ email: e.email, sources: e.sources, source_count: e.source_count })),
          },
        });
        diag("PERSIST", "owner_contacts", phones.length);
      } catch (e) { console.log(`[CONTACTDATA] persist owner_contacts failed: ${e.message}`); }
    }

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
        sources_tried: sourcesTried,
        total_found: phonesFound.length,
        duration_ms: Date.now() - t0,
      },
    });
  } catch (error) {
    console.log(`[CONTACTDATA DIAG] fatal error=${error.message}`);
    return Response.json({ is_entity_owner: false, phone: null, display: "", source: null, source_count: 0, phones: [], emails: [], _meta: { error: error.message } });
  }
});