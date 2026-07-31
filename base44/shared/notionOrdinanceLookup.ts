/**
 * notionOrdinanceLookup — pull telecom ordinance data for a jurisdiction from
 * the Notion zoning knowledge base (pages titled "{Jurisdiction}, {ST} — Telecom
 * Ordinance", archived by Ordinance Hunter under NOTION_MASTER_ZONING_PAGE_ID).
 *
 * Returns only what the page explicitly states — numeric fields are extracted
 * with conservative patterns and left null when the language is ambiguous.
 * Never fabricates.
 */
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

async function notionFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function blockText(blk: any): string {
  const rt = blk?.[blk?.type]?.rich_text;
  return Array.isArray(rt) ? rt.map((t: any) => t?.plain_text || "").join("") : "";
}

// Conservative numeric extraction — only match when the label and "ft" are explicit.
function pickFt(text: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && Number.isFinite(Number(m[1]))) return Number(m[1]);
  }
  return null;
}

export async function lookupNotionOrdinance(token: string, jurisdiction: string, state: string) {
  if (!token || !jurisdiction || !state) return null;

  const st = String(state).toUpperCase();
  const query = `${jurisdiction}, ${st} — Telecom Ordinance`;
  const search = await notionFetch("/search", token, {
    method: "POST",
    body: JSON.stringify({ query: `${jurisdiction} Telecom Ordinance`, filter: { property: "object", value: "page" }, page_size: 10 }),
  });
  if (!search.ok) return null;

  const norm = (s: string) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const wanted = norm(query);
  const jNorm = norm(jurisdiction);
  const pages = (search.data?.results || []).map((p: any) => {
    const props = p.properties || {};
    let title = "";
    for (const k of Object.keys(props)) {
      if (props[k]?.type === "title") title = (props[k].title || []).map((t: any) => t.plain_text).join("");
    }
    return { id: p.id, url: p.url, title };
  });
  const page =
    pages.find((p: any) => norm(p.title) === wanted) ||
    pages.find((p: any) => norm(p.title).includes(jNorm) && norm(p.title).includes(norm(st)) && norm(p.title).includes("TELECOMORDINANCE"));
  if (!page) return null;

  const blocks = await notionFetch(`/blocks/${page.id}/children?page_size=100`, token);
  if (!blocks.ok) return { page_url: page.url, title: page.title, summary: null };
  const text = (blocks.data?.results || []).map(blockText).filter(Boolean).join("\n");

  // Only extract a number when it directly follows the label (e.g. "Tower
  // Height Limit: 65 ft"). Formula language ("+2 ft setback per 1 ft of
  // height") deliberately does NOT match — stays null for human review.
  const height_limit_ft = pickFt(text, [
    /(?:tower\s+)?height\s+limit\s*[:=]?\s*(\d{2,4})\s*(?:ft|feet)/i,
    /max(?:imum)?\s+(?:tower\s+)?height\s*[:=]?\s*(\d{2,4})\s*(?:ft|feet)/i,
    /towers?\s+(?:shall|may)\s+not\s+exceed\s*(\d{2,4})\s*(?:ft|feet)/i,
  ]);
  const setback_ft = pickFt(text, [/setbacks?\s*(?:[:=]|of|is|at\s+least|minimum(?:\s+of)?)\s*(\d{1,4})\s*(?:ft|feet)/i]);
  const fall_zone_ft = pickFt(text, [/fall[\s-]?zone\s*(?:[:=]|of|is|at\s+least|minimum(?:\s+of)?)\s*(\d{1,4})\s*(?:ft|feet)/i]);

  const codeSection = (text.match(/(?:Code section|LDC Sections?)\s*:\s*(.{1,120})/i) || [])[1]?.trim() || null;
  const summaryPara = text.split("\n").find((l) => l.length > 60) || null;

  return {
    page_url: page.url,
    title: page.title,
    summary: summaryPara,
    section_ref: codeSection,
    height_limit_ft,
    setback_ft,
    fall_zone_ft,
  };
}