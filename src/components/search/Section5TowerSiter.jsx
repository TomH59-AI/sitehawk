import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { point, booleanPointInPolygon, circle as turfCircle } from "@turf/turf";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Layers, CheckCircle2, Download, Printer, AlertOctagon, FileText, ChevronDown, ChevronUp, Map } from "lucide-react";
import { computeLiveSiting } from "@/lib/towerSitingRules";
import LiveSitingVerdict from "@/components/towersiter/LiveSitingVerdict";
import { recompute, makeFrame, compoundRect } from "@/lib/towerSiterEngine";
import { siterEntitlements } from "@/lib/towerSiterAccess";
import { svgToPngDownload, svgToPdfDownload, exportExhibitB } from "@/lib/towerSiterExports";
import { loadPublicConfig } from "@/lib/publicConfig";
import { towerSiterParcel } from "@/functions/towerSiterParcel";
import { towerSiterOrdinance } from "@/functions/towerSiterOrdinance";
import { towerSiterResidential } from "@/functions/towerSiterResidential";
import { towerSiterSitings } from "@/functions/towerSiterSitings";
import SiterControls from "@/components/towersiter/SiterControls";
import ComplianceChips from "@/components/towersiter/ComplianceChips";
import SiterMap from "@/components/towersiter/SiterMap";
import ExhibitA from "@/components/towersiter/ExhibitA";
import UpgradeModal from "@/components/towersiter/UpgradeModal";
import Generate3DImageButton from "@/components/towersiter/Generate3DImageButton";
import Snapshot3DGallery from "@/components/towersiter/Snapshot3DGallery";
import SectionClearButton from "@/components/search/SectionClearButton";

