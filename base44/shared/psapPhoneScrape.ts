// Scrapfly-backed non-emergency phone discovery for a 911 PSAP.
// The FCC Master PSAP Registry publishes NO phone numbers, so we scrape the
// agency's own public page. Nothing is inferred: a number is returned ONLY when
// it appears on a scraped page next to non-emergency/administrative wording,
// and it always comes back with the page it was read from.

const SCRAPFLY = "https://api.scrapfly.io/scrape";

// Phone patterns like (352) 369-7000, 352-369-7000, 352.369.7000
const PHONE_RE = /\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-](\d{4})\b/g;
const NON_EMERGENCY_RE =
  /non-?emergency|administrative office|admin(?:istration)? (?:phone|line|office)|business line|main office|dispatch \(non/i;

const fmt = (a: string, b: string, c: string) => `(${a}) ${b}-${c}`;

async function scrape(url: string, key: string) {
  const params = new URLSearchParams({
    key, url, asp: "true", country: "us", render_js: "true", format: "markdown",
  });
  const res = await fetch(`${SCRAPFLY}?${params.toString()}`);
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body?.result?.content || null;
}

// Pull the first phone number that sits within ~200 chars of non-emergency wording.
function phoneNearNonEmergency(text: string): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, " ");
  PHONE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PHONE_RE.exec(flat))) {
    const [full, a, b, c] = m;
    if (a === "911" || a === "000") continue;
    const window = flat.slice(Math.max(0, m.index - 200), m.index + full.length + 80);
    if (NON_EMERGENCY_RE.test(window)) return fmt(a, b, c);
  }
  return null;
}

// Candidate result URLs from the DuckDuckGo HTML SERP, official domains first.
function candidateUrls(serp: string): string[] {
  const urls: string[] = [];
  const re = /uddg=([^&"')\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(serp))) {
    try {
      const u = decodeURIComponent(m[1]);
      if (/^https?:\/\//.test(u) && !/duckduckgo|facebook|yelp|wikipedia|linkedin/i.test(u)) urls.push(u);
    } catch { /* skip malformed */ }
  }
  const unique = [...new Set(urls)];
  const official = unique.filter((u) => /\.gov(\/|$)|\.us(\/|$)/i.test(new URL(u).hostname));
  return [...official, ...unique.filter((u) => !official.includes(u))].slice(0, 3);
}

export async function scrapePsapNonEmergencyPhone(
  psap: { psap_name?: string; city?: string; county?: string; state?: string },
  apiKey: string | undefined,
): Promise<{ phone: string; source_url: string; status: "source-scraped" } | null> {
  if (!apiKey || !psap?.psap_name) return null;
  // No quoted phrases — DuckDuckGo returns almost nothing for exact-phrase agency names.
  const query = [psap.psap_name, psap.city || psap.county, psap.state, "non-emergency phone"]
    .filter(Boolean).join(" ");
  const serpUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  try {
    const serp = await scrape(serpUrl, apiKey);
    if (!serp) return null;
    for (const url of candidateUrls(serp)) {
      const phone = phoneNearNonEmergency(await scrape(url, apiKey) || "");
      if (phone) return { phone, source_url: url, status: "source-scraped" };
    }
    // Last resort: the number published in the search-result snippets themselves.
    const fromSerp = phoneNearNonEmergency(serp);
    if (fromSerp) return { phone: fromSerp, source_url: serpUrl, status: "source-scraped" };
  } catch (e) {
    console.warn("scrapePsapNonEmergencyPhone failed:", (e as Error).message);
  }
  return null;
}