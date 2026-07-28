/**
 * hawkVisionPhotoRender — HawkVision photo-to-render.
 *
 * Upload a parcel photo → AI composites the to-scale tower + fenced compound +
 * landscaped screening buffer + gravel access road into THAT photo, using
 * Replicate Flux Kontext (instruction-based image editing — keeps the parcel,
 * sky, and surroundings, only adds the tower facility).
 *
 * Payload:
 *   {
 *     photo_url: string,          // uploaded parcel photo URL (Core.UploadFile)
 *     tower_height: number (ft),  // default 199
 *     tower_type: string,         // monopole | lattice | guyed | stealth
 *     compound_size: string,      // "50x50" | "75x75" | "100x100"
 *     buffer_ft: number,          // landscaped buffer width in ft (10|25|50)
 *     scene: string               // "drone" | "eye-level" | "street"
 *   }
 *
 * Returns:
 *   { render_url, prompt, inputs }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MODEL = 'black-forest-labs/flux-kontext-pro';
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 180000;

async function runKontext({ prompt, input_image }: { prompt: string; input_image: string }): Promise<string> {
  const token = Deno.env.get('REPLICATE_API_TOKEN');
  if (!token) throw new Error('REPLICATE_API_TOKEN not configured');

  const createRes = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=8',
    },
    body: JSON.stringify({
      input: {
        prompt,
        input_image,
        output_format: 'jpg',
      },
    }),
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Replicate create HTTP ${createRes.status}: ${body.slice(0, 300)}`);
  }
  let pred: any = await createRes.json();

  const started = Date.now();
  while (pred.status !== 'succeeded' && pred.status !== 'failed' && pred.status !== 'canceled') {
    if (Date.now() - started > POLL_TIMEOUT_MS) throw new Error('Replicate render timed out');
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pollRes = await fetch(pred.urls.get, { headers: { Authorization: `Bearer ${token}` } });
    if (!pollRes.ok) {
      const body = await pollRes.text();
      throw new Error(`Replicate poll HTTP ${pollRes.status}: ${body.slice(0, 300)}`);
    }
    pred = await pollRes.json();
  }

  if (pred.status !== 'succeeded') {
    throw new Error(`Replicate render ${pred.status}: ${pred.error || 'unknown'}`);
  }

  const out = pred.output;
  const url = Array.isArray(out) ? out[0] : (typeof out === 'string' ? out : out?.url || null);
  if (!url) throw new Error('Replicate returned no image URL');
  return url;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const photo_url = String(payload?.photo_url || '').trim();
    if (!photo_url) {
      return Response.json({ error: 'photo_url is required — upload a parcel photo first' }, { status: 400 });
    }

    const tower_height = Number(payload.tower_height) || 199;
    const tower_type = ['monopole', 'lattice', 'guyed', 'stealth'].includes(payload.tower_type)
      ? payload.tower_type
      : 'monopole';
    const compound_size = String(payload.compound_size || '75x75').trim();
    const buffer_ft = [10, 25, 50].includes(Number(payload.buffer_ft)) ? Number(payload.buffer_ft) : 25;
    const scene =
      payload.scene === 'eye-level'
        ? 'eye-level from the property line'
        : payload.scene === 'street'
          ? 'street-level'
          : 'high-angle drone';

    const prompt =
      `Photorealistic architectural visualization, ${scene} perspective. Insert into THIS existing property photo a newly constructed ${tower_type} cell tower, ` +
      `approximately ${tower_height} ft tall, standing at the most suitable location on the parcel. At its base add a clean ${compound_size} ft fenced equipment compound ` +
      `enclosed by a chain-link fence, surrounded by a ${buffer_ft} ft wide landscaped evergreen screening buffer that hides the base equipment. ` +
      `Add a 20-foot wide gravel access easement road running from the nearest property edge to the compound gate. ` +
      `Keep the rest of the parcel, terrain, sky, surrounding buildings, and lighting from the original photo completely intact — only add the tower, compound, landscaping, and access road, ` +
      `blended realistically with correct scale, shadows, and perspective that match the original photo. Crisp, professional, daylight.`;

    const render_url = await runKontext({ prompt, input_image: photo_url });

    return Response.json({
      render_url,
      prompt,
      inputs: { tower_height, tower_type, compound_size, buffer_ft, scene },
    });
  } catch (error) {
    console.error('hawkVisionPhotoRender error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});