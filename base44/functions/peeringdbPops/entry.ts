/**
 * peeringdbPops
 *
 * Base44 wrapper that forwards the request to the Supabase Edge Function
 * `peeringdbPops`, which queries PeeringDB for colocation facilities
 * (carrier PoPs and backhaul nodes) near a given latitude/longitude.
 */

interface PeeringdbPayload {
  lat: number;
  lon: number;
  radius_deg?: number;
}

export default async function (payload: PeeringdbPayload, context: any) {
  const rawUrl = Deno.env.get("HAWK_SUPABASE_URL");
  const rawKey = Deno.env.get("HAWK_SUPABASE_ANON_KEY");
  if (!rawUrl || !rawKey) {
    throw new Error("Supabase configuration is missing");
  }

  const cleanedUrl = rawUrl.replace(/^[\\'"\s]+/, "").replace(/[\\'"\s/]+$/, "");
  const url = /^https?:\/\//i.test(cleanedUrl) ? cleanedUrl : `https://${cleanedUrl}`;
  const functionUrl = `${url}/functions/v1/peeringdbPops`;

  const resp = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${rawKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lat: payload.lat,
      lon: payload.lon,
      radius_deg: payload.radius_deg ?? 1.5,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`peeringdbPops Edge Function failed: ${resp.status} ${text}`);
  }

  return await resp.json();
}
