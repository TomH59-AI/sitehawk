// kimiPropagationAnalysis — AI read-out of a CloudRF coverage run for Target A.
// Kimi (Moonshot) runs FIRST; any failure falls back to the platform's built-in
// InvokeLLM so the assessment always completes.
// Input: coverage meta (carrier, freq, height, area, radius).
// Output: { analysis, engine } — a short professional RF assessment.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

async function fetchJson(url, options = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: e?.message || String(e) };
  } finally {
    clearTimeout(t);
  }
}

async function runKimi(prompt) {
  const key = Deno.env.get('KIMI_API_KEY');
  if (!key) return null;

  // Discover which base URL + fast model this key has access to.
  let baseUrl = null, model = null;
  for (const b of ['https://api.moonshot.ai/v1', 'https://api.moonshot.cn/v1']) {
    const m = await fetchJson(`${b}/models`, { headers: { Authorization: `Bearer ${key}` } }, 10000);
    const ids = (m.data?.data || []).map((x) => x.id);
    if (m.ok && ids.length) {
      baseUrl = b;
      model = ids.find((id) => id.includes('kimi-k2') && !id.includes('code')) || ids.find((id) => id === 'kimi-latest') || ids[0];
      break;
    }
  }
  if (!baseUrl || !model) return null;

  const res = await fetchJson(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 3000,
      messages: [
        { role: 'system', content: 'You are an RF engineer. Reply with the final assessment text ONLY — no preamble, no analysis of the task itself.' },
        { role: 'user', content: prompt },
      ],
    }),
  }, 60000);

  // Kimi thinking models put chain-of-thought in reasoning_content — only the
  // final `content` is the deliverable.
  const text = res.data?.choices?.[0]?.message?.content;
  if (!res.ok || !text || !String(text).trim()) {
    console.log(`[KIMI] failed status=${res.status} detail=${JSON.stringify(res.data?.error || res.error || '').slice(0, 300)}`);
    return null;
  }
  return String(text).trim();
}

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

    // Kimi first; built-in Base44 LLM as the fallback engine.
    let engine = 'kimi';
    let analysis = await runKimi(prompt).catch((e) => {
      console.log(`[KIMI] error: ${e?.message || e}`);
      return null;
    });

    if (!analysis) {
      engine = 'base44';
      console.log('[KIMI] failed — falling back to built-in LLM');
      const llm = await base44.integrations.Core.InvokeLLM({ prompt });
      analysis = typeof llm === 'string' ? llm.trim() : String(llm || '').trim();
    }

    if (!analysis) return Response.json({ error: 'AI analysis unavailable' }, { status: 502 });
    return Response.json({ analysis, engine });
  } catch (error) {
    console.error('kimiPropagationAnalysis error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});