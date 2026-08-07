/**
 * sketchUtilityMarkers — turns REAL mapped asset coordinates into positioned
 * markers for the Live Site Sketch (HawkSketcher).
 *
 * Doctrine: NEVER invents a location.
 *  • Fiber comes from the fiberSplicePoints function — the nearest OSM-mapped
 *    telecom asset, or its explicit "ASSUMED at road ROW" fallback. An assumed
 *    hookup stays labeled ASSUMED on the drawing; it is never dressed up as a
 *    mapped splice.
 *  • Power comes from infrastructureAssets (OSM) with an honesty ladder:
 *    transformer → power pole ("NO TRANSFORMER MAPPED") → substation → nothing.
 *    A pole is never relabeled as a transformer.
 *
 * Pure module — no fetching, no DOM — so it is unit-testable. Geometry is
 * planar feet from the site coordinate (E+ / N+), matching the sketch's
 * world axes (true north up).
 */

const FT_PER_DEG_LAT = 364000; // ≈ 69 mi — same precision as ScipLiveSketch

export function offsetsFt(siteLat, siteLon, lat, lon) {
  const dNorthFt = (lat - siteLat) * FT_PER_DEG_LAT;
  const dEastFt = (lon - siteLon) * FT_PER_DEG_LAT * Math.cos((siteLat * Math.PI) / 180);
  return { dEastFt, dNorthFt };
}

export function bearingFromOffsets(dEastFt, dNorthFt) {
  const b = (Math.atan2(dEastFt, dNorthFt) * 180) / Math.PI;
  return ((b % 360) + 360) % 360;
}

export function compass8(bearing) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

export function fmtDist(ft) {
  if (!Number.isFinite(ft)) return "?";
  return ft >= 5000 ? `${(ft / 5280).toFixed(1)} MI` : `${Math.round(ft).toLocaleString()}′`;
}

function withGeo(siteLat, siteLon, p) {
  const { dEastFt, dNorthFt } = offsetsFt(siteLat, siteLon, p.lat, p.lon);
  const distFt = Math.hypot(dEastFt, dNorthFt);
  const bearing = bearingFromOffsets(dEastFt, dNorthFt);
  return { ...p, dEastFt, dNorthFt, distFt, bearing, compass: compass8(bearing) };
}

function nearestOf(points, siteLat, siteLon, kinds) {
  const c = (Array.isArray(points) ? points : [])
    .filter((p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)) &&
      (!kinds || kinds.includes(p.kind)))
    .map((p) => withGeo(siteLat, siteLon, { ...p, lat: Number(p.lat), lon: Number(p.lon) }));
  c.sort((a, b) => a.distFt - b.distFt);
  return c[0] || null;
}

const FIBER_KIND_LABEL = {
  splice: "FIBER SPLICE",
  manhole: "TELECOM MANHOLE",
  exchange: "TELECOM EXCHANGE",
  data_center: "DATA CENTER",
  telecom: "TELECOM ASSET",
};

/**
 * @param {{siteLat:number, siteLon:number,
 *          fiberResult?: {fiber?: {point?:{lat,lon}, distance_ft?, asset?, operator?, assumed?}}|null,
 *          assetsResult?: {electric?:{points?:Array}, fiber?:{points?:Array}}|null}} args
 * @returns markers [{kind:'fiber'|'power', dEastFt, dNorthFt, distFt, bearing,
 *                    compass, label, sub, chip, assumed}] — at most one of each.
 */
export function buildSketchUtilityMarkers({ siteLat, siteLon, fiberResult = null, assetsResult = null }) {
  const out = [];
  const la = Number(siteLat), lo = Number(siteLon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return out;

  /* ── fiber: prefer the fiberSplicePoints verdict (it already carries the
     honest ASSUMED-at-ROW fallback); else nearest OSM telecom point. ── */
  const fp = fiberResult && fiberResult.fiber;
  if (fp && fp.point && Number.isFinite(Number(fp.point.lat)) && Number.isFinite(Number(fp.point.lon))) {
    const g = withGeo(la, lo, { lat: Number(fp.point.lat), lon: Number(fp.point.lon) });
    const distFt = Number.isFinite(Number(fp.distance_ft)) ? Number(fp.distance_ft) : g.distFt;
    const assumed = !!fp.assumed;
    out.push({
      kind: "fiber",
      dEastFt: g.dEastFt, dNorthFt: g.dNorthFt, distFt, bearing: g.bearing, compass: g.compass,
      label: `${assumed ? "FIBER HOOKUP" : "FIBER SPLICE"} — ${fmtDist(distFt)} ${g.compass}`,
      sub: assumed ? "ASSUMED @ ROAD ROW — NOT A MAPPED ASSET" : (fp.operator || fp.asset || "OSM-MAPPED ASSET"),
      chip: `Fiber ${fmtDist(distFt)} ${g.compass}${assumed ? " (assumed)" : ""}`,
      assumed,
    });
  } else {
    const alt = nearestOf(assetsResult && assetsResult.fiber && assetsResult.fiber.points, la, lo, null);
    if (alt) {
      out.push({
        kind: "fiber",
        dEastFt: alt.dEastFt, dNorthFt: alt.dNorthFt, distFt: alt.distFt, bearing: alt.bearing, compass: alt.compass,
        label: `${FIBER_KIND_LABEL[alt.kind] || "TELECOM ASSET"} — ${fmtDist(alt.distFt)} ${alt.compass}`,
        sub: alt.operator || "OSM-MAPPED ASSET",
        chip: `Fiber ${fmtDist(alt.distFt)} ${alt.compass}`,
        assumed: false,
      });
    }
  }

  /* ── power: honesty ladder — never promote a pole to a transformer. ── */
  const ep = assetsResult && assetsResult.electric && assetsResult.electric.points;
  const xf = nearestOf(ep, la, lo, ["transformer"]);
  const pole = xf ? null : nearestOf(ep, la, lo, ["pole"]);
  const substation = xf || pole ? null : nearestOf(ep, la, lo, ["substation"]);
  const pick = xf || pole || substation;
  if (pick) {
    const name = xf ? "TRANSFORMER" : pole ? "POWER POLE" : "SUBSTATION";
    const chipName = xf ? "Xfmr" : pole ? "Pole" : "Substation";
    out.push({
      kind: "power",
      dEastFt: pick.dEastFt, dNorthFt: pick.dNorthFt, distFt: pick.distFt, bearing: pick.bearing, compass: pick.compass,
      label: `${name} — ${fmtDist(pick.distFt)} ${pick.compass}`,
      sub: xf ? (pick.operator || "OSM-MAPPED ASSET")
        : pole ? "NEAREST — NO TRANSFORMER MAPPED"
          : "NEAREST — NO XFMR/POLE MAPPED",
      chip: `${chipName} ${fmtDist(pick.distFt)} ${pick.compass}`,
      assumed: false,
    });
  }

  return out;
}
