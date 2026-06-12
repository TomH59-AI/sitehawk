// brandedLabels.js — display names ONLY, internal IDs unchanged.
// Anywhere the UI (or a printed/exported output) renders a data-layer or
// data-source name, pull from these maps instead of the raw provider name.
// Mapbox attribution is legally required on standard plans — never strip it.

export const LAYER_LABELS = {
  "nwi-wetlands": "SiteHawk Wetlands Intelligence",
  "sh-contour-lines": "SiteHawk Terrain Analysis",
  "parcel-data": "HawkVision Parcel Intelligence",
  "fema-flood": "Flood Risk Layer",
  "zoning-intel": "HawkLaw Zoning Intelligence",
};

// Provider → branded source label for captions, banners and SCIP footers.
export const SOURCE_LABELS = {
  zoneomics: "HawkLaw Zoning Intelligence",
  realie: "HawkVision Parcel Intelligence",
  "usfws-nwi": "SiteHawk Wetlands Intelligence",
  "fema-nfhl": "Flood Risk Layer",
  hifld: "SiteHawk Grid Intelligence",
  carrierfinder: "SiteHawk Fiber Intelligence",
  enformion: "Hawk Skip-Trace",
};

export const brandLabel = (id) => LAYER_LABELS[id] || SOURCE_LABELS[id] || id;