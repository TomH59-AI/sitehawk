const BASE_URL = "https://bdc.fcc.gov/api/public";
const CACHE_MS = 15 * 60 * 1000;
const cache = globalThis.__sitehawkFccBdcCache ||= new Map();

function cacheGet(key) {
  const item = cache.get(key);
  return item && item.expiresAt > Date.now() ? item.value : null;
}

function cacheSet(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_MS });
  return value;
}

async function request(path, username, token) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { username, hash_value: token, Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status !== "successful") {
    throw new Error(payload.message || `FCC BDC request failed (${response.status})`);
  }
  return payload;
}

export async function getLatestAvailabilityDate(username, token) {
  const cached = cacheGet("latest-availability");
  if (cached) return cached;
  const payload = await request("/map/listAsOfDates", username, token);
  const dates = (payload.data || [])
    .filter((item) => item.data_type === "availability")
    .map((item) => item.as_of_date)
    .filter(Boolean)
    .sort();
  if (!dates.length) throw new Error("FCC BDC returned no availability dates");
  return cacheSet("latest-availability", dates.at(-1));
}

export async function resolveFccGeography(lat, lon) {
  const response = await fetch(`https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lon}&format=json`);
  if (!response.ok) throw new Error(`FCC geography lookup failed (${response.status})`);
  const payload = await response.json();
  const blockFips = payload?.Block?.FIPS || null;
  return {
    blockFips,
    stateFips: blockFips?.slice(0, 2) || null,
    countyFips: blockFips?.slice(0, 5) || null,
    stateCode: payload?.State?.code || null,
    stateName: payload?.State?.name || null,
    countyName: payload?.County?.name || null,
  };
}

export async function getStateProviderFileContext(lat, lon, username, token) {
  const geography = await resolveFccGeography(lat, lon);
  const asOfDate = await getLatestAvailabilityDate(username, token);
  const cacheKey = `provider-list:${asOfDate}:${geography.stateFips}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { ...cached, geography };
  const query = new URLSearchParams({
    category: "State",
    subcategory: "Provider List",
    technology_type: "Fixed Broadband",
  });
  const payload = await request(`/map/downloads/listAvailabilityData/${asOfDate}?${query}`, username, token);
  const file = (payload.data || []).find((item) => String(item.state_fips).padStart(2, "0") === geography.stateFips) || null;
  const value = {
    asOfDate,
    providerListFile: file ? {
      fileId: file.file_id,
      fileName: file.file_name,
      recordCount: file.record_count == null ? null : Number(file.record_count),
      stateName: file.state_name || geography.stateName,
    } : null,
  };
  cacheSet(cacheKey, value);
  return { ...value, geography };
}