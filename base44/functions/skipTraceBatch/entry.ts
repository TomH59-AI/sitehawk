import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPABASE_URL = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/sitehawk-skip-trace";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

// Rate limiting: max 10 skip traces per minute per user
const rateLimitMap = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = 10;

function checkRateLimit(userId, count = 1) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(userId, { count, windowStart: now });
    return false;
  }
  if (entry.count + count > MAX_REQUESTS_PER_MINUTE) return true;
  entry.count += count;
  rateLimitMap.set(userId, entry);
  return false;
}

async function callSupabase(payload) {
  const res = await fetch(SUPABASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`Supabase skip-trace error ${res.status}:`, JSON.stringify(data).slice(0, 300));
    return { error: data?.error || `HTTP ${res.status}`, phones: [], emails: [] };
  }
  return data;
}

function normalize(data) {
  const phones = data.phones?.length ? data.phones : (data.phone ? [{ number: data.phone, type: "primary", confidence: "high" }] : []);
  const emails = data.emails?.length ? data.emails : (data.email ? [{ address: data.email, type: "primary", confidence: "high" }] : []);
  const status = data.status || (phones.length || emails.length ? (phones.length && emails.length ? "found" : "partial") : "not_found");
  return {
    phones,
    emails,
    associated_llcs: data.associated_llcs || [],
    status,
    phone: phones[0]?.number || null,
    email: emails[0]?.address || null,
    sunbiz_verified: data.sunbiz_verified || false,
    registered_agent: data.registered_agent || null,
    company: data.company || null,
    entity_status: data.entity_status || null,
    tip: data.tip || null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const tier = user.tier || 'blind';
    const isFreeTrialSkip = (tier === 'blind' || tier === 'free') && user.free_trial_used && !user.free_trial_skip_trace_used;

    if ((tier === 'blind' || tier === 'free') && !isFreeTrialSkip) {
      return Response.json({ error: 'Upgrade required' }, { status: 403 });
    }

    if (!SUPABASE_ANON_KEY) {
      console.error("SUPABASE_ANON_KEY not set");
      return Response.json({ error: 'Skip trace not configured' }, { status: 500 });
    }

    const body = await req.json();
    const { mode, owner_name, mailing_address, candidate_id, search_id, candidates } = body;

    // ── SINGLE MODE ──────────────────────────────────────────
    if (mode !== 'batch') {
      if (checkRateLimit(user.id, 1)) {
        return Response.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
      }

      console.log(`Skip trace single: user=${user.email} owner=${owner_name}`);

      const raw = await callSupabase({ owner_name, mailing_address, candidate_id, search_id });
      const normalized = normalize(raw);

      if (isFreeTrialSkip) {
        const users = await base44.asServiceRole.entities.User.filter({ email: user.email });
        if (users.length) {
          await base44.asServiceRole.entities.User.update(users[0].id, { free_trial_skip_trace_used: true });
        }
      }

      if (candidate_id) {
        const existing = await base44.asServiceRole.entities.SkipTraceLog.filter({ candidate_id });
        const attempt_number = (existing?.length || 0) + 1;
        await base44.asServiceRole.entities.SkipTraceLog.create({
          candidate_id,
          search_id,
          owner_name,
          mailing_address,
          phones: normalized.phones,
          emails: normalized.emails,
          associated_llcs: normalized.associated_llcs,
          raw_result: JSON.stringify(raw),
          status: normalized.status,
          attempt_number,
        });
      }

      return Response.json(normalized);
    }

    // ── BATCH MODE ────────────────────────────────────────────
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return Response.json({ error: 'candidates array is required for batch mode' }, { status: 400 });
    }

    const batchSize = Math.min(candidates.length, 10);
    if (checkRateLimit(user.id, batchSize)) {
      return Response.json({ error: 'Rate limit would be exceeded. Reduce batch size or wait.' }, { status: 429 });
    }

    console.log(`Skip trace batch: user=${user.email} count=${batchSize}`);

    const results = await Promise.allSettled(
      candidates.slice(0, batchSize).map(async (c) => {
        const raw = await callSupabase({
          owner_name: c.owner_name,
          mailing_address: c.owner_mailing_address,
          candidate_id: c.id,
          search_id: c.search_id,
        });
        const normalized = normalize(raw);

        if (c.id) {
          const existing = await base44.asServiceRole.entities.SkipTraceLog.filter({ candidate_id: c.id });
          const attempt_number = (existing?.length || 0) + 1;
          await base44.asServiceRole.entities.SkipTraceLog.create({
            candidate_id: c.id,
            search_id: c.search_id,
            owner_name: c.owner_name,
            mailing_address: c.owner_mailing_address,
            phones: normalized.phones,
            emails: normalized.emails,
            associated_llcs: normalized.associated_llcs,
            raw_result: JSON.stringify(raw),
            status: normalized.status,
            attempt_number,
          });
        }

        return { candidate_id: c.id, owner_name: c.owner_name, ...normalized };
      })
    );

    const output = results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { candidate_id: candidates[i]?.id, owner_name: candidates[i]?.owner_name, status: 'error', error: r.reason?.message }
    );

    return Response.json({ results: output });

  } catch (error) {
    console.error('skipTraceBatch error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});