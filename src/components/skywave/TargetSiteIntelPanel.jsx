import { useEffect, useRef, useState } from "react";
import { zoneomicsTargetIntel } from "@/functions/zoneomicsTargetIntel";
import { ensureMapboxLoaded } from "@/lib/section6Proximity";
import { loadPublicConfig } from "@/lib/publicConfig";
import { normalizeZoneType } from "@/lib/zoningPalette";
import { Building2, Hammer, MapPinned, ChevronDown, Loader2, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";

const NEON = "#00FFCC";

// Color-coded badge palette for permitted land-use categories.
const USE_BADGES = {
  Residential: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Commercial: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  Industrial: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  Agricultural: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Mixed Use": "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "Public / Institutional": "bg-slate-400/15 text-slate-300 border-slate-400/30",
  "Overlay / Special": "bg-cyan-500/15 text-cyan-200 border-cyan-500/30",
};

function badgeClass(use) {
  return USE_BADGES[normalizeZoneType(use)] || USE_BADGES["Overlay / Special"];
}

function ringFeature(lat, lon, radiusMi = 0.12, steps = 64) {
  const coords = [];
  const latR = radiusMi / 69.0;
  const lonR = radiusMi / (69.0 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    coords.push([lon + lonR * Math.cos(t), lat + latR * Math.sin(t)]);
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: {} };
}

function Accordion({ icon, title, defaultOpen, children }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-b border-white/10">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold text-white/90">{icon} {title}</span>
        <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function PanelBody({ loading, intel }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white/60">
        <Loader2 className="w-6 h-6 animate-spin mb-3" />
        <span className="text-sm">Querying Zoneomics intelligence…</span>
      </div>
    );
  }
  if (!intel) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-24 px-8 text-white/50">
        <MapPinned className="w-10 h-10 mb-4 text-white/30" />
        <p className="text-sm leading-relaxed">Select a Target Site to view zoning intelligence.</p>
      </div>
    );
  }
  const z = intel.zoning || {};
  const controls = intel.controls || [];
  const plu = intel.plu || [];
  return (
    <div>
      {/* TAB 1 — Zoning Summary */}
      <Accordion icon={<Building2 className="w-4 h-4" style={{ color: NEON }} />} title="Zoning Summary" defaultOpen>
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1">Zoning Code</div>
          <div className="text-3xl font-bold tracking-tight" style={{ color: NEON }}>{z.zone_code || "—"}</div>
          <div className="text-lg font-semibold text-white mt-2 leading-snug">{z.zone_name || "Unknown district"}</div>
          {z.zone_type && (
            <div className="inline-block mt-2 text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/10 text-white/70">
              {z.zone_type}
            </div>
          )}
          {z.guide && <p className="text-xs text-white/50 mt-3 leading-relaxed line-clamp-4">{z.guide}</p>}
          {z.link && (
            <a href={z.link} target="_blank" rel="noopener noreferrer" className="inline-block mt-3 text-xs font-medium" style={{ color: NEON }}>
              View ordinance →
            </a>
          )}
        </div>
      </Accordion>

      {/* TAB 2 — Building Controls */}
      <Accordion icon={<Hammer className="w-4 h-4" style={{ color: NEON }} />} title="Building Controls">
        {controls.length ? (
          <div className="grid grid-cols-2 gap-3">
            {controls.map((c) => (
              <div key={c.label} className="rounded-lg bg-white/5 border border-white/10 p-3">
                <div className="text-[10px] uppercase tracking-wider text-white/40">{c.label}</div>
                <div className="text-base font-bold text-white mt-1">{c.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-white/40">No building-control data exposed for this district.</p>
        )}
      </Accordion>

      {/* TAB 3 — Permitted Land Uses */}
      <Accordion icon={<MapPinned className="w-4 h-4" style={{ color: NEON }} />} title="Permitted Land Uses">
        {plu.length ? (
          <div className="flex flex-wrap gap-2">
            {plu.map((u, i) => (
              <span key={i} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${badgeClass(u)}`}>{u}</span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-white/40">No permitted land-use list exposed for this district.</p>
        )}
      </Accordion>
    </div>
  );
}

export default function TargetSiteIntelPanel({ lat, lon, label }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const [intel, setIntel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const hasTarget = Number.isFinite(Number(lat)) && Number.isFinite(Number(lon));

  // Init map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await loadPublicConfig();
      if (cancelled || !ref.current) return;
      await ensureMapboxLoaded();
      if (cancelled || !ref.current) return;
      window.mapboxgl.accessToken = cfg.mapboxAccessToken;
      const center = hasTarget ? [Number(lon), Number(lat)] : [-98.5, 39.5];
      const map = new window.mapboxgl.Map({
        container: ref.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center,
        zoom: hasTarget ? 15 : 3.5,
        preserveDrawingBuffer: true,
      });
      mapRef.current = map;
      map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
      map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");
      requestAnimationFrame(() => requestAnimationFrame(() => { try { map.resize(); } catch { /* disposed */ } }));
    })();
    return () => { cancelled = true; mapRef.current?.remove?.(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize the map whenever the panel collapses/expands.
  useEffect(() => {
    const t = setTimeout(() => { try { mapRef.current?.resize(); } catch { /* noop */ } }, 320);
    return () => clearTimeout(t);
  }, [collapsed]);

  // When Target A changes: flyTo, drop the animated pulse + neon outline, fetch intel.
  useEffect(() => {
    if (!hasTarget) return;
    const map = mapRef.current;
    const tLat = Number(lat), tLon = Number(lon);

    const apply = () => {
      if (!map) return;
      map.flyTo({ center: [tLon, tLat], zoom: 16, speed: 0.9, curve: 1.4, essential: true });

      // Neon teal zone outline (circular footprint highlight around Target A).
      const ring = ringFeature(tLat, tLon);
      if (map.getSource("ta-zone")) map.getSource("ta-zone").setData(ring);
      else {
        map.addSource("ta-zone", { type: "geojson", data: ring });
        map.addLayer({ id: "ta-zone-fill", type: "fill", source: "ta-zone", paint: { "fill-color": NEON, "fill-opacity": 0.08 } });
        map.addLayer({ id: "ta-zone-line", type: "line", source: "ta-zone", paint: { "line-color": NEON, "line-width": 4, "line-blur": 0.4 } });
      }

      // Animated pulse marker for Target A.
      if (!mapRef.current.__pulseEl) {
        const el = document.createElement("div");
        el.className = "ta-pulse";
        el.innerHTML = `<span class="ta-pulse-core"></span><span class="ta-pulse-ring"></span>`;
        mapRef.current.__pulseEl = el;
        mapRef.current.__pulseMarker = new window.mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([tLon, tLat]).addTo(map);
      } else {
        mapRef.current.__pulseMarker.setLngLat([tLon, tLat]);
      }
    };

    if (map?.isStyleLoaded?.()) apply();
    else map?.once?.("load", apply);

    // Fetch Zoneomics intel for this point.
    let cancelled = false;
    setLoading(true);
    setCollapsed(false);
    zoneomicsTargetIntel({ lat: tLat, lng: tLon })
      .then((res) => { if (!cancelled) setIntel(res.data?.ok ? res.data : null); })
      .catch(() => { if (!cancelled) setIntel(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-white/10" style={{ height: 620 }}>
      {/* Pulse marker styles */}
      <style>{`
        .ta-pulse { position: relative; width: 22px; height: 22px; }
        .ta-pulse-core { position:absolute; inset:6px; background:${NEON}; border-radius:50%; box-shadow:0 0 10px ${NEON}; }
        .ta-pulse-ring { position:absolute; inset:0; border:2px solid ${NEON}; border-radius:50%; animation: taPulse 1.8s ease-out infinite; }
        @keyframes taPulse { 0% { transform: scale(0.5); opacity:0.9; } 100% { transform: scale(2.4); opacity:0; } }
      `}</style>

      {/* Right — full Mapbox view */}
      <div ref={ref} className="absolute inset-0 bg-[#0B1220]" />

      {/* Desktop collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="hidden md:flex absolute top-3 z-20 items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0F172A]/90 border border-white/10 text-white/80 text-xs backdrop-blur transition-all"
        style={{ left: collapsed ? 12 : 412 }}
      >
        {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        {collapsed ? "Intel" : "Hide"}
      </button>

      {/* Left — desktop sliding panel */}
      <div
        className="hidden md:flex flex-col absolute top-0 left-0 h-full bg-[#0B1220]/95 backdrop-blur-xl border-r border-white/10 z-10 transition-transform duration-300"
        style={{ width: 400, transform: collapsed ? "translateX(-100%)" : "translateX(0)" }}
      >
        <div className="px-5 py-4 border-b border-white/10">
          <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: NEON }}>Target Site Intelligence</div>
          <div className="text-white font-bold text-lg mt-0.5">{label || "Target A"}</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <PanelBody loading={loading} intel={intel} />
        </div>
      </div>

      {/* Mobile — bottom sheet drawer */}
      <div className="md:hidden absolute inset-x-0 bottom-0 z-10 max-h-[70%] flex flex-col bg-[#0B1220]/97 backdrop-blur-xl border-t border-white/10 rounded-t-2xl">
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <div className="mx-auto w-10 h-1 rounded-full bg-white/20 absolute left-1/2 -translate-x-1/2 top-2" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em]" style={{ color: NEON }}>Target Site Intelligence</div>
            <div className="text-white font-bold mt-0.5">{label || "Target A"}</div>
          </div>
          {intel && <button onClick={() => setIntel(null)} className="text-white/50"><X className="w-5 h-5" /></button>}
        </div>
        <div className="flex-1 overflow-y-auto">
          <PanelBody loading={loading} intel={intel} />
        </div>
      </div>
    </div>
  );
}