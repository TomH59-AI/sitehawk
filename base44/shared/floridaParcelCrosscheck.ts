const FDOR_LAYER = "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0/query";

function inFloridaBounds(lat, lng) {
  return Number(lat) >= 24.3 && Number(lat) <= 31.1 && Number(lng) >= -87.7 && Number(lng) <= -79.8;
}

function cleanParcelId(value) {
  return String(value || "").trim().replace(/'/g, "''");
}

function mailingAddress(a) {
  return [a.OWN_ADDR1, a.OWN_ADDR2, a.OWN_CITY, [a.OWN_STATE_ || a.OWN_STATE, a.OWN_ZIPCD].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ") || null;
}

export async function fetchFloridaParcelCrosscheck({ parcelId, state, lat, lng }) {
  const stateName = String(state || "").trim().toUpperCase();
  const isFlorida = stateName === "FL" || stateName === "FLORIDA" || inFloridaBounds(lat, lng);
  if (!isFlorida) return { skipped: true, reason: "not_florida" };

  const params = new URLSearchParams({
    f: "json",
    outFields: "CO_NO,PARCEL_ID,PARCEL_ID_,PARCELNO,STATE_PAR_,ALT_KEY,ASMNT_YR,DOR_UC,PA_UC,JV,AV_SD,AV_NSD,LND_VAL,LND_SQFOOT,OWN_NAME,OWN_ADDR1,OWN_ADDR2,OWN_CITY,OWN_STATE,OWN_STATE_,OWN_ZIPCD,PHY_ADDR1,PHY_ADDR2,PHY_CITY,PHY_ZIPCD,S_LEGAL,SALE_PRC1,SALE_YR1,SALE_MO1,OR_BOOK1,OR_PAGE1,NO_BULDNG,ACT_YR_BLT",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: parcelId ? "2" : "25",
  });
  let matchMethod = "nearest_centroid";
  if (parcelId) {
    const id = cleanParcelId(parcelId);
    const compactId = id.replace(/[^A-Za-z0-9]/g, "");
    const where = ["PARCEL_ID", "PARCEL_ID_", "PARCELNO", "STATE_PAR_", "ALT_KEY"]
      .map((field) => compactId && compactId !== id
        ? `(${field}='${id}' OR ${field}='${compactId}')`
        : `${field}='${id}'`)
      .join(" OR ");
    params.set("where", where);
    matchMethod = "parcel_id";
  } else {
    params.set("where", "1=1");
    params.set("geometry", `${lng},${lat}`);
    params.set("geometryType", "esriGeometryPoint");
    params.set("inSR", "4326");
    params.set("spatialRel", "esriSpatialRelIntersects");
    params.set("distance", "500");
    params.set("units", "esriSRUnit_Meter");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  let response;
  try {
    response = await fetch(`${FDOR_LAYER}?${params}`, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) return { found: false, error: `FDOR HTTP ${response.status}` };
  const json = await response.json();
  if (json.error) return { found: false, error: json.error.message || "FDOR query failed" };
  const features = json.features || [];
  if (!features.length) return { found: false, match_method: matchMethod };
  const feature = matchMethod === "nearest_centroid"
    ? features.sort((a, b) => {
        const da = Math.pow((a.geometry?.x ?? lng) - lng, 2) + Math.pow((a.geometry?.y ?? lat) - lat, 2);
        const db = Math.pow((b.geometry?.x ?? lng) - lng, 2) + Math.pow((b.geometry?.y ?? lat) - lat, 2);
        return da - db;
      })[0]
    : features[0];

  const a = feature.attributes || {};
  const sqft = Number(a.LND_SQFOOT);
  return {
    found: true,
    match_method: matchMethod,
    source: "Florida Department of Revenue Property Tax Oversight — 2025 statewide cadastral centroids",
    source_url: "https://www.arcgis.com/home/item.html?id=9490c0c9538947d592f377cbda74c270",
    parcel_id: a.PARCEL_ID || a.PARCEL_ID_ || a.PARCELNO || a.STATE_PAR_ || a.ALT_KEY || parcelId,
    owner_name: a.OWN_NAME || null,
    owner_mailing_address: mailingAddress(a),
    parcel_address: [a.PHY_ADDR1, a.PHY_ADDR2, a.PHY_CITY, a.PHY_ZIPCD].filter(Boolean).join(", ") || null,
    acreage: Number.isFinite(sqft) && sqft > 0 ? Math.round((sqft / 43560) * 100) / 100 : null,
    land_sqft: Number.isFinite(sqft) ? sqft : null,
    land_use_code: a.DOR_UC || a.PA_UC || null,
    assessed_value: (Number(a.AV_SD) || 0) + (Number(a.AV_NSD) || 0) || null,
    just_value: Number(a.JV) || null,
    land_value: Number(a.LND_VAL) || null,
    assessment_year: Number(a.ASMNT_YR) || null,
    last_sale_price: Number(a.SALE_PRC1) || null,
    last_sale_year: Number(a.SALE_YR1) || null,
    legal_description: a.S_LEGAL || null,
    building_count: Number(a.NO_BULDNG) || null,
    year_built: Number(a.ACT_YR_BLT) || null,
    centroid: feature.geometry ? { latitude: feature.geometry.y, longitude: feature.geometry.x } : null,
  };
}