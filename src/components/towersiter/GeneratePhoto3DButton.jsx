/**
 * GeneratePhoto3DButton — launches the Photorealistic 3D Tower Siting Exhibit.
 * Persists a TowerSitingRun before navigating so the exhibit can be hydrated
 * from DB on refresh/deep-link. Navigation always happens even if DB save fails.
 */
import { useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useBilling } from "@/lib/useBilling";
import { base44 } from "@/api/base44Client";
import { centroid as turfCentroid } from "@turf/turf";
import Photo3DUpgradeModal from "@/components/photorealistic3d/Photo3DUpgradeModal";

const EXHIBIT_DISCLAIMER =
  "Preliminary Tower Siting Exhibit — NOT final engineering, NOT a stamped survey, and NOT a final zoning determination.";

/** Build a normalized viewer payload from live Tower Siter state */
function buildViewerPayload({ result, controls, parcel, rules, sitingRun }) {
  const towerLon = result.towerLonLat?.[0];
  const towerLat = result.towerLonLat?.[1];

  // Resolve parcel centroid: prefer explicit centroid, fall back to turf
  let centroidLat = towerLat;
  let centroidLon = towerLon;
  if (result.parcel) {
    try {
      const c = turfCentroid(result.parcel);
      centroidLon = c.geometry.coordinates[0];
      centroidLat = c.geometry.coordinates[1];
    } catch (_) {}
  }

  const heightFt = Number(controls?.heightFt) || sitingRun?.tower_height_ft || 199;
  const compoundW = Number(controls?.compoundW) || sitingRun?.compound_width_ft || 75;
  const compoundD = Number(controls?.compoundD) || sitingRun?.compound_depth_ft || 75;
  const towerType = sitingRun?.tower_type || "monopole";

  // GeoJSON overlays — prefer live result geometry, fall back to sitingRun fields
  const parcelBoundary =
    result.parcel?.geometry || result.parcel || sitingRun?.parcel_geometry || null;
  const candidateArea =
    result.envelope?.geometry
      ? { type: "Feature", geometry: result.envelope.geometry }
      : sitingRun?.candidate_area_geojson || null;
  const compoundGeojson =
    result.compound?.lonLat?.geometry
      ? { type: "Feature", geometry: result.compound.lonLat.geometry }
      : sitingRun?.compound_geojson || null;
  const fallZone =
    result.checks?.fallZone?.circle?.geometry
      ? { type: "Feature", geometry: result.checks.fallZone.circle.geometry }
      : sitingRun?.fall_zone_geojson || null;
  const propertySetback =
    result.propertySetbackGeoJSON || sitingRun?.property_setback_geojson || null;
  const conflictLayers =
    result.conflictLayersGeoJSON || sitingRun?.conflict_layers_geojson || null;

  return {
    // Core location
    lat: towerLat,
    lon: towerLon,
    centroidLat,
    centroidLon,
    // Controls
    controls: { heightFt, compoundW, compoundD, towerType },
    landscapeBuffer: rules?.setback_ft || rules?.fall_zone_ft || 0,
    // Address / identity
    parcelAddress:
      parcel?.addressFull || parcel?.parcel_address || parcel?.apn || null,
    siteName: parcel?.addressFull || parcel?.apn || sitingRun?.property_address || null,
    // IDs
    towerSitingRunId: sitingRun?.id || null,
    scipRecordId: sitingRun?.scip_record_id || parcel?.scip_record_id || null,
    searchResultId: sitingRun?.search_result_id || null,
    parcelId: parcel?.apn || sitingRun?.parcel_id || null,
    // GeoJSON
    sitingGeojson: {
      parcelBoundary,
      candidateArea,
      compoundGeojson,
      fallZone,
      propertySetback,
      conflictLayers,
    },
    // Metadata
    sitingMeta: {
      towerSitingRunId: sitingRun?.id || null,
      resultClass: sitingRun?.result_class || null,
      feasible: sitingRun?.feasible ?? null,
      jurisdictionName:
        sitingRun?.jurisdiction_name || parcel?.jurisdiction || null,
      towerHeightFt: heightFt,
    },
    // Disclaimer
    exhibitDisclaimer: EXHIBIT_DISCLAIMER,
  };
}

