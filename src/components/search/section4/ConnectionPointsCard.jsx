import { useState } from "react";
import { Loader2, PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { targetAConnectionPoints } from "@/functions/targetAConnectionPoints";

const fmtLL = (p) => p ? `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}` : "—";

function Row({ label, value }) {
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-semibold text-foreground">{value ?? "—"}</span>
    </div>
  );
}

function PointCard({ emoji, title, pinColor, children, note }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: pinColor }} />
        {emoji} {title}
      </div>
      {children}
      {note && <div className="text-[11px] text-muted-foreground italic leading-snug">{note}</div>}
    </div>
  );
}

/**
 * ConnectionPointsCard — estimated fiber hookup, power tie-in, and access-road
 * entry for Target A, from OSM + EIA + HIFLD mapped data. Estimates only.
 */
export default function ConnectionPointsCard({ lat, lon }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setLoading(true); setError(null);
    try {
      const res = await targetAConnectionPoints({ lat, lon });
      setData(res.data);
    } catch {
      setError("Connection point analysis failed — try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
          <PlugZap className="w-3.5 h-3.5" />Likely Connection Points — Fiber · Power · Access
        </div>
        <Button size="sm" variant="outline" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : data ? <RefreshCw className="w-4 h-4 mr-1.5" /> : <PlugZap className="w-4 h-4 mr-1.5" />}
          {loading ? "Analyzing…" : data ? "Re-run" : "Estimate Connection Points"}
        </Button>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {data && !loading && (
        <>
          {data.map_url && (
            <img src={data.map_url} alt="Estimated connection points for Target A" className="w-full rounded-lg border border-border" />
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <PointCard emoji="🛣️" title="Access Road Entry" pinColor="#2563EB" note={data.access?.note}>
              <Row label="Road" value={data.access ? `${data.access.road_name} (${data.access.road_class})` : "No mapped road within 0.3 mi"} />
              <Row label="Distance" value={data.access ? `${data.access.distance_ft.toLocaleString()} ft` : null} />
              <Row label="Entry point" value={fmtLL(data.access?.point)} />
            </PointCard>
            <PointCard emoji="⚡" title="Power Tie-In" pinColor="#F59E0B" note={data.power?.note}>
              <Row label="Serving utility" value={data.power?.utility} />
              <Row label="Tap point" value={fmtLL(data.power?.point)} />
              {data.power?.transmission && (
                <Row
                  label="Nearest transmission"
                  value={`${data.power.transmission.voltage || "?"} · ${data.power.transmission.owner || "unknown owner"} · ${data.power.transmission.distance_miles} mi`}
                />
              )}
            </PointCard>
            <PointCard emoji="🌐" title="Fiber Hookup" pinColor="#7C3AED" note={data.fiber?.note}>
              <Row label="Asset" value={data.fiber?.assumed ? "Assumed at road frontage" : data.fiber?.asset} />
              <Row label="Operator" value={data.fiber?.operator} />
              <Row label="Distance" value={data.fiber ? `${data.fiber.distance_ft.toLocaleString()} ft` : null} />
              <Row label="Hookup point" value={fmtLL(data.fiber?.point)} />
            </PointCard>
          </div>
          <div className="text-[10px] text-muted-foreground italic leading-snug">{data.disclaimer}</div>
        </>
      )}
    </div>
  );
}