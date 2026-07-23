// kimiPropagationAnalysis — AI read-out of a CloudRF coverage run for Target A.
// Runs on the platform's built-in InvokeLLM (Kimi/Moonshot API removed).
// Input: coverage meta (carrier, freq, height, area, radius).
// Output: { analysis, engine } — a short professional RF assessment.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      site_name = 'Target A', lat, lon, height_ft, carrier, frequency_mhz,
      area_covered_sq_km, radius_mi, threshold_dbm,
    } = await req.json();

    const prompt = `You are an RF engineer reviewing a CloudRF /area propagation simulation for a proposed telecom tower site.

SITE: ${site_name}
COORDINATES: ${lat}, ${lon}
ANTENNA HEIGHT: ${height_ft} ft AGL
CARRIER PRESET: ${carrier || 'generic'}
FREQUENCY: ${frequency_mhz || '—'} MHz
ANALYSIS RADIUS: ${radius_mi || '—'} miles
RECEIVER THRESHOLD: ${threshold_dbm || -100} dBm
SERVED FOOTPRINT AREA: ${area_covered_sq_km != null ? `${Number(area_covered_sq_km).toFixed(2)} sq km` : 'unknown'}

Write a concise professional RF propagation assessment (3 short paragraphs max, plain text, no markdown headers):
1. What the modeled coverage footprint indicates about this site's RF viability at the given height and frequency.
2. Practical implications — likely coverage reach, terrain sensitivity at this band, and what would improve the footprint (height, band choice).
3. A one-sentence bottom-line recommendation for the site acquisition team.`;

    const llm = await base44.integrations.Core.InvokeLLM({ prompt });
    const analysis = typeof llm === 'string' ? llm.trim() : String(llm || '').trim();

    if (!analysis) return Response.json({ error: 'AI analysis unavailable' }, { status: 502 });
    return Response.json({ analysis, engine: 'base44' });
  } catch (error) {
    console.error('kimiPropagationAnalysis error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});