/**
 * HawkElectricServiceMap — Standalone "Electric Service" map for Target A.
 *
 * A "Create Electric Map" button renders a Mapbox GL satellite map centered on
 * the Target A tower location, plots the potential electric connection point
 * (nearest electric provider from the ElectricProvider directory), draws a line
 * from the tower to the provider, and lists the company's pertinent contact
 * info (name, type, phone, website, address) below the map so the user can call
 * or apply for commercial service.
 *
 * Data: electricProviderContact backend function (ElectricProvider directory),
 * matched by owner_name (when known) with a coordinate/state fallback.
 * Engine + ring math mirror HawkUtilitiesIntelligence exactly.
 */

import { useEffect, useRef, useState } from "react";
import { Zap, Sparkles, Loader2, Phone, Globe, MapPin, Building2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { loadPublicConfig } from "@/lib/publicConfig";
import { electricProviderContact } from "@/functions/electricProviderContact";

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
const SAT_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

function distMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

function renderMap(container, tgtLat, tgtLon, provider, token) {
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container, style: SAT_STYLE, center: [tgtLon, tgtLat], zoom: 12, preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

  const hasProvider = provider && Number.isFinite(provider.latitude) && Number.isFinite(provider.longitude);

  return new Promise((resolve) => {
    map.on("load", () => {
      // Connection line: tower → provider
      if (hasProvider) {
        const line = {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [[tgtLon, tgtLat], [provider.longitude, provider.latitude]] },
          properties: {},
        };
        map.addSource("hesm-line", { type: "geojson", data: line });
        map.addLayer({
          id: "hesm-line-casing",
          type: "line",
          source: "hesm-line",
          paint: { "line-color": "#000", "line-width": 5, "line-opacity": 0.5 },
        });
        map.addLayer({
          id: "hesm-line",
          type: "line",
          source: "hesm-line",
          paint: { "line-color": "#fde047", "line-width": 2.5, "line-dasharray": [2, 1.5] },
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

      // Electric provider connection-point marker
      if (hasProvider) {
        const pEl = document.createElement("div");
        pEl.style.cssText = `
          width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
          background: rgba(15,23,42,0.92); border: 2px solid #facc15; border-radius: 8px;
          box-shadow: 0 0 0 2px rgba(250,204,21,0.4), 0 0 12px rgba(250,204,21,0.7);
          font-size: 15px;
        `;
        pEl.textContent = "⚡";
        new window.mapboxgl.Marker({ element: pEl, anchor: "center" })
          .setLngLat([provider.longitude, provider.latitude])
          .setPopup(new window.mapboxgl.Popup({ offset: 18 }).setHTML(
            `<div style="font-family:monospace;font-size:11px;max-width:220px;">
              <strong>${provider.name || "Electric Provider"}</strong><br/>
              ${provider.type || ""}<br/>
              ${provider.phone ? "📞 " + provider.phone + "<br/>" : ""}
              ${provider.address || ""}
            </div>`
          ))
          .addTo(map);

        // Fit both points
        const b = new window.mapboxgl.LngLatBounds();
        b.extend([tgtLon, tgtLat]);
        b.extend([provider.longitude, provider.latitude]);
        map.fitBounds(b, { padding: 90, duration: 0, maxZoom: 13 });
      }

      resolve(map);
    });
  });
}

function InfoRow({ icon: Icon, label, value, href }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/60 last:border-0">
      <Icon className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary break-words hover:underline">
            {value || "—"}
          </a>
        ) : (
          <div className="text-sm font-semibold text-foreground break-words">{value || "—"}</div>
        )}
      </div>
    </div>
  );
}

