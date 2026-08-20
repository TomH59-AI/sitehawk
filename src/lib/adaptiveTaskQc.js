const PUBLIC_OR_CONTROL_FUNCTIONS = new Set([
  "adaptiveSiteHawkQc",
  "siteHawkSupervisor",
  "runSiteHawkQC",
  "scipBookQc",
  "scipStudioQcFill",
  "scipSubmitAudit",
  "getPublicConfig",
  "scipShare",
  "hawkDocShare",
  "hawkTourAudio",
  "referral",
]);

const MUTATING_RE = /(send|create|update|delete|checkout|webhook|invite|sync|save|upsert|migrate|import|order|share|notify|push|draft|enrich|register|billing|portal|mailer|campaign)/i;
const READ_RE = /(get|lookup|search|find|query|status|stats|verify|analyze|resolve|fetch|list|map|coverage|nearest|report|preview|calculate|solve|run)/i;

export function bypassAdaptiveQc(taskKey) {
  return PUBLIC_OR_CONTROL_FUNCTIONS.has(String(taskKey));
}

export function taskIsIdempotent(taskKey) {
  const key = String(taskKey || "");
  return !MUTATING_RE.test(key) && READ_RE.test(key);
}

function qcError(taskKey, qc, originalError = null) {
  const issue = qc?.issues?.[0] || qc?.summary || originalError?.message || "SiteHawk adaptive QC withheld this task result.";
  const error = new Error(`${taskKey}: ${issue}`);
  error.name = "SiteHawkTaskQcError";
  error.qc = qc;
  error.originalError = originalError;
  error.response = originalError?.response;
  return error;
}

function safeError(error) {
  return {
    name: error?.name || "Error",
    status: error?.response?.status || error?.status || null,
    code: String(error?.code || "").replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 40) || null,
    message_disclosed: false,
  };
}

async function review(reviewInvoke, taskKey, input, output, error, attempt, durationMs) {
  const response = await reviewInvoke({
    action: "review_task",
    task_key: taskKey,
    input,
    output,
    error: error ? safeError(error) : null,
    attempt,
    duration_ms: durationMs,
    idempotent: taskIsIdempotent(taskKey),
  });
  return response?.data || response;
}

export async function superviseFunctionCall(taskKey, input, execute, reviewInvoke) {
  if (bypassAdaptiveQc(taskKey)) return execute();
  let attempt = 1;
  let startedAt = performance.now();
  let result;
  try {
    result = await execute();
  } catch (firstError) {
    const firstQc = await review(reviewInvoke, taskKey, input, null, firstError, attempt, performance.now() - startedAt);
    if (firstQc?.retry_same_input === true && taskIsIdempotent(taskKey)) {
      attempt = 2;
      startedAt = performance.now();
      try {
        result = await execute();
      } catch (secondError) {
        const secondQc = await review(reviewInvoke, taskKey, input, null, secondError, attempt, performance.now() - startedAt);
        throw qcError(taskKey, secondQc, secondError);
      }
    } else {
      throw qcError(taskKey, firstQc, firstError);
    }
  }

  const originalData = result?.data;
  const qc = await review(reviewInvoke, taskKey, input, originalData, null, attempt, performance.now() - startedAt);
  if (qc?.released !== true || qc?.status !== "PASS") throw qcError(taskKey, qc);
  if (qc.repaired_result !== undefined && result && typeof result === "object" && "data" in result) {
    return { ...result, data: qc.repaired_result, adaptive_qc: qc };
  }
  return result && typeof result === "object" ? { ...result, adaptive_qc: qc } : result;
}
