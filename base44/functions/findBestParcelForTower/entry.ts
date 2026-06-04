/**
 * findBestParcelForTower
 *
 * Given the SARF center (lat/lon), SARF radius, and tower height, fetch the
 * three best parcel targets for a cell tower search ring.
 *
 * Pipeline integrity:
 *   1. Normalize the user-selected SARF radius to 0.25, 0.50, or 1.00 mile.
 *   2. Pull telecom zoning facts through extractTelecomOrdinance, which checks
 *      Zoneomics first, then the fallback ordinance sources.
 *   3. Build target-selection criteria: CUP/SUP is assumed required unless the
 *      ordinance says otherwise, and PE-letter acceptance is always checked.
 *   4. Pull parcels in the selected ring through Realie.
 *   5. Exclude residential parcels unless explicitly allowed, then rank Target
 *      A, Target B, and Target C by zoning fit, CUP flexibility, parcel size,
 *      PE-letter relief, and proximity to the SARF center.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPPORTED_RADII = [0.25, 0.5, 1.0];

const RESIDENTIAL_HINTS = [
  "residential", "single family", "single-family", "sfr", "duplex",
  "townhouse", "townhome", "condo", "condominium", "apartment",
  "multi-family", "multifamily", "mobile home", "manufactured home",
  "r-1", "r-2", "r-3", "r-4", "r-5", "rsf", "rmf", "ru-", "rs-", "rm-",
  "low density res", "med density res", "high density res", "rr-", "rural res",
];

const CUP_TERMS = [
  "conditional use", "conditional-use", "conditional use permit", "cup",
  "special use", "special-use", "special use permit", "sup",
  "special exception", "use permit", "planned development approval",
];

const BY_RIGHT_TERMS = [
  "by right", "by-right", "permitted by right", "permitted use",
  "allowed by right", "administrative approval", "ministerial approval",
];

const PE_ACCEPTANCE_TERMS = [
  "professional engineer", "p.e.", " pe ", "pe letter", "engineer letter",
  "engineer's letter", "structural engineer", "structural certification",
  "signed and sealed", "sealed plans", "sealed drawings", "fall zone letter",
  "fall-zone letter", "collapse letter", "engineering certification",
];

const CUP_FRIENDLY_KEYWORDS = [
  "commercial", "general commercial", "neighborhood commercial", "retail",
  "office", "business", "industrial", "light industrial", "heavy industrial",
  "manufacturing", "warehouse", "agricultural", "agriculture", "ag",
  "rural", "institutional", "civic", "public", "government", "municipal",
  "utility", "utilities", "transportation", "vacant", "undeveloped",
  "mixed use", "mixed-use", "planned development", "pd", "pud",
  "church", "religious", "school", "education",
];

const ZONE_STOP_WORDS = new Set([
  "AND", "ARE", "API", "CUP", "FAA", "FCC", "FT", "LDC", "MOL", "N/A",
  "NOT", "OR", "PE", "ROW", "SEC", "SUP", "TBD", "THE", "USE",
]);

function cleanString(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = cleanString(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizeRadius(radiusMiles) {
  const n = parseNumber(radiusMiles);
  if (n == null) return 1.0;
  if (n <= 0.375) return 0.25;
  if (n <= 0.75) return 0.5;
  return 1.0;
}

function formatRadius(radiusMiles) {
  return radiusMiles === 1 ? "1.00" : radiusMiles.toFixed(2);
}

function textHasAny(text, terms) {
  const lower = ` ${cleanString(text).toLowerCase()} `;
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function metadataText(metadata = {}) {
  return JSON.stringify({
    permit_type: metadata.permit_type,
    requires_cup: metadata.requires_cup,
    cup_path_available: metadata.cup_path_available,
    cup_notes: metadata.cup_notes,
    pe_letter_accepted: metadata.pe_letter_accepted,
    pe_letter_required: metadata.pe_letter_required,
    pe_letter_notes: metadata.pe_letter_notes,
    allowable_zones: metadata.allowable_zones,
    cup_eligible_zones: metadata.cup_eligible_zones,
    telecom_sections: asArray(metadata.telecom_sections).map((s) => ({
      section_ref: s.section_ref,
      section_title: s.section_title,
      topic: s.topic,
      clause_summary: s.clause_summary,
    })),
    compliance_summary: asArray(metadata.compliance_summary).map((row) => ({
      tower_type: row.tower_type,
      status: row.status,
      zones_or_context: row.zones_or_context,
      permit_path: row.permit_path,
      key_limits: row.key_limits,
      user_summary: row.user_summary,
    })),
    setback_summary: metadata.setback_summary,
    extraction_notes: metadata.extraction_notes,
  });
}

function extractZoneCodes(value) {
  const text = cleanString(value).toUpperCase();
  if (!text) return [];

  const matches = text.match(/\b(?:[A-Z]{1,4}[- ]\d{1,3}|[A-Z]{2,5}\d{0,2})\b/g) || [];
  return matches
    .map((m) => m.replace(/\s+/g, "-"))
    .filter((m) => !ZONE_STOP_WORDS.has(m))
    .filter((m) => !/^\d+$/.test(m))
    .filter((m) => m.length >= 2);
}

function extractZoneCodesFromMetadata(metadata = {}) {
  const values = [
    ...asArray(metadata.allowable_zones),
    ...asArray(metadata.cup_eligible_zones),
    ...asArray(metadata.by_right_zones),
    ...asArray(metadata.permitted_zones),
    metadata.permit_type,
    metadata.cup_notes,
    ...asArray(metadata.compliance_summary).flatMap((row) => [
      row.zones_or_context,
      row.permit_path,
      row.user_summary,
    ]),
  ];

  return uniqueStrings(values.flatMap(extractZoneCodes)).slice(0, 40);
}

function escapeRegex(value) {
  return cleanString(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeCode(value) {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokenMatchesZone(token, zone) {
  const tokenText = cleanString(token).toLowerCase();
  const zoneText = cleanString(zone).toLowerCase();
  if (!tokenText || !zoneText) return false;

  const boundary = new RegExp(`(^|[^a-z0-9])${escapeRegex(zoneText)}([^a-z0-9]|$)`, "i");
  if (boundary.test(tokenText)) return true;

  const compactZone = normalizeCode(zone);
  const compactToken = normalizeCode(token);
  return compactZone.length >= 3 && compactToken.includes(compactZone);
}

function parcelTokens(parcel) {
  return [
    parcel.land_use,
    parcel.zoning_classification,
    parcel.zoning,
    parcel.use_code,
    parcel.use_description,
  ].filter(Boolean).map((s) => cleanString(s).toLowerCase());
}

function findAllowableZoneMatch(parcel, allowableZones) {
  const tokens = parcelTokens(parcel);
  if (!tokens.length) return "";
  return allowableZones.find((zone) => tokens.some((token) => tokenMatchesZone(token, zone))) || "";
}

function isResidential(parcel, criteria) {
  const tokens = parcelTokens(parcel);
  if (!tokens.length) return false;

  const explicitAllowed = findAllowableZoneMatch(parcel, criteria.allowable_zones);
  if (explicitAllowed) return false;

  return RESIDENTIAL_HINTS.some((hint) => tokens.some((token) => token.includes(hint)));
}

function findPreferredKeyword(parcel) {
  const tokens = parcelTokens(parcel);
  return CUP_FRIENDLY_KEYWORDS.find((keyword) =>
    tokens.some((token) => token.includes(keyword))
  ) || "";
}

function zoningFit(parcel, criteria) {
  const zoneMatch = findAllowableZoneMatch(parcel, criteria.allowable_zones);
  if (zoneMatch) {
    return {
      score: 45,
      match_type: "ordinance_zone_match",
      label: "Ordinance/Zoneomics zoning match",
      reason: `Matches ${zoneMatch}, a zoning classification carried forward from the zoning section.`,
    };
  }

  const keyword = findPreferredKeyword(parcel);
  if (keyword && criteria.cup_path_available) {
    return {
      score: 34,
      match_type: "cup_friendly_zone",
      label: "CUP-friendly non-residential zoning",
      reason: `${keyword} use is kept eligible because the zoning screen indicates a CUP/SUP path.`,
    };
  }

  if (keyword && criteria.cup_assumed) {
    return {
      score: 26,
      match_type: "cup_assumed_zone",
      label: "CUP-assumed non-residential zoning",
      reason: `${keyword} use is kept eligible while CUP/SUP availability is verified with the jurisdiction.`,
    };
  }

  if (keyword) {
    return {
      score: 18,
      match_type: "non_residential_review",
      label: "Non-residential zoning, needs permit verification",
      reason: `${keyword} use is non-residential, but the local permit path still needs confirmation.`,
    };
  }

  return {
    score: 0,
    match_type: "zoning_review_required",
    label: "Zoning review required",
    reason: "No explicit tower zoning or CUP-friendly non-residential classification was found.",
  };
}

function requiredLotAcres(towerHeightFt, criteria) {
  const height = parseNumber(towerHeightFt) || 199;
  const conservative = Math.max(1.0, (height * height) / 43560 * 1.5);
  if (criteria.pe_letter_accepted) return Math.max(0.75, conservative * 0.82);
  return conservative;
}

function acreageScore(acres, criteria) {
  const n = parseNumber(acres);
  if (n == null) return 0;
  const peBonus = criteria.pe_letter_accepted ? 3 : 0;
  if (n >= 5) return 30 + peBonus;
  if (n >= 2) return 25 + peBonus;
  if (n >= 1) return 15 + peBonus;
  if (n >= 0.5) return 8 + peBonus;
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

function proximityScore(parcel, lat, lon, radiusMiles) {
  if (parcel.latitude == null || parcel.longitude == null) return 0;
  const d = haversineMiles(lat, lon, parcel.latitude, parcel.longitude);
  const ratio = radiusMiles > 0 ? d / radiusMiles : 1;
  if (ratio <= 0.25) return 15;
  if (ratio <= 0.5) return 10;
  if (ratio <= 0.75) return 5;
  return 0;
}

function permitFlexibilityScore(fit, criteria) {
  let score = 0;
  if (criteria.cup_path_available && /cup/i.test(fit.match_type)) score += 8;
  if (criteria.cup_assumed && fit.match_type === "cup_assumed_zone") score += 4;
  if (criteria.pe_letter_accepted) score += 6;
  return score;
}

function meetsMinLotSize(acres, towerHeightFt, criteria) {
  const n = parseNumber(acres);
  if (n == null) return null;
  return n >= requiredLotAcres(towerHeightFt, criteria);
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
        `${zoning.jurisdiction || "this jurisdiction"} and list the exact zoning district codes where a ` +
        `commercial communication tower is allowed by right or through a Conditional Use Permit, Special ` +
        `Use Permit, Special Exception, or equivalent discretionary approval. Return short district codes ` +
        `only, such as CG, CI, M-1, M-2, A-1, AG, RU-1, OP, I, PD, or PUD. Do not return residential ` +
        `districts unless the ordinance explicitly allows towers there.\n\n` +
        `ORDINANCE TEXT:\n${ordinanceText.slice(0, 20000)}`,
      response_json_schema: {
        type: "object",
        properties: {
          allowable_zones: {
            type: "array",
            items: { type: "string" },
            description: "Zoning district codes where towers are allowed by right or via CUP/SUP.",
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

async function getOrdinanceMetadata(base44, lat, lon) {
  try {
    const res = await base44.functions.invoke("extractTelecomOrdinance", {
      lat,
      lon,
      ordinance: {},
      candidates: [],
    });
    return res?.data?.ordinance_metadata || res?.ordinance_metadata || {};
  } catch (e) {
    console.error("getOrdinanceMetadata failed:", e.message);
    return {};
  }
}

function deriveTargetCriteria(ordinanceMetadata, zoningLookup, radiusMiles, towerHeightFt) {
  const text = metadataText(ordinanceMetadata);
  const cupMentioned = textHasAny(text, CUP_TERMS);
  const byRightMentioned = textHasAny(text, BY_RIGHT_TERMS);
  const conditionalRows = asArray(ordinanceMetadata.compliance_summary)
    .some((row) => row.status === "conditional" || textHasAny([
      row.permit_path,
      row.user_summary,
      row.zones_or_context,
    ].join(" "), CUP_TERMS));

  const explicitRequiresCup = typeof ordinanceMetadata.requires_cup === "boolean"
    ? ordinanceMetadata.requires_cup
    : null;
  const requiresCup = explicitRequiresCup ?? !(byRightMentioned && !cupMentioned && !conditionalRows);
  const cupPathAvailable = ordinanceMetadata.cup_path_available === true || cupMentioned || conditionalRows;
  const cupAssumed = requiresCup && !cupPathAvailable;

  const peMentioned = textHasAny(text, PE_ACCEPTANCE_TERMS);
  const peLetterAccepted = typeof ordinanceMetadata.pe_letter_accepted === "boolean"
    ? ordinanceMetadata.pe_letter_accepted
    : peMentioned;
  const peLetterRequired = ordinanceMetadata.pe_letter_required === true ||
    (peLetterAccepted && /required|shall|must|certif/i.test(text));

  const allowableZones = uniqueStrings([
    ...asArray(ordinanceMetadata.allowable_zones),
    ...asArray(ordinanceMetadata.cup_eligible_zones),
    ...extractZoneCodesFromMetadata(ordinanceMetadata),
    ...asArray(zoningLookup.zones),
  ]);

  const source = ordinanceMetadata.selected_source ||
    ordinanceMetadata.data_source ||
    ordinanceMetadata.source_stage ||
    (zoningLookup.zones?.length ? "notion_fallback" : "ordinance_pending");

  const requiredAcres = requiredLotAcres(towerHeightFt, { pe_letter_accepted: peLetterAccepted });

  return {
    jurisdiction: ordinanceMetadata.jurisdiction || zoningLookup.jurisdiction || "",
    source,
    source_chain: ordinanceMetadata.source_chain || "",
    selected_radius_miles: radiusMiles,
    supported_radii: SUPPORTED_RADII,
    allowable_zones: allowableZones,
    preferred_zoning_keywords: CUP_FRIENDLY_KEYWORDS,
    requires_cup: requiresCup,
    cup_path_available: cupPathAvailable,
    cup_assumed: cupAssumed,
    cup_notes: ordinanceMetadata.cup_notes || (
      cupPathAvailable
        ? "CUP/SUP or equivalent discretionary approval path found in the zoning screen."
        : requiresCup
          ? "CUP/SUP is assumed required until the jurisdiction confirms otherwise."
          : "By-right or administrative path indicated; verify before relying on it."
    ),
    pe_letter_reviewed: true,
    pe_letter_accepted: peLetterAccepted,
    pe_letter_required: peLetterRequired,
    pe_letter_effect: peLetterAccepted
      ? "PE letter or sealed engineering certification is available, so structural/fall-zone feasibility is scored more favorably pending jurisdiction acceptance."
      : "No PE-letter relief was verified, so parcel size and setback scoring remain conservative.",
    pe_letter_notes: ordinanceMetadata.pe_letter_notes || (
      peLetterAccepted
        ? "Professional-engineering documentation was detected in the zoning/building-permit screen."
        : "No reliable PE-letter acceptance language was detected; confirm during zoning due diligence."
    ),
    required_lot_acres: Number(requiredAcres.toFixed(2)),
    instructions: [
      `Use only parcels inside the ${formatRadius(radiusMiles)} mile SARF ring selected by the user.`,
      "Use the zoning section first: Zoneomics zoning facts, then ordinance fallback, then Realie parcels.",
      "Assume a CUP/SUP is required unless the ordinance clearly says the tower is by-right or administrative.",
      "When CUP/SUP is available or assumed pending verification, keep commercial, industrial, agricultural, institutional, utility, public, vacant, and similar non-residential parcels eligible.",
      "Always check whether a PE letter, structural certification, or signed/sealed engineering package can be submitted; if accepted, score fall-zone and parcel-size requirements in SiteHawk's favor.",
      "Return exactly three ranked targets when available: Target A, Target B, and Target C.",
    ],
  };
}

// Inline Realie call avoids inner auth issues from base44.functions.invoke.
async function getParcels(lat, lon, radiusMiles) {
  const apiKey = Deno.env.get("REALIE_API_KEY");
  if (!apiKey) {
    console.error("REALIE_API_KEY not set");
    return [];
  }

  const url = `https://app.realie.ai/api/public/property/location/?latitude=${lat}&longitude=${lon}&radius=${radiusMiles}&limit=100`;
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
    acreage: parseNumber(p.acres || p.acreage || p.lotSizeAcres),
    land_use: p.landUse || p.land_use || p.useDescription || null,
    use_code: p.useCode || p.use_code || null,
    use_description: p.useDescription || p.use_description || null,
    zoning_classification: p.zoning || p.zoningCode || p.zoning_classification || null,
    county: p.county || p.countyName || null,
    latitude: parseNumber(p.latitude || p.lat),
    longitude: parseNumber(p.longitude || p.lon || p.lng),
  })).filter((p) => p.apn || p.owner_name || p.parcel_address);
}

// Skip-trace the parcel owner directly via the Supabase Enformion proxy.
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
  if (!addr) {
    return {
      street: "",
      city: fallbackGeo.city || "",
      state: fallbackGeo.state || "",
      zip: fallbackGeo.zip || "",
    };
  }

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
  } catch {
    return {};
  }
}

function buildSelectionCriteria(parcel, fit, criteria, towerHeightFt, radiusMiles) {
  const required = requiredLotAcres(towerHeightFt, criteria);
  const acres = parseNumber(parcel.acreage);
  const sizeText = acres == null
    ? `Parcel size unknown; minimum target is about ${required.toFixed(2)} acres.`
    : `${acres.toFixed(2)} acres vs. about ${required.toFixed(2)} acres needed for this height screen.`;

  return [
    fit.reason,
    criteria.requires_cup
      ? criteria.cup_path_available
        ? "CUP/SUP path was found and used to keep more non-residential classifications eligible."
        : "CUP/SUP is assumed required; jurisdiction confirmation is still needed."
      : "By-right or administrative path indicated; verify before final zoning reliance.",
    criteria.pe_letter_accepted
      ? "PE-letter or sealed engineering package is available and improves the fall-zone/size screen."
      : "PE-letter acceptance was checked but not verified, so sizing remains conservative.",
    sizeText,
    `Parcel sits inside the selected ${formatRadius(radiusMiles)} mile SARF ring.`,
  ];
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

    const latNum = parseNumber(lat);
    const lonNum = parseNumber(lon);
    if (latNum == null || lonNum == null) {
      return Response.json({ error: "lat and lon must be valid numbers" }, { status: 400 });
    }

    const selectedRadius = normalizeRadius(radius_miles);

    const [ordinanceMetadata, zoningLookup, geo] = await Promise.all([
      getOrdinanceMetadata(base44, latNum, lonNum),
      getAllowableZones(base44, latNum, lonNum),
      reverseGeocode(latNum, lonNum),
    ]);

    const criteria = deriveTargetCriteria(
      ordinanceMetadata,
      zoningLookup,
      selectedRadius,
      tower_height_ft,
    );

    console.log(
      `Target criteria for ${criteria.jurisdiction || "unknown jurisdiction"}:`,
      JSON.stringify({
        source: criteria.source,
        radius: criteria.selected_radius_miles,
        zones: criteria.allowable_zones,
        requires_cup: criteria.requires_cup,
        cup_path_available: criteria.cup_path_available,
        pe_letter_accepted: criteria.pe_letter_accepted,
      }),
    );

    const parcels = await getParcels(latNum, lonNum, selectedRadius);
    if (!parcels.length) {
      return Response.json({
        error: "No parcels found in ring",
        allowable_zones: criteria.allowable_zones,
        target_selection_criteria: criteria,
        radius_miles: selectedRadius,
      });
    }

    const candidates = parcels
      .filter((p) => !isResidential(p, criteria))
      .filter((p) => p.acreage == null || p.acreage >= 0.5)
      .map((p) => {
        const fit = zoningFit(p, criteria);
        const size = acreageScore(p.acreage, criteria);
        const proximity = proximityScore(p, latNum, lonNum, selectedRadius);
        const permit = permitFlexibilityScore(fit, criteria);
        const distance = p.latitude != null && p.longitude != null
          ? haversineMiles(latNum, lonNum, p.latitude, p.longitude)
          : null;

        return {
          ...p,
          distance_miles: distance != null ? Number(distance.toFixed(3)) : null,
          _zoningFit: fit,
          _scoreBreakdown: {
            zoning: fit.score,
            acreage: size,
            proximity,
            permit_flexibility: permit,
          },
          _score: fit.score + size + proximity + permit,
        };
      })
      .sort((a, b) => b._score - a._score);

    if (!candidates.length) {
      return Response.json({
        error: "No non-residential parcels found in ring",
        allowable_zones: criteria.allowable_zones,
        target_selection_criteria: criteria,
        total_parcels_in_ring: parcels.length,
        radius_miles: selectedRadius,
      });
    }

    const best = candidates[0];
    const top3 = candidates.slice(0, 3);
    const contacts = await Promise.all(top3.map((p) => skipTraceOwner(p)));
    const contact = contacts[0];

    const targets = top3.map((p, i) => {
      const a = splitAddress(p.parcel_address, geo);
      return {
        label: ["A", "B", "C"][i],
        parcel_id: p.apn || "",
        owner_name: p.owner_name || "",
        mailing_address: p.mailing_address || "",
        parcel_address: p.parcel_address || "",
        parcel_city: a.city,
        parcel_state: a.state,
        parcel_zip: a.zip,
        acreage: p.acreage != null ? Number(p.acreage) : null,
        zoning: p.zoning_classification || p.land_use || "",
        land_use: p.land_use || "",
        county: p.county || "",
        latitude: p.latitude != null ? Number(p.latitude) : null,
        longitude: p.longitude != null ? Number(p.longitude) : null,
        distance_miles: p.distance_miles,
        score: p._score,
        score_breakdown: p._scoreBreakdown,
        phone: contacts[i]?.phone || "",
        email: contacts[i]?.email || "",
        zoning_fit: p._zoningFit.label,
        zoning_fit_reason: p._zoningFit.reason,
        requires_cup: criteria.requires_cup,
        cup_path_available: criteria.cup_path_available,
        cup_assumed: criteria.cup_assumed,
        cup_notes: criteria.cup_notes,
        pe_letter_reviewed: criteria.pe_letter_reviewed,
        pe_letter_accepted: criteria.pe_letter_accepted,
        pe_letter_required: criteria.pe_letter_required,
        pe_letter_effect: criteria.pe_letter_effect,
        required_lot_acres: criteria.required_lot_acres,
        selection_criteria: buildSelectionCriteria(p, p._zoningFit, criteria, tower_height_ft, selectedRadius),
      };
    });

    const addr = splitAddress(best.parcel_address, geo);
    const mailing = best.mailing_address || best.parcel_address || "";
    const conforming = meetsMinLotSize(best.acreage, tower_height_ft, criteria);

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
      conforming_size: conforming === true ? "Yes" : conforming === false ? "No" : "TBD",
      taxes_paid_to_date: "TBD",
      zoning_classification: best.zoning_classification || best.land_use || "",
      zoning_fit: best._zoningFit.label,
      requires_cup: criteria.requires_cup ? "Yes" : "No",
      cup_path_available: criteria.cup_path_available ? "Yes" : criteria.cup_assumed ? "Assumed - verify" : "No",
      pe_letter_accepted: criteria.pe_letter_accepted ? "Yes" : "Not verified",
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
        jurisdiction: criteria.jurisdiction,
        zoning_source: criteria.source,
        source_chain: criteria.source_chain,
        radius_miles: selectedRadius,
        allowable_zones: criteria.allowable_zones,
        target_selection_criteria: criteria,
        requires_cup: criteria.requires_cup,
        cup_path_available: criteria.cup_path_available,
        cup_assumed: criteria.cup_assumed,
        cup_notes: criteria.cup_notes,
        pe_letter_reviewed: criteria.pe_letter_reviewed,
        pe_letter_accepted: criteria.pe_letter_accepted,
        pe_letter_effect: criteria.pe_letter_effect,
        required_lot_acres: criteria.required_lot_acres,
        total_parcels_in_ring: parcels.length,
        non_residential_candidates: candidates.length,
        chosen_parcel_score: best._score,
        chosen_parcel_zoning: best.zoning_classification || best.land_use || "unknown",
        chosen_zoning_fit: best._zoningFit.label,
      },
    });
  } catch (error) {
    console.error("findBestParcelForTower error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
