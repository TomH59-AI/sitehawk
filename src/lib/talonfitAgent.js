import { base44 } from "@/api/base44Client";

/**
 * invokeTalonfitAgent — creates a one-shot conversation with the TalonFit®
 * in-app agent and returns its plain-English site analysis. The agent has
 * the TALONFITformula.docx and Turf.js.docx context files plus tools for
 * talonfitSolve, codehawkHunt, parcelFullLookup, zoneResolve, etc.
 *
 * Pass the solveResult from talonfitAiSolve so the agent doesn't redo the
 * deterministic math — it uses the numbers the solver already produced and
 * focuses on the WHY.
 *
 * Returns the agent's markdown response string, or null on timeout/failure.
 */
export async function invokeTalonfitAgent({ lat, lon, heightFt, centerLat, centerLon, solveResult }) {
  const conversation = await base44.agents.createConversation({
    agent_name: "talonfit",
    metadata: { name: `Map Probe ${lat.toFixed(6)}, ${lon.toFixed(6)}` },
  });

  const r = solveResult?.calculated_result || {};
  const p = solveResult?.parcel || {};
  const d = solveResult?.parcel_details || {};
  const o = solveResult?.ordinance_rules || {};

  const prompt = `A site acquisition specialist clicked on the TalonFit map within the 2-mile exploration radius from the SARF center.

SITE COORDINATES
- Latitude: ${lat}
- Longitude: ${lon}
- Proposed tower height: ${heightFt} ft AGL
- SARF search ring center: ${centerLat}, ${centerLon}

The deterministic TalonFit-AI-1.0 solver has already returned these results:
- Decision: ${r.decision || "unknown"}
- Maximum buildable height: ${r.maximum_buildable_height_ft ?? "unknown"} ft
- Binding constraint: ${r.binding_constraint || "unknown"}
- Reasons: ${JSON.stringify(r.reasons || [])}
- Missing information: ${JSON.stringify(r.missing_information || [])}

PARCEL DATA (Realie)
- Address: ${p.address || "No data available"}
- APN: ${p.parcel_id || "No data available"}
- Owner: ${d.owner || "No data available"}
- Acreage: ${d.acreage ?? "No data available"}
- Zoning: ${p.zoning_classification || "No data available"}
- Jurisdiction: ${p.jurisdiction || "No data available"}

ORDINANCE RULES
- Height limit: ${o.maximum_tower_height_ft ?? "No data available"} ft
- Ordinance verified: ${o.ordinance_data_verified ?? false}
- Citation: ${o.ordinance_section || "No data available"}

Using the TalonFit Formula and Turf.js context, provide a clear, professional analysis for the site acquisition specialist:
1. State whether the site works and at what maximum height.
2. Explain WHY — which specific rule or constraint is the binding factor and how the math works.
3. Summarize the parcel data (owner, acreage, zoning).
4. List any caveats or missing data they should verify before proceeding.

Be specific. Cite the ordinance section when available. Do not invent data — say "No data available" for anything missing. Keep it under 300 words.`;

  await base44.agents.addMessage(conversation, { role: "user", content: prompt });

  return new Promise((resolve) => {
    let resolved = false;
    const done = (val) => {
      if (resolved) return;
      resolved = true;
      unsubscribe();
      resolve(val);
    };

    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      const messages = data.messages || [];
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content);
      if (!lastAssistant) return;
      const hasPending = messages.some((m) =>
        m.tool_calls?.some(
          (tc) => tc.status === "pending" || tc.status === "running" || tc.status === "in_progress"
        )
      );
      if (!hasPending) done(lastAssistant.content);
    });

    // 90-second safety timeout — the agent makes multiple tool calls
    setTimeout(() => done(null), 90000);
  });
}