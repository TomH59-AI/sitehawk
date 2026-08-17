/**
 * municode.js
 * Municode Library (library.municode.com) ordinance lookup.
 *
 * Flow:
 *  1. Search for the municipality by place name + state
 *  2. Find the "Zoning" or "Land Development" title/chapter
 *  3. Fetch the relevant section for the district code
 *  4. Return structured ordinance data
 *
 * Municode does not publish an official public API, but their site
 * exposes JSON endpoints used by the browser UI. These are stable
 * enough for caching-first usage (cache TTL = 90 days by default).
 */

import { parseOrdinanceHtml } from './parser.js';

const MUNICODE_BASE = 'https://library.municode.com';
const UA = 'SiteHawk-Zoning/1.0 (+https://github.com/TomH59-AI/sitehawk)';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Find a municipality in Municode by place name + state abbreviation.
 *
 * @param {string} placeName  - e.g. "Milford"
 * @param {string} stateAbbr  - e.g. "MI"
 * @returns {Promise<MuniEntry|null>}
 */
export async function findMunicipality(placeName, stateAbbr) {
  const query = encodeURIComponent(`${placeName} ${stateAbbr}`);
  const url   = `${MUNICODE_BASE}/api/search/municipalities?term=${query}&limit=5`;

  const res = await mcFetch(url);
  if (!res.ok) {
    console.warn(`[municode] municipality search HTTP ${res.status}`);
    return null;
  }

  const items = await res.json();
  if (!Array.isArray(items) || items.length === 0) return null;

  // Pick best match: exact place name + state
  const norm   = placeName.toLowerCase().trim();
  const normSt = stateAbbr.toUpperCase();

  const best = items.find(m =>
    m.stateName?.toUpperCase().startsWith(normSt) &&
    m.name?.toLowerCase().includes(norm)
  ) ?? items[0];

  return best ?? null;
}

/**
 * Fetch full zoning ordinance details for a district code from Municode.
 *
 * @param {string} clientId    - Municode client/municipality ID
 * @param {string} districtCode
 * @returns {Promise<OrdinanceResult|null>}
 */
export async function fetchZoningOrdinance(clientId, districtCode) {
  // 1. Get the table of contents
  const toc = await fetchTOC(clientId);
  if (!toc) return null;

  // 2. Find the zoning title
  const zoningNode = findZoningTitle(toc);
  if (!zoningNode) {
    console.warn(`[municode] no zoning title found for clientId=${clientId}`);
    return null;
  }

  // 3. Search within zoning title for the district
  const section = await findDistrictSection(clientId, zoningNode.id, districtCode);
  if (!section) return null;

  // 4. Fetch and parse the section HTML
  const html = await fetchSectionContent(clientId, section.id);
  if (!html) return null;

  const parsed = parseOrdinanceHtml(html, districtCode);

  return {
    districtCode,
    ordinanceUrl: `${MUNICODE_BASE}/${clientId}/codes/${zoningNode.parentId ?? zoningNode.id}?nodeId=${section.id}`,
    rawHtml:      html,
    ...parsed,
    source:       `municode:${clientId}`,
  };
}

/**
 * List permitted uses for a district by scraping the use table from Municode.
 *
 * @param {string} clientId
 * @param {string} districtCode
 * @returns {Promise<UseMatrix|null>}
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

async function fetchTOC(clientId) {
  const url = `${MUNICODE_BASE}/api/products/${clientId}/codes/toc?levelsDeep=3`;
  const res = await mcFetch(url);
  if (!res.ok) { console.warn(`[municode] TOC HTTP ${res.status}`); return null; }
  return res.json().catch(() => null);
}

function findZoningTitle(toc) {
  const nodes = toc?.children ?? toc?.nodes ?? (Array.isArray(toc) ? toc : []);
  const ZONING_KEYWORDS = ['zoning', 'land development', 'land use', 'planning and zoning'];

  for (const node of nodes) {
    const title = (node.heading ?? node.name ?? '').toLowerCase();
    if (ZONING_KEYWORDS.some(kw => title.includes(kw))) return node;
    // Recurse one level
    const child = findZoningTitle(node);
    if (child) return child;
  }
  return null;
}

async function findDistrictSection(clientId, zoningNodeId, districtCode) {
  const url = `${MUNICODE_BASE}/api/products/${clientId}/codes/${zoningNodeId}/toc`;
  const res = await mcFetch(url);
  if (!res.ok) return null;

  const toc = await res.json().catch(() => null);
  if (!toc) return null;

  const code = districtCode.replace(/[-–]/g, '').toLowerCase();
  const nodes = flattenTOC(toc);

  return nodes.find(n => {
    const h = (n.heading ?? n.name ?? '').toLowerCase().replace(/[-–\s]/g, '');
    return h.includes(code) || h.includes(`district${code}`) || h.includes(`zone${code}`);
  }) ?? null;
}

async function fetchSectionContent(clientId, nodeId) {
  const url = `${MUNICODE_BASE}/api/products/${clientId}/codes/${nodeId}/sections/html`;
  const res = await mcFetch(url);
  if (!res.ok) { console.warn(`[municode] section HTML HTTP ${res.status}`); return null; }
  return res.text().catch(() => null);
}

function flattenTOC(node, acc = []) {
  if (Array.isArray(node)) { node.forEach(n => flattenTOC(n, acc)); return acc; }
  if (node?.id) acc.push(node);
  const kids = node?.children ?? node?.nodes ?? [];
  kids.forEach(k => flattenTOC(k, acc));
  return acc;
}

async function mcFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @typedef {{ id: string, name: string, stateName: string, clientId: string }} MuniEntry
 * @typedef {{ districtCode: string, name: string, description: string, setbacks: object,
 *             maxHeight: number, maxFAR: number, permitted: string[], conditional: string[],
 *             prohibited: string[], ordinanceUrl: string, source: string }} OrdinanceResult
 * @typedef {{ permitted: string[], conditional: string[], prohibited: string[], source: string }} UseMatrix
 */


