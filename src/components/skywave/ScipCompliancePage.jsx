import { HAWK } from "../scip/hawkScipBrand";

const STATUS = {
  REQUIRED:  { label: "REQUIRED",  bg: "#FEF3C7", color: "#92400E", dot: "#D97706" },
  COMPLETE:  { label: "COMPLETE",  bg: "#D1FAE5", color: "#065F46", dot: "#10B981" },
  PENDING:   { label: "PENDING",   bg: "#E0E7FF", color: "#3730A3", dot: "#6366F1" },
  VERIFY:    { label: "VERIFY",    bg: "#F3F4F6", color: "#374151", dot: "#9CA3AF" },
};

function Pill({ status }) {
  const s = STATUS[status] || STATUS.VERIFY;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: s.bg, color: s.color,
      fontSize: "7.5pt", fontWeight: 700, letterSpacing: "0.06em",
      borderRadius: 99, padding: "2px 10px",
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

function ActionRow({ number, title, trigger, status, instruction, link }) {
  return (
    <div style={{
      borderBottom: `1px solid ${HAWK.line}`,
      padding: "10px 0",
      display: "grid",
      gridTemplateColumns: "24px 1fr auto",
      gap: "0 12px",
      alignItems: "start",
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        background: HAWK.navy, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "8pt", fontWeight: 700, flexShrink: 0, marginTop: 2,
      }}>{number}</div>
      <div>
        <div style={{ fontSize: "10pt", fontWeight: 700, color: HAWK.ink }}>{title}</div>
        <div style={{ fontSize: "8pt", color: HAWK.muted, marginTop: 2 }}>
          <strong>Trigger:</strong> {trigger}
        </div>
        <div style={{ fontSize: "8.5pt", color: HAWK.ink, marginTop: 4, lineHeight: 1.5 }}>
          {instruction}
        </div>
        {link && (
          <div style={{ fontSize: "8pt", color: HAWK.blue, marginTop: 3 }}>{link}</div>
        )}
      </div>
      <div style={{ paddingTop: 2 }}>
        <Pill status={status} />
      </div>
    </div>
  );
}

export default function ScipCompliancePage({ record }) {
  const r = record || {};
  const ec = r.existing_conditions || {};
  const zr = r.zoning_report || {};

  // ── Derive status for each action from record fields ──
  const gasNearby   = ec.gas_pipeline_nearby || ec.gas_line_nearby || ec.utilities_note?.toLowerCase().includes("gas");
  const wetlandNearby = ec.wetland_nearby || ec.wetland_distance_ft < 500 || ec.nwi_wetland;
  const fallMarginTight = ec.fall_zone_s_margin_ft < 50 || ec.fall_zone_tight;
  const cupFiled    = r.cup_filed_date || zr.cup_filed_date;
  const faaFiled    = r.faa_filed_date || r.faa_oe_filed;
  const e911Done    = r.e911_address_assigned === true || r.e911_address_assigned === "yes";
  const bondRequired = r.bond_required === true || r.bond_required === "yes";

  return (
    <div style={{ padding: "0 0.15in" }}>
      {/* Header */}
      <div style={{
        background: HAWK.dark, color: HAWK.gold,
        fontSize: "8pt", fontWeight: 700, letterSpacing: "0.2em",
        padding: "6px 10px", borderRadius: 6, marginBottom: 16,
        printColorAdjust: "exact", WebkitPrintColorAdjust: "exact",
      }}>
        ⚠ COMPLIANCE ACTION CHECKLIST — FIELD VERIFICATION REQUIRED BEFORE PERMIT SUBMITTAL
      </div>

      {/* Action rows */}
      <ActionRow
        number={1}
        title="MISS DIG 811 — Underground Utility Locate"
        trigger={gasNearby ? `Gas line confirmed near site (${ec.gas_line_distance || "within 500 ft"})` : "Standard pre-construction requirement — all sites"}
        status={gasNearby ? "REQUIRED" : "VERIFY"}
        instruction="Call 811 (MISS DIG) at least 3 full business days before any excavation, boring, or ground disturbance. Michigan Act 53 of 1974 — mandatory statewide. Failure to call before digging is a civil violation and voids insurance coverage."
        link="missdig.org · Call 811 or submit online"
      />

      <ActionRow
        number={2}
        title="MDEQ / EGLE Part 303 Wetland Permit"
        trigger={wetlandNearby ? `Regulated wetland confirmed within 500 ft of construction disturbance` : "No NWI wetland flagged within 500 ft — verify with site walk"}
        status={wetlandNearby ? "REQUIRED" : "VERIFY"}
        instruction="Submit a Part 303 (Wetlands Protection) permit application to EGLE before any grading, filling, or construction within 500 ft of a regulated wetland. Applies to palustrine, riverine, and lacustrine USFWS NWI classes. Permit review: 90 days typical."
        link="michigan.gov/egle — search 'Part 303 wetland permit application'"
      />

      <ActionRow
        number={3}
        title="PE Letter — Fall Zone Containment & Setback Relief"
        trigger={fallMarginTight ? `Fall zone S margin ${ec.fall_zone_s_margin_ft ?? "< 50"} ft — below standard 1:1 height threshold` : "Required if any fall zone margin < tower height on any cardinal side"}
        status={fallMarginTight ? "REQUIRED" : "VERIFY"}
        instruction="A Michigan-licensed PE must stamp a letter certifying: (1) fall zone is contained within the lease parcel or easement, and (2) the specific setback relief requested is structurally sound and code-compliant. Submit with zoning application. No zoning approval without this letter when margin is tight."
      />

      <ActionRow
        number={4}
        title="FAA Form 7460-1 — Notice of Proposed Construction"
        trigger="Required for all structures > 200 ft AGL or within 20,000 ft of a public-use airport"
        status={faaFiled ? "COMPLETE" : "PENDING"}
        instruction={faaFiled
          ? `OE/AAA filed ${faaFiled}. Verify FAA No Hazard determination letter has been received and saved to project file. No construction may begin until determination is issued — typically 45 days after filing.`
          : "File FAA Form 7460-1 via the OE/AAA online portal. Allow 45 days for FAA determination. Construction cannot begin without a No Hazard or Conditional No Hazard letter."
        }
        link="oeaaa.faa.gov — FAA OE/AAA Portal"
      />

      <ActionRow
        number={5}
        title={`CUP / Special Use Permit — ${zr.zoning_jurisdiction || "Local Jurisdiction"}`}
        trigger={`Required per ${zr.zoning_district || "applicable"} district ordinance: ${zr.cup_special_exception_path || "CUP or special exception required"}`}
        status={cupFiled ? "COMPLETE" : "PENDING"}
        instruction={cupFiled
          ? `CUP application filed ${cupFiled}. Track Planning Commission meeting schedule for hearing date. Prepare for neighbor notification, site plan submittal, and public hearing. Approval timeframe: ${zr.zoning_approval_timeframe || "per jurisdiction schedule"}.`
          : `Submit CUP application to ${zr.zoning_jurisdiction || "the local planning department"}. Include site plan, fall zone exhibit, PE letter, RF coverage map, and carrier letter of intent. Fees: ${zr.zoning_fees || "verify with jurisdiction"}.`
        }
      />

      <ActionRow
        number={6}
        title="E911 Address Assignment"
        trigger="Required before Building Permit final inspection in all Michigan jurisdictions"
        status={e911Done ? "COMPLETE" : "PENDING"}
        instruction={e911Done
          ? "E911 address assigned. Confirm the address appears on the Building Permit application."
          : `Contact ${zr.building_permit_jurisdiction || "Oakland County"} GIS/E911 office to request a physical address assignment for the tower site. Must be assigned before Building Permit issuance. Timeframe: 1–5 business days.`
        }
      />

      {bondRequired && (
        <ActionRow
          number={7}
          title="Performance Bond / Demolition Bond"
          trigger={`Bond required per ${zr.building_permit_jurisdiction || "building department"} — confirm amount at permit application`}
          status="VERIFY"
          instruction={`A performance or demolition bond is required before permit issuance. Bond amount and form: verify with ${zr.building_dept_contact || "the Building Department"}. Fees: ${zr.building_permit_fees || "confirm at application"}.`}
        />
      )}

      {/* Footer note */}
      <div style={{
        marginTop: 20, padding: "8px 12px",
        border: `1px solid ${HAWK.line}`, borderRadius: 6,
        fontSize: "7.5pt", color: HAWK.muted, lineHeight: 1.6,
      }}>
        ⚠ This checklist is generated from SiteHawk AI Intelligence data sourced from USFWS NWI, Zoneomics, Realie, FAA OE/AAA, and LLM-verified ordinance research.
        Status reflects data available at time of report generation. Field verification by a licensed professional is required before submittal.
        SiteHawk does not constitute legal or engineering advice.
      </div>
    </div>
  );
}
