import { useState, useCallback } from "react";

// Shared paywall helper for SCIP generation. The SCIP orchestrator returns
// HTTP 402 when the user is over their monthly SCIP limit (free users get 2
// SCIPs total; paid tiers 15/30 per month). The 402 body is { error, tier,
// used, limit }. Scanning is NOT gated — only SCIP generation.
//
// runScipGeneration: an async fn that performs the actual SCIP-generation
// request and is expected to either resolve normally, or throw/return an object
// carrying a 402 so we can detect it. We detect a 402 in three shapes:
//   1. a thrown error with err.status === 402 (axios-style err.response.status)
//   2. a returned object { status: 402, ... } or { paywall: {...} }
//   3. a Response object with .status === 402
export function useScipPaywall() {
  const [quota, setQuota] = useState(null);
  const [generating, setGenerating] = useState(false);

  const clearQuota = useCallback(() => setQuota(null), []);

  const generate = useCallback(async (runScipGeneration) => {
    setGenerating(true);
    try {
      const result = await runScipGeneration();

      // Response object (fetch)
      if (result && typeof result.status === "number" && result.status === 402) {
        const body = await safeJson(result);
        setQuota(normalizeQuota(body));
        return { ok: false, paywall: true };
      }
      // Plain object / axios response carrying a 402 or upgrade_required
      const data = result?.data ?? result;
      if (result && (result.status === 402 || data?.upgrade_required || result.paywall)) {
        setQuota(normalizeQuota(result.paywall || data || result));
        return { ok: false, paywall: true };
      }

      return { ok: true, data: result };
    } catch (err) {
      const status = err?.status || err?.response?.status;
      const body = err?.response?.data || err?.data || err;
      if (status === 402 || body?.upgrade_required) {
        setQuota(normalizeQuota(body));
        return { ok: false, paywall: true };
      }
      throw err;
    } finally {
      setGenerating(false);
    }
  }, []);

  return { generate, generating, quota, clearQuota };
}

function normalizeQuota(body) {
  const q = body || {};
  const window = q.window ?? null;
  const defaultMsg = window === "lifetime"
    ? "You've used your free Search Ring."
    : "You've reached your monthly Search Ring limit.";
  return {
    error: q.error || defaultMsg,
    tier: q.tier ?? null,
    used: q.used ?? null,
    limit: q.limit ?? null,
    window,
  };
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}