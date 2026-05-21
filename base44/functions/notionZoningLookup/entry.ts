import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Reverse-geocode coords via Mapbox, then query Notion zoning DB filtered by jurisdiction.
// Returns zoning record with zoning_code, allowed_uses, height_limit, setbacks, notes.

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

function blockToText(block) {
  const t = block.type;
  const content = block[t];
  if (!content?.rich_text) return "";
  return content.rich_text.map((r) => r.plain_text || "").join("");
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

// Walk the block list and find a heading whose text contains one of the jurisdiction
// terms (county / city). Return the heading text + the text content following it
// until the next same-or-higher-level heading.
function extractJurisdictionSection(blocks, jurisdiction) {
  const terms = [jurisdiction.county, jurisdiction.city, jurisdiction.state]
    .filter(Boolean)
    .map((t) => t.toLowerCase().replace(/\bcounty\b/g, "").trim());

  let matchedHeading = null;
  let matchedLevel = null;
  const sectionLines = [];

  for (const block of blocks) {
    const isHeading = ["heading_1", "heading_2", "heading_3"].includes(block.type);
    const text = blockToText(block).trim();
    if (!text) continue;

    if (matchedHeading) {
      // We've already matched — collect text until next heading of same/higher level
      if (isHeading) {
        const level = parseInt(block.type.split("_")[1]);
        if (level <= matchedLevel) break; // section ended
      }
      sectionLines.push(text);
    } else if (isHeading) {
      const low = text.toLowerCase();
      if (terms.some((t) => t && low.includes(t))) {
        matchedHeading = text;
        matchedLevel = parseInt(block.type.split("_")[1]);
      }
    }
  }

  if (!matchedHeading) return null;
  return { heading: matchedHeading, content: sectionLines.join("\n").trim() };
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
          const blocks = await fetchPageBlocks(formattedId, notionToken.trim());
          const section = extractJurisdictionSection(blocks, geo);
          if (section) {
            zoning = {
              notion_page_id: formattedId,
              jurisdiction: section.heading,
              content: section.content,
              source: "Notion master zoning page",
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