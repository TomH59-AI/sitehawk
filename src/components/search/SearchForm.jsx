import { useState } from "react";
import { Search, MapPin, Crosshair, Locate } from "lucide-react";
import { lookupRealieProperty } from "@/functions/lookupRealieProperty";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RADIUS_OPTIONS } from "./constants";
import RichnessBadge from "./RichnessBadge";

export default function SearchForm({ onSearch, isLoading, disabled }) {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [agentName, setAgentName] = useState("");
  const [ringName, setRingName] = useState("");
  const [towerHeight, setTowerHeight] = useState("");
  const [radius, setRadius] = useState(0.5);
  const [compound, setCompound] = useState("100x100");
  const [county, setCounty] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [addressQuery, setAddressQuery] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveMsg, setResolveMsg] = useState(null); // { ok, text }

  // Resolve an address or parcel ID to coordinates via Realie.
  const handleResolveAddress = async () => {
    const q = addressQuery.trim();
    if (!q) return;
    const st = stateCode.trim().toUpperCase();
    if (!st) {
      setResolveMsg({ ok: false, text: "Enter the State (below) so Realie knows where to look." });
      return;
    }
    // Heuristic: entries with a space are addresses; compact IDs are parcel IDs.
    const isParcelId = !q.includes(" ");
    if (isParcelId && !county.trim()) {
      setResolveMsg({ ok: false, text: "Parcel ID lookups also need the County (below)." });
      return;
    }
    setResolving(true);
    setResolveMsg(null);
    try {
      const payload = isParcelId
        ? { parcelId: q, state: st, county: county.trim() }
        : { address: q, state: st, ...(county.trim() ? { county: county.trim() } : {}) };
      const { data } = await lookupRealieProperty(payload);
      const t = data?.target;
      if (t?.latitude != null && t?.longitude != null) {
        setLat(Number(t.latitude).toFixed(6));
        setLon(Number(t.longitude).toFixed(6));
        setResolveMsg({ ok: true, text: `Found: ${t.address || q} → ${Number(t.latitude).toFixed(5)}, ${Number(t.longitude).toFixed(5)}` });
      } else {
        setResolveMsg({ ok: false, text: "Property found but no coordinates returned." });
      }
    } catch (err) {
      const msg = err?.response?.data?.error || "No property found for that query.";
      setResolveMsg({ ok: false, text: msg });
    } finally {
      setResolving(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    if (isNaN(latitude) || isNaN(longitude)) return;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;
    onSearch(latitude, longitude, {
      agent_name: agentName,
      ring_name: ringName,
      tower_height_ft: parseFloat(towerHeight) || 150,
      radius_miles: radius,
      compound_size: compound,
      county: county.trim(),
      state: stateCode.trim(),
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
        {/* Agent + Ring Name row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div data-coach="sarf-name">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Your Name</label>
            <Input
              type="text"
              placeholder="e.g. Nikola Tesla"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="bg-secondary border-border text-white caret-white placeholder:text-white/50"
            />
          </div>
          <div data-coach="sarf-ring">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Ring Name <span className="text-destructive">*</span></label>
            <Input
              type="text"
              placeholder="e.g. Site A — Tampa I-75"
              value={ringName}
              onChange={(e) => setRingName(e.target.value)}
              className="bg-secondary border-border text-white caret-white placeholder:text-white/50"
              required
            />
          </div>
        </div>

        {/* Tower Height row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tower Height (ft AGL)</label>
            <Input
              type="number"
              step="1"
              min="10"
              max="2000"
              placeholder="e.g. 150"
              value={towerHeight}
              onChange={(e) => setTowerHeight(e.target.value)}
              className="bg-secondary border-border text-white caret-white placeholder:text-white/50"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Address or Parcel ID <span className="text-muted-foreground/60">(optional — finds coordinates)</span>
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="e.g. 123 Main St, Tampa — or APN"
                value={addressQuery}
                onChange={(e) => setAddressQuery(e.target.value)}
                className="bg-secondary border-border text-white caret-white placeholder:text-white/50"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleResolveAddress}
                disabled={!addressQuery.trim() || resolving}
                className="gap-1.5 shrink-0"
                title="Look up coordinates via Realie"
              >
                {resolving ? (
                  <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                ) : (
                  <Locate className="w-4 h-4" />
                )}
                Find
              </Button>
            </div>
            {resolveMsg && (
              <p className={`text-[11px] mt-1 ${resolveMsg.ok ? "text-emerald-500" : "text-destructive"}`}>
                {resolveMsg.text}
              </p>
            )}
          </div>
        </div>

        {/* Radius + Compound row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div data-coach="sarf-radius">
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
          <div data-coach="sarf-compound">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Compound Dimensions</label>
            <div className="inline-flex rounded-lg overflow-hidden border border-border w-full">
              {["50x50", "75x75", "100x100"].map((opt) => (
                <button
                  type="button"
                  key={opt}
                  onClick={() => setCompound(opt)}
                  className={`flex-1 px-3 py-2 text-xs font-semibold transition-all ${
                    compound === opt
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/70"
                  }`}
                >
                  {opt.replace("x", "'×")}'
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* County + State row (optional — helps narrow geocoding) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">County <span className="text-muted-foreground/60">(optional)</span></label>
            <Input
              type="text"
              placeholder="e.g. Hillsborough"
              value={county}
              onChange={(e) => setCounty(e.target.value)}
              className="bg-secondary border-border text-white caret-white placeholder:text-white/50"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">State <span className="text-muted-foreground/60">(optional)</span></label>
            <Input
              type="text"
              placeholder="e.g. FL"
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value)}
              className="bg-secondary border-border text-white caret-white placeholder:text-white/50"
            />
          </div>
        </div>

        {/* S.A.I.R. richness gate — shown when both county + state are filled */}
        {county.trim() && stateCode.trim() && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Data richness:</span>
            <RichnessBadge state={stateCode.trim().toUpperCase()} county={county.trim()} />
          </div>
        )}

        {/* Coordinates row */}
        <div data-coach="sarf-coords" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Latitude</label>
            <Input
              type="number"
              step="any"
              placeholder="e.g. 33.4484"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="bg-secondary border-border text-white caret-white placeholder:text-white/50"
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
              className="bg-secondary border-border text-white caret-white placeholder:text-white/50"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            data-coach="sarf-scan"
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