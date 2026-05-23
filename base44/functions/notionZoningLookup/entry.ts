import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Reverse-geocode coords via Mapbox, then query Notion zoning DB filtered by jurisdiction.
// Pulls the jurisdiction's ordinance section out of the Notion master zoning page,
// then uses the LLM to parse it into structured zoning + permitting fields with
// approval timeframes so every SCIP gets fully filled out.

async function mapboxReverseGeocode(lat, lon, mapboxToken) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${mapboxToken}&types=address,place,locality,district,region&limit=1`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Mapbox geocode HTTP ${r.status}`);
  const data = await r.json();
  const feature = data.features?.[0];
  if (!feature) return { full_address: null, city: null, county: null, state: null, zip: null };

  const context = feature.context || [];
  const place = context.find((c) => c.id?.startsWith("place"))?.text || null;
  const district = context.find((c) => c.id?.startsWith("district"))?.text || null;
  const region = context.find((c) => c.id?.startsWith("region"));
  const postcode = context.find((c) => c.id?.startsWith("postcode"))?.text || null;

  return {
    full_address: feature.place_name,
    street: feature.address ? `${feature.address} ${feature.text}` : feature.text,
    city: place,
    county: district, // Mapbox calls counties "district"
    state: region?.short_code?.replace("US-", "") || region?.text || null,
    zip: postcode,
  };
}

function normalizeNotionId(raw) {
  const clean = (raw || "").trim().replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  if (clean.length !== 32) return null;
  return `${clean.slice(0,8)}-${clean.slice(8,12)}-${clean.slice(12,16)}-${clean.slice(16,20)}-${clean.slice(20)}`;
}

// Convert any Notion block to its plain-text representation. Handles all the
// block types Apify / Municode scrapes typically produce (paragraphs, lists,
// toggles, quotes, callouts, code, child_page titles, etc.).
function blockToText(block) {
  const t = block.type;
  const content = block[t];
  if (!content) return "";
  // Standard rich-text bearing blocks
  if (content.rich_text) {
    return content.rich_text.map((r) => r.plain_text || "").join("");
  }
  // Child page block — title only (full body is fetched recursively)
  if (t === "child_page" && content.title) return content.title;
  if (t === "child_database" && content.title) return content.title;
  return "";
}

