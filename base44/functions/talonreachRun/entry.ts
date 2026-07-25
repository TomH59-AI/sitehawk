import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// TalonReach® AI RF advisor — CloudRF /area coverage run + AI RF-engineer
// analysis (weak zones, causes, fixes, infill spot). Rate-limited per
// user/org like TalonFit; every run saved as an immutable report record.
const USER_LIMIT_PER_HOUR = 15;
const ORG_LIMIT_PER_HOUR = 60;
const CLOUDRF_BASE = "https://api.cloudrf.com";

// Destination point from lat/lon + bearing (deg) + distance (miles).
function destination(lat, lon, bearingDeg, distMi) {
  const R = 3958.8;
  const br = (bearingDeg * Math.PI) / 180;
  const la1 = (lat * Math.PI) / 180, lo1 = (lon * Math.PI) / 180;
  const d = distMi / R;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
  const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { latitude: +((la2 * 180) / Math.PI).toFixed(6), longitude: +((lo2 * 180) / Math.PI).toFixed(6) };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const source = body?.source === 'hawkperch' ? 'hawkperch' : 'tower_siter';
    const latitude = Number(body?.latitude), longitude = Number(body?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return Response.json({ error: 'latitude and longitude are required' }, { status: 400 });
    }
    const heightFt = Math.min(Math.max(Number(body?.tower_height_ft) || 199, 10), 500);
    const frequencyMhz = Math.min(Math.max(Number(body?.frequency_mhz) || 700, 400), 6000);
    const powerW = Math.min(Math.max(Number(body?.power_w) || 40, 1), 500);
    const radiusMi = Math.min(Math.max(Number(body?.radius_mi) || 5, 1), 10);
    const siteLabel = String(body?.site_label || 'Tower Site').slice(0, 60);

    // Rate limits — per user and per organization, rolling 1 hour (like TalonFit).
    const orgId = user.organization_id || (user.email || '').split('@')[1] || 'unknown';
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const [userRuns, orgRuns] = await Promise.all([
      base44.asServiceRole.entities.TalonReachRunLog.filter(
        { user_id: user.id, created_date: { $gte: hourAgo } }, '-created_date', USER_LIMIT_PER_HOUR + 1),
      base44.asServiceRole.entities.TalonReachRunLog.filter(
        { organization_id: orgId, created_date: { $gte: hourAgo } }, '-created_date', ORG_LIMIT_PER_HOUR + 1),
    ]);
    if (userRuns.length >= USER_LIMIT_PER_HOUR) {
      return Response.json({ error: `TalonReach® rate limit reached — max ${USER_LIMIT_PER_HOUR} analyses per hour per user.` }, { status: 429 });
    }
    if (orgRuns.length >= ORG_LIMIT_PER_HOUR) {
      return Response.json({ error: `TalonReach® rate limit reached — max ${ORG_LIMIT_PER_HOUR} analyses per hour for your organization.` }, { status: 429 });
    }

    const apiKey = Deno.env.get('CloudRF_API_KEY');
    if (!apiKey) return Response.json({ error: 'CloudRF_API_KEY not configured' }, { status: 500 });

    // 1. CloudRF /area coverage simulation
    const txHeightM = Math.round(heightFt * 0.3048);
    const radiusKm = Math.max(1, Math.round(radiusMi * 1.60934));
    const areaPayload = {
      site: siteLabel, network: "TalonReach",
      transmitter: { lat: latitude, lon: longitude, alt: txHeightM, frq: frequencyMhz, txw: powerW, bwi: 10, powerUnit: "W" },
      receiver: { lat: 0, lon: 0, alt: 2, rxg: 2, rxs: -100 },
      antenna: { txg: 16, txl: 0, ant: 1, azi: 0, tlt: 0, hbw: 360, vbw: 30, fbr: 0, pol: "v" },
      model: { pm: 1, pe: 2, ked: 0, rel: 95, ter: 4, cli: 6 },
      environment: { clm: 1, cll: 2, mat: 0 },
      output: { units: "m", col: "RAINBOW.dBm", out: 2, ber: 1, mod: 1, nf: -120, res: 30, rad: radiusKm },
    };
    const areaRes = await fetch(`${CLOUDRF_BASE}/area`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "key": apiKey },
      body: JSON.stringify(areaPayload),
    });
    if (!areaRes.ok) {
      const text = await areaRes.text();
      console.error("TalonReach CloudRF /area failed:", areaRes.status, text);
      return Response.json({ error: `CloudRF coverage run failed (${areaRes.status})` }, { status: 502 });
    }
    const area = await areaRes.json();
    const rawBounds = Array.isArray(area.bounds?.[0]) ? area.bounds[0] : area.bounds;
    const coverage = {
      png_url: area.PNG_Mercator || area.PNG_WGS84 || null,
      bounds: rawBounds || null,
      area_covered_sq_km: typeof area.area === 'number' ? area.area : null,
      coverage_pct: area.coverage ?? null,
    };

    // 2. AI RF-engineer analysis of the coverage result
    const theoreticalSqKm = Math.PI * Math.pow(radiusKm, 2);
    const analysis = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a senior RF engineer reviewing a CloudRF coverage simulation for a proposed telecom tower.

