import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { point, booleanPointInPolygon, circle as turfCircle, area as turfArea } from "@turf/turf";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Map as MapIcon, FileText, Download, Send, CheckCircle2, AlertOctagon, Layers } from "lucide-react";

import { recompute, makeFrame, polygonFromFrame, compoundRect, polygonFromCalls } from "@/lib/towerSiterEngine";
import { siterEntitlements, DEMO_PARCEL } from "@/lib/towerSiterAccess";
import { svgToPngDownload, exportExhibitB } from "@/lib/towerSiterExports";
import { loadPublicConfig } from "@/lib/publicConfig";
import { towerSiterParcel } from "@/functions/towerSiterParcel";
import { towerSiterOrdinance } from "@/functions/towerSiterOrdinance";
import { towerSiterResidential } from "@/functions/towerSiterResidential";
import { towerSiterSitings } from "@/functions/towerSiterSitings";

import ParcelInputPanel from "../components/towersiter/ParcelInputPanel";
import SiterControls from "../components/towersiter/SiterControls";
import ComplianceChips from "../components/towersiter/ComplianceChips";
import RuleCard from "../components/towersiter/RuleCard";
import SiterMap from "../components/towersiter/SiterMap";
import ExhibitA from "../components/towersiter/ExhibitA";
import UpgradeModal from "../components/towersiter/UpgradeModal";

