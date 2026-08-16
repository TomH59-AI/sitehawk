import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUSINESS_RE = /\b(llc|l\.l\.c\.|inc\b|corp\b|corporation|trust\b|lp\b|l\.p\.|association|partners|holdings|properties)\b/gi;

function isBusiness(name: string) {
  return BUSINESS_RE.test(name || "");
}

function normalizePhone(raw: string) {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function labelPhoneType(htmlLower: string, index: number) {
  const window = htmlLower.slice(Math.max(0, index - 80), index + 80);
  if (window.includes("mobile") || window.includes("cell")) return "Mobile";
  if (window.includes("work") || window.includes("business")) return "Work";
  if (window.includes("home") || window.includes("residence")) return "Home";
  return "Phone";
}

function extractPhones(html: string) {
  const seen = new Set<string>();
  const phones: { number: string; type: string }[] = [];
  const htmlLower = html.toLowerCase();
  const re = /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const normalized = normalizePhone(m[0]);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    phones.push({ number: normalized, type: labelPhoneType(htmlLower, m.index) });
  }
  return phones;
}

function extractEmails(html: string) {
  const seen = new Set<string>();
  const emails: string[] = [];
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const email = m[0].toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

function detectStateCode(jurisdiction: string) {
  const parts = (jurisdiction || "").split(",");
  const tail = parts[parts.length - 1] || "";
  const code = tail.trim().toLowerCase();
  if (code.length === 2) return code;
  const usState = tail.trim().match(/^\s*([A-Za-z]{2})\b/);
  return usState ? usState[1].toLowerCase() : null;
}

async function scrapflyHtml(payload: unknown, apiKey: string | undefined) {
  if (!apiKey) return null;
  try {
    const resp = await fetch("https://api.scrapfly.io/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: apiKey, ...payload }),
    });
    if (!resp.ok) {
      console.error("[ownerContactLookup] ScrapFly HTTP", resp.status);
      return null;
    }
    const text = await resp.text();
    try {
      const json = JSON.parse(text);
      return json?.result?.content || json?.content || json?.result || text;
    } catch {
      return text;
    }
  } catch (e) {
    console.error("[ownerContactLookup] ScrapFly fetch error:", e?.message);
    return null;
  }
}

function hasContact(phones: unknown[], emails: unknown[]) {
  return phones.length > 0 || emails.length > 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SCRAPFLY_KEY = Deno.env.get("SCRAPFLY_API_KEY");
  let ownerName = "";
  let address = "";
  let jurisdiction = "";

  try {
    const body = await req.json();
    ownerName = body.ownerName || "";
    address = body.address || "";
    jurisdiction = body.jurisdiction || "";
  } catch {
    return new Response(
      JSON.stringify({ phones: [], emails: [], source: "No records found" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const empty = { phones: [], emails: [] };

  // STEP 1 — TruePeopleSearch (individual person lookup)
  if (!isBusiness(ownerName)) {
    try {
      const searchName = encodeURIComponent(ownerName);
      const cityState = encodeURIComponent(jurisdiction);
      const html = await scrapflyHtml(
        {
          url: `https://www.truepeoplesearch.com/find/person?name=${searchName}&citystatezip=${cityState}`,
          render_js: true,
          asp: true,
          country: "us",
          proxy_pool: "public_residential_pool",
        },
        SCRAPFLY_KEY,
      );
      if (typeof html === "string") {
        const phones = extractPhones(html);
        const emails = extractEmails(html);
        if (hasContact(phones, emails)) {
          return new Response(
            JSON.stringify({ ...empty, phones, emails, source: "TruePeopleSearch" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    } catch (e) {
      console.error("[ownerContactLookup] TruePeopleSearch step failed:", e?.message);
    }

    // STEP 2 — Whitepages (person fallback)
    try {
      const searchName = encodeURIComponent(ownerName);
      const cityState = encodeURIComponent(jurisdiction);
      const html = await scrapflyHtml(
        {
          url: `https://www.whitepages.com/name/${searchName.replace(/%20/g, "-")}/${cityState.replace(/%2C%20/g, "/")}`,
          render_js: true,
          asp: true,
          country: "us",
          proxy_pool: "public_residential_pool",
        },
        SCRAPFLY_KEY,
      );
      if (typeof html === "string") {
        const phones = extractPhones(html);
        const emails = extractEmails(html);
        if (hasContact(phones, emails)) {
          return new Response(
            JSON.stringify({ ...empty, phones, emails, source: "Whitepages" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    } catch (e) {
      console.error("[ownerContactLookup] Whitepages step failed:", e?.message);
    }
  }

  // STEP 3 — OpenCorporates API (business entity lookup)
  const runBusinessLookup = isBusiness(ownerName);
  if (runBusinessLookup || true) {
    try {
      const stateCode = detectStateCode(jurisdiction);
      const searchName = encodeURIComponent(ownerName);
      const jc = stateCode ? `us_${stateCode}` : "";
      const url = `https://api.opencorporates.com/v0.4/companies/search?q=${searchName}${jc ? `&jurisdiction_code=${jc}` : ""}&inactive=false`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "SiteHawk/1.0 (telecom site acquisition platform)" },
      });
      if (resp.ok) {
        const data = await resp.json();
        const company = data?.results?.companies?.[0]?.company;
        if (company) {
          const agent = company.registered_agent_name || company.registered_agent?.name || company.officers?.[0]?.name || "";
          return new Response(
            JSON.stringify({
              ...empty,
              business_name: company.name,
              agent,
              source: "OpenCorporates",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    } catch (e) {
      console.error("[ownerContactLookup] OpenCorporates step failed:", e?.message);
    }
  }

  // STEP 4 — DuckDuckGo web search (final fallback)
  try {
    const query = `"${ownerName}" ${jurisdiction} phone OR email OR contact`;
    const html = await scrapflyHtml(
      {
        url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        render_js: false,
        asp: false,
      },
      SCRAPFLY_KEY,
    );
    if (typeof html === "string") {
      const phones = extractPhones(html);
      const emails = extractEmails(html);
      return new Response(
        JSON.stringify({ ...empty, phones, emails, source: "Web search" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (e) {
    console.error("[ownerContactLookup] DuckDuckGo step failed:", e?.message);
  }

  // STEP 5 — Graceful empty return
  return new Response(
    JSON.stringify({ phones: [], emails: [], source: "No records found" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
