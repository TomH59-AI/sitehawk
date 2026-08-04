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

const fips = (value) => (value == null ? null : String(value).padStart(2, "0"));

// The published availability index for one as-of date. One fetch, cached, then
// filtered per state — the index itself names every provider publishing
// fixed-broadband location coverage, so provider names need no file download.
async function getAvailabilityIndex(asOfDate, username, token) {
  const cacheKey = `availability-index:${asOfDate}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const payload = await request(`/map/downloads/listAvailabilityData/${asOfDate}`, username, token);
  return cacheSet(cacheKey, payload.data || []);
}

export async function getStateProviderFileContext(lat, lon, username, token) {
  const geography = await resolveFccGeography(lat, lon);
  const asOfDate = await getLatestAvailabilityDate(username, token);
  const cacheKey = `provider-list:${asOfDate}:${geography.stateFips}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { ...cached, geography };

  const rows = await getAvailabilityIndex(asOfDate, username, token);
  const inState = rows.filter((row) => fips(row.state_fips) === geography.stateFips);

  // NOTE: State|Provider List rows publish an EMPTY technology_type — never
  // filter this subcategory by technology or it silently matches nothing.
  const listFile = inState.find(
    (row) => row.category === "State" && row.subcategory === "Provider List",
  ) || null;

  // Per-provider fixed-broadband location-coverage files published for this state.
  const fixedRows = rows.filter(
    (row) => row.category === "Provider" &&
      row.subcategory === "Location Coverage" &&
      row.technology_type === "Fixed Broadband" &&
      fips(row.state_fips) === geography.stateFips,
  );
  const byProvider = new Map();
  for (const row of fixedRows) {
    if (!row.provider_name) continue;
    const entry = byProvider.get(row.provider_name) || {
      provider_name: row.provider_name,
      provider_id: row.provider_id ?? null,
      technologies: new Set(),
    };
    if (row.technology_code_desc) entry.technologies.add(row.technology_code_desc);
    byProvider.set(row.provider_name, entry);
  }
  const fixedProviders = [...byProvider.values()]
    .map((entry) => ({ ...entry, technologies: [...entry.technologies].sort() }))
    .sort((a, b) => a.provider_name.localeCompare(b.provider_name));

  const value = {
    asOfDate,
    providerListFile: listFile ? {
      fileId: listFile.file_id,
      fileName: listFile.file_name,
      recordCount: listFile.record_count == null ? null : Number(listFile.record_count),
      stateName: listFile.state_name || geography.stateName,
    } : null,
    fixedProviders,
    stateProviderTotals: {
      fixed_broadband_providers: fixedProviders.length,
      fixed_coverage_files: fixedRows.length,
    },
  };
  cacheSet(cacheKey, value);
  return { ...value, geography };
}