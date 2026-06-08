import { format } from "date-fns";
import { HAWK, CONFIDENTIAL_NOTICE } from "../hawkScipBrand";
import HawkScipSection, { HawkWatermark } from "../HawkScipSection";
import SiteHawkMapTile from "./SiteHawkMapTile";
import SiteHawkInfoTable from "./SiteHawkInfoTable";

const EXACT = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" };

function fmtDate(d) {
  if (!d) return "";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return String(d); }
}
const dash = (v) => (v === 0 || v ? v : "");

function Field({ label, value }) {
  return (
    <div>
      <div className="text-[8pt] font-bold uppercase tracking-wide" style={{ color: HAWK.navy }}>{label}</div>
      <div className="text-[11pt] pt-0.5 pb-0.5" style={{ color: HAWK.ink, borderBottom: `1.5px solid ${HAWK.blue}` }}>
        {value || "\u00A0"}
      </div>
    </div>
  );
}

/**
 * SiteHawkScipDoc — the full SiteHawk-branded Site Candidate Information Package,
 * mirroring the official SCIP template (Site Acquisition → Search Ring → SARF Map
 * → Project/Site/Owner Info → Existing Conditions → Maps → Zoning Overview →
 * Tower Specifics → Site Plan → Building Permit), populated entirely from the
 * live SiteSearch pipeline. No manual entry: anything not collected is left blank.
 *
 * `record` is assembled by GenerateScipButton from pipeline state + static maps.
 */
