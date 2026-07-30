import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadPublicConfig } from "@/lib/publicConfig";

const COORD_RE = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/;

// Address / coordinate entry — drops the TalonFit waypoint on the map.
export default function ScoutAddressForm({ onWaypoint }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    setError(null);
    const m = q.match(COORD_RE);
    if (m) {
      onWaypoint({ lat: Number(m[1]), lon: Number(m[2]), label: `${m[1]}, ${m[2]}` });
      return;
    }
    setBusy(true);
    const { mapboxAccessToken } = await loadPublicConfig();
    const r = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?limit=1&country=us&access_token=${mapboxAccessToken}`
    );
    const data = await r.json();
    setBusy(false);
    const f = data?.features?.[0];
    if (!f) { setError("Couldn't find that address. Try coordinates instead."); return; }
    onWaypoint({ lat: f.center[1], lon: f.center[0], label: f.place_name });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Address, or coordinates (42.8158, -83.6109)"
        className="bg-secondary"
      />
      <Button type="submit" disabled={busy} className="gap-1.5">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        Drop waypoint
      </Button>
      {error && <p className="text-xs text-destructive sm:self-center">{error}</p>}
    </form>
  );
}