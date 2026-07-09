import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// HawkFit — builds a Mapbox Static Images exhibit (parcel + fall zone +
// compound + tower pin) and records it as a MapExport (image_url + style).
// Returns a clear error if no Mapbox token is configured / image_url fails.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token =
      Deno.env.get("MAPBOX_ACCESS_TOKEN") ||
      Deno.env.get("VITE_MAPBOX_ACCESS_TOKEN") ||
      Deno.env.get("VITE_MAPBOX_TOKEN") ||
      Deno.env.get("VITE_SITEHAWK_MAPBOX_TOKEN") ||
      Deno.env.get("MAPBOX_API_KEY");
    if (!token) {
      return Response.json({ error: "Unable to create image_url: no Mapbox token configured (MAPBOX_ACCESS_TOKEN / MAPBOX_API_KEY)." }, { status: 500 });
    }

    const body = await req.json();
    const { tower_lat, tower_lon, parcel_geometry, fall_zone, compound, tower_scenario_id, site_target_id, zoom } = body || {};
    if (tower_lat == null || tower_lon == null) {
      return Response.json({ error: "Unable to create image_url: tower_lat and tower_lon required." }, { status: 400 });
    }

    const style = "satellite-streets-v12";
    const features = [];
    if (parcel_geometry) {
      features.push({ type: "Feature", properties: { stroke: "#00A3FF", "stroke-width": 3, "fill-opacity": 0 }, geometry: parcel_geometry });
    }
    if (fall_zone) {
      features.push({ type: "Feature", properties: { stroke: "#EF4444", "stroke-width": 2, fill: "#EF4444", "fill-opacity": 0.15 }, geometry: fall_zone.geometry || fall_zone });
    }
    if (compound) {
      features.push({ type: "Feature", properties: { stroke: "#F59E0B", "stroke-width": 2, fill: "#F59E0B", "fill-opacity": 0.25 }, geometry: compound.geometry || compound });
    }

    const camera = zoom ? `${tower_lon},${tower_lat},${zoom}` : "auto";
    const buildUrl = (feats) => {
      const overlays = [];
      if (feats.length) {
        overlays.push(`geojson(${encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features: feats }))})`);
      }
      overlays.push(`pin-l+e11d48(${tower_lon},${tower_lat})`);
      return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${overlays.join(",")}/${camera}/1024x768@2x?padding=60&access_token=${token}`;
    };

    // Static API URLs are capped (~8k chars) — drop the parcel outline if the
    // geometry pushes us over, keeping fall zone + compound + pin.
    let url = buildUrl(features);
    if (url.length > 8000 && parcel_geometry) {
      url = buildUrl(features.filter((f) => f.geometry !== parcel_geometry));
    }
    if (!url) {
      return Response.json({ error: "Unable to create image_url." }, { status: 500 });
    }

    const record = await base44.entities.MapExport.create({
      image_url: url,
      tower_scenario_id: tower_scenario_id || undefined,
      site_target_id: site_target_id || undefined,
      style,
    });

    return Response.json({ image_url: url, map_export_id: record.id, mapExport: record });
  } catch (error) {
    console.error("generateMapExhibit error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});