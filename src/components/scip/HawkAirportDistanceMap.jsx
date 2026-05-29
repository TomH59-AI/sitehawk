/**
 * HawkAirportDistanceMap — Standalone "Airport Distance" map for Target A.
 *
 * A "Create Airport Map" button renders a Mapbox GL satellite map centered on
 * the Target A tower, finds the nearest airport from the imported Airport
 * directory (76k US airports) via nearestAirportFromDirectory, marks it with a
 * small plane icon, draws a connection line, and shows a sidebar/card with the
 * airport call letters, type, name, coordinates, and the distance in miles + feet.
 *
 * Engine + marker conventions mirror HawkElectricServiceMap exactly.
 */

import { useEffect, useRef, useState } from "react";
import { Plane, Sparkles, Loader2, Hash, MapPin, Ruler, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { loadPublicConfig } from "@/lib/publicConfig";
import { nearestAirportFromDirectory } from "@/functions/nearestAirportFromDirectory";

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
const SAT_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

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

function renderMap(container, tgtLat, tgtLon, airport, token) {
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container, style: SAT_STYLE, center: [tgtLon, tgtLat], zoom: 12, preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

  const hasAirport = airport && Number.isFinite(airport.latitude) && Number.isFinite(airport.longitude);

  return new Promise((resolve) => {
    map.on("load", () => {
      // Connection line: tower → airport
      if (hasAirport) {
        const line = {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [[tgtLon, tgtLat], [airport.longitude, airport.latitude]] },
          properties: {},
        };
        map.addSource("hadm-line", { type: "geojson", data: line });
        map.addLayer({
          id: "hadm-line-casing",
          type: "line",
          source: "hadm-line",
          paint: { "line-color": "#000", "line-width": 5, "line-opacity": 0.5 },
        });
        map.addLayer({
          id: "hadm-line",
          type: "line",
          source: "hadm-line",
          paint: { "line-color": "#38bdf8", "line-width": 2.5, "line-dasharray": [2, 1.5] },
        });
      }

      // Target A tower marker
      const tgtEl = document.createElement("div");
      tgtEl.style.cssText = `
        width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
        background: rgba(15,23,42,0.92); border: 2px solid #f97316; border-radius: 50%;
        box-shadow: 0 0 0 2px rgba(249,115,22,0.5), 0 0 14px rgba(249,115,22,0.8);
        font-size: 16px;
      `;
      tgtEl.textContent = "📡";
      new window.mapboxgl.Marker({ element: tgtEl, anchor: "center" })
        .setLngLat([tgtLon, tgtLat])
        .setPopup(new window.mapboxgl.Popup({ offset: 22 }).setHTML(
          `<div style="font-family:monospace;font-size:11px;"><strong>TARGET A — TOWER</strong><br/>${tgtLat.toFixed(6)}, ${tgtLon.toFixed(6)}</div>`
        ))
        .addTo(map);

      // Nearest airport — small plane icon
      if (hasAirport) {
        const aEl = document.createElement("div");
        aEl.style.cssText = `
          width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
          background: rgba(15,23,42,0.92); border: 2px solid #38bdf8; border-radius: 50%;
          box-shadow: 0 0 0 2px rgba(56,189,248,0.4), 0 0 12px rgba(56,189,248,0.7);
          font-size: 15px;
        `;
        aEl.textContent = "✈️";
        new window.mapboxgl.Marker({ element: aEl, anchor: "center" })
          .setLngLat([airport.longitude, airport.latitude])
          .setPopup(new window.mapboxgl.Popup({ offset: 18 }).setHTML(
            `<div style="font-family:monospace;font-size:11px;max-width:220px;">
              <strong>${airport.callnumber || "Airport"}</strong><br/>
              ${airport.name || ""}<br/>
              ${airport.type || ""}<br/>
              ${airport.distance_miles} mi / ${airport.distance_feet?.toLocaleString()} ft
            </div>`
          ))
          .addTo(map);

        const b = new window.mapboxgl.LngLatBounds();
        b.extend([tgtLon, tgtLat]);
        b.extend([airport.longitude, airport.latitude]);
        map.fitBounds(b, { padding: 90, duration: 0, maxZoom: 13 });
      }

      resolve(map);
    });
  });
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/60 last:border-0">
      <Icon className="w-4 h-4 text-sky-600 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold text-foreground break-words">{value || "—"}</div>
      </div>
    </div>
  );
}

const TYPE_LABELS = {
  small_airport: "Small Airport",
  medium_airport: "Medium Airport",
  large_airport: "Large Airport",
  heliport: "Heliport",
  seaplane_base: "Seaplane Base",
  balloonport: "Balloonport",
  closed: "Closed",
};

