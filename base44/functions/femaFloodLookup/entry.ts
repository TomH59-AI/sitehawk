import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const NFHL_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";

const ZONE_DESCRIPTIONS = {
  "A":   "High Risk — 1% Annual Flood (No BFE)",
  "AE":  "High Risk — 1% Annual Flood (BFE Determined)",
  "AH":  "High Risk — 1% Shallow Flood (Ponding)",
  "AO":  "High Risk — 1% Shallow Flood (Sheet Flow)",
  "AR":  "High Risk — Reduced by Flood Control Restoration",
  "A99": "High Risk — Protected by Levee (Under Construction)",
  "V":   "High Risk Coastal — Wave Action (No BFE)",
  "VE":  "High Risk Coastal — Wave Action (BFE Determined)",
  "X":   "Minimal Risk — Outside 0.2% Annual Chance Flood",
  "B":   "Moderate Risk",
  "C":   "Minimal Risk",
  "D":   "Undetermined Risk",
};

function riskLevel(zone) {
  if (!zone) return "unknown";
  const z = zone.toUpperCase().trim();
  if (z.startsWith("A") || z.startsWith("V")) return "high";
  if (z === "X" || z === "C" || z === "B") return "minimal";
  return "undetermined";
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { lat, lon } = body;
    if (!lat || !lon) return Response.json({ error: "lat and lon required" }, { status: 400 });

    const params = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      spatialRel: "esriSpatialRelIntersects",
      inSR: "4326",
      outFields: "FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE",
      returnGeometry: "false",
      f: "json",
    });

    const res = await fetch(`${NFHL_URL}?${params}`, {
      headers: { "User-Agent": "SiteHawk/1.0", "Accept": "application/json" },
    });

    console.log(`[INFO] FEMA NFHL HTTP ${res.status} for ${lat},${lon}`);

    if (!res.ok) {
      return Response.json({ error: `FEMA service returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    console.log(`[INFO] FEMA NFHL features: ${data.features?.length ?? 0}`);

    if (!data.features || data.features.length === 0) {
      // No polygon intersection = outside SFHA = Zone X (minimal risk)
      return Response.json({
        fema_zone: "X",
        fema_zone_description: ZONE_DESCRIPTIONS["X"],
        fema_risk_level: "minimal",
        sfha: false,
        static_bfe: null,
        zone_subtype: null,
        source: "FEMA NFHL",
      });
    }

    const attrs = data.features[0].attributes;
    const zone = (attrs.FLD_ZONE || "X").trim().toUpperCase();
    const subtype = attrs.ZONE_SUBTY || null;
    const sfha = attrs.SFHA_TF === "T" || attrs.SFHA_TF === true;
    const bfe = attrs.STATIC_BFE > 0 ? attrs.STATIC_BFE : null;

    console.log(`[INFO] FEMA zone=${zone} sfha=${sfha} bfe=${bfe} user=${user.email}`);

    return Response.json({
      fema_zone: zone,
      fema_zone_description: ZONE_DESCRIPTIONS[zone] || `Zone ${zone}`,
      fema_risk_level: riskLevel(zone),
      sfha,
      static_bfe: bfe,
      zone_subtype: subtype,
      source: "FEMA NFHL",
    });

  } catch (error) {
    console.log(`[ERROR] femaFloodLookup: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});