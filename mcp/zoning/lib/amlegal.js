/**
 * amlegal.js
 * American Legal (codelibrary.amlegal.com) ordinance lookup — fallback
 * when Municode does not carry the municipality.
 *
 * AmLegal exposes a public search API and serves ordinance HTML
 * from their code library. Used as a secondary source after Municode.
 */

import { parseOrdinanceHtml } from './parser.js';

const AMLEGAL_BASE = 'https://codelibrary.amlegal.com';
const UA = 'SiteHawk-Zoning/1.0 (+https://github.com/TomH59-AI/sitehawk)';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Search for a municipality on AmLegal.
 *
 * @param {string} placeName  - e.g. "Detroit"
 * @param {string} stateAbbr  - e.g. "MI"
 * @returns {Promise<AmLegalEntry|null>}
 */
export async function findMunicipality(placeName, stateAbbr) {
  const query = encodeURIComponent(placeName);
  const url   = `${AMLEGAL_BASE}/api/library/search?term=${query}&state=${stateAbbr.toLowerCase()}&limit=5`;

  const res = await alFetch(url);
  if (!res.ok) {
    // AmLegal returns 404 for no results — treat gracefully
    console.warn(`[amlegal] municipality search HTTP ${res.status}`);
    return null;
  }

  const data = await res.json().catch(() => null);
  const items = data?.results ?? (Array.isArray(data) ? data : []);
  if (items.length === 0) return null;

  const norm = placeName.toLowerCase().trim();
  const best = items.find(m =>
    m.name?.toLowerCase().includes(norm)
  ) ?? items[0];

  return best ?? null;
}

/**
 * Fetch zoning ordinance details for a district code from AmLegal.
 *
 * @param {string} codeId      - AmLegal code/municipality identifier
 * @param {string} districtCode
 * @returns {Promise<OrdinanceResult|null>}
 */
export async function fetchZoningOrdinance(codeId, districtCode) {
  // 1. Get the table of contents
  const toc = await fetchTOC(codeId);
  if (!toc) return null;

  // 2. Find zoning title
  const zoningNode = findZoningTitle(toc);
  if (!zoningNode) {
    console.warn(`[amlegal] no zoning title in TOC for codeId=${codeId}`);
    return null;
  }

  // 3. Search within the zoning title for the district section
  const section = await findDistrictSection(codeId, zoningNode.id, districtCode);
  if (!section) return null;

  // 4. Fetch section HTML
  const html = await fetchSectionHTML(codeId, section.id);
  if (!html) return null;

  const parsed = parseOrdinanceHtml(html, districtCode);

  return {
    districtCode,
    ordinanceUrl: `${AMLEGAL_BASE}/codes/${codeId}#!${section.id}`,
    rawHtml:      html,
    ...parsed,
    source:       `amlegal:${codeId}`,
  };
}

/**
 * List permitted uses for a district from AmLegal.
 */
export async function fetchPermittedUses(codeId, districtCode) {
  const ordinance = await fetchZoningOrdinance(codeId, districtCode);
  if (!ordinance) return null;
  return {
    permitted:   ordinance.permitted   ?? [],
    conditional: ordinance.conditional ?? [],
    prohibited:  ordinance.prohibited  ?? [],
    source:      ordinance.source,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function fetchTOC(codeId) {
  const url = `${AMLEGAL_BASE}/api/codes/${codeId}/toc`;
  const res = await alFetch(url);
  if (!res.ok) { console.warn(`[amlegal] TOC HTTP ${res.status}`); return null; }
  return res.json().catch(() => null);
}

function findZoningTitle(toc) {
  const nodes = toc?.items ?? toc?.children ?? (Array.isArray(toc) ? toc : []);
  const KEYWORDS = ['zoning', 'land development', 'land use', 'planning'];

  for (const node of nodes) {
    const title = (node.title ?? node.name ?? node.heading ?? '').toLowerCase();
    if (KEYWORDS.some(kw => title.includes(kw))) return node;
    const child = findZoningTitle({ items: node.children ?? node.items ?? [] });
    if (child) return child;
  }
  return null;
}

async function findDistrictSection(codeId, nodeId, districtCode) {
  const url = `${AMLEGAL_BASE}/api/codes/${codeId}/toc/${nodeId}`;
  const res = await alFetch(url);
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  if (!data)  return null;

  const code  = districtCode.replace(/[-–]/g, '').toLowerCase();
  const nodes = flattenNodes(data);

  return nodes.find(n => {
    const title = (n.title ?? n.name ?? n.heading ?? '').toLowerCase().replace(/[-–\s]/g, '');
    return title.includes(code) || title.includes(`district${code}`);
  }) ?? null;
}

async function fetchSectionHTML(codeId, nodeId) {
  const url = `${AMLEGAL_BASE}/api/codes/${codeId}/sections/${nodeId}/html`;
  const res = await alFetch(url);
  if (!res.ok) { console.warn(`[amlegal] section HTML HTTP ${res.status}`); return null; }
  return res.text().catch(() => null);
}

function flattenNodes(node, acc = []) {
  if (Array.isArray(node)) { node.forEach(n => flattenNodes(n, acc)); return acc; }
  if (node?.id) acc.push(node);
  const kids = node?.children ?? node?.items ?? [];
  kids.forEach(k => flattenNodes(k, acc));
  return acc;
}

async function alFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json, text/html' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @typedef {{ id: string, name: string, state: string }} AmLegalEntry
 */


