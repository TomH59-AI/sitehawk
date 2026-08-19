import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const STAC_URL = "https://stac.dataspace.copernicus.eu/v1/search";
const PROCESS_URL = "https://sh.dataspace.copernicus.eu/process/v1";

type Mode = "true_color" | "ndvi" | "swir" | "sar";
type TokenCache = { value: string; expiresAt: number } | null;

let tokenCache: TokenCache = null;

const EVALSCRIPTS: Record<Mode, string> = {
  true_color: `//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "SCL", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
function evaluatePixel(s) {
  var cloudy = [8, 9, 10, 11].indexOf(s.SCL) >= 0;
  if (cloudy || !s.dataMask) return [0, 0, 0, 0];
  return [
    Math.max(0, 2.5 * s.B04 - 0.07),
    Math.max(0, 2.5 * s.B03 - 0.07),
    Math.max(0, 2.5 * s.B02 - 0.07),
    s.dataMask
  ];
}`,
  ndvi: `//VERSION=3
function setup() {
  return {
    input: ["B04", "B08", "SCL", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
function evaluatePixel(s) {
  var cloudy = [8, 9, 10, 11].indexOf(s.SCL) >= 0;
  if (cloudy || !s.dataMask) return [0, 0, 0, 0];
  var v = index(s.B08, s.B04);
  var rgb = valueInterpolate(
    v,
    [-1, 0, 0.2, 0.5, 1],
    [[0.20, 0.14, 0.10], [0.85, 0.72, 0.45], [0.95, 0.90, 0.55], [0.32, 0.62, 0.20], [0.03, 0.28, 0.05]]
  );
  return [rgb[0], rgb[1], rgb[2], s.dataMask];
}`,
  swir: `//VERSION=3
function setup() {
  return {
    input: ["B04", "B8A", "B12", "SCL", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
function evaluatePixel(s) {
  var cloudy = [8, 9, 10, 11].indexOf(s.SCL) >= 0;
  if (cloudy || !s.dataMask) return [0, 0, 0, 0];
  return [
    Math.min(1, 2.2 * s.B12),
    Math.min(1, 2.2 * s.B8A),
    Math.min(1, 2.2 * s.B04),
    s.dataMask
  ];
}`,
  sar: `//VERSION=3
function setup() {
  return {
    input: ["VV", "VH", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
function clamp(v) { return Math.max(0, Math.min(1, v)); }
function db(v) { return 10 * Math.log(Math.max(v, 0.000001)) / Math.LN10; }
function evaluatePixel(s) {
  if (!s.dataMask) return [0, 0, 0, 0];
  var vv = clamp((db(s.VV) + 25) / 25);
  var vh = clamp((db(s.VH) + 32) / 27);
  var roughness = clamp((db(s.VV) - db(s.VH) + 2) / 16);
  return [vv, roughness, vh, s.dataMask];
}`,
};

function isMode(value: unknown): value is Mode {
  return ["true_color", "ndvi", "swir", "sar"].includes(String(value));
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function isoDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 120_000) return tokenCache.value;

  const clientId = Deno.env.get("COPERNICUS_CLIENT_ID");
  const clientSecret = Deno.env.get("COPERNICUS_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Copernicus credentials are not configured");
  }

  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    console.error("[copernicusRfLayer] token request failed", response.status);
    throw new Error(`Copernicus authentication failed (${response.status})`);
  }

  const payload = await response.json();
  if (!payload?.access_token) throw new Error("Copernicus returned no access token");
  const expiresIn = Math.max(300, Number(payload.expires_in) || 3600);
  tokenCache = {
    value: String(payload.access_token),
    expiresAt: now + expiresIn * 1000,
  };
  return tokenCache.value;
}

