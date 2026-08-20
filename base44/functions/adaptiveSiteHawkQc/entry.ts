import { createClientFromRequest } from "npm:@base44/sdk@0.8.43";
import {
  ADAPTIVE_QC_MODEL,
  CRITICAL_FAMILIES,
  DEFAULT_POLICIES,
  currentManifestSummary,
  evaluateAdaptiveTask,
  familyForTask,
  sourceHashForFamily,
  valueHash,
} from "../../shared/adaptiveSiteHawkQc.ts";

const now = () => new Date().toISOString();
const runId = () => `TASK-QC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

async function ensureRegistry(base44: any) {
  const manifest = currentManifestSummary();
  const existingPolicies = await base44.asServiceRole.entities.QcPolicy.list("task_family", 200).catch(() => []);
  const existingStates = await base44.asServiceRole.entities.QcChangeState.list("task_family", 200).catch(() => []);
  const policies = new Map(existingPolicies.map((row: any) => [row.task_family, row]));
  const states = new Map(existingStates.map((row: any) => [row.task_family, row]));
  for (const [family, info] of Object.entries(manifest.families) as any) {
    let policy: any = policies.get(family);
    if (!policy) {
      policy = await base44.asServiceRole.entities.QcPolicy.create({ ...(DEFAULT_POLICIES as any)[family], policy_updated_at: now(), updated_reason: "Initial adaptive QC baseline" });
      policies.set(family, policy);
    }
    let state: any = states.get(family);
    if (!state) {
      state = await base44.asServiceRole.entities.QcChangeState.create({
        task_family: family,
        current_source_hash: info.hash,
        validated_source_hash: info.hash,
        status: "VALIDATED",
        pass_count: 0,
        fail_count: 0,
        changed_files: info.files,
        detected_at: now(),
        validated_at: now(),
        validated_by: "Initial administrator-authorized baseline",
      });
      states.set(family, state);
    } else if (state.current_source_hash !== info.hash) {
      state = await base44.asServiceRole.entities.QcChangeState.update(state.id, {
        current_source_hash: info.hash,
        status: CRITICAL_FAMILIES.has(family) ? "ADMIN_REVIEW" : "MONITORING",
        pass_count: 0,
        fail_count: 0,
        changed_files: info.files,
        detected_at: now(),
      });
      states.set(family, state);
    }
  }
  return { manifest, policies, states };
}

function adminOnly(user: any) {
  return user?.role === "admin";
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const action = body.action || "review_task";
    const registry = await ensureRegistry(base44);

    if (action === "status") {
      if (!adminOnly(user)) return Response.json({ error: "Administrator access required" }, { status: 403 });
      const recentRuns = await base44.asServiceRole.entities.QcTaskRun.list("-checked_at", 50).catch(() => []);
      return Response.json({
        ok: true,
        manifest: { fingerprint: registry.manifest.fingerprint, ruleset: registry.manifest.ruleset },
        policies: Array.from(registry.policies.values()),
        families: Array.from(registry.states.values()),
        recent_runs: recentRuns,
      });
    }

    if (action === "approve_family") {
      if (!adminOnly(user)) return Response.json({ error: "Administrator access required" }, { status: 403 });
      const family = String(body.task_family || "");
      const state: any = registry.states.get(family);
      if (!state) return Response.json({ error: "Unknown task family" }, { status: 404 });
      if (body.confirm_regression_review !== true || String(body.admin_notes || "").trim().length < 12) {
        return Response.json({ error: "Confirm regression review and provide meaningful administrator notes" }, { status: 400 });
      }
      const passed = await base44.asServiceRole.entities.QcTaskRun.filter({ task_family: family, source_hash: state.current_source_hash, status: "PASS" }, "-checked_at", 1).catch(() => []);
      if (!passed.length) return Response.json({ error: "At least one current-version task must pass QC before administrator approval" }, { status: 409 });
      const updatedState = await base44.asServiceRole.entities.QcChangeState.update(state.id, {
        validated_source_hash: state.current_source_hash,
        status: "VALIDATED",
        validated_at: now(),
        validated_by: user.email || user.id,
        admin_notes: String(body.admin_notes).trim(),
      });
      const policy: any = registry.policies.get(family);
      if (policy) await base44.asServiceRole.entities.QcPolicy.update(policy.id, { validated_source_hash: state.current_source_hash, status: "VALIDATED", updated_by_admin: user.email || user.id, policy_updated_at: now() });
      return Response.json({ ok: true, family: updatedState });
    }

    if (action === "update_policy") {
      if (!adminOnly(user)) return Response.json({ error: "Administrator access required" }, { status: 403 });
      const family = String(body.task_family || "");
      const policy: any = registry.policies.get(family);
      if (!policy) return Response.json({ error: "Unknown task family" }, { status: 404 });
      const allowed: any = {};
      for (const key of ["ai_review_mode", "auto_retry_idempotent", "max_retries", "required_output_paths", "repairable_paths", "policy_notes", "risk_level"]) {
        if (body.policy?.[key] !== undefined) allowed[key] = body.policy[key];
      }
      const updated = await base44.asServiceRole.entities.QcPolicy.update(policy.id, {
        ...allowed,
        version: Number(policy.version || 1) + 1,
        status: "ADMIN_REVIEW",
        updated_reason: String(body.updated_reason || "Administrator changed the task contract"),
        updated_by_admin: user.email || user.id,
        policy_updated_at: now(),
      });
      const state: any = registry.states.get(family);
      if (state) await base44.asServiceRole.entities.QcChangeState.update(state.id, { status: "ADMIN_REVIEW", pass_count: 0 });
      return Response.json({ ok: true, policy: updated });
    }

    if (action !== "review_task") return Response.json({ error: "Unknown action" }, { status: 400 });
    const taskKey = String(body.task_key || "").trim();
    if (!taskKey) return Response.json({ error: "task_key required" }, { status: 400 });
    const family = familyForTask(taskKey);
    const policy: any = registry.policies.get(family) || (DEFAULT_POLICIES as any).general;
    let state: any = registry.states.get(family);
    const sourceHash = sourceHashForFamily(family);
    const qcRunId = runId();
    let evaluation: any;
    try {
      evaluation = await evaluateAdaptiveTask({
        taskKey,
        family,
        policy,
        changeState: state,
        input: body.input,
        output: body.output,
        error: body.error,
        attempt: Number(body.attempt || 1),
        idempotent: body.idempotent === true,
      });
    } catch (error) {
      evaluation = {
        status: "FAIL",
        released: false,
        issues: [error instanceof Error ? error.message : "Adaptive QC failed"],
        summary: "OpenRouter quality control failed closed; task result was withheld.",
        retry_same_input: false,
        repaired_result: body.output,
        repairs: [],
        repair_status: "REPAIR_FAILED",
      };
    }
    if (state && state.current_source_hash !== state.validated_source_hash) {
      if (evaluation.status === "PASS") {
        const nextPassCount = Number(state.pass_count || 0) + 1;
        const mayAutoValidate = !CRITICAL_FAMILIES.has(family) && nextPassCount >= 3;
        state = await base44.asServiceRole.entities.QcChangeState.update(state.id, {
          pass_count: nextPassCount,
          ...(mayAutoValidate ? { status: "VALIDATED", validated_source_hash: state.current_source_hash, validated_at: now(), validated_by: "Three successful adaptive QC runs" } : {}),
        });
        if (mayAutoValidate && policy?.id) await base44.asServiceRole.entities.QcPolicy.update(policy.id, { validated_source_hash: state.current_source_hash, status: "VALIDATED", policy_updated_at: now() });
      } else {
        state = await base44.asServiceRole.entities.QcChangeState.update(state.id, { fail_count: Number(state.fail_count || 0) + 1, status: evaluation.status === "FAIL" ? "BLOCKED" : state.status });
      }
    }
    if (state?.status === "ADMIN_REVIEW" || state?.status === "BLOCKED") {
      evaluation.released = false;
      if (evaluation.status === "PASS") evaluation.status = "REVIEW_REQUIRED";
      evaluation.issues = [...new Set([...(evaluation.issues || []), `The ${family} task family changed and requires administrator validation.`])];
    }
    const record = await base44.asServiceRole.entities.QcTaskRun.create({
      qc_run_id: qcRunId,
      task_key: taskKey,
      task_family: family,
      source_hash: sourceHash,
      policy_version: Number(policy.version || 1),
      status: evaluation.status,
      released: evaluation.released === true,
      repair_status: evaluation.repair_status,
      attempt: Number(body.attempt || 1),
      duration_ms: Number(body.duration_ms || 0),
      issues: evaluation.issues || [],
      repairs: evaluation.repairs || [],
      retry_same_input: evaluation.retry_same_input === true,
      input_hash: await valueHash(body.input),
      output_hash: await valueHash(body.output),
      checked_at: now(),
      checked_by: user.email || user.id,
      model: ADAPTIVE_QC_MODEL,
      summary: evaluation.summary,
    });
    return Response.json({ ...evaluation, qc_run_id: qcRunId, task_family: family, source_hash: sourceHash, policy_version: policy.version, run_record_id: record.id });
  } catch (error) {
    console.error("adaptiveSiteHawkQc failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ status: "FAIL", released: false, error: "Adaptive quality control failed closed" }, { status: 500 });
  }
});
