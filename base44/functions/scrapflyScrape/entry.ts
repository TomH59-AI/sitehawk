/**
 * scrapflyScrape — Scrapfly-powered web scraper for jurisdiction websites.
 * Takes a URL, renders it with JS + anti-scraping protection, returns the
 * page content (markdown) plus all extracted links. Used by the permit_fetcher
 * agent to scrape official government websites for permit applications and
 * zoning maps.
 *
 * POST { url, render_js? } -> { url, content, links, raw_urls, status, error? }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { url, render_js = true } = await req.json();
    if (!url) return Response.json({ error: 'url required' }, { status: 400 });

    const apiKey = secrets.get('SCRAPFLY_API_KEY') || Deno.env.get('SCRAPFLY_API_KEY');
    if (!apiKey) return Response.json({ error: 'SCRAPFLY_API_KEY not configured' }, { status: 500 });

    const params = new URLSearchParams({
      key: apiKey,
      url,
      render_js: String(render_js),
      asp: 'true',
      format: 'markdown',
    });

    const r = await fetch(`https://api.scrapfly.io/scrape?${params}`, { method: 'GET' });
    if (!r.ok) {
      const errText = await r.text();
      console.error(`[scrapflyScrape] HTTP ${r.status}: ${errText.slice(0, 300)}`);
      return Response.json({ error: `Scrapfly HTTP ${r.status}: ${errText.slice(0, 200)}` }, { status: 502 });
    }

    const data = await r.json().catch(() => null);
    if (!data?.success) {
      return Response.json({ error: data?.message || 'Scrapfly scrape failed' }, { status: 502 });
    }

    const content = data?.result?.content || '';
    const statusCode = data?.result?.status_code || 200;
    const finalUrl = data?.result?.url || url;

    // Extract markdown links [text](url)
    const links = [];
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const href = match[2];
      if (href.startsWith('http')) {
        links.push({ text: match[1].trim().slice(0, 120), url: href });
      }
    }

    // Extract raw URLs from content (catches bare URLs not in markdown link format)
    const rawUrls = new Set();
    const rawUrlRegex = /https?:\/\/[^\s<>"')\]]+/g;
    while ((match = rawUrlRegex.exec(content)) !== null) {
      rawUrls.add(match[0].replace(/[.,;]+$/, ''));
    }

    // Deduplicate links by URL
    const seen = new Set();
    const dedupedLinks = links.filter((l) => {
      if (seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    });

    return Response.json({
      url: finalUrl,
      content: content.slice(0, 25000),
      links: dedupedLinks.slice(0, 300),
      raw_urls: [...rawUrls].slice(0, 200),
      status: statusCode,
    });
  } catch (error) {
    console.error('scrapflyScrape error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}