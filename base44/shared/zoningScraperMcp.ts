// zoningScraperMcp — client for the SiteHawk "Zoning Scraper MCP" running on
// Railway (github.com/TomH59-AI/mcp-zoning-scraper).
//
// The scraper reads the Notion database "The United States Zoning URL"
// (Jurisdiction | Authority Level | URL | State), scrapes every URL a
// jurisdiction has, and POSTs the page text to this app's zoningScraperIngest
// function, which fills the SCIP template into the Jurisdiction entity and the
// numeric tower rules into TelecomOrdinance.
//
// This module is what lets the SCIP zoning path say: "the backend has no
// ordinance for this jurisdiction — go get it out of Notion right now."
//
// Secrets: ZONING_MCP_URL (defaults to the production Railway URL) and
// ZONING_MCP_TOKEN (the server's MCP_AUTH_TOKEN).

const DEFAULT_URL = 'https://mcp-zoning-scraper-production.up.railway.app/mcp';

// A run that has not landed by the time the caller's budget expires is NOT
// wasted: the Railway job keeps going and posts to zoningScraperIngest on its
// own, so the next SCIP for this jurisdiction reads it straight from Base44.
const POLL_INTERVAL_MS = 4000;

function parseRpc(text: string): any {
  // The streamable-HTTP transport answers as SSE ("event: message\ndata: {...}").
  const line = text.split('\n').find((l) => l.startsWith('data:'));
  const payload = line ? line.slice(5).trim() : text.trim();
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function toolText(rpc: any): any {
  const raw = rpc?.result?.content?.[0]?.text;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function call(url: string, token: string, name: string, args: any, timeoutMs = 30000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name, arguments: args },
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`MCP ${name} HTTP ${res.status}: ${text.slice(0, 200)}`);
    const rpc = parseRpc(text);
    if (rpc?.error) throw new Error(`MCP ${name}: ${rpc.error.message || 'rpc error'}`);
    return toolText(rpc);
  } finally {
    clearTimeout(timer);
  }
}

export function zoningMcpConfigured(secrets: any): boolean {
  return Boolean(secrets.get('ZONING_MCP_TOKEN'));
}

/**
 * Does the Notion zoning-URL library hold rows for this jurisdiction?
 * Cheap (~2s) — used to avoid burning the scrape budget on a jurisdiction that
 * was never added to the folder.
 */
export async function notionHasZoningSources(
  secrets: any,
  jurisdiction: string,
  state: string,
): Promise<{ ok: boolean; matched: string | null; urls: number; error?: string }> {
  const token = secrets.get('ZONING_MCP_TOKEN');
  if (!token) return { ok: false, matched: null, urls: 0, error: 'ZONING_MCP_TOKEN not configured' };
  const url = secrets.get('ZONING_MCP_URL') || DEFAULT_URL;
  try {
    // Match on the bare name — Notion stores "Calhoun County", callers may pass
    // "Calhoun County" or "Calhoun"; the scraper does a substring match.
    const needle = String(jurisdiction || '').replace(/\b(county|parish|borough|city|town|village|charter township|township)\b/gi, '').trim();
    const out = await call(url, token, 'listZoningSources', { state, jurisdiction: needle || jurisdiction, limit: 5 }, 25000);
    const groups = out?.selected || [];
    const exact = groups.find((g: any) => String(g.jurisdiction || '').toLowerCase() === String(jurisdiction || '').toLowerCase()) || groups[0];
    if (!exact) return { ok: false, matched: null, urls: 0 };
    return { ok: true, matched: exact.jurisdiction, urls: (exact.sources || []).length };
  } catch (error) {
    return { ok: false, matched: null, urls: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Scrape one jurisdiction's Notion zoning URLs and wait (within budget) for the
 * ingest to land in Base44.
 *
 * Returns action:
 *   'ingested'        — the run finished and wrote to Base44 this call
 *   'running'         — budget ran out; Railway is still working, data lands shortly
 *   'no_notion_rows'  — nothing in the Notion folder for this jurisdiction
 *   'not_configured' | 'error'
 */
export async function scrapeJurisdictionFromNotion(
  secrets: any,
  opts: { jurisdiction: string; state: string; budgetMs?: number },
): Promise<any> {
  const token = secrets.get('ZONING_MCP_TOKEN');
  if (!token) return { action: 'not_configured' };
  const url = secrets.get('ZONING_MCP_URL') || DEFAULT_URL;
  const deadline = Date.now() + Math.max(15000, opts.budgetMs ?? 60000);

  try {
    const probe = await notionHasZoningSources(secrets, opts.jurisdiction, opts.state);
    if (!probe.ok || !probe.matched) {
      console.log(`[ZONING MCP] no Notion rows for ${opts.jurisdiction}, ${opts.state}${probe.error ? ` (${probe.error})` : ''}`);
      return { action: 'no_notion_rows', error: probe.error || null };
    }

    const started = await call(
      url,
      token,
      'runScraper',
      { state: opts.state, jurisdiction: probe.matched, limit: 1 },
      25000,
    );
    if (started?.ok === false) {
      // A run is already in flight (one job at a time on the box) — fall through
      // and poll it, since it may well be for this same jurisdiction.
      console.log(`[ZONING MCP] runScraper busy: ${started.error}`);
      return { action: 'running', busy: true, error: started.error || null };
    }
    const jobId = started?.job_id;
    if (!jobId) return { action: 'error', error: 'scraper returned no job_id' };

    console.log(`[ZONING MCP] job ${jobId} scraping ${probe.matched}, ${opts.state} (${probe.urls} Notion URLs)`);

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const status = await call(url, token, 'getScraperStatus', { job_id: jobId }, 20000).catch(() => null);
      if (status?.status === 'done') {
        const s = status.summary || {};
        const landed = Number(s.ingested_ok || 0) > 0;
        console.log(`[ZONING MCP] job ${jobId} done — ingested ${s.ingested_ok || 0}/${s.processed || 0}, urls ok ${s.urls_scraped_ok || 0}/${(s.urls_scraped_ok || 0) + (s.urls_failed || 0)}`);
        // A finished job is not the same as data in the backend: the scrape can
        // succeed and the Base44 write still be rejected. Only report 'ingested'
        // when something actually landed, so the caller does not re-read and
        // silently overlay nothing.
        if (!landed) {
          const why = (status.recent || []).map((r: any) => r.ingest_error).filter(Boolean)[0] || 'ingest wrote nothing';
          console.error(`[ZONING MCP] job ${jobId} scraped but did NOT land: ${String(why).slice(0, 300)}`);
          return { action: 'ingest_failed', job_id: jobId, jurisdiction: probe.matched, summary: s, error: why };
        }
        return { action: 'ingested', job_id: jobId, jurisdiction: probe.matched, summary: s, recent: status.recent || [] };
      }
      if (status?.status === 'failed') {
        return { action: 'error', job_id: jobId, error: status.error || 'scraper job failed' };
      }
    }

    console.log(`[ZONING MCP] job ${jobId} still running at budget end — Railway will finish and ingest on its own`);
    return { action: 'running', job_id: jobId, jurisdiction: probe.matched };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ZONING MCP] ${opts.jurisdiction}, ${opts.state}: ${message}`);
    return { action: 'error', error: message };
  }
}
