import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { generateText } from "npm:ai@7.0.16";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@3.0.5";

const valueOf = (result) => result?.data ?? result ?? {};
const clean = (value) => value && !/^(not available|n\/?a|unknown)$/i.test(String(value).trim()) ? value : null;
const cleanAddress = (value) => {
  const address = clean(value);
  return address ? String(address).replace(/^Dec-[^/]+\//i, "") : null;
};

const verifiedContact = (item) => item && ({
  name: clean(item.name), department: clean(item.department), contact_name: clean(item.contact_name),
  title: clean(item.title), address: cleanAddress(item.address), phone: clean(item.phone) === "911" ? null : clean(item.phone),
  email: clean(item.email), website: clean(item.website), official_source_url: clean(item.official_source_url),
  source: "Built-in Gemini grounded search of official government sources",
});

async function lookupAuthorities(base44, location) {
  const { baseURL, token } = base44.asServiceRole.aiGateway.connection();
  const models = createOpenAICompatible({ name: "base44", baseURL, apiKey: token, supportsStructuredOutputs: true });
  const { text } = await generateText({
    model: models("gemini_3_flash"),
    providerOptions: { base44: { web_search_options: {} } },
    prompt: `Find official local government and public-safety contacts serving ZIP ${location.zip} (${location.city || "unknown city"}, ${location.county || "unknown county"}, ${location.state || "unknown state"}). Use ONLY official city, county, police, fire, or 911/dispatch government websites. Return strict JSON only with keys: governing_authorities (array of up to 3 objects with name, department, contact_name, title, address, phone, email, website, official_source_url), police (object with name, address, phone, website, official_source_url), fire (same), dispatch (same, but phone must be the published NON-EMERGENCY number and never 911). Use null for every value that cannot be verified. Do not guess, infer, or fabricate.`,
  });
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const parsed = JSON.parse(text.slice(start, end + 1));
  return {
    jurisdictions: Array.isArray(parsed.governing_authorities) ? parsed.governing_authorities.slice(0, 3).map(verifiedContact).filter((item) => item?.name) : [],
    police: verifiedContact(parsed.police),
    fire: verifiedContact(parsed.fire),
    dispatch: verifiedContact(parsed.dispatch),
  };
}

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
    const authorities = await lookupAuthorities(base44, { zip: normalizedZip, city, county, state });

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
      authorities,
      notices: {
        authorities: authorities ? null : "No data available — built-in Gemini could not verify official local contacts",
        utility: utility ? null : "No data available — HIFLD electric territory lookup",
        fiber: fiber.length ? "Verified state coverage; confirm service availability at this ZIP code with the operator." : "No data available — verified Fiber Network Alliance directory contacts",
      },
    });
  } catch (error) {
    console.error("localDirectoryByZip error:", error);
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
}