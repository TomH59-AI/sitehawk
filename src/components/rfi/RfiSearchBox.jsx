import { useState } from "react";
import { Search, Loader2, MapPin } from "lucide-react";
import { loadPublicConfig } from "@/lib/publicConfig";
import { toast } from "sonner";

// Parse a raw "lat, lon" / "lat lon" string into [lon, lat]. Returns null if not coords.
function parseCoords(raw) {
  const m = String(raw).trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return [lon, lat];
}

// Address / coordinates search for Siting IQ™. Accepts either a
// raw "lat, lon" pair (jumps directly) or a place/address (Mapbox geocoding).
export default function RfiSearchBox({ onGoTo }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;

    // 1) Direct coordinates
    const coords = parseCoords(query);
    if (coords) {
      onGoTo(coords, `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`);
      return;
    }

    // 2) Geocode an address / place
    setBusy(true);
    try {
      const cfg = await loadPublicConfig();
      const token = cfg.mapboxAccessToken;
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&country=us&limit=1`;
      const res = await fetch(url);
      const data = await res.json();
      const feat = data?.features?.[0];
      if (!feat?.center) {
        toast.error("No match found for that address.");
        return;
      }
      onGoTo(feat.center, feat.place_name || query);
    } catch (err) {
      toast.error(err.message || "Address lookup failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[min(90vw,420px)]"
    >
      <div className="flex items-center gap-2 rounded-full bg-slate-900/90 shadow-lg border border-white/10 pl-3 pr-1 py-1 backdrop-blur">
        <MapPin className="w-4 h-4 text-white/50 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Address or coordinates (lat, lon)…"
          className="flex-1 bg-transparent text-white text-sm placeholder:text-white/40 outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 shrink-0"
          aria-label="Search"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </button>
      </div>
    </form>
  );
}