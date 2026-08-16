/**
 * fccFiberProviders
 *
 * Base44 wrapper that forwards the request to the Supabase Edge Function
 * `fccFiberProviders`, which queries the FCC National Broadband Map for
 * fiber providers (technology code 50 FTTP) at a given latitude/longitude.
 */

interface FccFiberPayload {
  lat: number;
  lon: number;
}

export default async function (payload: FccFiberPayload, context: any) {
  const rawUrl = Deno.env.get("HAWK_SUPABASE_URL");
  const rawKey = Deno.env.get("HAWK_SUPABASE_ANON_KEY");
  if (!rawUrl || !rawKey) {
    throw new Error("Supabase configuration is missing");
  }

  const cleanedUrl = rawUrl.replace(/^[\\'"\s]+/, "").replace(/[\\'"\s/]+$/, "");
  const url = /^https?:\/\//i.test(cleanedUrl) ? cleanedUrl : `https://${cleanedUrl}`;
  const functionUrl = `${url}/functions/v1/fccFiberProviders`;

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
    throw new Error(`fccFiberProviders Edge Function failed: ${resp.status} ${text}`);
  }

  return await resp.json();
}
