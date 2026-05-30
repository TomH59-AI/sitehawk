import { SKYWAVE } from "@/lib/skywave";
import ViewshedProfileChart from "./ViewshedProfileChart";

// One direction's viewshed: pitched 2D map with a transparent RF cone overlay + terrain/LOS profile.
function DirectionBlock({ d }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1.5px solid ${d.color}66` }}>
      <div className="flex items-center justify-between px-2.5 py-1.5" style={{ background: SKYWAVE.dark }}>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center font-bold text-[9pt]"
            style={{ width: 20, height: 20, borderRadius: "50%", background: `${d.color}33`, border: `2px solid ${d.color}`, color: d.color }}>
            {d.short}
          </span>
          <span className="text-white text-[9.5pt] font-semibold">{d.label}</span>
        </div>
        <span className="text-[8pt] font-bold px-1.5 py-0.5 rounded" style={{ background: `${d.color}33`, color: d.color }}>
          {d.bearing}° · {d.clear ? "CLEAR LOS" : `OBSTRUCTION @ ${d.first_obstruction_mi} mi`}
        </span>
      </div>

      {/* Map + transparent conical RF lobe */}
      <div className="relative" style={{ aspectRatio: "16/9", background: "#0a0e17" }}>
        {d.map_url && (
          <img src={d.map_url} alt={`${d.label} viewshed`} crossOrigin="anonymous"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <defs>
            <radialGradient id={`vs-${d.short}`} cx="50%" cy="100%" r="100%">
              <stop offset="0%" stopColor={d.color} stopOpacity="0.5" />
              <stop offset="55%" stopColor={d.color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={d.color} stopOpacity="0" />
            </radialGradient>
          </defs>
          <polygon points="50,100 16,14 84,14" fill={`url(#vs-${d.short})`} stroke={d.color} strokeOpacity="0.5" strokeWidth="0.3" />
          <line x1="50" y1="100" x2="50" y2="14" stroke={d.color} strokeOpacity="0.7" strokeWidth="0.25" strokeDasharray="1.5 1" />
        </svg>
      </div>

      {/* Terrain + line-of-sight profile */}
      <div className="px-1.5 pt-1 pb-0.5" style={{ background: "#fff" }}>
        <ViewshedProfileChart direction={d} height={120} />
      </div>
    </div>
  );
}

export default function ScipViewshedPage({ viewshed, siteName }) {
  if (!viewshed) return null;
  const dirs = viewshed.directions || [];

  return (
    <>
      {/* Aerial ring + tower waypoint */}
      <div className="rounded-lg overflow-hidden mb-4" style={{ border: `2px solid ${SKYWAVE.blue}` }}>
        {viewshed.aerial_ring_url ? (
          <img src={viewshed.aerial_ring_url} alt="Target A aerial ring" crossOrigin="anonymous"
            style={{ width: "100%", height: "3.2in", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ height: "3.2in", background: SKYWAVE.bg }} />
        )}
      </div>

      <div className="flex items-center gap-6 mb-3 text-[9pt]">
        <div className="flex items-center gap-2">
          <span style={{ width: 13, height: 13, borderRadius: "50%", background: SKYWAVE.yellow, border: `2px solid ${SKYWAVE.navy}` }} />
          <span style={{ color: SKYWAVE.ink }}>Tower Location (Target A waypoint)</span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ width: 13, height: 13, borderRadius: "50%", background: "rgba(27,63,174,0.10)", border: `2px solid ${SKYWAVE.yellow}` }} />
          <span style={{ color: SKYWAVE.ink }}>Search radius ring</span>
        </div>
        <span style={{ color: SKYWAVE.muted }}>Tower height: {viewshed.tower_height_ft} ft AGL</span>
      </div>

      {/* 4 viewshed map + profile pairs */}
      <div className="grid grid-cols-2 gap-3">
        {dirs.map((d) => <DirectionBlock key={d.short} d={d} />)}
      </div>
    </>
  );
}