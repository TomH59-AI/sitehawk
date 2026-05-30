import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * scipPowerAirportMaps — two Target A SCIP maps:
 *   1) POWER  — nearest ElectricProvider (geocoded power asset) connected to the
 *      tower site, with a line overlay + provider company name & contact address.
 *      Owner/voltage context pulled from the PowerTransmissionLine dataset.
 *   2) AIRPORT — property waypoint + colored radius ring + nearest airport (plane
 *      icon), with crow-flies distance in imperial (miles / feet).
 *
 * Both render via Mapbox Static (bbox-centered, @2x), zero extra paid APIs.
 */

const MAPBOX_STATIC = "https://api.mapbox.com/styles/v1";
const WIDTH = 1024;
const HEIGHT = 1280;

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function norm(s) {
  return (s || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// bbox centered on the site, sized so the radius ring fits with margin.
function computeBbox(lat, lng, radiusMi) {
  const lngDelta = (radiusMi * 1.6) / (69 * Math.cos(lat * Math.PI / 180));
  const latDelta = lngDelta / (WIDTH / HEIGHT);
  return [lng - lngDelta, lat - latDelta, lng + lngDelta, lat + latDelta];
}

// geojson circle (radius ring) as a colored polyline overlay.
function ringOverlay(lat, lng, radiusMi, color) {
  const pts = [];
  const R = 3958.7613;
  for (let b = 0; b <= 360; b += 12) {
    const br = (b * Math.PI) / 180;
    const dr = radiusMi / R;
    const la = Math.asin(Math.sin(lat * Math.PI / 180) * Math.cos(dr) + Math.cos(lat * Math.PI / 180) * Math.sin(dr) * Math.cos(br));
    const lo = (lng * Math.PI) / 180 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(lat * Math.PI / 180), Math.cos(dr) - Math.sin(lat * Math.PI / 180) * Math.sin(la));
    pts.push([(lo * 180) / Math.PI, (la * 180) / Math.PI]);
  }
  const gj = {
    type: "Feature",
    properties: { stroke: color, "stroke-width": 3, "stroke-opacity": 0.9, fill: color, "fill-opacity": 0.08 },
    geometry: { type: "Polygon", coordinates: [pts] },
  };
  return `geojson(${encodeURIComponent(JSON.stringify(gj))})`;
}

function lineOverlay(lat1, lng1, lat2, lng2, color) {
  const gj = {
    type: "Feature",
    properties: { stroke: color, "stroke-width": 3 },
    geometry: { type: "LineString", coordinates: [[lng1, lat1], [lng2, lat2]] },
  };
  return `geojson(${encodeURIComponent(JSON.stringify(gj))})`;
}

function buildUrl({ style, overlays, lat, lng, radiusMi, token }) {
  const bbox = computeBbox(lat, lng, radiusMi);
  const bboxStr = `[${bbox.join(",")}]`;
  const parts = overlays.filter(Boolean).join(",");
  return `${MAPBOX_STATIC}/${style}/static/${parts}/${bboxStr}/${WIDTH}x${HEIGHT}@2x?access_token=${token}&attribution=false&logo=false`;
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { lat, lon, radius_miles = 1.0, state, zip } = body || {};
    const cLat = Number(lat), cLon = Number(lon);
    if (!Number.isFinite(cLat) || !Number.isFinite(cLon)) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }
    const radiusMi = Number(radius_miles) || 1.0;
    const token = Deno.env.get("MAPBOX_ACCESS_TOKEN");
    if (!token) return Response.json({ error: "MAPBOX_ACCESS_TOKEN not configured" }, { status: 500 });

    const fallbacks = [];

    // ───────── POWER: nearest ElectricProvider + transmission-line owner context ─────────
    let power = null;
    try {
      // 1) Provider directory (has coords + contact). Narrow by state if given.
      let providers = [];
      if (state) providers = await base44.asServiceRole.entities.ElectricProvider.filter({ STATE: state.toUpperCase() }, undefined, 2000);
      if (!providers.length && zip) providers = await base44.asServiceRole.entities.ElectricProvider.filter({ ZIP: String(zip) }, undefined, 500);
      if (!providers.length) providers = await base44.asServiceRole.entities.ElectricProvider.list(undefined, 3000);

      const ranked = providers
        .filter((c) => c.LATITUDE != null && c.LONGITUDE != null)
        .map((c) => ({ c, mi: haversineMiles(cLat, cLon, Number(c.LATITUDE), Number(c.LONGITUDE)) }))
        .sort((a, b) => a.mi - b.mi);

      const best = ranked[0]?.c || null;

      // 2) Transmission-line context (owner / voltage) — match provider name in the
      //    PowerTransmissionLine dataset (no coords there, owner/kv text only).
      let line = null;
      if (best?.NAME) {
        const target = norm(best.NAME);
        const lines = await base44.asServiceRole.entities.PowerTransmissionLine.list(undefined, 3000);
        line = lines.find((l) => {
          const o = norm(l.owner);
          return o && (o === target || o.includes(target) || target.includes(o));
        }) || null;
      }

      if (best) {
        const provLat = Number(best.LATITUDE), provLng = Number(best.LONGITUDE);
        const mi = parseFloat(haversineMiles(cLat, cLon, provLat, provLng).toFixed(2));
        const overlays = [
          ringOverlay(cLat, cLon, radiusMi, "#1B3FAE"),
          lineOverlay(cLat, cLon, provLat, provLng, "#f59e0b"),
          `pin-l-electric+f59e0b(${provLng},${provLat})`,
          `pin-l-marker+ff3b30(${cLon},${cLat})`,
        ];
        power = {
          map_url: buildUrl({ style: "mapbox/satellite-streets-v12", overlays, lat: cLat, lng: cLon, radiusMi, token }),
          provider_name: best.NAME,
          provider_type: best.TYPE || null,
          provider_phone: best.TELEPHONE || null,
          provider_website: best.WEBSITE || null,
          provider_address: [best.ADDRESS, best.CITY, best.STATE, best.ZIP].filter(Boolean).join(", "),
          distance_miles: mi,
          distance_feet: Math.round(mi * 5280),
          line_owner: line?.owner || best.NAME,
          line_voltage_kv: line?.kv || null,
          line_voltage_class: line?.vclass || null,
          line_endpoints: line ? [line.from, line.to].filter(Boolean).join(" → ") : null,
        };
      } else {
        fallbacks.push("power:no_provider");
      }
    } catch (e) {
      fallbacks.push(`power:${e.message}`);
      console.log(`[INFO] POWER_FALLBACK ${e.message}`);
    }

    // ───────── AIRPORT: nearest airport + radius ring + plane icon ─────────
    let airport = null;
    try {
      const deltas = [0.3, 0.6, 1.2, 2.5, 5.0];
      let candidates = [];
      for (const d of deltas) {
        candidates = await base44.asServiceRole.entities.Airport.filter({
          latitude_deg: { $gte: cLat - d, $lte: cLat + d },
          longitude_deg: { $gte: cLon - d, $lte: cLon + d },
        }, null, 2000);
        if (candidates && candidates.length) break;
      }
      let best = null, bestMi = Infinity;
      for (const a of (candidates || [])) {
        const mi = haversineMiles(cLat, cLon, a.latitude_deg, a.longitude_deg);
        if (mi < bestMi) { bestMi = mi; best = a; }
      }
      if (best) {
        const aLat = Number(best.latitude_deg), aLng = Number(best.longitude_deg);
        const mi = parseFloat(bestMi.toFixed(2));
        const overlays = [
          ringOverlay(cLat, cLon, radiusMi, "#1B3FAE"),
          lineOverlay(cLat, cLon, aLat, aLng, "#0a84ff"),
          `pin-l-airfield+0a84ff(${aLng},${aLat})`,
          `pin-l-marker+ff3b30(${cLon},${cLat})`,
        ];
        airport = {
          map_url: buildUrl({ style: "mapbox/satellite-streets-v12", overlays, lat: cLat, lng: cLon, radiusMi, token }),
          airport_name: best.airport_name || best.airport_callnumber,
          airport_callnumber: best.airport_callnumber,
          airport_type: best.airport_type || null,
          distance_miles: mi,
          distance_feet: Math.round(mi * 5280),
          distance_label: `${mi} mi / ${Math.round(mi * 5280).toLocaleString()} ft as the hawk flies`,
        };
      } else {
        fallbacks.push("airport:no_airport");
      }
    } catch (e) {
      fallbacks.push(`airport:${e.message}`);
      console.log(`[INFO] AIRPORT_FALLBACK ${e.message}`);
    }

    return Response.json({
      power,
      airport,
      _meta: { radius_miles: radiusMi, fallbacks, duration_ms: Date.now() - t0 },
    });
  } catch (error) {
    console.log(`[ERROR] scipPowerAirportMaps: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});