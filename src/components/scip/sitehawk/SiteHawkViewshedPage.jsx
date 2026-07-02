import { HAWK } from "../hawkScipBrand";
import HawkScipSection from "../HawkScipSection";

const EXACT = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" };

/**
 * SiteHawkViewshedPage — the 2D directional viewshed page for the printable SCIP.
 * Renders the four N/S/E/W transparent-cone azimuth maps (from scipViewshed) in a
 * 2×2 grid on a single SCIP page, with a per-direction clear / obstructed read-out
 * so the RF engineer can spot line-of-sight obstructions above the tree line and
 * judge whether antenna azimuths need adjusting. Prints inline with the rest of
 * the SCIP via the shared HawkScipSection page frame.
 */
export default function SiteHawkViewshedPage({ viewshed, targetLabel, page }) {
  const v = viewshed || {};
  const directions = (v.directions || []).filter((d) => d?.map_url);
  if (!directions.length) return null;

  return (
    <HawkScipSection
      kicker="SCIP · Section 4 · 2D Viewshed"
      title="2D VIEWSHED — N / S / E / W"
      right={targetLabel || "Target A"}
      page={page}
      footerNote="Each transparent colored wedge is the antenna azimuth sector over real terrain (© Mapbox satellite). Use the clear / obstructed read-out to verify line-of-sight above the tree line and re-aim azimuths as needed. Field verification recommended."
    >
      <div className="grid grid-cols-2 gap-3" style={{ height: "100%", gridTemplateRows: "1fr 1fr" }}>
        {directions.map((d) => (
          <div key={d.short} className="rounded-lg overflow-hidden flex flex-col" style={{ border: `2px solid ${HAWK.blue}`, minHeight: 0 }}>
            <div
              className="px-2 py-1 flex items-center justify-between text-white text-[9pt] font-bold"
              style={{ background: d.color, flexShrink: 0, ...EXACT }}
            >
              <span>{d.label}</span>
              <span className="text-[7.5pt] px-1.5 py-0.5 rounded-full font-mono" style={{ background: "rgba(0,0,0,0.28)", ...EXACT }}>
                {d.clear ? "CLEAR" : `OBSTRUCTED @ ${d.first_obstruction_mi} mi`}
              </span>
            </div>
            <img
              src={d.map_url}
              alt={`${d.label} viewshed`}
              crossOrigin="anonymous"
              style={{ width: "100%", flex: 1, minHeight: 0, objectFit: "cover", display: "block" }}
            />
          </div>
        ))}
      </div>
    </HawkScipSection>
  );
}