// Section 5 — Tower Siter (pipeline-embedded).
// Accepts the pipeline's resolved Target A + zoning rules and auto-loads the
// parcel from the Target A coordinates, pre-filling height/setback from zoning.
export default function Section5TowerSiter({
  unlocked, active, onClear, onRun,
  targetA,       // resolved Target A from Section 3
  zoningResult,  // zoning result from Section 2 (carries max_height, setback rules)
  towerHeightFt, // default from search params
}) {
  const [user, setUser] = useState(null);
  const ent = useMemo(() => siterEntitlements(user), [user]);
  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const [expanded, setExpanded] = useState(false);
  const [parcel, setParcel] = useState(null);
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(false);

  // Pre-fill controls from zoning data when available
  const zoning = zoningResult?.zoning || zoningResult?.zoning || {};
  const defaultHeight = zoning?.max_height
    ? Math.min(Number(String(zoning.max_height).replace(/\D/g, "")) || towerHeightFt || 150, 300)
    : Math.min(towerHeightFt || 150, 300);

  const [controls, setControls] = useState({
    heightFt: defaultHeight,
    compoundW: 75, compoundD: 75,
    leaseW: 100, leaseD: 100,
    peToggle: false, peRadiusFt: "",
  });
  const [userAdjustedHeight, setUserAdjustedHeight] = useState(false);
  const [towerOverride, setTowerOverride] = useState(null);
  const [residential, setResidential] = useState(null);
  const [upgrade, setUpgrade] = useState(null);
  const [view, setView] = useState("map"); // "map" (interactive Mapbox) | "plan" (Exhibit A)
  const [snapshotUrl, setSnapshotUrl] = useState(null);
  const [snapshotRefresh, setSnapshotRefresh] = useState(0);
  const exhibitARef = useRef(null);

  // Auto-load the parcel from Target A's coordinates when the section is first expanded
  useEffect(() => {
    if (!expanded || !targetA?.latitude || !targetA?.longitude) return;
    if (parcel) return; // already loaded
    loadFromTargetA();
  }, [expanded, targetA?.latitude, targetA?.longitude]);

  // Sync height from pipeline whenever zoning or prop changes — but don't clobber user edits
  useEffect(() => {
    if (userAdjustedHeight) return;
    const zoning = zoningResult?.zoning || {};
    const zoningH = zoning?.max_height
      ? Math.min(Number(String(zoning.max_height).replace(/\D/g, "")) || 0, 300)
      : 0;
    const resolved = Math.min(zoningH || towerHeightFt || 150, 300);
    setControls((prev) => ({ ...prev, heightFt: resolved }));
  }, [zoningResult, towerHeightFt, userAdjustedHeight]);

  // Also pre-populate setback rules from zoning
  useEffect(() => {
    if (!zoningResult) return;
    const z = zoningResult?.zoning || {};
    // Build a rules object shaped like the towerSiterOrdinance response
    const derivedRules = {};
    if (z.max_height) {
      const h = Number(String(z.max_height).replace(/\D/g, ""));
      if (h > 0) derivedRules.max_height_ft = h;
    }
    if (z.fall_zone) derivedRules.fall_zone_rule = z.fall_zone;
    if (z.residential_separation) {
      const sep = Number(String(z.residential_separation).replace(/\D/g, ""));
      if (sep > 0) derivedRules.residential_separation_ft = sep;
    }
    if (Object.keys(derivedRules).length > 0) {
      setRules((prev) => ({ ...derivedRules, ...prev })); // don't overwrite a fetched ordinance
    }
  }, [zoningResult]);

  const loadFromTargetA = async () => {
    if (!targetA?.latitude || !targetA?.longitude) return;
    setLoading(true);
    try {
      const { data } = await towerSiterParcel({ mode: "location", lat: targetA.latitude, lon: targetA.longitude });
      const parcels = (data?.parcels || []).filter((p) => p.geometry);
      let hit = null;
      if (parcels.length) {
        hit = parcels.find((p) => {
          try { return booleanPointInPolygon(point([targetA.longitude, targetA.latitude]), { type: "Feature", properties: {}, geometry: p.geometry }); }
          catch { return false; }
        }) || parcels[0];
      }
      if (hit) {
        setParcel({ ...hit, source: "pipeline" });
        setTowerOverride(null);
        setResidential(null);
        // Try to load ordinance if we have jurisdiction info
        if (hit.state && hit.jurisdiction) {
          const { data: ord } = await towerSiterOrdinance({ state: hit.state, jurisdiction: hit.jurisdiction }).catch(() => ({ data: null }));
          if (ord?.rules) setRules(ord.rules);
        }
      } else {
        toast.error("No parcel boundary found at Target A — try the standalone Tower Siter with APN lookup.");
      }
    } catch (e) {
      console.error("Section 5 parcel load failed:", e);
      toast.error("Parcel load failed for Target A.");
    } finally {
      setLoading(false);
    }
  };

  const result = useMemo(() => {
    if (!parcel?.geometry) return null;
    try {
      return recompute({
        parcelGeoJSON: parcel.geometry,
        locationPoint: parcel.location?.coordinates || null,
        rules,
        towerHeightFt: Number(controls.heightFt) || 0,
        peToggle: controls.peToggle && ent.peAllowed,
        engineeredFallRadiusFt: controls.peRadiusFt === "" ? undefined : Number(controls.peRadiusFt),
        compoundW: Number(controls.compoundW) || 75,
        compoundD: Number(controls.compoundD) || 75,
        towerOverrideLonLat: towerOverride,
      });
    } catch { return { collapsed: true, banner: "Could not compute placement — check the parcel geometry." }; }
  }, [parcel, rules, controls, towerOverride, ent.peAllowed]);

  const leaseLonLat = useMemo(() => {
    if (!result || result.collapsed) return null;
    try { return compoundRect(result.towerFt, Number(controls.leaseW) || 100, Number(controls.leaseD) || 100, result.frame).lonLat; }
    catch { return null; }
  }, [result, controls.leaseW, controls.leaseD]);

  const onTowerDrag = useCallback((lonLat) => {
    if (!result?.parcel) return;
    try { if (!booleanPointInPolygon(point(lonLat), result.parcel)) return; } catch { return; }
    setTowerOverride(lonLat);
  }, [result?.parcel]);

  // Live drag verdict — recomputes on every drag tick (fall zone, compound and
  // setback geometry already move with the tower via recompute()).
  const liveSiting = useMemo(() => {
    if (!result || result.collapsed) return null;
    return computeLiveSiting({
      result,
      rules,
      compoundW: Number(controls.compoundW) || 75,
      compoundD: Number(controls.compoundD) || 75,
      separationCheck: null,
      residential,
    });
  }, [result, rules, controls.compoundW, controls.compoundD, residential]);

  const confirmPlacement = async () => {
    if (!result || result.collapsed) return;
    const sep = rules?.residential_separation_ft;
    if (!sep) { setResidential({ result: { status: "skip", label: "No residential separation rule on file" } }); return; }
    const key = result.towerLonLat.map((v) => v.toFixed(5)).join(",");
    if (residential?.key === key && residential.result) return;
    setResidential({ key, loading: true });
    try {
      const { data } = await towerSiterResidential({ lat: result.towerLonLat[1], lon: result.towerLonLat[0], separationFt: sep });
      const hits = data?.properties || [];
      setResidential({
        key,
        result: hits.length
          ? { status: "fail", label: `Residence within ${sep}′`, offendingAddress: hits[0].address }
          : { status: "pass", label: `No residences within ${sep}′` },
        circle: turfCircle(result.towerLonLat, sep, { units: "feet", steps: 64 }),
      });
    } catch {
      setResidential({ key, result: { status: "skip", label: "Residential check unavailable" } });
    }
  };

  const fileBase = `tower-siter-${(parcel?.apn || targetA?.apn || "target-a").toString().replace(/[^a-z0-9-]/gi, "_")}`;
  const exportA = async () => {
    if (!exhibitARef.current) { toast.error("Open the Plan Sheet view first."); return; }
    await svgToPngDownload(exhibitARef.current, `${fileBase}-exhibit-A.png`);
  };
  const exportPdf = async () => {
    if (!exhibitARef.current) { toast.error("Open the Plan Sheet view first."); return; }
    await svgToPdfDownload(exhibitARef.current, `${fileBase}-exhibit-A.pdf`);
  };
  const exportB = async () => {
    try {
      const cfg = await loadPublicConfig();
      await exportExhibitB({ token: cfg.mapboxAccessToken, result, watermark: ent.watermark, jurisdiction: parcel?.jurisdiction, filename: `${fileBase}-exhibit-B.png` });
    } catch (e) { toast.error(e.message); }
  };

  const exhibitMeta = {
    jurisdiction: parcel?.jurisdiction || targetA?.jurisdiction,
    apn: parcel?.apn || targetA?.apn,
    ownerName: parcel?.ownerName || targetA?.owner_name,
    acres: parcel?.acres || targetA?.acreage,
    calls: parcel?.calls,
    sourceLabel: parcel?.sourceLabel,
  };

  const isLocked = !unlocked;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header row — always visible */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
            isLocked ? "bg-muted text-muted-foreground" : expanded ? "bg-primary text-primary-foreground" : "bg-emerald-500 text-white"
          }`}>
            {isLocked ? "🔒" : "5"}
          </div>
          <div>
            <div className="font-heading font-bold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-500" /> Tower Siter
            </div>
            <div className="text-xs text-muted-foreground">
              {isLocked
                ? "Unlocks after Target A is resolved (Section 3)"
                : parcel
                  ? `Target A loaded — ${parcel.apn || "parcel ready"}`
                  : "Pre-loaded with Target A coordinates and zoning rules"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isLocked && <SectionClearButton onClear={onClear} />}
          {!isLocked && (
            <Button size="sm" variant="outline" onClick={() => {
              if (!expanded) { onRun?.(); }
              setExpanded((v) => !v);
            }}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {expanded ? "Collapse" : (active ? "Open" : "Run Tower Siter")}
            </Button>
          )}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && !isLocked && (
        <div className="border-t border-border p-4 bg-[#0C1B2E] space-y-4">
          {/* Parcel info banner */}
          {targetA && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70 space-y-0.5">
              <div className="font-heading font-bold text-white text-sm">
                {targetA.parcel_address || targetA.owner_name || "Target A"}
              </div>
              <div>
                Parcel ID: <b className="text-white/85">{parcel?.apn || parcel?.parcelId || targetA.apn || <span className="text-white/40 italic">loading from Realie…</span>}</b>
                {" · "}{targetA.acreage ? `${targetA.acreage} ac` : "—"}{targetA.zoning_classification ? ` · ${targetA.zoning_classification}` : ""}
              </div>
              {targetA.owner_name && <div>Owner: <b className="text-white/85">{targetA.owner_name}</b></div>}
              {zoning?.jurisdiction && <div className="text-cyan-300">Zoning jurisdiction: {zoning.jurisdiction}</div>}
              {loading && <div className="text-amber-300 animate-pulse">Loading parcel boundary from Realie…</div>}
              {!loading && !parcel && (
                <Button size="sm" className="mt-1" onClick={loadFromTargetA}>Load parcel boundary</Button>
              )}
            </div>
          )}

          {result?.collapsed && (
            <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300 flex items-center gap-2 font-semibold">
              <AlertOctagon className="w-5 h-5 shrink-0" />
              {result.banner || "No compliant placement at this height — try PE letter or shorter tower."}
            </div>
          )}

          {result && !result.collapsed && (
            <LiveSitingVerdict
              live={liveSiting}
              jurisdiction={parcel?.jurisdiction || targetA?.jurisdiction}
              rules={rules}
              unverified={result.unverified}
            />
          )}

          {result && !result.collapsed && (
            <ComplianceChips checks={result.checks} residential={residential} residentialAllowed={ent.residentialCheck} />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-4">
            {/* Controls rail */}
            <div className="space-y-3">
              <SiterControls controls={controls} onChange={(next) => {
            if (next.heightFt !== controls.heightFt) setUserAdjustedHeight(true);
            setControls(next);
          }} rules={rules} peAllowedByTier={ent.peAllowed} />

              {result && !result.collapsed && (
                <div className="space-y-2">
                  <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white" onClick={confirmPlacement}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Confirm placement
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" className="border-white/15 text-white/70" onClick={exportA}>
                      <Download className="w-3.5 h-3.5 mr-1" /> Exhibit A
                    </Button>
                    <Button size="sm" variant="outline" className="border-white/15 text-white/70" onClick={exportB}>
                      <Download className="w-3.5 h-3.5 mr-1" /> Exhibit B
                    </Button>
                  </div>
                  <Button size="sm" variant="outline" className="w-full border-white/15 text-white/70" onClick={exportPdf}>
                    <Printer className="w-3.5 h-3.5 mr-1" /> Print Exhibit A — PDF
                  </Button>
                  <Generate3DImageButton result={result} />
                  {snapshotUrl && (
                    <Snapshot3DGallery snapshotUrl={snapshotUrl} refreshKey={snapshotRefresh} towerId={null} />
                  )}
                </div>
              )}
            </div>

            {/* Interactive map / plan sheet */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Button size="sm" variant={view === "map" ? "default" : "outline"} className={view === "map" ? "" : "border-white/15 text-white/70"} onClick={() => setView("map")}>
                  <Map className="w-3.5 h-3.5 mr-1" /> Interactive Map
                </Button>
                <Button size="sm" variant={view === "plan" ? "default" : "outline"} className={view === "plan" ? "" : "border-white/15 text-white/70"} onClick={() => setView("plan")} disabled={!result || result.collapsed}>
                  <FileText className="w-3.5 h-3.5 mr-1" /> Plan Sheet (Exhibit A)
                </Button>
              </div>

              {view === "map" && (
                parcel?.geometry ? (
                  <>
                    <div className="h-[480px]">
                      <SiterMap
                        parcelGeoJSON={parcel.geometry}
                        result={result}
                        leaseLonLat={leaseLonLat}
                        residCircle={residential?.circle || null}
                        towerData={null}
                        draftPoints={[]}
                        onTowerDrag={onTowerDrag}
                        onMapClick={null}
                        clickMode={null}
                        rowData={null}
                      />
                    </div>
                    <p className="text-[11px] text-white/40">
                      🖱 Drag the tower pin (white/amber circle) to test other base locations on the parcel — the fall zone, compound, lease area and setback clearances all move and recompute live.
                    </p>
                  </>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-white/5 flex items-center justify-center h-48 text-white/30 text-sm">
                    Load parcel boundary to open the interactive map.
                  </div>
                )
              )}

              {view === "plan" && (
                result && !result.collapsed
                  ? <ExhibitA ref={exhibitARef} result={result} controls={controls} meta={exhibitMeta} watermark={ent.watermark} />
                  : (
                    <div className="rounded-xl border border-white/10 bg-white/5 flex items-center justify-center h-48 text-white/30 text-sm">
                      {parcel ? "Adjust controls to compute a compliant placement." : "Load parcel boundary to generate the plan sheet."}
                    </div>
                  )
              )}

              {/* keep ExhibitA mounted (hidden) so exports work from map view */}
              {view !== "plan" && result && !result.collapsed && (
                <div className="hidden" aria-hidden="true">
                  <ExhibitA ref={exhibitARef} result={result} controls={controls} meta={exhibitMeta} watermark={ent.watermark} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <UpgradeModal open={!!upgrade} onClose={() => setUpgrade(null)} reason={upgrade} />
    </div>
  );
}