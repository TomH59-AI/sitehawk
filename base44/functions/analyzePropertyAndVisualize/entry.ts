/**
 * analyzePropertyAndVisualize — core GenerateSiteVisualization pipeline.
 *
 * Step A — Realie parcel lookup (address → APN + geometry + zoning string)
 * Step B — Notion zoning lookup → LLM parses Telecom Towers clause → CUP / PE flags
 * Step C — (frontend) Mapbox renders parcel, user drops compound center
 * Step D — Replicate Flux.1 Inpaint paints a realistic compound + tower onto user's aerial photo
 *
 * One entity row is created at the start and progressively updated as the
 * pipeline advances so the UI can poll status and recover gracefully on partial
 * failures.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const REPLICATE_MODEL = 'black-forest-labs/flux-fill-pro'; // Flux.1 Inpaint (Pro) — sharper than dev for engineering renders
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 180000; // 3 min cap on the Replicate poll loop

// ---------- helpers ----------

function parseCompound(compoundSize) {
  if (!compoundSize) return { w: 100, d: 100 };
  const m = String(compoundSize).match(/(\d+)\s*[xX×]\s*(\d+)/);
  if (!m) return { w: 100, d: 100 };
  return { w: parseInt(m[1], 10), d: parseInt(m[2], 10) };
}

// Generate a 1024x1024 PNG mask centered on the click point. White ellipse on
// black background — Flux.1 Inpaint repaints the white area only.
function buildMaskDataUrl(clickXNorm = 0.5, clickYNorm = 0.5, sizeNorm = 0.25) {
  // SVG → data URL is the simplest way to ship a mask without a canvas
  // dependency. Replicate Flux.1 Inpaint accepts PNG/JPEG, but data: URLs
  // require a base64 image; SVG-as-PNG isn't supported, so we use a tiny
  // procedural PNG built via a 1x1 grid trick. Instead we just emit a
  // black PNG with a white rectangle in the right place using a tiny
  // server-side base64 PNG builder.
  // For simplicity & reliability we use a hosted helper: an SVG packed as
  // a data URL into an <img> on the client side won't work for Replicate
  // (it needs a fetchable URL). So we PNG-encode here.
  const W = 1024, H = 1024;
  const cx = Math.round(clickXNorm * W);
  const cy = Math.round(clickYNorm * H);
  const half = Math.round(sizeNorm * W * 0.5);
  const x0 = Math.max(0, cx - half);
  const y0 = Math.max(0, cy - half);
  const x1 = Math.min(W, cx + half);
  const y1 = Math.min(H, cy + half);
  return { W, H, x0, y0, x1, y1 };
}

// Build a tiny PNG (black bg + white rect) entirely in memory and return as
// a base64 data URL. Replicate accepts data: URLs for image inputs.
function makeMaskPngDataUrl(rect) {
  const { W, H, x0, y0, x1, y1 } = rect;
  // Use an uncompressed PNG via a tiny encoder. To keep it small we write
  // pixel-by-pixel as 1-byte greyscale, then DEFLATE-store it.
  const buf = new Uint8Array(W * H);
  for (let y = y0; y < y1; y++) {
    const row = y * W;
    for (let x = x0; x < x1; x++) buf[row + x] = 255;
  }
  return encodeGreyscalePng(buf, W, H);
}

// Minimal PNG encoder (greyscale, no compression — stored DEFLATE blocks).
// Avoids npm imports; OK because the mask is generated once per call.
function encodeGreyscalePng(pixels, width, height) {
  const crc32Table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = crc32Table[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function adler32(bytes) {
    let a = 1, b = 0;
    for (let i = 0; i < bytes.length; i++) { a = (a + bytes[i]) % 65521; b = (b + a) % 65521; }
    return ((b << 16) | a) >>> 0;
  }
  // Raw filtered scanlines: filter byte 0 + pixel data
  const raw = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  // Stored DEFLATE blocks (max 65535 bytes per block)
  const chunks = [];
  let off = 0;
  while (off < raw.length) {
    const len = Math.min(65535, raw.length - off);
    const last = (off + len >= raw.length) ? 1 : 0;
    const head = new Uint8Array(5);
    head[0] = last;
    head[1] = len & 0xFF; head[2] = (len >>> 8) & 0xFF;
    head[3] = (~len) & 0xFF; head[4] = ((~len) >>> 8) & 0xFF;
    chunks.push(head, raw.subarray(off, off + len));
    off += len;
  }
  const zlibLen = 2 + chunks.reduce((s, c) => s + c.length, 0) + 4;
  const zlib = new Uint8Array(zlibLen);
  zlib[0] = 0x78; zlib[1] = 0x01; // zlib header (no compression, default level)
  let p = 2;
  for (const c of chunks) { zlib.set(c, p); p += c.length; }
  const adler = adler32(raw);
  zlib[p++] = (adler >>> 24) & 0xFF;
  zlib[p++] = (adler >>> 16) & 0xFF;
  zlib[p++] = (adler >>> 8) & 0xFF;
  zlib[p++] = adler & 0xFF;

  function chunk(type, data) {
    const len = data.length;
    const out = new Uint8Array(8 + len + 4);
    out[0] = (len >>> 24) & 0xFF; out[1] = (len >>> 16) & 0xFF;
    out[2] = (len >>> 8) & 0xFF;  out[3] = len & 0xFF;
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    const crcInput = new Uint8Array(4 + len);
    for (let i = 0; i < 4; i++) crcInput[i] = type.charCodeAt(i);
    crcInput.set(data, 4);
    const c = crc32(crcInput);
    out[8 + len] = (c >>> 24) & 0xFF; out[9 + len] = (c >>> 16) & 0xFF;
    out[10 + len] = (c >>> 8) & 0xFF; out[11 + len] = c & 0xFF;
    return out;
  }
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  ihdr[0] = (width >>> 24) & 0xFF; ihdr[1] = (width >>> 16) & 0xFF;
  ihdr[2] = (width >>> 8) & 0xFF;  ihdr[3] = width & 0xFF;
  ihdr[4] = (height >>> 24) & 0xFF; ihdr[5] = (height >>> 16) & 0xFF;
  ihdr[6] = (height >>> 8) & 0xFF;  ihdr[7] = height & 0xFF;
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 0;   // greyscale
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const ihdrChunk = chunk('IHDR', ihdr);
  const idatChunk = chunk('IDAT', zlib);
  const iendChunk = chunk('IEND', new Uint8Array(0));
  const total = sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const png = new Uint8Array(total);
  let q = 0;
  png.set(sig, q); q += sig.length;
  png.set(ihdrChunk, q); q += ihdrChunk.length;
  png.set(idatChunk, q); q += idatChunk.length;
  png.set(iendChunk, q);
  // base64 encode
  let bin = '';
  for (let i = 0; i < png.length; i++) bin += String.fromCharCode(png[i]);
  const b64 = btoa(bin);
  return `data:image/png;base64,${b64}`;
}

// ---------- Step A: Realie lookup ----------

async function realieLookup(propertyAddress) {
  const apiKey = Deno.env.get('REALIE_API_KEY');
  if (!apiKey) throw new Error('REALIE_API_KEY not configured');
  const url = `https://app.realie.ai/api/public/property/?address=${encodeURIComponent(propertyAddress)}`;
  const r = await fetch(url, { headers: { Authorization: apiKey } });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Realie HTTP ${r.status}: ${body.slice(0, 200)}`);
  }
  const data = await r.json();
  const p = Array.isArray(data) ? data[0] : (data?.results?.[0] || data);
  if (!p) throw new Error('Realie returned no parcel for that address');
  return {
    parcel_id: p.parcel_id || p.apn || p.parcelNumber || '',
    owner_name: p.owner_name || p.owner || '',
    acreage: parseFloat(p.acreage || p.acres || p.parcel_size_acres || 0) || null,
    zoning_classification: p.zoning || p.zoning_classification || p.zoning_code || '',
    parcel_geometry: p.geometry || p.parcel_geometry || null,
    centroid_lat: parseFloat(p.latitude || p.lat || 0) || null,
    centroid_lon: parseFloat(p.longitude || p.lon || p.lng || 0) || null,
  };
}

// ---------- Step B: Notion zoning → CUP / PE flags ----------

async function notionFlagsLookup(base44, lat, lon, zoningClass) {
  if (lat == null || lon == null) return null;
  const res = await base44.functions.invoke('notionZoningLookup', { lat, lon });
  const data = res?.data || res;
  const zoning = data?.zoning;
  if (!zoning) return null;

  // The Notion lookup already extracted most fields. We just need to derive
  // boolean CUP / PE flags from the parsed ordinance text + zoning class.
  const llmPrompt =
    `You are a telecom zoning analyst. Given the following ordinance excerpt for ` +
    `${zoning.jurisdiction || 'this jurisdiction'} and the parcel's zoning classification "${zoningClass || 'unknown'}", ` +
    `determine two boolean flags:\n` +
    `1. requires_cup: Does building a telecommunications tower in this zoning class require a Conditional Use Permit ` +
    `(or Special Use Permit / Special Exception)? \n` +
    `2. requires_pe_letter: Is a Professional Engineer (PE) structural certification letter mandatory?\n\n` +
    `Quote the section number / language you used as evidence. If the ordinance doesn't say, default to true ` +
    `(towers almost always require both unless the ordinance explicitly says by-right + no PE required).\n\n` +
    `Zoning process: ${zoning.zoning_process || '—'}\n` +
    `Code section: ${zoning.code_section || '—'}\n` +
    `Max height: ${zoning.max_tower_height || '—'}\n` +
    `Ordinance text excerpt:\n${(zoning.content || '').slice(0, 8000)}`;

  const flags = await base44.integrations.Core.InvokeLLM({
    prompt: llmPrompt,
    response_json_schema: {
      type: 'object',
      properties: {
        requires_cup: { type: 'boolean' },
        requires_pe_letter: { type: 'boolean' },
        evidence: { type: 'string' },
      },
      required: ['requires_cup', 'requires_pe_letter'],
    },
    add_context_from_internet: false,
  });

  return {
    jurisdiction: zoning.jurisdiction || '',
    requires_cup: !!flags?.requires_cup,
    requires_pe_letter: !!flags?.requires_pe_letter,
    evidence: flags?.evidence || '',
  };
}

// ---------- Step D: Replicate Flux.1 Inpaint ----------

async function replicateInpaint({ imageUrl, maskDataUrl, prompt }) {
  const token = Deno.env.get('REPLICATE_API_TOKEN');
  if (!token) throw new Error('REPLICATE_API_TOKEN not configured');

  // 1) Create the prediction
  const createRes = await fetch('https://api.replicate.com/v1/models/' + REPLICATE_MODEL + '/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=5', // try synchronous wait up to 5s
    },
    body: JSON.stringify({
      input: {
        image: imageUrl,
        mask: maskDataUrl,
        prompt,
        output_format: 'png',
        safety_tolerance: 5,
        prompt_upsampling: true,
      },
    }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Replicate create HTTP ${createRes.status}: ${body.slice(0, 300)}`);
  }
  let pred = await createRes.json();

  // 2) Poll until done or timeout
  const started = Date.now();
  while (pred.status !== 'succeeded' && pred.status !== 'failed' && pred.status !== 'canceled') {
    if (Date.now() - started > POLL_TIMEOUT_MS) {
      throw new Error('Replicate render timed out after 3 minutes');
    }
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
    const pollRes = await fetch(pred.urls.get, { headers: { Authorization: `Bearer ${token}` } });
    if (!pollRes.ok) {
      const body = await pollRes.text();
      throw new Error(`Replicate poll HTTP ${pollRes.status}: ${body.slice(0, 300)}`);
    }
    pred = await pollRes.json();
  }
  if (pred.status !== 'succeeded') {
    throw new Error(`Replicate render ${pred.status}: ${pred.error || 'unknown error'}`);
  }
  const out = pred.output;
  const urls = Array.isArray(out) ? out : (typeof out === 'string' ? [out] : []);
  return { id: pred.id, urls };
}

// ---------- Deno handler ----------

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const {
      propertyAddress,
      compoundSize,
      towerHeight,
      sourceImageUrl,
      clickedLat,
      clickedLon,
      clickXNorm,
      clickYNorm,
      parcelId,
    } = payload;

    if (!propertyAddress) return Response.json({ error: 'propertyAddress required' }, { status: 400 });
    if (!sourceImageUrl) return Response.json({ error: 'sourceImageUrl (uploaded aerial photo) required' }, { status: 400 });

    const { w: cw, d: cd } = parseCompound(compoundSize);

    // Persist a row up front so the UI can track this run
    const viz = await base44.entities.TowerVisualization.create({
      parcel_id: parcelId || '',
      property_address: propertyAddress,
      compound_size: compoundSize || `${cw}x${cd}`,
      compound_width_ft: cw,
      compound_depth_ft: cd,
      tower_height: towerHeight || '199 monopole',
      clicked_lat: clickedLat ?? null,
      clicked_lon: clickedLon ?? null,
      source_image_url: sourceImageUrl,
      status: 'analyzing',
    });

    // ----- Step A: Realie -----
    let realie = null;
    try {
      realie = await realieLookup(propertyAddress);
    } catch (e) {
      console.error('Realie failed:', e.message);
    }

    // ----- Step B: Notion zoning flags -----
    let flags = null;
    const flagLat = clickedLat ?? realie?.centroid_lat;
    const flagLon = clickedLon ?? realie?.centroid_lon;
    try {
      flags = await notionFlagsLookup(base44, flagLat, flagLon, realie?.zoning_classification);
    } catch (e) {
      console.error('Notion flags failed:', e.message);
    }

    // Persist Realie + flag data before kicking off the render
    await base44.entities.TowerVisualization.update(viz.id, {
      realie_parcel_id: realie?.parcel_id || '',
      realie_owner_name: realie?.owner_name || '',
      realie_acreage: realie?.acreage ?? null,
      realie_zoning_classification: realie?.zoning_classification || '',
      realie_parcel_geometry: realie?.parcel_geometry || null,
      realie_centroid_lat: realie?.centroid_lat ?? null,
      realie_centroid_lon: realie?.centroid_lon ?? null,
      notion_jurisdiction: flags?.jurisdiction || '',
      requires_cup: flags?.requires_cup ?? null,
      requires_pe_letter: flags?.requires_pe_letter ?? null,
      zoning_flag_evidence: flags?.evidence || '',
      status: 'rendering',
    });

    // ----- Step D: Replicate Flux.1 Inpaint -----
    const rect = buildMaskDataUrl(clickXNorm ?? 0.5, clickYNorm ?? 0.5, 0.22);
    const maskDataUrl = makeMaskPngDataUrl(rect);

    const prompt =
      `An ultrarealistic, sharp, crisp professional engineering photograph of a ${towerHeight || '199 ft monopole'} ` +
      `telecommunications tower enclosed within a clean ${cw}x${cd} foot chain-link fenced utility compound ` +
      `with gravel ground cover, seamlessly integrated into the background landscape, ` +
      `matching natural shadows and daylight. Aerial / oblique perspective consistent with the source photo. ` +
      `Sharp focus, no motion blur, no people, no vehicles.`;

    let rendered = { urls: [], id: '' };
    let renderError = '';
    try {
      rendered = await replicateInpaint({ imageUrl: sourceImageUrl, maskDataUrl, prompt });
    } catch (e) {
      renderError = e.message;
      console.error('Replicate render failed:', renderError);
    }

    const finalStatus = rendered.urls.length > 0 ? 'completed' : 'failed';
    const updated = await base44.entities.TowerVisualization.update(viz.id, {
      render_image_urls: rendered.urls,
      replicate_prediction_id: rendered.id,
      status: finalStatus,
      error: renderError,
    });

    return Response.json({
      id: viz.id,
      visualization: updated,
      realie,
      flags,
      render: rendered,
    });
  } catch (error) {
    console.error('analyzePropertyAndVisualize error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});