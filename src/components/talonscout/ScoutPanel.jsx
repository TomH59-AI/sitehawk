import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Crosshair } from "lucide-react";
import ScoutAddressForm from "./ScoutAddressForm";
import ScoutRingMap from "./ScoutRingMap";
import ScoutTargetCard from "./ScoutTargetCard";

const LETTERS = "ABCDEFGHIJ".split("");
const MAX_TARGETS = 10;

// TalonFit® Ten-Target Scout — drop a waypoint, then grade up to ten candidate
// points inside the 1-mile ring. A better parcel means a re-SCIP (billable).
export default function ScoutPanel() {
  const [center, setCenter] = useState(null);
  const [targets, setTargets] = useState([]);
  const [activeId, setActiveId] = useState(null);

  const patch = (id, data) => setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));

  const handleWaypoint = (wp) => {
    setCenter(wp);
    setTargets([]);
    setActiveId(null);
  };

  const handlePick = async ({ lat, lon }) => {
    if (targets.length >= MAX_TARGETS) return;
    const id = `${Date.now()}-${lat}`;
    const letter = LETTERS[targets.length];
    setTargets((prev) => [...prev, { id, letter, lat, lon, verdict: "pending" }]);
    setActiveId(id);
    const { data } = await base44.functions.invoke("talonfitScoutPoint", { lat, lon });
    patch(id, {
      verdict: data?.verdict || "verify",
      reason: data?.reason || null,
      max_height_ft: data?.max_height_ft ?? null,
      binding_constraint: data?.binding_constraint || null,
      parcel: data?.parcel || null,
      ordinance: data?.ordinance || null,
      edge_distance_ft: data?.edge_distance_ft ?? null,
      unverified_fields: data?.unverified_fields || [],
    });
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
      },
      field_provenance: {
        parcel: { source: "Realie", timestamp: now, status: "source-scraped" },
        ordinance: { source: "Notion zoning ordinance lookup", timestamp: now, status: "source-scraped" },
        fit: { source: "TalonFit® point screen", timestamp: now, status: "source-scraped" },
      },
      unverified_fields: t.unverified_fields || [],
      status: t.verdict === "fit" ? "qualified" : "partially_qualified",
      qualified_at: now,
    });
    patch(id, { saving: false, saved: true });
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
          0.25 / 0.50 / 1-mile rings · click up to 10 points inside the 1-mile ring
        </span>
        <span className="ml-auto text-xs font-medium text-foreground">
          {targets.length}/{MAX_TARGETS} targets
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
              onPick={handlePick}
              onSelect={setActiveId}
              canPick={targets.length < MAX_TARGETS}
            />
          </div>
          <div className="space-y-2 border-t border-border p-3">
            <p className="text-[11px] text-muted-foreground">
              Waypoint: {center.label}. Green shows the maximum allowable tower height at that exact
              coordinate; red is EJECTED with the binding reason. Picking a better parcel after your SCIP
              requires a re-SCIP, which is billable.
            </p>
            {targets.map((t) => (
              <ScoutTargetCard
                key={t.id}
                target={t}
                active={activeId === t.id}
                onSelect={setActiveId}
                onSave={handleSave}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="border-t border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Enter an address or coordinates to drop the tower waypoint and draw the search rings.
        </p>
      )}
    </div>
  );
}