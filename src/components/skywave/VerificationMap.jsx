import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { verifyLayers } from '@/functions/verifyLayers';
import { existingTowers } from '@/functions/existingTowers';

// --- SkyWave brand -----------------------------------------------------------
const BLUE = '#0066FF';
const GOLD = '#FFB800';
const POWER_RED = '#FF5A00';
const XMSN_PURPLE = '#9b30ff';
const TOWER_CYAN = '#00E5FF';   // existing cell sites — unknown carrier
// Subtle, muted carrier colors for existing-tower pins (never guessed; unknown stays cyan).
const CARRIER_COLORS = {
  'AT&T': '#5b8def',       // muted blue
  'Verizon': '#e06666',    // muted red
  'T-Mobile': '#c97bd4',   // muted magenta
};
const CARRIER_LEGEND = [
  { label: 'AT&T', color: CARRIER_COLORS['AT&T'] },
  { label: 'Verizon', color: CARRIER_COLORS['Verizon'] },
  { label: 'T-Mobile', color: CARRIER_COLORS['T-Mobile'] },
  { label: 'Other', color: TOWER_CYAN },
];

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

// --- IMAGE OVERLAYS (transparent PNG via ArcGIS export, {bbox-epsg-3857}) ----
const IMG_OVERLAYS = {
  wetlands: {
    id: 'ovl-wetlands',
    source: 'USFWS National Wetlands Inventory',
    tiles: 'https://www.fws.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/export'
      + '?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512'
      + '&format=png32&transparent=true&layers=show:0&dpi=96&f=image',
  },
  hydrography: {
    id: 'ovl-hydro',
    source: 'USGS National Hydrography Dataset',
    tiles: 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/export'
      + '?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512'
      + '&format=png32&transparent=true&dpi=96&f=image',
  },
};