// Fetch all child blocks of a Notion page (handles pagination)
async function fetchPageBlocks(pageId, notionToken) {
  const blocks = [];
  let cursor = null;
  do {
    const url = `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Notion-Version": "2022-06-28",
      },
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`Notion HTTP ${r.status}: ${body.slice(0, 200)}`);
    }
    const data = await r.json();
    blocks.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return blocks;
}

// Recursively flatten a block tree to plain text. Follows `child_page` blocks
// (where Apify-scraped ordinance content lives) and `has_children` toggles up
// to a sensible depth. Caps total output to avoid huge LLM prompts.
async function expandBlocksToText(blocks, notionToken, depth = 0, budget = { chars: 60000 }) {
  if (depth > 3 || budget.chars <= 0) return "";
  const lines = [];
  for (const block of blocks) {
    if (budget.chars <= 0) break;
    const text = blockToText(block).trim();
    if (text) {
      const take = text.slice(0, budget.chars);
      lines.push(take);
      budget.chars -= take.length;
    }
    // Recurse into child pages (where the 50,000-char Municode scrape lives)
    // and into any block that has children (toggles, callouts, columns).
    if (block.has_children || block.type === "child_page") {
      try {
        const children = await fetchPageBlocks(block.id, notionToken);
        const nested = await expandBlocksToText(children, notionToken, depth + 1, budget);
        if (nested) lines.push(nested);
      } catch (e) {
        // Don't fail the whole section if one child page is inaccessible
        console.error(`expandBlocksToText: child fetch failed for ${block.id}: ${e.message}`);
      }
    }
  }
  return lines.join("\n");
}

// Walk the block list and find a heading whose text contains one of the jurisdiction
// terms (county / city). Return the heading text + the flattened text of every
// block (and child page) under it, until the next same-or-higher-level heading.
async function extractJurisdictionSection(blocks, jurisdiction, notionToken) {
  const terms = [jurisdiction.county, jurisdiction.city, jurisdiction.state]
    .filter(Boolean)
    .map((t) => t.toLowerCase().replace(/\bcounty\b/g, "").trim());

  let matchedHeading = null;
  let matchedLevel = null;
  const sectionBlocks = [];

  for (const block of blocks) {
    const isHeading = ["heading_1", "heading_2", "heading_3"].includes(block.type);
    const text = blockToText(block).trim();

    if (matchedHeading) {
      // We've matched — collect blocks until next heading of same/higher level
      if (isHeading && text) {
        const level = parseInt(block.type.split("_")[1]);
        if (level <= matchedLevel) break;
      }
      sectionBlocks.push(block);
    } else if (isHeading && text) {
      const low = text.toLowerCase();
      if (terms.some((t) => t && low.includes(t))) {
        matchedHeading = text;
        matchedLevel = parseInt(block.type.split("_")[1]);
      }
    }

    // ALSO match jurisdiction headings stored as child_page blocks (very common
    // in our master zoning DB — each city/county is a sub-page, not a heading).
    if (!matchedHeading && block.type === "child_page" && text) {
      const low = text.toLowerCase();
      if (terms.some((t) => t && low.includes(t))) {
        // Treat the matched child page as the section root: pull its content
        // and return immediately.
        const childBlocks = await fetchPageBlocks(block.id, notionToken);
        const content = await expandBlocksToText(childBlocks, notionToken);
        return { heading: text, content };
      }
    }
  }

  if (!matchedHeading) return null;
  const content = await expandBlocksToText(sectionBlocks, notionToken);
  return { heading: matchedHeading, content };
}

// Extract the Source URL out of the Notion stub. Our master zoning DB stores
// each jurisdiction as `LDC Section + Source URL + 50,000-char scraped reference`
// — the source URL is what we feed the LLM (with internet context enabled) so it
// can read the live ordinance.
function extractSourceUrl(text) {
  if (!text) return null;
  const urlMatch = text.match(/https?:\/\/[^\s)]+/i);
  if (!urlMatch) return null;
  return urlMatch[0].replace(/[.,)\]]+$/, "");
}

// Heuristic: a parse result is "thin" if 3+ of the 8 critical SCIP fields are
// empty. Earlier version required ALL critical fields blank — which meant a
// partially-filled response (e.g. has process + jurisdiction but missing fees,
// phone, address) would skip Oxylabs and leave the SCIP useless. SCIPs need
// every row filled, so we run the Oxylabs fallback much more aggressively.
function isThinParse(parsed) {
  if (!parsed) return true;
  const critical = [
    'zoning_fees',
    'zoning_approval_timeframe',
    'max_tower_height',
    'code_section',
    'zoning_department_address',
    'zoning_department_phone',
    'building_permit_fees',
    'building_permit_timeframe',
  ];
  const empty = critical.filter((k) => !parsed[k] || String(parsed[k]).trim() === '').length;
  return empty >= 3;
}

// Detect Municode / eCode360 / American Legal / Sterling Codifiers URLs so we
// only burn Oxylabs credits on pages we know need JS rendering.
function isMunicipalCodeUrl(url) {
  if (!url) return false;
  return /(municode\.com|ecode360\.com|amlegal\.com|sterlingcodifiers\.com|codepublishing\.com|municipal\.codes)/i.test(url);
}

// Oxylabs fallback — scrape rendered HTML, hand it back to the LLM to parse.
async function scrapeWithOxylabs(base44, sourceUrl, ctx) {
  try {
    const res = await base44.functions.invoke('oxylabsScrape', { url: sourceUrl, render: 'html' });
    const html = res?.data?.content || '';
    if (!html || html.length < 500) {
      console.error('Oxylabs returned empty/short content for', sourceUrl);
      return null;
    }
    // Strip tags to keep the LLM prompt small. The LLM only needs the prose.
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40000);

    const juris = ctx.jurisdiction || `${ctx.county || ''} ${ctx.city || ''} ${ctx.state || ''}`.trim();
    const result = await base44.integrations.Core.InvokeLLM({
      prompt:
        `You are a telecom zoning analyst preparing a SCIP for ${juris}. ` +
        `Below is the FULL rendered text of the jurisdiction's live telecommunications-tower ordinance page ` +
        `(scraped via Oxylabs from ${sourceUrl}). Extract every field using EXACT language from the ordinance. ` +
        `For contact info: zoning_contact is JUST the department name; put the street address in zoning_department_address, ` +
        `phone in zoning_department_phone, email in zoning_department_email. ` +
        `Do the same split for the building department (contact name vs address vs phone). ` +
        `For property_current_usage: describe the typical permitted use of property with this zoning classification. ` +
        `For fees and timeframes, quote the exact dollar amounts / day counts from the ordinance. ` +
        `If a value is not stated, return an empty string — never guess or fabricate. Cite section numbers when possible. ` +
        `EVERY field is required for the SCIP — be exhaustive.\n\n` +
        `ORDINANCE TEXT:\n${text}`,
      response_json_schema: ORDINANCE_SCHEMA,
      add_context_from_internet: true,
      model: 'gemini_3_1_pro',
    });
    return result || null;
  } catch (e) {
    console.error('scrapeWithOxylabs failed:', e.message);
    return null;
  }
}

