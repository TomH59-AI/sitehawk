/**
 * section4Maps — barrel module for the HAWK TARGET A MAP SUITE (Section 4).
 *
 * The renderers were split into focused files under src/lib/section4/ for
 * maintainability. This barrel re-exports the SAME public API so every existing
 * import (`@/lib/section4Maps`) keeps working unchanged:
 *   - mapCore            → shared helpers, loader, markers, geometry, overlays
 *   - environmentMaps    → aerial, topo, fema, wetlands, wind
 *   - zoningMaps         → zoning (raster/grid), FLUM, Regrid zoning/FLU map
 *   - infrastructureMaps → airport, cell tower, fiber, power
 *   - parcelMap          → Realie parcel ring map
 *
 * Every map centers on TARGET A only.
 */

export {
  BRAND_GREEN,
  buildCircle,
  ensureMapboxLoaded,
} from "./section4/mapCore";

export {
  renderAerial,
  renderTopo,
  renderFema,
  renderWetlands,
  renderWind,
} from "./section4/environmentMaps";

export {
  zoneomicsTileTemplate,
  probeZoneomicsTile,
  renderZoning,
  renderZoningGrid,
  renderFlum,
  renderFlumPolygon,
  renderRegridZoningMap,
} from "./section4/zoningMaps";

export {
  renderAirport,
  renderCellTower,
  renderFiber,
  fetchPowerInfrastructure,
  renderPower,
} from "./section4/infrastructureMaps";

export {
  renderParcel,
} from "./section4/parcelMap";

export {
  renderFiberOptics,
} from "./section4/fiberOpticsMap";