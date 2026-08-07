/**
 * REAL-WORLD PROBE — not a unit test.
 *
 * Runs frontage detection and the solver against LIVE OpenStreetMap road
 * geometry for a real location. Unit tests use clean rectangles and tidy
 * straight roads; OSM has dual carriageways, service loops, ramps and
 * fragmented ways. This is the check that the frontage logic survives contact
 * with real data.
 *
 * The parcel ring here is synthetic (Realie needs a key this sandbox does not
 * have) — the ROADS are real, which is the part under test.
 *
 * Run: npx esbuild src/lib/__realworld.probe.ts --bundle --platform=node \
 *        --format=esm --outfile=/tmp/rw.mjs && node /tmp/rw.mjs
 */
import { HawkPerchSolver, projectParcelToFeet } from './HawkPerchSolver';
import { typeParcelEdges, projectRoads } from './frontageDetect';
import { buildSolverInputs, explainBinding } from './ordinanceToSolver';

const SITES = [
  { name: 'Mims, Brevard County FL', lat: 28.7081, lon: -80.8621 },
  { name: 'Rockledge, Brevard County FL', lat: 28.3199, lon: -80.7301 },
  { name: 'Rural Karnes County TX', lat: 28.8853, lon: -97.9003 },
];

// Brevard County, verbatim from the SiteHawk registry.
const BREVARD = {
  jurisdiction: 'Brevard County',
  state: 'FL',
  height_limit_ft: 199,
  pe_fall_zone_allowed: true,
  collocation_required: true,
  setback_rule:
    'Setbacks (62-2422(1)): 2x proposed tower height from residential, child care, public and nonpublic school STRUCTURES (min 100 ft if no tower utilized). All other WTCFs: breakpoint design = 110% of top-to-breakpoint distance, PE certification of breakpoint design and fall radius required.',
  section_ref: 'Sec. 62-2420; 62-2422',
  source_url: 'https://library.municode.com/fl/brevard_county/codes/code_of_ordinances',
};

async function fetchRoads(lat: number, lon: number) {
  const d = 800 / 364000;
  const dLon = d / Math.max(0.15, Math.cos((lat * Math.PI) / 180));
  const q = `[out:json][timeout:20];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)$"](${lat - d},${lon - dLon},${lat + d},${lon + dLon});out geom;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ data: q }),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data: any = await res.json();
  return (data.elements || [])
    .filter((e: any) => Array.isArray(e.geometry) && e.geometry.length >= 2)
    .map((e: any) => ({
      coords: e.geometry.map((g: any) => [g.lon, g.lat] as [number, number]),
      name: e.tags?.name || undefined,
      klass: e.tags?.highway || undefined,
    }));
}

/** ~300 x 300 ft parcel centred on the site. */
function syntheticParcel(lat: number, lon: number): Array<[number, number]> {
  const half = 150 / 364000;
  const halfLon = half / Math.cos((lat * Math.PI) / 180);
  return [
    [lon - halfLon, lat - half],
    [lon + halfLon, lat - half],
    [lon + halfLon, lat + half],
    [lon - halfLon, lat + half],
  ];
}

let problems = 0;

for (const site of SITES) {
  console.log(`\n${'='.repeat(70)}\n${site.name}  (${site.lat}, ${site.lon})`);
  try {
    const rawRoads = await fetchRoads(site.lat, site.lon);
    console.log(`  OSM roads in range: ${rawRoads.length}`);
    const named = [...new Set(rawRoads.map((r: any) => r.name).filter(Boolean))];
    console.log(`  named: ${named.slice(0, 6).join(', ') || '(none named)'}`);
    const classes = rawRoads.reduce((acc: any, r: any) => {
      acc[r.klass] = (acc[r.klass] || 0) + 1;
      return acc;
    }, {});
    console.log(`  classes: ${JSON.stringify(classes)}`);

    const ring = syntheticParcel(site.lat, site.lon);
    const { points, toFeet } = projectParcelToFeet(ring);
    const frontage = typeParcelEdges(points, projectRoads(rawRoads, toFeet));

    console.log(`  FRONTAGE: ${frontage.method} · ${frontage.confidence}`);
    console.log(`    ${frontage.note}`);
    for (const d of frontage.diagnostics) {
      console.log(
        `    edge ${d.index}: ${d.type.padEnd(5)} ${Math.round(d.roadDistFt).toString().padStart(5)} ft to ${d.roadName || 'unnamed road'} (len ${Math.round(d.lengthFt)} ft)`
      );
    }

    // Sanity: exactly one rear at most, and fronts must be nearest.
    const fronts = frontage.edgeSpecs.filter((e) => e.type === 'front').length;
    const rears = frontage.edgeSpecs.filter((e) => e.type === 'rear').length;
    if (rears > 1) { console.log('  !! more than one rear edge'); problems++; }
    if (frontage.method === 'road_centerline' && fronts === 0) { console.log('  !! no front assigned'); problems++; }

    const inputs = buildSolverInputs(BREVARD, { coords: points, edgeSpecs: frontage.edgeSpecs });
    const solver = new HawkPerchSolver(inputs.config);
    const best = solver.findBestSite();
    console.log(
      `  SOLVER: max ${best.best.maxAchievableHeight.toFixed(1)} ft · rung ${best.best.rung} · headroom ${(best.headroomRatio * 100).toFixed(0)}%`
    );
    console.log(`    ${explainBinding(best.best.bindingConstraint, inputs, best.best.maxAchievableHeight)}`);
    if (!Number.isFinite(best.best.maxAchievableHeight)) { console.log('  !! non-finite height'); problems++; }
    if (!best.best.inParcel) { console.log('  !! best point outside parcel'); problems++; }
  } catch (e: any) {
    console.log(`  ERROR: ${e?.message || e}`);
    problems++;
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(problems === 0 ? 'No problems against live road data.' : `${problems} problem(s) found.`);
if (problems) process.exitCode = 1;
