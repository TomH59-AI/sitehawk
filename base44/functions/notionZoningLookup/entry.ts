import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─────────────────────────────────────────────────────────────────────────────
// Zoning lookup — backed by the Supabase `telecom_ordinances` table.
//
// Strategy: reverse-geocode (lat, lon) → (state, jurisdiction), then query
// Supabase for the SKYWAVE-SUMMARY row for that jurisdiction. Returns one clean
// summary row containing the Zoning Intel card fields.
//
// Function name preserved (notionZoningLookup) so Section2 / SCIPPreview keep
// working without frontend changes.
// ─────────────────────────────────────────────────────────────────────────────

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

// Try the candidate jurisdiction strings (city, county, "county County") in order
// and return the first SKYWAVE-SUMMARY row that matches.
async function querySupabaseOrdinance(supabaseUrl, supabaseKey, state, candidates) {
  const select = "jurisdiction,state,permit_type,height_limit_ft,setback_ft,fall_zone_ft,collocation_required,stealth_required,ordinance_text,source_url,section_ref";
  for (const jurisdiction of candidates) {
    if (!jurisdiction) continue;
    const url =
      `${supabaseUrl}/rest/v1/telecom_ordinances` +
      `?select=${encodeURIComponent(select)}` +
      `&state=eq.${encodeURIComponent(state)}` +
      `&jurisdiction=ilike.${encodeURIComponent(jurisdiction)}` +
      `&section_ref=eq.SKYWAVE-SUMMARY` +
      `&limit=1`;
    const r = await fetch(url, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });
    if (!r.ok) {
      const body = await r.text();
      console.error(`Supabase HTTP ${r.status} for ${jurisdiction}, ${state}: ${body.slice(0, 200)}`);
      continue;
    }
    const rows = await r.json();
    if (rows?.length) return rows[0];
  }
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
    const supabaseUrl = Deno.env.get("HAWK_SUPABASE_URL");
    const supabaseKey = Deno.env.get("HAWK_SUPABASE_ANON_KEY");

    if (!mapboxToken) return Response.json({ error: "MAPBOX_ACCESS_TOKEN not set" }, { status: 500 });
    if (!supabaseUrl || !supabaseKey) {
      return Response.json({ error: "Supabase not configured (HAWK_SUPABASE_URL or HAWK_SUPABASE_ANON_KEY missing)" }, { status: 500 });
    }

    const geo = await mapboxReverseGeocode(lat, lon, mapboxToken);
    if (!geo.state) {
      return Response.json({ geocode: geo, zoning: null, message: "Could not determine state from coordinates" });
    }

    // Try city → county → "<county> County" in that order
    const candidates = [
      geo.city,
      geo.county,
      geo.county ? `${geo.county} County` : null,
    ].filter(Boolean);

    const row = await querySupabaseOrdinance(supabaseUrl.replace(/\/$/, ""), supabaseKey, geo.state, candidates);

    if (!row) {
      return Response.json({
        geocode: geo,
        zoning: null,
        message: `No SKYWAVE-SUMMARY row in telecom_ordinances for ${candidates.join(" / ")}, ${geo.state}`,
      });
    }

    return Response.json({
      geocode: geo,
      zoning: {
        jurisdiction: row.jurisdiction,
        state: row.state,
        permit_type: row.permit_type,
        height_limit_ft: row.height_limit_ft,
        setback_ft: row.setback_ft,
        fall_zone_ft: row.fall_zone_ft,
        collocation_required: row.collocation_required,
        stealth_required: row.stealth_required,
        ordinance_text: row.ordinance_text,
        source_url: row.source_url,
        source: "Supabase · telecom_ordinances (SKYWAVE-SUMMARY)",
      },
    });
  } catch (error) {
    console.error("notionZoningLookup (Supabase) error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});