SITE: "${siteLabel}" at latitude ${latitude}, longitude ${longitude}.
TRANSMITTER: ${heightFt} ft AGL monopole, ${frequencyMhz} MHz, ${powerW} W, omni antenna (16 dBi), receiver threshold -100 dBm.
SIMULATION (radius ${radiusMi} mi): covered area ${coverage.area_covered_sq_km ?? 'unknown'} sq km of a theoretical ${theoreticalSqKm.toFixed(1)} sq km disc; CloudRF reported coverage: ${JSON.stringify(coverage.coverage_pct)}.

Research the real terrain, topography, land cover, and settlements around these exact coordinates and identify 2 to 5 weak or dead coverage zones a receiver at 2 m would experience within ${radiusMi} miles of the tower. For EACH zone give: a compass direction word, a precise bearing in degrees from true north, distance from the tower in miles (must be <= ${radiusMi}), an approximate radius of the affected pocket in miles (0.25 to 2), the dominant physical cause (terrain_shadow = blocked by a ridge/hill, distance = beyond reliable link budget, clutter = trees/buildings absorption), a severity, a SHORT map-pin label that names the cause and the fix (e.g. "Weak zone — terrain shadow, needs +30 ft"), and a one-sentence plain-English description mentioning what is actually there (valley, town, forest).

Then give 2 to 4 prioritized recommendations. Allowed types: height (state the new height in ft in the action), azimuth (sector/downtilt change), infill (a repeater/small cell), power, other. Each recommendation must state the action, the expected benefit, and reference the weak zone index (0-based) it primarily fixes, or null.

