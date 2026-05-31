// SECTION 8 — HAWK RF PROPAGATION VISION (Target A)
// Standalone, fast, single-shot. Two modes:
//   mode="detect"   → UnwiredLabs carrier scan within 1 mile of Target A, then
//                     one CloudRF /area run per detected carrier (serial).
//   mode="recompute"→ ONE CloudRF /area run for a single carrier with tweaked
//                     tx power / antenna height. No carrier rescan.
//
// Fixed analysis radius: 1 mile (1609 m). CloudRF runs in fast mode (low res)
// for speed. Returns PNG overlay URL + bounds + coverage stats per carrier.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const CLOUDRF_BASE = "https://api.cloudrf.com";
const UNWIRED_URL = "https://us1.unwiredlabs.com/v2/process.php";
const RADIUS_METERS = 1609; // exactly 1 mile, fixed
const RADIUS_KM = 1.60934;

// MCC/MNC → US carrier name + headline coverage band (center MHz).
const MNC_CARRIERS = {
  // Verizon
  "311480": { name: "Verizon", band: "Band 13", frequency_mhz: 751 },
  "310004": { name: "Verizon", band: "Band 13", frequency_mhz: 751 },
  "311270": { name: "Verizon", band: "Band 13", frequency_mhz: 751 },
  // AT&T
  "310410": { name: "AT&T", band: "Band 12", frequency_mhz: 729 },
  "310150": { name: "AT&T", band: "Band 12", frequency_mhz: 729 },
  "311180": { name: "AT&T", band: "Band 12", frequency_mhz: 729 },
  // T-Mobile
  "310260": { name: "T-Mobile", band: "Band 71", frequency_mhz: 617 },
  "310200": { name: "T-Mobile", band: "Band 71", frequency_mhz: 617 },
  "310240": { name: "T-Mobile", band: "Band 71", frequency_mhz: 617 },
  // DISH
  "313340": { name: "DISH", band: "Band 70", frequency_mhz: 1995 },
  // US Cellular
  "311580": { name: "US Cellular", band: "Band 12", frequency_mhz: 729 },
  "310730": { name: "US Cellular", band: "Band 12", frequency_mhz: 729 },
};

// Fallback set — the four majors with their headline bands.
const FALLBACK_CARRIERS = [
  { name: "Verizon", band: "Band 13", frequency_mhz: 751 },
  { name: "AT&T", band: "Band 12", frequency_mhz: 729 },
  { name: "T-Mobile", band: "Band 71", frequency_mhz: 617 },
  { name: "DISH", band: "Band 70", frequency_mhz: 1995 },
];

// dBm → EIRP watts. CloudRF wants transmit power in W (PA output). We pass
// EIRP-equivalent power with 0 dBi extra gain so the dBm input maps cleanly.
function dbmToWatts(dbm) {
  return Math.pow(10, (dbm - 30) / 10);
}

