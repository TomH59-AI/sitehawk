import * as XLSX from "xlsx";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TRACKER_GREEN } from "@/lib/hawkTracker";

// The SiteHawk candidate-site tracker lives in the app — generated on download so
// it always matches what the importer reads. Headers sit on row 1 (no title row)
// or the importer would read the title as the header names.
const CANDIDATE_COLUMNS = [
  "Site Name",
  "Owner's Name",
  "Parcel Address",
  "Parcel ID",
  "Parcel Size (acres)",
  "Zoning Classification",
  "Jurisdiction",
  "Latitude",
  "Longitude",
  "FEMA Risk Factor Letter",
  "Phone",
  "Email Address",
  "Owner's Mailing Address",
];

// Optional pipeline columns — without a status every imported site lands on
// "Search Ring Received".
const TRACKER_COLUMNS = ["Carrier", "Market", "Current Status", "Target On-Air Date"];

const BLANK_ROWS = 50;

// A real SCIP site, filled in, so the first thing they see is what "done" looks like.
const EXAMPLE_ROW = {
  "Site Name": "Example — Holly (delete this row)",
  "Owner's Name": "Elon Example",
  "Parcel Address": "14507 Fagan Rd, Holly, MI 48442",
  "Parcel ID": "122476002",
  "Parcel Size (acres)": 35.9,
  "Zoning Classification": "SR",
  Jurisdiction: "Holly",
  Latitude: 42.8158,
  Longitude: -83.6109,
  "FEMA Risk Factor Letter": "AE",
  Phone: "(313) 453-0100",
  "Email Address": "elon@example.com",
  "Owner's Mailing Address": "Same",
  Carrier: "Verizon",
  Market: "Detroit Metro",
  "Current Status": "SCIP Submitted",
  "Target On-Air Date": "12/15/2026",
};

export function downloadTrackerTemplate() {
  const headers = [...CANDIDATE_COLUMNS, ...TRACKER_COLUMNS];
  const rows = [
    EXAMPLE_ROW,
    ...Array.from({ length: BLANK_ROWS }, () => Object.fromEntries(headers.map((h) => [h, ""]))),
  ];
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
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
            Bringing in a list from outside SiteHawk?
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Sites you found here don't need this — run the search and use Push to Tracker instead.
            This is for a client's list, a carrier build plan, or the spreadsheet you already keep.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The SiteHawk candidate-site tracker, ready for {BLANK_ROWS} sites. Row 2 is a filled-in
            SCIP example — copy its format, delete it, and paste your own list underneath. Keep the
            same file going; it's built into the app, so it always matches what this importer reads.
          </p>

          <p className="mt-2 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">Site Name</span> is the only required
            column. Jurisdiction, Latitude and Longitude map straight across. Owner, parcel, zoning
            and FEMA columns have no tracker field — set them to "Append to notes" on the next step
            to keep them on the site. Carrier, Market, Current Status and Target On-Air Date are at
            the far right; fill Current Status or every site starts at Search Ring Received.
          </p>

          <p className="mt-2 text-[11px] text-muted-foreground">
            Keep the header row exactly as-is and don't add a title row above it — the importer
            reads row 1 as the column names.
          </p>

          <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={downloadTrackerTemplate}>
            <Download className="h-4 w-4" /> Download SiteHawk Tracker (.xlsx)
          </Button>
        </div>
      </div>
    </div>
  );
}