Finally propose the single BEST infill/repeater location as a bearing (deg) and distance (mi) from the tower — pick a spot with elevation and road access that fills the worst zones — plus a one-sentence rationale. Also assign an overall coverage letter grade A-F and a 2-3 sentence executive summary.`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          coverage_grade: { type: "string" },
          weak_zones: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                direction: { type: "string" },
                bearing_deg: { type: "number" },
                distance_mi: { type: "number" },
                radius_mi: { type: "number" },
                cause: { type: "string", enum: ["terrain_shadow", "distance", "clutter"] },
                severity: { type: "string", enum: ["moderate", "severe", "dead"] },
                description: { type: "string" },
              },
            },
          },
          recommendations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                priority: { type: "number" },
                type: { type: "string", enum: ["height", "azimuth", "infill", "power", "other"] },
                action: { type: "string" },
                expected_benefit: { type: "string" },
                zone_index: { type: ["number", "null"] },
              },
            },
          },
          infill: {
            type: "object",
            properties: {
              bearing_deg: { type: "number" },
              distance_mi: { type: "number" },
              rationale: { type: "string" },
            },
          },
        },
      },
    });

    // 3. Resolve zone + infill coordinates server-side from bearing/distance.
    const weakZones = (analysis?.weak_zones || []).slice(0, 5).map((z) => {
      const distMi = Math.min(Math.max(Number(z.distance_mi) || 1, 0.2), radiusMi);
      const pt = destination(latitude, longitude, Number(z.bearing_deg) || 0, distMi);
      return { ...z, distance_mi: distMi, radius_mi: Math.min(Math.max(Number(z.radius_mi) || 0.5, 0.25), 2), ...pt };
    });
    let infill = null;
    let infillSource = null;
    if (analysis?.infill && Number.isFinite(Number(analysis.infill.distance_mi))) {
      const distMi = Math.min(Math.max(Number(analysis.infill.distance_mi), 0.2), radiusMi);
      infill = { ...destination(latitude, longitude, Number(analysis.infill.bearing_deg) || 0, distMi), rationale: analysis.infill.rationale || null };
      infillSource = 'ai_estimate';

      // 4. CloudRF Best Site Analysis — refine the infill spot inside a ~2 mi
      // search box around the AI candidate. Best-effort: any failure keeps the
      // AI estimate (BSA availability depends on the CloudRF plan).
      try {
        const half = 0.015; // ~1 mile in degrees
        const bsaPayload = {
          ...areaPayload,
          site: `${siteLabel} infill`.slice(0, 50),
          transmitter: { ...areaPayload.transmitter, lat: infill.latitude, lon: infill.longitude, alt: 15 },
          output: { ...areaPayload.output, rad: 3 },
          bounds: [infill.latitude + half, infill.longitude + half, infill.latitude - half, infill.longitude - half],
          points: 20,
        };
        const bsaRes = await fetch(`${CLOUDRF_BASE}/bsa`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "key": apiKey },
          body: JSON.stringify(bsaPayload),
        });
        if (bsaRes.ok) {
          const bsa = await bsaRes.json();
          const best = bsa?.results?.[0] || bsa?.best?.[0] || (Array.isArray(bsa) ? bsa[0] : null);
          const bLat = Number(best?.lat ?? best?.latitude), bLon = Number(best?.lon ?? best?.longitude);
          if (Number.isFinite(bLat) && Number.isFinite(bLon)) {
            infill = { ...infill, latitude: +bLat.toFixed(6), longitude: +bLon.toFixed(6) };
            infillSource = 'cloudrf_bsa';
          }
        } else {
          console.warn("CloudRF /bsa unavailable:", bsaRes.status, (await bsaRes.text()).slice(0, 300));
        }
      } catch (e) {
        console.warn("CloudRF /bsa attempt failed:", e.message);
      }
    }

    // 5. Save the run as an immutable report record (service role only).
    const runId = crypto.randomUUID();
    const record = {
      run_id: runId,
      user_id: user.id,
      user_email: user.email || null,
      organization_id: orgId,
      source,
      parcel_id: body?.parcel_id || null,
      site_label: siteLabel,
      latitude, longitude,
      jurisdiction: body?.jurisdiction || null,
      tower_height_ft: heightFt,
      frequency_mhz: frequencyMhz,
      power_w: powerW,
      radius_mi: radiusMi,
      coverage,
      analysis: {
        summary: analysis?.summary || null,
        coverage_grade: analysis?.coverage_grade || null,
        weak_zones: weakZones,
        recommendations: (analysis?.recommendations || []).slice(0, 6),
      },
      infill,
      infill_source: infillSource,
      run_timestamp_utc: new Date().toISOString(),
    };
    await base44.asServiceRole.entities.TalonReachRunLog.create(record);

    return Response.json({
      ok: true,
      run_id: runId,
      report: record,
      remaining_user_runs: USER_LIMIT_PER_HOUR - userRuns.length - 1,
    });
  } catch (error) {
    console.error('talonreachRun error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});