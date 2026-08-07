/**
 * talonfitSolve — the deterministic feasibility screen behind the TalonFit agent.
 *
 * The agent COORDINATES; this function COMPUTES. No language model touches the
 * geometry: the same HawkPerchSolver that drives the map and the cursor probe
 * produces these numbers, so the agent's answer and the screen's answer can
 * never disagree.
 *
 * Pipeline:
 *   1. Ordinance rules for the governing jurisdiction (registry first).
 *   2. Edge typing ONLY IF the effective setbacks differ per edge. Registry
 *      records store one setback applied to every line — the way tower
 *      ordinances are actually written — so the common case needs no road data
 *      at all, and Overpass (observed 504ing under load) stays off the
 *      critical path.
 *   3. Solve the parcel: best site, max height, rung, binding constraint.
 *   4. Grade any supplied candidate points as Targets A / B / C.
 *   5. If the ordinance offers a PE fall-zone reduction, solve that scenario too.
 *
 * POST {
 *   parcel_ring: [[lon,lat], ...],        // required
 *   jurisdiction?, state?,                 // ordinance lookup (else supply ordinance)
 *   ordinance?: {...},                     // pre-fetched registry record
 *   targets?: [[lon,lat], ...],            // candidate points to rank
 *   certified_radius_ft?: number,          // engineer-supplied breakpoint radius
 *   proposed_height_ft?: number,           // defaults to the district cap
 *   existing_towers?: [[lon,lat], ...],
 *   residential_edge_indices?: number[]    // which ring edges abut residential
 *                                          // (from adjacent-parcel zoning — Realie)
 * }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { HawkPerchSolver, projectParcelToFeet } from '../../shared/hawkPerchSolver.ts';
import { buildSolverInputs, explainBinding } from '../../shared/ordinanceToSolver.ts';
import { typeParcelEdges, projectRoads } from '../../shared/frontageDetect.ts';
import { computeResidentialAdjacency } from '../../shared/residentialAdjacency.ts';
import { findOrdinance } from '../../shared/telecomOrdinance.ts';

const TARGET_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * Neighbouring parcels from Realie, for residential adjacency. The radius
 * scales with the subject parcel so a large rural lot still captures its
 * neighbours. Returns null on any failure — which the caller must treat as
 * "could not check", never as "no residential neighbours".
 */
async function fetchNeighbors(lat: number, lon: number, extentFt: number) {
  const apiKey = Deno.env.get('REALIE_API_KEY');
  if (!apiKey) return null;
  const radiusMiles = Math.min(0.5, Math.max(0.05, (extentFt / 2 + 300) / 5280));
  try {
    const url = `https://app.realie.ai/api/public/property/location/?${new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      radius: String(radiusMiles),
      limit: '80',
      offset: '0',
      includeUnassignedAddress: 'true',
    })}`;
    const r = await fetch(url, { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const data = await r.json();
    return data?.properties || [];
  } catch {
    return null;
  }
}

async function fetchRoads(lat: number, lon: number) {
  const radiusFt = 800;
  const degLat = radiusFt / 364000;
  const degLon = degLat / Math.max(0.15, Math.cos((lat * Math.PI) / 180));
  const query = `[out:json][timeout:20];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)$"](${lat - degLat},${lon - degLon},${lat + degLat},${lon + degLon});
out geom;`;

  // Public Overpass instances return 504 and 429 under load with some
  // regularity — observed live during testing. Three mirrors, and a failure
  // across all of them degrades to default_side rather than to a wrong
  // frontage, because an unverified front setback is the dangerous answer.
  for (const endpoint of [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter',
  ]) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'SiteHawk/1.0 (TalonFit)',
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      return (data.elements || [])
        .filter((el: any) => Array.isArray(el.geometry) && el.geometry.length >= 2)
        .map((el: any) => ({
          coords: el.geometry.map((g: any) => [g.lon, g.lat] as [number, number]),
          name: el.tags?.name || undefined,
          klass: el.tags?.highway || undefined,
        }));
    } catch {
      /* try the next mirror */
    }
  }
  return null; // null = could not check, which is NOT the same as "no roads"
}

