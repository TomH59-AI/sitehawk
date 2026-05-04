// Tower Placement Engine — pure functions, no UI
// Computes setbacks, valid placement zones, and optimal tower base location
// based on parcel geometry, tower specs, and environmental constraints.

const FT_PER_DEGREE_LAT = 364000; // ~111km converted to ft

// Tower-type → fall-zone multiplier (% of tower height)
export const FALL_ZONE_PCT = {
  self_support: 1.0,
  monopole: 1.0,
  guyed: 1.0,
};

// Convert a GeoJSON Polygon/MultiPolygon → flat array of rings
export function extractRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

// Compute the bounding box of a parcel in feet (relative to centroid)
export function parcelDimensionsFt(geometry) {
  const rings = extractRings(geometry);
  if (!rings.length || !rings[0]?.length) return null;
  const ring = rings[0];
  let latSum = 0, lonSum = 0;
  for (const [lon, lat] of ring) { lonSum += lon; latSum += lat; }
  const cLat = latSum / ring.length;
  const cLon = lonSum / ring.length;
  const ftPerLon = Math.cos((cLat * Math.PI) / 180) * FT_PER_DEGREE_LAT;
  const ftPerLat = FT_PER_DEGREE_LAT;
  const points = ring.map(([lon, lat]) => ({
    lon, lat,
    x_ft: (lon - cLon) * ftPerLon,
    y_ft: (lat - cLat) * ftPerLat,
  }));
  const xs = points.map(p => p.x_ft);
  const ys = points.map(p => p.y_ft);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return {
    centroid: { lat: cLat, lon: cLon },
    widthFt: maxX - minX,
    depthFt: maxY - minY,
    points,
    extents: { minX, maxX, minY, maxY },
    ftPerLon,
    ftPerLat,
  };
}

export function ftToLatLon(x_ft, y_ft, centroid, ftPerLon, ftPerLat) {
  return {
    lat: centroid.lat + y_ft / ftPerLat,
    lon: centroid.lon + x_ft / ftPerLon,
  };
}

export function computeValidZone(parcelDims, setbackFt) {
  if (!parcelDims) return { valid: false, message: "No parcel geometry available." };
  const { extents, widthFt, depthFt } = parcelDims;
  const zoneMinX = extents.minX + setbackFt;
  const zoneMaxX = extents.maxX - setbackFt;
  const zoneMinY = extents.minY + setbackFt;
  const zoneMaxY = extents.maxY - setbackFt;
  const zoneWidth = zoneMaxX - zoneMinX;
  const zoneDepth = zoneMaxY - zoneMinY;
  if (zoneWidth <= 0 || zoneDepth <= 0) {
    return {
      valid: false,
      zone: null,
      parcelWidthFt: widthFt,
      parcelDepthFt: depthFt,
      message: `Parcel too narrow for ${setbackFt}-ft setback. Required: ${(setbackFt * 2).toFixed(0)} ft total in each direction. Available: ${widthFt.toFixed(0)} ft (E-W) × ${depthFt.toFixed(0)} ft (N-S).`,
    };
  }
  return {
    valid: true,
    zone: { minX: zoneMinX, maxX: zoneMaxX, minY: zoneMinY, maxY: zoneMaxY, widthFt: zoneWidth, depthFt: zoneDepth },
    parcelWidthFt: widthFt,
    parcelDepthFt: depthFt,
    message: null,
  };
}

export function pickOptimalLocation(validZone, accessPreference, wetlandsOnSite) {
  if (!validZone?.valid || !validZone.zone) return null;
  const { minX, maxX, minY, maxY } = validZone.zone;
  let x = maxX, y = maxY, cornerLabel = "Northeast";
  switch (accessPreference) {
    case "north": x = (minX + maxX) / 2; y = maxY; cornerLabel = "North-Center"; break;
    case "south": x = (minX + maxX) / 2; y = minY; cornerLabel = "South-Center"; break;
    case "east":  x = maxX; y = (minY + maxY) / 2; cornerLabel = "East-Center"; break;
    case "west":  x = minX; y = (minY + maxY) / 2; cornerLabel = "West-Center"; break;
    case "northeast": x = maxX; y = maxY; cornerLabel = "Northeast"; break;
    case "northwest": x = minX; y = maxY; cornerLabel = "Northwest"; break;
    case "southeast": x = maxX; y = minY; cornerLabel = "Southeast"; break;
    case "southwest": x = minX; y = minY; cornerLabel = "Southwest"; break;
    default: x = maxX; y = maxY; cornerLabel = "Northeast";
  }
  return { x_ft: x, y_ft: y, cornerLabel, wetland_warning: !!wetlandsOnSite };
}

