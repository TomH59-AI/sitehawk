import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

const PERCH_SOLVER_URL = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/perch-siting-solver";

const RUNG_STATUS_STYLE = {
  clean_pass:          "bg-emerald-600 text-white",
  pe_relief_pass:      "bg-amber-500 text-white",
  pass_no_spatial_rule:"bg-slate-500 text-white",
};

function RungStatusPill({ status }) {
  const cls = RUNG_STATUS_STYLE[status] || "bg-red-600 text-white";
  const label = status?.replace(/_/g, " ") || "—";
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${cls}`}>{label}</span>;
}

export default function SitingDeepDive({ parcel, anonKey, onResult }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [ladderOpen, setLadderOpen] = useState(false);

  const canRun = parcel?.geometry && parcel?.jurisdiction && parcel?.state;

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(PERCH_SOLVER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          parcel_geometry: parcel.geometry,
          jurisdiction: parcel.jurisdiction,
          state: parcel.state,
          zoning_classification: parcel.zoningCode || parcel.zoning_classification || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const saved = {
        feasible: data.feasible,
        block_siting: data.block_siting,
        chosen_height_ft: data.chosen?.height_ft ?? null,
        chosen_result: data.chosen?.result ?? null,
        ranking_basis: data.ranking_basis ?? null,
        pe_relief_used: data.chosen?.pe_relief_used ?? false,
        infeasible_reason: data.infeasible_reason ?? null,
        best_fit_point: data.best_fit_point ?? null,
        rungs: data.rungs ?? [],
        rules: data.rules ?? null,
        pe_letter_required: data.pe_letter_required ?? null,
        pe_fall_zone_allowed: data.pe_fall_zone_allowed ?? null,
        unverified: data.unverified ?? [],
        zoning_source: data.zoning_source ?? null,
        zoning_confidence: data.zoning_confidence ?? null,
        solved_at: new Date().toISOString(),
      };
      setResult(saved);
      onResult?.(saved);
    } catch (e) {
      console.error("[SitingDeepDive]", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-mono tracking-widest text-blue-400 uppercase">Hawk Perch — Siting Deep-Dive</div>
          <div className="text-xs text-white/50 mt-0.5">
            {canRun ? `${parcel.jurisdiction}, ${parcel.state}` : "Load a parcel with jurisdiction + state to enable"}
          </div>
        </div>
        <Button
          size="sm"
          disabled={!canRun || loading}
          onClick={run}
          className="bg-blue-600 hover:bg-blue-500 shrink-0"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
          {loading ? "Solving…" : "Run Siting Deep-Dive"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300 flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-2">

          {/* Block banner */}
          {result.block_siting && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/15 p-2.5 text-xs text-red-300 font-semibold flex items-start gap-2">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              Siting blocked — no ordinance text on file for this jurisdiction. Ingest zoning before siting.
            </div>
          )}

          {/* Feasible headline */}
          {!result.block_siting && result.feasible && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 space-y-1">
              <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Recommended max height: {result.chosen_height_ft} ft
              </div>
              {result.ranking_basis && (
                <div className="text-[11px] text-white/50">{result.ranking_basis}</div>
              )}
              {result.pe_relief_used && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[11px] font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" /> Requires PE-stamped engineered fall-zone letter
                </div>
              )}
            </div>
          )}

          {/* Infeasible headline */}
          {!result.block_siting && !result.feasible && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-1">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                No compliant height on this parcel
              </div>
              {result.infeasible_reason && (
                <div className="text-[11px] text-white/50">{result.infeasible_reason}</div>
              )}
            </div>
          )}

          {/* Best-fit point */}
          {result.best_fit_point && (
            <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-[11px] text-white/60">
              Best compound location — clearance <b className="text-white/85">{result.best_fit_point.clearance_ft} ft</b>
              <span className="text-white/30"> · {Number(result.best_fit_point.lat).toFixed(6)}, {Number(result.best_fit_point.lon).toFixed(6)}</span>
            </div>
          )}

          {/* Height ladder */}
          {result.rungs?.length > 0 && (
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-white/70 bg-white/5 hover:bg-white/10"
                onClick={() => setLadderOpen((v) => !v)}
              >
                <span>Height Ladder ({result.rungs.length} rungs)</span>
                {ladderOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {ladderOpen && (
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] text-white/60">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        <th className="px-2 py-1 text-left">Ht (ft)</th>
                        <th className="px-2 py-1 text-left">Status</th>
                        <th className="px-2 py-1 text-right">Fall (ft)</th>
                        <th className="px-2 py-1 text-right">Req (ft)</th>
                        <th className="px-2 py-1 text-right">Avail (ft)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rungs.map((r, i) => (
                        <tr key={i} className="border-b border-white/5">
                          <td className="px-2 py-1 font-mono text-white/80">{r.height_ft}</td>
                          <td className="px-2 py-1"><RungStatusPill status={r.status} /></td>
                          <td className="px-2 py-1 text-right font-mono">{r.fall_zone_ft ?? "—"}</td>
                          <td className="px-2 py-1 text-right font-mono">{r.required_clearance_ft ?? "—"}</td>
                          <td className="px-2 py-1 text-right font-mono">{r.available_clearance_ft ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* PE / permit strip */}
          {(result.rules || result.pe_letter_required != null || result.pe_fall_zone_allowed != null) && (
            <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-[11px] text-white/60 space-y-0.5">
              <div className="font-semibold text-white/80 text-xs mb-1">PE / Permit</div>
              {result.rules?.permit_type && <div>Permit type: <b className="text-white/85">{result.rules.permit_type}</b></div>}
              {result.pe_letter_required != null && (
                <div>PE letter required (submittal): <b className={result.pe_letter_required ? "text-amber-400" : "text-emerald-400"}>{result.pe_letter_required ? "Yes" : "No"}</b></div>
              )}
              {result.pe_fall_zone_allowed != null && (
                <div>PE fall-zone reduction allowed: <b className={result.pe_fall_zone_allowed ? "text-emerald-400" : "text-white/50"}>{result.pe_fall_zone_allowed ? "Yes" : "No"}</b></div>
              )}
              {result.rules?.section_ref && <div>Section ref: <b className="text-white/85">{result.rules.section_ref}</b></div>}
              {result.rules?.source_url && (
                <a href={result.rules.source_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-400 hover:underline">
                  Source ordinance <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {/* Unverified */}
          {result.unverified?.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 space-y-1">
              <div className="text-[11px] font-semibold text-amber-400">Needs manual confirmation</div>
              <ul className="space-y-0.5">
                {result.unverified.map((u, i) => (
                  <li key={i} className="text-[11px] text-white/50 flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-amber-500" />
                    {typeof u === "string" ? u : (u.rule || u.message || JSON.stringify(u))}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Zoning provenance */}
          {result.zoning_source && (
            <div className="text-[10px] text-white/25 font-mono">
              zoning source: {result.zoning_source}{result.zoning_confidence ? ` · confidence: ${result.zoning_confidence}` : ""}
              {result.solved_at ? ` · solved ${new Date(result.solved_at).toLocaleTimeString()}` : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}