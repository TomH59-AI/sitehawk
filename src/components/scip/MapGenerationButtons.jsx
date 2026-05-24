import { Button } from "@/components/ui/button";
import { Map, Radio, Zap, Crosshair, CheckCircle2 } from "lucide-react";

/**
 * MapGenerationButtons — Stage 2 of the SCIP workflow.
 * Shown after the zoning report is done. Each button generates one map
 * type and marks itself complete.
 *
 * Props:
 *   onGenerate(mapKey) — called when a button is clicked
 *   completed: Set<string> — keys of maps already generated
 *   loadingKey: string | null — key currently being generated
 */
const MAPS = [
  { key: "sarf",         label: "SARF Map",            icon: Map,       desc: "Site acquisition radius footprint" },
  { key: "rf_coverage",  label: "RF Coverage Map",     icon: Radio,     desc: "CloudRF propagation heatmap" },
  { key: "infra",        label: "Infrastructure Map",  icon: Zap,       desc: "Power + fiber overlays" },
  { key: "compound",     label: "Compound Placement",  icon: Crosshair, desc: "Target A tower + compound" },
];

export default function MapGenerationButtons({ onGenerate, completed = new Set(), loadingKey = null }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="font-heading font-semibold text-foreground mb-3">Generate Maps</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {MAPS.map((m) => {
          const Icon = m.icon;
          const done = completed.has(m.key);
          const loading = loadingKey === m.key;
          return (
            <Button
              key={m.key}
              variant={done ? "secondary" : "default"}
              disabled={loading || done}
              onClick={() => onGenerate(m.key)}
              className="h-auto flex-col items-start py-3 px-4 text-left whitespace-normal"
            >
              <div className="flex items-center gap-2 w-full">
                {done ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Icon className="w-4 h-4" />}
                <span className="font-semibold">{m.label}</span>
              </div>
              <span className="text-xs opacity-80 mt-1">{loading ? "Generating…" : done ? "Generated ✓" : m.desc}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}