function describe(grade: any, inputs: any, toLngLat: (p: any) => [number, number]) {
  const [lon, lat] = toLngLat(grade.point);
  return {
    lat,
    lon,
    max_height_ft: Math.round(grade.maxAchievableHeight * 10) / 10,
    rung: grade.rung,
    ladder_points: grade.ladderPoints,
    in_parcel: grade.inParcel,
    binding_constraint: grade.bindingConstraint,
    why: explainBinding(grade.bindingConstraint, inputs, grade.maxAchievableHeight),
    nearest_line_ft: Math.round(grade.nearestEdgeFt * 10) / 10,
    violations: grade.violations.map((v: any) => ({ code: v.code, kind: v.kind, message: v.message })),
  };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const ring = body.parcel_ring;
    if (!Array.isArray(ring) || ring.length < 3) {
      return Response.json({ error: 'parcel_ring with at least 3 [lon,lat] points is required' }, { status: 400 });
    }

    // 1. Rules. Registry first — the agent can pass a record it already fetched.
    let ordinance = body.ordinance || null;
    if (!ordinance && body.state && body.jurisdiction) {
      const svc = { entities: base44.asServiceRole.entities };
      const { row } = await findOrdinance(svc, String(body.state).toUpperCase(), String(body.jurisdiction)).catch(() => ({ row: null }));
      ordinance = row;
    }

    const { points, toFeet, toLngLat } = projectParcelToFeet(ring);
    const centroid = ring.reduce(
      (acc: number[], c: number[]) => [acc[0] + c[0] / ring.length, acc[1] + c[1] / ring.length],
      [0, 0]
    );

    // 2. Edge typing — only when it can change the answer.
    //    With a uniform setback (every registry record today, and the SiteHawk
    //    default) front/side/rear typing is a no-op, so no road fetch happens.
    //    Residential adjacency comes from the caller (adjacent-parcel zoning),
    //    not from roads — roads cannot tell you what the neighbour is zoned.
    let residentialIdx: number[] = Array.isArray(body.residential_edge_indices)
      ? body.residential_edge_indices.filter((i: any) => Number.isInteger(i) && i >= 0)
      : [];

    const prelim = buildSolverInputs(ordinance, { coords: points });

    // 2a. Residential adjacency — automatic, like the zoning lookup.
    //     Runs only when the ordinance actually has a residential separation
    //     rule and the caller has not supplied the indices. Registry-first
    //     philosophy applied to parcel data: check the source that can answer,
    //     spend nothing when the rule does not exist.
    let residentialAdjacency: any = { checked: false, source: residentialIdx.length ? 'caller' : 'not_needed' };
    let adjacencyChecked = residentialIdx.length > 0;
    if (prelim.config.residentialSeparation && !residentialIdx.length) {
      const xs = points.map((p: any) => p.x);
      const ys = points.map((p: any) => p.y);
      const extentFt = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      const neighbors = await fetchNeighbors(centroid[1], centroid[0], extentFt);
      if (neighbors === null) {
        // Could not check. The buildSolverInputs warning path stays active and
        // the report keeps saying the rule was NOT applied.
        residentialAdjacency = { checked: false, source: 'realie_unavailable' };
      } else {
        const adj = computeResidentialAdjacency({ subjectRing: points, neighbors, toFeet });
        residentialIdx = adj.indices;
        adjacencyChecked = true;
        residentialAdjacency = {
          checked: true,
          source: 'realie',
          neighbors_checked: adj.neighborsChecked,
          residential_neighbors: adj.residentialNeighbors,
          edges_flagged: adj.indices,
        };
      }
    }
    const sb = prelim.config.setbacks;
    const uniformSetbacks = sb.front === sb.side && sb.side === sb.rear;

    let edgeSpecs: any = undefined;
    let frontage: any;
    if (uniformSetbacks) {
      if (residentialIdx.length) {
        edgeSpecs = points.map((_: any, i: number) => ({
          type: 'side',
          abutsResidential: residentialIdx.includes(i),
        }));
      }
      frontage = {
        method: 'not_required',
        confidence: 'high',
        note: `A single ${sb.front} ft setback applies to every property line, so frontage typing cannot change the answer. Road data was not fetched.`,
        edges: [],
        road_data_available: null,
      };
    } else {
      // Per-edge rules are in play — fetch roads. A fetch failure must degrade
      // to default_side, never to a guessed frontage.
      const rawRoads = await fetchRoads(centroid[1], centroid[0]);
      const typed = typeParcelEdges(points, rawRoads ? projectRoads(rawRoads, toFeet) : [], {
        residentialEdgeIndices: residentialIdx,
      });
      if (rawRoads === null) {
        typed.note = 'Road data was unavailable, so every property line is treated as a side line. The front setback has NOT been applied — re-run before relying on this.';
      }
      edgeSpecs = typed.edgeSpecs;
      frontage = {
        method: typed.method,
        confidence: typed.confidence,
        note: typed.note,
        edges: typed.diagnostics,
        road_data_available: rawRoads !== null,
      };
    }

    // 3. Solve.
    const existingTowers = (body.existing_towers || [])
      .filter((t: any) => Array.isArray(t) && Number.isFinite(t[0]) && Number.isFinite(t[1]))
      .map((t: any) => ({ point: toFeet(t[0], t[1]) }));

    const inputs = buildSolverInputs(
      ordinance,
      { coords: points, edgeSpecs },
      { certifiedRadiusFt: body.certified_radius_ft ?? null, existingTowers, residentialAdjacencyChecked: adjacencyChecked }
    );
    const solver = new HawkPerchSolver(inputs.config);
    const bestResult = solver.findBestSite();

    // 4. Targets A / B / C.
    const targetPoints = (body.targets || [])
      .filter((t: any) => Array.isArray(t) && Number.isFinite(t[0]) && Number.isFinite(t[1]))
      .map((t: any) => toFeet(t[0], t[1]));
    const ranked = targetPoints.length ? solver.rankTargets(targetPoints) : [];

    // 5. The PE scenario, only when the ordinance actually allows it and the
    //    caller has NOT already supplied an engineered radius.
    let peScenario: any = null;
    if (inputs.peReductionAvailable && !Number.isFinite(body.certified_radius_ft)) {
      const probe = Math.max(40, Math.round((bestResult.best.nearestEdgeFt || 60) * 0.6));
      const peInputs = buildSolverInputs(
        ordinance,
        { coords: points, edgeSpecs },
        { certifiedRadiusFt: probe, existingTowers, residentialAdjacencyChecked: adjacencyChecked }
      );
      const peBest = new HawkPerchSolver(peInputs.config).findBestSite();
      peScenario = {
        modelled_radius_ft: probe,
        max_height_ft: Math.round(peBest.best.maxAchievableHeight * 10) / 10,
        rung: peBest.best.rung,
        gain_ft: Math.round((peBest.best.maxAchievableHeight - bestResult.best.maxAchievableHeight) * 10) / 10,
        caveat:
          'ILLUSTRATIVE ONLY. This models what a PE-certified collapse radius could unlock; it is not an engineered value. A licensed PE must produce the actual breakpoint design.',
      };
    }

    const proposed = Number.isFinite(body.proposed_height_ft) ? body.proposed_height_ft : inputs.config.maxHeightLimit;
    const bestValidation = solver.validateLocation(bestResult.best.point, proposed);

    return Response.json({
      ok: true,
      jurisdiction: ordinance?.jurisdiction || body.jurisdiction || null,
      state: ordinance?.state || body.state || null,
      rules: {
        source: ordinance ? 'sitehawk_registry' : 'sitehawk_defaults',
        verification_status: ordinance?.verification_status || null,
        height_cap_ft: inputs.config.maxHeightLimit,
        setbacks: inputs.config.setbacks,
        fall_zone: inputs.config.fallZone,
        residential_separation: inputs.config.residentialSeparation || null,
        pe_reduction_available: inputs.peReductionAvailable,
        pe_letter_required: inputs.peLetterRequired,
        assumed_fields: inputs.assumedFields,
        provenance: inputs.provenance,
        notes: inputs.notes,
      },
      frontage,
      residential_adjacency: residentialAdjacency,
      best_site: describe(bestResult.best, inputs, toLngLat),
      headroom_ratio: Math.round(bestResult.headroomRatio * 1000) / 1000,
      proposed_height_ft: proposed,
      proposed_height_ok: bestValidation.valid,
      proposed_height_codes: bestValidation.codes,
      targets: ranked.map((g, i) => ({ label: TARGET_LABELS[i] || `T${i + 1}`, ...describe(g, inputs, toLngLat) })),
      pe_scenario: peScenario,
      disclaimer:
        'Geometry is deterministic and reproducible. Ordinance values marked as assumed are SiteHawk defaults, not code text — confirm those with the planning department before relying on them.',
    });
  } catch (error) {
    console.error('[talonfitSolve] error:', error?.message || String(error));
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
