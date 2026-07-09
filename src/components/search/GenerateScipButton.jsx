import { useState } from "react";
import { FileText, X, Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { loadPublicConfig } from "@/lib/publicConfig";
import { nearestAirportFromDirectory } from "@/functions/nearestAirportFromDirectory";
import { cellTowerLookup } from "@/functions/cellTowerLookup";
import { zoneomicsFlumDetails } from "@/functions/zoneomicsFlumDetails";
import { zoneResolve } from "@/functions/zoneResolve";
import { pointElevation } from "@/functions/pointElevation";
import { publicSafetyLookup } from "@/functions/publicSafetyLookup";
import { electricUtilityLookup } from "@/functions/electricUtilityLookup";
import { realieParcelsInRing } from "@/functions/realieParcelsInRing";
import SiteHawkScipDoc from "@/components/scip/sitehawk/SiteHawkScipDoc";
import {
  buildSarfMap, buildAerial, buildTopo, buildFema, buildZoning,
  buildWetlands, buildParcel, buildWind, buildAirport, buildCellTower, buildFlum,
} from "@/lib/sitehawkScipStatic";

// Pull City / State / Zip out of a US parcel address string. Handles the common
// "street, city, ST 12345" shape; falls back gracefully when a piece is missing.
function parseParcelAddress(addr) {
  const out = { parcel_city: "", parcel_zip: "" };
  if (!addr || typeof addr !== "string") return out;
  const zipMatch = addr.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch) out.parcel_zip = zipMatch[1];
  const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    // Second-to-last comma chunk is typically the city.
    const cityIdx = parts.length >= 3 ? parts.length - 2 : 1;
    out.parcel_city = (parts[cityIdx] || "").replace(/\b[A-Z]{2}\b.*$/, "").trim();
  }
  return out;
}

// "Taxes Paid-to-Date?" answer derived straight from the Realie v43 parcel
// record. Realie reports the annual tax + tax year; a reported, non-zero tax
// indicates the parcel is on the tax roll and assessed. Government / institutional
// owners legitimately return null (tax-exempt) — show that rather than blank.
function taxesPaidFromRealie(parcel) {
  if (!parcel) return "";
  const tax = parcel.annual_tax;
  const year = parcel.tax_year;
  if (tax != null && Number(tax) > 0) {
    return `Yes — $${Number(tax).toLocaleString()}${year ? ` (${year})` : ""}`;
  }
  if (tax === 0) return "Tax-exempt (no tax reported)";
  return "N/A — tax-exempt or not reported";
}

// "Meets minimum lot requirements?" → Conforming Size answer. A "yes" means the
// parcel conforms with a PE letter (per the standard SiteHawk zoning posture).
function conformingSizeFromZoning(meetsMinLot) {
  if (!meetsMinLot) return "";
  const v = String(meetsMinLot).toLowerCase();
  if (v.startsWith("y") || v.includes("meets") || v.includes("conform")) return "Yes (with a PE letter)";
  if (v.startsWith("n")) return "No";
  return meetsMinLot;
}

