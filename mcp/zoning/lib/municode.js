/**
 * municode.js
 * Municode Library ordinance lookup — via the REAL public JSON API (api.municode.com).
 *
 * Flow:
 *  1. Clients/stateAbbr?stateAbbr=XX          → find municipality ClientID
 *  2. ClientContent/{clientId}                → product list (prefer a "Zoning" product)
 *  3. Jobs/latest/{productId}                 → latest published jobId
 *  4. codesToc?jobId&productId                → top-level TOC, find zoning title
 *  5. codesToc/children?jobId&nodeId&productId→ walk down to the district section
 *  6. CodesContent?jobId&nodeId&productId     → section HTML (Docs[].Content)
 *  7. parseOrdinanceHtml()                    → structured ordinance data
 *
 * All endpoints are unauthenticated JSON used by library.municode.com's own UI.
 * NOTE: not every municipality publishes its zoning ordinance on Municode
 * (e.g. Milford *Village*, MI keeps zoning on Clearzoning) — a null return
 * here means "not on Municode", and the engine falls through to AmLegal.
 */

import { parseOrdinanceHtml } from './parser.js';

const API  = 'https://api.municode.com';
const LIB  = 'https://library.municode.com';
const UA   = 'Mozilla/5.0 (compatible; SiteHawk-Zoning/1.1; +https://github.com/TomH59-AI/sitehawk)';

const ZONING_KEYWORDS   = ['zoning', 'land development', 'land use', 'unified development'];
const clientListCache    = new Map(); // stateAbbr → clients[]

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Find a municipality in Municode by place name + state abbreviation.
 * @param {string} placeName  - e.g. "Milford", "Milford Charter Township, MI"
 * @param {string} stateAbbr  - e.g. "MI"
 * @returns {Promise<{clientId:number,id:number,name:string,stateAbbr:string}|null>}
 */
export async function findMunicipality(placeName, stateAbbr) {
  const st = String(stateAbbr || '').toUpperCase().trim();
  if (!st) return null;

  let clients = clientListCache.get(st);
  if (!clients) {
    const res = await mcFetch(`${API}/Clients/stateAbbr?stateAbbr=${st}`);
    if (!res.ok) { console.warn(`[municode] client list HTTP ${res.status}`); return null; }
    clients = await res.json().catch(() => null);
    if (!Array.isArray(clients)) return null;
    clientListCache.set(st, clients);
  }

  // Normalize: drop trailing ", MI", "village of", parenthetical county
  const norm = String(placeName || '')
    .replace(new RegExp(`,\\s*${st}\\s*$`, 'i'), '')
    .replace(/\b(village|city|town|charter township|township) of\b/gi, '')
    .trim().toLowerCase();
  if (!norm) return null;

  const cleanName = (c) => c.ClientName.replace(/\(.*?\)/g, '').replace(/,/g, '').trim().toLowerCase();

  const best =
    clients.find(c => cleanName(c) === norm) ??
    clients.find(c => cleanName(c).startsWith(norm)) ??
    clients.find(c => cleanName(c).includes(norm) || norm.includes(cleanName(c)));

  if (!best) return null;
  return { clientId: best.ClientID, id: best.ClientID, name: best.ClientName, stateAbbr: st };
}

/**
 * Fetch full zoning ordinance details for a district code from Municode.
 * @param {number|string} clientId
 * @param {string} districtCode - e.g. "R-2"
 * @returns {Promise<object|null>}
 */
