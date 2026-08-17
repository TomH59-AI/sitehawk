import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ownerContactLookup } from "@/functions/ownerContactLookup";

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-3 py-1 text-[11px]">
    <span className="text-slate-400 shrink-0">{label}</span>
    <span className="text-right text-white font-medium truncate pl-2">{value}</span>
  </div>
);

const SectionHeader = ({ children }) => (
  <div className="pb-1 pt-3 text-[10px] font-bold uppercase tracking-widest text-cyan-400 border-b border-slate-700/50">
    {children}
  </div>
);

function isPending(value) {
  return value == null || value === "" || value === "Pending verification" || value === "Pending" || value === "—";
}

function formatUrl(url) {
  if (!url) return null;
  if (typeof url !== "string") return null;
  return url.startsWith("http") ? url : `https://${url}`;
}

/**
 * TalonFitDataPanel — persistent dark sidebar that keeps parcel, zoning,
 * and TalonFit™ constraint data on screen after a probe.
 */
export default function TalonFitDataPanel({ solveResult, isOpen, onToggle, towerHeightFt, lat, lon, saved }) {
  const calc = solveResult?.calculated_result || {};
  const parcel = solveResult?.parcel || {};
  const parcelDetails = solveResult?.parcel_details || {};
  const ordRaw = solveResult?.ordinance || solveResult?.ordinance_rules || {};
  const ord = ordRaw || {};

  const ht = towerHeightFt || 199;

  const [contactResult, setContactResult] = useState(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState(null);

  const handleContactLookup = async () => {
    const ownerName = solveResult?.parcel?.owner_name || solveResult?.parcel_details?.owner;
    const address = solveResult?.parcel?.address || solveResult?.parcel_details?.address || "";
    const jurisdiction = solveResult?.ordinance?.jurisdiction || solveResult?.ordinance_rules?.jurisdiction || "";
    if (!ownerName) return;
    setContactLoading(true);
    setContactError(null);
    setContactResult(null);
    try {
      const result = await ownerContactLookup({ ownerName, address, jurisdiction });
      setContactResult(result);
    } catch (e) {
      setContactError("Lookup failed. Try again.");
    } finally {
      setContactLoading(false);
    }
  };

  // ── Parcel values ──
  const address = parcel.address || parcel.full_address || parcelDetails.address || null;
  const apn = parcel.apn || parcel.parcel_number || parcel.parcel_id || parcelDetails.parcel_id || null;
  const owner = parcel.owner_name || parcel.owner || parcelDetails.owner || null;
  const acreageRaw = parcel.acreage ?? parcelDetails.acreage ?? null;
  const acreage = Number.isFinite(Number(acreageRaw)) && Number(acreageRaw) > 0 ? `${Number(acreageRaw).toFixed(2)} ac` : null;
  const zoning = parcel.zoning || ord.zoning_district || parcelDetails.zoning_classification || null;
  const jurisdiction = parcel.jurisdiction || parcel.city || parcel.county || parcelDetails.county || null;

  // ── Constraint values ──
  const fallZoneMult = calc.effective_fall_zone_mult ?? calc.effective_fall_zone_multiplier ?? null;
  const distToProp = calc.distance_to_property_line_ft ?? null;
  const nearestTower = calc.nearest_tower_distance_ft ?? calc.distance_to_nearest_existing_tower_ft ?? null;
  const nearestStructure = calc.nearest_structure_distance_ft ?? calc.distance_to_nearest_external_structure_ft ?? null;
  const maxBuildable = calc.max_buildable_height_ft ?? calc.maximum_buildable_height_ft ?? null;
  const peLetter = calc.pe_letter_required;
  const distFromCenter = calc.distance_from_ring_center_mi ?? calc.distance_from_ring_center_miles ?? null;

  // ── Ordinance values ──
  const heightLimit = ord.height_limit ?? ord.max_tower_height ?? ord.maximum_tower_height_ft ?? null;
  const approvalPath = ord.approval_path ?? ord.permit_type ?? null;
  const setbackRule = ord.setback_rule ?? ord.property_line_rule ?? null;
  const ordinanceSource = ord.source ?? ord.ordinance_url ?? ord.ordinance_source_url ?? null;

  const setbackDisplay =
    setbackRule == null
      ? null
      : typeof setbackRule === "string"
      ? setbackRule
      : setbackRule.rule || setbackRule.description || setbackRule.fixed_distance_ft != null
      ? `${setbackRule.fixed_distance_ft} ft${setbackRule.rule ? ` · ${setbackRule.rule}` : ""}`
      : null;

  const ordinanceUrl = formatUrl(ordinanceSource);

  // ── Pending items ──
  const pendingItems = [];
  if (isPending(address)) pendingItems.push("Parcel address");
  if (isPending(apn)) pendingItems.push("APN / parcel number");
  if (isPending(owner)) pendingItems.push("Owner name");
  if (isPending(acreage)) pendingItems.push("Acreage");
  if (isPending(zoning)) pendingItems.push("Zoning classification");
  if (isPending(jurisdiction)) pendingItems.push("Jurisdiction");
  if (isPending(fallZoneMult)) pendingItems.push("Fall zone multiplier");
  if (isPending(distToProp)) pendingItems.push("Distance to property line");
  if (isPending(nearestTower)) pendingItems.push("Nearest existing tower");
  if (isPending(nearestStructure)) pendingItems.push("Nearest external structure");
  if (isPending(maxBuildable)) pendingItems.push("Max buildable height");
  if (isPending(peLetter)) pendingItems.push("PE letter requirement");
  if (isPending(heightLimit)) pendingItems.push("Zoning height limit");
  if (isPending(approvalPath)) pendingItems.push("Approval path");
  if (isPending(setbackDisplay)) pendingItems.push("Setback rule");
  if (isPending(ordinanceSource)) pendingItems.push("Ordinance source");

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="flex flex-col items-center justify-center h-full w-8 shrink-0 bg-slate-900 border-r border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all duration-300"
        title="Open site details"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="flex h-full shrink-0 w-[360px] transition-all duration-300">
      <div className="flex flex-col w-full h-full bg-slate-900 border-r border-slate-700">
        {/* Panel header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-950/50">
          <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">Site Details</span>
          <button
            onClick={onToggle}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close panel"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Search center readout */}
        <div className="px-3 py-2 border-b border-slate-700 bg-slate-950">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">
            Search Center
          </div>
          <div className="text-slate-200 text-xs font-mono">
            {lat ? `${lat.toFixed(6)}, ${lon.toFixed(6)}` : "No coordinates set"}
          </div>
          <div className="text-slate-400 text-[10px] mt-0.5">
            Tower: {towerHeightFt || 199} ft · Ring: 2 mi · Targets: {saved?.length || 0}/3
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {/* Section 1 — FAA / Height Status */}
          <div className="mt-3 rounded-md border border-emerald-700 bg-emerald-950 px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
              <span>✅</span>
              <span>{ht} ft — Below 200 ft FAA threshold</span>
            </div>
            <div className="mt-0.5 text-[10px] text-emerald-400/80">
              No Form 7460-1 required · No ASR registration required
            </div>
          </div>

          {/* Section 2 — Parcel */}
          <SectionHeader>Parcel</SectionHeader>
          <Row label="Address" value={address || "Pending verification"} />
          <Row label="APN" value={apn || "Pending verification"} />
          <Row label="Owner" value={owner || "Pending verification"} />

          {/* Skip-Trace Contact Lookup */}
          <div className="px-3 pb-2">
            <button
              onClick={handleContactLookup}
              disabled={contactLoading || (!solveResult?.parcel?.owner_name && !solveResult?.parcel_details?.owner)}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded text-xs font-medium bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-700/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {contactLoading ? (
                <>
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Searching contact records…
                </>
              ) : (
                <>📞 Skip-Trace Owner Contact</>
              )}
            </button>

            {contactError && (
              <p className="text-red-400 text-xs mt-1 text-center">{contactError}</p>
            )}

            {contactResult && (
              <div className="mt-2 rounded bg-slate-800/60 border border-slate-700/40 p-2 text-xs space-y-1">
                {contactResult.phones?.length > 0 && (
                  <div>
                    <span className="text-slate-400 uppercase tracking-wide text-[10px]">Phone Numbers</span>
                    {contactResult.phones.map((p, i) => (
                      <div key={i} className="flex justify-between text-slate-200">
                        <span>{p.type || "Phone"}</span>
                        <a href={`tel:${p.number}`} className="text-blue-400 hover:underline">{p.number}</a>
                      </div>
                    ))}
                  </div>
                )}
                {contactResult.emails?.length > 0 && (
                  <div>
                    <span className="text-slate-400 uppercase tracking-wide text-[10px]">Email</span>
                    {contactResult.emails.map((e, i) => (
                      <div key={i} className="text-blue-400 text-right">
                        <a href={`mailto:${e}`} className="hover:underline">{e}</a>
                      </div>
                    ))}
                  </div>
                )}
                {contactResult.business_name && (
                  <div className="flex justify-between text-slate-200">
                    <span className="text-slate-400">Registered As</span>
                    <span>{contactResult.business_name}</span>
                  </div>
                )}
                {contactResult.agent && (
                  <div className="flex justify-between text-slate-200">
                    <span className="text-slate-400">Registered Agent</span>
                    <span>{contactResult.agent}</span>
                  </div>
                )}
                {(!contactResult.phones?.length && !contactResult.emails?.length && !contactResult.business_name) && (
                  <p className="text-slate-400 text-center">No contact records found for this owner.</p>
                )}
                <div className="text-slate-600 text-[10px] text-right pt-1">
                  Source: {contactResult.source || "Public records"}
                </div>
              </div>
            )}
          </div>

          <Row label="Acreage" value={acreage || "Pending verification"} />
          <Row label="Zoning" value={zoning || "Pending verification"} />
          <Row label="Jurisdiction" value={jurisdiction || "—"} />

          {/* Section 3 — TalonFit™ Constraints */}
          <SectionHeader>TalonFit™ Constraints</SectionHeader>
          <Row label="Fall zone multiplier" value={fallZoneMult != null ? `${fallZoneMult}x` : "Pending"} />
          <Row label="Distance to property line" value={distToProp != null ? `${distToProp} ft` : "Pending verification"} />
          <Row label="Nearest existing tower" value={nearestTower != null ? `${nearestTower} ft` : "Pending verification"} />
          <Row label="Nearest ext. structure" value={nearestStructure != null ? `${nearestStructure} ft` : "Pending verification"} />
          <Row label="Max buildable height" value={maxBuildable != null ? `${maxBuildable} ft` : "Pending verification"} />
          <Row
            label="PE letter required"
            value={peLetter === true ? "Yes" : peLetter === false ? "No" : "Pending"}
          />
          <Row label="Distance from ring center" value={distFromCenter != null ? `${distFromCenter} mi` : "—"} />

          {/* Section 4 — Zoning Registry */}
          <SectionHeader>Zoning Registry</SectionHeader>
          <Row label="Height limit" value={heightLimit != null ? `${heightLimit} ft` : "Pending verification"} />
          <Row label="Approval path" value={approvalPath || "Pending verification"} />
          <Row label="Setback rule" value={setbackDisplay || "Pending verification"} />
          <div className="flex justify-between gap-3 py-1 text-[11px]">
            <span className="text-slate-400 shrink-0">Ordinance source</span>
            {ordinanceUrl ? (
              <a
                href={ordinanceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-right text-cyan-400 hover:text-cyan-300 font-medium truncate pl-2 underline underline-offset-2"
              >
                View source
              </a>
            ) : (
              <span className="text-right text-white font-medium truncate pl-2">Pending verification</span>
            )}
          </div>

          {/* Section 5 — Pending Verification */}
          {pendingItems.length > 0 && (
            <>
              <SectionHeader>Pending Verification</SectionHeader>
              <div className="mt-1 rounded-md border border-amber-700/50 bg-amber-950/40 px-2.5 py-2">
                <div className="flex items-start gap-2 text-[11px] text-amber-300">
                  <span className="shrink-0">⚠️</span>
                  <div className="space-y-0.5">
                    {pendingItems.map((item, i) => (
                      <div key={i} className="text-amber-200/90">• {item}</div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
