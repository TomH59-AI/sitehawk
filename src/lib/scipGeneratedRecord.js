export function toScipRecord(record) {
  const z = record.zoning || {};
  const t = record.targetA || {};
  const maps = record.maps || {};
  const row = (value, source = "SiteHawk pipeline") => ({ value: value || "", source, confidence: value ? "source-verified" : "unverified" });

  return {
    agent_name: record.agent_name,
    agent_phone: record.agent_phone,
    agent_email: record.agent_email,
    submittal_date: String(record.generated_at || new Date().toISOString()).slice(0, 10),
    site_name: record.site_name,
    latitude: Number(record.latitude),
    longitude: Number(record.longitude),
    search_radius: String(record.radius_miles),
    sarf_height: Number(record.tower_height_ft),
    county: record.county || "",
    state: record.state || "",
    map_image_url: record.sarf_map || maps.regional || "",
    zoning_jurisdiction: z.jurisdiction || "",
    zoning_report: Object.fromEntries(Object.entries(z).map(([key, value]) => [key, row(value, "Section 2 zoning pipeline")])),
    hawk_maps: {
      aerial_url: maps.aerial || "",
      topography_url: maps.topo || "",
      floodplain_url: maps.fema || "",
      zoning_url: maps.zoning || "",
      zone_code: z.district || "",
      center_amsl_ft: t.ground_elevation_ft ?? null,
    },
    parcel_targets: [{
      label: t.label || "Target A",
      owner_name: t.owner_name || "",
      parcel_address: t.parcel_address || "",
      parcel_city: t.parcel_city || "",
      parcel_zip: t.parcel_zip || "",
      apn: t.apn || "",
      acreage: t.acreage ?? null,
      boundaries: t.boundaries || "",
      zoning_classification: t.zoning_classification || z.district || "",
      mailing_address: t.mailing_address || "",
      latitude: Number(t.latitude),
      longitude: Number(t.longitude),
      fema_risk_factor: t.fema_risk_factor || record.conditions?.flood_zone || "",
      score: t.score ?? null,
      score_reasons: t.score_reasons || [],
      land_use: t.land_use || "",
    }],
    active_target_index: 0,
    existing_conditions: {
      flood_zone: record.conditions?.flood_zone || "",
      wetland_concerns: record.conditions?.wetlands || "",
      water_management_district: record.conditions?.water_management_district || "",
      hazardous_waste: record.conditions?.hazardous_waste || "",
      access_notes: record.conditions?.access_notes || "",
      local_police: record.conditions?.local_police || "",
      local_fire: record.conditions?.local_fire || "",
    },
    viewshed: record.viewshed || {},
    owner_contacts: {
      best_phone: t.owner_phone || "",
      best_email: t.owner_email || "",
      contact_person: t.contact_person || "",
    },
    power_airport_maps: {
      power: { name: record.conditions?.power_provider || "", map_url: maps.power || "" },
      airport: { name: record.conditions?.airport || "", map_url: maps.airport || "" },
    },
    rf_enrichment: {
      "0": {
        target_index: 0,
        target_lat: Number(t.latitude),
        target_lon: Number(t.longitude),
        rf: {
          airport: { map_url: maps.airport || "", name: record.conditions?.airport || "" },
          tower: { map_url: maps.celltower || "", name: record.conditions?.cell_tower || "" },
        },
        coverage: { png_url: maps.fiber || "" },
      },
    },
    status: "map_generated",
  };
}

export async function waitForScipQc(base44, id, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const record = await base44.entities.ScipRecord.get(id);
    if (record?.book_qc?.print_ready) return record;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Gemini quality check did not finish; printing remains locked.");
}