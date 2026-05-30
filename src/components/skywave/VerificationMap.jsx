import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { verifyLayers } from '@/functions/verifyLayers';

// --- SkyWave brand -----------------------------------------------------------
const BLUE = '#0066FF';
const GOLD = '#FFB800';

// --- Mapbox frontend token (pk.* is frontend-safe) ---------------------------
const MAPBOX_TOKEN = 'pk.eyJ1IjoidGhvZGdlcyIsImEiOiJjbWlxZzBmbmQwMTA4M2txNGY5OXhyOWppIn0.sjlKabo3VGDU-hKE2Br3bQ';

// --- USGS raster BASEMAP tile templates (ArcGIS {z}/{y}/{x} order) -----------
const USGS_BASEMAPS = {
  topo:         'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
  imageryTopo:  'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}',
  shadedRelief: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}',
};
const BASEMAP_OPTIONS = [
  { key: 'satellite',    label: 'Satellite' },
  { key: 'topo',         label: 'USGS Topo' },
  { key: 'imageryTopo',  label: 'USGS Imagery + Topo' },
  { key: 'shadedRelief', label: 'USGS Shaded Relief' },
];

// --- FEDERAL OVERLAY tile templates (ArcGIS export w/ {bbox-epsg-3857}) ------
const OVERLAYS = {
  wetlands: {
    id: 'ovl-wetlands',
    label: '💧 USFWS Wetlands',
    source: 'USFWS National Wetlands Inventory',
    tiles: 'https://www.fws.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/export'
      + '?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512'
      + '&format=png32&transparent=true&layers=show:0&dpi=96&f=image',
  },
  hydrography: {
    id: 'ovl-hydro',
    label: '🌊 USGS Hydrography',
    source: 'USGS National Hydrography Dataset',
    tiles: 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/export'
      + '?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512'
      + '&format=png32&transparent=true&dpi=96&f=image',
  },
};

