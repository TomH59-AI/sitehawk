import { useState } from "react";
import { FileText, X, Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { loadPublicConfig } from "@/lib/publicConfig";
import { nearestAirportFromDirectory } from "@/functions/nearestAirportFromDirectory";
import { cellTowerLookup } from "@/functions/cellTowerLookup";
import SiteHawkScipDoc from "@/components/scip/sitehawk/SiteHawkScipDoc";
import {
  buildSarfMap, buildAerial, buildTopo, buildFema, buildZoning,
  buildWetlands, buildParcel, buildWind, buildAirport, buildCellTower,
} from "@/lib/sitehawkScipStatic";

const PRINT_STYLE_ID = "sitehawk-scip-print-styles";
function ensurePrintStyles() {
  if (document.getElementById(PRINT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    @media print {
      body * { visibility: hidden !important; }
      #sitehawk-scip-doc, #sitehawk-scip-doc * { visibility: visible !important; }
      #sitehawk-scip-doc { position: absolute; inset: 0; }
      #sitehawk-scip-doc .page { page-break-after: always; }
      @page { size: letter; margin: 0; }
    }
  `;
  document.head.appendChild(style);
}

// Assembles a printable SCIP record from the LIVE SiteSearch pipeline state and
// renders the SiteHawk-branded SCIP in a modal with a Print / Save-as-PDF button.
// All maps are regenerated as Mapbox Static Images so they always print.
export default function GenerateScipButton({
  searchCenter, searchParams, targetA, zoningResult, sectionData,
}) {
  const [open, setOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [record, setRecord] = useState(null);

  const ready = !!(searchCenter && targetA && Number.isFinite(Number(targetA.latitude)));

  const build = async () => {
    setBuilding(true);
    try {
      const cfg = await loadPublicConfig();
      const token = cfg.mapboxAccessToken;
      const srcLat = Number(searchCenter.lat), srcLon = Number(searchCenter.lon);
      const radius = searchParams.radius_miles;
      const bus = sectionData || {};
      const z = zoningResult?.zoning || {};

      // Nearest airport + cell tower for the two proximity maps (best-effort).
      const [airportRes, towerRes] = await Promise.all([
        nearestAirportFromDirectory({ lat: targetA.latitude, lon: targetA.longitude }).catch(() => null),
        cellTowerLookup({ lat: targetA.latitude, lon: targetA.longitude }).catch(() => null),
      ]);
      const airport = airportRes?.data?.match || null;
      const nt = towerRes?.data?.nearest_tower || null;
      const towerForMap = nt && nt.latitude_deg != null
        ? { latitude: nt.latitude_deg, longitude: nt.longitude_deg, distance_miles: nt.distance_miles }
        : null;

      const maps = {
        aerial: buildAerial(targetA, token),
        topo: buildTopo(targetA, token),
        fema: buildFema(targetA, token),
        zoning: buildZoning(targetA, token, cfg.zoneomicsApiKey),
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
        targetA: { label: "Target A", ...targetA },
        maps,
        zoning: {
          jurisdiction: z.jurisdiction || zoningResult?.zoning_jurisdiction,
          contact: z.contact,
          process: z.process,
          fees: z.fees,
          timeframe: z.timeframe,
          district: bus.zoneomicsDistrict?.zone_code || z.district || targetA.zoning_classification,
          future_land_use: z.future_land_use,
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
          wetlands: bus.wetlands?.present ? (bus.wetlands.type || "Wetlands present") : (bus.wetlands ? "None mapped" : ""),
          power_provider: bus.power?.name,
          fiber: bus.fiber?.count != null ? (bus.fiber.count > 0 ? "Yes" : "No") : "",
          telco_provider: bus.carriers?.telco?.name,
          airport: airport ? `${airport.name || airport.callnumber} — ${Number(airport.distance_miles).toFixed(2)} mi` : (bus.airport ? `${bus.airport.name} — ${Number(bus.airport.distance_miles).toFixed(2)} mi` : ""),
          cell_tower: bus.tower ? `${bus.tower.owner || "Cell site"} — ${Number(bus.tower.distance_miles).toFixed(2)} mi` : (towerForMap ? `${Number(towerForMap.distance_miles).toFixed(2)} mi` : ""),
          wind: bus.wind?.wind_speed_mph ? `${bus.wind.wind_speed_mph} mph${bus.wind.risk_level ? ` · ${bus.wind.risk_level}` : ""}` : "",
        },
      };
      setRecord(rec);
      setOpen(true);
    } catch (err) {
      console.error(err);
      toast.error("Could not build the SCIP. Try regenerating the pipeline maps.");
    } finally {
      setBuilding(false);
    }
  };

  const handlePrint = () => { ensurePrintStyles(); window.print(); };

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
        <div className="fixed inset-0 z-[100] bg-black/70 overflow-auto" onClick={() => setOpen(false)}>
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