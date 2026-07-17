import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// RF Intelligence Engine — towers in a map viewport (bounding box).
// Pulls cell sites from OpenCellID / Unwired Labs for the current Mapbox view
// and normalizes them into the rfi_towers shape used by the RFI map layer:
//   { tower_id, source, carrier, technology, frequency_mhz, band, lat, lon }
// This is a standalone module lookup — it does NOT touch the SCIP pipeline.

// MCC/MNC → US carrier code used by the map's color match expression.
function carrierCode(mcc: number, mnc: number): string {
  if (mcc !== 310 && mcc !== 311 && mcc !== 312 && mcc !== 313) return "OTHER";
  const VZW = new Set([12, 13, 590, 890, 910, 480]);
  const ATT = new Set([410, 150, 170, 280, 380, 980, 560]);
  const TMO = new Set([260, 200, 210, 220, 230, 240, 250, 270, 310, 490, 660, 800]);
  const DISH = new Set([390, 940]);
  if (VZW.has(mnc)) return "VZW";
  if (ATT.has(mnc)) return "ATT";
  if (TMO.has(mnc)) return "TMO";
  if (DISH.has(mnc)) return "DISH";
  return "OTHER";
}

// Approximate a representative downlink frequency (MHz) + band label per radio.
function radioToRf(radio: string): { frequency_mhz: number; band: string; technology: string } {
  const r = (radio || "").toUpperCase();
  if (r === "LTE") return { frequency_mhz: 1900, band: "Mid-Band", technology: "LTE" };
  if (r === "NR") return { frequency_mhz: 3500, band: "C-Band", technology: "5G NR" };
  if (r === "UMTS") return { frequency_mhz: 850, band: "Low-Band", technology: "UMTS" };
  if (r === "GSM") return { frequency_mhz: 900, band: "Low-Band", technology: "GSM" };
  if (r === "CDMA") return { frequency_mhz: 850, band: "Low-Band", technology: "CDMA" };
  return { frequency_mhz: 1900, band: "Mid-Band", technology: r || "Cell" };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const token = Deno.env.get("UNWIREDLABS_TOKEN");
    if (!token) return Response.json({ towers: [], error: "OpenCellID token not configured" });

    const { west, south, east, north, radio } = await req.json();
    for (const v of [west, south, east, north]) {
      if (!Number.isFinite(Number(v))) return Response.json({ error: "west/south/east/north required" }, { status: 400 });
    }
    const W = Number(west), S = Number(south), E = Number(east), N = Number(north);

    // OpenCellID caps each bbox at ~4,000,000 sq.m (~2km × 2km). Split the
    // viewport into a grid of small cells and fetch a capped number in parallel.
    // ~0.018° ≈ 2km latitude — keep cells safely under the area limit.
    const CELL_DEG = 0.015;
    const MAX_CELLS = 24; // hard cap on parallel OpenCellID requests per call
    const latSpan = Math.abs(N - S), lonSpan = Math.abs(E - W);
    let cols = Math.ceil(lonSpan / CELL_DEG);
    let rows = Math.ceil(latSpan / CELL_DEG);
    // If the viewport is too large to cover within MAX_CELLS, sample cells
    // spread across it rather than trying to cover every cell.
    const totalCells = cols * rows;
    const stride = totalCells > MAX_CELLS ? Math.ceil(Math.sqrt(totalCells / MAX_CELLS)) : 1;

    const boxes: Array<[number, number, number, number]> = [];
    for (let r = 0; r < rows && boxes.length < MAX_CELLS; r += stride) {
      for (let c = 0; c < cols && boxes.length < MAX_CELLS; c += stride) {
        const cs = S + (r / rows) * latSpan;
        const cn = Math.min(cs + CELL_DEG, N);
        const cw = W + (c / cols) * lonSpan;
        const ce = Math.min(cw + CELL_DEG, E);
        boxes.push([cw, cs, ce, cn]);
      }
    }

    const fetchCell = async ([bw, bs, be, bn]: [number, number, number, number]) => {
      let url = `https://opencellid.org/cell/getInArea?key=${encodeURIComponent(token)}`
        + `&BBOX=${bs},${bw},${bn},${be}&format=json&limit=200`;
      if (radio) url += `&radio=${encodeURIComponent(radio)}`;
      try {
        const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(9000) });
        const text = await res.text();
        const data = JSON.parse(text);
        if (data?.error) return [];
        return data?.cells || [];
      } catch { return []; }
    };

    const results = await Promise.all(boxes.map(fetchCell));
    const seen = new Set<string>();
    const towers: any[] = [];
    results.flat().forEach((c: any, i: number) => {
      const lat = parseFloat(c.lat);
      const lon = parseFloat(c.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const key = `${lat.toFixed(5)},${lon.toFixed(5)},${c.mnc}`;
      if (seen.has(key)) return;
      seen.add(key);
      const rf = radioToRf(c.radio);
      towers.push({
        tower_id: c.cellid ? `ocid-${c.cellid}` : `ocid-${i}`,
        source: "OpenCellID",
        carrier: carrierCode(Number(c.mcc), Number(c.mnc)),
        technology: rf.technology,
        frequency_mhz: rf.frequency_mhz,
        band: rf.band,
        lat,
        lon,
      });
    });

    console.log(`[rfiTowersInBBox] ${towers.length} towers from ${boxes.length} cells user=${user.email}`);
    return Response.json({ towers });
  } catch (error) {
    console.error("rfiTowersInBBox error:", error.message);
    return Response.json({ towers: [], error: error.message });
  }
});