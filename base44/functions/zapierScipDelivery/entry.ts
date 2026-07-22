// zapierScipDelivery — sends the TIERED SCIP document payload to the Zapier
// Catch Hook so a Zapier document app (PDFMonkey / Formstack Documents) can
// assemble and deliver the PDF.
//   Hawk Basic      → site data, aerial map, AI narrative, property info
//   Hawk Premier    → everything EXCEPT propagation, HawkPerch, fiber, compliance
//   Hawk Enterprise → absolutely everything + company name/logo/address branding
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const ZAPIER_WEBHOOK_URL = 'https://hooks.zapier.com/hooks/catch/16913860/445ssew/';

const mapUrl = (m: any): string | null =>
  typeof m === 'string' ? m : m?.url || m?.src || m?.image_url || null;

function buildPayload(tier: string, record: any, branding: any) {
  const t = record?.targetA || {};
  const maps = record?.maps || {};
  const cond = record?.conditions || {};

  const base: Record<string, any> = {
    event: 'scip_document_request',
    tier,
    agent_name: record?.agent_name || '',
    agent_email: record?.agent_email || '',
    agent_phone: record?.agent_phone || '',
    site_name: record?.site_name || '',
    latitude: record?.latitude ?? null,
    longitude: record?.longitude ?? null,
    coordinates: record?.latitude != null ? `${record.latitude}, ${record.longitude}` : '',
    submittal_date: (record?.generated_at || new Date().toISOString()).slice(0, 10),
    tower_height_ft: record?.tower_height_ft ?? null,
    radius_miles: record?.radius_miles ?? null,
    county: record?.county || '',
    state: record?.state || '',
    // Property information
    property: {
      owner_name: t.owner_name || '',
      parcel_address: t.parcel_address || '',
      parcel_id: t.apn || '',
      acreage: t.acreage ?? null,
      boundaries: t.boundaries || '',
      zoning_classification: t.zoning_classification || '',
      mailing_address: t.mailing_address || '',
      land_use: t.land_use || '',
      fema_risk_factor: t.fema_risk_factor || '',
      ground_elevation_ft: t.ground_elevation_ft ?? null,
      taxes_paid: t.taxes_paid || '',
    },
    aerial_map: mapUrl(maps.aerial),
    // "Why this site works" — the AI professional narrative
    site_narrative: record?.professional || null,
    sent_at: new Date().toISOString(),
  };

  if (tier === 'basic') return base;

  // Premier: all maps + zoning + deed + power + conditions,
  // EXCLUDING fiber optics and compliance information.
  const allMaps: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(maps)) allMaps[k] = mapUrl(v);
  const premier = {
    ...base,
    sarf_map: mapUrl(record?.sarf_map),
    maps: allMaps,
    zoning: record?.zoning || null,
    deed: record?.deed || null,
    power: record?.utilities?.power || null,
    conditions: {
      flood_zone: cond.flood_zone || '',
      power_provider: cond.power_provider || '',
      access_notes: cond.access_notes || '',
      airport: cond.airport || '',
      cell_tower: cond.cell_tower || '',
      wind: cond.wind || '',
      local_police: cond.local_police || '',
      local_fire: cond.local_fire || '',
    },
  };

  if (tier === 'premier') return premier;

  // Enterprise: absolutely everything + fiber + compliance + branding.
  return {
    ...premier,
    fiber: record?.utilities?.fiber || null,
    compliance: {
      wetlands: cond.wetlands || '',
      hazardous_waste: cond.hazardous_waste || '',
      water_management_district: cond.water_management_district || '',
      fiber_available: cond.fiber || '',
      telco_provider: cond.telco_provider || '',
    },
    viewshed: record?.viewshed || null,
    branding: {
      company_name: branding?.company_name || '',
      company_address: branding?.company_address || '',
      logo_url: branding?.logo_url || '',
    },
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const authed = await base44.auth.isAuthenticated();
    if (!authed) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { tier, record, branding } = await req.json();
    if (!record) return Response.json({ error: 'record required' }, { status: 400 });
    const tierKey = ['basic', 'premier', 'enterprise'].includes(tier) ? tier : 'basic';

    const payload = buildPayload(tierKey, record, branding);
    const res = await fetch(ZAPIER_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('Zapier SCIP delivery failed:', res.status, text.slice(0, 300));
      return Response.json({ error: `Zapier webhook HTTP ${res.status}` }, { status: 502 });
    }
    console.log(`Zapier SCIP delivery sent: tier=${tierKey} site=${payload.site_name}`);
    return Response.json({ ok: true, tier: tierKey, zapier_status: res.status });
  } catch (error) {
    console.error('zapierScipDelivery error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});