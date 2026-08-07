/**
 * Smoke tests — sketchUtilityMarkers (HawkSketcher fiber/transformer markers).
 * Run: npx esbuild src/lib/sketchUtilityMarkers.smoke.ts --bundle --platform=node --format=esm --outfile=/tmp/sum.mjs && node /tmp/sum.mjs
 */
import {
  buildSketchUtilityMarkers, offsetsFt, bearingFromOffsets, compass8, fmtDist,
} from "../components/scip/livesketch/sketchUtilityMarkers.js";

let pass = 0, fail = 0;
function ok(cond: boolean, name: string, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

const SITE = { lat: 28.6647, lon: -80.8459 }; // Mims, FL
const FT_PER_DEG_LAT = 364000;
// Build an asset lat/lon that sits at exact (dEastFt, dNorthFt) from the site.
function at(dEastFt: number, dNorthFt: number) {
  return {
    lat: SITE.lat + dNorthFt / FT_PER_DEG_LAT,
    lon: SITE.lon + dEastFt / (FT_PER_DEG_LAT * Math.cos((SITE.lat * Math.PI) / 180)),
  };
}

console.log("— helpers —");
ok(compass8(0) === "N" && compass8(90) === "E" && compass8(180) === "S" && compass8(270) === "W", "compass8 cardinals");
ok(compass8(44) === "NE" && compass8(315) === "NW" && compass8(359) === "N", "compass8 sectors + wrap");
ok(near(bearingFromOffsets(100, 100), 45) && near(bearingFromOffsets(0, -50), 180) && near(bearingFromOffsets(-10, 0), 270), "bearingFromOffsets");
{
  const p = at(0, 1000);
  const o = offsetsFt(SITE.lat, SITE.lon, p.lat, p.lon);
  ok(near(o.dNorthFt, 1000, 0.01) && near(o.dEastFt, 0, 0.01), "offsetsFt round-trips north", JSON.stringify(o));
  const q = at(-500, 0);
  const o2 = offsetsFt(SITE.lat, SITE.lon, q.lat, q.lon);
  ok(near(o2.dEastFt, -500, 0.01) && near(o2.dNorthFt, 0, 0.01), "offsetsFt round-trips west");
}
ok(fmtDist(620) === "620′" && fmtDist(5280) === "1.0 MI" && fmtDist(4999) === "4,999′", "fmtDist", `${fmtDist(620)}|${fmtDist(5280)}|${fmtDist(4999)}`);

console.log("— fiber —");
{
  const d = 620 / Math.SQRT2;
  const m = buildSketchUtilityMarkers({
    siteLat: SITE.lat, siteLon: SITE.lon,
    fiberResult: { fiber: { point: at(d, d), distance_ft: 620, operator: "AT&T", assumed: false } },
  });
  const f = m.find((x: any) => x.kind === "fiber");
  ok(!!f, "mapped splice produces a fiber marker");
  ok(f?.label === "FIBER SPLICE — 620′ NE", "mapped splice label", f?.label);
  ok(f?.sub === "AT&T" && f?.assumed === false, "mapped splice sub/assumed");
  ok(near(f?.dEastFt, d, 0.5) && near(f?.dNorthFt, d, 0.5), "fiber offsets from point coords");
}
{
  const m = buildSketchUtilityMarkers({
    siteLat: SITE.lat, siteLon: SITE.lon,
    fiberResult: { fiber: { point: at(0, -900), distance_ft: 902, assumed: true, note: "ROW" } },
  });
  const f = m.find((x: any) => x.kind === "fiber");
  ok(f?.label === "FIBER HOOKUP — 902′ S", "assumed hookup labeled HOOKUP not SPLICE", f?.label);
  ok(/ASSUMED/.test(f?.sub || "") && f?.assumed === true, "assumed hookup sub says ASSUMED");
  ok(/\(assumed\)/.test(f?.chip || ""), "assumed chip flagged");
}
{
  const m = buildSketchUtilityMarkers({
    siteLat: SITE.lat, siteLon: SITE.lon,
    assetsResult: { fiber: { points: [{ kind: "manhole", ...at(300, 0), operator: null }, { kind: "exchange", ...at(2000, 0), operator: "Lumen" }] } },
  });
  const f = m.find((x: any) => x.kind === "fiber");
  ok(f?.label === "TELECOM MANHOLE — 300′ E", "fallback picks NEAREST OSM telecom point", f?.label);
  ok(f?.sub === "OSM-MAPPED ASSET", "fallback sub honest about source");
}

console.log("— power honesty ladder —");
{
  const m = buildSketchUtilityMarkers({
    siteLat: SITE.lat, siteLon: SITE.lon,
    assetsResult: { electric: { points: [
      { kind: "pole", ...at(0, 100) },
      { kind: "transformer", ...at(0, 800), operator: "FPL" },
    ] } },
  });
  const p = m.find((x: any) => x.kind === "power");
  ok(p?.label === "TRANSFORMER — 800′ N", "transformer wins over a NEARER pole (asked-for asset first)", p?.label);
  ok(p?.sub === "FPL", "transformer sub carries operator");
}
{
  const m = buildSketchUtilityMarkers({
    siteLat: SITE.lat, siteLon: SITE.lon,
    assetsResult: { electric: { points: [{ kind: "pole", ...at(-120, 0) }, { kind: "pole", ...at(-400, 0) }] } },
  });
  const p = m.find((x: any) => x.kind === "power");
  ok(p?.label === "POWER POLE — 120′ W", "no transformer → nearest pole, honestly labeled", p?.label);
  ok(p?.sub === "NEAREST — NO TRANSFORMER MAPPED", "pole is NEVER promoted to transformer");
}
{
  const m = buildSketchUtilityMarkers({
    siteLat: SITE.lat, siteLon: SITE.lon,
    assetsResult: { electric: { points: [{ kind: "substation", ...at(6000, 0), operator: "FPL" }] } },
  });
  const p = m.find((x: any) => x.kind === "power");
  ok(p?.label === "SUBSTATION — 1.1 MI E", "substation last rung, miles format", p?.label);
}
{
  const m = buildSketchUtilityMarkers({
    siteLat: SITE.lat, siteLon: SITE.lon,
    assetsResult: { electric: { points: [{ kind: "tower", ...at(50, 0) }] } },
  });
  ok(!m.find((x: any) => x.kind === "power"), "transmission tower alone yields NO power marker (not a service point)");
}

console.log("— guards —");
ok(buildSketchUtilityMarkers({ siteLat: NaN, siteLon: -80 } as any).length === 0, "invalid site coords → []");
ok(buildSketchUtilityMarkers({ siteLat: SITE.lat, siteLon: SITE.lon }).length === 0, "no payloads → [] (nothing invented)");
{
  const m = buildSketchUtilityMarkers({
    siteLat: SITE.lat, siteLon: SITE.lon,
    fiberResult: { fiber: { point: { lat: "x", lon: null }, distance_ft: 100 } } as any,
    assetsResult: { electric: { points: [{ kind: "transformer", lat: null, lon: undefined }] } } as any,
  });
  ok(m.length === 0, "garbage coordinates rejected, nothing drawn");
}
{
  const m = buildSketchUtilityMarkers({
    siteLat: SITE.lat, siteLon: SITE.lon,
    fiberResult: { fiber: { point: at(400, 0), distance_ft: 401 } },
    assetsResult: { electric: { points: [{ kind: "transformer", ...at(0, 250) }] } },
  });
  ok(m.length === 2 && m[0].kind === "fiber" && m[1].kind === "power", "at most one fiber + one power, fiber first");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
