/*
 * ============================================================================
 *  SUNBIZ ENTITY LOOKUP — Florida Division of Corporations (sunbiz.org)
 * ----------------------------------------------------------------------------
 *  Purpose: when a parcel's owner is a business entity (LLC / Trust / Corp),
 *  people-search services cannot trace it. Sunbiz publishes the entity's
 *  REGISTERED AGENT and AUTHORIZED PERSONS / OFFICERS — real human names plus a
 *  mailing address. Those human names are fed back into the nationwide
 *  people-search pass, so an entity-owned parcel is no longer a dead end.
 *
 *  SCOPE LIMIT — FLORIDA ONLY. Sunbiz holds no out-of-state entities. Callers
 *  must gate on state === "FL"; every other state needs its own Secretary of
 *  State registry (not implemented here).
 *
 *  NAME-ORDER HANDLING (this is the subtle part):
 *    - The "Authorized Person(s) Detail" block is reliably "LAST, FIRST",
 *      e.g. "PIERZCHAJLO, RICHARD DR 1489 KENNEDY RD".
 *    - The "Registered Agent" field is FREE TEXT typed by the filer and is
 *      often reversed, e.g. "Melissa, Pierzchajlo".
 *    So officer surnames are collected first and used to decide which token of
 *    the agent name is the surname. If neither token matches, we fall back to
 *    the documented "LAST, FIRST" convention rather than guessing.
 *
 *  NOTHING IS FABRICATED. No matching entity, or no parseable person, returns
 *  empty arrays with a reason.
 *
 *  Scraped through Scrapfly (ASP + JS render), two hops:
 *    1. Entity-name search results → first result's detail link
 *    2. Detail page → registered agent, officers, principal/mailing address
 * ============================================================================
 */

const SUNBIZ_ORIGIN = "https://search.sunbiz.org";

// Honorifics / generational suffixes Sunbiz appends to officer names.
const SUFFIX = /\b(DR|MR|MRS|MS|MISS|JR|SR|I{1,3}|IV|V|ESQ|PHD|MD|CPA|TRUSTEE|PRES|VP)\b\.?/gi;

// Tokens that prove a line is not a person's name.
const NOT_A_PERSON =
  /\b(LLC|L\.L\.C|INC|CORP|CORPORATION|TRUST|LP|LLP|LTD|COMPANY|CO\.|HOLDINGS|PROPERTIES|PARTNERS|GROUP|SERVICES|BANK|REGISTERED|AGENT|TITLE|MGR|MGRM|AMBR|PRESIDENT|OFFICER|DIRECTOR|SECRETARY|TREASURER|AUTHORIZED|MEMBER|MANAGER|ADDRESS|CHANGED|NAME|DETAIL|NONE)\b/i;

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|td|th|li|span)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ");
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function cleanToken(t: string): string {
  return String(t || "").replace(SUFFIX, "").replace(/[^A-Za-z'\-]/g, "").trim();
}

type NamePair = { first: string; last: string };

/**
 * Pull the text block that follows a labelled Sunbiz heading.
 */
function blockAfter(text: string, labelRx: RegExp, chars = 900): string {
  const m = text.match(labelRx);
  if (!m || m.index === undefined) return "";
  return text.slice(m.index + m[0].length, m.index + m[0].length + chars);
}

/**
 * Officer lines: "LAST, FIRST [SUFFIX] [street address...]".
 * The address is discarded — only the two name tokens are kept.
 */
function parseOfficerNames(block: string): NamePair[] {
  const out: NamePair[] = [];
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // "TIFTON, GA 31794" is a city/state/ZIP line, not a person.
    if (/,\s*[A-Za-z]{2}\.?\s+\d{5}/.test(trimmed)) continue;
    const m = trimmed.match(/^([A-Za-z][A-Za-z'\-]{1,24}),\s*([A-Za-z][A-Za-z'\-]{1,24})\b/);
    if (!m) continue;
    // A bare 2-letter token is a state abbreviation, never a given name.
    if (m[2].replace(/\./g, "").length === 2) continue;
    const last = cleanToken(m[1]);
    const first = cleanToken(m[2]);
    if (!last || !first) continue;
    if (NOT_A_PERSON.test(last) || NOT_A_PERSON.test(first)) continue;
    if (out.some((o) => o.first === first && o.last === last)) continue;
    out.push({ first, last });
  }
  return out;
}

/**
 * Registered-agent line — free text, order unreliable. `knownSurnames` comes
 * from the officer block and decides which token is the surname.
 */
function parseAgentName(block: string, knownSurnames: Set<string>): NamePair | null {
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || /\d/.test(trimmed)) continue; // address lines carry digits
    if (NOT_A_PERSON.test(trimmed)) continue;

    const parts = trimmed.split(/,|\s+/).map(cleanToken).filter(Boolean);
    if (parts.length < 2 || parts.length > 4) continue;

    const a = parts[0];
    const b = parts[parts.length - 1];
    const aIsSurname = knownSurnames.has(a.toUpperCase());
    const bIsSurname = knownSurnames.has(b.toUpperCase());

    if (bIsSurname && !aIsSurname) return { first: a, last: b };
    if (aIsSurname && !bIsSurname) return { first: b, last: a };
    // No officer cross-reference available — Sunbiz's documented order is
    // "LAST, FIRST" when a comma is present, otherwise "FIRST LAST".
    return trimmed.includes(",") ? { first: b, last: a } : { first: a, last: b };
  }
  return null;
}