function validateBbox(value: unknown): [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) throw new Error("bbox must contain west, south, east, north");
  const [west, south, east, north] = value.map(Number);
  if (![west, south, east, north].every(Number.isFinite)) throw new Error("bbox values must be numbers");
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new Error("bbox is outside valid longitude/latitude bounds");
  }
  if (east - west > 8 || north - south > 8) {
    throw new Error("Zoom in before loading Copernicus imagery");
  }
  return [west, south, east, north];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const bbox = validateBbox(body?.bbox);
    const mode: Mode = isMode(body?.mode) ? body.mode : "true_color";
    const collection = mode === "sar" ? "sentinel-1-grd" : "sentinel-2-l2a";
    const width = Math.max(256, Math.min(1024, Math.round(Number(body?.width) || 768)));
    const height = Math.max(256, Math.min(1024, Math.round(Number(body?.height) || 768)));
    const maxCloudCoverage = Math.max(0, Math.min(100, Number(body?.max_cloud_coverage) || 35));

    const defaultDays = mode === "sar" ? 21 : 45;
    const to = parseDate(body?.to) || new Date();
    const from = parseDate(body?.from) || new Date(to.getTime() - defaultDays * 86_400_000);
    if (from >= to) return Response.json({ error: "from must be earlier than to" }, { status: 400 });
    if (to.getTime() - from.getTime() > 180 * 86_400_000) {
      return Response.json({ error: "Date range cannot exceed 180 days" }, { status: 400 });
    }

    const token = await getAccessToken();
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const stacBody: Record<string, unknown> = {
      bbox,
      collections: [collection],
      datetime: `${isoDate(from)}/${isoDate(to)}`,
      limit: 20,
      sortby: [{ field: "properties.datetime", direction: "desc" }],
      fields: {
        include: ["id", "collection", "properties.datetime", "properties.eo:cloud_cover"],
        exclude: ["geometry", "assets"],
      },
    };
    if (mode !== "sar") {
      stacBody.query = { "eo:cloud_cover": { lte: maxCloudCoverage } };
    }

    const stacResponse = await fetch(STAC_URL, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(stacBody),
      signal: AbortSignal.timeout(20_000),
    });
    if (!stacResponse.ok) {
      console.error("[copernicusRfLayer] STAC request failed", stacResponse.status);
      throw new Error(`Copernicus catalogue request failed (${stacResponse.status})`);
    }
    const stac = await stacResponse.json();
    const scenes = Array.isArray(stac?.features) ? stac.features : [];

    const dataFilter: Record<string, unknown> = {
      timeRange: { from: isoDate(from), to: isoDate(to) },
      mosaickingOrder: mode === "sar" ? "mostRecent" : "leastCC",
    };
    if (mode !== "sar") dataFilter.maxCloudCoverage = maxCloudCoverage;
    if (mode === "sar") {
      dataFilter.acquisitionMode = "IW";
      dataFilter.polarization = "DV";
    }

    const dataInput: Record<string, unknown> = {
      type: collection,
      dataFilter,
    };
    if (mode === "sar") {
      dataInput.processing = {
        backCoeff: "GAMMA0_ELLIPSOID",
        orthorectify: true,
      };
    }

    const processBody = {
      input: {
        bounds: {
          bbox,
          properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" },
        },
        data: [dataInput],
      },
      output: {
        width,
        height,
        responses: [{ identifier: "default", format: { type: "image/png" } }],
      },
      evalscript: EVALSCRIPTS[mode],
    };

    const processResponse = await fetch(PROCESS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "image/png",
      },
      body: JSON.stringify(processBody),
      signal: AbortSignal.timeout(55_000),
    });
    if (!processResponse.ok) {
      const detail = (await processResponse.text()).slice(0, 500);
      console.error("[copernicusRfLayer] Process API failed", processResponse.status, detail);
      throw new Error(`Copernicus image processing failed (${processResponse.status})`);
    }

    const imageBytes = new Uint8Array(await processResponse.arrayBuffer());
    if (!imageBytes.length) throw new Error("Copernicus returned an empty image");

    const latestScene = scenes[0];
    return Response.json({
      success: true,
      mode,
      collection,
      bounds: bbox,
      width,
      height,
      image_data_url: `data:image/png;base64,${bytesToBase64(imageBytes)}`,
      scene_count: scenes.length,
      latest_acquisition: latestScene?.properties?.datetime || null,
      cloud_cover: latestScene?.properties?.["eo:cloud_cover"] ?? null,
      generated_at: new Date().toISOString(),
      source: "Copernicus Data Space Ecosystem",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Copernicus request failed";
    console.error("[copernicusRfLayer]", message);
    const status = /bbox|Zoom in|Date range|from must/.test(message) ? 400 : 502;
    return Response.json({ error: message }, { status });
  }
});
