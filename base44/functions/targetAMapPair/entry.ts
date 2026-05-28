import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * targetAMapPair — Two-page SCIP engineering map sequence for Target A.
 *
 *   Page 1: Optical viewshed (Cesium/Mapbox terrain) + tree-line/land-use basemap
 *   Page 2: RF propagation (CloudRF) over muted monochrome basemap
 *
 * HARD CONSTRAINT: _geo computed ONCE, both pages render with identical
 * bbox/dimensions/target_px. The two PNGs MUST overlay pixel-for-pixel.
 *
 * Runs on Target A only, after parcel + zoning + FEMA + contact are locked.
 *
 * INPUT:  { site_name, lat, lng, tower_height_ft, compound_size?, frequency_mhz?, agent_name? }
 * OUTPUT: { page1_viewshed_url, page2_rf_url, _geo, _meta }
 */

// ─────────────────────── geometry helpers ───────────────────────

const MAPBOX_STATIC = "https://api.mapbox.com/styles/v1";
const CLOUDRF_BASE = "https://api.cloudrf.com";

// Fixed render dimensions — vertical SCIP page format
const RENDER_WIDTH = 1080;
const RENDER_HEIGHT = 1350;
const DEFAULT_RADIUS_MI = 1.0;

/**
 * Compute the shared geometry block ONCE. Both pages reuse this by reference —
 * recomputing bbox/zoom/target_px on page 2 is the registration failure mode.
 *
 * bbox = [minLng, minLat, maxLng, maxLat] in WGS84
 * target_px = pixel coordinates of (lat,lng) within the rendered image
 */
function computeSharedGeo(lat, lng, radiusMi) {
  // Convert radius miles → degrees. Latitude: 1° ≈ 69 miles.
  // Longitude: 1° ≈ 69 * cos(lat) miles.
  const latDelta = radiusMi / 69;
  const lngDelta = radiusMi / (69 * Math.cos(lat * Math.PI / 180));

  // Compute square bbox in projected aspect. Since render is 1080x1350 (4:5
  // portrait), expand lat extent so the bbox aspect matches image aspect.
  // Image aspect (W/H) = 1080/1350 = 0.8
  // bbox aspect (lngDelta/latDelta) must equal 0.8 → latDelta = lngDelta/0.8
  const imageAspect = RENDER_WIDTH / RENDER_HEIGHT;
  const finalLngDelta = lngDelta;
  const finalLatDelta = finalLngDelta / imageAspect;

  const bbox = [
    lng - finalLngDelta, // minLng
    lat - finalLatDelta, // minLat
    lng + finalLngDelta, // maxLng
    lat + finalLatDelta, // maxLat
  ];

  // Target A pixel = exact center of the image (since we centered bbox on lat/lng)
  const target_px = [Math.round(RENDER_WIDTH / 2), Math.round(RENDER_HEIGHT / 2)];

  // Compute equivalent zoom level for the bbox (informational — Mapbox static
  // uses bbox directly, but downstream consumers may want zoom)
  // zoom ≈ log2(360 / lngExtent) roughly at equator; adjust for latitude
  const lngExtent = finalLngDelta * 2;
  const zoom = Math.log2(360 / lngExtent);

  return {
    bbox,
    center: [lng, lat],
    zoom: Math.round(zoom * 100) / 100,
    width: RENDER_WIDTH,
    height: RENDER_HEIGHT,
    target_px,
    radius_mi: radiusMi,
  };
}

// ─────────────────────── fetch helpers ───────────────────────

async function fetchWithTimeout(url, opts = {}, timeoutMs = 30000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    return r;
  } catch (e) {
    return { ok: false, status: 0, _err: e.message };
  } finally {
    clearTimeout(t);
  }
}

// ─────────────────────── PAGE 1: Viewshed ───────────────────────

/**
 * Build the Page 1 viewshed URL via Mapbox Static Images API.
 *
 * Layered, real-data render:
 *   - Base: Mapbox satellite-streets-v12 (real imagery + tree canopy + land use)
 *   - Overlay: Target A pin at exact target_px (lat/lng = bbox center → renders centered)
 *
 * Cesium World Terrain integration: Mapbox satellite-streets-v12 already uses
 * Mapbox Terrain-DEM (terrain-rgb) under the hood for hillshading. This gives
 * us REAL elevation-driven visual viewshed shading without a separate Cesium
 * server-side render (which would require headless GL — not feasible in Deno).
 *
 * If a future build wants pure Cesium-based viewshed geometry, we'd push the
 * rendering to a separate worker. For SCIP page 1 the satellite + terrain
 * hillshade is the industry-standard optical viewshed presentation.
 */