async function runCloudRF({ apiKey, lat, lon, heightM, frequencyMhz, txPowerDbm, siteName }) {
  const payload = {
    site: String(siteName || "Target A").substring(0, 60),
    network: "SiteHawk-S8",
    transmitter: {
      lat, lon, alt: heightM,
      frq: frequencyMhz,
      txw: dbmToWatts(txPowerDbm),
      bwi: 10,
      powerUnit: "W",
    },
    receiver: { lat: 0, lon: 0, alt: 2, rxg: 2, rxs: -120 },
    antenna: { txg: 0, txl: 0, ant: 1, azi: 0, tlt: 0, hbw: 360, vbw: 360, fbr: 0, pol: "v" },
    // Fast model: ITM, low reliability target, terrain + clutter ON.
    model: { pm: 1, pe: 2, ked: 0, rel: 90, ter: 4, cli: 6 },
    environment: { clm: 1, cll: 2, mat: 0 },
    // res: 90 m = CloudRF fast mode. col RAINBOW.dBm. out=2 → PNG overlay.
    output: { units: "m", col: "RAINBOW.dBm", out: 2, ber: 1, mod: 1, nf: -120, res: 90, rad: RADIUS_KM },
  };

  const res = await fetch(`${CLOUDRF_BASE}/area`, {
    method: "POST",
    headers: { "Content-Type": "application/json", key: apiKey },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CloudRF ${res.status}: ${text.substring(0, 200)}`);
  }
  const data = await res.json();
  return {
    png_url: data.PNG_Mercator || data.PNG_WGS84 || null,
    bounds: data.bounds || null,
    area_covered_sq_km: data.area || null,
    max_range_km: data.coverage?.range || null,
  };
}

async function detectCarriers({ token, lat, lon }) {
  if (!token) return { carriers: FALLBACK_CARRIERS, fallback: true };
  try {
    const body = {
      token,
      radio: "lte",
      // UnwiredLabs cell lookup — we ask for cells near the point. The geolocation
      // endpoint echoes the network operator (mcc/mnc) it matched against.
      cells: [],
      address: 0,
      lat, lon,
    };
    const res = await fetch(UNWIRED_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`UnwiredLabs ${res.status}`);
    const data = await res.json();
    const found = new Map();
    const list = Array.isArray(data?.cells) ? data.cells : [];
    for (const c of list) {
      const key = `${c.mcc}${String(c.mnc).padStart(3, "0")}`;
      const carrier = MNC_CARRIERS[key];
      if (carrier && !found.has(carrier.name)) found.set(carrier.name, carrier);
    }
    if (found.size === 0) return { carriers: FALLBACK_CARRIERS, fallback: true };
    return { carriers: [...found.values()], fallback: false };
  } catch (e) {
    console.warn("UnwiredLabs detect failed, using fallback:", e.message);
    return { carriers: FALLBACK_CARRIERS, fallback: true };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      mode = "detect",
      lat, lon,
      height_ft = 150,
      tx_power_dbm = 43,
      site_name = "Target A",
    } = body;

    if (typeof lat !== "number" || typeof lon !== "number") {
      return Response.json({ error: "lat and lon are required numbers" }, { status: 400 });
    }

    const cloudKey = Deno.env.get("CloudRF_API_KEY");
    if (!cloudKey) return Response.json({ error: "CloudRF_API_KEY not configured" }, { status: 500 });

    const heightM = Math.round(height_ft * 0.3048);

    // RECOMPUTE — single carrier, no rescan.
    if (mode === "recompute") {
      const { carrier_name, band, frequency_mhz } = body;
      if (typeof frequency_mhz !== "number") {
        return Response.json({ error: "frequency_mhz required for recompute" }, { status: 400 });
      }
      const cov = await runCloudRF({
        apiKey: cloudKey, lat, lon, heightM, frequencyMhz: frequency_mhz,
        txPowerDbm: tx_power_dbm, siteName: site_name,
      });
      return Response.json({
        success: true,
        coverage: { carrier_name, band, frequency_mhz, ...cov },
      });
    }

    // DETECT — UnwiredLabs scan + per-carrier CloudRF (serial).
    const token = Deno.env.get("UNWIREDLABS_TOKEN");
    const { carriers, fallback } = await detectCarriers({ token, lat, lon });

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const coverages = [];
    for (let i = 0; i < carriers.length; i++) {
      const c = carriers[i];
      if (i > 0) await sleep(1100); // CloudRF allows ~1 req/sec
      try {
        const cov = await runCloudRF({
          apiKey: cloudKey, lat, lon, heightM, frequencyMhz: c.frequency_mhz,
          txPowerDbm: tx_power_dbm, siteName: `${site_name} · ${c.name}`,
        });
        coverages.push({ carrier_name: c.name, band: c.band, frequency_mhz: c.frequency_mhz, ...cov });
      } catch (e) {
        console.error(`CloudRF failed for ${c.name}:`, e.message);
        coverages.push({ carrier_name: c.name, band: c.band, frequency_mhz: c.frequency_mhz, png_url: null, bounds: null, error: e.message });
      }
    }

    const usable = coverages.filter((c) => c.png_url);
    if (usable.length === 0) {
      return Response.json({ error: "CloudRF returned no coverage for any carrier" }, { status: 502 });
    }

    return Response.json({
      success: true,
      detected_via: fallback ? "fallback" : "unwiredlabs",
      carrier_count: coverages.length,
      radius_miles: 1,
      height_ft,
      tx_power_dbm,
      generated_at: new Date().toISOString(),
      coverages,
    });
  } catch (error) {
    console.error("section8Propagation error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});