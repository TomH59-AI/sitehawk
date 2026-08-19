import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCarrierFinderGeoJson, safeFeatureMetadata } from "./normalizer.mjs";

test("normalizes lit buildings, telco points, and route geometry", () => {
  const geojson = normalizeCarrierFinderGeoJson(
    {
      site: [{
        site_id: "site-1",
        latitude: "28.10",
        longitude: "-80.60",
        carriername: "Example Carrier",
        xnet_code: "O",
        street: "100 Main St",
        city: "Melbourne",
        state: "FL",
      }],
      routes: [{
        id: "run-1",
        operator: "Example Carrier",
        geometry: {
          type: "LineString",
          coordinates: [[-80.61, 28.09], [-80.60, 28.10]],
        },
      }],
    },
    {
      status: "ok",
      telco_clli: "MLBRFL",
      telco_telconame: "Local Telco",
      telco_co_lat: "28.11",
      telco_co_lon: "-80.59",
      telco_telconumber: "must-not-leak",
    }
  );

  assert.equal(geojson.type, "FeatureCollection");
  assert.equal(geojson.features.length, 3);
  assert.deepEqual(geojson.features.map((feature) => feature.geometry.type), [
    "LineString",
    "Point",
    "Point",
  ]);
  assert.equal(geojson.features[0].properties.status, "unknown");
  assert.equal(geojson.features[1].properties.network_access, "on-net");
  assert.equal(geojson.features[1].properties.source, "carrierfinder");
  assert.equal(geojson.features[1].properties._cf_geometry_valid, true);
  assert.equal(geojson.features[1].id, "site-1");
  assert.equal("telco_telconumber" in geojson.features[2].properties, false);
});

test("drops malformed coordinates and returns only whitelisted metadata", () => {
  const geojson = normalizeCarrierFinderGeoJson({
    site: [
      { latitude: "bad", longitude: -80.6, carriername: "Bad Point" },
      { latitude: 28.1, longitude: -80.6, carriername: "Good Point", secret_contact: "nope" },
    ],
  });
  assert.equal(geojson.features.length, 1);

  const metadata = safeFeatureMetadata(geojson.features[0]);
  assert.equal(metadata.feature_type, "node");
  assert.equal(metadata.properties.operator, "Good Point");
  assert.deepEqual(metadata.raw, {});
  assert.equal("secret_contact" in metadata.properties, false);
});
