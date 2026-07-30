import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// HawkBolt Capability 3 — Pipeline Advancement (FLAG ONLY).
// Scans Hawk Tracker sites against the 18-gate ladder and flags stalled sites,
// blocked sites, and gate gaps. STRICTLY READ-ONLY: this function never updates
// a site or milestone — advancing a gate always requires a human in the tracker.
// Modes: default = return the report JSON (agent/UI); { mode: "digest" } =
// also email the report to admin users (used by the daily scheduled workflow).

const GATES = [
  "search_ring_received", "candidates_identified", "site_visits_complete",
  "scip_submitted", "scip_approved", "landlord_contacted", "loi_issued",
  "loi_executed", "lease_negotiation", "lease_executed", "regulatory_complete",
  "zoning_submitted", "zoning_approved", "survey_complete", "cd_approved",
  "bp_submitted", "bp_issued", "ntp_issued",
];
const TERMINAL = new Set(["ntp_issued", "ring_exhausted"]);

const label = (k) => k.replace(/_/g, " ");

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const payload = await req.json().catch(() => ({}));
    const mode = payload.mode || "report";
    const staleDays = Number(payload.stale_days) > 0 ? Number(payload.stale_days) : 14;

    // Digest mode (scheduled workflow, no user) runs service-scoped across all
    // sites; interactive mode requires a signed-in user and stays user-scoped.
    let db;
    if (user) {
      db = base44.entities;
    } else if (mode === "digest") {
      db = base44.asServiceRole.entities;
    } else {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sites = await db.HawkTrackerSite.list("-updated_date", 500);
    const milestones = await db.HawkTrackerMilestone.list("-updated_date", 2000);
    const bySite = {};
    for (const m of milestones) (bySite[m.tracker_site_id] ||= []).push(m);

    const now = Date.now();
    const staleMs = staleDays * 24 * 60 * 60 * 1000;
    const stalled = [], blocked = [], gaps = [];

    for (const site of sites) {
      if (TERMINAL.has(site.current_status)) continue;
      const rows = bySite[site.id] || [];

      if (site.is_blocked) {
        blocked.push({ site_id: site.id, site_name: site.site_name, market: site.market || "", reason: site.blocked_reason || "" });
      }

      // Stalled: no REAL (non-backfilled) milestone movement inside the window.
      const lastMove = rows
        .filter((m) => !m.backfilled)
        .map((m) => new Date(m.updated_date).getTime())
        .sort((a, b) => b - a)[0];
      const lastActivity = Math.max(lastMove || 0, new Date(site.updated_date).getTime());
      if (now - lastActivity > staleMs) {
        stalled.push({
          site_id: site.id, site_name: site.site_name, market: site.market || "",
          current_status: label(site.current_status),
          days_idle: Math.floor((now - lastActivity) / 86400000),
          target_on_air: site.target_on_air || null,
        });
      }

      // Gaps: gates at or before the furthest reached gate still sitting pending.
      const reachedIdx = GATES.indexOf(site.current_status);
      if (reachedIdx > 0) {
        const missing = rows
          .filter((m) => GATES.indexOf(m.milestone) >= 0 && GATES.indexOf(m.milestone) < reachedIdx && m.status === "pending")
          .map((m) => label(m.milestone));
        if (missing.length) {
          gaps.push({ site_id: site.id, site_name: site.site_name, current_status: label(site.current_status), missing_gates: missing });
        }
      }
    }

    stalled.sort((a, b) => b.days_idle - a.days_idle);

    const report = {
      generated_at: new Date().toISOString(),
      stale_threshold_days: staleDays,
      totals: { active_sites: sites.filter((s) => !TERMINAL.has(s.current_status)).length, stalled: stalled.length, blocked: blocked.length, gate_gaps: gaps.length },
      stalled, blocked, gaps,
      note: "Flag-only report. HawkBolt never advances a gate — move deals forward in the Hawk Tracker.",
    };

    if (mode === "digest") {
      const users = await base44.asServiceRole.entities.User.list();
      const admins = users.filter((u) => u.role === "admin");
      const fmt = (arr, fn) => (arr.length ? arr.map(fn).join("\n") : "  — none —");
      const body = [
        `HawkBolt Daily Site-Status Report — ${new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" })}`,
        ``,
        `Active sites: ${report.totals.active_sites} | Stalled: ${report.totals.stalled} | Blocked: ${report.totals.blocked} | Gate gaps: ${report.totals.gate_gaps}`,
        ``,
        `BLOCKED (pinned first):`,
        fmt(blocked, (b) => `  • ${b.site_name}${b.market ? ` (${b.market})` : ""} — ${b.reason || "no reason recorded"}`),
        ``,
        `STALLED (no movement in ${staleDays}+ days):`,
        fmt(stalled, (s) => `  • ${s.site_name}${s.market ? ` (${s.market})` : ""} — at "${s.current_status}", idle ${s.days_idle} days${s.target_on_air ? `, target on-air ${s.target_on_air}` : ""}`),
        ``,
        `GATE GAPS (earlier gates still pending):`,
        fmt(gaps, (g) => `  • ${g.site_name} — reached "${g.current_status}" but pending: ${g.missing_gates.join(", ")}`),
        ``,
        `HawkBolt flags only — a human advances every gate in the Hawk Tracker.`,
      ].join("\n");
      for (const admin of admins) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: admin.email,
          subject: `HawkBolt Site-Status: ${report.totals.stalled} stalled, ${report.totals.blocked} blocked`,
          body,
          from_name: "HawkBolt",
        });
      }
      report.emailed_to = admins.map((a) => a.email);
    }

    return Response.json(report);
  } catch (error) {
    console.error("hawkboltPipelineWatch error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}