// Shared schema used by both LLM parse paths. Explicit address + phone fields
// for both the zoning AND building departments so the LLM doesn't roll them
// into a single contact blob (which leaves Section 2 rows empty).
const ORDINANCE_SCHEMA = {
  type: 'object',
  properties: {
    // Zoning department contact — broken out explicitly
    zoning_contact: { type: 'string', description: 'Department name only, e.g. "Orange County Zoning Division"' },
    zoning_department_address: { type: 'string', description: 'Street address of the zoning department' },
    zoning_department_phone: { type: 'string', description: 'Phone number of the zoning department' },
    zoning_department_email: { type: 'string', description: 'Email of the zoning department' },
    zoning_process: { type: 'string' },
    zoning_fees: { type: 'string' },
    zoning_approval_timeframe: { type: 'string' },
    property_future_land_use: { type: 'string' },
    property_current_usage: { type: 'string', description: 'Typical current usage allowed under this zoning (e.g. agricultural, light industrial)' },
    code_section: { type: 'string' },
    max_tower_height: { type: 'string' },
    stealth_required: { type: 'string' },
    collocation_required: { type: 'string' },
    residential_separation: { type: 'string' },
    tower_separation: { type: 'string' },
    measured_from: { type: 'string' },
    fall_zone: { type: 'string' },
    landscaping: { type: 'string' },
    site_plan_jurisdiction: { type: 'string' },
    site_plan_contact: { type: 'string' },
    site_plan_fees: { type: 'string' },
    site_plan_timeframe: { type: 'string' },
    site_plan_concurrent: { type: 'string' },
    site_plan_submittal_format: { type: 'string' },
    // Building permit department contact — broken out explicitly
    building_permit_jurisdiction: { type: 'string' },
    building_permit_contact: { type: 'string', description: 'Department name only, e.g. "Orange County Building Division"' },
    building_permit_department_address: { type: 'string', description: 'Street address of the building department' },
    building_permit_department_phone: { type: 'string', description: 'Phone number of the building department' },
    building_permit_gc_submits: { type: 'string' },
    building_permit_fees: { type: 'string' },
    building_permit_timeframe: { type: 'string' },
    building_permit_bond_required: { type: 'string' },
    building_permit_pe_letter_accepted: { type: 'string', description: 'Does the jurisdiction accept a PE letter in lieu of full structural review?' },
    e911_address_required: { type: 'string' },
  },
  required: [],
};

