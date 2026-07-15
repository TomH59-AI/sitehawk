import HawkScipSection from "../HawkScipSection";
import SiteHawkInfoTable from "./SiteHawkInfoTable";

// SITE PLAN & BUILDING PERMIT — printed from the Section 2 zoning research
// (site_plan + building_permit panels). Rendered only when data exists.
export default function SiteHawkPermitPage({ sitePlan, buildingPermit, jurisdiction, page }) {
  const sp = sitePlan || {};
  const bp = buildingPermit || {};
  return (
    <HawkScipSection
      kicker="SCIP · Section 6"
      title="SITE PLAN & BUILDING PERMIT"
      right={jurisdiction || "Jurisdiction"}
      page={page}
      footerNote="Site plan & building permit requirements researched by the SiteHawk zoning pipeline. Field verification with the jurisdiction recommended before submittal."
    >
      <SiteHawkInfoTable
        heading="Site Plan Overview"
        rows={[
          ["Site Plan Jurisdiction", sp.jurisdiction],
          ["Site Plan Contact Information", sp.contact],
          ["Site Plan Fees", sp.fees],
          ["Timeframe for Approval", sp.timeframe],
          ["Existing Site Plan to Amend?", sp.amend_existing],
          ["Concurrent to Zoning or BP?", sp.concurrent],
          ["Submittal Deadlines", sp.deadlines],
          ["Electronic, Hard Copy, or Both?", sp.submission_format],
        ]}
      />
      <SiteHawkInfoTable
        heading="Building Permit Information"
        rows={[
          ["Building Permit Jurisdiction", bp.jurisdiction],
          ["Building Department Contact Info", bp.contact],
          ["Does GC Have to Submit?", bp.gc_must_submit],
          ["Building Permit Fees", bp.fees],
          ["Building Permit Timeframe", bp.timeframe],
          ["Bond Required?", bp.bond_required],
          ["E911 Address Assigned?", bp.e911],
        ]}
      />
    </HawkScipSection>
  );
}