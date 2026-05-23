/**
 * findBestParcelForTower
 *
 * Given the SARF center (lat/lon) and tower height the user typed on SCIP Page 1,
 * find the single most-feasible parcel to build a cell tower on:
 *
 *   1. Pull the local telecom ordinance from our Notion master zoning DB →
 *      ask the LLM which zoning classifications are allowable for commercial
 *      communication towers (most jurisdictions allow them in commercial /
 *      industrial / agricultural / institutional districts via CUP).
 *   2. Pull all parcels within the SARF radius via Realie.
 *   3. Filter out residential parcels and score remaining ones by:
 *        - zoning match (allowable district = big bonus)
 *        - acreage (≥2 ac strongly preferred — fits a 100'x100' compound + fall zone + setbacks)
 *        - non-residential land use
 *   4. Skip-trace the winning owner via the existing skipTrace → Enformion
 *      pipeline to get phone + email.
 *
 * Returns ready-to-fill Page 1 SITE INFORMATION + OWNER INFORMATION fields.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const RESIDENTIAL_HINTS = [
  "residential", "single family", "single-family", "sfr", "duplex",
  "townhouse", "townhome", "condo", "condominium", "apartment",
  "multi-family", "multifamily", "mobile home", "manufactured home",
  "r-1", "r-2", "r-3", "r-4", "r-5", "rsf", "rmf", "ru-", "rs-", "rm-",
  "low density res", "med density res", "high density res", "rr-", "rural res",
];

function isResidential(parcel, allowableZones) {
  const tokens = [parcel.land_use, parcel.zoning_classification, parcel.use_code, parcel.use_description]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  if (tokens.length === 0) return false;

  // If parcel zoning is explicitly in the allowable list (e.g. CG, M-1, A-1), keep it.
  const inAllowable = allowableZones.some((z) =>
    tokens.some((t) => t.includes(z.toLowerCase()))
  );
  if (inAllowable) return false;

  return RESIDENTIAL_HINTS.some((hint) => tokens.some((t) => t.includes(hint)));
}

function zoningMatchScore(parcel, allowableZones) {
  const tokens = [parcel.land_use, parcel.zoning_classification, parcel.use_code, parcel.use_description]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  if (!tokens.length) return 0;
  for (const z of allowableZones) {
    if (tokens.some((t) => t.includes(z.toLowerCase()))) return 40;
  }
  // Common non-residential keywords that almost always work with a CUP
  const safeKeywords = ["commercial", "industrial", "agricultural", "agriculture", "institutional", "vacant", "utility", "warehouse"];
  if (safeKeywords.some((k) => tokens.some((t) => t.includes(k)))) return 20;
  return 0;
}

function acreageScore(acres) {
  if (acres == null) return 0;
  if (acres >= 5) return 30;
  if (acres >= 2) return 25;
  if (acres >= 1) return 15;
  if (acres >= 0.5) return 8;
  return 0;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function proximityScore(parcel, lat, lon) {
  if (parcel.latitude == null || parcel.longitude == null) return 0;
  const d = haversineMiles(lat, lon, parcel.latitude, parcel.longitude);
  if (d <= 0.25) return 15;
  if (d <= 0.5) return 10;
  if (d <= 0.75) return 5;
  return 0;
}

function meetsMinLotSize(acres, towerHeightFt) {
  // Rule of thumb: usable area ≈ tower height × tower height (1:1 fall zone) + 100'×100' compound + setbacks.
  // 199 ft tower → ~1.5 ac minimum; 250 ft → ~2 ac. Set a conservative floor of 1.0 ac.
  if (acres == null) return null;
  const required = Math.max(1.0, ((towerHeightFt || 199) * (towerHeightFt || 199)) / 43560 * 1.5);
  return acres >= required;
}

async function getAllowableZones(base44, lat, lon) {
  try {
    const res = await base44.functions.invoke("notionZoningLookup", { lat, lon });
    const zoning = res?.data?.zoning || {};
    const ordinanceText = [
      zoning.content || "",
      zoning.zoning_process || "",
      zoning.code_section || "",
    ].join("\n\n");

    if (!ordinanceText.trim()) return { zones: [], jurisdiction: zoning.jurisdiction || "" };

    const llm = await base44.integrations.Core.InvokeLLM({
      prompt:
        `You are a telecom zoning analyst. Read the local telecommunications-tower ordinance below for ` +
        `${zoning.jurisdiction || "this jurisdiction"} and list the EXACT zoning district codes where a ` +
        `commercial communication tower is allowed — either by right OR with a Conditional / Special Use Permit (CUP/SUP). ` +
        `Return short district codes only (e.g. "CG", "CI", "M-1", "M-2", "A-1", "AG", "RU-1", "OP", "I", "PD"). ` +
        `Do NOT return residential districts (R-1, R-2, etc.) unless the ordinance explicitly allows towers there.\n\n` +
        `ORDINANCE TEXT:\n${ordinanceText.slice(0, 20000)}`,
      response_json_schema: {
        type: "object",
        properties: {
          allowable_zones: {
            type: "array",
            items: { type: "string" },
            description: "Zoning district codes where towers are allowed (by right or via CUP/SUP)",
          },
        },
        required: ["allowable_zones"],
      },
      add_context_from_internet: false,
    });
    return {
      zones: (llm?.allowable_zones || []).filter(Boolean),
      jurisdiction: zoning.jurisdiction || "",
    };
  } catch (e) {
    console.error("getAllowableZones failed:", e.message);
    return { zones: [], jurisdiction: "" };
  }
}

// Inline Realie call — avoids inner auth issues from base44.functions.invoke.
async function getParcels(lat, lon, radiusMiles) {
  const apiKey = Deno.env.get("REALIE_API_KEY");
  if (!apiKey) {
    console.error("REALIE_API_KEY not set");
    return [];
  }
  const radius = Math.min(radiusMiles, 2.0);
  const url = `https://app.realie.ai/api/public/property/location/?latitude=${lat}&longitude=${lon}&radius=${radius}&limit=100`;
  const r = await fetch(url, { headers: { Authorization: apiKey } });
  if (!r.ok) {
    console.error("Realie HTTP", r.status);
    return [];
  }
  const data = await r.json();
  const items = data.properties || data.results || (Array.isArray(data) ? data : []);
  return items.map((p) => ({
    apn: p.apn || p.parcelId || p.parcel_id || p.parcel_number || null,
    owner_name: p.ownerName || p.owner_name || p.owner || null,
    mailing_address: p.ownerMailingAddress ||
      [p.owner_mailing_address, p.owner_mailing_city, p.owner_mailing_state, p.owner_mailing_zip]
        .filter(Boolean).join(", ") || null,
    parcel_address: p.address || p.fullAddress || p.site_address || null,
    acreage: p.acres || p.acreage || p.lotSizeAcres || null,
    land_use: p.landUse || p.land_use || p.useDescription || null,
    zoning_classification: p.zoning || p.zoningCode || p.zoning_classification || null,
    county: p.county || p.countyName || null,
    latitude: p.latitude || p.lat || null,
    longitude: p.longitude || p.lon || p.lng || null,
  })).filter((p) => p.apn || p.owner_name || p.parcel_address);
}

// Skip-trace the parcel owner directly via the Supabase Enformion proxy
// (bypassing skipTrace's tier gate — this is an admin SCIP workflow).
async function skipTraceOwner(parcel) {
  try {
    const supaUrl = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/sitehawk-skip-trace";
    const supaKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supaKey || !parcel.owner_name) return { phone: "", email: "" };

    const r = await fetch(supaUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supaKey}`,
        "apikey": supaKey,
      },
      body: JSON.stringify({
        owner_name: parcel.owner_name,
        mailing_address: parcel.mailing_address || parcel.parcel_address,
      }),
    });
    if (!r.ok) {
      console.error("skipTrace HTTP", r.status);
      return { phone: "", email: "" };
    }
    const data = await r.json();
    const phones = data.phones || [];
    const emails = data.emails || [];
    return {
      phone: phones[0]?.number || "",
      email: emails[0]?.address || "",
    };
  } catch (e) {
    console.error("skipTraceOwner failed:", e.message);
    return { phone: "", email: "" };
  }
}

function splitAddress(addr, fallbackGeo = {}) {
  if (!addr) return {
    street: "", city: fallbackGeo.city || "", state: fallbackGeo.state || "", zip: fallbackGeo.zip || "",
  };
  // Common formats: "123 Main St, Tampa, FL 33602"
  const parts = String(addr).split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const last = parts[parts.length - 1];
    const stateZip = last.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
    return {
      street: parts[0] || "",
      city: parts[1] || fallbackGeo.city || "",
      state: stateZip?.[1] || fallbackGeo.state || "",
      zip: stateZip?.[2] || fallbackGeo.zip || "",
    };
  }
  // Rural single-line address — fall back to reverse-geocoded city/state/zip
  return {
    street: parts[0] || addr,
    city: fallbackGeo.city || "",
    state: fallbackGeo.state || "",
    zip: fallbackGeo.zip || "",
  };
}

async function reverseGeocode(lat, lon) {
  const token = Deno.env.get("MAPBOX_ACCESS_TOKEN");
  if (!token) return {};
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${token}&types=address,place,postcode,region,district`;
    const r = await fetch(url);
    if (!r.ok) return {};
    const j = await r.json();
    const ctx = {};
    for (const f of j.features || []) {
      for (const c of f.context || []) {
        if (c.id?.startsWith("place")) ctx.city = c.text;
        else if (c.id?.startsWith("region")) ctx.state = c.short_code?.replace(/^us-/i, "").toUpperCase() || c.text;
        else if (c.id?.startsWith("postcode")) ctx.zip = c.text;
      }
      if (ctx.city && ctx.state) break;
    }
    return ctx;
  } catch { return {}; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon, radius_miles = 1.0, tower_height_ft } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    // 1. Allowable zoning from Notion + LLM, and reverse-geocode the center
    //    for city/state/zip fallback on rural single-line parcel addresses.
    const [{ zones: allowableZones, jurisdiction }, geo] = await Promise.all([
      getAllowableZones(base44, lat, lon),
      reverseGeocode(lat, lon),
    ]);
    console.log(`Allowable zones for ${jurisdiction}:`, allowableZones, "geo:", geo);

    // 2. Parcels in the SARF ring
    const parcels = await getParcels(lat, lon, Math.min(radius_miles, 2.0));
    if (!parcels.length) {
      return Response.json({ error: "No parcels found in ring", allowable_zones: allowableZones });
    }

    // 3. Filter + score
    const candidates = parcels
      .filter((p) => !isResidential(p, allowableZones))
      .filter((p) => p.acreage == null || p.acreage >= 0.5)
      .map((p) => ({
        ...p,
        _score:
          zoningMatchScore(p, allowableZones) +
          acreageScore(p.acreage) +
          proximityScore(p, lat, lon),
      }))
      .sort((a, b) => b._score - a._score);

    if (!candidates.length) {
      return Response.json({
        error: "No non-residential parcels found in ring",
        allowable_zones: allowableZones,
        total_parcels_in_ring: parcels.length,
      });
    }

    const best = candidates[0];

    // 4. Skip-trace top 3 owners in parallel — Target A (best), Target B (2nd), Target C (3rd)
    const top3 = candidates.slice(0, 3);
    const contacts = await Promise.all(top3.map((p) => skipTraceOwner(p)));
    const contact = contacts[0];

    // Build a compact summary of all 3 targets for the Candidates Summary block
    const targets = top3.map((p, i) => {
      const a = splitAddress(p.parcel_address, geo);
      return {
        label: ["A", "B", "C"][i],
        parcel_id: p.apn || "",
        owner_name: p.owner_name || "",
        parcel_address: p.parcel_address || "",
        parcel_city: a.city,
        parcel_state: a.state,
        parcel_zip: a.zip,
        acreage: p.acreage != null ? Number(p.acreage) : null,
        zoning: p.zoning_classification || p.land_use || "",
        county: p.county || "",
        latitude: p.latitude != null ? Number(p.latitude) : null,
        longitude: p.longitude != null ? Number(p.longitude) : null,
        score: p._score,
        phone: contacts[i]?.phone || "",
        email: contacts[i]?.email || "",
      };
    });

    // 5. Build Page 1 SITE INFORMATION + OWNER INFORMATION payload
    const addr = splitAddress(best.parcel_address, geo);
    const mailing = best.mailing_address || best.parcel_address || "";

    const site_information = {
      parcel_county: best.county || "",
      parcel_id: best.apn || "",
      owner_name_on_deed: best.owner_name || "",
      parcel_street_address: addr.street,
      parcel_city: addr.city,
      parcel_state: addr.state,
      parcel_zip: addr.zip,
      parcel_size_acres: best.acreage != null ? `${best.acreage} ac MOL` : "",
      latitude: best.latitude != null ? Number(best.latitude).toFixed(6) : "",
      longitude: best.longitude != null ? Number(best.longitude).toFixed(6) : "",
      tower_height: tower_height_ft ? `${tower_height_ft} ft AGL` : "",
      parcel_dimensions: "",
      conforming_size: (() => {
        const ok = meetsMinLotSize(best.acreage, tower_height_ft);
        if (ok === true) return "Yes";
        if (ok === false) return "No";
        return "TBD";
      })(),
      taxes_paid_to_date: "TBD",
    };

    const owner_information = {
      names: best.owner_name || "",
      contact_person: best.owner_name || "",
      mailing_address: mailing,
      email_address: contact.email,
      phone_number: contact.phone,
    };

    return Response.json({
      site_information,
      owner_information,
      targets,
      reasoning: {
        jurisdiction,
        allowable_zones: allowableZones,
        total_parcels_in_ring: parcels.length,
        non_residential_candidates: candidates.length,
        chosen_parcel_score: best._score,
        chosen_parcel_zoning: best.zoning_classification || best.land_use || "unknown",
      },
    });
  } catch (error) {
    console.error("findBestParcelForTower error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});