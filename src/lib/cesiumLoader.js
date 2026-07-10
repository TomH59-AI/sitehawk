// Shared CesiumJS CDN loader — injects the engine + widgets CSS once and
// scopes the Ion token to the live viewer session (never persisted).
const CESIUM_VERSION = "1.122";
const CESIUM_CDN = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium`;

export function loadCesium(ionToken) {
  return new Promise((resolve, reject) => {
    if (window.Cesium) {
      if (ionToken) {
        window.Cesium.Ion.defaultAccessToken = ionToken;
        window.__CESIUM_ION_TOKEN__ = ionToken;
      }
      resolve();
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${CESIUM_CDN}/Widgets/widgets.css`;
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = `${CESIUM_CDN}/Cesium.js`;
    script.onload = () => {
      if (ionToken) window.Cesium.Ion.defaultAccessToken = ionToken;
      window.__CESIUM_ION_TOKEN__ = ionToken || "";
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load CesiumJS from CDN"));
    document.head.appendChild(script);
  });
}