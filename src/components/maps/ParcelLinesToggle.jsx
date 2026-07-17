import { useState } from "react";
import { Grid3X3, Loader2 } from "lucide-react";
import { setParcelLinesVisible } from "@/lib/regridParcelTiles";

/**
 * Floating "Parcel Lines" toggle for any Mapbox GL map.
 * Pass the live map via mapRef ({ current: mapboxgl.Map }).
 * Lazily loads the Regrid vector tile layer on first enable.
 */
export default function ParcelLinesToggle({ mapRef, className = "" }) {
  const [on, setOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const toggle = async () => {
    const map = mapRef?.current;
    if (!map || loading) return;
    const next = !on;
    setLoading(true);
    setError(false);
    try {
      await setParcelLinesVisible(map, next);
      setOn(next);
    } catch (e) {
      console.warn("Parcel lines layer failed:", e?.message || e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      title={error ? "Parcel lines unavailable" : "Toggle parcel boundaries"}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold shadow-lg backdrop-blur border transition-all ${
        on
          ? "bg-emerald-600 text-white border-emerald-500"
          : "bg-slate-900/85 text-white/80 border-white/15 hover:text-white"
      } ${className}`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Grid3X3 className="w-3.5 h-3.5" />}
      Parcel Lines
    </button>
  );
}