/** Address block — returned verbatim, never synthesized. */
function parseAddress(block: string): string | null {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^(changed|name changed|address changed)\b/i.test(l));
  const zipIdx = lines.findIndex((l) => /\b[A-Z]{2},?\s+\d{5}\b/i.test(l));
  if (zipIdx < 0) return null;
  return lines
    .slice(0, zipIdx + 1)
    .join(", ")
    .replace(/\s*,\s*,+/g, ", ")
    .slice(0, 200) || null;
}

export type SunbizResult = {
  found: boolean;
  entity_name: string | null;
  detail_url: string | null;
  registered_agent: string | null;
  officers: string[];
  /** Distinct human names, "First Last", registered agent first. */
  people: string[];
  principal_address: string | null;
  error?: string;
};

const EMPTY: SunbizResult = {
  found: false,
  entity_name: null,
  detail_url: null,
  registered_agent: null,
  officers: [],
  people: [],
  principal_address: null,
};

/**
 * Look up a Florida entity on Sunbiz and return its real human contacts.
 *
 * @param entityName  Owner name straight off the parcel record.
 * @param fetchHtml   Scrapfly-backed fetcher: (url) => html ("" on failure).
 */
export async function sunbizEntityLookup(
  entityName: string,
  fetchHtml: (url: string) => Promise<string>,
): Promise<SunbizResult> {
  const name = String(entityName || "").trim();
  if (!name) return { ...EMPTY, error: "no_entity_name" };

  const searchUrl =
    `${SUNBIZ_ORIGIN}/Inquiry/CorporationSearch/SearchResults` +
    `?inquiryType=EntityName&searchTerm=${encodeURIComponent(name)}`;

  const searchHtml = await fetchHtml(searchUrl);
  if (!searchHtml) return { ...EMPTY, error: "search_page_unavailable" };

  const linkMatch = searchHtml.match(
    /href="(\/Inquiry\/CorporationSearch\/SearchResultDetail\?[^"]+)"/i,
  );
  if (!linkMatch) return { ...EMPTY, error: "no_matching_entity" };

  const detailUrl = SUNBIZ_ORIGIN + linkMatch[1].replace(/&amp;/g, "&");
  const detailHtml = await fetchHtml(detailUrl);
  if (!detailHtml) return { ...EMPTY, detail_url: detailUrl, error: "detail_page_unavailable" };

  const text = stripTags(detailHtml);

  const officerPairs = parseOfficerNames(
    blockAfter(text, /Authorized Person\(s\) Detail|Officer\/?Director Detail/i, 1400),
  );
  const surnames = new Set(officerPairs.map((o) => o.last.toUpperCase()));
  const agentPair = parseAgentName(
    blockAfter(text, /Registered Agent Name\s*&?\s*Address/i, 400),
    surnames,
  );

  const fmt = (p: NamePair) => titleCase(`${p.first} ${p.last}`);
  const registered_agent = agentPair ? fmt(agentPair) : null;
  const officers = officerPairs.map(fmt).filter((o) => o !== registered_agent);

  const people: string[] = [];
  for (const p of [registered_agent, ...officers]) {
    if (p && !people.includes(p)) people.push(p);
  }

  const principal_address =
    parseAddress(blockAfter(text, /Principal Address/i, 300)) ||
    parseAddress(blockAfter(text, /Mailing Address/i, 300));

  return {
    found: people.length > 0,
    entity_name: name,
    detail_url: detailUrl,
    registered_agent,
    officers,
    people: people.slice(0, 6),
    principal_address,
    error: people.length ? undefined : "no_person_published",
  };
}