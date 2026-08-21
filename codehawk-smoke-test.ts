import { fetchOrdinanceSource } from './base44/shared/codehawk.ts';

const counters = {};
const result = await fetchOrdinanceSource(
  {},
  'data:text/html,<html><body>wireless tower</body></html>',
  counters,
  { scrapfly_key: 'test-only', scrapfly_call_limit: 0 },
  true
);
const summary = {
  reason: result.reason,
  direct_fetch_calls: counters.direct_fetch_calls,
  scrapfly_calls: counters.scrapfly_calls || 0,
  scrapfly_budget_exhausted: counters.scrapfly_budget_exhausted || 0,
  tiers: result.attempts.map((attempt) => attempt.tier),
};
console.log(JSON.stringify(summary));
if (
  result.reason !== 'scrapfly_run_call_limit_reached' ||
  (counters.scrapfly_calls || 0) !== 0 ||
  counters.scrapfly_budget_exhausted !== 1
) {
  process.exit(1);
}