export function computeTowerPlacement(parcel, specs) {
  const { towerHeightFt, towerType, compoundSizeFt, accessPreference } = specs;
  const fallZonePct = FALL_ZONE_PCT[towerType] || 1.0;
  const setbackFt = Math.ceil(towerHeightFt * fallZonePct);

  const parcelDims = parcelDimensionsFt(parcel.parcel_geometry);
  const validZone = computeValidZone(parcelDims, setbackFt);

  if (!validZone.valid) {
    return {
      ok: false,
      setbackFt, towerHeightFt, towerType, compoundSizeFt, accessPreference,
      parcelDims, validZone, placement: null, message: validZone.message,
    };
  }

  const placement = pickOptimalLocation(validZone, accessPreference, parcel.wetlands_present === true && parcel.wetland_proximity === "on-site");
  const towerLatLon = ftToLatLon(placement.x_ft, placement.y_ft, parcelDims.centroid, parcelDims.ftPerLon, parcelDims.ftPerLat);

  const { extents } = parcelDims;
  const distances = {
    north_ft: extents.maxY - placement.y_ft,
    south_ft: placement.y_ft - extents.minY,
    east_ft:  extents.maxX - placement.x_ft,
    west_ft:  placement.x_ft - extents.minX,
  };

  const compliance = {
    north: distances.north_ft >= setbackFt,
    south: distances.south_ft >= setbackFt,
    east:  distances.east_ft >= setbackFt,
    west:  distances.west_ft >= setbackFt,
  };
  const compliant = Object.values(compliance).every(Boolean);

  const compoundHalf = compoundSizeFt / 2;
  const compoundEdges = {
    north_ft: distances.north_ft - compoundHalf,
    south_ft: distances.south_ft - compoundHalf,
    east_ft:  distances.east_ft  - compoundHalf,
    west_ft:  distances.west_ft  - compoundHalf,
  };

  const totalAcres = parcel.parcel_size_acres || ((parcelDims.widthFt * parcelDims.depthFt) / 43560);
  const compoundAcres = (compoundSizeFt * compoundSizeFt) / 43560;
  const accessEasementWidth = 12;
  let accessEasementLength = 70;
  if (accessPreference === "north")     accessEasementLength = Math.max(0, distances.north_ft - compoundHalf);
  else if (accessPreference === "south") accessEasementLength = Math.max(0, distances.south_ft - compoundHalf);
  else if (accessPreference === "east")  accessEasementLength = Math.max(0, distances.east_ft  - compoundHalf);
  else if (accessPreference === "west")  accessEasementLength = Math.max(0, distances.west_ft  - compoundHalf);
  else accessEasementLength = Math.max(0, distances.north_ft - compoundHalf);
  const easementAreaSf = accessEasementWidth * accessEasementLength;
  const ownerRetainedAcres = Math.max(0, totalAcres - compoundAcres - (easementAreaSf / 43560));
  const ownerRetainedPct = totalAcres > 0 ? (ownerRetainedAcres / totalAcres) * 100 : 0;

  const warnings = [];
  if (parcel.fema_sfha) warnings.push(`Parcel is in FEMA Special Flood Hazard Area (${parcel.fema_risk_factor || "SFHA"}). Foundation design and CLOMA/CLOMR may be required.`);
  if (parcel.fema_risk_level === "high") warnings.push(`FEMA flood risk level: HIGH. Full FIRM panel review recommended.`);
  if (parcel.wetlands_present === true && parcel.wetland_proximity === "on-site") warnings.push(`USFWS NWI wetlands ON SITE. Field delineation and Section 404 permit assessment required.`);
  if (parcel.wetlands_present === true && parcel.wetland_proximity === "adjacent") warnings.push(`USFWS NWI wetlands adjacent (~100 m). Field delineation recommended to confirm tower placement is outside delineated wetland boundary.`);
  if (towerHeightFt >= 200) warnings.push(`Tower height ≥ 200 ft requires FAA aeronautical study (Form 7460-1) and FCC Antenna Structure Registration (ASR).`);
  else if (towerHeightFt >= 120) warnings.push(`Tower height ≥ 120 ft requires FAA Form 7460-1 Notice of Proposed Construction.`);

  return {
    ok: true,
    setbackFt, fallZonePct, towerHeightFt, towerType, compoundSizeFt, accessPreference,
    parcelDims, validZone,
    placement: { ...placement, lat: towerLatLon.lat, lon: towerLatLon.lon },
    distances, compliance, compliant, compoundEdges,
    accessEasement: { widthFt: accessEasementWidth, lengthFt: accessEasementLength, areaSf: easementAreaSf },
    areas: { totalAcres, compoundAcres, easementAcres: easementAreaSf / 43560, ownerRetainedAcres, ownerRetainedPct },
    warnings,
    message: null,
  };
}