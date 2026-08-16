/**
 * ownerContactLookup
 *
 * Base44 wrapper that forwards the request to the Supabase Edge Function
 * `ownerContactLookup`, which looks up owner contact information from public
 * records and people-search sources.
 */

interface OwnerContactPayload {
  ownerName: string;
  address?: string;
  jurisdiction?: string;
}

export default async function (payload: OwnerContactPayload, context: any) {
  const rawUrl = Deno.env.get("HAWK_SUPABASE_URL");
  const rawKey = Deno.env.get("HAWK_SUPABASE_ANON_KEY");
  if (!rawUrl || !rawKey) {
    throw new Error("Supabase configuration is missing");
  }

  const cleanedUrl = rawUrl.replace(/^[\\'"\s]+/, "").replace(/[\\'"\s/]+$/, "");
  const url = /^https?:\/\//i.test(cleanedUrl) ? cleanedUrl : `https://${cleanedUrl}`;
  const functionUrl = `${url}/functions/v1/ownerContactLookup`;

  const resp = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${rawKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ownerName: payload.ownerName,
      address: payload.address,
      jurisdiction: payload.jurisdiction,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ownerContactLookup Edge Function failed: ${resp.status} ${text}`);
  }

  return await resp.json();
}
