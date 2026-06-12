// HawkPerch — tier gating (Stripe-backed entitlement, same tier source as the
// Run Zoning gate: User.tier). Checked when the placement engine fires on a
// REAL parcel — never on page load.
//
// Tier map:  hawk_site → HawkSite · hawkeyes → HawkVision · hawkeye_apex → HawkCommand

export function siterEntitlements(user) {
  const tier = user?.role === "admin" ? "hawkeye_apex" : user?.tier || "free";
  switch (tier) {
    case "hawk_site":
      return { tier, label: "HawkSite", realParcels: true, monthlyRuns: 3, watermark: true, peAllowed: false, residentialCheck: false, batch: false };
    case "hawkeyes":
      return { tier, label: "HawkVision", realParcels: true, monthlyRuns: Infinity, watermark: false, peAllowed: true, residentialCheck: true, batch: false };
    case "hawkeye_apex":
      return { tier, label: "HawkCommand", realParcels: true, monthlyRuns: Infinity, watermark: false, peAllowed: true, residentialCheck: true, batch: true };
    default:
      return { tier: "free", label: "Free", realParcels: false, monthlyRuns: 0, watermark: true, peAllowed: false, residentialCheck: false, batch: false };
  }
}

// Demo parcel — irregular ~5-acre tract, Iredell County NC (free tier + acceptance test #1).
export const DEMO_PARCEL = {
  apn: "DEMO-IREDELL-001",
  ownerName: "DEMO TRACT — SITEHAWK",
  addressFull: "DEMO PARCEL · IREDELL COUNTY NC",
  state: "NC",
  county: "IREDELL",
  jurisdiction: "IREDELL COUNTY",
  acres: 9.6,
  zoningCode: "RA",
  legalDesc: "Demo tract for Tower Siter evaluation — not a real parcel record.",
  source: "demo",
  location: { type: "Point", coordinates: [-80.8895, 35.7805] },
  geometry: {
    type: "Polygon",
    coordinates: [[
      [-80.8910, 35.7796],
      [-80.8880, 35.7796],
      [-80.8880, 35.7806],
      [-80.8888, 35.7806],
      [-80.8888, 35.7814],
      [-80.8910, 35.7814],
      [-80.8910, 35.7796],
    ]],
  },
};