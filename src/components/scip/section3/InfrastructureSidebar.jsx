/**
 * InfrastructureSidebar — Section 3 right rail.
 *
 * Shows Power Company + Fiber Company name / address / phone for Target A.
 * Powered by electricUtilityLookup (HIFLD) + fccBroadbandLookup (OSM fiber).
 * One Generate button pulls both in parallel.
 */

import { useState } from "react";
import { Loader2, Zap, Cable, Phone, MapPin, Globe } from "lucide-react";
import { electricUtilityLookup } from "@/functions/electricUtilityLookup";
import { fccBroadbandLookup } from "@/functions/fccBroadbandLookup";

function Field({ icon: Icon, label, value, mono = false }) {
  const has = value != null && value !== "";
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border last:border-b-0">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-1 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground font-mono">{label}</div>
        <div className={`text-xs ${mono ? "font-mono" : ""} ${has ? "text-foreground" : "text-muted-foreground italic"}`}>
          {has ? value : "—"}
        </div>
      </div>
    </div>
  );
}

export default function InfrastructureSidebar({ targetLat, targetLon }) {
  const [power, setPower] = useState(null);
  const [fiber, setFiber] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleGenerate() {
    const lat = parseFloat(targetLat);
    const lon = parseFloat(targetLon);
    if (!isFinite(lat) || !isFinite(lon)) {
      setError("Run Hawk Vision first — sidebar uses Target A's coordinates.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [p, f] = await Promise.allSettled([
        electricUtilityLookup({ lat, lon }),
        fccBroadbandLookup({ lat, lon }),
      ]);
      if (p.status === "fulfilled") setPower(p.value?.data || p.value);
      if (f.status === "fulfilled") setFiber(f.value?.data || f.value);
    } catch (e) {
      setError(e.message || "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card border-l border-border h-full flex flex-col">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-muted/30">
        <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-foreground">UTILITY CONTACTS</span>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold tracking-wider bg-cyan-500 text-[#0C1B2E] hover:bg-cyan-400 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "🔌"}
          {loading ? "…" : "GENERATE"}
        </button>
      </div>

      {error && <div className="px-3 py-2 bg-red-500/10 text-xs text-red-700">{error}</div>}

      <div className="flex-1 overflow-y-auto">
        {/* POWER CARD */}
        <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-red-600" />
          <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-red-700">POWER COMPANY</span>
        </div>
        <div className="px-3 py-2">
          <Field icon={Zap} label="Name" value={power?.utility_name || power?.power_utility} />
          <Field icon={MapPin} label="Type / Holding Co." value={[power?.utility_type, power?.holding_company].filter(Boolean).join(" · ")} />
          <Field icon={Phone} label="Phone" value={power?.telephone} mono />
          <Field icon={Globe} label="Website" value={power?.website} mono />
          <Field icon={MapPin} label="Control Area" value={power?.control_area} mono />
        </div>

        {/* FIBER CARD */}
        <div className="px-3 py-2 bg-orange-50 border-y border-orange-200 flex items-center gap-2">
          <Cable className="w-3.5 h-3.5 text-orange-600" />
          <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-orange-700">FIBER COMPANY</span>
        </div>
        <div className="px-3 py-2">
          <Field icon={Cable} label="Nearest Operator" value={fiber?.fiber_operator} />
          <Field icon={MapPin} label="Infrastructure Type" value={fiber?.fiber_infrastructure_type} />
          <Field
            icon={MapPin}
            label="Distance"
            value={fiber?.fiber_distance_miles != null ? `${Number(fiber.fiber_distance_miles).toFixed(2)} mi` : null}
            mono
          />
          <Field
            icon={Zap}
            label="Nearest TX Line"
            value={
              fiber?.transmission_line_distance_miles != null
                ? `${Number(fiber.transmission_line_distance_miles).toFixed(2)} mi · ${fiber.transmission_line_voltage || "—"}`
                : null
            }
            mono
          />
        </div>
      </div>
    </div>
  );
}