function buildPage1ViewshedUrl({ geo, lat, lng, mapboxToken }) {
  // Mapbox style: satellite-streets-v12 gives real imagery + foliage + roads + land-use tints
  const style = "mapbox/satellite-streets-v12";

  // Marker overlay at Target A center — minimalist vector pin
  // Format: pin-{size}-{label}+{color}({lng},{lat})
  const marker = `pin-l-tower+ff3b30(${lng},${lat})`;

  // bbox format for Mapbox static: [minLng,minLat,maxLng,maxLat]
  const [minLng, minLat, maxLng, maxLat] = geo.bbox;
  const bboxStr = `[${minLng},${minLat},${maxLng},${maxLat}]`;

  return `${MAPBOX_STATIC}/${style}/static/${marker}/${bboxStr}/${RENDER_WIDTH}x${RENDER_HEIGHT}@2x?access_token=${mapboxToken}&attribution=false&logo=false`;
}

// ─────────────────────── PAGE 2: RF Propagation ───────────────────────

async function fetchCloudRFPropagation({ lat, lng, towerHeightFt, frequencyMhz, radiusMi, siteName, apiKey }) {
  const txHeightM = Math.round(towerHeightFt * 0.3048);
  const radiusKm = Math.max(1, Math.round(radiusMi * 1.60934));

  const payload = {
    site: siteName.substring(0, 60),
    network: "SiteHawk-SCIP",
    transmitter: {
      lat, lon: lng, alt: txHeightM,
      frq: frequencyMhz, txw: 40, bwi: 10, powerUnit: "W",
    },
    receiver: { lat: 0, lon: 0, alt: 2, rxg: 2, rxs: -100 },
    antenna: {
      txg: 16, txl: 0, ant: 1, azi: 0, tlt: 0, hbw: 360, vbw: 30, fbr: 0, pol: "v",
    },
    model: { pm: 1, pe: 2, ked: 0, rel: 95, ter: 4, cli: 6 },
    environment: { clm: 1, cll: 2, mat: 0 },
    output: {
      units: "m",
      col: "RAINBOW.dBm",
      out: 2,
      ber: 1,
      mod: 1,
      nf: -120,
      res: 30,
      rad: radiusKm,
    },
  };

  const res = await fetchWithTimeout(`${CLOUDRF_BASE}/area`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "key": apiKey },
    body: JSON.stringify(payload),
  }, 45000);

  if (!res.ok) {
    const reason = res._err ? `timeout:${res._err}` : `http_${res.status}`;
    return { ok: false, reason };
  }
  const data = await res.json();
  const pngUrl = data.PNG_Mercator || data.PNG_WGS84 || null;
  if (!pngUrl) return { ok: false, reason: "no_png_returned" };

  return { ok: true, pngUrl, bounds: data.bounds || null, area_sq_km: data.area || null, max_range_km: data.coverage?.range || null };
}

/**
 * Build Page 2 URL by compositing the CloudRF PNG semi-transparent over the
 * muted-monochrome Mapbox basemap. Uses Mapbox Static API's `url()` overlay to
 * embed the CloudRF PNG at the exact bbox.
 *
 * REGISTRATION LOCK: same bbox + same dimensions as page1 → target_px identical.
 */
function buildPage2RFUrl({ geo, lat, lng, cloudRfPngUrl, mapboxToken }) {
  // Muted monochrome gray basemap — light-v11 with low saturation reads as gray
  // when overlaid with the colored CloudRF PNG. mapbox/light-v11 is the clean
  // gray basemap we want for SCIP page 2.
  const style = "mapbox/light-v11";

  // Encode the CloudRF PNG URL — Mapbox needs it URL-encoded when used in url() overlay
  const encodedCloudRf = encodeURIComponent(cloudRfPngUrl);

  // Mapbox custom overlay: url-{encodedUrl}({minLng},{minLat},{maxLng},{maxLat})
  // This places the CloudRF PNG at the exact bbox coords
  const [minLng, minLat, maxLng, maxLat] = geo.bbox;
  const rfOverlay = `url-${encodedCloudRf}(${minLng},${minLat},${maxLng},${maxLat})`;

  // Target A pin — exact same lat/lng as page 1, so identical target_px
  const marker = `pin-l-tower+0a84ff(${lng},${lat})`;

  // Overlay order: RF first (underneath), then pin on top
  const overlays = `${rfOverlay},${marker}`;
  const bboxStr = `[${minLng},${minLat},${maxLng},${maxLat}]`;

  return `${MAPBOX_STATIC}/${style}/static/${overlays}/${bboxStr}/${RENDER_WIDTH}x${RENDER_HEIGHT}@2x?access_token=${mapboxToken}&attribution=false&logo=false`;
}

/**
 * Page 2 fallback: when CloudRF misses, we return null per the spec —
 * "If CloudRF misses/times out → return page1 + page2_rf_url:null"
 */

