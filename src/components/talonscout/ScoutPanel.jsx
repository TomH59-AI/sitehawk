import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Crosshair } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import ScoutAddressForm from "./ScoutAddressForm";
import ScoutRingMap from "./ScoutRingMap";
import ScoutTargetCard from "./ScoutTargetCard";
import ScoutSheetsExport from "./ScoutSheetsExport";

const LETTERS = "ABCDEFGHIJ".split("");
const BASE_TARGETS = 5;
const PE_BONUS_TARGETS = 5;

// TalonFit® Ten-Target Scout — drop the SRC waypoint, click inside the 1-mile ring
// to grade a point, double-click to save it as a lettered candidate (A–E, +F–J with
// a PE letter). Pick ONE saved target to run the SCIP on.
export default function ScoutPanel() {
  const navigate = useNavigate();
  const [center, setCenter] = useState(null);
  const [targets, setTargets] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [probe, setProbe] = useState(null);
  const [peLetter, setPeLetter] = useState(false);
  // Only one SCIP may be run per scout ring. The lock is persisted server-side
  // (ScoutScipLock) keyed to the SRC, so refreshing cannot free a second SCIP.
  const [lock, setLock] = useState(null);

  const srcKey = (lat, lon) => `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const isLockedTarget = (t) =>
    !!lock && srcKey(lock.latitude, lock.longitude) === srcKey(t.lat, t.lon);

  const maxTargets = BASE_TARGETS + (peLetter ? PE_BONUS_TARGETS : 0);
  const patch = (id, data) => setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));

  const gradePoint = (lat, lon) =>
    base44.functions.invoke("talonfitScoutPoint", { lat, lon, has_pe_letter: peLetter });

  const handleWaypoint = async (wp) => {
    setCenter(wp);
    setTargets([]);
    setActiveId(null);
    setProbe(null);
    const existing = await base44.entities.ScoutScipLock.filter(
      { src_key: srcKey(wp.lat, wp.lon) },
      "-locked_at",
      1
    );
    setLock(existing?.[0] || null);
  };

  const handleProbe = async ({ lat, lon }) => {
    setProbe({ lat, lon, verdict: "pending" });
    const { data } = await gradePoint(lat, lon);
    setProbe({
      lat,
      lon,
      verdict: data?.verdict || "verify",
      reason: data?.reason || null,
      max_height_ft: data?.max_height_ft ?? null,
    });
  };

  // Only spots the TalonFit® formula APPROVES are saved as lettered targets.
  // Anything the solver ejects (or can't confirm) stays on the map as a probe
  // readout with its binding reason — it never becomes a candidate.
  const handleSavePoint = async ({ lat, lon }) => {
    if (targets.length >= maxTargets) return;
    setProbe({ lat, lon, verdict: "pending" });
    const { data } = await gradePoint(lat, lon);
    const verdict = data?.verdict || "verify";
    if (verdict !== "fit" || data?.max_height_ft == null) {
      setProbe({
        lat,
        lon,
        verdict,
        reason: data?.reason || "Does not meet the TalonFit® buildable-height requirement — not saved.",
        max_height_ft: data?.max_height_ft ?? null,
      });
      return;
    }
    setProbe(null);
    const id = `${Date.now()}-${lat}`;
    setTargets((prev) => [
      ...prev,
      {
        id,
        letter: LETTERS[prev.length],
        lat,
        lon,
        verdict,
        reason: data?.reason || null,
        max_height_ft: data.max_height_ft,
        binding_constraint: data?.binding_constraint || null,
        parcel: data?.parcel || null,
        ordinance: data?.ordinance || null,
        edge_distance_ft: data?.edge_distance_ft ?? null,
        unverified_fields: data?.unverified_fields || [],
      },
    ]);
    setActiveId(id);
  };

  const handleSave = async (id) => {
    const t = targets.find((x) => x.id === id);
    if (!t) return;
    patch(id, { saving: true });
    const now = new Date().toISOString();
    await base44.entities.SiteCandidate.create({
      site_label: `${t.letter} — ${t.parcel?.address || `${t.lat.toFixed(5)}, ${t.lon.toFixed(5)}`}`,
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
        max_height_ft: t.max_height_ft,
        binding_constraint: t.binding_constraint,
        feasible: t.verdict === "fit",
        verdict: t.verdict,
        reason: t.reason,
        edge_distance_ft: t.edge_distance_ft,
        pe_letter: peLetter,
      },
      field_provenance: {
        parcel: { source: "Realie", timestamp: now, status: "source-scraped" },
        ordinance: { source: "Notion zoning ordinance lookup", timestamp: now, status: "source-scraped" },
        fit: { source: "TalonFit® point screen", timestamp: now, status: "source-scraped" },
      },
      unverified_fields: t.unverified_fields || [],
      status: "qualified",
      qualified_at: now,
    });
    patch(id, { saving: false, saved: true });
  };

  const handleRunScip = async (id) => {
    const t = targets.find((x) => x.id === id);
    if (!t || lock) return;
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
    setLock(created);
    const p = new URLSearchParams({
      lat: String(t.lat.toFixed(5)),
      lon: String(t.lon.toFixed(5)),
      site_name: siteName,
      county: t.parcel?.county || "",
      state: t.parcel?.state || "",
    });
    navigate(`/scip/new?${p}`);
  };

  const handleRemove = (id) =>
    setTargets((prev) => prev.filter((t) => t.id !== id).map((t, i) => ({ ...t, letter: LETTERS[i] })));

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Crosshair className="h-4 w-4 text-primary" />
          Ten-Target Scout
        </div>
        <span className="text-xs text-muted-foreground">
          Click inside the 2-mile ring to grade a point · double-click saves it only if it passes TalonFit®
        </span>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={peLetter} onCheckedChange={setPeLetter} />
          PE letter (engineered fall zone)
        </label>
        <span className="text-xs font-medium text-foreground">
          {targets.length}/{maxTargets} saved
        </span>
      </div>

      <div className="border-t border-border p-3">
        <ScoutAddressForm onWaypoint={handleWaypoint} />
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
              onSelect={setActiveId}
              canPick
            />
          </div>
          <div className="space-y-2 border-t border-border p-3">
            <p className="text-[11px] text-muted-foreground">
              SRC (search ring center): {center.label}. A single click grades that exact coordinate —
              APPROVED with the maximum allowable tower height, or REJECTED with the binding reason.
              Anywhere inside the 2-mile scan radius can be graded. Double-click saves the spot as{" "}
              {peLetter ? "A–J" : "A–E"} — but ONLY when TalonFit® approves it and returns a buildable
              height; rejected spots are never saved
              {peLetter ? "" : " (turn on PE letter for five more)"}. Select one saved target and run the
              SCIP on it — one at a time. Picking a better parcel after your SCIP requires a re-SCIP,
              which is billable.
            </p>
            {lock && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] font-medium text-amber-700">
                SCIP already started on this search ring — Target {lock.letter}
                {lock.site_name ? ` (${lock.site_name})` : ""}. All other targets are locked. A different
                parcel requires a billable re-SCIP.
              </p>
            )}
            {targets.length >= maxTargets && (
              <p className="text-[11px] font-medium text-amber-600">
                All {maxTargets} saved spots used{peLetter ? "" : " — turn on PE letter for five more"}.
              </p>
            )}
            {targets.length > 0 && <ScoutSheetsExport targets={targets} center={center} />}
            {targets.map((t) => (
              <ScoutTargetCard
                key={t.id}
                target={t}
                active={activeId === t.id}
                onSelect={setActiveId}
                onSave={handleSave}
                onRemove={handleRemove}
                onRunScip={handleRunScip}
                scipLocked={!!lock && !isLockedTarget(t)}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="border-t border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Enter an address or coordinates to drop the SRC waypoint and draw the search rings.
        </p>
      )}
    </div>
  );
}