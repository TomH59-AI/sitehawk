import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Crosshair } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import ScoutAnchorBanner from "./ScoutAnchorBanner";
import ScoutRingMap from "./ScoutRingMap";
import ScoutTargetCard from "./ScoutTargetCard";
import ScoutSheetsExport from "./ScoutSheetsExport";
import TalonFitProposalControls from "./TalonFitProposalControls";

// TalonFit-AI-1.0 contract constants.
const SLOTS = ["D", "E", "F"];
const MAX_SAVED = 3;
// Three SCIPs per search ring, full stop. TalonFit is where the subscriber
// shops the ring and swaps candidates before spending them.
const SCIPS_PER_RING = 3;
const MIN_HEIGHT_FT = 100;

// Solver decision → the verdict vocabulary the existing cards/map markers use.
const VERDICT = { APPROVED: "fit", REJECTED: "ejected", VERIFY: "verify" };

/**
 * TalonFit® Scout — patent-pending, all-the-data-in-one-click feasibility solver.
 *
 * The search-ring center is NOT user-chosen: TalonFit anchors on the exact
 * coordinate of the Target the subscriber just ran the SCIP on, and draws the
 * 2-mile (10,560 ft) ring around it. A single click solves that coordinate;
 * a double-click saves it as a D/E/F candidate — GREEN/APPROVED only, three max.
 */
