// Shared page-scrape helper for SiteHawk backend functions.
// PRIMARY: Oxylabs Web Scraper API (realtime.oxylabs.io).
// DEFAULT FALLBACK: Scrapfly (ASP + JS render) when Oxylabs is unset, errors,
// or returns nothing. Returns raw page content plus which provider produced it,
// so callers can label provenance. Never fabricates content.

export type ScrapedPage = { content: string; provider: "oxylabs" | "scrapfly"; url: string };

async function viaOxylabs(url: string, renderJs: boolean): Promise<string> {
  const username = Deno.env.get("OXYLABS_USERNAME");
  const password = Deno.env.get("OXYLABS_PASSWORD");
  if (!username || !password) return "";
  const res = await fetch("https://realtime.oxylabs.io/v1/queries", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${username}:${password}`)}`,
    },
    body: JSON.stringify({
      source: "universal",
      url,
      render: renderJs ? "html" : undefined,
      geo_location: "United States",
      user_agent_type: "desktop",
    }),
  });
  if (!res.ok) {
    console.warn(`[webScrape] Oxylabs HTTP ${res.status} for ${url}`);
    return "";
  }
  const data = await res.json().catch(() => null);
  return data?.results?.[0]?.content || "";
}

async function viaScrapfly(url: string, renderJs: boolean, format: string): Promise<string> {
  const key = Deno.env.get("SCRAPFLY_API_KEY");
  if (!key) return "";
  const qs = new URLSearchParams({
    key, url, asp: "true", country: "us",
    render_js: renderJs ? "true" : "false", format,
  });
  const res = await fetch(`https://api.scrapfly.io/scrape?${qs.toString()}`);
  if (!res.ok) {
    console.warn(`[webScrape] Scrapfly HTTP ${res.status} for ${url}`);
    return "";
  }
  const data = await res.json().catch(() => null);
  return data?.result?.content || "";
}

// Oxylabs first, Scrapfly as the default fallback.
export async function scrapePage(
  url: string,
  opts: { renderJs?: boolean; scrapflyFormat?: string } = {},
): Promise<ScrapedPage | null> {
  const renderJs = opts.renderJs !== false;
  try {
    const oxy = await viaOxylabs(url, renderJs);
    if (oxy) return { content: oxy, provider: "oxylabs", url };
  } catch (e) {
    console.warn(`[webScrape] Oxylabs failed for ${url}: ${(e as Error).message}`);
  }
  try {
    const sf = await viaScrapfly(url, renderJs, opts.scrapflyFormat || "raw");
    if (sf) return { content: sf, provider: "scrapfly", url };
  } catch (e) {
    console.warn(`[webScrape] Scrapfly failed for ${url}: ${(e as Error).message}`);
  }
  return null;
}