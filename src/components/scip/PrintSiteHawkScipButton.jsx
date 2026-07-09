import { useState } from "react";
import { Printer, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { loadPublicConfig } from "@/lib/publicConfig";
import { base44 } from "@/api/base44Client";
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

// Maps a saved ScipRecord into the branded SiteHawkScipDoc `record` shape and
// renders the SAME print modal used by Generate SCIP — so a saved SCIP prints on
// the exact template you designed. Static maps are rebuilt as Mapbox Static
// Images so they always print. `scipId` loads the record; `scip` passes it in.
export default function PrintSiteHawkScipButton({ scipId, scip, variant = "toolbar" }) {
  const [open, setOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [record, setRecord] = useState(null);

  const build = async () => {
    setBuilding(true);
    try {
      const s = scip || (await base44.entities.ScipRecord.get(scipId));
      if (!s) throw new Error("SCIP record not found");

      const cfg = await loadPublicConfig();
      const token = cfg.mapboxAccessToken;
      const srcLat = Number(s.latitude), srcLon = Number(s.longitude);
      const radius = parseFloat(s.search_radius) || 1.0;
      const idx = s.active_target_index || 0;
      const rawA = (s.parcel_targets || [])[idx] || {};
      const targetA = { ...rawA, latitude: Number(rawA.latitude ?? srcLat), longitude: Number(rawA.longitude ?? srcLon) };

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

      const zr = s.zoning_report || {};
      const rec = {
        site_name: s.site_name || "Search Ring",
        agent_name: s.agent_name,
        generated_at: s.created_date || new Date().toISOString(),
        latitude: srcLat,
        longitude: srcLon,
        radius_miles: radius,
        tower_height_ft: s.sarf_height,
        county: s.county || "",
        state: s.state || "",
        sarf_map: s.map_image_url || buildSarfMap(srcLat, srcLon, radius, token, targetA),
        targetA: { label: "Target A", ...targetA },
        maps,
        zoning: {
          jurisdiction: s.zoning_jurisdiction,
          district: zr.district || targetA.zoning_classification,
          future_land_use: zr.future_land_use,
          process: zr.process,
          fees: zr.fees,
          timeframe: zr.timeframe,
          max_height: zr.max_height,
          stealth: zr.stealth,
          collocations: zr.collocations,
          residential_separation: zr.residential_separation,
          tower_separation: zr.tower_separation,
          fall_zone: zr.fall_zone,
          ldc_reference: zr.ldc_reference,
          meets_min_lot: zr.meets_min_lot,
          contact: zr.contact,
          notes: zr.notes,
        },
        conditions: {
          flood_zone: s.existing_conditions?.flood_zone || targetA.fema_risk_factor,
          wetlands: s.existing_conditions?.wetland_concerns,
          airport: airport ? `${airport.name || airport.callnumber} — ${Number(airport.distance_miles).toFixed(2)} mi` : "",
          cell_tower: towerForMap ? `${Number(towerForMap.distance_miles).toFixed(2)} mi` : "",
        },
      };
      setRecord(rec);
      setOpen(true);
    } catch (err) {
      console.error(err);
      toast.error("Could not build the SCIP. Open the SCIP and regenerate its maps.");
    } finally {
      setBuilding(false);
    }
  };

  const handlePrint = () => { ensurePrintStyles(); window.print(); };

  const triggerClass = variant === "link"
    ? "inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
    : "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-white disabled:opacity-50 border";

  return (
    <>
      <button
        onClick={build}
        disabled={building}
        title="Print this SCIP on the SiteHawk-branded template"
        className={triggerClass}
        style={variant === "toolbar" ? { borderColor: "#2563A0", color: "#2563A0", borderWidth: 1.5 } : undefined}
      >
        {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
        <span className={variant === "toolbar" ? "hidden sm:inline" : ""}>{building ? "Building…" : "Print SCIP"}</span>
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