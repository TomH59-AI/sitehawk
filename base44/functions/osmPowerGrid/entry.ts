/**
 * osmPowerGrid
 *
 * Base44 wrapper that forwards the request to the Supabase Edge Function
 * `osmPowerGrid`, which queries OpenStreetMap Overpass for live power
 * infrastructure: transmission/distribution lines, towers, poles, and
 * transformers with voltage (kV) and operator tags.
 */

interface Bbox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export default async function (payload: { bbox: Bbox; layer: string }, context: any) {
  const rawUrl = Deno.env.get("HAWK_SUPABASE_URL");
  const rawKey = Deno.env.get("HAWK_SUPABASE_ANON_KEY");
  if (!rawUrl || !rawKey) {
    throw new Error("Supabase configuration is missing");
  }

  const cleanedUrl = rawUrl.replace(/^[\\'"\s]+/, "").replace(/[\\'"\s/]+$/, "");
  const url = /^https?:\/\//i.test(cleanedUrl) ? cleanedUrl : `https://${cleanedUrl}`;
  const functionUrl = `${url}/functions/v1/osmPowerGrid`;

  const resp = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${rawKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bbox: payload.bbox, layer: payload.layer }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`osmPowerGrid Edge Function failed: ${resp.status} ${text}`);
  }

  return await resp.json();
}
