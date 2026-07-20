import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Printer, ArrowLeft, Loader2, AlertTriangle, Camera } from "lucide-react";
import AnthemNetTable from "../components/scip/anthemnet/AnthemNetTable";
import { buildAnthemNet } from "../components/scip/anthemnet/anthemNetData";

const PRINT_CSS = `
@page { size: Letter; margin: 0.4in; }
@media print {
  body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body * { visibility: hidden; }
  #anthemnet-doc, #anthemnet-doc * { visibility: visible; }
  #anthemnet-doc { position: absolute; left: 0; top: 0; width: 7.7in; }
  .no-print { display: none !important; }
}`;

// AnthemNet SITE CANDIDATE INFORMATION PACKAGE — auto-populated from a ScipRecord.
export default function AnthemNetScip() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const styleRef = useRef(null);

  useEffect(() => {
    base44.entities.ScipRecord.get(id).then(setRecord).catch(() => setRecord(null)).finally(() => setLoading(false));
  }, [id]);

  const handlePrint = () => {
    if (!styleRef.current) {
      const el = document.createElement("style");
      el.innerHTML = PRINT_CSS;
      document.head.appendChild(el);
      styleRef.current = el;
    }
    window.print();
  };

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!record) return <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">SCIP record not found.</div>;

  const { sections, maps, photos, missing } = buildAnthemNet(record);
  const filledMaps = maps.filter((m) => m.url);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <button onClick={() => navigate(`/scip/${record.id}`)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to SCIP
        </button>
        <button onClick={handlePrint} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
          <Printer className="w-4 h-4" /> Print / Save PDF
        </button>
      </div>

      {/* Missing-data report (not printed) */}
      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 no-print">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h3 className="font-heading font-bold text-sm text-foreground">Missing data — {missing.length} fields need input or a pipeline run</h3>
          </div>
          <ul className="text-xs text-muted-foreground columns-1 sm:columns-2 gap-6 space-y-0.5">
            {missing.map((m) => <li key={m}>• {m}</li>)}
          </ul>
        </div>
      )}

      {/* The document */}
      <div id="anthemnet-doc" className="bg-white rounded-lg border border-border shadow-sm p-6" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4" style={{ borderBottom: "3px solid #111827", paddingBottom: 8 }}>
          <div style={{ fontWeight: 800, fontSize: "16pt", color: "#111827", letterSpacing: "0.08em" }}>ANTHEMNET</div>
          <div style={{ fontWeight: 700, fontSize: "10pt", color: "#111827", textAlign: "right" }}>SITE CANDIDATE INFORMATION PACKAGE</div>
        </div>

        {sections.slice(0, 2).map((s) => <AnthemNetTable key={s.title} title={s.title} rows={s.rows} />)}

        {/* SARF map */}
        {record.map_image_url && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ padding: "6px 8px", color: "#fff", background: "#111827", border: "1px solid #cbd5e1", fontWeight: 700, fontSize: "9pt", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>SARF</div>
            <img src={record.map_image_url} alt="SARF map" style={{ width: "100%", border: "1px solid #cbd5e1", borderTop: "none" }} />
          </div>
        )}

        {sections.slice(2).map((s) => <AnthemNetTable key={s.title} title={s.title} rows={s.rows} />)}

        {/* Photographs — field-provided placeholders */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ padding: "6px 8px", color: "#fff", background: "#111827", border: "1px solid #cbd5e1", fontWeight: 700, fontSize: "9pt", textTransform: "uppercase", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
            Photographs — Premises, Access, Nearest Power/Telco
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid #cbd5e1", borderTop: "none" }}>
            {photos.map((p) => (
              <div key={p} style={{ padding: "18px 8px", border: "0.5px solid #e2e8f0", textAlign: "center", color: "#94a3b8", fontSize: "8.5pt" }}>
                <Camera className="w-4 h-4 mx-auto mb-1" />
                {p} — field photo
              </div>
            ))}
          </div>
        </div>

        {/* Maps — insert snippets */}
        <div>
          <div style={{ padding: "6px 8px", color: "#fff", background: "#111827", border: "1px solid #cbd5e1", fontWeight: 700, fontSize: "9pt", textTransform: "uppercase", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
            Maps — Snippets
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, border: "1px solid #cbd5e1", borderTop: "none" }}>
            {maps.filter((m) => m.label !== "SARF (Search Ring)").map((m) => (
              <div key={m.label} style={{ padding: 8, border: "0.5px solid #e2e8f0" }}>
                <div style={{ fontWeight: 700, fontSize: "8.5pt", color: "#111827", marginBottom: 4 }}>{m.label}</div>
                {m.url ? (
                  <img src={m.url} alt={m.label} style={{ width: "100%", border: "1px solid #e2e8f0" }} />
                ) : (
                  <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontSize: "8.5pt", background: "#f8fafc" }}>Not generated yet</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground text-center pb-6 no-print">
        {filledMaps.length}/{maps.length} map exhibits populated from the pipeline.
      </div>
    </div>
  );
}