const PRINT_STYLE_ID = "sitehawk-scip-print-styles";
function ensurePrintStyles() {
  if (document.getElementById(PRINT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    @media print {
      html, body { width: 8.5in; height: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
      body * { visibility: hidden !important; }
      .no-print { display: none !important; }
      /* Un-trap the doc from the fixed, scroll-clipped preview overlay so
         EVERY page flows and breaks exactly on 8.5x11 boundaries. */
      .scip-print-overlay { position: static !important; inset: auto !important; overflow: visible !important; background: none !important; }
      .scip-print-overlay > div { display: block !important; padding: 0 !important; margin: 0 !important; min-height: 0 !important; }
      #sitehawk-scip-doc, #sitehawk-scip-doc * { visibility: visible !important; }
      #sitehawk-scip-doc {
        position: absolute;
        top: 0; left: 0;
        width: 8.5in;
        margin: 0;
      }
      #sitehawk-scip-doc .page {
        page-break-after: always;
        break-after: page;
        page-break-inside: avoid;
        break-inside: avoid;
        width: 8.5in !important;
        height: 11in !important;
        max-height: 11in !important;
        margin: 0 !important;
        box-shadow: none !important;
        overflow: hidden;
        box-sizing: border-box;
        transform: none !important;
      }
      #sitehawk-scip-doc .page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      @page { size: 8.5in 11in; margin: 0; }
    }
  `;
  document.head.appendChild(style);
}

// Assembles a printable SCIP record from the LIVE SiteSearch pipeline state and
// renders the SiteHawk-branded SCIP in a modal with a Print / Save-as-PDF button.
// All maps are regenerated as Mapbox Static Images so they always print.
export default function GenerateScipButton({
  searchCenter, searchParams, targetA, zoningResult, sectionData, onGenerated,
}) {
  const [open, setOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [record, setRecord] = useState(null);

  const ready = !!(searchCenter && targetA && Number.isFinite(Number(targetA.latitude)));

  // The HawkSCIP quota is spent at Run Zoning (Section 2), not here. SCIP
  // generation is free once the HawkSCIP has been spent — no paywall on this step.
  const build = () => buildScip();

  const buildScip = async () => {
    setBuilding(true);
    try {
      const cfg = await loadPublicConfig();
      const token = cfg.mapboxAccessToken;
      const srcLat = Number(searchCenter.lat), srcLon = Number(searchCenter.lon);
      const radius = searchParams.radius_miles;
      const bus = sectionData || {};
      // Prefer the full zoning set emitted onto the bus (carries every SCIP field);
      // fall back to the legacy zoningResult prop for older flows.
      const z = bus.zoning || zoningResult?.zoning || {};

      // ── OPPORTUNITY A — REUSE THE SHARED DATA BUS ─────────────────────────────
      // Section 4 already fetched airport / cell tower / wind / fiber / power /
      // FEMA / zoning into `sectionData`. Re-pulling them here wastes metered API
      // credits and risks map↔SCIP drift. We now check the bus FIRST and only hit
      // the network for values the bus is missing (e.g. user skipped Section 4).
      // [SCIP-REUSE] logs show exactly what was reused vs. fetched during testing.
      const reuseLog = { reused: [], fetched: [] };
      // The power provider is a TEXT-ONLY field (no map tile needs its coords),
      // and Section 4 already emits the serving utility onto the bus, so this is
      // a safe reuse: skip electricUtilityLookup when the bus already has it.
      const hasPowerBus = !!(bus.power_grid && bus.power_grid.serving_utility);
      console.log("[SCIP-REUSE] bus keys present:", Object.keys(bus));

      // Nearest airport + cell tower for the two proximity maps (best-effort).
      // FLUM is optional — only some jurisdictions have a Future Land Use layer.
      // Ground elevation (USGS 3DEP) + nearest police/fire (OSM) fill the
      // Project Information + Existing Conditions template fields.
      const [airportRes, towerRes, flumRes, fluResolveRes, elevRes, safetyRes, powerRes, parcelClickRes] = await Promise.all([
        // Airport is always fetched here: the SCIP map tile needs the airport's
        // lat/lon, which the bus `airport` value does NOT carry (name/distance/
        // type only). The conditions text still prefers bus.airport below.
        (reuseLog.fetched.push("airport"), nearestAirportFromDirectory({ lat: targetA.latitude, lon: targetA.longitude }).catch(() => null)),
        // Cell tower is always fetched here: the SCIP map tile needs the tower's
        // lat/lon, which the bus `tower` value does NOT carry (owner/distance/
        // height only). The conditions text still prefers bus.tower below.
        (reuseLog.fetched.push("celltower"), cellTowerLookup({ lat: targetA.latitude, lon: targetA.longitude }).catch(() => null)),
        zoneomicsFlumDetails({ lat: targetA.latitude, lng: targetA.longitude }).catch(() => null),
        zoneResolve({ lat: targetA.latitude, lon: targetA.longitude }).catch(() => null),
        pointElevation({ lat: targetA.latitude, lon: targetA.longitude }).catch(() => null),
        publicSafetyLookup({ lat: targetA.latitude, lon: targetA.longitude }).catch(() => null),
        hasPowerBus
          ? (reuseLog.reused.push("power"), Promise.resolve(null))
          : (reuseLog.fetched.push("power"), electricUtilityLookup({ lat: targetA.latitude, lon: targetA.longitude }).catch(() => null)),
        // Realie v43 click lookup (via the metered Supabase proxy) for Target A's
        // tax + parcel-city data used in the Site Information table.
        realieParcelsInRing({ mode: "click", lat: targetA.latitude, lon: targetA.longitude }).catch(() => null),
      ]);
      const airport = airportRes?.data?.match || null;
      // [SCIP-REUSE] Summary of which lookups were reused from the bus vs fetched.
      console.log("[SCIP-REUSE] reused from bus:", reuseLog.reused, "· fetched fresh:", reuseLog.fetched);
      // Target A's Realie parcel record (tax + city source).
      const realieParcel = parcelClickRes?.data?.parcels?.[0] || null;
      const groundElevationFt = elevRes?.data?.elevation_ft ?? null;
      const police = safetyRes?.data?.police || null;
      const fire = safetyRes?.data?.fire || null;
      // HIFLD electric retail service territory → power provider name + phone.
      // Prefer a fresh fetch; else reuse the serving utility Section 4 emitted
      // onto the bus (power_grid.serving_utility), else the legacy bus.power name.
      const powerUtil = powerRes?.data || null;
      const powerProvider = powerUtil?.utility_name
        ? `${powerUtil.utility_name}${powerUtil.telephone ? ` — ${powerUtil.telephone}` : ""}`
        : (hasPowerBus
            ? bus.power_grid.serving_utility
            : (bus.power?.name ? `${bus.power.name}${bus.power.phone ? ` — ${bus.power.phone}` : ""}` : ""));
      // Resolve a FLUM label + polygon (Zoneomics first, FL GeoPlan fallback).
      const zflum = flumRes?.data?.flum || null;
      const flu = fluResolveRes?.data?.flu || null;
      const flumLabel = [zflum?.code || flu?.code, zflum?.name || flu?.label].filter(Boolean).join(" — ");
      const fluFeature = flu?.geojson || null;
      const nt = towerRes?.data?.nearest_tower || null;
      const towerForMap = nt && nt.latitude_deg != null
        ? { latitude: nt.latitude_deg, longitude: nt.longitude_deg, distance_miles: nt.distance_miles }
        : null;

      const maps = {
        aerial: buildAerial(targetA, token),
        topo: buildTopo(targetA, token),
        fema: buildFema(targetA, token),
        zoning: buildZoning(targetA, token, cfg.zoneomicsApiKey),
        flum: (flumLabel || fluFeature) ? buildFlum(targetA, token, fluFeature) : null,
        wetlands: buildWetlands(targetA, token),
        parcel: buildParcel(targetA, token),
        wind: buildWind(targetA, token),
        airport: airport ? buildAirport(targetA, airport, token) : null,
        celltower: towerForMap ? buildCellTower(targetA, towerForMap, token) : null,
      };

      const rec = {
        site_name: searchParams.ring_name?.trim() || searchParams.agent_name?.trim() || "Search Ring",
        agent_name: searchParams.agent_name,
        generated_at: new Date().toISOString(),
        latitude: srcLat,
        longitude: srcLon,
        radius_miles: radius,
        tower_height_ft: searchParams.tower_height_ft,
        compound_size: searchParams.compound_size,
        county: targetA.county || z.county || "",
        state: targetA.state || z.state || "",
        sarf_map: buildSarfMap(srcLat, srcLon, radius, token, targetA),
        targetA: {
          ...targetA,
          // Use the live emitted label (Target A / B / C) — never hardcode A.
          label: targetA.label || "Target A",
          // Pull the resolved label out separately so it stamps the filename too.
          ground_elevation_ft: targetA.ground_elevation_ft ?? groundElevationFt,
          // Parse Parcel City / State / Zip out of the single parcel_address string
          // (e.g. "123 Main St, Karnes City, TX 78118"). County comes from the
          // resolved zoning/target county. Conforming size is derived from the
          // zoning "meets minimum lot" research — Yes (with a PE letter).
          // Parcel City/Zip — prefer the Realie v43 parcel address (cleaner situs),
          // fall back to parsing Target A's address string.
          ...parseParcelAddress(realieParcel?.parcel_address || targetA.parcel_address),
          parcel_county: targetA.county || targetA.parcel_county || z.county || "",
          conforming_size: conformingSizeFromZoning(z.meets_min_lot),
          // Taxes Paid-to-Date? — directly from the Realie tax assessment.
          taxes_paid: taxesPaidFromRealie(realieParcel),
        },
        maps,
        // Warranty Deed status + chain of title for Target A, straight from the
        // Realie v43 click record (deed type / doc # / book / transfers).
        deed: realieParcel ? {
          owner_name: realieParcel.owner_name || targetA.owner_name || "",
          deed_type: realieParcel.deed_type,
          deed_doc_num: realieParcel.deed_doc_num,
          deed_book: realieParcel.deed_book,
          ownership_start: realieParcel.ownership_start,
          last_sale_date: realieParcel.last_sale_date,
          last_sale_price: realieParcel.last_sale_price,
          legal_description: realieParcel.legal_description,
          transfers: realieParcel.transfers || [],
        } : null,
        // 2D directional viewshed (N/S/E/W) generated by the Section 4 pipeline
        // (scipViewshed) — printed as its own SCIP page when present.
        viewshed: bus.viewshed || null,
        // Power & fiber tie-in data for the Tower Siter Exhibit (final page).
        utilities: {
          power: bus.power_grid || (powerUtil?.utility_name ? { serving_utility: powerUtil.utility_name } : null),
          fiber: {
            count: bus.fiber?.count ?? null,
            telco: bus.carriers?.telco?.name || null,
            nearest_lit: (bus.carriers?.lit_buildings || [])
              .filter((b) => b.carrier)
              .sort((x, y) => (x.distance_int ?? Infinity) - (y.distance_int ?? Infinity))[0] || null,
          },
        },
        zoning: {
          jurisdiction: z.jurisdiction || zoningResult?.zoning_jurisdiction,
          contact: z.contact,
          process: z.process,
          fees: z.fees,
          timeframe: z.timeframe,
          district: bus.zoneomicsDistrict?.zone_code || z.district || targetA.zoning_classification,
          future_land_use: z.future_land_use,
          current_usage: z.current_usage,
          meets_min_lot: z.meets_min_lot,
          ldc_reference: z.ldc_reference,
          max_height: z.max_height,
          stealth: z.stealth,
          collocations: z.collocations,
          residential_separation: z.residential_separation,
          tower_separation: z.tower_separation,
          fall_zone: z.fall_zone,
          notes: z.notes,
        },
        conditions: {
          flood_zone: bus.fema?.flood_zone || targetA.fema_risk_factor,
          // Wetland Concerns? — explicit Yes/No from the compliance/wetlands lookup
          // on the bus. Append the NWI type when present for field usefulness.
          wetlands: bus.wetlands
            ? (bus.wetlands.present ? `Yes${bus.wetlands.type ? ` — ${bus.wetlands.type}` : ""}` : "No")
            : "",
          hazardous_waste: bus.hazwaste?.present
            ? `${bus.hazwaste.count} EPA cleanup site${bus.hazwaste.count !== 1 ? "s" : ""}${bus.hazwaste.npl_count ? ` (${bus.hazwaste.npl_count} Superfund/NPL)` : ""} within 0.5 mi`
            : (bus.hazwaste ? "None within 0.5 mi" : ""),
          power_provider: powerProvider,
          access_notes: bus.access_notes || targetA.access_notes || (targetA.boundaries ? `Parcel frontage/boundaries: ${targetA.boundaries}` : ""),
          fiber: bus.fiber?.count != null ? (bus.fiber.count > 0 ? "Yes" : "No") : "",
          telco_provider: bus.carriers?.telco?.name,
          airport: airport ? `${airport.name || airport.callnumber} — ${Number(airport.distance_miles).toFixed(2)} mi` : (bus.airport ? `${bus.airport.name} — ${Number(bus.airport.distance_miles).toFixed(2)} mi` : ""),
          cell_tower: bus.tower ? `${bus.tower.owner || "Cell site"} — ${Number(bus.tower.distance_miles).toFixed(2)} mi` : (towerForMap ? `${Number(towerForMap.distance_miles).toFixed(2)} mi` : ""),
          wind: bus.wind?.wind_speed_mph ? `${bus.wind.wind_speed_mph} mph${bus.wind.risk_level ? ` · ${bus.wind.risk_level}` : ""}` : "",
          water_management_district: bus.wetlands?.water_district || targetA.water_management_district || "",
          local_police: police ? `${police.name}${police.phone ? ` — ${police.phone}` : ""} (${Number(police.distance_miles).toFixed(1)} mi)` : "",
          local_fire: fire ? `${fire.name}${fire.phone ? ` — ${fire.phone}` : ""} (${Number(fire.distance_miles).toFixed(1)} mi)` : "",
        },
      };
      setRecord(rec);
      setOpen(true);
      // Notify the pipeline that a SCIP was successfully generated for THIS
      // target's label — Section 3 uses this to lock the ladder & advance.
      onGenerated?.(rec.targetA.label || "Target A");
    } catch (err) {
      console.error(err);
      toast.error("Could not build the SCIP. Try regenerating the pipeline maps.");
    } finally {
      setBuilding(false);
    }
  };

  // Build the spec'd filename: {SiteName}_{TargetLabel}_SCIP_{YYYYMMDD}.
  // Browsers use document.title as the default "Save as PDF" filename, so we
  // swap it in for the print and restore it afterward.
  const handlePrint = () => {
    ensurePrintStyles();
    const site = String(record?.site_name || "Site").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
    const label = String(record?.targetA?.label || "Target A").replace(/\s+/g, "-");
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const prevTitle = document.title;
    document.title = `${site}_${label}_SCIP_${ymd}`;
    const restore = () => { document.title = prevTitle; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  return (
    <>
      <button
        onClick={build}
        disabled={!ready || building}
        title={ready ? "Generate the SiteHawk SCIP from this pipeline" : "Complete Section 3 (Target A) first"}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: "#0C1B2E", color: "#FFC72C" }}
      >
        {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        {building ? "Building SCIP…" : "Generate SCIP"}
      </button>

      {open && record && (
        <div className="scip-print-overlay fixed inset-0 z-[100] bg-black/70 overflow-auto" onClick={() => setOpen(false)}>
          <div className="min-h-full flex flex-col items-center py-8 px-4" onClick={(e) => e.stopPropagation()}>
            <div className="no-print sticky top-0 z-10 w-full max-w-[8.5in] flex items-center justify-between gap-3 mb-4 px-4 py-3 rounded-lg" style={{ background: "#0C1B2E" }}>
              <span className="font-heading font-bold text-white">SiteHawk SCIP — Preview</span>
              <div className="flex items-center gap-2">
                <button onClick={handlePrint} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm" style={{ background: "#FFC72C", color: "#0C1B2E" }}>
                  <Printer className="w-4 h-4" /> Print / Save PDF
                </button>
                <button onClick={() => setOpen(false)} className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 text-white hover:bg-white/20">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="bg-white shadow-2xl">
              <SiteHawkScipDoc record={record} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}