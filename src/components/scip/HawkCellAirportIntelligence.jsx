/**
 * HawkCellAirportIntelligence — One-click Generate button that produces two
 * dedicated print pages in parallel via Promise.allSettled, mirroring the
 * exact structure and conventions of HawkUtilitiesIntelligence:
 *
 *   MAP 1 — Hawk Cell Tower Map (satellite + Target A waypoint + nearest
 *                                FCC-registered tower pin + crow-flies line +
 *                                printable "Nearest Cell Tower" table)
 *   MAP 2 — Hawk Airport Map    (satellite + Target A waypoint + nearest
 *                                airport pin + crow-flies line + printable
 *                                "Nearest Airport" table)
 *
 * Engine: Mapbox GL JS v3.6.0 loaded via CDN. These maps are "nearest
 * result" lookups — they do NOT use 0.5/1.0 mi radius rings. Each map
 * auto-fits a bbox enclosing Target A and the returned result point.
 */

import { useEffect, useRef, useState } from "react";
import { RadioTower, Plane, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { loadPublicConfig } from "@/lib/publicConfig";
import { cellTowerLookup } from "@/functions/cellTowerLookup";
import { nearestAirport } from "@/functions/nearestAirport";

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
const SAT_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

// ────────────── Mapbox GL JS loader (idempotent, matches Utilities) ──────────────
let mapboxLoadingPromise = null;
async function ensureMapboxLoaded() {
  if (window.mapboxgl) return;
  if (!mapboxLoadingPromise) {
    mapboxLoadingPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = MAPBOX_CSS;
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = MAPBOX_JS;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  await mapboxLoadingPromise;
}

// ────────────── shared decorator: Target A pin + result pin + crow-flies line ──────────────
function decorateNearestBase(map, tgtLat, tgtLon, resultLat, resultLon, lineFeature, accent) {
  // Target A waypoint (SARF-style, same as Utilities)
  const tgtEl = document.createElement("div");
  tgtEl.style.cssText = `
    width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
    background: rgba(15,23,42,0.92); border: 2px solid #f97316; border-radius: 50%;
    box-shadow: 0 0 0 2px rgba(249,115,22,0.5), 0 0 14px rgba(249,115,22,0.8);
    font-family: ui-monospace, monospace; font-weight: 700; color: #f97316; font-size: 16px;
  `;
  tgtEl.textContent = "📡";
  new window.mapboxgl.Marker({ element: tgtEl, anchor: "center" })
    .setLngLat([tgtLon, tgtLat])
    .setPopup(
      new window.mapboxgl.Popup({ offset: 22 }).setHTML(
        `<div style="font-family:monospace;font-size:11px;"><strong>TARGET A</strong><br/>${tgtLat.toFixed(6)}, ${tgtLon.toFixed(6)}</div>`
      )
    )
    .addTo(map);

  if (Number.isFinite(resultLat) && Number.isFinite(resultLon)) {
    // Result pin (cell tower or airport)
    const resEl = document.createElement("div");
    resEl.style.cssText = `
      width: 26px; height: 26px; border-radius: 50%;
      background: ${accent}; border: 3px solid #fff;
      box-shadow: 0 0 0 2px ${accent}, 0 0 12px ${accent}aa;
    `;
    new window.mapboxgl.Marker({ element: resEl, anchor: "center" })
      .setLngLat([resultLon, resultLat])
      .setPopup(
        new window.mapboxgl.Popup({ offset: 18 }).setHTML(
          `<div style="font-family:monospace;font-size:11px;"><strong>NEAREST RESULT</strong><br/>${resultLat.toFixed(6)}, ${resultLon.toFixed(6)}</div>`
        )
      )
      .addTo(map);

    // Crow-flies line — prefer the Feature returned by the backend; fall back
    // to a synthesized LineString between Target A and the result point.
    const line = lineFeature && lineFeature.geometry
      ? lineFeature
      : {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [[tgtLon, tgtLat], [resultLon, resultLat]],
          },
          properties: {},
        };

    map.addSource("hca-line", { type: "geojson", data: line });
    // White outline casing
    map.addLayer({
      id: "hca-line-casing",
      type: "line",
      source: "hca-line",
      paint: { "line-color": "#ffffff", "line-width": 5, "line-opacity": 0.85 },
    });
    // Accent inner stroke
    map.addLayer({
      id: "hca-line-inner",
      type: "line",
      source: "hca-line",
      paint: { "line-color": accent, "line-width": 2.5, "line-opacity": 1 },
    });

    // Fit bounds to enclose both points with 60px padding.
    const bounds = new window.mapboxgl.LngLatBounds(
      [Math.min(tgtLon, resultLon), Math.min(tgtLat, resultLat)],
      [Math.max(tgtLon, resultLon), Math.max(tgtLat, resultLat)]
    );
    map.fitBounds(bounds, { padding: 60, duration: 0, maxZoom: 14 });
  } else {
    map.flyTo({ center: [tgtLon, tgtLat], zoom: 12, duration: 0 });
  }
}

// ────────────── individual map renderers ──────────────
async function renderCellMap(container, tgtLat, tgtLon, towerData, towerLine, token) {
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container, style: SAT_STYLE, center: [tgtLon, tgtLat], zoom: 12, preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

  return new Promise((resolve) => {
    map.on("load", () => {
      const resLat = Number(towerData?.latitude_deg);
      const resLon = Number(towerData?.longitude_deg);
      decorateNearestBase(map, tgtLat, tgtLon, resLat, resLon, towerLine, "#fbbf24");
      resolve(map);
    });
  });
}

async function renderAirportMap(container, tgtLat, tgtLon, airportData, airportLine, token) {
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container, style: SAT_STYLE, center: [tgtLon, tgtLat], zoom: 11, preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

  return new Promise((resolve) => {
    map.on("load", () => {
      const resLat = Number(airportData?.latitude_deg ?? airportData?.lat);
      const resLon = Number(airportData?.longitude_deg ?? airportData?.lon);
      decorateNearestBase(map, tgtLat, tgtLon, resLat, resLon, airportLine, "#60a5fa");
      resolve(map);
    });
  });
}

// ────────────── Map page wrapper (matches Utilities) ──────────────
function MapPage({ title, icon: Icon, statBlock, mapRef, height = 620 }) {
  return (
    <>
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap rounded-t-xl">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-amber-300" />}
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] text-amber-300/80">
              SCIP · HAWK CELL &amp; AIRPORT INTELLIGENCE
            </div>
            <h3 className="font-heading font-bold text-lg leading-tight">{title}</h3>
          </div>
        </div>
        {statBlock && <div className="text-xs font-mono text-amber-100">{statBlock}</div>}
      </div>
      <div className="relative w-full bg-card border-x border-border" style={{ height }}>
        <div ref={mapRef} className="absolute inset-0" />
      </div>
    </>
  );
}

