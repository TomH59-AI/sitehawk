/**
 * PathProfileCard — CloudRF /path point-to-point analysis from Target A
 * to a user-supplied destination (donor / fiber POP / hub).
 * Renders the CloudRF chart PNG + LOS, Fresnel %, signal, path loss, distance.
 */

import { useState } from "react";
import Section1Shell from "../scip/section1/Section1Shell";
import { cloudRFPath } from "@/functions/cloudRFPath";
import { Spline, Loader2 } from "lucide-react";

export default function PathProfileCard({ targetLat, targetLon, siteName }) {
  const [rxLat, setRxLat] = useState("");
  const [rxLon, setRxLon] = useState("");
  const [rxHeight, setRxHeight] = useState(30);
  const [txHeight, setTxHeight] = useState(199);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleGenerate() {
    const txLat = parseFloat(targetLat);
    const txLon = parseFloat(targetLon);
    const rLat = parseFloat(rxLat);
    const rLon = parseFloat(rxLon);
    if (!isFinite(txLat) || !isFinite(txLon)) {
      setError("Target A coordinates required — run Hawk Vision first.");
      return;
    }
    if (!isFinite(rLat) || !isFinite(rLon)) {
      setError("Enter destination latitude/longitude.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await cloudRFPath({
        tx_lat: txLat, tx_lon: txLon, tx_height_ft: Number(txHeight),
        rx_lat: rLat, rx_lon: rLon, rx_height_ft: Number(rxHeight),
        site_name: `${siteName || "Target A"} → donor`,
      });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e.message || "CloudRF /path call failed");
    } finally {
      setLoading(false);
    }
  }

  const losBadge = (status) => {
    if (!status) return null;
    const s = String(status).toUpperCase();
    const clear = s.includes("CLEAR") || s === "LOS";
    return (
      <span
        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider ${
          clear ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30"
                : "bg-red-500/15 text-red-700 border border-red-500/30"
        }`}
      >
        {clear ? "✓ LINE OF SIGHT" : `⚠ ${s}`}
      </span>
    );
  };

  return (
    <Section1Shell
      step={2}
      title="Path Profile (Point-to-Point)"
      subtitle="Target A → donor / fiber POP / hub · CloudRF /path · LOS + Fresnel + obstruction chart"
      icon={Spline}
      generateLabel={result ? "RE-RUN PATH" : "GENERATE PATH PROFILE"}
      onGenerate={handleGenerate}
      loading={loading}
    >
      <div className="px-4 py-3 border-b border-border bg-muted/30 grid grid-cols-2 md:grid-cols-4 gap-2">
        <FieldNum label="TX Height (ft)" value={txHeight} onChange={setTxHeight} />
        <FieldNum label="RX Height (ft)" value={rxHeight} onChange={setRxHeight} />
        <FieldNum label="Dest. Latitude" value={rxLat} onChange={setRxLat} step="0.000001" />
        <FieldNum label="Dest. Longitude" value={rxLon} onChange={setRxLon} step="0.000001" />
      </div>

      {error && <div className="px-4 py-2 bg-red-500/10 text-xs text-red-700">{error}</div>}

      {result ? (
        <div>
          {result.png_url && (
            <div className="bg-[#0a0e17] flex items-center justify-center p-3">
              <img
                src={result.png_url}
                alt="CloudRF path profile chart"
                crossOrigin="anonymous"
                className="max-w-full h-auto rounded shadow-2xl"
                style={{ maxHeight: 360 }}
              />
            </div>
          )}
          <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
            {losBadge(result.los_status)}
            {result.fresnel_clearance_pct != null && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider bg-cyan-500/15 text-cyan-700 border border-cyan-500/30">
                Fresnel {Number(result.fresnel_clearance_pct).toFixed(0)}%
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
            <Stat label="Distance" value={result.distance_km != null ? `${Number(result.distance_km).toFixed(2)} km` : "—"} />
            <Stat label="Signal @ RX" value={result.signal_dbm != null ? `${Number(result.signal_dbm).toFixed(1)} dBm` : "—"} />
            <Stat label="Path Loss" value={result.path_loss_db != null ? `${Number(result.path_loss_db).toFixed(1)} dB` : "—"} />
            <Stat label="SNR" value={result.snr_db != null ? `${Number(result.snr_db).toFixed(1)} dB` : "—"} />
          </div>
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          {loading ? (
            <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Running CloudRF /path…</span>
          ) : "Enter a destination lat/lon and GENERATE."}
        </div>
      )}
    </Section1Shell>
  );
}

function FieldNum({ label, value, onChange, step = "any" }) {
  return (
    <label className="block">
      <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-1">{label}</div>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 border border-border rounded bg-card text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cyan-400"
      />
    </label>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-card px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-mono">{label}</div>
      <div className="text-xs font-mono text-foreground mt-0.5">{value}</div>
    </div>
  );
}