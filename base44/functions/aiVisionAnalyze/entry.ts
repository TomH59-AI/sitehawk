import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const VALID_ANALYSIS_TYPES = new Set(["aerial", "blueprint", "obstruction"]);
const VALID_SEVERITIES = new Set(["positive", "neutral", "warning", "critical"]);

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    overall_score: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    access_feasibility: { type: "string" },
    estimated_tower_height_ft: { type: "integer", minimum: 0 },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string" },
          severity: { type: "string", enum: ["positive", "neutral", "warning", "critical"] },
          detail: { type: "string" }
        },
        required: ["category", "severity", "detail"]
      }
    },
    recommendations: { type: "array", items: { type: "string" } }
  },
  required: [
    "overall_score",
    "summary",
    "access_feasibility",
    "estimated_tower_height_ft",
    "findings",
    "recommendations"
  ]
};

const MODE_PROMPTS = {
  aerial: `Analyze aerial or satellite imagery for wireless tower site acquisition.
Focus only on visible evidence and produce mode-appropriate findings for:
- likely tower placement zones and compound clear zones
- vegetation, buildings, terrain, water, power lines, or other obstructions
- access roads, drive paths, staging areas, and construction access feasibility
- parcel boundary clues, setbacks, open areas, and nearby land-use context
- recommended tower height needed for practical above-clutter deployment`,

  blueprint: `Analyze structural blueprints, floor plans, rooftop drawings, or site plans for DAS/small-cell feasibility.
Focus only on visible evidence and produce mode-appropriate findings for:
- DAS or small-cell antenna mounting points
- structural feasibility and likely load-bearing areas
- conduit/cable routing corridors
- electrical room, telco room, riser, shaft, and equipment-room proximity
- rooftop or maintenance access and installation constraints`,

  obstruction: `Analyze the image as an RF obstruction and line-of-sight engineering review.
Focus only on visible evidence and produce mode-appropriate findings for:
- buildings, trees, terrain, towers, tanks, or structures blocking RF LoS
- estimated obstruction severity and rough height implications
- Fresnel zone clearance concerns
- visible clear paths or compromised sectors
- required tower height to clear the apparent obstructions`
};

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 50;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function parseModelResult(raw) {
  if (typeof raw === "string") {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    try { return JSON.parse(cleaned); } catch { return {}; }
  }
  if (raw?.analysis && typeof raw.analysis === "object") return raw.analysis;
  return raw && typeof raw === "object" ? raw : {};
}

function fallbackFindings(analysisType) {
  const fallback = {
    aerial: {
      summary: "Aerial image review completed, but visual evidence was limited. Treat this as a preliminary site-screening result pending higher-resolution imagery or field validation.",
      access: "Unknown",
      height: 120,
      findings: [
        { category: "Tower placement zones", severity: "neutral", detail: "Potential placement zones require confirmation from clearer parcel imagery and boundary data." },
        { category: "Vegetation and obstructions", severity: "warning", detail: "Tree lines or nearby structures may affect compound placement and RF clearance if present." },
        { category: "Access roads", severity: "neutral", detail: "Construction and maintenance access could not be fully verified from the provided image." },
        { category: "Compound clear zone", severity: "warning", detail: "Confirm a clear equipment compound area, setbacks, and lease area before advancing." }
      ],
      recommendations: [
        "Upload a higher-resolution aerial or parcel map with visible boundaries.",
        "Confirm access road width, turning radius, and staging area in the field.",
        "Validate setbacks, compound footprint, and local zoning constraints before SCIP submission."
      ]
    },
    blueprint: {
      summary: "Blueprint review completed, but readable structural details were limited. Use this as a preliminary DAS/small-cell feasibility screen pending clearer drawings.",
      access: "Unknown",
      height: 25,
      findings: [
        { category: "Antenna mounting points", severity: "neutral", detail: "Candidate mounting locations require clearer structural labels or roof/floor plan callouts." },
        { category: "Structural feasibility", severity: "warning", detail: "Load-bearing capacity cannot be verified without structural notes or beam/column details." },
        { category: "Conduit routing", severity: "neutral", detail: "Likely conduit routes should be confirmed against risers, shafts, corridors, and ceiling access." },
        { category: "Electrical room proximity", severity: "neutral", detail: "Power and telecom room proximity could not be fully verified from the provided image." }
      ],
      recommendations: [
        "Upload a clearer floor plan with electrical, telecom, riser, and structural annotations.",
        "Have a structural engineer verify mounting loads before installation planning.",
        "Trace conduit routes from antenna zones to IDF/MDF or equipment rooms."
      ]
    },
    obstruction: {
      summary: "RF obstruction review completed, but obstruction heights and line-of-sight details were limited. Use this as a conservative preliminary clearance estimate.",
      access: "Moderate",
      height: 150,
      findings: [
        { category: "Line-of-sight obstructions", severity: "warning", detail: "Buildings, trees, or terrain may create sector-specific RF blockage and should be field-verified." },
        { category: "Fresnel zone clearance", severity: "warning", detail: "Fresnel clearance cannot be confirmed without target bearings, antenna heights, and path profiles." },
        { category: "Tower height", severity: "neutral", detail: "A conservative height estimate is recommended until obstruction heights are measured." },
        { category: "Clear RF paths", severity: "neutral", detail: "Clear sectors could not be confidently identified from the limited visual evidence." }
      ],
      recommendations: [
        "Run an RF path profile using proposed antenna height, frequency band, and target sectors.",
        "Measure nearby tree/building heights or use LiDAR/elevation data for clearance validation.",
        "Use a conservative tower height until Fresnel zone clearance is confirmed."
      ]
    }
  };
  return fallback[analysisType] || fallback.aerial;
}

