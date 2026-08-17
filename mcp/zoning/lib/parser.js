/**
 * parser.js
 * Parses raw ordinance HTML from Municode / AmLegal into structured data.
 *
 * Extracts:
 *  - District name and description
 *  - Setbacks (front, rear, side) in feet
 *  - Max building height (feet)
 *  - Max FAR (floor area ratio)
 *  - Min lot size (sq ft)
 *  - Permitted / Conditional / Prohibited use tables
 */

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse ordinance HTML into structured zoning data.
 *
 * @param {string} html
 * @param {string} districtCode
 * @returns {ParsedOrdinance}
 */
export function parseOrdinanceHtml(html, districtCode) {
  const text = stripTags(html);

  return {
    name:        extractDistrictName(text, districtCode),
    description: extractDescription(text),
    setbacks:    extractSetbacks(text),
    maxHeight:   extractMaxHeight(text),
    maxFAR:      extractMaxFAR(text),
    minLotSize:  extractMinLotSize(text),
    ...extractUseMatrix(html, text),
  };
}

// ── Extractors ────────────────────────────────────────────────────────────────

function extractDistrictName(text, code) {
  // e.g. "R-1 Single-Family Residential District" or "C-2 General Commercial"
  const patterns = [
    new RegExp(`${escRe(code)}[\\s–-]+([A-Z][A-Za-z ,-]{5,60})`, 'i'),
    /(?:district|zone)[:\s]+([A-Z][A-Za-z ,-]{5,60})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim().replace(/\.$/, '');
  }
  return `${code} Zoning District`;
}

function extractDescription(text) {
  // Purpose / intent paragraph (usually first paragraph after the section header)
  const m = text.match(/(?:purpose|intent|district is intended)[:\s.]+([^.]{40,400}\.)/i);
  return m?.[1]?.trim() ?? null;
}

function extractSetbacks(text) {
  const setbacks = {};

  const patterns = {
    front: [/front\s+(?:yard\s+)?setback[:\s]+(\d+(?:\.\d+)?)\s*(?:feet|ft|')/i,
            /minimum\s+front\s+yard[:\s]+(\d+(?:\.\d+)?)/i],
    rear:  [/rear\s+(?:yard\s+)?setback[:\s]+(\d+(?:\.\d+)?)\s*(?:feet|ft|')/i,
            /minimum\s+rear\s+yard[:\s]+(\d+(?:\.\d+)?)/i],
    side:  [/side\s+(?:yard\s+)?setback[:\s]+(\d+(?:\.\d+)?)\s*(?:feet|ft|')/i,
            /minimum\s+side\s+yard[:\s]+(\d+(?:\.\d+)?)/i],
  };

  for (const [key, pats] of Object.entries(patterns)) {
    for (const re of pats) {
      const m = text.match(re);
      if (m?.[1]) { setbacks[key] = parseFloat(m[1]); break; }
    }
  }

  return Object.keys(setbacks).length ? setbacks : null;
}

function extractMaxHeight(text) {
  const patterns = [
    /maximum\s+(?:building\s+)?height[:\s]+(\d+(?:\.\d+)?)\s*(?:feet|ft|')/i,
    /height\s+limit[:\s]+(\d+(?:\.\d+)?)\s*(?:feet|ft|')/i,
    /(?:not\s+exceed|shall\s+not\s+exceed)\s+(\d+(?:\.\d+)?)\s*(?:feet|ft)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return parseFloat(m[1]);
  }
  return null;
}

function extractMaxFAR(text) {
  const m = text.match(/(?:floor\s+area\s+ratio|FAR)[:\s]+(\d+(?:\.\d+)?)/i);
  return m?.[1] ? parseFloat(m[1]) : null;
}

function extractMinLotSize(text) {
  const patterns = [
    /minimum\s+lot\s+(?:area|size)[:\s]+(\d[\d,]*)\s*(?:square\s+feet|sq\.?\s*ft)/i,
    /lot\s+area[:\s]+(\d[\d,]*)\s*(?:square\s+feet|sq\.?\s*ft)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return parseInt(m[1].replace(/,/g, ''), 10);
  }
  return null;
}

// ── Use matrix extraction ─────────────────────────────────────────────────────

const USE_KEYWORDS = {
  permitted:   ['permitted use', 'uses permitted', 'allowed by right', 'principal permitted'],
  conditional: ['conditional use', 'special use', 'special exception', 'uses permitted by'],
  prohibited:  ['prohibited use', 'not permitted', 'shall not be permitted'],
};

function extractUseMatrix(html, text) {
  const result = { permitted: [], conditional: [], prohibited: [] };

  // Strategy 1: parse HTML table rows (Municode / AmLegal often use tables)
  const tableUses = extractFromTable(html);
  if (tableUses.permitted.length || tableUses.conditional.length) {
    return tableUses;
  }

  // Strategy 2: parse bulleted lists under section headings
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  let currentCategory = null;

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Detect category heading
    for (const [cat, keywords] of Object.entries(USE_KEYWORDS)) {
      if (keywords.some(kw => lower.includes(kw))) {
        currentCategory = cat;
        break;
      }
    }

    // Collect items under current category
    if (currentCategory && isUseItem(line)) {
      const cleaned = cleanUseLine(line);
      if (cleaned && !result[currentCategory].includes(cleaned)) {
        result[currentCategory].push(cleaned);
      }
    }
  }

  return result;
}

function extractFromTable(html) {
  const result = { permitted: [], conditional: [], prohibited: [] };
  // Simple table row extraction without a DOM parser
  const rows = (html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []);

  for (const row of rows) {
    const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [])
      .map(c => stripTags(c).trim())
      .filter(Boolean);

    if (cells.length < 2) continue;

    const useName   = cells[0];
    const indicator = (cells[1] ?? '').toUpperCase().trim();

    if (!useName || useName.length < 3) continue;

    if (['P', 'Y', 'YES', 'PERMITTED', '✓', 'X'].includes(indicator)) {
      result.permitted.push(useName);
    } else if (['C', 'CU', 'SE', 'SUP', 'CONDITIONAL', 'SPECIAL'].includes(indicator)) {
      result.conditional.push(useName);
    } else if (['N', 'NO', 'PROHIBITED', '-', '—'].includes(indicator)) {
      result.prohibited.push(useName);
    }
  }

  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripTags(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isUseItem(line) {
  return /^[\d.•\-–*▪►]\s+\w/.test(line) || /^\w.{5,80}$/.test(line);
}

function cleanUseLine(line) {
  return line.replace(/^[\d.•\-–*▪►\s]+/, '').replace(/[.;,]+$/, '').trim();
}

function escRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @typedef {object} ParsedOrdinance
 * @property {string|null}  name
 * @property {string|null}  description
 * @property {object|null}  setbacks       - { front, rear, side } in feet
 * @property {number|null}  maxHeight      - feet
 * @property {number|null}  maxFAR
 * @property {number|null}  minLotSize     - sq ft
 * @property {string[]}     permitted
 * @property {string[]}     conditional
 * @property {string[]}     prohibited
 */


