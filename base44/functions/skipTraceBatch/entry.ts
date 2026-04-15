import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPABASE_URL = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/sitehawk-skip-trace";
const SUPABASE_KEY = Deno.env.get("SUPABASE_ANON_KEY");

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

async function runSingleTrace(owner_name, mailing_address, candidate_id, search_id) {
  const res = await fetch(SUPABASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ owner_name, mailing_address, candidate_id, search_id }),
  });
  return await res.json();
}

// Normalize the raw result into the richer structured format
function normalizeResult(raw) {
  const phones = [];
  const emails = [];
  const associated_llcs = [];

  // Single phone/email from legacy response
  if (raw.phone) phones.push({ number: raw.phone, type: "primary", confidence: "high" });
  if (raw.email) emails.push({ address: raw.email, type: "primary", confidence: "high" });

  // Extended phones array
  if (Array.isArray(raw.phones)) {
    for (const p of raw.phones) {
      if (!phones.find(x => x.number === (p.number || p))) {
        phones.push({ number: p.number || p, type: p.type || "other", confidence: p.confidence || "medium" });
      }
    }
  }

  // Extended emails array
  if (Array.isArray(raw.emails)) {
    for (const e of raw.emails) {
      if (!emails.find(x => x.address === (e.address || e))) {
        emails.push({ address: e.address || e, type: e.type || "other", confidence: e.confidence || "medium" });
      }
    }
  }

  // LLCs / entities
  if (raw.registered_agent) {
    associated_llcs.push({
      name: raw.company || raw.entity_name || "Unknown Entity",
      state: raw.state || "",
      status: raw.entity_status || "Unknown",
      registered_agent: raw.registered_agent,
    });
  }
  if (Array.isArray(raw.entities)) {
    for (const e of raw.entities) {
      if (!associated_llcs.find(x => x.name === e.name)) {
        associated_llcs.push({
          name: e.name,
          state: e.state || "",
          status: e.status || "",
          registered_agent: e.registered_agent || "",
        });
      }
    }
  }

  const status = phones.length > 0 || emails.length > 0
    ? (phones.length > 0 && emails.length > 0 ? "found" : "partial")
    : "not_found";

  return { phones, emails, associated_llcs, status, raw };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const tier = user.tier || 'blind';
    if (tier === 'blind' || tier === 'free') {
      return Response.json({ error: 'Upgrade required' }, { status: 403 });
    }

    const body = await req.json();
    const { mode, owner_name, mailing_address, candidate_id, search_id, candidates } = body;

    // ── SINGLE MODE ──────────────────────────────────────────
    if (mode !== 'batch') {
      if (checkRateLimit(user.id, 1)) {
        return Response.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
      }

      console.log(`Skip trace single: user=${user.email} owner=${owner_name}`);

      const raw = await runSingleTrace(owner_name, mailing_address, candidate_id, search_id);
      const normalized = normalizeResult(raw);

      // Count previous attempts for this candidate
      const existing = await base44.asServiceRole.entities.SkipTraceLog.filter({ candidate_id });
      const attempt_number = (existing?.length || 0) + 1;

      // Persist to SkipTraceLog
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

      return Response.json({ ...raw, ...normalized });
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
        const raw = await runSingleTrace(c.owner_name, c.owner_mailing_address, c.id, c.search_id);
        const normalized = normalizeResult(raw);

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