// --- NATIVE GEOJSON LAYERS (HIFLD FeatureServers, fetched on map move) -------
// Honest labels: nearest PUBLIC assets, not transformer/splice precision.
const GEO_LAYERS = {
  substations: {
    srcId: 'geo-subs', lyrId: 'geo-subs-layer', kind: 'point',
    color: POWER_RED,
    url: 'https://services6.arcgis.com/OO2s4OoyCZkYJ6oE/arcgis/rest/services/Substations/FeatureServer/0/query',
    outFields: 'NAME,CITY,COUNTY,STATE,TYPE,STATUS',
    source: 'HIFLD Electric Substations',
    nameOf: (p) => {
      const n = p?.NAME || '';
      const looksJunk = /^(UNKNOWN|TAP)\d+$/i.test(n) || !n;
      return looksJunk ? [p?.CITY, p?.COUNTY].filter(Boolean).join(' / ') || 'Substation' : n;
    },
    popup: (p, nameOf) =>
      `<b>${nameOf(p)}</b><br/>Substation${p?.STATUS ? ' · ' + p.STATUS : ''}` +
      `${p?.COUNTY ? '<br/>' + p.COUNTY + ' County, ' + (p.STATE || '') : ''}`,
  },
  transmission: {
    srcId: 'geo-xmsn', lyrId: 'geo-xmsn-layer', kind: 'line',
    color: XMSN_PURPLE,
    url: 'https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0/query',
    outFields: 'OWNER,VOLTAGE,VOLT_CLASS,STATUS',
    source: 'HIFLD Electric Power Transmission Lines',
    popup: (p) =>
      `<b>${p?.OWNER && p.OWNER !== 'NOT AVAILABLE' ? p.OWNER : 'Transmission line'}</b>` +
      `<br/>${p?.VOLTAGE ? p.VOLTAGE + ' kV' : ''}${p?.VOLT_CLASS ? ' (' + p.VOLT_CLASS + ')' : ''}`,
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

export default function VerificationMap({ searchResult, onUpdated }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const styleReady = useRef(false);
  const mbglRef = useRef(null);

  const [vm, setVm] = useState(searchResult?.verification_map || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [basemap, setBasemap] = useState('satellite');
  const [imgOn, setImgOn]   = useState({ wetlands: true, hydrography: true });
  const [towersOn, setTowersOn] = useState(false);   // existing cell sites (lazy)
  const [towerData, setTowerData] = useState(null);  // { count, towers[], source }
  const [geoOn, setGeoOn]   = useState({ substations: true, transmission: true });
  const [cardOn, setCardOn] = useState({ elevation: true, wetlands: true, hydrography: true, watershed: true });

  // Coordinates come straight off the SearchResult candidate.
  const lat = searchResult?.latitude;
  const lon = searchResult?.longitude;
  const targetLabel = searchResult?.site_name || 'Selected Target';
  const hasCoords = lat != null && lon != null;

  // ---- IMAGE overlay helpers ------------------------------------------------
  const moveImgOverlaysToTop = useCallback(() => {
    const map = mapRef.current; if (!map) return;
    Object.values(IMG_OVERLAYS).forEach(o => { if (map.getLayer(o.id)) map.moveLayer(o.id); });
    // keep native geo layers above image overlays too
    Object.values(GEO_LAYERS).forEach(g => { if (map.getLayer(g.lyrId)) map.moveLayer(g.lyrId); });
  }, []);

  const ensureImgOverlay = useCallback((kind) => {
    const map = mapRef.current; if (!map || !styleReady.current) return;
    const o = IMG_OVERLAYS[kind];
    if (!map.getSource(o.id)) {
      map.addSource(o.id, { type: 'raster', tiles: [o.tiles], tileSize: 512 });
      map.addLayer({ id: o.id, type: 'raster', source: o.id, paint: { 'raster-opacity': 0.75 } });
    }
  }, []);

  const setImgVisible = useCallback((kind, visible) => {
    const map = mapRef.current; if (!map || !styleReady.current) return;
    const o = IMG_OVERLAYS[kind];
    if (visible) {
      ensureImgOverlay(kind);
      if (map.getLayer(o.id)) map.setLayoutProperty(o.id, 'visibility', 'visible');
    } else if (map.getLayer(o.id)) {
      map.setLayoutProperty(o.id, 'visibility', 'none');
    }
  }, [ensureImgOverlay]);

  // ---- NATIVE GEOJSON layer helpers (fetch current view, draw, popups) ------
  const fetchGeoData = useCallback(async (kind) => {
    const map = mapRef.current; if (!map || !styleReady.current) return;
    const g = GEO_LAYERS[kind];
    const b = map.getBounds();
    const env = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
    const params = new URLSearchParams({
      geometry: env, geometryType: 'esriGeometryEnvelope', inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects', outFields: g.outFields,
      returnGeometry: 'true', outSR: '4326', resultRecordCount: '500', f: 'geojson',
    });
    try {
      const res = await fetch(`${g.url}?${params.toString()}`);
      const fc = await res.json();
      const src = map.getSource(g.srcId);
      if (src) src.setData(fc && fc.type ? fc : { type: 'FeatureCollection', features: [] });
    } catch (_e) { /* leave existing data; federal hiccup shouldn't break the map */ }
  }, []);

  const ensureGeoLayer = useCallback((kind) => {
    const map = mapRef.current; if (!map || !styleReady.current) return;
    const g = GEO_LAYERS[kind];
    if (!map.getSource(g.srcId)) {
      map.addSource(g.srcId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      if (g.kind === 'point') {
        map.addLayer({
          id: g.lyrId, type: 'circle', source: g.srcId,
          paint: { 'circle-radius': 6, 'circle-color': g.color, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
        });
      } else {
        map.addLayer({
          id: g.lyrId, type: 'line', source: g.srcId,
          paint: { 'line-color': g.color, 'line-width': 3 },
        });
      }
      map.on('click', g.lyrId, (e) => {
        const f = e.features?.[0]; if (!f) return;
        const html = g.popup(f.properties, g.nameOf);
        new mbglRef.current.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on('mouseenter', g.lyrId, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', g.lyrId, () => { map.getCanvas().style.cursor = ''; });
    }
  }, []);

  const setGeoVisible = useCallback((kind, visible) => {
    const map = mapRef.current; if (!map || !styleReady.current) return;
    const g = GEO_LAYERS[kind];
    if (visible) {
      ensureGeoLayer(kind);
      if (map.getLayer(g.lyrId)) map.setLayoutProperty(g.lyrId, 'visibility', 'visible');
      fetchGeoData(kind);
    } else if (map.getLayer(g.lyrId)) {
      map.setLayoutProperty(g.lyrId, 'visibility', 'none');
    }
  }, [ensureGeoLayer, fetchGeoData]);

  const applyBasemap = useCallback((key) => {
    const map = mapRef.current; if (!map || !styleReady.current) return;
    const SRC = 'usgs-basemap', LYR = 'usgs-basemap-layer';
    if (map.getLayer(LYR)) map.removeLayer(LYR);
    if (map.getSource(SRC)) map.removeSource(SRC);
    if (key !== 'satellite') {
      map.addSource(SRC, { type: 'raster', tiles: [USGS_BASEMAPS[key]], tileSize: 256 });
      map.addLayer({ id: LYR, type: 'raster', source: SRC });
      moveImgOverlaysToTop();
    }
  }, [moveImgOverlaysToTop]);

  // refetch native layers when the user stops moving the map
  const onMoveEnd = useCallback(() => {
    if (geoOn.substations) fetchGeoData('substations');
    if (geoOn.transmission) fetchGeoData('transmission');
  }, [geoOn, fetchGeoData]);

  // ---- init map -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    if (!hasCoords) return;
    loadMapboxGL().then((mapboxgl) => {
      if (cancelled || mapRef.current || !mapEl.current) return;
      mbglRef.current = mapboxgl;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: mapEl.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [lon, lat], zoom: 14,
      });
      map.addControl(new mapboxgl.NavigationControl(), 'top-right');
      new mapboxgl.Marker({ color: GOLD }).setLngLat([lon, lat]).addTo(map);
      map.on('style.load', () => {
        styleReady.current = true;
        applyBasemap(basemap);
        setImgVisible('wetlands', imgOn.wetlands);
        setImgVisible('hydrography', imgOn.hydrography);
        setGeoVisible('substations', geoOn.substations);
        setGeoVisible('transmission', geoOn.transmission);
        moveImgOverlaysToTop();
      });
      map.on('moveend', onMoveEnd);
      mapRef.current = map;
    }).catch(() => setError('Map failed to load.'));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCoords]);

  useEffect(() => {
    if (!styleReady.current) return;
    applyBasemap(basemap);
    setImgVisible('wetlands', imgOn.wetlands);
    setImgVisible('hydrography', imgOn.hydrography);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  useEffect(() => {
    if (!styleReady.current) return;
    setImgVisible('wetlands', imgOn.wetlands);
    setImgVisible('hydrography', imgOn.hydrography);
    moveImgOverlaysToTop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgOn]);

  useEffect(() => {
    if (!styleReady.current) return;
    setGeoVisible('substations', geoOn.substations);
    setGeoVisible('transmission', geoOn.transmission);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoOn]);

  // ---- Generate / Refresh (federal point queries -> cards) ------------------
  const generate = useCallback(async (force = false) => {
    if (!hasCoords) { setError('No coordinates available for this candidate.'); return; }
    setLoading(true); setError('');
    try {
      const res = await verifyLayers({ recordId: searchResult?.id, recordType: 'SearchResult', lat, lon, targetLabel, force });
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
  }, [hasCoords, lat, lon, searchResult?.id, targetLabel]);

  // ---- Existing cell sites (OpenCellID via existingTowers backend) ----------
  const radiusMiles = searchResult?.radius_miles
    || (searchResult?.search_radius ? parseFloat(searchResult.search_radius) : 0.5);

  const plotTowers = useCallback((towers) => {
    const map = mapRef.current; if (!map || !styleReady.current || !mbglRef.current) return;
    const SRC = 'cell-towers', LYR = 'cell-towers-layer';
    const fc = {
      type: 'FeatureCollection',
      features: (towers || []).map((t) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [t.lon, t.lat] },
        properties: { carrier: t.carrier, radio: t.radio, range_m: t.range_m, distance_mi: t.distance_mi },
      })),
    };
    if (!map.getSource(SRC)) {
      map.addSource(SRC, { type: 'geojson', data: fc });
      map.addLayer({
        id: LYR, type: 'circle', source: SRC,
        paint: {
          'circle-radius': 7,
          'circle-color': [
            'match', ['get', 'carrier'],
            'AT&T', CARRIER_COLORS['AT&T'],
            'Verizon', CARRIER_COLORS['Verizon'],
            'T-Mobile', CARRIER_COLORS['T-Mobile'],
            TOWER_CYAN,
          ],
          'circle-stroke-width': 2, 'circle-stroke-color': '#003a40',
        },
      });
      map.on('click', LYR, (e) => {
        const p = e.features?.[0]?.properties; if (!p) return;
        const html = `<b>📡 ${p.carrier}</b><br/>${p.radio} · ~${p.distance_mi} mi from target` +
                     `${p.range_m ? '<br/>est. range ' + p.range_m + ' m' : ''}`;
        new mbglRef.current.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on('mouseenter', LYR, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', LYR, () => { map.getCanvas().style.cursor = ''; });
    } else {
      map.getSource(SRC).setData(fc);
    }
  }, []);

  const fetchTowers = useCallback(async () => {
    if (!hasCoords) return;
    try {
      const res = await existingTowers({ lat, lon, radiusMiles });
      const data = res?.data ?? res;
      if (data?.error) throw new Error(data.error);
      setTowerData(data);
      plotTowers(data.towers);
    } catch (e) {
      setError('Existing-towers lookup: ' + String(e?.message ?? e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCoords, lat, lon, radiusMiles, plotTowers]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !styleReady.current) return;
    const LYR = 'cell-towers-layer';
    if (towersOn) {
      if (towerData) { plotTowers(towerData.towers); if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', 'visible'); }
      else fetchTowers();   // lazy: only hit the API the first time it's switched on
    } else if (map.getLayer(LYR)) {
      map.setLayoutProperty(LYR, 'visibility', 'none');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [towersOn]);

  const exportSnapshot = useCallback(() => {
    const map = mapRef.current; if (!map) return;
    map.once('render', () => {
      try {
        const a = document.createElement('a');
        a.href = map.getCanvas().toDataURL('image/png');
        a.download = `${(searchResult?.site_name || 'site')}_verification.png`;
        a.click();
      } catch (_e) { setError('Snapshot export blocked by browser.'); }
    });
    map.triggerRepaint();
  }, [searchResult?.site_name]);

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

        {!hasCoords && <div style={{ marginTop: 14, color: '#d23b3b', fontSize: 13 }}>No coordinates on this candidate yet.</div>}
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
                <Checkbox checked={imgOn.wetlands} onCheckedChange={(v) => setImgOn(s => ({ ...s, wetlands: !!v }))} />
                💧 Wetlands
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <Checkbox checked={imgOn.hydrography} onCheckedChange={(v) => setImgOn(s => ({ ...s, hydrography: !!v }))} />
                🌊 Hydrography
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <Checkbox checked={geoOn.substations} onCheckedChange={(v) => setGeoOn(s => ({ ...s, substations: !!v }))} />
                🔌 Substations
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <Checkbox checked={geoOn.transmission} onCheckedChange={(v) => setGeoOn(s => ({ ...s, transmission: !!v }))} />
                ⚡ Transmission
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <Checkbox checked={towersOn} onCheckedChange={(v) => setTowersOn(!!v)} />
                📡 Existing Towers
              </label>
            </div>
          </div>
        )}

        {hasCoords && (
          <div ref={mapEl} style={{ height: 460, width: '100%', marginTop: 14, borderRadius: 8, overflow: 'hidden', background: '#0b1220' }} />
        )}

        {hasCoords && (
          <div style={{ marginTop: 8, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {imgOn.wetlands && <Stamp>💧 Wetlands — {IMG_OVERLAYS.wetlands.source}</Stamp>}
            {imgOn.hydrography && <Stamp>🌊 Hydrography — {IMG_OVERLAYS.hydrography.source}</Stamp>}
            {geoOn.substations && <Stamp>🔌 {GEO_LAYERS.substations.source} · nearest public asset, not transformer-level</Stamp>}
            {geoOn.transmission && <Stamp>⚡ {GEO_LAYERS.transmission.source}</Stamp>}
            {towersOn && towerData && <Stamp>📡 {towerData.count} existing cell site(s) in ring — {towerData.source}</Stamp>}
            {towersOn && towerData && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                {CARRIER_LEGEND.map((c) => (
                  <span key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#8a8f98' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, border: '1.5px solid #003a40', display: 'inline-block' }} />
                    {c.label}
                  </span>
                ))}
              </div>
            )}
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