// ────────────── compact print-friendly tables ──────────────
function dash(v) {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s === "" ? "—" : s;
}

function CellTowerTable({ tower, note }) {
  const distance = tower?.distance_miles != null
    ? `${Number(tower.distance_miles).toFixed(2)}`
    : null;
  return (
    <div className="border border-border border-t-0 rounded-b-xl overflow-hidden">
      <div className="bg-slate-100 dark:bg-slate-800/40 px-4 py-2 border-b border-border">
        <div className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground">SCIP · CELL TOWER</div>
        <div className="font-heading font-bold text-sm">Nearest Cell Tower</div>
      </div>
      {tower ? (
        <table className="w-full text-xs">
          <tbody>
            {[
              ["Call Letters", dash(tower.call_letters)],
              ["Licensee (Owner)", dash(tower.licensee)],
              ["Latitude", tower.latitude_deg != null ? Number(tower.latitude_deg).toFixed(6) : "—"],
              ["Longitude", tower.longitude_deg != null ? Number(tower.longitude_deg).toFixed(6) : "—"],
              ["Distance (mi)", dash(distance)],
              ["Structure Type", dash(tower.structure_type)],
            ].map(([k, v], i) => (
              <tr key={k} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                <td className="px-3 py-1.5 border-t border-border font-medium w-[200px]">{k}</td>
                <td className="px-3 py-1.5 border-t border-border font-mono">{v}</td>
              </tr>
            ))}
            {tower.fcc_url && (
              <tr className="bg-background">
                <td className="px-3 py-1.5 border-t border-border font-medium">FCC Record</td>
                <td className="px-3 py-1.5 border-t border-border">
                  <a
                    href={tower.fcc_url}
                    target="_blank"
                    rel="noopener"
                    className="text-amber-700 dark:text-amber-300 underline font-mono text-[11px]"
                  >
                    {tower.fcc_url}
                  </a>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      ) : (
        <div className="px-3 py-3 text-center text-muted-foreground italic">
          {note || "No nearby cell tower data returned"}
        </div>
      )}
    </div>
  );
}

function AirportTable({ airport, note }) {
  const distance = airport?.distance_miles != null
    ? `${Number(airport.distance_miles).toFixed(2)}`
    : null;
  const callNumber = airport?.airport_callnumber
    || airport?.icao
    || airport?.iata
    || airport?.name
    || null;
  const lat = airport?.latitude_deg ?? airport?.lat;
  const lon = airport?.longitude_deg ?? airport?.lon;
  return (
    <div className="border border-border border-t-0 rounded-b-xl overflow-hidden">
      <div className="bg-slate-100 dark:bg-slate-800/40 px-4 py-2 border-b border-border">
        <div className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground">SCIP · AIRPORT</div>
        <div className="font-heading font-bold text-sm">Nearest Airport</div>
      </div>
      {airport ? (
        <table className="w-full text-xs">
          <tbody>
            {[
              ["Call Letters", dash(callNumber)],
              ["Type", dash(airport.airport_type)],
              ["Latitude", lat != null ? Number(lat).toFixed(6) : "—"],
              ["Longitude", lon != null ? Number(lon).toFixed(6) : "—"],
              ["Distance (mi)", dash(distance)],
            ].map(([k, v], i) => (
              <tr key={k} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                <td className="px-3 py-1.5 border-t border-border font-medium w-[200px]">{k}</td>
                <td className="px-3 py-1.5 border-t border-border font-mono">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="px-3 py-3 text-center text-muted-foreground italic">
          {note || "No nearby airport data returned"}
        </div>
      )}
    </div>
  );
}

// ────────────── main component ──────────────
export default function HawkCellAirportIntelligence({ srcLat, srcLon, targetA }) {
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const [tower, setTower] = useState(null);
  const [towerLine, setTowerLine] = useState(null);
  const [towerNote, setTowerNote] = useState(null);
  const [airport, setAirport] = useState(null);
  const [airportLine, setAirportLine] = useState(null);
  const [airportNote, setAirportNote] = useState(null);

  const cellRef = useRef(null);
  const airportRef = useRef(null);
  const mapsRef = useRef({ cell: null, airport: null });

  useEffect(() => {
    return () => {
      Object.values(mapsRef.current).forEach((m) => m?.remove?.());
      mapsRef.current = { cell: null, airport: null };
    };
  }, []);

  // Placeholder card when Target A is not yet resolved.
  if (!targetA || !Number.isFinite(Number(targetA.latitude)) || !Number.isFinite(Number(targetA.longitude))) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-heading font-bold text-amber-900 dark:text-amber-200 text-sm">
            Hawk Cell Tower &amp; Airport Intelligence
          </div>
          <div className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
            Run Hawk Parcel Details first to resolve Target A — Cell Tower &amp; Airport Intelligence center on the chosen Target A parcel centroid.
          </div>
        </div>
      </div>
    );
  }

  const tgtLat = Number(targetA.latitude);
  const tgtLon = Number(targetA.longitude);

  async function handleGenerate() {
    setLoading(true);

    // Non-blocking optional log
    try {
      await base44.entities.SearchLog?.create?.({
        radius_miles: null,
        lat: tgtLat,
        lon: tgtLon,
        kind: "cell_airport",
      });
    } catch {
      /* TODO: wire to Supabase search_logs once entity/function exists */
    }

    try {
      const cfg = await loadPublicConfig();
      const token = cfg.mapboxAccessToken;
      if (!token) {
        toast.error("Mapbox token unavailable.");
        setLoading(false);
        return;
      }
      await ensureMapboxLoaded();

      Object.values(mapsRef.current).forEach((m) => m?.remove?.());
      mapsRef.current = { cell: null, airport: null };

      await new Promise((r) => requestAnimationFrame(r));

      const [cellRes, airRes] = await Promise.allSettled([
        cellTowerLookup({ lat: tgtLat, lon: tgtLon }),
        nearestAirport({ lat: tgtLat, lon: tgtLon }),
      ]);

      // ── Cell tower ──
      let nextTower = null;
      let nextTowerLine = null;
      if (cellRes.status === "fulfilled" && cellRes.value?.data) {
        const d = cellRes.value.data;
        nextTower = d.nearest_tower || null;
        nextTowerLine =
          d.tower_line
          || (nextTower?.line_geojson
                ? { type: "Feature", geometry: nextTower.line_geojson, properties: {} }
                : null);
        if (!nextTower) setTowerNote("No nearby cell tower data returned");
      } else if (cellRes.status === "rejected") {
        toast.error("Cell tower lookup failed — rendering best-effort.");
        setTowerNote("No nearby cell tower data returned");
      }
      setTower(nextTower);
      setTowerLine(nextTowerLine);

      // ── Airport ──
      let nextAirport = null;
      let nextAirportLine = null;
      if (airRes.status === "fulfilled" && airRes.value?.data) {
        const d = airRes.value.data;
        // Empty body means no airport found.
        if (d && (d.airport_callnumber || d.latitude_deg != null || d.lat != null)) {
          nextAirport = d;
          nextAirportLine =
            d.airport_line
            || (d.line_geojson
                  ? { type: "Feature", geometry: d.line_geojson, properties: {} }
                  : null);
        } else {
          setAirportNote("No nearby airport data returned");
        }
      } else if (airRes.status === "rejected") {
        toast.error("Airport lookup failed — rendering best-effort.");
        setAirportNote("No nearby airport data returned");
      }
      setAirport(nextAirport);
      setAirportLine(nextAirportLine);

      // ── Render both maps in parallel ──
      const [cellMap, airportMap] = await Promise.all([
        renderCellMap(cellRef.current, tgtLat, tgtLon, nextTower, nextTowerLine, token),
        renderAirportMap(airportRef.current, tgtLat, tgtLon, nextAirport, nextAirportLine, token),
      ]);
      mapsRef.current = { cell: cellMap, airport: airportMap };

      setGenerated(true);
      toast.success("Hawk Cell Tower & Airport Intelligence generated 2 map pages.");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Hawk Cell Tower & Airport Intelligence failed.");
    } finally {
      setLoading(false);
    }
  }

  const cellStat = generated && tower?.distance_miles != null
    ? `${Number(tower.distance_miles).toFixed(2)} mi as the crow flies`
    : null;

  const airportStat = generated && airport?.distance_miles != null
    ? `${Number(airport.distance_miles).toFixed(2)} mi as the crow flies`
    : null;

  const ownerLabel = targetA.owner || targetA.parcel_address || `${tgtLat.toFixed(6)}, ${tgtLon.toFixed(6)}`;

  return (
    <div className="space-y-4">
      {/* Control banner */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-gradient-to-r from-amber-600 to-orange-700 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <RadioTower className="w-5 h-5" />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · CELL &amp; AIRPORT INTELLIGENCE</div>
              <h2 className="font-heading font-bold text-lg leading-tight">Hawk Cell Tower &amp; Airport Intelligence</h2>
              <div className="text-[11px] font-mono opacity-90 mt-0.5">
                Target A · {ownerLabel}
              </div>
            </div>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="bg-white text-orange-700 hover:bg-orange-50 font-semibold shadow"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> {generated ? "Regenerate" : "Generate with Hawk Cell & Airport Intelligence"}</>
            )}
          </Button>
        </div>
      </div>

      {/* Cell Tower section — map + table on the SAME print page */}
      <div
        className="rounded-xl border border-border bg-card overflow-hidden"
        style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
      >
        <MapPage
          title="Hawk Cell Tower Intelligence — Nearest FCC-Registered Tower"
          icon={RadioTower}
          statBlock={cellStat}
          mapRef={cellRef}
        />
        <CellTowerTable tower={tower} note={towerNote} />
      </div>

      {/* Airport section — map + table on the SAME print page */}
      <div
        className="rounded-xl border border-border bg-card overflow-hidden"
        style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
      >
        <MapPage
          title="Hawk Airport Intelligence — Nearest Airport"
          icon={Plane}
          statBlock={airportStat}
          mapRef={airportRef}
        />
        <AirportTable airport={airport} note={airportNote} />
      </div>
    </div>
  );
}