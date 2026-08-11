/**
 * siteSitterFeasibility — roll TalonFitRunLog rows (the SiteSitter™ feasibility
 * engine's audit log) up to one entry per site: the MOST RECENT run wins.
 * Values are passed through verbatim — no rounding of compliance math, no
 * invented fields. Missing values stay null and render as "No data available".
 */

// A site is identified by its parcel when known, else its exact coordinates.
function siteKey(r) {
  if (r.parcel_id) return `apn:${r.parcel_id}`;
  return `xy:${r.latitude},${r.longitude}`;
}

function runTime(r) {
  return new Date(r.run_timestamp_utc || r.created_date || 0).getTime();
}

export function rollUpSites(runs) {
  const byKey = new Map();
  for (const r of runs || []) {
    const k = siteKey(r);
    const prev = byKey.get(k);
    if (!prev) byKey.set(k, { latest: r, runCount: 1 });
    else {
      prev.runCount += 1;
      if (runTime(r) > runTime(prev.latest)) prev.latest = r;
    }
  }
  const sites = Array.from(byKey.values()).map(({ latest, runCount }) => ({
    key: siteKey(latest),
    run_count: runCount,
    parcel_id: latest.parcel_id || null,
    jurisdiction: latest.jurisdiction || null,
    latitude: latest.latitude ?? null,
    longitude: latest.longitude ?? null,
    tower_height_ft: latest.tower_height_ft ?? null,
    max_height_ft: latest.max_height_ft ?? null,
    binding_constraint: latest.binding_constraint || null,
    result_class: latest.result_class || null,
    feasible: latest.feasible === true,
    run_timestamp_utc: latest.run_timestamp_utc || latest.created_date || null,
  }));

  // Best build opportunities first: feasible sites, then greatest buildable height.
  sites.sort((a, b) => {
    if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
    return (b.max_height_ft ?? -1) - (a.max_height_ft ?? -1);
  });
  return sites;
}

export function summarize(sites) {
  const feasible = sites.filter((s) => s.feasible);
  const heights = feasible.map((s) => s.max_height_ft).filter((h) => Number.isFinite(h));
  return {
    total: sites.length,
    feasible: feasible.length,
    ejected: sites.length - feasible.length,
    best_height_ft: heights.length ? Math.max(...heights) : null,
  };
}

// Height in feet, never rounded — compliance math depends on the exact value.
export function formatFt(v) {
  return Number.isFinite(v) ? `${v} ft` : "No data available";
}