/**
 * SCIPCoverPage — Cinematic recon-style cover banner for the SCIP.
 * Shown above all sections to give the printed/exported report a true "package" feel.
 *
 * Pulls live data from the candidate + agent + searchCenter that the SCIPPreview page
 * already has in state — no extra API calls. Designed to render beautifully on screen
 * AND when printed (uses print-safe colors + borders).
 */

import { useEffect, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";
import HawkIcon from "../HawkIcon";

function buildCoverMapUrl(token, lat, lon) {
  if (!token || lat == null || lon == null) return null;
  // Build same SARF ring overlay as the rest of the SCIP for visual consistency
  function buildCircle(centerLat, centerLon, radiusMiles, points = 96) {
    const coords = [];
    const radiusM = radiusMiles * 1609.344;
    const dx = radiusM / (111320 * Math.cos((centerLat * Math.PI) / 180));
    const dy = radiusM / 110540;
    for (let i = 0; i < points; i++) {
      const t = (i / points) * 2 * Math.PI;
      coords.push([centerLon + dx * Math.cos(t), centerLat + dy * Math.sin(t)]);
    }
    coords.push(coords[0]);
    return { type: "Polygon", coordinates: [coords] };
  }
  const geojson = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { stroke: "#DC2626", "stroke-width": 3, "stroke-opacity": 0.95, "fill-opacity": 0 }, geometry: buildCircle(lat, lon, 1.0) },
      { type: "Feature", properties: { stroke: "#EAB308", "stroke-width": 3, "stroke-opacity": 0.95, "fill-opacity": 0 }, geometry: buildCircle(lat, lon, 0.5) },
    ],
  };
  const geo = encodeURIComponent(JSON.stringify(geojson));
  const pin = `pin-l-circle+2563EB(${lon},${lat})`;
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
    `geojson(${geo}),${pin}/${lon},${lat},13.4,0,0/1280x640@2x?access_token=${token}`
  );
}

export default function SCIPCoverPage({ candidate, searchCenter, agent }) {
  const [token, setToken] = useState("");

  useEffect(() => {
    loadPublicConfig().then((cfg) => setToken(cfg.mapboxAccessToken || ""));
  }, []);

  const sarfLat = searchCenter?.lat ?? candidate?.latitude;
  const sarfLon = searchCenter?.lon ?? candidate?.longitude;
  const heroUrl = buildCoverMapUrl(token, sarfLat, sarfLon);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="rounded-xl overflow-hidden border-2 border-cyan-500/30 shadow-2xl bg-[#0a0e17]">
      {/* Hero strip with satellite */}
      <div className="relative" style={{ aspectRatio: "1280/640" }}>
        {heroUrl ? (
          <img src={heroUrl} alt="SARF satellite" crossOrigin="anonymous" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0C1B2E] via-[#1e3a5f] to-[#0a0e17]" />
        )}
        {/* Dark gradient overlay so text is always legible */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,14,23,0.55) 0%, rgba(10,14,23,0.2) 40%, rgba(10,14,23,0.9) 100%)" }} />

        {/* Top-left brand */}
        <div className="absolute top-4 left-4 flex items-center gap-2 text-white" style={{ fontFamily: "'Space Mono', monospace" }}>
          <HawkIcon size={32} />
          <div>
            <div className="font-bold text-sm tracking-[0.18em]">SITEHAWK · SKYWAVE LLC</div>
            <div className="text-[10px] text-cyan-400 tracking-[0.25em]">SITE ACQUISITION RECON</div>
          </div>
        </div>

        {/* Top-right classification tag */}
        <div className="absolute top-4 right-4 text-right text-white" style={{ fontFamily: "'Space Mono', monospace" }}>
          <div className="inline-block px-3 py-1 border border-cyan-400/60 bg-[#0a0e17]/70 rounded">
            <div className="text-[9px] text-cyan-400 tracking-[0.2em]">CONFIDENTIAL · INTERNAL USE</div>
          </div>
          <div className="text-[10px] text-slate-300 mt-1 tracking-wider">{today}</div>
        </div>

        {/* Bottom: title + coords */}
        <div className="absolute inset-x-0 bottom-0 p-6 text-white">
          <div className="text-[10px] text-cyan-400 tracking-[0.3em] font-bold mb-1" style={{ fontFamily: "'Space Mono', monospace" }}>
            SITE CANDIDATE INFORMATION PACKAGE
          </div>
          <h1 className="font-heading font-bold text-3xl md:text-4xl leading-tight mb-2">
            {candidate?.site_name || "Candidate Site"}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-200" style={{ fontFamily: "'Space Mono', monospace" }}>
            {candidate?.parcel_address && <span>📍 {candidate.parcel_address}</span>}
            {sarfLat != null && sarfLon != null && (
              <span className="text-cyan-400">{sarfLat.toFixed(6)}, {sarfLon.toFixed(6)}</span>
            )}
            {candidate?.match_score != null && (
              <span className="inline-block px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-[11px] font-bold">
                MATCH {candidate.match_score}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Agent + key facts strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-800 bg-[#0C1B2E] text-white">
        <CoverFact label="Agent" value={agent?.name || "—"} />
        <CoverFact label="Contact" value={agent?.phone || agent?.email || "—"} mono />
        <CoverFact label="Owner" value={candidate?.owner_name || "—"} />
        <CoverFact
          label="Parcel"
          value={candidate?.parcel_size_acres ? `${candidate.parcel_size_acres} ac` : "—"}
          sub={candidate?.zoning_classification || ""}
        />
      </div>
    </div>
  );
}

function CoverFact({ label, value, sub, mono }) {
  return (
    <div className="p-4">
      <div className="text-[9px] text-cyan-400 font-bold tracking-[0.2em] uppercase mb-1" style={{ fontFamily: "'Space Mono', monospace" }}>
        {label}
      </div>
      <div className={`text-sm text-white font-bold truncate ${mono ? "font-mono" : ""}`} title={value}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}