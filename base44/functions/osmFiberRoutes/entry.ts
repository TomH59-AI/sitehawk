/**
 * osmFiberRoutes
 *
 * Base44 wrapper that forwards the request to the Supabase Edge Function
 * `osmFiberRoutes`, which queries OpenStreetMap Overpass for live fiber
 * routes and telecom infrastructure (cabinets, manholes, junction boxes).
 */

interface Bbox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export default async function (payload: { bbox: Bbox }, context: any) {
  const rawUrl = Deno.env.get("HAWK_SUPABASE_URL");
  const rawKey = Deno.env.get("HAWK_SUPABASE_ANON_KEY");
  if (!rawUrl || !rawKey) {
    throw new Error("Supabase configuration is missing");
  }

  const cleanedUrl = rawUrl.replace(/^[\\'"\s]+/, "").replace(/[\\'"\s/]+$/, "");
  const url = /^https?:\/\//i.test(cleanedUrl) ? cleanedUrl : `https://${cleanedUrl}`;
  const functionUrl = `${url}/functions/v1/osmFiberRoutes`;

  const resp = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${rawKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bbox: payload.bbox }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`osmFiberRoutes Edge Function failed: ${resp.status} ${text}`);
  }

  return await resp.json();
}