// HawkPerch — Tower Siter. Single source of truth for placement math is
// lib/towerSiterEngine.js (recompute pipeline). NO Zoneomics, NO Regrid —
// Realie only, ≈2 calls per siting, all logged to api_call_ledger.
export default function TowerSiter() {
  const [user, setUser] = useState(null);
  const ent = useMemo(() => siterEntitlements(user), [user]);

  const [parcel, setParcel] = useState(null);
  const [parcelOptions, setParcelOptions] = useState([]);
  const [rules, setRules] = useState(null);
  const [controls, setControls] = useState({ heightFt: 195, compoundW: 75, compoundD: 75, leaseW: 100, leaseD: 100, peToggle: false, peRadiusFt: "" });
  const [towerOverride, setTowerOverride] = useState(null);
  const [residential, setResidential] = useState(null); // { key, loading, result, circle }
  const [view, setView] = useState("map");
  const [busy, setBusy] = useState(false);
  const [upgrade, setUpgrade] = useState(null); // reason string | null
  const [clickMode, setClickMode] = useState(null);
  const [draftPoints, setDraftPoints] = useState([]);
  const [manualRect, setManualRect] = useState({ w: "", d: "" });
  const [pendingPlat, setPendingPlat] = useState(null);
  const exhibitARef = useRef(null);

  useEffect(() => { base44.auth.me().then(setUser).catch(() => setUser(null)); }, []);

  /* ---------------- engine — recompute on every control change / drag ---------------- */
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
    } catch (e) {
      console.error("recompute failed:", e);
      return { collapsed: true, banner: "Could not compute a placement on this boundary — check the parcel geometry." };
    }
  }, [parcel, rules, controls, towerOverride, ent.peAllowed]);

  const leaseLonLat = useMemo(() => {
    if (!result || result.collapsed) return null;
    try {
      return compoundRect(result.towerFt, Number(controls.leaseW) || 100, Number(controls.leaseD) || 100, result.frame).lonLat;
    } catch { return null; }
  }, [result, controls.leaseW, controls.leaseD]);

  /* ---------------- parcel loading + tier gate (fires with the engine, not on page load) ---------------- */
  const loadParcel = useCallback(async (p, source) => {
    if (source !== "demo") {
      if (!ent.realParcels) {
        setUpgrade("Tower Siter on your own parcels requires a paid plan. The demo parcel is free to explore.");
        return;
      }
      if (Number.isFinite(ent.monthlyRuns)) {
        const { data } = await towerSiterSitings({ action: "count" });
        if ((data?.count ?? 0) >= ent.monthlyRuns) {
          setUpgrade(`You've used your ${ent.monthlyRuns} ${ent.label} sitings this month. Upgrade to HawkVision for unlimited sitings, clean exports and the PE toggle.`);
          return;
        }
      }
    }
    setParcel({ ...p, source });
    setParcelOptions([]);
    setTowerOverride(null);
    setResidential(null);
    setRules(null);
    setClickMode(null);
    setDraftPoints([]);
    if (p.state && p.jurisdiction) {
      try {
        const { data } = await towerSiterOrdinance({ state: p.state, jurisdiction: p.jurisdiction });
        setRules(data?.rules || null);
      } catch (e) { console.error("ordinance lookup failed:", e); setRules(null); }
    }
  }, [ent]);

  const handleLookup = async (mode, payload) => {
    setBusy(true);
    try {
      const { data } = await towerSiterParcel({ mode, ...payload });
      const parcels = (data?.parcels || []).filter((p) => p.geometry);
      if (!parcels.length) { toast.error("No parcel boundary found — try the plat upload or manual entry (Tier 2/3)."); return; }
      if (parcels.length === 1) await loadParcel(parcels[0], "realie");
      else setParcelOptions(parcels);
    } catch (e) {
      console.error(e);
      toast.error("Parcel lookup failed — try again.");
    } finally { setBusy(false); }
  };

  const handleMapClick = async (lonLat) => {
    if (clickMode === "parcel") {
      setBusy(true);
      try {
        const { data } = await towerSiterParcel({ mode: "location", lat: lonLat[1], lon: lonLat[0] });
        const parcels = (data?.parcels || []).filter((p) => p.geometry);
        const hit = parcels.find((p) => { try { return booleanPointInPolygon(point(lonLat), p.geometry.type ? { type: "Feature", properties: {}, geometry: p.geometry } : p.geometry); } catch { return false; } }) || parcels[0];
        if (!hit) { toast.error("No parcel found at that point."); return; }
        await loadParcel(hit, "realie");
      } finally { setBusy(false); }
    } else if (clickMode === "rectCenter" || (clickMode === "platAnchor" && pendingPlat?.method === "dimensions")) {
      const w = clickMode === "rectCenter" ? Number(manualRect.w) : pendingPlat.width_ft;
      const d = clickMode === "rectCenter" ? Number(manualRect.d) : pendingPlat.depth_ft;
      const frame = makeFrame(lonLat);
      const geom = compoundRect([0, 0], w, d, frame).lonLat.geometry;
      await loadParcel({
        geometry: geom, location: { type: "Point", coordinates: lonLat },
        apn: "MANUAL", ownerName: null, acres: Math.round((w * d / 43560) * 100) / 100,
        jurisdiction: null, state: null,
        sourceLabel: clickMode === "platAnchor" ? "FROM USER-SUPPLIED IMAGE — NOT A SURVEY" : "MANUAL ENTRY — NOT A SURVEY",
      }, clickMode === "platAnchor" ? "plat" : "manual");
      setPendingPlat(null);
    } else if (clickMode === "platAnchor" && pendingPlat?.method === "calls") {
      try {
        const { polygonFt, miscloseFt, warned } = polygonFromCalls(pendingPlat.calls);
        const frame = makeFrame(lonLat);
        const geom = polygonFromFrame(polygonFt, frame).geometry;
        const acres = Math.round((turfArea({ type: "Feature", properties: {}, geometry: geom }) / 4046.86) * 100) / 100;
        await loadParcel({
          geometry: geom, location: { type: "Point", coordinates: lonLat },
          apn: "PLAT", ownerName: null, acres, jurisdiction: null, state: null,
          calls: pendingPlat.calls,
          sourceLabel: "FROM USER-SUPPLIED IMAGE — NOT A SURVEY",
        }, "plat");
        if (warned) toast.warning(`Boundary misclosure of ${miscloseFt.toFixed(1)}′ was distributed (compass rule) — verify against the plat.`);
        toast.info("Reconstructed boundary shown — confirm it matches your plat before siting.");
        setPendingPlat(null);
      } catch (e) {
        console.error(e);
        toast.error(`Could not reconstruct the boundary: ${e.message}`);
      }
    } else if (clickMode === "polygon") {
      setDraftPoints((p) => [...p, lonLat]);
    }
  };

  const finishPolygon = async () => {
    if (draftPoints.length < 3) return;
    const ring = [...draftPoints, draftPoints[0]];
    const geom = { type: "Polygon", coordinates: [ring] };
    const acres = Math.round((turfArea({ type: "Feature", properties: {}, geometry: geom }) / 4046.86) * 100) / 100;
    await loadParcel({
      geometry: geom, location: { type: "Point", coordinates: draftPoints[0] },
      apn: "MANUAL", acres, jurisdiction: null, state: null,
      sourceLabel: "MANUAL ENTRY — NOT A SURVEY",
    }, "manual");
  };

  /* ---------------- tower drag — clamp inside parcel, live recompute ---------------- */
  const onTowerDrag = useCallback((lonLat) => {
    if (!result?.parcel) return;
    try { if (!booleanPointInPolygon(point(lonLat), result.parcel)) return; } catch { return; }
    setTowerOverride(lonLat);
  }, [result?.parcel]);

  /* ---------------- residential separation — fires ONCE on Confirm, cached per session ---------------- */
  const confirmPlacement = async () => {
    if (!result || result.collapsed) return;
    const sep = rules?.residential_separation_ft;
    if (!sep) { setResidential({ result: { status: "skip", label: "No residential separation rule on file" } }); return; }
    const key = result.towerLonLat.map((v) => v.toFixed(5)).join(",");
    if (residential?.key === key && residential.result) return; // cached
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
    } catch (e) {
      console.error(e);
      setResidential({ key, result: { status: "skip", label: "Residential check unavailable" } });
    }
  };

  /* ---------------- exports ---------------- */
  const fileBase = `tower-siter-${(parcel?.apn || "site").toString().replace(/[^a-z0-9-]/gi, "_")}`;
  const exportA = async () => {
    if (!exhibitARef.current) { toast.error("Open the Plan Sheet view first."); return; }
    await svgToPngDownload(exhibitARef.current, `${fileBase}-exhibit-A.png`);
  };
  const exportB = async () => {
    try {
      const cfg = await loadPublicConfig();
      await exportExhibitB({ token: cfg.mapboxAccessToken, result, watermark: ent.watermark, jurisdiction: parcel?.jurisdiction, filename: `${fileBase}-exhibit-B.png` });
    } catch (e) { toast.error(e.message); }
  };
  const sendToScip = async () => {
    if (!result || result.collapsed) return;
    const { data } = await towerSiterSitings({
      action: "insert",
      parcel_apn: parcel?.apn || null,
      state: parcel?.state || null,
      jurisdiction: parcel?.jurisdiction || null,
      geojson: {
        parcel: result.parcel.geometry,
        tower: { type: "Point", coordinates: result.towerLonLat },
        compound: result.compound.lonLat.geometry,
      },
      params: {
        tower_height_ft: Number(controls.heightFt),
        setback_ft: result.setback,
        fall_radius_ft: result.fallRadius,
        setback_rule_applied: result.peApplied ? "pe_engineered" : rules?.setback_rule || "1to1_unverified",
        pe: result.peApplied,
        compound: { w: Number(controls.compoundW), d: Number(controls.compoundD) },
      },
      checks: {
        height: result.checks?.height?.status,
        setback: result.checks?.setback?.status,
        fall_zone: result.checks?.fallZone?.status,
        compound: result.checks?.compound?.status,
        residential: residential?.result?.status || "not_run",
      },
    });
    if (data?.ok) toast.success("Siting saved — available to the SCIP pipeline.");
    else toast.error(data?.error || "Save failed.");
  };

  const exhibitMeta = {
    jurisdiction: parcel?.jurisdiction, apn: parcel?.apn, ownerName: parcel?.ownerName,
    acres: parcel?.acres, calls: parcel?.calls, sourceLabel: parcel?.sourceLabel,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground flex items-center gap-2">
            <Layers className="w-6 h-6 text-blue-500" /> Tower Siter
          </h1>
          <p className="text-sm text-muted-foreground">Compliant tower placement on any parcel — setbacks, fall zone, compound fit. {ent.label} plan.</p>
        </div>
        {ent.batch && (
          <Button size="sm" variant="outline" disabled title="Phase 2">Batch site from scan — Phase 2</Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[350px,1fr] gap-4">
        {/* left rail */}
        <div className="space-y-3 rounded-2xl bg-[#0C1B2E] border border-white/10 p-3">
          <ParcelInputPanel
            ent={ent} busy={busy} clickMode={clickMode} setClickMode={setClickMode}
            onLookup={handleLookup}
            onUseDemo={() => loadParcel(DEMO_PARCEL, "demo")}
            onPlatParsed={(p) => { setPendingPlat(p); setClickMode("platAnchor"); }}
            parcelOptions={parcelOptions}
            onPickOption={(i) => loadParcel(parcelOptions[i], "realie")}
            manualRect={manualRect} setManualRect={setManualRect}
            onFinishPolygon={finishPolygon} draftCount={draftPoints.length}
          />

          {parcel && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/60 space-y-0.5">
              <div className="font-heading font-bold text-white text-sm">{parcel.addressFull || parcel.apn || "Parcel"}</div>
              <div>APN <b className="text-white/85">{parcel.apn || "—"}</b> · {parcel.acres ? `${parcel.acres} ac` : "—"} · {parcel.zoningCode || ""}</div>
              {parcel.ownerName && <div>Owner: <b className="text-white/85">{parcel.ownerName}</b></div>}
              {parcel.legalDesc && <div className="text-white/40 line-clamp-2">{parcel.legalDesc}</div>}
              {parcel.sourceLabel && <div className="text-amber-400 font-bold">{parcel.sourceLabel}</div>}
              {result?.ambiguousParcel && <div className="text-amber-300">Multi-part parcel — largest part used.</div>}
            </div>
          )}

          {parcel && <RuleCard rules={rules} jurisdiction={parcel.jurisdiction} unverified={result?.unverified} />}
          <SiterControls controls={controls} onChange={setControls} rules={rules} peAllowedByTier={ent.peAllowed} />

          {result && !result.collapsed && (
            <div className="space-y-2">
              <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-500" onClick={confirmPlacement}>
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
              <Button size="sm" variant="outline" className="w-full border-white/15 text-white/70" onClick={sendToScip}>
                <Send className="w-3.5 h-3.5 mr-1" /> Send to SCIP
              </Button>
            </div>
          )}
        </div>

        {/* right — map / plan sheet */}
        <div className="space-y-3">
          {result?.collapsed && (
            <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300 flex items-center gap-2 font-semibold">
              <AlertOctagon className="w-5 h-5 shrink-0" />
              {result.banner || "No compliant placement at this height — try PE letter or shorter tower."}
            </div>
          )}

          {result && !result.collapsed && (
            <ComplianceChips checks={result.checks} residential={residential} residentialAllowed={ent.residentialCheck} />
          )}

          <div className="flex gap-2">
            <Button size="sm" variant={view === "map" ? "default" : "outline"} onClick={() => setView("map")}>
              <MapIcon className="w-4 h-4 mr-1" /> Satellite
            </Button>
            <Button size="sm" variant={view === "plan" ? "default" : "outline"} onClick={() => setView("plan")} disabled={!result || result.collapsed}>
              <FileText className="w-4 h-4 mr-1" /> Plan Sheet (Exhibit A)
            </Button>
          </div>

          <div className={view === "map" ? "h-[560px]" : "hidden"}>
            <SiterMap
              parcelGeoJSON={parcel ? { type: "Feature", properties: {}, geometry: parcel.geometry } : null}
              result={result && !result.collapsed ? result : null}
              leaseLonLat={leaseLonLat}
              residCircle={residential?.circle || null}
              draftPoints={draftPoints}
              onTowerDrag={onTowerDrag}
              onMapClick={handleMapClick}
              clickMode={clickMode}
            />
          </div>

          {view === "plan" && result && !result.collapsed && (
            <ExhibitA ref={exhibitARef} result={result} controls={controls} meta={exhibitMeta} watermark={ent.watermark} />
          )}
          {/* keep the SVG mounted (hidden) so Exhibit A can export from the map view too */}
          {view === "map" && result && !result.collapsed && (
            <div className="hidden" aria-hidden="true">
              <ExhibitA ref={exhibitARef} result={result} controls={controls} meta={exhibitMeta} watermark={ent.watermark} />
            </div>
          )}
        </div>
      </div>

      <UpgradeModal open={!!upgrade} onClose={() => setUpgrade(null)} reason={upgrade} />
    </div>
  );
}