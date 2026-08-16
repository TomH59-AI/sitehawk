/**
 * hifldUtilityEnrichment
 *
 * Base44 wrapper that forwards the request to the Supabase Edge Function
 * `hifldUtilityEnrichment`, which performs a point-in-polygon query against
 * HIFLD Electric Retail Service Territories to return the serving utility
 * name, phone, website, and address.
 */

interface HifldUtilityPayload {
  lat: number;
  lon: number;
}

export default async function (payload: HifldUtilityPayload, context: any) {
  const rawUrl = Deno.env.get("HAWK_SUPABASE_URL");
  const rawKey = Deno.env.get("HAWK_SUPABASE_ANON_KEY");
  if (!rawUrl || !rawKey) {
    throw new Error("Supabase configuration is missing");
  }

  const cleanedUrl = rawUrl.replace(/^[\\'"\s]+/, "").replace(/[\\'"\s/]+$/, "");
  const url = /^https?:\/\//i.test(cleanedUrl) ? cleanedUrl : `https://${cleanedUrl}`;
  const functionUrl = `${url}/functions/v1/hifldUtilityEnrichment`;

  const resp = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${rawKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lat: payload.lat,
      lon: payload.lon,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`hifldUtilityEnrichment Edge Function failed: ${resp.status} ${text}`);
  }

  return await resp.json();
}
