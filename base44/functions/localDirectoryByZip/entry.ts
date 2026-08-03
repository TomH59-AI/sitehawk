import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

const valueOf = (result) => result?.data ?? result ?? {};
const clean = (value) => value && !/^(not available|n\/?a|unknown)$/i.test(String(value).trim()) ? value : null;
const cleanAddress = (value) => {
  const address = clean(value);
  return address ? String(address).replace(/^Dec-[^/]+\//i, "") : null;
};

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { zip } = await req.json().catch(() => ({}));
    const normalizedZip = String(zip || "").trim();
    if (!/^\d{5}$/.test(normalizedZip)) {
      return Response.json({ error: "Enter a valid 5-digit ZIP code" }, { status: 400 });
    }

    const params = new URLSearchParams({
      SingleLine: `${normalizedZip}, USA`, category: "Postal", countryCode: "USA", outFields: "*", f: "json",
    });
    const geocodeResponse = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?${params}`);
    const geocode = await geocodeResponse.json();
    const place = geocode?.candidates?.[0];
    const attributes = place?.attributes || {};
    const resolvedZip = String(attributes.Postal || attributes.PostalExt || "").slice(0, 5);
    if (!geocodeResponse.ok || !place || resolvedZip !== normalizedZip) {
      return Response.json({ error: "No data available — ESRI could not confirm that ZIP code" }, { status: 404 });
    }

    const lat = Number(place.location?.y);
    const lon = Number(place.location?.x);
    const state = attributes.RegionAbbr || attributes.Region || null;
    const city = attributes.City || attributes.PlaceName || null;
    const county = attributes.Subregion || null;

    const territoryCall = await base44.functions.invoke("electricUtilityLookup", { lat, lon });
    const territory = valueOf(territoryCall);
    let utility = null;
    if (territory.utility_name) {
      const contactCall = await base44.functions.invoke("electricProviderContact", {
        lat, lon, zip: normalizedZip, state, owner_name: territory.utility_name,
      });
      const contactResult = valueOf(contactCall);
      const candidate = contactResult?.match || {};
      const contact = contactResult?.match_source === "owner_name" && candidate.state === state ? candidate : {};
      utility = {
        name: territory.utility_name,
        type: clean(territory.utility_type) || clean(contact.type),
        phone: clean(territory.telephone) || clean(contact.phone),
        website: clean(territory.website) || clean(contact.website),
        address: cleanAddress(contact.address),
        source: [territory.source || "HIFLD (Oak Ridge National Lab)", Object.keys(contact).length ? "ElectricProvider contact directory" : null].filter(Boolean).join("; "),
        data_year: territory.data_year || null,
      };
    }

    const operators = await base44.entities.FiberOperator.filter({ active: true }, "name", 500);
    const fiber = operators
      .filter((operator) => operator.verified && (operator.states_served || []).includes(state))
      .map((operator) => ({
        id: operator.id,
        name: operator.name,
        type: operator.operator_type || "unknown",
        phone: operator.phone || null,
        website: operator.website || null,
        contact_name: operator.contact_name || null,
        source: operator.source || "Fiber Network Alliance member directory",
      }));

    return Response.json({
      zip: normalizedZip,
      location: { city, county, state, latitude: lat, longitude: lon, source: "ESRI World Geocoding" },
      utility,
      fiber,
      notices: {
        utility: utility ? null : "No data available — HIFLD electric territory lookup",
        fiber: fiber.length ? "Verified state coverage; confirm service availability at this ZIP code with the operator." : "No data available — verified Fiber Network Alliance directory contacts",
      },
    });
  } catch (error) {
    console.error("localDirectoryByZip error:", error);
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
}