export async function fetchZoningOrdinance(clientId, districtCode) {
  // 2. Products for this client — prefer an explicit Zoning product
  const contentRes = await mcFetch(`${API}/ClientContent/${clientId}`);
  if (!contentRes.ok) { console.warn(`[municode] ClientContent HTTP ${contentRes.status}`); return null; }
  const content = await contentRes.json().catch(() => null);
  const codes = content?.codes ?? [];
  if (!codes.length) return null;
  const product = codes.find(p => /zoning/i.test(p.productName)) ?? codes[0];

  // 3. Latest published job
  const jobRes = await mcFetch(`${API}/Jobs/latest/${product.productId}`);
  if (!jobRes.ok) return null;
  const job = await jobRes.json().catch(() => null);
  if (!job?.Id) return null;

  // 4. Top-level TOC → zoning title
  const tocRes = await mcFetch(`${API}/codesToc?jobId=${job.Id}&productId=${product.productId}`);
  if (!tocRes.ok) return null;
  const toc = await tocRes.json().catch(() => null);
  const topNodes = toc?.Children ?? [];

  const zoningNode = /zoning/i.test(product.productName)
    ? null // whole product is the zoning ordinance — search from the root
    : topNodes.find(n => ZONING_KEYWORDS.some(kw => (n.Heading ?? '').toLowerCase().includes(kw)));

  if (!zoningNode && !/zoning/i.test(product.productName)) {
    console.warn(`[municode] no zoning title found for clientId=${clientId} (product "${product.productName}")`);
    return null;
  }

  // 5. Walk the tree for the district section
  const startNodes = zoningNode ? [zoningNode] : topNodes;
  const section = await findDistrictSection(job.Id, product.productId, startNodes, districtCode);
  if (!section) {
    console.warn(`[municode] district "${districtCode}" not found under zoning title (clientId=${clientId})`);
    return null;
  }

  // 6. Section HTML
  const html = await fetchSectionContent(job.Id, product.productId, section.Id);
  if (!html) return null;

  // 7. Parse
  const parsed = parseOrdinanceHtml(html, districtCode);

  return {
    districtCode,
    name:         sectionDistrictName(section.Heading, districtCode) ?? parsed?.name ?? null,
    ordinanceUrl: `${LIB}/#nodeId=${section.Id}`,
    rawHtml:      html,
    ...parsed,
    source:       `municode:${clientId}:${section.Id}`,
  };
}

/**
 * List permitted uses for a district (derived from the parsed ordinance section).
 */
export async function fetchPermittedUses(clientId, districtCode) {
  const ordinance = await fetchZoningOrdinance(clientId, districtCode);
  if (!ordinance) return null;
  return {
    permitted:   ordinance.permitted   ?? [],
    conditional: ordinance.conditional ?? [],
    prohibited:  ordinance.prohibited  ?? [],
    source:      ordinance.source,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Breadth-first walk of the TOC (children fetched on demand) for the district. */
async function findDistrictSection(jobId, productId, startNodes, districtCode, maxDepth = 4) {
  const codeRe = districtTokenRegex(districtCode);
  let frontier = [...startNodes];

  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    // Any node at this level whose heading names the district directly?
    const direct = frontier.find(n => codeRe.test(n.Heading ?? ''));
    if (direct && !direct.HasChildren) return direct;
    if (direct) { frontier = [direct]; } // narrow to it and descend

    const next = [];
    for (const node of frontier) {
      if (!node.HasChildren) continue;
      // Only descend into plausible branches to keep requests bounded
      const h = (node.Heading ?? '').toLowerCase();
      const plausible = depth === 0 || direct === node ||
        codeRe.test(node.Heading ?? '') ||
        ['district', 'zoning', 'use', 'schedule', 'regulation', 'article', 'division']
          .some(kw => h.includes(kw));
      if (!plausible) continue;

      const res = await mcFetch(`${API}/codesToc/children?jobId=${jobId}&nodeId=${node.Id}&productId=${productId}`);
      if (!res.ok) continue;
      const kids = await res.json().catch(() => []);
      if (Array.isArray(kids)) next.push(...kids);
    }

    const hit = next.find(n => codeRe.test(n.Heading ?? '') && !n.HasChildren);
    if (hit) return hit;
    frontier = next;
  }
  return null;
}

async function fetchSectionContent(jobId, productId, nodeId) {
  const res = await mcFetch(`${API}/CodesContent?jobId=${jobId}&nodeId=${nodeId}&productId=${productId}`);
  if (!res.ok) { console.warn(`[municode] content HTTP ${res.status}`); return null; }
  const data = await res.json().catch(() => null);
  const docs = data?.Docs ?? [];
  if (!docs.length) return null;
  return docs.map(d => `${d.TitleHtml ?? ''}\n${d.Content ?? ''}`).join('\n');
}

/** e.g. "R-2" → /\bR[-–]?2\b/i — tolerant of dash variants and spacing. */
function districtTokenRegex(code) {
  const esc = code.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-\s]+/g, '[-–\\s]?');
  return new RegExp(`(^|[^A-Za-z0-9])${esc}($|[^A-Za-z0-9])`, 'i');
}

/** "Sec. 32-31.4. - R-2 Multiple-Family Residential." → "R-2 Multiple-Family Residential" */
function sectionDistrictName(heading, code) {
  if (!heading) return null;
  const idx = heading.toUpperCase().indexOf(code.toUpperCase());
  if (idx === -1) return null;
  return heading.slice(idx).replace(/\.$/, '').trim() || null;
}

async function mcFetch(url, ms = 20_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
