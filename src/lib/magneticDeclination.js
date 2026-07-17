// Lightweight geomagnetic declination estimate (degrees East positive).
//
// Uses a tilted-dipole (order-1 IGRF/WMM) approximation of the geomagnetic
// field. This is accurate to within a couple degrees across the continental US
// — plenty for showing the offset between True North and Magnetic North on a
// map compass. For survey-grade declination, use NOAA's WMM service.

const DEG = Math.PI / 180;

// Geomagnetic north pole (approx. 2020 epoch).
const POLE_LAT = 80.65 * DEG;
const POLE_LON = -72.68 * DEG;

// Estimate magnetic declination (deg, East +) at a lat/lon in degrees.
export function magneticDeclination(latDeg, lonDeg) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;

  // Bearing from the site to the geomagnetic north pole (great-circle).
  const dLon = POLE_LON - lon;
  const y = Math.sin(dLon) * Math.cos(POLE_LAT);
  const x = Math.cos(lat) * Math.sin(POLE_LAT) - Math.sin(lat) * Math.cos(POLE_LAT) * Math.cos(dLon);
  let dec = Math.atan2(y, x) / DEG;

  // Normalize to [-180, 180].
  if (dec > 180) dec -= 360;
  if (dec < -180) dec += 360;
  return dec;
}