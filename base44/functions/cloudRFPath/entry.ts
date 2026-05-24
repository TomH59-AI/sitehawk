// CloudRF Path Profile (/path) — point-to-point link analysis between
// Target A and a destination (donor site, fiber POP, hub). Returns LOS/NLOS,
// Fresnel clearance, signal at receiver, path loss, and an obstruction
// profile PNG. Used by Hawk Frequency to detect fatal backhaul issues.
//
// Docs: https://api.cloudrf.com/#tag/path

import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const CLOUDRF_BASE = "https://api.cloudrf.com";

// Carrier presets — keep in sync with src/lib/carrierPresets.js
const CARRIER_PRESETS = {
  verizon:        { frequency_mhz: 700,  power_w: 40, antenna_gain_dbi: 16, hbw: 65 },
  verizon_cband:  { frequency_mhz: 3700, power_w: 20, antenna_gain_dbi: 24, hbw: 65 },
  att:            { frequency_mhz: 850,  power_w: 40, antenna_gain_dbi: 16, hbw: 65 },
  tmobile:        { frequency_mhz: 600,  power_w: 40, antenna_gain_dbi: 16, hbw: 65 },
  tmobile_2500:   { frequency_mhz: 2500, power_w: 30, antenna_gain_dbi: 20, hbw: 65 },
  generic:        { frequency_mhz: 700,  power_w: 40, antenna_gain_dbi: 12, hbw: 360 },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      tx_lat, tx_lon, tx_height_ft = 199,
      rx_lat, rx_lon, rx_height_ft = 30,
      site_name = "SiteHawk Path",
      carrier = "verizon",
    } = body;

    // Carrier preset wins unless explicit frequency_mhz/power_w were passed.
    const preset = CARRIER_PRESETS[carrier] || CARRIER_PRESETS.verizon;
    const frequency_mhz = body.frequency_mhz ?? preset.frequency_mhz;
    const power_w = body.power_w ?? preset.power_w;
    const antenna_gain_dbi = body.antenna_gain_dbi ?? preset.antenna_gain_dbi;

    if (typeof tx_lat !== "number" || typeof tx_lon !== "number" ||
        typeof rx_lat !== "number" || typeof rx_lon !== "number") {
      return Response.json({ error: "tx_lat/lon and rx_lat/lon required" }, { status: 400 });
    }

    const apiKey = Deno.env.get("CloudRF_API_KEY");
    if (!apiKey) return Response.json({ error: "CloudRF_API_KEY not configured" }, { status: 500 });

    const txAltM = Math.round(tx_height_ft * 0.3048);
    const rxAltM = Math.round(rx_height_ft * 0.3048);

    const payload = {
      site: site_name.substring(0, 60),
      network: "SiteHawk",
      transmitter: { lat: tx_lat, lon: tx_lon, alt: txAltM, frq: frequency_mhz, txw: power_w, bwi: 10, powerUnit: "W" },
      receiver:    { lat: rx_lat, lon: rx_lon, alt: rxAltM, rxg: 2, rxs: -100 },
      antenna: { txg: antenna_gain_dbi, txl: 0, ant: 1, azi: 0, tlt: 0, hbw: 360, vbw: 30, fbr: 0, pol: "v" },
      model: { pm: 1, pe: 2, ked: 0, rel: 95, ter: 4, cli: 6 },
      environment: { clm: 1, cll: 2, mat: 0 },
      output: { units: "m", col: "RAINBOW.dBm", out: 2, ber: 0, mod: 0, nf: -120, res: 30 },
    };

    const res = await fetch(`${CLOUDRF_BASE}/path`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "key": apiKey },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("CloudRF /path failed:", res.status, text);
      return Response.json({ error: `CloudRF /path error: ${res.status}`, detail: text }, { status: 502 });
    }

    const data = await res.json();

    return Response.json({
      success: true,
      site_name,
      tx: { lat: tx_lat, lon: tx_lon, height_ft: tx_height_ft },
      rx: { lat: rx_lat, lon: rx_lon, height_ft: rx_height_ft },
      // CloudRF path response fields
      png_url: data.chart || data.PNG || data.PNG_Mercator || null,
      distance_km: data.distance ?? null,
      path_loss_db: data.loss ?? data["Path Loss"] ?? null,
      signal_dbm: data.signal ?? data["Signal Power"] ?? null,
      snr_db: data.snr ?? null,
      fresnel_clearance_pct: data.fresnel ?? null,
      los_status: data.los ?? data.LOS ?? null, // CLEAR / OBSTRUCTED / etc.
      report_url: data.report || null,
      raw_id: data.id || data.sid || null,
    });
  } catch (error) {
    console.error("cloudRFPath error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});