import { useState, useRef, useCallback } from "react";
import { Radar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { talonreachRun } from "@/functions/talonreachRun";
import { base44 } from "@/api/base44Client";
import TalonReachMap from "./TalonReachMap";
import TalonReachRecommendations from "./TalonReachRecommendations";
import TalonReachTagline from "./TalonReachTagline";

const FREQUENCIES = [600, 700, 850, 1900, 2500, 3700];
const POWERS = [20, 40, 60, 100];

// TalonReach® — AI RF advisor for a sited tower. Runs a CloudRF coverage
// simulation + AI weak-zone diagnosis, annotates the map, saves the report.
export default function TalonReachPanel({ source, siteLabel, parcelId, jurisdiction, latitude, longitude, heightFt }) {
  const [freq, setFreq] = useState("700");
  const [power, setPower] = useState("40");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const mapRef = useRef(null);

  const handleFocus = useCallback((lngLat) => mapRef.current?.flyTo(lngLat), []);

  // A full run can outlive the request timeout — the analysis keeps going
  // server-side and lands in TalonReachRunLog, so poll for the saved report.
  const pollForReport = async (startedAtIso) => {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 6000));
      try {
        const rows = await base44.entities.TalonReachRunLog.filter(
          { created_date: { $gte: startedAtIso } }, "-created_date", 3);
        const hit = rows.find((r) =>
          Math.abs(Number(r.latitude) - Number(latitude)) < 0.001 &&
          Math.abs(Number(r.longitude) - Number(longitude)) < 0.001);
        if (hit) return hit;
      } catch { /* keep polling */ }
    }
    return null;
  };

  const run = async () => {
    setBusy(true);
    const startedAtIso = new Date(Date.now() - 5000).toISOString();
    try {
      const { data } = await talonreachRun({
        source, parcel_id: parcelId, jurisdiction,
        site_label: siteLabel,
        latitude: Number(latitude), longitude: Number(longitude),
        tower_height_ft: Number(heightFt) || 199,
        frequency_mhz: Number(freq), power_w: Number(power), radius_mi: 5,
      });
      if (!data?.ok) throw new Error(data?.error || "TalonReach run failed");
      setReport(data.report);
    } catch (e) {
      const status = e?.response?.status;
      if (status && status !== 200 && status < 500 && status !== 408) {
        toast.error(e?.response?.data?.error || e.message || "TalonReach RF analysis failed.");
      } else {
        // Timed out or transient — the run may still complete; recover it.
        const saved = await pollForReport(startedAtIso);
        if (saved) setReport(saved);
        else toast.error(e?.response?.data?.error || e.message || "TalonReach RF analysis failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/5 p-3 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 font-heading font-bold text-sm text-cyan-300">
          <Radar className="w-5 h-5 shrink-0" />
          TalonReach® RF Advisor
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <Label className="text-[10px] text-muted-foreground">Frequency</Label>
            <Select value={freq} onValueChange={setFreq}>
              <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => <SelectItem key={f} value={String(f)}>{f} MHz</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Power</Label>
            <Select value={power} onValueChange={setPower}>
              <SelectTrigger className="h-8 w-[90px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {POWERS.map((p) => <SelectItem key={p} value={String(p)}>{p} W</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <button
            onClick={run}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white text-xs font-bold px-3 py-2 transition-colors"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radar className="w-3.5 h-3.5" />}
            {report ? "Re-run TalonReach RF Analysis" : "Run TalonReach RF Analysis"}
          </button>
        </div>
      </div>

      {busy && (
        <p className="text-xs text-cyan-200/80">
          Running the CloudRF coverage simulation and the AI RF-engineer review — this takes ~30–60 seconds…
        </p>
      )}

      {report ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="min-h-[380px]">
            <TalonReachMap ref={mapRef} latitude={latitude} longitude={longitude} report={report} />
          </div>
          <TalonReachRecommendations report={report} onFocus={handleFocus} />
        </div>
      ) : (
        !busy && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Simulates coverage from this tower at {Math.round(Number(heightFt) || 199)} ft, then an AI RF engineer flags
              weak/dead zones on the map, diagnoses each cause, and recommends fixes — including the best infill spot.
              Each run is saved as a report.
            </p>
            <TalonReachTagline />
          </div>
        )
      )}
    </div>
  );
}