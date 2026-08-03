/*
 * SKIP-TRACE BATCH v3 — Scrapfly-only contact resolution.
 *
 * All single and batch callers retain their existing contract, but every lookup
 * now delegates exclusively to skipTraceCascade, which searches TruthFinder,
 * WhitePages, Spokeo, and CyberBackgroundChecks through Scrapfly.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const rateLimitMap = new Map();

function isAllowed(user) {
  const tier = user.tier || "blind";
  if (user.role === "admin") return true;
  const isFreeTrialSkip = (tier === "blind" || tier === "free") && user.free_trial_used && !user.free_trial_skip_trace_used;
  if (isFreeTrialSkip) return "free_trial";
  return !["blind", "free"].includes(tier);
}

function checkRateLimit(userId, count = 1) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId) || { count: 0, windowStart: now };
  if (now - entry.windowStart > 60000) {
    rateLimitMap.set(userId, { count, windowStart: now });
    return false;
  }
  if (entry.count + count > 10) return true;
  entry.count += count;
  rateLimitMap.set(userId, entry);
  return false;
}

function normalizeScrapflyResult(data = {}) {
  const phones = (data.phones || []).map((p) => ({
    number: p.display || p.phone || "",
    phone: p.phone || "",
    display: p.display || p.phone || "",
    type: p.mobile ? "mobile" : "unknown",
    confidence: Number(p.source_count || 0) > 1 ? "high" : "medium",
    sources: p.sources || [],
    source_count: Number(p.source_count || 0),
    mobile: !!p.mobile,
  }));
  const emails = (data.emails || []).map((e) => ({
    address: e.email || "",
    email: e.email || "",
    type: "email",
    confidence: Number(e.source_count || 0) > 1 ? "high" : "medium",
    sources: e.sources || [],
    source_count: Number(e.source_count || 0),
  }));
  const status = data.is_entity_owner
    ? "not_found"
    : phones.length || emails.length
      ? (phones.length && emails.length ? "found" : "partial")
      : "not_found";

  return {
    ...data,
    phones,
    emails,
    phone: phones[0]?.number || null,
    email: emails[0]?.address || null,
    status,
    associated_llcs: [],
    sunbiz_verified: false,
    registered_agent: null,
    _meta: { ...(data._meta || {}), provider: "Scrapfly", scrapfly_only: true },
  };
}

async function persistLog(base44, input, result) {
  if (!input.candidate_id) return;
  const existing = await base44.entities.SkipTraceLog.filter({ candidate_id: input.candidate_id });
  await base44.entities.SkipTraceLog.create({
    candidate_id: input.candidate_id,
    search_id: input.search_id,
    owner_name: input.owner_name,
    mailing_address: input.mailing_address,
    phones: result.phones.map((p) => ({ number: p.number, type: p.type, confidence: p.confidence })),
    emails: result.emails.map((e) => ({ address: e.address, type: e.type, confidence: e.confidence })),
    associated_llcs: [],
    raw_result: JSON.stringify(result),
    status: result.status,
    attempt_number: (existing?.length || 0) + 1,
  });
}

async function runOne(base44, input) {
  const response = await base44.functions.invoke("skipTraceCascade", {
    owner_name: input.owner_name,
    mailing_address: input.mailing_address,
    target_label: input.target_label || "",
    scip_record_id: input.scip_record_id || null,
  });
  const result = normalizeScrapflyResult(response?.data ?? response ?? {});
  await persistLog(base44, input, result);
  return result;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const allowed = isAllowed(user);
    if (!allowed) return Response.json({ error: "Upgrade required" }, { status: 403 });

    const body = await req.json();
    const { mode, owner_name, mailing_address, candidate_id, search_id, candidates } = body;

    if (mode !== "batch") {
      if (!owner_name) return Response.json({ error: "owner_name required" }, { status: 400 });
      if (checkRateLimit(user.id, 1)) return Response.json({ error: "Too many requests." }, { status: 429 });

      const result = await runOne(base44, {
        owner_name,
        mailing_address,
        candidate_id,
        search_id,
        target_label: body.target_label,
        scip_record_id: body.scip_record_id,
      });

      if (allowed === "free_trial") {
        const users = await base44.asServiceRole.entities.User.filter({ email: user.email });
        if (users.length) await base44.asServiceRole.entities.User.update(users[0].id, { free_trial_skip_trace_used: true });
      }

      return Response.json(result);
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return Response.json({ error: "candidates array required for batch mode" }, { status: 400 });
    }

    const batch = candidates.slice(0, 10);
    if (checkRateLimit(user.id, batch.length)) return Response.json({ error: "Rate limit exceeded." }, { status: 429 });

    const settled = await Promise.allSettled(batch.map((candidate) => runOne(base44, {
      owner_name: candidate.owner_name,
      mailing_address: candidate.owner_mailing_address || candidate.mailing_address,
      candidate_id: candidate.id || candidate.candidate_id,
      search_id: candidate.search_id,
      target_label: candidate.target_label,
      scip_record_id: candidate.scip_record_id,
    })));

    const results = settled.map((item, index) => item.status === "fulfilled"
      ? { candidate_id: batch[index]?.id || batch[index]?.candidate_id, owner_name: batch[index]?.owner_name, ...item.value }
      : { candidate_id: batch[index]?.id || batch[index]?.candidate_id, owner_name: batch[index]?.owner_name, status: "error", error: item.reason?.message || "Skip-trace failed" });

    return Response.json({ results });
  } catch (error) {
    console.error("[SKIPTRACE SCRAPFLY] error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}