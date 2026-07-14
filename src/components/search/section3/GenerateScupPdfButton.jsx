import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { jsPDF } from "jspdf";
import { toast } from "sonner";

const HEADER_GREEN = [98, 140, 131];

// SCUP field rows — mirrors the scup-generator merge-field spec.
const FIELDS = [
  ["Target Name", (f) => f.target_name],
  ["Parcel ID", (f) => f.parcel_id],
  ["Owner's Name", (f) => f.owner_name],
  ["Parcel Address", (f) => f.parcel_address],
  ["Owner's Mailing Address", (f) => f.mailing_address],
  ["Coordinates", (f) => f.coordinates],
  ["Parcel Size (acres)", (f) => f.parcel_size],
  ["Boundaries", (f) => f.boundaries],
  ["Zoning Classification", (f) => f.zoning],
  ["Phone", (f) => f.phone],
  ["FEMA Risk Factor", (f) => f.fema_risk],
];

export default function GenerateScupPdfButton({ fields, targetLabel, ringName }) {
  const [busy, setBusy] = useState(false);

  const generate = () => {
    setBusy(true);
    try {
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 54;

      // Header band
      doc.setFillColor(...HEADER_GREEN);
      doc.rect(0, 0, pageW, 88, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("SCUP — Site Candidate Underwriting Profile", margin, 40);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`${ringName || "Search Ring"} · ${targetLabel || "Target"} · Generated ${new Date().toLocaleDateString()}`, margin, 62);

      // Field rows
      let y = 120;
      const labelW = 170;
      const valueW = pageW - margin * 2 - labelW;
      doc.setTextColor(30, 41, 59);
      FIELDS.forEach(([label, get], i) => {
        const value = String(get(fields) ?? "").trim() || "—";
        const lines = doc.splitTextToSize(value, valueW);
        const rowH = Math.max(26, lines.length * 13 + 13);
        if (y + rowH > 740) { doc.addPage(); y = 60; }
        if (i % 2 === 0) {
          doc.setFillColor(241, 245, 249);
          doc.rect(margin - 8, y - 15, pageW - margin * 2 + 16, rowH, "F");
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(label, margin, y);
        doc.setFont("helvetica", "normal");
        doc.text(lines, margin + labelW, y);
        y += rowH;
      });

      // Footer disclaimer
      doc.setFontSize(8);
      doc.setTextColor(120, 130, 140);
      doc.text("Preliminary screening document. Parcel data from public/commercial sources — verify before pursuit.", margin, 770);

      doc.save(`SCUP_${(targetLabel || "Target").replace(/\s+/g, "-")}_${(fields.parcel_id || "parcel").replace(/[^\w-]+/g, "")}.pdf`);
      toast.success(`SCUP PDF generated for ${targetLabel}.`);
    } catch (e) {
      toast.error(e?.message || "SCUP PDF generation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={generate} disabled={busy} className="w-full justify-start text-xs h-8">
      {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 mr-1.5" />}
      Generate SCUP PDF
    </Button>
  );
}