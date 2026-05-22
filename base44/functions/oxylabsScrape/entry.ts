/**
 * oxylabsScrape — Generic Oxylabs Web Scraper API proxy.
 *
 * Used as a zoning fallback when the LLM can't read a Municode / eCode360 /
 * American Legal page directly (paywall, JS-only SPA, geo-block, etc).
 *
 * POST { url } → { content, status_code } where `content` is the fully-rendered HTML.
 *
 * Auth: HTTP Basic against realtime.oxylabs.io/v1/queries using
 *       OXYLABS_USERNAME + OXYLABS_PASSWORD.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { url, render = 'html' } = await req.json();
    if (!url) return Response.json({ error: 'url required' }, { status: 400 });

    const username = Deno.env.get('OXYLABS_USERNAME');
    const password = Deno.env.get('OXYLABS_PASSWORD');
    if (!username || !password) {
      return Response.json({ error: 'OXYLABS_USERNAME / OXYLABS_PASSWORD not set' }, { status: 500 });
    }

    const auth = `Basic ${btoa(`${username}:${password}`)}`;
    const body = {
      source: 'universal',
      url,
      render,
      geo_location: 'United States',
      user_agent_type: 'desktop',
    };

    const r = await fetch('https://realtime.oxylabs.io/v1/queries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const text = await r.text();
      console.error(`Oxylabs HTTP ${r.status}: ${text.slice(0, 300)}`);
      return Response.json({ error: `Oxylabs HTTP ${r.status}`, detail: text.slice(0, 300) }, { status: 502 });
    }

    const data = await r.json();
    const result = data.results?.[0] || {};
    return Response.json({
      content: result.content || '',
      status_code: result.status_code || null,
      url: result.url || url,
    });
  } catch (error) {
    console.error('oxylabsScrape error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});