export default function HawkAirportDistanceMap({ targetA }) {
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [airport, setAirport] = useState(null);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);

  useEffect(() => {
    return () => {
      mapInstance.current?.remove?.();
      mapInstance.current = null;
    };
  }, []);

  if (!targetA || !Number.isFinite(Number(targetA.latitude)) || !Number.isFinite(Number(targetA.longitude))) {
    return (
      <div className="rounded-xl border border-sky-500/40 bg-sky-50 dark:bg-sky-950/20 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-heading font-bold text-sky-900 dark:text-sky-200 text-sm">Airport Distance Map</div>
          <div className="text-sm text-sky-800 dark:text-sky-300 mt-0.5">
            Run Hawk Parcel Details first to resolve Target A — the Airport Distance Map centers on the Target A tower location.
          </div>
        </div>
      </div>
    );
  }

  const tgtLat = Number(targetA.latitude);
  const tgtLon = Number(targetA.longitude);

  async function handleGenerate() {
    setLoading(true);
    try {
      const cfg = await loadPublicConfig();
      const token = cfg.mapboxAccessToken;
      if (!token) {
        toast.error("Mapbox token unavailable.");
        setLoading(false);
        return;
      }

      const res = await nearestAirportFromDirectory({ lat: tgtLat, lon: tgtLon });
      const match = res.data?.match || null;
      setAirport(match);

      await ensureMapboxLoaded();
      mapInstance.current?.remove?.();
      mapInstance.current = null;
      await new Promise((r) => requestAnimationFrame(r));

      mapInstance.current = await renderMap(mapRef.current, tgtLat, tgtLon, match, token);
      setGenerated(true);

      if (!match) toast.warning("No airport found near this location.");
      else toast.success("Airport Distance Map generated.");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to create Airport Map.");
    } finally {
      setLoading(false);
    }
  }

  const ownerLabel = targetA.owner || targetA.parcel_address || `${tgtLat.toFixed(6)}, ${tgtLon.toFixed(6)}`;
  const typeLabel = airport ? (TYPE_LABELS[airport.type] || airport.type) : null;

  return (
    <div className="space-y-4">
      {/* Control banner */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-gradient-to-r from-sky-600 to-cyan-600 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Plane className="w-5 h-5" />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · AIRPORT DISTANCE</div>
              <h2 className="font-heading font-bold text-lg leading-tight">Airport Distance Map — Nearest Airport to Target A</h2>
              <div className="text-[11px] font-mono opacity-90 mt-0.5">Target A · {ownerLabel}</div>
            </div>
          </div>
          <Button onClick={handleGenerate} disabled={loading} className="bg-white text-sky-700 hover:bg-sky-50 font-semibold shadow">
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> {generated ? "Recreate Airport Map" : "Create Airport Map"}</>
            )}
          </Button>
        </div>
      </div>

      {/* Map + airport card on the SAME print page */}
      <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ pageBreakInside: "avoid", breakInside: "avoid" }}>
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap rounded-t-xl">
          <div className="flex items-center gap-2">
            <Plane className="w-5 h-5 text-sky-300" />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] text-sky-300/80">SCIP · NEAREST AIRPORT</div>
              <h3 className="font-heading font-bold text-lg leading-tight">Hawk Airport Distance Map</h3>
            </div>
          </div>
          {generated && airport && (
            <div className="text-xs font-mono text-sky-100">
              {airport.distance_miles} mi / {airport.distance_feet?.toLocaleString()} ft
            </div>
          )}
        </div>

        <div className="relative w-full bg-card border-x border-border" style={{ height: 560 }}>
          <div ref={mapRef} className="absolute inset-0" />
          {!generated && (
            <div className="absolute inset-0 flex items-center justify-center text-center px-6">
              <div className="text-sm text-muted-foreground">
                Click <span className="font-semibold text-foreground">Create Airport Map</span> to plot the Target A
                tower and the nearest airport with distance in miles and feet.
              </div>
            </div>
          )}
        </div>

        {/* Airport info card */}
        <div className="border border-border border-t-0 rounded-b-xl overflow-hidden">
          <div className="bg-slate-100 dark:bg-slate-800/40 px-4 py-2 border-b border-border">
            <div className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground">SCIP · NEAREST AIRPORT DETAILS</div>
            <div className="font-heading font-bold text-sm">FAA proximity — call letters &amp; pertinent info</div>
          </div>
          <div className="p-4">
            {generated && airport ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                <InfoRow icon={Hash} label="Call Letters" value={airport.callnumber} />
                <InfoRow icon={Plane} label="Airport Type" value={typeLabel} />
                <InfoRow icon={MapPin} label="Airport Name" value={airport.name} />
                <InfoRow icon={Ruler} label="Distance" value={`${airport.distance_miles} mi · ${airport.distance_feet?.toLocaleString()} ft (as the crow flies)`} />
                <InfoRow icon={MapPin} label="Coordinates" value={`${airport.latitude?.toFixed(6)}, ${airport.longitude?.toFixed(6)}`} />
              </div>
            ) : (
              <div className="text-center text-sm text-muted-foreground italic py-3">
                {generated ? "No airport found near this location." : "Generate the map to see the nearest airport details."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}