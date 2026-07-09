// HawkFit — resolves the one active Target A for the pipeline, in this exact
// priority/fallback order:
//   1. ScipRecord.parcel_targets[ScipRecord.active_target_index || 0]
//   2. SearchResult (parcel_geometry)
//   3. TowerSitingRun (parcel_geometry / siting_result)
//   4. TowerVisualization (realie_parcel_geometry)
//   5. Tower3DRender (parcel_geojson)
// A live pipeline Target A (Section 3 → ScipRecord.parcel_targets shape) takes
// the ScipRecord slot when provided, so HawkFit always follows the SCIP order.
import { base44 } from "@/api/base44Client";

const NEAR = 0.02; // ~1.3 mi — geometry must belong to the same parcel area
const near = (lat, lon, t) =>
  Math.abs(Number(lat) - Number(t.latitude)) < NEAR && Math.abs(Number(lon) - Number(t.longitude)) < NEAR;
const hasCoords = (t) => t && Number.isFinite(Number(t.latitude)) && Number.isFinite(Number(t.longitude));

function fromScipTarget(t) {
  return {
    address: t.parcel_address || null,
    parcel_id: t.apn || null,
    owner: t.owner_name || null,
    acreage: t.acreage ?? null,
    zoning: t.zoning_classification || null,
    jurisdiction: t.jurisdiction || null,
    latitude: Number(t.latitude),
    longitude: Number(t.longitude),
    parcel_geometry: null,
    source: "pipeline",
  };
}

// Ordered candidate list; each entry fetches recent rows and normalizes.
const SOURCES = [
  {
    name: "ScipRecord",
    async fetch() {
      const [scip] = await base44.entities.ScipRecord.list("-updated_date", 1);
      const t = scip?.parcel_targets?.[scip.active_target_index || 0];
      return t && hasCoords(t) ? [fromScipTarget(t)] : [];
    },
  },
  {
    name: "SearchResult",
    async fetch() {
      const rows = await base44.entities.SearchResult.list("-updated_date", 25);
      return rows.filter(hasCoords).map((r) => ({
        address: r.parcel_address || null, parcel_id: r.parcel_id || null, owner: r.owner_name || null,
        acreage: r.parcel_size_acres ?? null, zoning: r.zoning_classification || null,
        jurisdiction: r.zoning_jurisdiction || null, latitude: Number(r.latitude), longitude: Number(r.longitude),
        parcel_geometry: r.parcel_geometry || null, source: "SearchResult",
      }));
    },
  },
  {
    name: "TowerSitingRun",
    async fetch() {
      const rows = await base44.entities.TowerSitingRun.list("-updated_date", 25);
      return rows
        .map((r) => ({
          address: r.property_address || null, parcel_id: r.parcel_id || null, owner: null,
          acreage: null, zoning: null, jurisdiction: r.jurisdiction_name || null,
          latitude: Number(r.parcel_centroid_lat), longitude: Number(r.parcel_centroid_lon),
          parcel_geometry: r.parcel_geometry || null, source: "TowerSitingRun",
          siting_result: r.siting_result || null, run_id: r.id,
        }))
        .filter(hasCoords);
    },
  },
  {
    name: "TowerVisualization",
    async fetch() {
      const rows = await base44.entities.TowerVisualization.list("-updated_date", 25);
      return rows
        .map((r) => ({
          address: r.property_address || null, parcel_id: r.realie_parcel_id || null,
          owner: r.realie_owner_name || null, acreage: r.realie_acreage ?? null,
          zoning: r.realie_zoning_classification || null, jurisdiction: r.notion_jurisdiction || null,
          latitude: Number(r.realie_centroid_lat), longitude: Number(r.realie_centroid_lon),
          parcel_geometry: r.realie_parcel_geometry || null, source: "TowerVisualization",
        }))
        .filter(hasCoords);
    },
  },
  {
    name: "Tower3DRender",
    async fetch() {
      const rows = await base44.entities.Tower3DRender.list("-updated_date", 25);
      return rows
        .map((r) => ({
          address: r.property_address || null, parcel_id: r.parcel_id || null, owner: null,
          acreage: null, zoning: null, jurisdiction: null,
          latitude: Number(r.centroid_lat), longitude: Number(r.centroid_lon),
          parcel_geometry: r.parcel_geojson || null, source: "Tower3DRender",
        }))
        .filter(hasCoords);
    },
  },
];

// Resolve the active Target A. `pipelineTarget` (Section 3 / SCIP parcel_targets
// shape) takes ScipRecord priority when supplied. If the winning target lacks
// parcel geometry, the remaining sources backfill geometry for the SAME parcel.
export async function resolveActiveTargetA({ pipelineTarget } = {}) {
  let target = null;
  let sourceName = null;

  if (hasCoords(pipelineTarget)) {
    target = fromScipTarget(pipelineTarget);
    sourceName = "ScipRecord";
  }

  for (const src of SOURCES) {
    if (target && target.parcel_geometry) break;
    let rows = [];
    try { rows = await src.fetch(); } catch { rows = []; }
    if (!rows.length) continue;
    if (!target) {
      target = rows[0];
      sourceName = src.name;
    } else if (!target.parcel_geometry) {
      const match = rows.find((r) => r.parcel_geometry && near(target.latitude, target.longitude, r));
      if (match) {
        target.parcel_geometry = match.parcel_geometry;
        target.parcel_id = target.parcel_id || match.parcel_id;
        target.jurisdiction = target.jurisdiction || match.jurisdiction;
        if (match.run_id) target.tower_siting_run_id = match.run_id;
      }
    }
  }

  return target ? { target, source: sourceName } : null;
}

// Latest TowerSitingRun + Tower3DRender tied to the resolved Target A parcel —
// used by the HawkFit 3D preview (never a disconnected demo).
export async function resolve3DContext(target) {
  if (!hasCoords(target)) return null;
  try {
    const runs = await base44.entities.TowerSitingRun.list("-updated_date", 25);
    const run = runs.find((r) => hasCoords({ latitude: r.parcel_centroid_lat, longitude: r.parcel_centroid_lon })
      && near(r.parcel_centroid_lat, r.parcel_centroid_lon, target));
    if (!run) return null;
    const renders = await base44.entities.Tower3DRender.filter({ tower_siting_run_id: run.id }, "-updated_date", 1);
    return { run, render: renders[0] || null };
  } catch {
    return null;
  }
}