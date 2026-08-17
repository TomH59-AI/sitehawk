import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ensureMapboxLoaded } from "@/lib/mapboxLoader";
import { MapPin, Plus } from "lucide-react";

// Token is read here but ONLY assigned to mapboxgl.accessToken inside the
// "Open in TalonFit Map" click handler — never at module scope for mapboxgl,
// never in a useEffect.
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * TalonFitSection — the TalonFit panel embedded in the Site Search pipeline.
 *
 * Coordinate contract (single source of truth lives in the SiteSearch parent):
 *   - searchCoords: { lat: number, lng: number, radius: number } | null
 *       Read directly from props. No local copy, no useEffect mirror.
 *   - targets: Array<{ id, lat, lng, label, source: 'sitehawk' | 'user' }>
 *       Slots 0–2 are SiteHawk-located (read-only); slots 3–5 are user-added.
 *       The shared array in the parent is capped at 6 entries total.
 *   - addTarget(target): parent callback that appends a user target.
 *
 * Map contract: the Mapbox map is created ONLY by the "Open in TalonFit Map"
 * click handler. The map container div does not exist in the DOM until that
 * click (conditional render on mapOpen), so Mapbox cannot auto-attach.
 */
export default function TalonFitSection({ searchCoords = null, targets = [], addTarget }) {
  const [mapOpen, setMapOpen] = useState(false);
  const [mapError, setMapError] = useState("");
  const [newLat, setNewLat] = useState("");
  const [newLng, setNewLng] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  const coordsReady =
    !!searchCoords &&
    Number.isFinite(searchCoords.lat) &&
    Number.isFinite(searchCoords.lng);

  const userTargetCount = targets.filter((t) => t.source === "user").length;
  const addDisabled = userTargetCount >= 3;

  // The ONLY place new mapboxgl.Map() may be called. Clicking mounts the
  // container div (flushSync), loads GL JS, sets the token, and creates the
  // map exactly once (mapRef guard).
  const handleOpenMap = async () => {
    if (!coordsReady || mapRef.current) return;
    setMapError("");
    flushSync(() => setMapOpen(true));
    try {
      await ensureMapboxLoaded();
    } catch (e) {
      setMapError(e?.message || "Failed to load Mapbox GL JS");
      return;
    }
    if (mapRef.current || !mapContainerRef.current) return;
    const mapboxgl = window.mapboxgl;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [searchCoords.lng, searchCoords.lat],
      zoom: 13,
      pitch: 0,
      bearing: 0,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-left");
    map.on("load", () => {
      targets.forEach((t) => {
        new mapboxgl.Marker({ color: t.source === "sitehawk" ? "#06b6d4" : "#10b981" })
          .setLngLat([t.lng, t.lat])
          .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(t.label))
          .addTo(map);
      });
    });
    mapRef.current = map;
  };

  const handleAddTarget = () => {
    const lat = parseFloat(newLat);
    const lng = parseFloat(newLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    addTarget?.({
      id: `user-${Date.now()}`,
      lat,
      lng,
      label: newLabel.trim() || `User Target ${userTargetCount + 1}`,
      source: "user",
    });
    setNewLat("");
    setNewLng("");
    setNewLabel("");
  };

  return (
    <section id="talonfit-ai" className="flex h-screen max-h-screen flex-col space-y-4 overflow-hidden rounded-2xl border border-cyan-500/30 bg-card p-4 md:p-6 shadow-xl">
      <div>
        <div className="text-[10px] font-mono text-cyan-500 tracking-[0.3em] mb-0.5">TALONFIT™</div>
        <h2 className="font-heading font-bold text-xl text-foreground">TalonFit Search Coordinates</h2>
      </div>

      {/* Coordinate confirmation — read straight from the prop, no local copy */}
      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm font-mono">
        {coordsReady ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-foreground">
            <span>lat: {searchCoords.lat.toFixed(6)}</span>
            <span>lng: {searchCoords.lng.toFixed(6)}</span>
            <span>radius: {searchCoords.radius} mi</span>
          </div>
        ) : (
          <span className="text-muted-foreground">No search coordinates yet — run a SiteHawk search above.</span>
        )}
      </div>

      {/* Lazy map — button is greyed out until searchCoords exists; the map
          container div is NOT in the DOM until the button is clicked. */}
      <div className="flex min-h-0 flex-1 flex-col space-y-2">
        <button
          type="button"
          onClick={handleOpenMap}
          disabled={!coordsReady || mapOpen}
          className="inline-flex items-center gap-2 self-start rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
          title={coordsReady ? "Initialize the TalonFit map at the search coordinates" : "Run a search first to set coordinates"}
        >
          <MapPin className="h-4 w-4" />
          {mapOpen ? "TalonFit Map Open" : "Open in TalonFit Map"}
        </button>
        {mapError && <div className="text-xs text-red-400">{mapError}</div>}
        {mapOpen && <div ref={mapContainerRef} className="min-h-0 w-full flex-1 overflow-hidden rounded-xl border border-border" />}
      </div>

      {/* Target slots — 3 SiteHawk (read-only) + up to 3 user-added (6 max) */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Targets ({targets.length}/6)
        </div>
        {targets.length === 0 ? (
          <p className="text-xs text-muted-foreground">No targets yet — SiteHawk slots fill in from Section 3, or add your own below.</p>
        ) : (
          <ul className="space-y-1">
            {targets.map((t, i) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs"
              >
                <span
                  className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center font-bold text-white ${
                    t.source === "sitehawk" ? "bg-cyan-600" : "bg-emerald-600"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="font-medium text-foreground">{t.label}</span>
                <span className="font-mono text-muted-foreground">
                  {Number(t.lat).toFixed(6)}, {Number(t.lng).toFixed(6)}
                </span>
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t.source === "sitehawk" ? "SiteHawk · read-only" : "User"}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2 pt-1">
          <input
            type="number"
            step="0.000001"
            value={newLat}
            onChange={(e) => setNewLat(e.target.value)}
            placeholder="Latitude"
            className="w-32 rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          />
          <input
            type="number"
            step="0.000001"
            value={newLng}
            onChange={(e) => setNewLng(e.target.value)}
            placeholder="Longitude"
            className="w-32 rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          />
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label (optional)"
            className="w-36 rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          />
          <button
            type="button"
            onClick={handleAddTarget}
            disabled={addDisabled}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            title={addDisabled ? "3 user targets added — maximum reached" : "Add a manual target"}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Target
          </button>
          {addDisabled && (
            <span className="text-[11px] text-muted-foreground">3 user targets added (6 total max)</span>
          )}
        </div>
      </div>
    </section>
  );
}