export default function HawkElectricServiceMap({ targetA }) {
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [provider, setProvider] = useState(null);
  const [distance, setDistance] = useState(null);
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
      <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-heading font-bold text-amber-900 dark:text-amber-200 text-sm">Electric Service Map</div>
          <div className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
            Run Hawk Parcel Details first to resolve Target A — the Electric Service Map centers on the Target A tower location.
          </div>
        </div>
      </div>
    );
  }

  const tgtLat = Number(targetA.latitude);
  const tgtLon = Number(targetA.longitude);
  const state = targetA.state || targetA.zoning_jurisdiction?.match(/,\s*([A-Z]{2})/)?.[1] || undefined;

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

      const res = await electricProviderContact({
        lat: tgtLat,
        lon: tgtLon,
        state,
        owner_name: targetA.power_utility || undefined,
      });
      const match = res.data?.match || null;
      setProvider(match);

      let dist = null;
      if (match && Number.isFinite(match.latitude) && Number.isFinite(match.longitude)) {
        dist = match.distance_miles ?? parseFloat(distMiles(tgtLat, tgtLon, match.latitude, match.longitude).toFixed(2));
      }
      setDistance(dist);

      await ensureMapboxLoaded();
      mapInstance.current?.remove?.();
      mapInstance.current = null;
      await new Promise((r) => requestAnimationFrame(r));

      mapInstance.current = await renderMap(mapRef.current, tgtLat, tgtLon, match, token);
      setGenerated(true);

      if (!match) toast.warning("No electric provider found in the directory for this area.");
      else toast.success("Electric Service Map generated.");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to create Electric Map.");
    } finally {
      setLoading(false);
    }
  }

  const ownerLabel = targetA.owner || targetA.parcel_address || `${tgtLat.toFixed(6)}, ${tgtLon.toFixed(6)}`;

  return (
    <div className="space-y-4">
      {/* Control banner */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-gradient-to-r from-amber-600 to-yellow-600 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · ELECTRIC SERVICE</div>
              <h2 className="font-heading font-bold text-lg leading-tight">Electric Service Map — Target A Connection Point</h2>
              <div className="text-[11px] font-mono opacity-90 mt-0.5">Target A · {ownerLabel}</div>
            </div>
          </div>
          <Button onClick={handleGenerate} disabled={loading} className="bg-white text-amber-700 hover:bg-amber-50 font-semibold shadow">
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> {generated ? "Recreate Electric Map" : "Create Electric Map"}</>
            )}
          </Button>
        </div>
      </div>

      {/* Map + contact card on the SAME print page */}
      <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ pageBreakInside: "avoid", breakInside: "avoid" }}>
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap rounded-t-xl">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-300" />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] text-amber-300/80">SCIP · ELECTRIC CONNECTION POINT</div>
              <h3 className="font-heading font-bold text-lg leading-tight">Hawk Electric Service Map</h3>
            </div>
          </div>
          {generated && distance != null && (
            <div className="text-xs font-mono text-amber-100">{distance} mi to provider</div>
          )}
        </div>

        <div className="relative w-full bg-card border-x border-border" style={{ height: 560 }}>
          <div ref={mapRef} className="absolute inset-0" />
          {!generated && (
            <div className="absolute inset-0 flex items-center justify-center text-center px-6">
              <div className="text-sm text-muted-foreground">
                Click <span className="font-semibold text-foreground">Create Electric Map</span> to plot the Target A
                tower and its nearest electric provider connection point.
              </div>
            </div>
          )}
        </div>

        {/* Contact card */}
        <div className="border border-border border-t-0 rounded-b-xl overflow-hidden">
          <div className="bg-slate-100 dark:bg-slate-800/40 px-4 py-2 border-b border-border">
            <div className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground">SCIP · ELECTRIC PROVIDER CONTACT</div>
            <div className="font-heading font-bold text-sm">Call or apply for commercial service</div>
          </div>
          <div className="p-4">
            {generated && provider ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                <InfoRow icon={Building2} label="Company" value={provider.name} />
                <InfoRow icon={Zap} label="Utility Type" value={provider.type} />
                <InfoRow icon={Phone} label="Phone" value={provider.phone} href={provider.phone ? `tel:${provider.phone.replace(/[^\d+]/g, "")}` : null} />
                <InfoRow icon={Globe} label="Website" value={provider.website} href={provider.website || null} />
                <InfoRow icon={MapPin} label="Address" value={provider.address} />
                <InfoRow icon={MapPin} label="County / Distance" value={[provider.county, distance != null ? `${distance} mi away` : null].filter(Boolean).join(" · ")} />
              </div>
            ) : (
              <div className="text-center text-sm text-muted-foreground italic py-3">
                {generated ? "No electric provider found in the directory for this area." : "Generate the map to see the electric provider contact details."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}