export default function SiteHawkScipDoc({ record }) {
  const r = record || {};
  const a = r.targetA || {};
  const z = r.zoning || {};
  const lat = Number.isFinite(Number(r.latitude)) ? Number(r.latitude).toFixed(6) : "";
  const lon = Number.isFinite(Number(r.longitude)) ? Number(r.longitude).toFixed(6) : "";
  const aLat = Number.isFinite(Number(a.latitude)) ? Number(a.latitude).toFixed(6) : "";
  const aLon = Number.isFinite(Number(a.longitude)) ? Number(a.longitude).toFixed(6) : "";
  const maps = r.maps || {};
  const cond = r.conditions || {};
  let pageNo = 0;
  const next = () => (pageNo += 1);

  // Official SCIP map order (matches the SiteHawk fillable template's MAPS list).
  // We ONLY render tiles that actually generated a URL — no blank "Not generated"
  // slots — so the printed maps section is always clean and full.
  const ALL_MAP_TILES = [
    ["Aerial", maps.aerial],
    ["Topography", maps.topo],
    ["Floodplain Map", maps.fema],
    ["Zoning Map", maps.zoning],
    ["Wetlands Map", maps.wetlands],
    ["Parcel Map", maps.parcel],
    ["Wind Speed Map", maps.wind],
    ["Airport Map", maps.airport],
    ["Cell Tower Map", maps.celltower],
  ];
  const urlOf = (u) => (typeof u === "string" ? u : u?.url);
  const MAP_TILES = ALL_MAP_TILES.filter(([, u]) => urlOf(u));
  const hasMaps = MAP_TILES.length > 0;
  const hasZoning = z && (z.jurisdiction || z.district || z.future_land_use || z.process || z.fees || z.max_height);
  const hasConditions = Object.values(cond).some((v) => v);

  return (
    <div id="sitehawk-scip-doc" style={{ fontFamily: "Inter, Helvetica Neue, Arial, sans-serif" }}>

      {/* ─────────── COVER ─────────── */}
      <div className="page" style={{ position: "relative", width: "8.5in", minHeight: "11in", background: "#fff", display: "flex", flexDirection: "column" }}>
        <HawkWatermark />
        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column" }}>
          <div className="flex items-center gap-5" style={{ background: HAWK.dark, padding: "0.55in 0.5in", ...EXACT }}>
            <img src={HAWK.logo} alt="SiteHawk" style={{ height: 92 }} crossOrigin="anonymous" />
            <div>
              <div className="text-[12pt] uppercase font-bold" style={{ color: HAWK.gold, letterSpacing: 4 }}>SiteHawk</div>
              <div className="text-[24pt] font-bold text-white leading-tight">Site Candidate Information Package</div>
              <div className="text-[10pt] mt-1" style={{ color: "#9FB0CC" }}>SCIP · Generated from the SiteHawk pipeline</div>
            </div>
          </div>
          <div style={{ height: 6, background: HAWK.gold, ...EXACT }} />

          <div className="px-12 mt-10">
            <div className="rounded-xl p-6" style={{ border: `2px solid ${HAWK.navy}` }}>
              <div className="text-[9pt] font-bold uppercase tracking-[3px] mb-3" style={{ color: HAWK.blue }}>Search Ring</div>
              <div className="grid grid-cols-2 gap-x-10 gap-y-4">
                <Field label="Site Name" value={r.site_name} />
                <Field label="Generated" value={fmtDate(r.generated_at)} />
                <Field label="Agent" value={r.agent_name} />
                <Field label="Search Radius" value={r.radius_miles ? `${r.radius_miles} mi` : ""} />
                <Field label="Coordinates" value={lat && lon ? `${lat}, ${lon}` : ""} />
                <Field label="SARF / Tower Height" value={r.tower_height_ft ? `${r.tower_height_ft} ft AGL` : ""} />
                <Field label="County" value={r.county} />
                <Field label="State" value={(r.state || "").toUpperCase()} />
              </div>
            </div>
          </div>

          <div className="px-12 mt-auto mb-10">
            <div className="rounded-lg p-5" style={{ background: HAWK.dark, ...EXACT }}>
              <div className="text-[10pt] font-bold uppercase tracking-[2px] mb-2" style={{ color: HAWK.gold }}>⚠ Confidential &amp; Proprietary</div>
              <p className="text-[8.5pt] leading-relaxed" style={{ color: "#D5DDEC" }}>{CONFIDENTIAL_NOTICE}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────── SARF MAP ─────────── */}
      <HawkScipSection
        kicker="SCIP · Section 1"
        title="SARF MAP"
        right={`${r.site_name || ""} · ${lat}, ${lon} · ${r.radius_miles} mi`}
        page={next()}
        footerNote="Basemap © Mapbox · © OpenStreetMap. Gold ring = selected search radius; green tower = Target A."
      >
        <div className="rounded-lg overflow-hidden" style={{ height: "7.6in", border: `2px solid ${HAWK.blue}` }}>
          {r.sarf_map ? (
            <img src={r.sarf_map} alt="SARF Map" style={{ width: "100%", height: "100%", objectFit: "cover" }} crossOrigin="anonymous" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10pt]" style={{ background: HAWK.bg, color: HAWK.muted }}>SARF map not available</div>
          )}
        </div>
      </HawkScipSection>

      {/* ─────────── PROJECT / SITE / OWNER INFO ─────────── */}
      <HawkScipSection
        kicker="SCIP · Section 2"
        title="PROJECT & SITE INFORMATION"
        right={a.label || "Target A"}
        page={next()}
        footerNote="Project geometry from the SARF + Target A pipeline · parcel & owner from the property record. Field verification recommended before submittal."
      >
        <SiteHawkInfoTable
          heading="Project Information"
          rows={[
            ["Tower Height", r.tower_height_ft ? `${r.tower_height_ft} ft AGL` : ""],
            ["Compound Size", r.compound_size],
            ["Ground Elevation", dash(a.ground_elevation_ft) ? `${a.ground_elevation_ft} ft AMSL` : ""],
            ["Latitude", aLat],
            ["Longitude", aLon],
            ["Distance from Ring Center", dash(a.distance_from_center_mi) ? `${a.distance_from_center_mi} mi` : ""],
          ]}
        />
        <SiteHawkInfoTable
          heading="Site Information (Property Appraiser)"
          rows={[
            ["Parcel County", r.county],
            ["Parcel ID / APN", a.apn],
            ["Owner Name (on Deed)", a.owner_name],
            ["Parcel Street Address", a.parcel_address],
            ["Parcel State", (r.state || "").toUpperCase()],
            ["Parcel Size (acres)", dash(a.acreage)],
            ["Parcel Dimensions", a.boundaries],
            ["Zoning Classification", a.zoning_classification],
          ]}
        />
        <SiteHawkInfoTable
          heading="Owner Information"
          rows={[
            ["Name(s)", a.owner_name],
            ["Mailing Address", a.mailing_address],
            ["Land Use", a.land_use],
            ["FEMA Risk Factor", a.fema_risk_factor],
          ]}
        />
      </HawkScipSection>

      {/* ─────────── EXISTING CONDITIONS ─────────── */}
      {hasConditions && (
        <HawkScipSection
          kicker="SCIP · Section 3"
          title="EXISTING CONDITIONS"
          right={a.label || "Target A"}
          page={next()}
          footerNote="FEMA NFHL flood zone · USFWS NWI wetlands · nearest airport · power & telco providers · public safety. Auto-collected by the pipeline."
        >
          <SiteHawkInfoTable
            rows={[
              ["Flood Zone(s)", cond.flood_zone],
              ["Wetland Concerns?", cond.wetlands],
              ["Hazardous Waste Concerns?", cond.hazardous_waste],
              ["Power Provider", cond.power_provider],
              ["Fiber Available?", cond.fiber],
              ["Telco Provider", cond.telco_provider],
              ["Nearest Airport", cond.airport],
              ["Nearest Cell Tower", cond.cell_tower],
              ["Wind Speed (ASCE 7-22)", cond.wind],
            ]}
          />
        </HawkScipSection>
      )}

      {/* ─────────── MAPS GRID ─────────── */}
      {hasMaps && (
        <HawkScipSection
          kicker="SCIP · Section 4"
          title="HAWK MAP SUITE"
          right={a.label || "Target A"}
          page={next()}
          footerNote="Aerial/topo/parcel © Mapbox · Floodplain © FEMA NFHL · Wetlands © USFWS NWI · Wind © ASCE 7-22 · Airport (FAA) & cell tower (FCC ASR/OpenCellID) shown crow-flies. Field verification recommended."
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {MAP_TILES.map(([title, url]) => (
              <SiteHawkMapTile key={title} title={title} url={url} />
            ))}
          </div>
        </HawkScipSection>
      )}

      {/* ─────────── ZONING & PERMITTING ─────────── */}
      {hasZoning && (
        <HawkScipSection
          kicker="SCIP · Section 5"
          title="ZONING & PERMITTING"
          right={z.jurisdiction || "Jurisdiction"}
          page={next()}
          footerNote="Zoneomics-primary zoning district & land use · curated jurisdiction contacts, fees & timeframes. Field verification recommended before submittal."
        >
          <SiteHawkInfoTable
            heading="Zoning Overview"
            rows={[
              ["Zoning Jurisdiction", z.jurisdiction],
              ["Zoning Contact", z.contact],
              ["Zoning Process", z.process],
              ["Zoning Fees", z.fees],
              ["Approval Timeframe", z.timeframe],
              ["Property Zoning District", z.district],
              ["Future Land Use", z.future_land_use],
              ["Meets Min. Lot Requirements?", z.meets_min_lot],
            ]}
          />
          <SiteHawkInfoTable
            heading="Tower Specifics"
            rows={[
              ["LDC Section Reference(s)", z.ldc_reference],
              ["Maximum Tower Height", z.max_height],
              ["Stealth Required?", z.stealth],
              ["Required Collocations (#)", z.collocations],
              ["Residential Separation", z.residential_separation],
              ["Tower Separation", z.tower_separation],
              ["Fall Zone Requirements", z.fall_zone],
            ]}
          />
          {z.notes && <SiteHawkInfoTable heading="Zoning Notes" rows={[["Notes", z.notes]]} />}
        </HawkScipSection>
      )}
    </div>
  );
}