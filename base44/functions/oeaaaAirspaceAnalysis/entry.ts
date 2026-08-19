import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const EMPTY_FC = { type: "FeatureCollection", features: [] };
const EARTH_RADIUS_MILES = 3958.7613;
const FIXED_WING_EXCLUDED = new Set(["closed", "balloonport", "seaplane_base"]);

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toDegrees(value) {
  return (value * 180) / Math.PI;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a));
}

function destinationPoint(lng, lat, distanceMiles, bearingDegrees) {
  const angularDistance = distanceMiles / EARTH_RADIUS_MILES;
  const bearing = toRadians(bearingDegrees);
  const startLat = toRadians(lat);
  const startLng = toRadians(lng);

  const endLat = Math.asin(
    Math.sin(startLat) * Math.cos(angularDistance) +
      Math.cos(startLat) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const endLng =
    startLng +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(startLat),
      Math.cos(angularDistance) - Math.sin(startLat) * Math.sin(endLat)
    );

  return [toDegrees(endLng), toDegrees(endLat)];
}

function circleFeature(lng, lat, radiusMiles, properties) {
  const ring = [];
  for (let step = 0; step <= 72; step += 1) {
    ring.push(destinationPoint(lng, lat, radiusMiles, step * 5));
  }
  return {
    type: "Feature",
    properties,
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

function criteriaForAirport(airportType) {
  const normalized = String(airportType || "").toLowerCase();
  if (normalized === "heliport") {
    return { radiusMiles: 5000 / 5280, slope: "25:1", category: "heliport" };
  }
  if (normalized === "large_airport" || normalized === "medium_airport") {
    return { radiusMiles: 20000 / 5280, slope: "100:1", category: "airport_over_3200_ft" };
  }
  return { radiusMiles: 10000 / 5280, slope: "50:1", category: "airport_3200_ft_or_less" };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return Response.json({ error: "Valid lat/lng required" }, { status: 400 });
    }

    const requestedRadius = Number(body?.radiusMiles ?? 3);
    const radiusMiles = Math.min(Math.max(Number.isFinite(requestedRadius) ? requestedRadius : 3, 0.1), 3);

    // The 3-mile value is the area being screened. Search farther out so an
    // airport's outer notice-criteria radius can still intersect that area.
    const searchMiles = 35;
    const latDelta = searchMiles / 69;
    const lonDelta = searchMiles / Math.max(10, 69 * Math.cos(toRadians(lat)));

    const raw = await base44.asServiceRole.entities.Airport.filter({
      latitude_deg: { $gte: lat - latDelta, $lte: lat + latDelta },
      longitude_deg: { $gte: lng - lonDelta, $lte: lng + lonDelta },
    }, null, 2000);

    const airports = (raw || [])
      .filter((airport) => {
        const type = String(airport.airport_type || "").toLowerCase();
        return !FIXED_WING_EXCLUDED.has(type) &&
          Number.isFinite(Number(airport.latitude_deg)) &&
          Number.isFinite(Number(airport.longitude_deg));
      })
      .map((airport) => ({
        airport,
        distanceMiles: haversineMiles(
          lat,
          lng,
          Number(airport.latitude_deg),
          Number(airport.longitude_deg)
        ),
      }))
      .sort((a, b) => a.distanceMiles - b.distanceMiles);

    const nearestAirports = airports.slice(0, 8).map(({ airport, distanceMiles }) => ({
      id: airport.airport_callnumber || airport.id,
      name: airport.airport_name || "Unnamed airport",
      type: airport.airport_type || null,
      lat: Number(airport.latitude_deg),
      lng: Number(airport.longitude_deg),
      distanceMiles: Number(distanceMiles.toFixed(2)),
    }));

    const intersecting = airports.filter(({ airport, distanceMiles }) => {
      const criteria = criteriaForAirport(airport.airport_type);
      return distanceMiles <= radiusMiles + criteria.radiusMiles;
    });

    const part77Surfaces = {
      ...EMPTY_FC,
      features: intersecting.map(({ airport, distanceMiles }) => {
        const criteria = criteriaForAirport(airport.airport_type);
        return circleFeature(
          Number(airport.longitude_deg),
          Number(airport.latitude_deg),
          criteria.radiusMiles,
          {
            airportId: airport.airport_callnumber || airport.id,
            airportName: airport.airport_name || "Unnamed airport",
            airportType: airport.airport_type || null,
            surfaceType: "notice_screening_radius",
            screeningDistanceMiles: Number(criteria.radiusMiles.toFixed(2)),
            screeningSlope: criteria.slope,
            criteriaCategory: criteria.category,
            centerDistanceMiles: Number(distanceMiles.toFixed(2)),
            screeningOnly: true,
          }
        );
      }),
    };

    const hazardZones = {
      ...EMPTY_FC,
      features: part77Surfaces.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          classification: "POTENTIAL_NOTICE_ZONE",
          riskLevel: "HIGH",
          noticeRequired: true,
        },
      })),
    };

    const noticeRequired = hazardZones.features.length > 0;
    const airportNames = intersecting
      .slice(0, 3)
      .map(({ airport }) => airport.airport_callnumber || airport.airport_name)
      .filter(Boolean)
      .join(", ");

    return Response.json({
      nearestAirports,
      part77Surfaces,
      hazardZones,
      summary: {
        noticeRequired,
        riskLevel: noticeRequired ? "HIGH" : "LOW",
        notes: noticeRequired
          ? `The analysis area intersects an estimated FAA notice-criteria zone near ${airportNames || "an airport"}. Verify in FAA OE/AAA before relying on this result.`
          : "No estimated airport notice-criteria zone intersects this 3-mile screening area.",
        screeningOnly: true,
        radiusMiles,
        officialPortalUrl: "https://oeaaa.faa.gov/",
        limitations:
          "SiteHawk uses airport reference points and generalized radial criteria. It does not calculate runway-specific approach surfaces or issue FAA determinations.",
      },
    });
  } catch (error) {
    console.log(`[ERROR] oeaaaAirspaceAnalysis: ${error?.message || error}`);
    return Response.json({ error: "OE/AAA analysis failed" }, { status: 500 });
  }
});
