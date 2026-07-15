/*
 * ScipHawk Fiber Map — provider layer specification.
 * Each provider's KMZ is imported (admin → /fiber-layers-admin) into the shared
 * Supabase PostGIS table `fiber_provider_routes` keyed by provider id.
 * Zayo routes through the pre-existing zayo_fiber_routes table.
 */
export const FIBER_PROVIDERS = [
  { id: "lumen", name: "Lumen / Level 3 Backbone", color: "#FF0000", showSplicePoints: true },
  { id: "arelion", name: "Arelion (Telia) Backbone", color: "#00AEEF", showSplicePoints: true },
  { id: "zayo", name: "Zayo Fiber", color: "#8A2BE2", showSplicePoints: true },
  { id: "everstream", name: "Everstream Metro Fiber", color: "#32CD32", showSplicePoints: true },
  { id: "crowncastle", name: "Crown Castle Fiber", color: "#FFD700", showSplicePoints: true },
  { id: "uniti", name: "Uniti Fiber", color: "#FF8C00", showSplicePoints: true },
  { id: "dfs", name: "Dark Fiber Systems (Florida)", color: "#00FF7F", showSplicePoints: true },
  { id: "openinfra", name: "OpenInfraMap Fiber", color: "#1E90FF", showSplicePoints: false },
];

// Command Center layer definitions — one toggleable layer per provider.
export const FIBER_PROVIDER_LAYERS = FIBER_PROVIDERS.map((p) => ({
  id: `fiberkmz_${p.id}`,
  group: "ScipHawk fiber (KMZ)",
  label: p.name,
  description: p.showSplicePoints ? "Imported KMZ routes & splice points" : "Imported KMZ routes",
  color: p.color,
  geometry: "line",
  source: "KMZ import",
  showSplicePoints: p.showSplicePoints,
}));