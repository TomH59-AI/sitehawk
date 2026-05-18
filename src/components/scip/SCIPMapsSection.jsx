import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, WMSTileLayer, Marker, Popup, LayersControl, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { pointElevation } from "@/functions/pointElevation";

function ElevationProbe({ onProbe }) {
  useMapEvents({
    click: async (e) => {
      const { lat, lng } = e.latlng;
      onProbe({ lat, lon: lng, elevation_ft: null, loading: true });
      try {
        const res = await pointElevation({ lat, lon: lng });
        onProbe({ lat, lon: lng, elevation_ft: res.data?.elevation_ft, loading: false });
      } catch {
        onProbe({ lat, lon: lng, elevation_ft: null, loading: false, error: true });
      }
    },
  });
  return null;
}

// Fix default Leaflet icon paths (react-leaflet requires this)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export default function SCIPMapsSection({ candidate }) {
  const [open, setOpen] = useState(true);
  const [probe, setProbe] = useState(null);
  const lat = candidate?.latitude;
  const lon = candidate?.longitude;

  if (!lat || !lon) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="font-heading font-bold text-foreground">Maps</div>
        <p className="text-sm text-muted-foreground mt-2">No coordinates available for this candidate.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#0C1B2E] text-white hover:bg-[#13294a] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 text-xs font-bold uppercase tracking-widest">Section</span>
          <span className="font-heading font-bold">Maps — Wetlands & Topographic Contours</span>
        </div>
        <span className="text-cyan-400 text-sm">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Interactive overlay of <span className="font-semibold text-foreground">USFWS National Wetlands Inventory</span> and{" "}
            <span className="font-semibold text-foreground">USGS 3DEP Elevation Contours (ft AMSL)</span>. Toggle layers in the top-right.{" "}
            <span className="text-cyan-600 font-semibold">Click anywhere on the map to query ground elevation.</span>
          </p>

          {candidate?.ground_elevation_ft != null && (
            <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/30 px-3 py-2 text-xs flex items-center gap-2">
              <span className="text-sm">⛰</span>
              <span className="text-muted-foreground">Site ground elevation:</span>
              <span className="font-bold text-foreground">{candidate.ground_elevation_ft} ft AMSL</span>
              <span className="text-muted-foreground">· Source: USGS EPQS / 3DEP</span>
            </div>
          )}

          {probe && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs flex items-center gap-2">
              <span className="text-sm">📍</span>
              <span className="text-muted-foreground font-mono">{probe.lat.toFixed(5)}, {probe.lon.toFixed(5)}</span>
              <span className="text-muted-foreground">→</span>
              {probe.loading ? (
                <span className="text-muted-foreground italic">Querying USGS EPQS...</span>
              ) : probe.elevation_ft != null ? (
                <span className="font-bold text-foreground">{probe.elevation_ft} ft AMSL</span>
              ) : (
                <span className="text-red-500">No data at this location</span>
              )}
            </div>
          )}

          <div className="rounded-lg overflow-hidden border border-border" style={{ height: 520 }}>
            <MapContainer
              center={[lat, lon]}
              zoom={15}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom={true}
            >
              <LayersControl position="topright">
                <LayersControl.BaseLayer checked name="Satellite (Esri)">
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution="Tiles © Esri"
                    maxZoom={19}
                  />
                </LayersControl.BaseLayer>

                <LayersControl.BaseLayer name="USGS Topographic">
                  <TileLayer
                    url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"
                    attribution="USGS The National Map"
                    maxZoom={16}
                  />
                </LayersControl.BaseLayer>

                <LayersControl.BaseLayer name="Streets (OSM)">
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png"
                    attribution='&copy; OpenStreetMap contributors'
                  />
                </LayersControl.BaseLayer>

                <LayersControl.Overlay checked name="Wetlands (NWI)">
                  <WMSTileLayer
                    url="https://www.fws.gov/wetlandsmapservice/services/Wetlands/MapServer/WMSServer"
                    layers="1"
                    format="image/png"
                    transparent={true}
                    opacity={0.6}
                    attribution="FWS National Wetlands Inventory"
                  />
                </LayersControl.Overlay>

                <LayersControl.Overlay checked name="Contours (ft AMSL)">
                  <WMSTileLayer
                    url="https://carto.nationalmap.gov/arcgis/services/contours/MapServer/WMSServer"
                    layers="9,14,19"
                    format="image/png"
                    transparent={true}
                    opacity={0.75}
                    attribution="USGS 3DEP Elevation Contours"
                  />
                </LayersControl.Overlay>
              </LayersControl>

              <Marker position={[lat, lon]}>
                <Popup>
                  <div className="text-sm">
                    <div className="font-bold">{candidate?.site_name || "Candidate Site"}</div>
                    <div className="text-xs">{candidate?.parcel_address || ""}</div>
                    <div className="text-xs mt-1 font-mono">{lat.toFixed(5)}, {lon.toFixed(5)}</div>
                    {candidate?.ground_elevation_ft != null && (
                      <div className="text-xs mt-1">⛰ <b>{candidate.ground_elevation_ft} ft AMSL</b></div>
                    )}
                  </div>
                </Popup>
              </Marker>

              <ElevationProbe onProbe={setProbe} />
            </MapContainer>
          </div>

          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/60 border border-emerald-700" /> NWI Wetlands
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-600/60 border border-amber-800" /> USGS Contours (50ft / 100ft)
            </span>
            <span className="ml-auto text-[10px]">Sources: U.S. Fish &amp; Wildlife Service · USGS The National Map</span>
          </div>
        </div>
      )}
    </div>
  );
}