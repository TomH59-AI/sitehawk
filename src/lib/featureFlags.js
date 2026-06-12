// Central feature flags for the Results experience.
// Flip these without redeploying components.
//
// FEATURE_LEAFLET_MAP — render the legacy Leaflet results map alongside the
// new Mapbox headline map. Default false. Flip to true ONLY as a fallback
// if the Mapbox headline map fails during a live demo.
export const FEATURE_LEAFLET_MAP = false;

// feature_tower_siter — HawkPerch Tower Siter. Ships dark: the /tower-siter
// route exists, but the page is NOT linked from any nav until this flips true.
export const FEATURE_TOWER_SITER = false;