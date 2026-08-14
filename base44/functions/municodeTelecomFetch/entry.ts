import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// municodeTelecomFetch — pulls ONLY telecom-related ordinance sections from a
// municipality's Municode code via the public Municode REST API (no key, no
// JS rendering). Port of the owner-supplied municode_scraper.py.
// Args: { city, state } OR { client_id }. Returns { municipality, state,
// client_id, section_count, sections: [{node_id, heading, product, text}] }.

const API = 'https://api.municode.com';

const TELECOM_KEYWORDS = [
  'wireless', 'telecommunications', 'tower', 'antenna', 'small cell',
  'wcf', 'wts', 'communication facility', 'cellular', 'base station',
  'monopole', 'stealth', 'camouflage',
];

const SEARCH_TERMS = [
  'telecommunications tower',
  'wireless facility',
  'communication tower',
  'antenna',
];

const MAX_SECTIONS = 10;
const MAX_SECTION_CHARS = 40000;

async function apiGet(path, params) {
  const url = new URL(`${API}${path}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`Municode API ${path} -> ${r.status}`);
  return r.json();
}

function html2text(h) {
  let t = h
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:p|div)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  const ents = [['&nbsp;', ' '], ['&amp;', '&'], ['&lt;', '<'], ['&gt;', '>'], ['&#8217;', "'"], ['&#8220;', '"'], ['&#8221;', '"']];
  for (const [e, c] of ents) t = t.split(e).join(c);
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

const matchesTelecom = (text) => {
  const lower = text.toLowerCase();
  return TELECOM_KEYWORDS.some((kw) => lower.includes(kw));
};

async function findClient(city, stateAbbr) {
  const states = await apiGet('/states');
  const sid = states.find((s) => s.StateAbbreviation === stateAbbr.toUpperCase())?.StateID;
  if (!sid) return { clientId: null, clientName: null };
  const munis = await apiGet(`/Clients/stateId/${sid}`);
  const cityLower = city.toLowerCase().trim();
  let m = munis.find((x) => x.ClientName.toLowerCase().trim() === cityLower);
  if (!m) m = munis.find((x) => x.ClientName.toLowerCase().includes(cityLower));
  return { clientId: m?.ClientID ?? null, clientName: m?.ClientName ?? null };
}

async function getContent(pid, jid, nodeId) {
  try {
    const data = await apiGet('/CodesContent', { productId: pid, jobId: jid, nodeId });
    const parts = [];
    for (const doc of data?.Docs ?? []) {
      if (doc.Content) {
        const txt = html2text(doc.Content);
        parts.push(doc.Title ? `=== ${doc.Title} ===\n${txt}` : txt);
      }
    }
    return parts.join('\n\n').slice(0, MAX_SECTION_CHARS);
  } catch {
    return '';
  }
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { city, state, client_id } = await req.json();

    let clientId = client_id ?? null;
    let clientName = null;
    let stateAbbr = state ? String(state).toUpperCase() : null;

    if (!clientId) {
      if (!city || !state) {
        return Response.json({ error: 'Provide city + state, or client_id' }, { status: 400 });
      }
      const found = await findClient(city, state);
      clientId = found.clientId;
      clientName = found.clientName;
      if (!clientId) {
        return Response.json({
          found: false,
          error: `Municipality '${city}' not found in ${stateAbbr} on Municode. No data available (source: Municode public API).`,
        });
      }
    }

    // Products + latest jobs
    let products = [];
    try {
      const prods = await apiGet(`/Products/clientId/${clientId}`);
      for (const p of prods ?? []) {
        try {
          const job = await apiGet(`/Jobs/latest/${p.ProductID}`);
          products.push({ pid: p.ProductID, jid: job.Id, name: p.ProductName ?? '' });
        } catch { /* skip product with no job */ }
      }
    } catch { /* no products */ }

    if (products.length === 0) {
      return Response.json({
        found: false,
        client_id: clientId,
        municipality: clientName,
        error: 'No published code products found for this municipality on Municode. No data available (source: Municode public API).',
      });
    }

    const sections = [];
    const seenNodes = new Set();

    for (const { pid, jid, name } of products) {
      if (sections.length >= MAX_SECTIONS) break;
      // Strategy 1: search API
      for (const term of SEARCH_TERMS) {
        if (sections.length >= MAX_SECTIONS) break;
        try {
          const data = await apiGet('/search', {
            searchText: term,
            clientId,
            contentTypeId: 'CODES',
            searchMode: 'CLIENTMODE',
          });
          for (const hit of data?.Hits ?? []) {
            if (sections.length >= MAX_SECTIONS) break;
            const nid = hit.NodeId;
            if (!nid || seenNodes.has(nid)) continue;
            seenNodes.add(nid);
            const content = await getContent(pid, jid, nid);
            if (content && content.length > 30 && matchesTelecom(content)) {
              sections.push({ node_id: nid, heading: hit.Heading ?? '', product: name, text: content });
            }
          }
        } catch { /* search term failed, continue */ }
      }
      // Strategy 2: top-level TOC scan for telecom-titled chapters
      try {
        const toc = await apiGet('/codesToc', { productId: pid, jobId: jid });
        for (const node of toc?.Children ?? []) {
          if (sections.length >= MAX_SECTIONS) break;
          const nid = node.Id;
          if (!nid || seenNodes.has(nid)) continue;
          if (matchesTelecom(node.Heading ?? '')) {
            seenNodes.add(nid);
            const content = await getContent(pid, jid, nid);
            if (content && content.length > 30) {
              sections.push({ node_id: nid, heading: node.Heading ?? '', product: name, text: content });
            }
          }
        }
      } catch { /* TOC scan failed */ }
    }

    // Dedupe by leading text signature
    const unique = [];
    const seenText = new Set();
    for (const s of sections) {
      const sig = s.text.slice(0, 500);
      if (!seenText.has(sig)) {
        seenText.add(sig);
        unique.push(s);
      }
    }

    return Response.json({
      found: unique.length > 0,
      municipality: clientName ?? `Client ${clientId}`,
      state: stateAbbr,
      client_id: clientId,
      source: 'Municode public API',
      section_count: unique.length,
      sections: unique,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}