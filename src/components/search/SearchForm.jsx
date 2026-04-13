import { useState } from "react";
import { Search, MapPin, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SearchForm({ onSearch, isLoading, disabled }) {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    if (isNaN(latitude) || isNaN(longitude)) return;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;
    onSearch(latitude, longitude);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLon(pos.coords.longitude.toFixed(6));
      },
      () => {}
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <MapPin className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-heading font-semibold text-foreground">Enter Coordinates</h2>
          <p className="text-xs text-muted-foreground">Search 0.5-mile radius for buildable parcels</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Latitude</label>
            <Input
              type="number"
              step="any"
              placeholder="e.g. 33.4484"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Longitude</label>
            <Input
              type="number"
              step="any"
              placeholder="e.g. -112.0740"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="submit"
            disabled={!lat || !lon || isLoading || disabled}
            className="flex-1 gap-2 font-heading font-semibold"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            {isLoading ? "Scanning..." : "Scan Area"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleUseMyLocation}
            className="gap-2"
          >
            <Crosshair className="w-4 h-4" />
            Use My Location
          </Button>
        </div>
      </form>
    </div>
  );
}