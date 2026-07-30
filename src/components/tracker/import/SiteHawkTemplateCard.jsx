import * as XLSX from "xlsx";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TRACKER_GREEN } from "@/lib/hawkTracker";

// The SiteHawk tracker template lives in the app — generated on the fly, so it's
// always current with what the importer actually understands. Group 1 columns
// auto-map to tracker fields; group 2 are the candidate/parcel details, which
// ride along into each site's notes.
const TRACKER_COLUMNS = [
  "Site Name",
  "Carrier Site Number",
  "Carrier",
  "Market",
  "State",
  "Jurisdiction",
  "Current Status",
  "Target On-Air Date",
  "Blocked Reason",
  "Notes",
  "Latitude",
  "Longitude",
];

const CANDIDATE_COLUMNS = [
  "Owner's Name",
  "Parcel Address",
  "Parcel ID",
  "Parcel Size (acres)",
  "Zoning Classification",
  "FEMA Risk Factor Letter",
  "Phone",
  "Email Address",
  "Owner's Mailing Address",
];

const EXAMPLE = {
  "Site Name": "GA-ATL-0142 (Karnes Rd)",
  "Carrier Site Number": "ATL04142",
  Carrier: "Verizon",
  Market: "Atlanta Metro",
  State: "GA",
  Jurisdiction: "Newton County",
  "Current Status": "Zoning Submitted",
  "Target On-Air Date": "12/15/2026",
  Notes: "Landlord prefers email contact",
  Latitude: 33.5968,
  Longitude: -83.8496,
  "Owner's Name": "Jane Q. Landowner",
  "Parcel Address": "1450 Karnes Rd, Covington, GA 30014",
  "Parcel ID": "0045-00-000-0031",
  "Parcel Size (acres)": 12.4,
  "Zoning Classification": "A-1 Agricultural",
  "FEMA Risk Factor Letter": "X",
  Phone: "(770) 555-0142",
  "Email Address": "jane@example.com",
  "Owner's Mailing Address": "PO Box 22, Covington, GA 30015",
};

export function downloadTrackerTemplate() {
  const headers = [...TRACKER_COLUMNS, ...CANDIDATE_COLUMNS];
  const sheet = XLSX.utils.json_to_sheet([EXAMPLE], { header: headers });
  sheet["!cols"] = headers.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sites");
  XLSX.writeFile(book, "SiteHawk-Candidate-Site-Tracker.xlsx");
}

export default function SiteHawkTemplateCard() {
  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0" style={{ color: TRACKER_GREEN }} />
        <div className="min-w-0 flex-1">
          <div className="font-heading text-sm font-bold text-foreground">
            Don't have a tracker? Use ours.
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Download the SiteHawk tracker, paste your existing site list into it, and upload it
            here. It's built into the app, so it always matches what this importer reads — copy
            and paste into it any time to stay current.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                Tracker fields
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                These populate the tracker directly. Site Name is the only required one.
              </p>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                Candidate &amp; owner details
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Parcel, zoning, FEMA and owner contact. The tracker has no fields for these — set
                them to "Append to notes" on the next step to keep them.
              </p>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            The first row is an example — overwrite or delete it. Keep the header row as-is and
            the columns map themselves.
          </p>

          <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={downloadTrackerTemplate}>
            <Download className="h-4 w-4" /> Download SiteHawk Tracker (.xlsx)
          </Button>
        </div>
      </div>
    </div>
  );
}