/** Build TowerSitingRun entity payload from live state */
function buildRunPayload({ result, controls, parcel, rules, sitingRun }) {
  const heightFt = Number(controls?.heightFt) || sitingRun?.tower_height_ft || 199;
  const compoundW = Number(controls?.compoundW) || sitingRun?.compound_width_ft || 75;
  const compoundD = Number(controls?.compoundD) || sitingRun?.compound_depth_ft || 75;

  let centroidLat = result.towerLonLat?.[1];
  let centroidLon = result.towerLonLat?.[0];
  if (result.parcel) {
    try {
      const c = turfCentroid(result.parcel);
      centroidLon = c.geometry.coordinates[0];
      centroidLat = c.geometry.coordinates[1];
    } catch (_) {}
  }

  return {
    parcel_id: parcel?.apn || null,
    property_address: parcel?.addressFull || parcel?.parcel_address || parcel?.apn || null,
    parcel_geometry: result.parcel?.geometry || result.parcel || null,
    parcel_centroid_lat: centroidLat,
    parcel_centroid_lon: centroidLon,
    jurisdiction_name: parcel?.jurisdiction || null,
    jurisdiction_rules: rules || null,
    zoning_source: rules ? "telecom_ordinances" : "unverified",
    zoning_confidence: rules ? "medium" : "unverified",
    tower_height_ft: heightFt,
    tower_type: "monopole",
    compound_width_ft: compoundW,
    compound_depth_ft: compoundD,
    pe_toggle: !!controls?.peToggle,
    candidate_area_geojson: result.envelope?.geometry
      ? { type: "Feature", geometry: result.envelope.geometry }
      : null,
    compound_geojson: result.compound?.lonLat?.geometry
      ? { type: "Feature", geometry: result.compound.lonLat.geometry }
      : null,
    fall_zone_geojson: result.checks?.fallZone?.circle?.geometry
      ? { type: "Feature", geometry: result.checks.fallZone.circle.geometry }
      : null,
    siting_result: {
      towerLonLat: result.towerLonLat,
      checks: result.checks,
    },
    feasible: !result.collapsed &&
      Object.values(result.checks || {}).every(
        (c) => c === true || c?.status !== "fail"
      ),
    status: "completed",
  };
}

export default function GeneratePhoto3DButton({ result, controls, parcel, rules, sitingRun }) {
  const navigate = useNavigate();
  const { tierKey, admin, loading } = useBilling();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!result || result.collapsed) return null;
  const towerLon = result.towerLonLat?.[0];
  const towerLat = result.towerLonLat?.[1];
  if (!towerLon || !towerLat) return null;

  const blocked =
    !loading && !admin &&
    (tierKey === "free" || tierKey === "hawk_site" || tierKey === "hawk_site_law");

  const handleClick = async () => {
    if (blocked) { setShowUpgrade(true); return; }

    setSaving(true);
    const viewerPayload = buildViewerPayload({ result, controls, parcel, rules, sitingRun });
    const runPayload = buildRunPayload({ result, controls, parcel, rules, sitingRun });

    let savedRunId = sitingRun?.id || null;
    let persistWarning = null;

    try {
      let saved;
      if (savedRunId) {
        saved = await base44.entities.TowerSitingRun.update(savedRunId, runPayload);
      } else {
        saved = await base44.entities.TowerSitingRun.create(runPayload);
      }
      savedRunId = saved?.id || savedRunId;
    } catch (e) {
      console.warn("[3D Exhibit] Could not persist TowerSitingRun — refresh/deep-link unavailable:", e);
      persistWarning = "Run could not be saved — exhibit will not survive a page refresh.";
    }

    // Always navigate — DB failure is non-blocking
    const finalPayload = {
      ...viewerPayload,
      towerSitingRunId: savedRunId,
      sitingMeta: {
        ...viewerPayload.sitingMeta,
        towerSitingRunId: savedRunId,
      },
      persistWarning,
    };

    const url = savedRunId
      ? `/photo-3d-viewer?runId=${savedRunId}`
      : "/photo-3d-viewer";

    setSaving(false);
    navigate(url, { state: finalPayload });
  };

  return (
    <>
      <Button
        size="sm"
        className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold gap-2 border-0"
        onClick={handleClick}
        disabled={loading || saving}
      >
        {saving
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Globe className="w-3.5 h-3.5" />
        }
        {saving ? "Preparing…" : "3D Exhibit"}
      </Button>

      <Photo3DUpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </>
  );
}