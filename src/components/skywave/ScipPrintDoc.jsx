import { MapPin } from "lucide-react";
import { format } from "date-fns";
import { SKYWAVE } from "@/lib/skywave";

function fmtDate(d) {
  try { return format(new Date(d + "T00:00:00"), "MMM d, yyyy"); } catch { return d || ""; }
}

function Labeled({ label, optional, value }) {
  return (
    <div>
      <div className="text-[8.5pt] font-semibold uppercase tracking-wide" style={{ color: SKYWAVE.navy }}>
        {label}{optional && <span className="italic font-normal normal-case ml-1" style={{ color: SKYWAVE.muted }}>(optional)</span>}
      </div>
      <div className="text-[11pt] pt-1 pb-0.5 min-h-[20px]" style={{ color: SKYWAVE.ink, borderBottom: "1.5px solid #000" }}>
        {value || "\u00A0"}
      </div>
    </div>
  );
}

function SectionBar({ title }) {
  return (
    <div className="flex items-stretch" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
      <div style={{ width: 5, background: SKYWAVE.yellow }} />
      <div className="flex-1 px-3 py-1.5 text-white text-[11pt] font-bold uppercase tracking-wide" style={{ background: SKYWAVE.blue }}>
        {title}
      </div>
    </div>
  );
}

function Checkbox({ checked, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center justify-center" style={{
        width: 18, height: 18, borderRadius: 3,
        background: checked ? SKYWAVE.blue : "#fff",
        border: `2px solid ${SKYWAVE.blue}`,
        printColorAdjust: "exact", WebkitPrintColorAdjust: "exact",
      }}>
        {checked && <span style={{ color: SKYWAVE.yellow, fontWeight: 900, fontSize: 12, lineHeight: 1 }}>✓</span>}
      </span>
      <span className="text-[10pt]" style={{ color: SKYWAVE.ink }}>{label}</span>
    </div>
  );
}

function Footer({ page, right }) {
  return (
    <div className="flex justify-between text-[8.5pt] pt-2 mt-auto" style={{ color: SKYWAVE.muted, borderTop: `1px solid ${SKYWAVE.line}` }}>
      <span>SKYWAVE · SCIP</span>
      <span>{right}</span>
    </div>
  );
}

export default function ScipPrintDoc({ record }) {
  const r = record || {};
  const lat = Number(r.latitude).toFixed(5);
  const lon = Number(r.longitude).toFixed(5);
  const radius = r.search_radius;

  return (
    <div id="scip-doc" style={{ fontFamily: "Inter, Helvetica Neue, Arial, sans-serif" }}>
      {/* PAGE 1 */}
      <div className="page flex flex-col" style={{ width: "8.5in", minHeight: "11in", padding: "0.4in 0.5in", background: "#fff" }}>
        {/* Header band */}
        <div className="flex items-center gap-4 rounded-lg mb-5" style={{ background: SKYWAVE.dark, padding: 22, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
          <img src={SKYWAVE.logo} alt="SkyWave" style={{ height: 84 }} crossOrigin="anonymous" />
          <div>
            <div className="text-[12pt] uppercase font-semibold" style={{ color: SKYWAVE.yellow, letterSpacing: 3 }}>SkyWave</div>
            <div className="text-[20pt] font-bold text-white leading-tight">Site Candidate Information Package</div>
            <div className="text-[10pt]" style={{ color: "#B7BED0" }}>SCIP · Step 1 — Site Acquisition &amp; Search Ring</div>
          </div>
        </div>

        <SectionBar title="Site Acquisition" />
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 mt-4 mb-6">
          <Labeled label="Agent Name" value={r.agent_name} />
          <Labeled label="Agent Phone" value={r.agent_phone} />
          <Labeled label="Agent E-mail" value={r.agent_email} />
          <Labeled label="Submittal Date" value={fmtDate(r.submittal_date)} />
        </div>

        <SectionBar title="Search Ring Information" />
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 mt-4">
          <Labeled label="Site Name" value={r.site_name} />
          <Labeled label="SARF Height (ft AGL)" value={r.sarf_height} />
          <Labeled label="Latitude" value={lat} />
          <Labeled label="Longitude" value={lon} />
          <Labeled label="County" optional value={r.county} />
          <Labeled label="State" optional value={(r.state || "").toUpperCase()} />
        </div>
        <div className="mt-5">
          <div className="text-[8.5pt] font-semibold uppercase tracking-wide mb-2" style={{ color: SKYWAVE.navy }}>Search Radius</div>
          <div className="flex gap-8">
            <Checkbox checked={radius === "0.25"} label="0.25 mi" />
            <Checkbox checked={radius === "0.50"} label="0.50 mi" />
            <Checkbox checked={radius === "1.00"} label="1.00 mi" />
          </div>
        </div>

        <Footer page={1} right={`Page 1 of 2 · Site: ${r.site_name || ""}`} />
      </div>

      {/* PAGE 2 */}
      <div className="page flex flex-col" style={{ width: "8.5in", minHeight: "11in", padding: "0.4in 0.5in", background: "#fff" }}>
        <div className="flex items-end justify-between pb-2 mb-3" style={{ borderBottom: `3px solid ${SKYWAVE.blue}` }}>
          <div className="text-[16pt] font-bold">
            <span style={{ color: SKYWAVE.navy }}>SARF</span>{" "}
            <span style={{ color: SKYWAVE.yellow }}>MAP</span>
          </div>
          <div className="text-[9pt] text-right" style={{ color: SKYWAVE.muted }}>
            {r.site_name} · {lat}, {lon} · Radius: {radius} mi
          </div>
        </div>

        <div className="rounded-lg overflow-hidden" style={{ height: "8.4in", border: `2px solid ${SKYWAVE.blue}` }}>
          {r.map_image_url ? (
            <img src={r.map_image_url} alt="SARF Map" style={{ width: "100%", height: "100%", objectFit: "cover" }} crossOrigin="anonymous" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ background: SKYWAVE.bg, color: SKYWAVE.muted }}>
              <MapPin className="w-8 h-8" />
              <span className="text-[10pt] text-center px-8">Mapbox SARF Map renders here · Center waypoint with the selected search-radius circle</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-6 mt-3.5 text-[9.5pt]">
          <div className="flex items-center gap-2">
            <span style={{ width: 14, height: 14, borderRadius: "50%", background: SKYWAVE.yellow, border: `2px solid ${SKYWAVE.navy}`, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} />
            <span style={{ color: SKYWAVE.ink }}>Site Center (Lat/Lng waypoint)</span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ width: 14, height: 14, borderRadius: "50%", background: "rgba(27,63,174,0.10)", border: `2px solid ${SKYWAVE.blue}`, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} />
            <span style={{ color: SKYWAVE.ink }}>Search Radius — {radius} mi</span>
          </div>
          <span style={{ color: SKYWAVE.muted }}>Basemap © Mapbox · © OpenStreetMap</span>
        </div>

        <Footer page={2} right={`Page 2 of 2 · Generated ${fmtDate(r.submittal_date)}`} />
      </div>
    </div>
  );
}