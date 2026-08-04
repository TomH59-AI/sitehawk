import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { scrapePage } from '../../shared/webScrape.ts';

// Admin-only. Uses Oxylabs (primary) with Scrapfly as the default fallback to look for a published main
// business phone number on each FiberOperator website that still has none.
// Returns CANDIDATES only — it never writes to the entity. A human decides.

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.\-\u2013]?(\d{3})[\s.\-\u2013]?(\d{4})/g;

// Obvious non-phone noise: zips+4, dates, long digit runs, and 555 fakes.
function plausible(area, mid, last) {
  if (area === '555' || mid === '555') return false;
  if (/^(\d)\1{2}$/.test(area) && /^(\d)\1{2}$/.test(mid)) return false;
  return true;
}

async function scrape(url, renderJs) {
  const page = await scrapePage(url, { renderJs });
  if (!page) throw new Error('No content from Oxylabs or Scrapfly');
  return page.content;
}

function extract(html) {
  const found = new Map(); // normalized -> { display, weight, context }

  // 1) tel: links are the strongest signal — a human deliberately marked it.
  const telRe = /href\s*=\s*["']tel:([^"']+)["']/gi;
  let m;
  while ((m = telRe.exec(html))) {
    const digits = m[1].replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (digits.length !== 10) continue;
    const area = digits.slice(0, 3), mid = digits.slice(3, 6), last = digits.slice(6);
    if (!plausible(area, mid, last)) continue;
    const key = digits;
    const prev = found.get(key);
    found.set(key, {
      display: `(${area}) ${mid}-${last}`,
      weight: (prev?.weight || 0) + 10,
      context: 'tel: link',
    });
  }

  // 2) Fall back to text patterns, weighted by nearby wording.
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                   .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                   .replace(/<[^>]+>/g, ' ');
  while ((m = PHONE_RE.exec(text))) {
    const [area, mid, last] = [m[1], m[2], m[3]];
    if (!plausible(area, mid, last)) continue;
    const key = `${area}${mid}${last}`;
    const around = text.slice(Math.max(0, m.index - 90), m.index + 60)
                       .replace(/\s+/g, ' ').trim();
    let weight = 1;
    if (/phone|call|tel|contact|office|toll|support|sales/i.test(around)) weight = 4;
    if (/fax/i.test(around)) weight = -5;
    const prev = found.get(key);
    found.set(key, {
      display: prev?.display || `(${area}) ${mid}-${last}`,
      weight: (prev?.weight || 0) + weight,
      context: prev?.context === 'tel: link' ? 'tel: link' : around.slice(0, 140),
    });
  }

  return [...found.entries()]
    .map(([digits, v]) => ({ digits, ...v }))
    .filter((c) => c.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids : null;

    const all = await base44.asServiceRole.entities.FiberOperator.list('name', 500);
    const targets = all.filter((o) =>
      o.website && !o.phone && (!ids || ids.includes(o.id))
    );

    const results = [];
    for (const op of targets) {
      const attempts = [];
      let candidates = [];
      // Homepage first (footers carry the main line), then a contact page, then JS render.
      const base = op.website.replace(/\/+$/, '');
      const urls = [op.website, `${base}/contact`, `${base}/contact-us`];
      for (let i = 0; i < urls.length && !candidates.length; i++) {
        try {
          const html = await scrape(urls[i], i === urls.length - 1);
          candidates = extract(html);
          attempts.push({ url: urls[i], ok: true, hits: candidates.length });
        } catch (e) {
          attempts.push({ url: urls[i], ok: false, error: String(e.message).slice(0, 120) });
        }
      }
      results.push({
        id: op.id,
        name: op.name,
        website: op.website,
        candidates,
        attempts,
      });
    }

    return Response.json({
      scanned: results.length,
      found: results.filter((r) => r.candidates.length).length,
      results,
    });
  } catch (error) {
    console.error('fiberOperatorPhoneScrape failed', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}