import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Lock, ArrowLeft, Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { HL, SIDE_LABEL, FLAG_COLOR, DISCLAIMER } from "./hawklawConst";
import HawkLawOutputFooter from "./HawkLawOutputFooter";
import { HAWKLAW_DISCLAIMER_FULL } from "./HawkLawDisclaimerBanner";

function Disclaimer() {
  return (
    <div className="flex gap-2 p-3 rounded-lg text-sm" style={{ border: `1.5px solid ${HL.gold}`, background: "rgba(255,184,0,0.08)" }}>
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: HL.gold }} />
      <span>{DISCLAIMER}</span>
    </div>
  );
}

function List({ title, items, color }) {
  if (!items?.length) return null;
  return (
    <div>
      <h4 className="font-semibold mb-2" style={{ color }}>{title}</h4>
      <ul className="list-disc pl-5 space-y-1 text-sm">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
    </div>
  );
}

export default function AnalysisView({ review, analysis, onBack }) {
  const docRef = useRef(null);
  const side = analysis?.side || review?.side;

  async function exportPdf() {
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
      const canvas = await html2canvas(docRef.current, { scale: 2, backgroundColor: "#fff" });
      const pdf = new jsPDF({ unit: "pt", format: "letter" });
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height * w) / canvas.width;
      let pos = 0, remaining = h;
      const pageH = pdf.internal.pageSize.getHeight();
      const img = canvas.toDataURL("image/png");
      pdf.addImage(img, "PNG", 0, pos, w, h);
      remaining -= pageH;
      while (remaining > 0) { pdf.addPage(); pos -= pageH; pdf.addImage(img, "PNG", 0, pos, w, h); remaining -= pageH; }

      // PLACEMENT C — full disclaimer on every page footer, 8pt italic gray.
      const total = pdf.internal.getNumberOfPages();
      const margin = 36;
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      const lines = pdf.splitTextToSize(HAWKLAW_DISCLAIMER_FULL, w - margin * 2);
      for (let p = 1; p <= total; p++) {
        pdf.setPage(p);
        const startY = pageH - 12 - (lines.length - 1) * 10;
        pdf.text(lines, margin, startY);
      }
      pdf.save(`HawkLaw_${(review.lease_name || "lease").replace(/\s+/g, "_")}.pdf`);
    } catch {
      toast.error("PDF export failed");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <ArrowLeft className="w-4 h-4" /> My Reviews
        </button>
        <Button variant="outline" onClick={exportPdf} style={{ borderColor: HL.blue, color: HL.blue }}>
          <Download className="w-4 h-4 mr-1.5" /> Export Analysis (PDF)
        </Button>
      </div>

      <div ref={docRef} className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold font-heading">{review.lease_name}</h1>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-sm font-semibold" style={{ background: HL.blue }}>
            <Lock className="w-4 h-4" /> Analyzed for: {SIDE_LABEL[side]?.toUpperCase()}
          </span>
        </div>

        <Disclaimer />

        <Card className="p-5 space-y-3">
          <p className="text-sm"><strong>Summary:</strong> {analysis.summary}</p>
          {analysis.parties && <p className="text-sm text-muted-foreground"><strong>Parties:</strong> {analysis.parties}</p>}
          <List title="Top Issues" items={analysis.top_issues} color={HL.blue} />
        </Card>

        <Card className="p-5 overflow-x-auto">
          <h3 className="font-bold mb-3">Clause Analysis</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground">
                <th className="p-2">Clause</th><th className="p-2">Flag</th><th className="p-2">Lease Says</th>
                <th className="p-2">Your Side</th><th className="p-2">Move</th>
              </tr>
            </thead>
            <tbody>
              {(analysis.clauses || []).map((c, i) => (
                <tr key={i} className="border-t align-top">
                  <td className="p-2 font-medium">{c.name}</td>
                  <td className="p-2">
                    <span className="px-2 py-0.5 rounded-full text-white text-xs font-semibold" style={{ background: FLAG_COLOR[c.flag] || "#888" }}>{c.flag}</span>
                  </td>
                  <td className="p-2 text-muted-foreground">{c.lease_says}</td>
                  <td className="p-2">{c.your_side_lens}</td>
                  <td className="p-2">
                    {c.negotiation_move}
                    {c.suggested_language && (
                      <div className="mt-1 p-2 rounded text-xs italic" style={{ background: "rgba(0,102,255,0.06)" }}>“{c.suggested_language}”</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-5">
          <h3 className="font-bold mb-2">Negotiation Strategy</h3>
          <p className="text-sm">{analysis.negotiation_strategy}</p>
        </Card>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-4"><List title="Tier 1 — Must-Haves" items={analysis.tier1_must_haves} color={HL.red} /></Card>
          <Card className="p-4"><List title="Tier 2 — Should-Haves" items={analysis.tier2_should_haves} color={HL.gold} /></Card>
          <Card className="p-4"><List title="Tier 3 — Concessions" items={analysis.tier3_concessions} color={HL.green} /></Card>
        </div>

        <Disclaimer />
        <HawkLawOutputFooter />
      </div>
    </div>
  );
}