import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Rate limiting: max 20 chat messages per minute per user
const rateLimitMap = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = 20;

function isRateLimited(userId) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= MAX_REQUESTS_PER_MINUTE) return true;
  entry.count++;
  rateLimitMap.set(userId, entry);
  return false;
}

// Extract a lat/lon pair or zip/city from a message
function extractLocation(message) {
  // lat,lon pattern
  const latLon = message.match(/(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
  if (latLon) return { lat: parseFloat(latLon[1]), lon: parseFloat(latLon[2]) };
  // zip code
  const zip = message.match(/\b(\d{5})\b/);
  if (zip) return { zip: zip[1] };
  return null;
}

// Detect intent for specific data lookups
function detectIntent(message) {
  const m = message.toLowerCase();
  if (/electric|power company|utility|power provider|power line|kwh|kv|transmission/.test(m)) return 'electric';
  if (/police|fire|911|public safety|emergency|ems/.test(m)) return 'safety';
  if (/zoning|zone|jurisdiction|ordinance|municipality|permit|land use/.test(m)) return 'zoning';
  if (/fiber|broadband|fcc|isp|internet provider/.test(m)) return 'fiber';
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const tier = user.tier || 'blind';
    const isAdmin = user.role === 'admin';
    // Comped pilot accounts (mirrors src/lib/testAccess.js TESTER_EMAILS)
    const COMPED_EMAILS = ['hodges.thomas@gmail.com', 'jsuriano@pyramidns.com', 'jsuriano@pyramidns.co', 'cmilan@nbcllc.com'];
    const isComped = COMPED_EMAILS.includes((user.email || '').toLowerCase());
    if (!isAdmin && !isComped && (tier === 'blind' || tier === 'free')) {
      return Response.json({ error: 'Upgrade required' }, { status: 403 });
    }

    if (isRateLimited(user.id)) {
      console.warn(`Chat rate limit hit for user: ${user.email}`);
      return Response.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    const body = await req.json();
    const message = body?.message || "";
    const scipFormat = body?.context?.scip_format || "";
    const scipId = body?.context?.scip_id || null;

    if (!message.trim()) return Response.json({ error: 'Empty message' }, { status: 400 });

    // --- Site context enrichment: when opened on a SCIP page, load that site's
    // record so "this jurisdiction / this site / the building permit" questions
    // are answered from the site's actual data. ---
    let siteContext = "";
    let siteLoc = null;
    if (scipId) {
      try {
        const rec = await base44.entities.ScipRecord.get(scipId);
        if (rec) {
          const t = rec.parcel_targets?.[rec.active_target_index || 0] || null;
          siteLoc = t?.latitude != null
            ? { lat: Number(t.latitude), lon: Number(t.longitude) }
            : { lat: Number(rec.latitude), lon: Number(rec.longitude) };

          const parts = [];
          parts.push(`Site: ${rec.site_name || 'unnamed'} · County: ${rec.county || '?'} ${rec.state || ''} · Ring center: ${rec.latitude}, ${rec.longitude}`);
          if (rec.zoning_jurisdiction) parts.push(`Zoning jurisdiction: ${rec.zoning_jurisdiction}`);
          if (t) parts.push(`Active target (${t.label || 'Target A'}): ${t.parcel_address || ''} · APN ${t.apn || '?'} · ${t.acreage ?? '?'} ac · Zoning: ${t.zoning_classification || '?'} · Owner: ${t.owner_name || '?'} · FEMA: ${t.fema_risk_factor || '?'}`);
          if (rec.zoning_report) parts.push(`Zoning & Permitting worksheet (each row: value/source/confidence):\n${JSON.stringify(rec.zoning_report).slice(0, 8000)}`);
          if (rec.existing_conditions) parts.push(`Existing conditions: ${JSON.stringify(rec.existing_conditions).slice(0, 2000)}`);

          // Jurisdiction-level zoning + permit cache (building permit process,
          // fees, timeframes, tower specifics) — app-wide cache.
          if (rec.zoning_jurisdiction) {
            const norm = String(rec.zoning_jurisdiction)
              .toLowerCase()
              .replace(/city of |town of |village of |county|,.*$/g, '')
              .replace(/[^a-z ]/g, '')
              .trim();
            if (norm) {
              const caches = await base44.asServiceRole.entities.JurisdictionZoningCache.filter(
                { jurisdiction_name_normalized: norm }, '-updated_date', 1
              );
              const cache = caches?.[0];
              if (cache?.report) parts.push(`Jurisdiction zoning/permitting report (${cache.jurisdiction_name}):\n${JSON.stringify(cache.report).slice(0, 8000)}`);
              if (cache?.telecom_requirements) parts.push(`Telecom requirements: ${JSON.stringify(cache.telecom_requirements).slice(0, 3000)}`);
            }
          }
          siteContext = `\n\n[ACTIVE SITE CONTEXT — the user is viewing this SCIP; "this site/jurisdiction/permit" refers to it]\n${parts.join('\n')}`;
        }
      } catch (siteErr) {
        console.warn('HawkBot site context load failed:', siteErr.message);
      }
    }

    // --- Tool call enrichment ---
    let toolContext = "";
    const intent = detectIntent(message);
    // Location: explicit coords in the message win; otherwise fall back to the
    // active site's coordinates so lookups work without retyping lat/lon.
    const loc = extractLocation(message) || siteLoc;

    if (intent && loc) {
      try {
        if (intent === 'electric' && (loc.lat || loc.zip)) {
          // Use zip→lat/lon fallback or direct coords
          const lookupPayload = loc.lat
            ? { lat: loc.lat, lon: loc.lon }
            : { zip: loc.zip };
          
          const [utilRes, providerRes] = await Promise.allSettled([
            base44.functions.invoke('electricUtilityLookup', lookupPayload),
            base44.functions.invoke('electricProviderContact', lookupPayload),
          ]);
          
          if (utilRes.status === 'fulfilled' && utilRes.value) {
            toolContext += `\n\n[LIVE DATA — Electric Utility Lookup]\n${JSON.stringify(utilRes.value, null, 2)}`;
          }
          if (providerRes.status === 'fulfilled' && providerRes.value) {
            toolContext += `\n\n[LIVE DATA — Electric Provider Contact]\n${JSON.stringify(providerRes.value, null, 2)}`;
          }

        } else if (intent === 'safety' && loc.lat) {
          const safetyRes = await base44.functions.invoke('publicSafetyLookup', { lat: loc.lat, lon: loc.lon });
          if (safetyRes) toolContext += `\n\n[LIVE DATA — Public Safety Lookup]\n${JSON.stringify(safetyRes, null, 2)}`;

        } else if (intent === 'zoning' && loc.lat) {
          const zoneRes = await base44.functions.invoke('zoneResolve', { lat: loc.lat, lon: loc.lon });
          if (zoneRes) toolContext += `\n\n[LIVE DATA — Zone Resolve]\n${JSON.stringify(zoneRes, null, 2)}`;

        } else if (intent === 'fiber' && (loc.lat || loc.zip)) {
          const fiberRes = await base44.functions.invoke('fccBroadbandLookup', loc.lat ? { lat: loc.lat, lon: loc.lon } : { zip: loc.zip });
          if (fiberRes) toolContext += `\n\n[LIVE DATA — FCC Broadband / Fiber Lookup]\n${JSON.stringify(fiberRes, null, 2)}`;
        }

        if (toolContext) {
          console.log(`HawkBot tool enrichment: intent=${intent}, loc=${JSON.stringify(loc)}`);
        }
      } catch (toolErr) {
        console.warn('HawkBot tool lookup failed, falling back to LLM web search:', toolErr.message);
      }
    }

    // Build prompt — inject live data if we got it, otherwise let LLM use web search
    const enrichmentNote = toolContext
      ? `The following LIVE data was retrieved from SiteHawk's real data pipelines. Use it to give a precise answer:\n${toolContext}`
      : `No live pipeline data was retrieved for this query. Use your web search capability to find the most accurate, up-to-date answer (e.g. official jurisdiction websites for permit durations, fees, contacts).`;

    const prompt = `${scipFormat}
${siteContext}

${enrichmentNote}

User question: ${message}

Respond as HawkBot — concise, professional, telecom-industry savvy. If live data was provided, cite it directly. If web search was used, say so briefly.`;

    // Model selection: Gemini Flash for speed — it supports web search and is
    // fast enough for chat. Heavy reasoning models made answers feel slow.
    const response = await base44.integrations.Core.InvokeLLM({
      prompt,
      model: "gemini_3_flash",
      // Web search stays on unless a pipeline lookup already answered — site
      // context alone may not cover questions like permit validity periods.
      add_context_from_internet: !toolContext,
    });

    return Response.json({ response });

  } catch (error) {
    console.error('siteChat error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});