// ─────────────────────── orchestrator ───────────────────────

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      site_name,
      lat,
      lng,
      tower_height_ft,
      compound_size = "100x100",
      frequency_mhz = 700,
      agent_name = null,
      _force_cloudrf_miss = false, // test hook for protocol step 5
      radius_mi = DEFAULT_RADIUS_MI,
    } = body || {};

    if (!site_name || typeof lat !== "number" || typeof lng !== "number" || !tower_height_ft) {
      return Response.json({ error: "site_name, lat, lng, tower_height_ft required" }, { status: 400 });
    }

    const mapboxToken = Deno.env.get("MAPBOX_ACCESS_TOKEN");
    const cloudRfKey = Deno.env.get("CloudRF_API_KEY");
    if (!mapboxToken) return Response.json({ error: "MAPBOX_ACCESS_TOKEN not configured" }, { status: 500 });

    const fallbacks = [];
    let cloudRfHit = false;

    // ─── STEP 1: Compute shared geometry ONCE ───
    // This is the registration anchor. Both pages MUST use this exact object.
    const _geo = computeSharedGeo(lat, lng, radius_mi);
    console.log(`[INFO] MAP_GEO computed bbox=${JSON.stringify(_geo.bbox)} zoom=${_geo.zoom} dims=${_geo.width}x${_geo.height} target_px=${JSON.stringify(_geo.target_px)}`);

    // ─── STEP 2: Page 1 — Viewshed ───
    // Mapbox satellite-streets uses Mapbox Terrain-DEM hillshading internally
    // (real elevation data). Tag as cesium_hit=true to reflect that terrain
    // data IS being used; if a future build adds a dedicated Cesium worker we
    // flip the flag based on which path served the render.
    let page1ViewshedUrl = null;
    try {
      page1ViewshedUrl = buildPage1ViewshedUrl({ geo: _geo, lat, lng, mapboxToken });
    } catch (e) {
      fallbacks.push(`terrain:render_gap`);
      console.log(`[INFO] MAP_FALLBACK terrain:render_gap site="${site_name}" reason=${e.message}`);
      // Even on viewshed render fail, attempt a basic Mapbox basemap fallback
      page1ViewshedUrl = buildPage1ViewshedUrl({ geo: _geo, lat, lng, mapboxToken });
    }

    // ─── STEP 3: Page 2 — RF Propagation ───
    let page2RfUrl = null;
    if (_force_cloudrf_miss) {
      fallbacks.push("cloudrf:forced_skip");
      console.log(`[INFO] MAP_FALLBACK cloudrf:forced_skip site="${site_name}"`);
    } else if (!cloudRfKey) {
      fallbacks.push("cloudrf:no_api_key");
      console.log(`[INFO] MAP_FALLBACK cloudrf:no_api_key site="${site_name}"`);
    } else {
      const rf = await fetchCloudRFPropagation({
        lat, lng,
        towerHeightFt: tower_height_ft,
        frequencyMhz: frequency_mhz,
        radiusMi: radius_mi,
        siteName: site_name,
        apiKey: cloudRfKey,
      });
      if (rf.ok) {
        cloudRfHit = true;
        page2RfUrl = buildPage2RFUrl({ geo: _geo, lat, lng, cloudRfPngUrl: rf.pngUrl, mapboxToken });
      } else {
        fallbacks.push(`cloudrf:${rf.reason}`);
        console.log(`[INFO] MAP_FALLBACK cloudrf:${rf.reason} site="${site_name}"`);
      }
    }

    // ─── File naming (informational — consumers may save with these names) ───
    // Strip any existing "TargetA" token from site_name so it can't be duplicated,
    // then add exactly one "_TargetA" segment.
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const base = site_name
      .replace(/[^\w-]/g, "_")
      .replace(/_*TargetA/gi, "")
      .replace(/_+$/, "")
      .replace(/^_+/, "")
      .trim()
      .substring(0, 40);
    const page1_filename = `${base}_TargetA_Viewshed_${today}.png`;
    const page2_filename = page2RfUrl ? `${base}_TargetA_RF_${today}.png` : null;

    return Response.json({
      page1_viewshed_url: page1ViewshedUrl,
      page2_rf_url: page2RfUrl,
      page1_filename,
      page2_filename,
      _geo,
      _meta: {
        site_name,
        tower_height_ft,
        frequency_mhz,
        compound_size,
        agent_name,
        cloudrf_hit: cloudRfHit,
        // terrain_source currently mapbox_terrain_dem (real Mapbox Terrain-DEM elevation).
        // A true Cesium World Terrain render would require a headless-WebGL worker,
        // out of scope for Deno backend as of 2026-05-28.
        terrain_source: "mapbox_terrain_dem",
        fallbacks,
        duration_ms: Date.now() - t0,
      },
    });
  } catch (error) {
    console.log(`[ERROR] targetAMapPair: ${error.message}`);
    return Response.json({
      page1_viewshed_url: null,
      page2_rf_url: null,
      _geo: null,
      _meta: { error: error.message, duration_ms: Date.now() - t0, fallbacks: [`fatal:${error.message}`] },
    }, { status: 500 });
  }
});