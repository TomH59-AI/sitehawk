// src/hooks/useFccChoropleth.js
import { useEffect, useRef, useState } from "react";

const FCC_BASE =
  "https://services8.arcgis.com/peDZJliSvYims39Q/arcgis/rest/services/" +
  "FCC_Broadband_Data_Collection_December_2024_View/FeatureServer";

const MIN_ZOOM = 9;       // hard gate — below this we don't query at all
const DEBOUNCE_MS = 350;  // mapbox moveend debounce
const MAX_RECORDS = 2000;

export function useFccChoropleth(map, { enabled }) {
  const [geojson, setGeojson] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | zoomedOut | loading | ready | error
  const abortRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!map || !enabled) {
      setGeojson(null);
      setStatus("idle");
      return;
    }

    const run = () => {
      const z = map.getZoom();
      if (z < MIN_ZOOM) {
        setGeojson(null);
        setStatus("zoomedOut");
        return;
      }
      const b = map.getBounds();
      const env = {
        xmin: b.getWest(), ymin: b.getSouth(),
        xmax: b.getEast(), ymax: b.getNorth(),
        spatialReference: { wkid: 4326 },
      };
      const fields = "GEOID,CountyName,StateAbbr,TotalBSLs,ServedBSLsFiber,UniqueProvidersFiber";
      const url =
        `${FCC_BASE}/3/query` +
        `?geometry=${encodeURIComponent(JSON.stringify(env))}` +
        `&geometryType=esriGeometryEnvelope` +
        `&inSR=4326&outSR=4326` +
        `&spatialRel=esriSpatialRelIntersects` +
        `&outFields=${encodeURIComponent(fields)}` +
        `&returnGeometry=true` +
        `&resultRecordCount=${MAX_RECORDS}` +
        `&f=geojson`;

      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setStatus("loading");
      fetch(url, { signal: abortRef.current.signal })
        .then((r) => r.json())
        .then((g) => {
          // Compute fiberServedPct on each feature for paint
          for (const f of g.features || []) {
            const a = f.properties;
            a.fiberServedPct =
              a.TotalBSLs > 0
                ? Math.round((a.ServedBSLsFiber / a.TotalBSLs) * 1000) / 10
                : null;
          }
          setGeojson(g);
          setStatus("ready");
        })
        .catch((e) => {
          if (e.name === "AbortError") return;
          console.error("FCC choropleth fetch failed", e);
          setStatus("error");
        });
    };

    const debounced = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(run, DEBOUNCE_MS);
    };

    run(); // initial
    map.on("moveend", debounced);
    map.on("zoomend", debounced);
    return () => {
      map.off("moveend", debounced);
      map.off("zoomend", debounced);
      clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, [map, enabled]);

  return { geojson, status };
}