export default function ScoutPanel({ onActiveTargetChange }) {
  const navigate = useNavigate();
  const [center, setCenter] = useState(null);
  const [anchorLoading, setAnchorLoading] = useState(true);
  const [anchorError, setAnchorError] = useState("");
  // The SCIP record TalonFit is anchored to, and how many SCIPs this ring has used.
  const [anchorRecord, setAnchorRecord] = useState(null);
  const [locks, setLocks] = useState([]);
  const [targets, setTargets] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [probe, setProbe] = useState(null);
  const [peLetter, setPeLetter] = useState(false);
  const [proposal, setProposal] = useState({
    requested_height_ft: 150,
    compound_width_ft: 100,
    compound_depth_ft: 100,
  });
  const srcKey = (lat, lon) => `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const patch = (id, data) => setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));

  // Three SCIPs per ring. Candidates can be swapped freely in TalonFit before
  // any of them is SCIP'd.
  const scipAllowance = SCIPS_PER_RING;
  const scipsUsed = locks.length;
  const scipAvailable = scipsUsed < scipAllowance;
  const isLockedTarget = (t) => locks.some((l) => srcKey(l.latitude, l.longitude) === srcKey(t.lat, t.lon));

  // Anchor on the Target the user just SCIP'd — never an arbitrary new point.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [record] = await base44.entities.ScipRecord.list("-created_date", 1);
        if (cancelled) return;
        if (!record) { setAnchorLoading(false); return; }
        const t = record.parcel_targets?.[record.active_target_index ?? 0] || null;
        const lat = Number.isFinite(t?.latitude) ? t.latitude : record.latitude;
        const lon = Number.isFinite(t?.longitude) ? t.longitude : record.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          setAnchorError("Your most recent SCIP has no target coordinates — TalonFit cannot anchor a search ring.");
          setAnchorLoading(false);
          return;
        }
        const label = [record.site_name, t?.label, t?.parcel_address].filter(Boolean).join(" · ");
        setAnchorRecord(record);
        setCenter({ lat, lon, label: label || record.site_name || "SCIP target" });
        const existing = await base44.entities.ScoutScipLock.filter({ src_key: srcKey(lat, lon) }, "-locked_at", 5);
        if (!cancelled) setLocks(existing || []);
      } catch (e) {
        if (!cancelled) setAnchorError(e?.message || "Could not load your SCIP target.");
      } finally {
        if (!cancelled) setAnchorLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectTarget = (id) => {
    setActiveId(id);
    onActiveTargetChange?.(targets.find((t) => t.id === id) || null);
  };

  const solvePoint = (lat, lon, savedCount) =>
    base44.functions.invoke("talonfitAiSolve", {
      lat,
      lon,
      center_lat: center?.lat,
      center_lon: center?.lon,
      requested_height_ft: proposal.requested_height_ft,
      compound_width_ft: proposal.compound_width_ft,
      compound_depth_ft: proposal.compound_depth_ft,
      pe_letter_will_be_provided: peLetter,
      saved_count: savedCount,
    });

  const handleProbe = async ({ lat, lon }) => {
    setProbe({ lat, lon, verdict: "pending" });
    const { data } = await solvePoint(lat, lon, targets.length);
    const r = data?.calculated_result || {};
    setProbe({
      lat,
      lon,
      verdict: VERDICT[r.decision] || "verify",
      reason: r.reasons?.[0] || null,
      max_height_ft: r.maximum_buildable_height_ft ?? null,
    });
  };

  // Double-click save gate — GREEN APPROVED only, and only under three saved.
  const handleSavePoint = async ({ lat, lon }) => {
    if (targets.length >= MAX_SAVED) return;
    setProbe({ lat, lon, verdict: "pending" });
    const { data } = await solvePoint(lat, lon, targets.length);
    const r = data?.calculated_result || {};
    const save = data?.candidate_save || {};
    if (!save.save_allowed) {
      setProbe({
        lat,
        lon,
        verdict: VERDICT[r.decision] || "verify",
        reason: r.reasons?.[0] || "Not an approved TalonFit result — not saved.",
        max_height_ft: r.maximum_buildable_height_ft ?? null,
      });
      return;
    }
    setProbe(null);
    const id = `${Date.now()}-${lat}`;
    const target = {
      id,
      letter: save.slot || SLOTS[targets.length],
      lat,
      lon,
      verdict: VERDICT[r.decision],
      decision: r.decision,
      map_color: r.map_color,
      reason: r.reasons?.[0] || null,
      max_height_ft: r.maximum_buildable_height_ft,
      binding_constraint: r.binding_constraint || null,
      effective_multiplier: r.effective_fall_zone_multiplier ?? null,
      pe_letter_required: !!r.pe_letter_required,
      edge_distance_ft: r.distance_to_property_line_ft ?? null,
      distance_to_tower_ft: r.distance_to_nearest_existing_tower_ft ?? null,
      distance_to_structure_ft: r.distance_to_nearest_external_structure_ft ?? null,
      parcel: {
        address: data?.parcel?.address || null,
        apn: data?.parcel?.parcel_id || null,
        zoning: data?.parcel?.zoning_classification || null,
        geometry: data?.parcel?.geometry || null,
        owner: data?.parcel_details?.owner || null,
        acreage: data?.parcel_details?.acreage ?? null,
        county: data?.parcel_details?.county || null,
        state: data?.parcel_details?.state || null,
      },
      ordinance: {
        jurisdiction: data?.parcel?.jurisdiction || null,
        height_limit_ft: data?.ordinance_rules?.maximum_tower_height_ft ?? null,
        setback_ft: data?.ordinance_rules?.property_line_rule?.fixed_distance_ft ?? null,
        permit_type: data?.ordinance_rules?.approval_path || null,
        section_ref: data?.ordinance_rules?.property_line_rule?.citation || null,
        summary: data?.ordinance_summary || null,
      },
      unverified_fields: r.missing_information || [],
    };
    setTargets((prev) => [...prev, target]);
    setActiveId(id);
    onActiveTargetChange?.(target);
  };

  const handleSave = async (id) => {
    const t = targets.find((x) => x.id === id);
    if (!t) return;
    patch(id, { saving: true });
    const now = new Date().toISOString();
    await base44.entities.SiteCandidate.create({
      site_label: `${t.letter} — ${t.parcel?.address || `${t.lat.toFixed(6)}, ${t.lon.toFixed(6)}`}`,
      address: t.parcel?.address || undefined,
      latitude: t.lat,
      longitude: t.lon,
      apn: t.parcel?.apn || undefined,
      owner_name: t.parcel?.owner || undefined,
      acreage: t.parcel?.acreage ?? undefined,
      zoning_code: t.parcel?.zoning || undefined,
      jurisdiction: t.ordinance?.jurisdiction || undefined,
      parcel_geometry: t.parcel?.geometry || undefined,
      ordinance: t.ordinance || undefined,
      fit: {
        solver_version: "TalonFit-AI-1.0",
        max_height_ft: t.max_height_ft,
        binding_constraint: t.binding_constraint,
        feasible: t.decision === "APPROVED",
        decision: t.decision,
        reason: t.reason,
        edge_distance_ft: t.edge_distance_ft,
        effective_fall_zone_multiplier: t.effective_multiplier,
        pe_letter_required: t.pe_letter_required,
      },
      field_provenance: {
        parcel: { source: "Realie", timestamp: now, status: "source-scraped" },
        ordinance: { source: "SiteHawk ordinance library", timestamp: now, status: "source-scraped" },
        fit: { source: "TalonFit-AI-1.0 solver", timestamp: now, status: "source-scraped" },
      },
      unverified_fields: t.unverified_fields || [],
      status: "qualified",
      qualified_at: now,
    });
    patch(id, { saving: false, saved: true });
  };

  const handleRunScip = async (id) => {
    const t = targets.find((x) => x.id === id);
    if (!t || !scipAvailable) return;
    const siteName = `Target ${t.letter}${t.parcel?.address ? ` — ${t.parcel.address}` : ""}`.slice(0, 60);
    const created = await base44.entities.ScoutScipLock.create({
      src_key: srcKey(center.lat, center.lon),
      src_label: center.label || undefined,
      letter: t.letter,
      latitude: t.lat,
      longitude: t.lon,
      site_name: siteName,
      locked_at: new Date().toISOString(),
    });
    setLocks((prev) => [created, ...prev]);
    const p = new URLSearchParams({
      lat: String(t.lat.toFixed(6)),
      lon: String(t.lon.toFixed(6)),
      site_name: siteName,
      county: t.parcel?.county || "",
      state: t.parcel?.state || "",
    });
    navigate(`/scip/new?${p}`);
  };

  const handleRemove = (id) => {
    setTargets((prev) => prev.filter((t) => t.id !== id).map((t, i) => ({ ...t, letter: SLOTS[i] })));
    if (activeId === id) { setActiveId(null); onActiveTargetChange?.(null); }
  };

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Crosshair className="h-4 w-4 text-primary" />
          TalonFit-AI-1.0 Scout
        </div>
        <span className="text-xs text-muted-foreground">
          Patent-pending, all-the-data-in-one-click · click inside the 2-mile search ring to solve a point ·
          double-click saves only an APPROVED result
        </span>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={peLetter} onCheckedChange={setPeLetter} />
          PE letter will be provided
        </label>
        <span className="text-xs font-medium text-foreground">{targets.length}/{MAX_SAVED} saved (D·E·F)</span>
        <span className="text-xs font-medium text-muted-foreground">
          {scipsUsed}/{scipAllowance} SCIPs used in this ring
        </span>
      </div>

      <div className="border-t border-border">
        <ScoutAnchorBanner loading={anchorLoading} anchor={center} error={anchorError} />
      </div>

      <div className="border-t border-border p-3">
        <TalonFitProposalControls proposal={proposal} onChange={setProposal} minHeightFt={MIN_HEIGHT_FT} />
      </div>

      {center ? (
        <>
          <div className="border-t border-border">
            <ScoutRingMap
              center={center}
              targets={targets}
              probe={probe}
              onProbe={handleProbe}
              onSave={handleSavePoint}
              onSelect={selectTarget}
              canPick
            />
          </div>
          <div className="space-y-2 border-t border-border p-3">
            <p className="text-[11px] text-muted-foreground">
              SRC (search ring center) is your SCIP target: {center.label}. A single click solves that exact
              coordinate — APPROVED (green) showing the clicked coordinates and the maximum buildable tower
              height, REJECTED (red) with the binding failure reason, or VERIFY (amber) when an input is
              missing, assumed or unconfirmed. The search ring maximum is 2 miles / 10,560 ft and the tower
              minimum height is {MIN_HEIGHT_FT} ft. Double-click saves the spot as D, E or F — approved
              results only, three maximum.
            </p>
            {locks.map((l) => (
              <p key={l.id} className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] font-medium text-amber-700">
                SCIP run in this ring on Target {l.letter}{l.site_name ? ` (${l.site_name})` : ""}.
              </p>
            ))}
            {!scipAvailable && (
              <p className="text-[11px] font-medium text-amber-600">
                All {SCIPS_PER_RING} SCIPs for this ring are used. A different parcel requires a billable re-SCIP.
              </p>
            )}
            {targets.length >= MAX_SAVED && (
              <p className="text-[11px] font-medium text-amber-600">
                All three candidate slots (D·E·F) are used — remove one to save another.
              </p>
            )}
            {targets.length > 0 && <ScoutSheetsExport targets={targets} center={center} />}
            {targets.map((t) => (
              <ScoutTargetCard
                key={t.id}
                target={t}
                active={activeId === t.id}
                onSelect={selectTarget}
                onSave={handleSave}
                onRemove={handleRemove}
                onRunScip={handleRunScip}
                scipLocked={!scipAvailable && !isLockedTarget(t)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}