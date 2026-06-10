import { format } from "date-fns";
import { HAWK } from "../hawkScipBrand";
import HawkScipSection from "../HawkScipSection";
import SiteHawkInfoTable from "./SiteHawkInfoTable";

const EXACT = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" };

function fmtDate(d) {
  if (!d) return "";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return String(d); }
}
function money(v) {
  return v != null && Number(v) > 0 ? `$${Number(v).toLocaleString()}` : "";
}

// Is the deed of record a Warranty Deed (general or special)? Realie reports the
// recorded instrument type — we surface it as the deed status; we never draft a
// new deed (that requires an attorney + county recording).
function warrantyStatus(deedType) {
  const t = String(deedType || "").toLowerCase();
  if (!t) return { label: "Unknown — no recorded deed type returned", warranty: false };
  if (t.includes("warranty")) {
    const kind = t.includes("special") ? "Special Warranty Deed" : "Warranty Deed";
    return { label: `Yes — recorded as a ${kind}`, warranty: true };
  }
  if (t.includes("quit")) return { label: `No — recorded as a Quitclaim Deed`, warranty: false };
  if (t.includes("grant")) return { label: `No — recorded as a Grant Deed`, warranty: false };
  if (t.includes("trust")) return { label: `No — recorded as a Trustee's/Trust Deed`, warranty: false };
  return { label: `No — recorded as "${deedType}"`, warranty: false };
}

/**
 * SiteHawkDeedPage — Warranty Deed status & chain of title for Target A, pulled
 * straight from the Realie v43 parcel record (deed_type / deed_doc_num / book /
 * last sale / ownership start / transfers). Realie REPORTS the recorded deed;
 * a new Warranty Deed is not auto-generated (recording is an attorney/county act).
 */
export default function SiteHawkDeedPage({ deed, targetLabel = "Target A", page }) {
  const d = deed || {};
  const status = warrantyStatus(d.deed_type);
  const transfers = Array.isArray(d.transfers) ? d.transfers.slice(0, 8) : [];

  return (
    <HawkScipSection
      kicker="SCIP · Section 2A"
      title="WARRANTY DEED STATUS"
      right={targetLabel}
      page={page}
      footerNote="Deed of record, sale history & chain of title from Realie (county assessor / recorder data). SiteHawk reports the recorded instrument — it does not draft or record a new deed. Confirm vesting with a title company before lease/option execution."
    >
      {/* Headline status banner */}
      <div
        className="rounded-lg px-4 py-3 mb-4 flex items-center justify-between"
        style={{ background: status.warranty ? "#0C1B2E" : HAWK.bg, border: `2px solid ${status.warranty ? HAWK.gold : HAWK.line}`, ...EXACT }}
      >
        <div>
          <div className="text-[8pt] font-bold uppercase tracking-wide" style={{ color: status.warranty ? HAWK.gold : HAWK.navy }}>
            Warranty Deed on Record?
          </div>
          <div className="text-[12pt] font-bold" style={{ color: status.warranty ? "#fff" : HAWK.ink }}>
            {status.label}
          </div>
        </div>
      </div>

      <SiteHawkInfoTable
        heading="Deed of Record"
        rows={[
          ["Deed Type", d.deed_type],
          ["Recording / Document #", d.deed_doc_num],
          ["Deed Book / Page", d.deed_book],
          ["Current Owner (Grantee)", d.owner_name],
          ["Ownership Start", fmtDate(d.ownership_start)],
          ["Legal Description", d.legal_description],
        ]}
      />

      <SiteHawkInfoTable
        heading="Most Recent Sale"
        rows={[
          ["Last Sale Date", fmtDate(d.last_sale_date)],
          ["Last Sale Price", money(d.last_sale_price)],
        ]}
      />

      {/* Chain of title — recorded transfers (most recent first) */}
      <div style={{ marginBottom: 6 }}>
        <div className="flex items-stretch rounded overflow-hidden mb-2" style={EXACT}>
          <div style={{ width: 6, background: HAWK.gold }} />
          <div className="flex-1 px-3 py-1 text-white text-[10pt] font-bold uppercase tracking-wide" style={{ background: HAWK.navy }}>
            Chain of Title
          </div>
        </div>
        {transfers.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: HAWK.bg, ...EXACT }}>
                {["Date", "Deed Type", "Grantor → Grantee", "Price", "Doc #"].map((h) => (
                  <th key={h} style={{ padding: "4px 8px", fontSize: "8pt", fontWeight: 700, color: HAWK.navy, textTransform: "uppercase", textAlign: "left", borderBottom: `1px solid ${HAWK.line}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transfers.map((t, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${HAWK.line}` }}>
                  <td style={{ padding: "4px 8px", fontSize: "8.5pt", color: HAWK.ink, verticalAlign: "top" }}>{fmtDate(t.date || t.sale_date || t.recording_date)}</td>
                  <td style={{ padding: "4px 8px", fontSize: "8.5pt", color: HAWK.ink, verticalAlign: "top" }}>{t.deed_type || t.type || ""}</td>
                  <td style={{ padding: "4px 8px", fontSize: "8.5pt", color: HAWK.ink, verticalAlign: "top" }}>
                    {[t.grantor || t.seller, t.grantee || t.buyer].filter(Boolean).join(" → ") || ""}
                  </td>
                  <td style={{ padding: "4px 8px", fontSize: "8.5pt", color: HAWK.ink, verticalAlign: "top" }}>{money(t.price || t.sale_price || t.amount)}</td>
                  <td style={{ padding: "4px 8px", fontSize: "8.5pt", color: HAWK.ink, verticalAlign: "top" }}>{t.doc_num || t.document_number || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-[9pt] px-1 py-2" style={{ color: HAWK.muted }}>
            No recorded transfer history returned by Realie for this parcel. Order a full title search to confirm the chain of title.
          </div>
        )}
      </div>
    </HawkScipSection>
  );
}