function normalizeAnalysis(rawInput, analysisType) {
  const raw = parseModelResult(rawInput);
  const fallback = fallbackFindings(analysisType);
  const findings = Array.isArray(raw?.findings) && raw.findings.length ? raw.findings : fallback.findings;
  const recommendations = Array.isArray(raw?.recommendations) && raw.recommendations.length ? raw.recommendations : fallback.recommendations;

  return {
    overall_score: clampScore(raw?.overall_score),
    summary: String(raw?.summary || fallback.summary).trim(),
    access_feasibility: String(raw?.access_feasibility || fallback.access).trim(),
    estimated_tower_height_ft: Math.max(0, Math.round(Number(raw?.estimated_tower_height_ft) || fallback.height)),
    findings: findings.slice(0, 10).map((finding, index) => ({
      category: String(finding?.category || `${analysisType} finding ${index + 1}`).trim(),
      severity: VALID_SEVERITIES.has(finding?.severity) ? finding.severity : "neutral",
      detail: String(finding?.detail || "No detail provided.").trim()
    })),
    recommendations: recommendations.slice(0, 8).map((item) => String(item).trim()).filter(Boolean)
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { image_url, analysis_type = "aerial", lat, lon } = body;

    if (!image_url) return Response.json({ error: "image_url is required" });
    if (!VALID_ANALYSIS_TYPES.has(analysis_type)) {
      return Response.json({ error: "analysis_type must be aerial, blueprint, or obstruction" });
    }

    const locationContext = lat != null && lon != null
      ? `\nLocation context: latitude ${lat}, longitude ${lon}. Use this only for broad location-aware reasoning such as terrain context or FAA/airport proximity considerations; do not invent specific regulatory facts.`
      : "\nLocation context: not provided.";

    const prompt = `You are an expert wireless infrastructure vision analyst.
Return JSON only. Do not include markdown, commentary, code fences, or extra keys.
The JSON must exactly match this shape:
{
  "overall_score": integer 0-100,
  "summary": "short narrative paragraph",
  "access_feasibility": "short string such as Good, Moderate, Difficult, or Unknown",
  "estimated_tower_height_ft": integer,
  "findings": [{ "category": string, "severity": "positive|neutral|warning|critical", "detail": string }],
  "recommendations": [string]
}

Analysis mode: ${analysis_type}
${MODE_PROMPTS[analysis_type]}
${locationContext}

Accuracy rules:
- Use only what is visible in the uploaded image plus provided coordinates.
- If something cannot be verified, say it is unknown or estimated.
- For aerial mode, include tower zones, vegetation/obstruction, access, parcel/compound clearance findings.
- For blueprint mode, include mounting points, structural feasibility, conduit routing, electrical room proximity, and access findings.
- For obstruction mode, include obstruction types, line-of-sight/Fresnel concerns, and tower-height reasoning.
- Provide 4 to 7 findings and 3 to 6 practical recommendations.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      file_urls: [image_url],
      model: "claude_sonnet_4_6",
      response_json_schema: ANALYSIS_SCHEMA
    });

    const analysis = normalizeAnalysis(result, analysis_type);
    console.log(`AI vision analysis complete for user=${user.email} type=${analysis_type} score=${analysis.overall_score}`);

    return Response.json({ analysis });

  } catch (error) {
    console.error('aiVisionAnalyze error:', error.message);
    return Response.json({ error: error.message || "AI vision analysis failed" });
  }
});