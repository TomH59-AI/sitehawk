import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

// Exports all CRM leads (every field) to a CSV the user can open in Excel/Sheets.
const FIELDS = [
  "owner_name", "parcel_address", "owner_mailing_address", "stage",
  "phone", "email", "match_score", "follow_up_date", "notes",
  "latitude", "longitude", "candidate_id", "search_id", "created_date",
];

function toCsvValue(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function CRMExportButton({ deals }) {
  const handleExport = () => {
    if (!deals?.length) return;
    const header = FIELDS.join(",");
    const rows = deals.map((d) => FIELDS.map((f) => toCsvValue(d[f])).join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sitehawk-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button onClick={handleExport} disabled={!deals?.length} variant="outline" className="gap-2 font-heading font-semibold">
      <Download className="w-4 h-4" /> Export Leads
    </Button>
  );
}