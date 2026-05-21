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

async function notionQueryZoning(jurisdiction, notionToken, dbId) {
  // Try filtering by a "Jurisdiction" title/text property; if the DB shape differs
  // we'll return the raw error so diagnostics can surface it.
  const candidates = [jurisdiction.county, jurisdiction.city, jurisdiction.state].filter(Boolean);
  if (!candidates.length) return null;

  // We try each candidate term as a "contains" filter against a Title property.
  // Notion DBs vary — this is a best-effort match.
  for (const term of candidates) {
    const body = {
      filter: {
        or: [
          { property: "Name", title: { contains: term } },
          { property: "Jurisdiction", rich_text: { contains: term } },
        ],
      },
      page_size: 5,
    };

    const r = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const errBody = await r.text();
      throw new Error(`Notion HTTP ${r.status}: ${errBody.slice(0, 200)}`);
    }
    const data = await r.json();
    if (data.results?.length) return data.results[0];
  }
  return null;
}

function extractPropText(prop) {
  if (!prop) return null;
  if (prop.type === "title") return prop.title.map((t) => t.plain_text).join("") || null;
  if (prop.type === "rich_text") return prop.rich_text.map((t) => t.plain_text).join("") || null;
  if (prop.type === "number") return prop.number;
  if (prop.type === "select") return prop.select?.name || null;
  if (prop.type === "multi_select") return prop.multi_select.map((s) => s.name).join(", ");
  if (prop.type === "url") return prop.url || null;
  return null;
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
      try {
        const page = await notionQueryZoning(geo, notionToken, notionDbId);
        if (page) {
          const props = page.properties || {};
          zoning = {
            notion_page_id: page.id,
            name: extractPropText(props["Name"]) || extractPropText(props["Jurisdiction"]),
            zoning_code: extractPropText(props["Zoning Code"]) || extractPropText(props["Code"]),
            allowed_uses: extractPropText(props["Allowed Uses"]) || extractPropText(props["Permitted Uses"]),
            height_limit: extractPropText(props["Height Limit"]) || extractPropText(props["Max Height"]),
            setbacks: extractPropText(props["Setbacks"]) || extractPropText(props["Setback"]),
            notes: extractPropText(props["Notes"]),
            url: page.url,
          };
        }
      } catch (e) {
        notionError = e.message;
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