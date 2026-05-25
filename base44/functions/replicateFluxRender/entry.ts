/**
 * replicateFluxRender — Generates two photorealistic 3D zoning-simulation
 * images via Replicate's Flux Schnell model, in parallel.
 *
 * Payload:
 *   {
 *     tower_height: number (ft),
 *     dimensions: string (e.g. "200x200"),
 *     setbacks: number (ft),
 *     separation: number (ft),
 *     pe_letter_allowed: boolean
 *   }
 *
 * Returns:
 *   { drone_url, eye_level_url, pe_letter_allowed, prompts: { drone, eye_level } }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const REPLICATE_MODEL = 'black-forest-labs/flux-schnell';
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 120000;

async function runFlux({ prompt, aspect_ratio }) {
  const token = Deno.env.get('REPLICATE_API_TOKEN');
  if (!token) throw new Error('REPLICATE_API_TOKEN not configured');

  const createRes = await fetch(
    `https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=8',
      },
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio: aspect_ratio || '16:9',
          output_format: 'webp',
          output_quality: 90,
          num_outputs: 1,
          go_fast: true,
        },
      }),
    }
  );

  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Replicate create HTTP ${createRes.status}: ${body.slice(0, 300)}`);
  }
  let pred = await createRes.json();

  const started = Date.now();
  while (pred.status !== 'succeeded' && pred.status !== 'failed' && pred.status !== 'canceled') {
    if (Date.now() - started > POLL_TIMEOUT_MS) {
      throw new Error('Replicate render timed out');
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pollRes = await fetch(pred.urls.get, {
      headers: { Authorization: `Bearer ${token}` },
    });
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
  const url = Array.isArray(out) ? out[0] : (typeof out === 'string' ? out : null);
  if (!url) throw new Error('Replicate returned no image URL');
  return url;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const tower_height = Number(payload.tower_height) || 120;
    const dimensions = String(payload.dimensions || '200x200').trim();
    const setbacks = Number(payload.setbacks) || 50;
    const separation = Number(payload.separation) || 200;
    const pe_letter_allowed = !!payload.pe_letter_allowed;

    const dronePrompt =
      `A crisp, professional 3D architectural rendering, high-angle drone perspective. ` +
      `A cell tower compound featuring a ${tower_height}ft monopole tower situated on a ${dimensions}ft land parcel. ` +
      `The compound is enclosed by a clean chain-link fence, surrounded by professional landscaping with evergreen trees ` +
      `screening the base equipment. A clear, 20-foot wide gravel access easement road runs from the edge of the property ` +
      `to the gate. Clear setbacks adhering to a ${setbacks}ft fall zone are visible, separating it beautifully from ` +
      `neighboring structures. Photorealistic, clean architectural blueprint visualization style, bright daylight.`;

    const eyeLevelPrompt =
      `A professional, realistic eye-level architectural rendering from the edge of a property line looking toward a ` +
      `newly built telecommunications site. Features a clean, modern ${tower_height}ft cell tower. The base compound ` +
      `is elegantly hidden behind lush landscaping and evergreen bushes. A 20-foot wide gravel access driveway leads ` +
      `to the compound gate. The scene demonstrates an excellent ${separation}ft separation from nearby residential ` +
      `zones, conveying safety and compliance. Photorealistic drone photography style, crisp details, afternoon ` +
      `golden-hour lighting.`;

    // Fire both renders in parallel
    const [drone_url, eye_level_url] = await Promise.all([
      runFlux({ prompt: dronePrompt, aspect_ratio: '16:9' }),
      runFlux({ prompt: eyeLevelPrompt, aspect_ratio: '16:9' }),
    ]);

    return Response.json({
      drone_url,
      eye_level_url,
      pe_letter_allowed,
      prompts: { drone: dronePrompt, eye_level: eyeLevelPrompt },
      inputs: { tower_height, dimensions, setbacks, separation },
    });
  } catch (error) {
    console.error('replicateFluxRender error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});