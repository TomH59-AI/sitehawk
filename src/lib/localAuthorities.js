// Local Governing Authorities & Area Profile resolver.
// Auto-populates from the pipeline's site coordinates — reuses the existing
// nearestPublicSafetyDept backend lookup (PublicSafetyAgency directory + FCC
// PSAP registry + Mapbox reverse geocode for County/State), then caches per
// county+state on the LocalAuthorities entity so results are editable and
// never re-fetched on every render. Stored values (user-verified / HawkBit)
// always win over freshly resolved ones. Nothing here writes to any other
// pipeline record — read-only against Target A / coordinates / parcels.
import { base44 } from "@/api/base44Client";
import { nearestPublicSafetyDept } from "@/functions/nearestPublicSafetyDept";

const deptToRow = (d) =>
  d
    ? {
        name: d.name || null,
        address: [d.street_address, d.city, d.state, d.zip].filter(Boolean).join(", ") || null,
        phone: d.phone || null,
      }
    : null;

// Resolve everything for a site point. Returns:
// { police:{name,address,phone}, fire:{...}, nonEmergency911, dispatchName,
//   county, state, census:{population, summary}, recordId }
export async function getLocalAuthorities({ lat, lng }) {
  const res = await nearestPublicSafetyDept({ lat, lon: lng });
  const d = res?.data || {};
  const county = d.county || null;
  const state = d.state || null;

  // Cached, editable record for this county+state (if any).
  let record = null;
  if (county && state) {
    try {
      const rows = await base44.entities.LocalAuthorities.filter({ county, state }, "-updated_date", 1);
      record = rows?.[0] || null;
    } catch { record = null; }
  }

  // Census / area profile — prefer the stored value; otherwise one web-grounded
  // Census/ACS lookup, then cache it so it's a single call per county ever.
  let census = record?.census || null;
  if (!census?.summary && county && state) {
    try {
      const out = await base44.integrations.Core.InvokeLLM({
        prompt: `Using the latest US Census / ACS data, give a BRIEF area profile of ${county} County, ${state}, USA. Return the total county population as a number, and a one-to-two sentence overview (population, median household income or density, urban/rural character). Keep it short. Do not fabricate — omit anything you cannot verify.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            population: { type: ["number", "null"] },
            summary: { type: ["string", "null"] },
          },
        },
      });
      if (out && (out.population || out.summary)) census = { population: out.population ?? null, summary: out.summary ?? null };
    } catch { /* census stays null → "Not available — verify" */ }
  }

  // Stored (verified/HawkBit) values are the source of truth; resolved values fill gaps.
  const police = record?.police?.name ? record.police : deptToRow(d.police);
  const fire = record?.fire?.name ? record.fire : deptToRow(d.fire);
  const nonEmergency911 = record?.non_emergency_911 || d.psap?.phone || null;
  const dispatchName = record?.dispatch_name || d.psap?.name || "Local Dispatch";

  // Upsert the cache (best-effort — never blocks the table).
  let recordId = record?.id || null;
  if (county && state) {
    const payload = {
      county, state,
      police: police || null,
      fire: fire || null,
      dispatch_name: dispatchName,
      non_emergency_911: nonEmergency911 || null,
      census: census || null,
      fetched_at: new Date().toISOString(),
    };
    try {
      if (record) {
        if (!record.census?.summary && census?.summary) {
          await base44.entities.LocalAuthorities.update(record.id, { census, fetched_at: payload.fetched_at });
        }
      } else {
        const created = await base44.entities.LocalAuthorities.create(payload);
        recordId = created?.id || null;
      }
    } catch { /* cache write is best-effort */ }
  }

  return { police, fire, nonEmergency911, dispatchName, county, state, census, recordId };
}

// Persist user edits/verifications back to the cache record (creates it if needed).
export async function saveLocalAuthorities({ recordId, county, state, patch }) {
  if (recordId) return base44.entities.LocalAuthorities.update(recordId, patch);
  if (county && state) {
    const created = await base44.entities.LocalAuthorities.create({ county, state, ...patch });
    return created;
  }
  return null;
}