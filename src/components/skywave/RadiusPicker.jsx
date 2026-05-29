import { Check } from "lucide-react";
import { SKYWAVE, RADIUS_OPTIONS } from "@/lib/skywave";

export default function RadiusPicker({ value, onChange }) {
  return (
    <div className="flex gap-3 flex-wrap">
      {RADIUS_OPTIONS.map((r) => {
        const selected = value === r;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            className="relative flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-semibold text-sm transition-all min-w-[110px]"
            style={{
              background: selected ? SKYWAVE.blue : "#fff",
              color: selected ? "#fff" : SKYWAVE.blue,
              border: `2px solid ${SKYWAVE.blue}`,
            }}
          >
            {selected && <Check className="w-4 h-4" style={{ color: SKYWAVE.yellow }} strokeWidth={3} />}
            {r} mi
          </button>
        );
      })}
    </div>
  );
}