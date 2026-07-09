/**
 * Section3Alternates — Target D & E alternate parcels.
 *
 * Standalone display of the two next-best ranked parcels from the ring scan.
 * NOT connected to the pipeline in any way — no lead emit, no ladder, no
 * downstream sections. Pure backup intel with the exact same data rows as
 * Targets A/B/C, plus an on-demand skip-trace for the owner phone.
 */
import { useState } from "react";
import { Layers, Phone, Loader2 } from "lucide-react";
import { skipTraceCascade } from "@/functions/skipTraceCascade";
import { withRateLimitRetry } from "@/lib/quietLookup";

const HEADER_SLATE = "#3B4A66";

const ROWS = [
  ["Owner's Name:", (t) => t.owner_name],
  ["Parcel Address:", (t) => t.parcel_address],
  ["Parcel ID:", (t) => t.apn],
  ["Parcel Size (acres):", (t) => (t.acreage != null ? String(t.acreage) : "")],
  ["Boundaries", (t) => t.boundaries],
  ["Zoning Classification:", (t) => t.zoning_classification],
  ["Zoning Status:", (t) =>
    t.zoning_status === "confirmed" ? "✓ Confirmed non-residential"
    : t.zoning_status === "unverified" ? "⚠ Unverified — confirm before pursuing"
    : (t.zoning_status || "")],
  ["CUP / Special Exception:", (t) =>
    t.cup_review_required
      ? "CUP / Special Exception required — all non-residential parcels retained for review"
      : "By-right (no CUP needed)"],
  ["PE Letter (Fall Zone Relief):", (t) =>
    t.pe_letter_review_required
      ? "PE sealed letter assumed — engineered fall-zone radius may reduce required setback"
      : "No PE letter relief"],
  ["Owner's Mailing Address:", (t) => t.mailing_address],
  ["Coordinates:", (t) =>
    t.latitude != null && t.longitude != null
      ? `${Number(t.latitude).toFixed(6)}, ${Number(t.longitude).toFixed(6)}`
      : ""],
  ["FEMA Risk Factor Letter:", (t) => t.fema_risk_factor],
];

export default function Section3Alternates({ alternates = [] }) {
  const alts = alternates.filter(Boolean);
  const [phones, setPhones] = useState({}); // idx → { display } | "loading"

  if (alts.length === 0) return null;

  const tracePhone = async (idx, t) => {
    if (!t?.owner_name || phones[idx] === "loading") return;
    setPhones((p) => ({ ...p, [idx]: "loading" }));
    try {
      const res = await withRateLimitRetry(() =>
        skipTraceCascade({
          owner_name: t.owner_name,
          mailing_address: t.mailing_address || t.parcel_address || "",
          target_label: t.label,
        })
      );
      const data = res?.data ?? res;
      setPhones((p) => ({ ...p, [idx]: { display: data?.display || data?.phone || "No phone found" } }));
    } catch {
      setPhones((p) => ({ ...p, [idx]: { display: "No phone found" } }));
    }
  };

  return (
    <div className="border-t-4 border-indigo-400/60">
      {/* Banner */}
      <div className="text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: HEADER_SLATE }}>
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · SECTION 3 · ALTERNATES</div>
            <h2 className="font-heading font-bold text-lg leading-tight">Alternate Targets — D &amp; E</h2>
          </div>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide bg-indigo-400/25 border border-indigo-300/40 px-2.5 py-1 rounded-full">
          Backup candidates · Not in pipeline
        </span>
      </div>

      {/* Explainer */}
      <div className="px-4 py-3 bg-indigo-50 dark:bg-indigo-950/20 border-b border-indigo-200/50 dark:border-indigo-800/40 text-xs text-indigo-900 dark:text-indigo-200">
        These parcels met the same zoning, footprint, and flood requirements and ranked just behind Targets A/B/C.
        They are provided as <strong>alternates only</strong> — they do not feed the maps, siting, or SCIP pipeline.
        If a primary target falls through, use these as your next calls.
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ fontFamily: "Inter, Calibri, sans-serif" }}>
          <thead>
            <tr>
              <th className="text-left px-4 py-2.5 font-bold text-white border border-white/20" style={{ background: HEADER_SLATE, minWidth: 200 }}>
                &nbsp;
              </th>
              {alts.map((t) => (
                <th
                  key={t.label}
                  className="text-left px-4 py-2.5 font-bold text-white border border-white/20 uppercase tracking-wide"
                  style={{ background: HEADER_SLATE, minWidth: 220 }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{t.label}</span>
                    <span className="text-[10px] font-semibold normal-case bg-indigo-400/30 px-2 py-0.5 rounded-full">Alternate</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, getter], rowIdx) => {
              const isPostureRow = label.startsWith("Zoning Status") || label.startsWith("CUP") || label.startsWith("PE Letter");
              return (
                <tr key={label} className={isPostureRow ? "bg-indigo-50/60 dark:bg-indigo-950/20" : rowIdx % 2 === 0 ? "bg-background" : "bg-muted/40"}>
                  <td className={`px-4 py-2 font-bold text-left border border-border align-top ${isPostureRow ? "text-indigo-800 dark:text-indigo-300" : "text-foreground"}`}>
                    {label}
                  </td>
                  {alts.map((t) => {
                    const val = getter(t) || "";
                    const zClass = label.startsWith("Zoning Status")
                      ? val.includes("✓") ? "text-emerald-700 dark:text-emerald-300 font-semibold"
                        : val.includes("⚠") ? "text-amber-700 dark:text-amber-300 font-semibold" : ""
                      : "";
                    return (
                      <td key={t.label} className="border border-border px-4 py-2 align-top">
                        <span className={`text-sm ${isPostureRow ? `text-xs leading-snug ${zClass || "text-indigo-800 dark:text-indigo-300"}` : "text-foreground"}`}>
                          {val || "—"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* Phone row — on-demand skip trace so credits are only spent when needed */}
            <tr className="bg-muted/40">
              <td className="px-4 py-2 font-bold text-left border border-border align-top text-foreground">Phone:</td>
              {alts.map((t, idx) => {
                const p = phones[idx];
                return (
                  <td key={t.label} className="border border-border px-4 py-2 align-top">
                    {p === "loading" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Tracing owner…
                      </span>
                    ) : p ? (
                      <span className="text-sm text-foreground">{p.display}</span>
                    ) : t.owner_name ? (
                      <button
                        onClick={() => tracePhone(idx, t)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border border-indigo-400/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" /> Trace Phone
                      </button>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}