import { format } from "date-fns";
import { MapPin } from "lucide-react";
import { HAWK, CONFIDENTIAL_NOTICE } from "./hawkScipBrand";
import HawkScipSection, { HawkWatermark } from "./HawkScipSection";
import ScipZoningPage from "../skywave/ScipZoningPage";
import ScipParcelDataPage from "../skywave/ScipParcelDataPage";
import ScipHawkMapsPage from "../skywave/ScipHawkMapsPage";
import ScipPowerAirportPage from "../skywave/ScipPowerAirportPage";
import ScipExistingConditionsPage from "../skywave/ScipExistingConditionsPage";
import ScipViewshedPage from "../skywave/ScipViewshedPage";

const EXACT = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" };

function fmtDate(d) {
  try { return format(new Date(d + "T00:00:00"), "MMM d, yyyy"); } catch { return d || ""; }
}

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

export default function HawkScipPrintDoc({ record }) {
  const r = record || {};
  const lat = Number.isFinite(Number(r.latitude)) ? Number(r.latitude).toFixed(5) : "";
  const lon = Number.isFinite(Number(r.longitude)) ? Number(r.longitude).toFixed(5) : "";
  const radius = r.search_radius;
  const targetLabel = r.parcel_targets?.[r.active_target_index || 0]?.label || "Target A";
  let pageNo = 0;
  const next = () => (pageNo += 1);

  return (
    <div id="hawk-scip-doc" style={{ fontFamily: "Inter, Helvetica Neue, Arial, sans-serif" }}>

      {/* ─────────── COVER PAGE ─────────── */}
      <div className="page" style={{ position: "relative", width: "8.5in", minHeight: "11in", background: "#fff", display: "flex", flexDirection: "column" }}>
        <HawkWatermark />
        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Hero header with logo */}
          <div className="flex items-center gap-5" style={{ background: HAWK.dark, padding: "0.55in 0.5in", ...EXACT }}>
            <img src={HAWK.logo} alt="SiteHawk" style={{ height: 96 }} crossOrigin="anonymous" />
            <div>
              <div className="text-[12pt] uppercase font-bold" style={{ color: HAWK.gold, letterSpacing: 4 }}>SiteHawk</div>
              <div className="text-[26pt] font-bold text-white leading-tight">Site Candidate<br />Information Package</div>
              <div className="text-[10pt] mt-1" style={{ color: "#9FB0CC" }}>HAWK SCIP · Step 1 — Site Acquisition &amp; Search Ring</div>
            </div>
          </div>
          {/* Gold rule */}
          <div style={{ height: 6, background: HAWK.gold, ...EXACT }} />

          {/* Site summary card */}
          <div className="px-12 mt-10">
            <div className="rounded-xl p-6" style={{ border: `2px solid ${HAWK.navy}` }}>
              <div className="text-[9pt] font-bold uppercase tracking-[3px] mb-3" style={{ color: HAWK.blue }}>Prepared For</div>
              <div className="grid grid-cols-2 gap-x-10 gap-y-4">
                <Field label="Site Name" value={r.site_name} />
                <Field label="Submittal Date" value={fmtDate(r.submittal_date)} />
                <Field label="Agent" value={r.agent_name} />
                <Field label="Agent Phone" value={r.agent_phone} />
                <Field label="Coordinates" value={lat && lon ? `${lat}, ${lon}` : ""} />
                <Field label="Search Radius" value={radius ? `${radius} mi` : ""} />
                <Field label="County" value={r.county} />
                <Field label="State" value={(r.state || "").toUpperCase()} />
              </div>
            </div>
          </div>

          {/* Confidentiality notice block — the "scare off copiers" piece */}
          <div className="px-12 mt-auto mb-10">
            <div className="rounded-lg p-5" style={{ background: HAWK.dark, ...EXACT }}>
              <div className="text-[10pt] font-bold uppercase tracking-[2px] mb-2" style={{ color: HAWK.gold }}>
                ⚠ Confidential &amp; Proprietary
              </div>
              <p className="text-[8.5pt] leading-relaxed" style={{ color: "#D5DDEC" }}>{CONFIDENTIAL_NOTICE}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────── SARF MAP ─────────── */}
      <HawkScipSection
        kicker="SCIP · Section 1"
        title="SARF MAP"
        right={`${r.site_name || ""} · ${lat}, ${lon} · ${radius} mi`}
        page={next()}
        footerNote="Basemap © Mapbox · © OpenStreetMap. Center waypoint with the selected search-radius circle."
      >
        <div className="rounded-lg overflow-hidden" style={{ height: "8.0in", border: `2px solid ${HAWK.blue}` }}>
          {r.map_image_url ? (
            <img src={r.map_image_url} alt="SARF Map" style={{ width: "100%", height: "100%", objectFit: "cover" }} crossOrigin="anonymous" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ background: HAWK.bg, color: HAWK.muted }}>
              <MapPin className="w-8 h-8" />
              <span className="text-[10pt] text-center px-8">SARF map renders here — center waypoint with the search-radius circle.</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-6 mt-3 text-[9pt]">
          <div className="flex items-center gap-2">
            <span style={{ width: 13, height: 13, borderRadius: "50%", background: HAWK.gold, border: `2px solid ${HAWK.navy}`, ...EXACT }} />
            <span style={{ color: HAWK.ink }}>Site Center</span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ width: 13, height: 13, borderRadius: "50%", background: "rgba(27,63,174,0.10)", border: `2px solid ${HAWK.blue}`, ...EXACT }} />
            <span style={{ color: HAWK.ink }}>Search Radius — {radius} mi</span>
          </div>
        </div>
      </HawkScipSection>

      {/* ─────────── ZONING & PERMITTING ─────────── */}
      {r.zoning_report && Object.keys(r.zoning_report).length > 0 && (
        <HawkScipSection
          kicker="SCIP · Section 2"
          title="ZONING & PERMITTING"
          right={r.zoning_jurisdiction || "Jurisdiction"}
          page={next()}
          footerNote="Zoneomics-primary zoning district & land use · Municode tower specs · curated jurisdiction contacts, fees & timeframes. Field verification recommended before submittal."
        >
          <ScipZoningPage report={r.zoning_report} />
        </HawkScipSection>
      )}

      {/* ─────────── HAWK PARCEL DATA ─────────── */}
      {Array.isArray(r.parcel_targets) && r.parcel_targets.length > 0 && (
        <HawkScipSection
          kicker="SCIP · Section 3"
          title="HAWK PARCEL DATA"
          right="3 candidate targets · ★ = SCIP focus"
          page={next()}
          footerNote={`Targets ranked from all parcels in the ${radius}-mi ring against no-residential, lot size, zoning class and FEMA flood risk. The starred target is the focus; the other two are held in reserve.`}
        >
          <ScipParcelDataPage targets={r.parcel_targets} activeIdx={r.active_target_index || 0} />
        </HawkScipSection>
      )}

      {/* ─────────── HAWK MAPS ─────────── */}
      {r.hawk_maps && (r.hawk_maps.aerial_url || r.hawk_maps.floodplain_url || r.hawk_maps.zoning_url || r.hawk_maps.topography_url) && (
        <HawkScipSection
          kicker="SCIP · Section 4"
          title="HAWK MAPS"
          right={targetLabel}
          page={next()}
          footerNote="Aerial & topography © Mapbox · Floodplain © FEMA NFHL · Zoning © Zoneomics. Context maps — field verification recommended."
        >
          <ScipHawkMapsPage hawkMaps={r.hawk_maps} />
        </HawkScipSection>
      )}

      {/* ─────────── POWER & AIRPORT ─────────── */}
      {r.power_airport_maps && (r.power_airport_maps.power || r.power_airport_maps.airport) && (
        <HawkScipSection
          kicker="SCIP · Section 5"
          title="POWER & AIRPORT"
          right={targetLabel}
          page={next()}
          footerNote="Electric provider & transmission-line context from the SiteHawk power dataset · airport from the US airport directory · basemap © Mapbox. Distances as the hawk flies."
        >
          <ScipPowerAirportPage data={r.power_airport_maps} />
        </HawkScipSection>
      )}

      {/* ─────────── EXISTING CONDITIONS ─────────── */}
      {r.existing_conditions && Object.keys(r.existing_conditions).length > 0 && (
        <HawkScipSection
          kicker="SCIP · Section 6"
          title="EXISTING CONDITIONS"
          right={targetLabel}
          page={next()}
          footerNote="FEMA NFHL flood zone · USFWS National Wetlands Inventory · nearest OSM police & fire · web-researched water management district, hazardous-waste status and access notes. Field verification recommended."
        >
          <ScipExistingConditionsPage conditions={r.existing_conditions} />
        </HawkScipSection>
      )}

      {/* ─────────── VIEWSHED ANALYSIS ─────────── */}
      {r.viewshed && Array.isArray(r.viewshed.directions) && r.viewshed.directions.length > 0 && (
        <HawkScipSection
          kicker="SCIP · Section 7"
          title="VIEWSHED ANALYSIS"
          right={`${targetLabel} · RF line-of-sight`}
          page={next()}
          footerNote={`Aerial ring centered on the ${targetLabel} tower waypoint. Each cardinal viewshed pairs a pitched 2D map with a USGS 3DEP elevation profile from the ${r.viewshed.tower_height_ft} ft antenna. Field verification recommended.`}
        >
          <ScipViewshedPage viewshed={r.viewshed} siteName={r.site_name} />
        </HawkScipSection>
      )}
    </div>
  );
}