// --- dynamic Mapbox GL loader (CDN, no npm) ----------------------------------
function loadMapboxGL() {
  return new Promise((resolve, reject) => {
    if (window.mapboxgl) return resolve(window.mapboxgl);
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js';
    s.onload = () => resolve(window.mapboxgl);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function Stamp({ children }) {
  return <div style={{ fontSize: 10, color: '#8a8f98', marginTop: 2, letterSpacing: 0.2 }}>{children}</div>;
}

export default function VerificationMap({ scipRecord, onUpdated }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const styleReady = useRef(false);

  const [vm, setVm] = useState(scipRecord?.verification_map || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [basemap, setBasemap] = useState('satellite');
  const [overlayOn, setOverlayOn] = useState({ wetlands: true, hydrography: true });
  const [cardOn, setCardOn] = useState({ elevation: true, wetlands: true, hydrography: true, watershed: true });

  const idx = scipRecord?.active_target_index ?? 0;
  const target = scipRecord?.parcel_targets?.[idx];
  const lat = target?.latitude ?? scipRecord?.latitude;
  const lon = target?.longitude ?? scipRecord?.longitude;
  const targetLabel = target?.label || 'Target A';
  const hasCoords = lat != null && lon != null;

  const moveOverlaysToTop = useCallback(() => {
    const map = mapRef.current; if (!map) return;
    Object.values(OVERLAYS).forEach(o => { if (map.getLayer(o.id)) map.moveLayer(o.id); });
  }, []);

  const ensureOverlay = useCallback((kind) => {
    const map = mapRef.current; if (!map || !styleReady.current) return;
    const o = OVERLAYS[kind];
    if (!map.getSource(o.id)) {
      map.addSource(o.id, { type: 'raster', tiles: [o.tiles], tileSize: 512 });
      map.addLayer({ id: o.id, type: 'raster', source: o.id, paint: { 'raster-opacity': 0.75 } });
    }
  }, []);

  const setOverlayVisible = useCallback((kind, visible) => {
    const map = mapRef.current; if (!map || !styleReady.current) return;
    const o = OVERLAYS[kind];
    if (visible) {
      ensureOverlay(kind);
      if (map.getLayer(o.id)) map.setLayoutProperty(o.id, 'visibility', 'visible');
    } else if (map.getLayer(o.id)) {
      map.setLayoutProperty(o.id, 'visibility', 'none');
    }
  }, [ensureOverlay]);

  const applyBasemap = useCallback((key) => {
    const map = mapRef.current; if (!map || !styleReady.current) return;
    const SRC = 'usgs-basemap', LYR = 'usgs-basemap-layer';
    if (map.getLayer(LYR)) map.removeLayer(LYR);
    if (map.getSource(SRC)) map.removeSource(SRC);
    if (key !== 'satellite') {
      map.addSource(SRC, { type: 'raster', tiles: [USGS_BASEMAPS[key]], tileSize: 256 });
      map.addLayer({ id: LYR, type: 'raster', source: SRC });
      moveOverlaysToTop();
    }
  }, [moveOverlaysToTop]);

  // ---- init map -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    if (!hasCoords) return;
    loadMapboxGL().then((mapboxgl) => {
      if (cancelled || mapRef.current || !mapEl.current) return;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: mapEl.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [lon, lat], zoom: 15,
      });
      map.addControl(new mapboxgl.NavigationControl(), 'top-right');
      markerRef.current = new mapboxgl.Marker({ color: GOLD }).setLngLat([lon, lat]).addTo(map);
      map.on('style.load', () => {
        styleReady.current = true;
        applyBasemap(basemap);
        setOverlayVisible('wetlands', overlayOn.wetlands);
        setOverlayVisible('hydrography', overlayOn.hydrography);
        moveOverlaysToTop();
      });
      mapRef.current = map;
    }).catch(() => setError('Map failed to load.'));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCoords]);

  // re-apply basemap when switched
  useEffect(() => {
    if (!styleReady.current) return;
    applyBasemap(basemap);
    setOverlayVisible('wetlands', overlayOn.wetlands);
    setOverlayVisible('hydrography', overlayOn.hydrography);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  // re-apply overlay visibility when toggled
  useEffect(() => {
    if (!styleReady.current) return;
    setOverlayVisible('wetlands', overlayOn.wetlands);
    setOverlayVisible('hydrography', overlayOn.hydrography);
    moveOverlaysToTop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayOn]);

  const generate = useCallback(async (force = false) => {
    if (!hasCoords) { setError('No Target A coordinates available.'); return; }
    setLoading(true); setError('');
    try {
      const res = await verifyLayers({ scipRecordId: scipRecord?.id, lat, lon, targetLabel, force });
      const data = res?.data ?? res;
      if (data?.error) throw new Error(data.error);
      setVm(data);
      onUpdated?.(data);
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCoords, lat, lon, scipRecord?.id, targetLabel]);

  const exportSnapshot = useCallback(() => {
    const map = mapRef.current; if (!map) return;
    map.once('render', () => {
      try {
        const a = document.createElement('a');
        a.href = map.getCanvas().toDataURL('image/png');
        a.download = `${(scipRecord?.site_name || 'site')}_${targetLabel.replace(/\s+/g, '')}_verification.png`;
        a.click();
      } catch (_e) { setError('Snapshot export blocked by browser.'); }
    });
    map.triggerRepaint();
  }, [scipRecord?.site_name, targetLabel]);

  const badge = (s) => ({ ok: '#1b9e4b', hit: GOLD, miss: '#1b9e4b', none: '#8a8f98',
    cached: BLUE, error: '#d23b3b', nodata: '#8a8f98' }[s] || '#8a8f98');

  return (
    <div className="no-print" style={{ marginTop: 24 }}>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <Card style={{ padding: 20, borderTop: `3px solid ${BLUE}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, color: BLUE, fontWeight: 700 }}>🦅 {targetLabel} — Live Verification Map</h3>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              Toggle live federal layers over the candidate · not included in the printed SCIP
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => generate(false)} disabled={loading || !hasCoords}
              style={{ background: GOLD, color: '#1a1a1a', fontWeight: 700 }}>
              {loading ? 'Verifying…' : (vm ? 'Re-run' : 'Generate Verification')}
            </Button>
            {vm && <Button variant="outline" onClick={() => generate(true)} disabled={loading}>Force Refresh</Button>}
          </div>
        </div>

        {!hasCoords && <div style={{ marginTop: 14, color: '#d23b3b', fontSize: 13 }}>No Target A coordinates yet — run the pipeline through target selection first.</div>}
        {error && <div style={{ marginTop: 14, color: '#d23b3b', fontSize: 13 }}>⚠️ {error}</div>}

        {hasCoords && (
          <div style={{ marginTop: 16, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Basemap:</span>
              {BASEMAP_OPTIONS.map(opt => (
                <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" name="vm-basemap" checked={basemap === opt.key}
                    onChange={() => setBasemap(opt.key)} style={{ accentColor: BLUE }} />
                  {opt.label}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Overlays:</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <Checkbox checked={overlayOn.wetlands} onCheckedChange={(v) => setOverlayOn(s => ({ ...s, wetlands: !!v }))} />
                💧 Wetlands
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <Checkbox checked={overlayOn.hydrography} onCheckedChange={(v) => setOverlayOn(s => ({ ...s, hydrography: !!v }))} />
                🌊 Hydrography
              </label>
            </div>
          </div>
        )}

        {hasCoords && (
          <div ref={mapEl} style={{ height: 460, width: '100%', marginTop: 14, borderRadius: 8, overflow: 'hidden', background: '#0b1220' }} />
        )}

        {hasCoords && (
          <div style={{ marginTop: 8, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {overlayOn.wetlands && <Stamp>💧 Wetlands overlay — {OVERLAYS.wetlands.source}</Stamp>}
            {overlayOn.hydrography && <Stamp>🌊 Hydrography overlay — {OVERLAYS.hydrography.source}</Stamp>}
          </div>
        )}

        {vm && (
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, opacity: cardOn.elevation ? 1 : 0.45 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                <Checkbox checked={cardOn.elevation} onCheckedChange={(v) => setCardOn(t => ({ ...t, elevation: !!v }))} />
                ⛰️ Elevation
                <span style={{ marginLeft: 'auto', fontSize: 10, color: badge(vm.elevation?.status) }}>{(vm.elevation?.status || '').toUpperCase()}</span>
              </label>
              <div style={{ marginTop: 6, fontSize: 15 }}>
                {vm.elevation?.value_ft != null ? <b>{vm.elevation.value_ft} ft AMSL</b> : <span style={{ color: '#8a8f98' }}>No elevation returned</span>}
              </div>
              <Stamp>{vm.elevation?.source}</Stamp>
            </div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, opacity: cardOn.wetlands ? 1 : 0.45 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                <Checkbox checked={cardOn.wetlands} onCheckedChange={(v) => setCardOn(t => ({ ...t, wetlands: !!v }))} />
                💧 Wetlands
                <span style={{ marginLeft: 'auto', fontSize: 10, color: badge(vm.wetlands?.status) }}>{(vm.wetlands?.status || '').toUpperCase()}</span>
              </label>
              <div style={{ marginTop: 6, fontSize: 14 }}>
                {vm.wetlands?.present
                  ? <span style={{ color: GOLD, fontWeight: 600 }}>{vm.wetlands.wetland_type} ({vm.wetlands.attribute_code}){vm.wetlands.acres ? ` · ${vm.wetlands.acres} ac` : ''}</span>
                  : <span style={{ color: '#1b9e4b', fontWeight: 600 }}>No NWI wetlands at pin ✓</span>}
              </div>
              <Stamp>{vm.wetlands?.source}</Stamp>
            </div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, opacity: cardOn.hydrography ? 1 : 0.45 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                <Checkbox checked={cardOn.hydrography} onCheckedChange={(v) => setCardOn(t => ({ ...t, hydrography: !!v }))} />
                🌊 Hydrography
                <span style={{ marginLeft: 'auto', fontSize: 10, color: badge(vm.hydrography?.status) }}>{(vm.hydrography?.status || '').toUpperCase()}</span>
              </label>
              <div style={{ marginTop: 6, fontSize: 14 }}>
                {vm.hydrography?.nearest_feature
                  ? <b>{vm.hydrography.nearest_feature}{vm.hydrography.ftype ? <span style={{ fontWeight: 400, color: '#6b7280' }}> · {vm.hydrography.ftype}</span> : ''}</b>
                  : <span style={{ color: '#8a8f98' }}>No mapped surface water nearby</span>}
              </div>
              <Stamp>{vm.hydrography?.source}</Stamp>
            </div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, opacity: cardOn.watershed ? 1 : 0.45 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                <Checkbox checked={cardOn.watershed} onCheckedChange={(v) => setCardOn(t => ({ ...t, watershed: !!v }))} />
                🗺️ Watershed
                <span style={{ marginLeft: 'auto', fontSize: 10, color: badge(vm.watershed?.status) }}>{(vm.watershed?.status || '').toUpperCase()}</span>
              </label>
              <div style={{ marginTop: 6, fontSize: 14 }}>
                {vm.watershed?.name
                  ? <b>{vm.watershed.name} <span style={{ fontWeight: 400, color: '#6b7280' }}>(HUC12 {vm.watershed.huc12})</span></b>
                  : <span style={{ color: '#8a8f98' }}>No watershed returned</span>}
              </div>
              <Stamp>{vm.watershed?.source}</Stamp>
            </div>
          </div>
        )}

        {vm && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 11, color: '#8a8f98' }}>
              Verified {vm.generated_at ? new Date(vm.generated_at).toLocaleString() : ''}{vm.served_from_cache ? ' · served from cache' : ''}
            </div>
            <Button variant="outline" onClick={exportSnapshot} style={{ borderColor: BLUE, color: BLUE }}>
              Export Verification Snapshot (PNG)
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}