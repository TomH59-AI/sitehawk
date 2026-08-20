// hawklawAnalyze — SiteHawk HawkLaw backend function (Base44).
// Server-side telecom ground-lease analysis using Base44's built-in Claude
// (InvokeLLM with claude_opus_4_8) — no external API key needed.
//
// HARD SIDE-LOCK (integrity rule): a HawkLawReview may be analyzed for ONE side
// only ('landlord' or 'carrier'). Once side_locked_at is set, this function
// REFUSES (409) to run for any other side, so a user can never pull the
// opposing playbook on the same lease. A new lease = a new record = a fresh side.
//
// NOT LEGAL ADVICE: refuses to run unless disclaimerAck is true; disclaimer is
// baked into the returned analysis object.
//
// Input (JSON): { reviewId, side, leaseText, disclaimerAck }
// Output (JSON): the analysis object (also persisted on the record)

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { supervisedResponse } from '../../shared/siteHawkSupervisor.ts';

const MODEL = 'claude_opus_4_8';
const MAX_LEASE_CHARS = 180_000;

function sideLabel(side) {
  return side === 'landlord' ? 'the LANDLORD (property owner)' : 'the CARRIER / TENANT (wireless company)';
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    parties: { type: 'string' },
    top_issues: { type: 'array', items: { type: 'string' } },
    clauses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          flag: { type: 'string', enum: ['GREEN', 'YELLOW', 'RED'] },
          lease_says: { type: 'string' },
          your_side_lens: { type: 'string' },
          negotiation_move: { type: 'string' },
          suggested_language: { type: 'string' },
        },
      },
    },
    negotiation_strategy: { type: 'string' },
    tier1_must_haves: { type: 'array', items: { type: 'string' } },
    tier2_should_haves: { type: 'array', items: { type: 'string' } },
    tier3_concessions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'clauses', 'negotiation_strategy'],
};

function buildPrompt(side, leaseText) {
  return `You are HawkLaw, a telecom ground-lease analyst for a site-acquisition platform.
You are analyzing this cell-tower / wireless ground lease STRICTLY from the perspective of ${sideLabel(side)}.
Break the lease down in plain English and give negotiation guidance that favors this side — fairly and accurately, never inventing terms not in the document.

CRITICAL RULES:
- This is ANALYSIS, NOT LEGAL ADVICE. Do not claim to be a lawyer.
- Analyze ONLY from the ${side} side. Do not provide the opposing side's playbook.
- Only flag what is actually in the lease text. If a clause is ABSENT, say so (absence is itself important).
- Quote lease language briefly (under 15 words) when citing; otherwise paraphrase.

Cover these telecom ground-lease clauses where present: Rent & escalations, Term & renewal options, Revenue/colocation share, Assignment & subletting, Termination rights, Access & easement, Equipment & height limits, Removal & site restoration at end, Insurance & indemnity, Default & cure.

For EACH clause, assign a flag from THIS SIDE's perspective:
  GREEN  = favorable to ${side}
  YELLOW = negotiable / not ideal for ${side}
  RED    = unfavorable to ${side}; push hard or walk

For each clause provide: name, flag, lease_says (plain-English summary or 'ABSENT'), your_side_lens (what it means for ${side}), negotiation_move (the specific move ${side} should make), suggested_language (concrete redline language, else empty string).
Also provide: summary (2-3 sentences from the ${side} side), parties (named landlord & tenant if identifiable, else 'not specified'), top_issues (3 most important things for ${side}), negotiation_strategy (what to lead with, what to trade), tier1_must_haves (deal-breakers), tier2_should_haves (strong preferences), tier3_concessions (items ${side} can concede).

LEASE TEXT:
"""
${String(leaseText).slice(0, MAX_LEASE_CHARS)}
"""`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { reviewId, side, leaseText, disclaimerAck } = body ?? {};

    if (!reviewId) return Response.json({ error: 'reviewId is required' }, { status: 400 });
    if (side !== 'landlord' && side !== 'carrier') return Response.json({ error: "side must be 'landlord' or 'carrier'" }, { status: 400 });
    if (!disclaimerAck) return Response.json({ error: 'You must acknowledge that HawkLaw is analysis, not legal advice.' }, { status: 400 });
    if (!leaseText || String(leaseText).trim().length < 50) return Response.json({ error: 'Lease text is missing or too short to analyze.' }, { status: 400 });

    // ---- load record + ENFORCE THE HARD SIDE-LOCK ----
    let rec;
    try {
      rec = await base44.entities.HawkLawReview.get(reviewId);
    } catch (_e) {
      return Response.json({ error: 'Review record not found.' }, { status: 404 });
    }

    if (rec?.side_locked_at && rec?.side && rec.side !== side) {
      return Response.json({
        error: `This lease is locked to the ${rec.side} side and cannot be re-analyzed from the ${side} side. `
          + `Start a new review with a new upload if you genuinely represent the other side.`,
        locked_side: rec.side,
      }, { status: 409 });
    }

    // already completed for THIS side — return stored analysis, no re-spend
    if (rec?.status === 'completed' && rec?.side === side && rec?.analysis) {
      const cachedResult = { ...rec.analysis, served_from_cache: true };
      return await supervisedResponse({
        original_user_request: `Analyze this telecom lease from the ${side} perspective.`,
        proposed_action: 'Release cached HawkLaw lease analysis.',
        supporting_evidence: { lease_text: String(leaseText).slice(0, MAX_LEASE_CHARS), side, disclaimer_acknowledged: disclaimerAck },
        risk_level: 'legal',
      }, cachedResult);
    }

    // ---- freeze side + mark analyzing ----
    const lockedAt = rec?.side_locked_at || new Date().toISOString();
    try {
      await base44.entities.HawkLawReview.update(reviewId, {
        side, side_locked_at: lockedAt, disclaimer_ack: true, status: 'analyzing', model_used: MODEL,
      });
    } catch (_e) { /* continue */ }

    // ---- run analysis via built-in Claude ----
    let analysis;
    try {
      analysis = await base44.integrations.Core.InvokeLLM({
        prompt: buildPrompt(side, leaseText),
        response_json_schema: ANALYSIS_SCHEMA,
        model: MODEL,
      });
    } catch (e) {
      await base44.entities.HawkLawReview.update(reviewId, { status: 'failed' }).catch(() => {});
      return Response.json({ error: 'Analysis service error.', detail: String(e?.message ?? e) }, { status: 502 });
    }

    if (!analysis || typeof analysis !== 'object' || !analysis.clauses) {
      await base44.entities.HawkLawReview.update(reviewId, { status: 'failed' }).catch(() => {});
      return Response.json({ error: 'Could not parse analysis output.' }, { status: 502 });
    }

    analysis.disclaimer = 'HawkLaw provides lease analysis, not legal advice. Have a qualified attorney review before signing.';
    analysis.side = side;

    try {
      await base44.entities.HawkLawReview.update(reviewId, {
        analysis, status: 'completed', analyzed_at: new Date().toISOString(),
      });
    } catch (_e) { /* still return */ }

    const proposedResult = { ...analysis, served_from_cache: false };
    return await supervisedResponse({
      original_user_request: `Analyze this telecom lease from the ${side} perspective.`,
      proposed_action: 'Release newly generated HawkLaw lease analysis.',
      supporting_evidence: { lease_text: String(leaseText).slice(0, MAX_LEASE_CHARS), side, disclaimer_acknowledged: disclaimerAck },
      risk_level: 'legal',
    }, proposedResult);
  } catch (err) {
    console.error('hawklawAnalyze error:', err);
    return Response.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
});