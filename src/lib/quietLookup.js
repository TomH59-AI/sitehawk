// Quiet background lookup runner — spaces calls out and retries on the
// platform "Rate limit exceeded" error with exponential backoff, so bursts of
// score-only lookups never surface rate-limit errors to the user.

const isRateLimit = (err) =>
  /rate limit/i.test(err?.message || "") || err?.response?.status === 429;

export async function withRateLimitRetry(fn, { retries = 3, baseDelayMs = 1500 } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimit(err) || attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
      attempt += 1;
    }
  }
}

// Run [name, fn] lookup tasks ONE AT A TIME with a small gap between them.
// Each task's result is passed to onResult(name, data); failures are silent
// (score-only data). Returns a cancel function.
export function runQuietLookups(tasks, onResult, { gapMs = 800 } = {}) {
  let cancelled = false;
  (async () => {
    for (const [name, fn] of tasks) {
      if (cancelled) return;
      try {
        const res = await withRateLimitRetry(fn);
        if (!cancelled) onResult(name, res?.data || {});
      } catch {
        // silent — scorecard simply shows "no data" for this factor
      }
      if (!cancelled) await new Promise((r) => setTimeout(r, gapMs));
    }
  })();
  return () => { cancelled = true; };
}