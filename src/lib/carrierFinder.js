/**
 * carrierFinder — CarrierFinder connectivity layer for the target pipeline.
 * Calls the Supabase edge function `carrierfinder` per target lat/lon.
 * Additive only — never blocks or replaces base Realie/skip-trace data.
 * In-memory cache keyed by coordinates so re-renders never re-fetch.
 *
 * The edge function injects the CarrierFinder key + userid server-side, so no
 * CarrierFinder credential ever lives in this client. Mirrors the regridEnrich
 * pattern (endpoint + anon publishable key + coord cache).
 */

const ENDPOINT = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/carrierfinder";
const APIKEY = "sb_publishable_GMm2u8HJeCv8vboySM8CNg_IAdbCS27";

const authHeaders = {
  "Content-Type": "application/json",
  apikey: APIKEY,
  Authorization: `Bearer ${APIKEY}`,
};

// coords key → Promise (dedupes in-flight requests too)
const cache = new Map();

async function callCF(payload) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`CarrierFinder failed (${res.status})`);
  const body = await res.json();
  if (!body.ok) throw new Error(body.statusmsg || body.error || "CarrierFinder error");
  return body.data;
}

/**
 * Full connectivity pull for one target. Fires get_telcoinfo(geo) and
 * get_carriers_by_zip in parallel. The ZIP is derived from the target's own
 * parcel address (passed in) — NOT from the telco CO ZIP, which is often a
 * different town. Any half that fails degrades to null; the other half still
 * returns. Cached by coordinates.
 */
export async function carrierFinderTarget(lat, lon, zip) {
  const key = `${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`;
  if (cache.has(key)) return cache.get(key);

  const promise = (async () => {
    const [telco, carriers] = await Promise.all([
      callCF({ endpoint: "get_telcoinfo", lat: Number(lat), lon: Number(lon) }).catch(() => null),
      zip ? callCF({ endpoint: "get_carriers_by_zip", zip: String(zip) }).catch(() => null) : Promise.resolve(null),
    ]);
    return { telco, carriers };
  })();

  cache.set(key, promise);
  try {
    return await promise;
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

// Backhaul-relevant carrier types (verified live across 8 metros).
const BACKHAUL_TYPES = new Set(["fixed wireless", "dlec", "datacenter", "clec"]);

/**
 * Normalize a carrierFinderTarget() result into the fields the UI shows:
 *   serving telco CO (name, parent, CLLI, LATA, exchange, CO address)
 *   backhaul carriers (filtered) + full carrier count
 */
export function normalizeCarrierFinder(raw) {
  if (!raw) return null;
  const t = raw.telco || {};
  const carriersArr = raw.carriers?.carriers || [];

  const backhaul = carriersArr
    .filter((c) => BACKHAUL_TYPES.has(String(c.carriertype || "").trim().toLowerCase()))
    .map((c) => ({
      name: c.carriername,
      type: c.carriertype,
      rating: c.rating,
      quote: c.quote,
    }));

  const servingOffice = t.telco_telconame
    ? {
        telco: t.telco_telconame,
        parent: t.telco_parentname || null,
        clli: t.telco_clli || null,
        exchange: t.telco_exchange || null,
        lata: t.telco_lataname || t.telco_lata || null,
        npanxx: t.telco_npanxx || null,
        co_address: [t.telco_co_street, t.telco_co_city, t.telco_co_state, t.telco_co_zipcode]
          .filter(Boolean)
          .join(", ") || null,
        website: t.website || null,
      }
    : null;

  if (!servingOffice && backhaul.length === 0 && carriersArr.length === 0) return null;

  return {
    serving_office: servingOffice,
    backhaul,
    total_carriers: carriersArr.length,
    source: "CarrierFinder",
  };
}

// Pull a 5-digit ZIP out of a free-form parcel/mailing address string.
export function zipFromAddress(addr) {
  if (!addr) return null;
  const m = String(addr).match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}
