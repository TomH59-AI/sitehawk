import { useState } from "react";
import { Search, MapPin, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const RADIUS_OPTIONS = [
  { value: 0.25, label: "0.25 mi" },
  { value: 0.5, label: "0.50 mi" },
  { value: 1.0, label: "1.0 mi" },
];

export default function SearchForm({ onSearch, isLoading, disabled }) {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [agentName, setAgentName] = useState("");
  const [towerHeight, setTowerHeight] = useState("199");
  const [radius, setRadius] = useState(0.5);
  const [compound, setCompound] = useState("100x100");

  const handleSubmit = (e) => {
    e.preventDefault();
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    if (isNaN(latitude) || isNaN(longitude)) return;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;
    onSearch(latitude, longitude, {
      agent_name: agentName,
      tower_height_ft: parseFloat(towerHeight) || 199,
      radius_miles: radius,
      compound_size: compound,
    });
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
          <h2 className="font-heading font-semibold text-foreground">Site Parameters</h2>
          <p className="text-xs text-muted-foreground">Tell SiteHawk what you're looking for, then drop your SARF center.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Agent + Tower Specs row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Your Name</label>
            <Input
              type="text"
              placeholder="e.g. Tom Hodges"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tower Height (ft AGL)</label>
            <Input
              type="number"
              step="1"
              placeholder="e.g. 199"
              value={towerHeight}
              onChange={(e) => setTowerHeight(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>
        </div>

        {/* Radius + Compound row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Search Radius</label>
            <div className="inline-flex rounded-lg overflow-hidden border border-border w-full">
              {RADIUS_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setRadius(opt.value)}
                  className={`flex-1 px-3 py-2 text-xs font-semibold transition-all ${
                    radius === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/70"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Compound Dimensions</label>
            <Input
              type="text"
              placeholder="e.g. 100x100 or 10,000 SF"
              value={compound}
              onChange={(e) => setCompound(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>
        </div>

        {/* Coordinates row */}
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
            {isLoading ? "Scanning..." : `Scan ${radius} mi Area`}
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