// Use the LLM (with live internet context) to parse the actual telecom ordinance
// for the matched jurisdiction into structured zoning + permitting fields, including
// approval timeframes. We pass the Notion stub + source URL + jurisdiction so the
// LLM can fetch the live Municode/eCode page and extract real values.
async function parseOrdinanceWithLLM(base44, notionStub, sourceUrl, ctx) {
  const juris = ctx.jurisdiction || `${ctx.county || ""} ${ctx.city || ""} ${ctx.state || ""}`.trim();

  const prompt =
    `You are a telecom site-acquisition zoning analyst preparing a Site Candidate Information Package (SCIP) ` +
    `for ${juris}.\n\n` +
    `Look up and read the actual local telecommunications-tower ordinance for this jurisdiction. The reference ` +
    `URL from our master zoning database is:\n${sourceUrl || "(no URL — search by jurisdiction name)"}\n\n` +
    `Master zoning database stub:\n${notionStub}\n\n` +
    `If the source page is paywalled or unreachable, search the open web (the jurisdiction's official municode.com / ecode360 / amlegal page, ` +
    `the city/county website, or municipal PDFs) for the same code section.\n\n` +
    `Extract every field below using the EXACT language from the ordinance. ` +
    `If a value is not stated in the ordinance, search the jurisdiction's official website for the missing field ` +
    `(department contact pages, fee schedules, permitting handbooks). If still not found, return an empty string — DO NOT GUESS or fabricate. ` +
    `For timeframes, quote the exact language (e.g. "60 days", "90 days from complete submittal", "two public hearings within 120 days"). ` +
    `For fees, quote the exact dollar amounts and any per-unit modifiers (e.g. "$1,250 base + $25 per antenna"). ` +
    `For contact info: zoning_contact is JUST the department name; put the street address in zoning_department_address, ` +
    `the phone number in zoning_department_phone, and the email in zoning_department_email. ` +
    `Do the same split for the building department: building_permit_contact = department name only; ` +
    `building_permit_department_address = street address; building_permit_department_phone = phone. ` +
    `For property_current_usage: describe the typical permitted use of property with this zoning classification ` +
    `(e.g. "Agricultural — single-family residential, farming, livestock"). ` +
    `Cite the section number you're pulling each value from when possible (e.g. "Sec. 27-282.6(b)(3): 199 ft"). ` +
    `EVERY field is required for the SCIP — leaving fields blank makes the report useless. Be exhaustive.`;

  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: ORDINANCE_SCHEMA,
      add_context_from_internet: true,
      model: "gemini_3_1_pro",
    });
    return result || {};
  } catch (e) {
    console.error("parseOrdinanceWithLLM failed:", e.message);
    return {};
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon } = await req.json();
    if (lat == null || lon == null) return Response.json({ error: "lat and lon required" }, { status: 400 });

    const mapboxToken = Deno.env.get("MAPBOX_ACCESS_TOKEN");
    const notionToken = Deno.env.get("NOTION_API_TOKEN");
    const notionDbId = Deno.env.get("NOTION_MASTER_ZONING_PAGE_ID");

    if (!mapboxToken) return Response.json({ error: "MAPBOX_ACCESS_TOKEN not set" }, { status: 500 });

    const geo = await mapboxReverseGeocode(lat, lon, mapboxToken);

    let zoning = null;
    let notionError = null;
    if (notionToken && notionDbId) {
      const formattedId = normalizeNotionId(notionDbId);
      if (!formattedId) {
        notionError = `Notion page ID has invalid format (expected 32 hex chars): "${notionDbId.slice(0, 60)}"`;
      } else {
        try {
          const trimmedToken = notionToken.trim();
          const blocks = await fetchPageBlocks(formattedId, trimmedToken);
          const section = await extractJurisdictionSection(blocks, geo, trimmedToken);
          if (section) {
            // Feed the LLM the Notion stub + source URL + jurisdiction, and let
            // it read the live ordinance over the web (Municode/eCode/etc.) to
            // extract structured zoning + permitting + approval-timeframe fields.
            const sourceUrl = extractSourceUrl(section.content);
            const ctx = {
              jurisdiction: section.heading,
              county: geo.county,
              city: geo.city,
              state: geo.state,
            };
            let parsed = await parseOrdinanceWithLLM(base44, section.content, sourceUrl, ctx);
            let sourceLabel = "Notion stub + live ordinance lookup";

            // If the LLM gave up on critical fields AND we have a Municode/eCode URL,
            // fall back to Oxylabs to fetch rendered HTML and re-parse.
            if (isThinParse(parsed) && isMunicipalCodeUrl(sourceUrl)) {
              console.log("Thin LLM parse — falling back to Oxylabs for", sourceUrl);
              const oxyParsed = await scrapeWithOxylabs(base44, sourceUrl, ctx);
              if (oxyParsed && !isThinParse(oxyParsed)) {
                parsed = oxyParsed;
                sourceLabel = "Notion stub + Oxylabs scrape + LLM parse";
              }
            }

            zoning = {
              notion_page_id: formattedId,
              jurisdiction: section.heading,
              content: section.content,
              source_url: sourceUrl,
              source: sourceLabel,
              ...parsed,
            };
          } else {
            notionError = `No section found for ${[geo.county, geo.city, geo.state].filter(Boolean).join(" / ")} in Notion page`;
          }
        } catch (e) {
          notionError = e.message;
        }
      }
    } else {
      notionError = "Notion not configured (NOTION_API_TOKEN or NOTION_MASTER_ZONING_PAGE_ID missing)";
    }

    return Response.json({
      geocode: geo,
      zoning,
      notion_error: notionError,
      message: zoning ? null : "No Notion match — verify DB ID and integration access",
    });
  } catch (error) {
    console.error("notionZoningLookup error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});