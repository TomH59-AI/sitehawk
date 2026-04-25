import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { image_url, analysis_type, lat, lon } = body;

    if (!image_url) return Response.json({ error: 'image_url is required' }, { status: 400 });

    const prompts = {
      aerial: `You are a wireless infrastructure site acquisition expert analyzing an aerial photograph.
Analyze this aerial image for cell tower placement suitability. Identify:
1. Potential tower placement zones (flat open areas, elevated terrain, rooftops)
2. Obstructions (trees, buildings, power lines, water bodies)
3. Zoning clues visible (industrial, commercial, residential density)
4. Access road feasibility
5. Overall suitability score (0-100)
6. Top 3 recommended micro-locations within the image with reasoning
Be specific and reference visual elements you can see.`,

      blueprint: `You are a wireless infrastructure site acquisition expert analyzing a site blueprint or floor plan.
Analyze this blueprint/plan for cell tower or DAS (Distributed Antenna System) placement suitability. Identify:
1. Structural load-bearing points suitable for antenna mounting
2. RF propagation zones (open areas, corridors, high-traffic zones)
3. Potential interference sources (HVAC, electrical rooms, metal structures)
4. Cable routing feasibility
5. Recommended antenna placement points with reasoning
6. Overall DAS/small cell suitability score (0-100)`,

      obstruction: `You are an RF engineer analyzing an image for wireless signal obstruction analysis.
Identify and catalog all potential RF obstructions visible:
1. Physical obstructions (buildings, trees, hills, water towers)
2. Estimated height and obstruction severity for each (low/medium/high)
3. Line-of-sight paths that appear clear
4. Fresnel zone concerns
5. Recommended tower height to clear obstructions
6. Obstruction severity score (0-100, where 0=no obstructions, 100=fully blocked)`
    };

    const prompt = prompts[analysis_type] || prompts.aerial;
    const evidenceGuardrail = `\n\nCritical accuracy rules: Do not invent owners, zoning, permits, distances, utilities, or site conditions that are not visible in the uploaded image or explicitly provided in the location context. If something cannot be confirmed from the image, say it is unknown. Phrase all inferred observations as estimates, not facts.`;
    const locationContext = lat && lon ? `\n\nLocation context: Coordinates ${lat}, ${lon}.` : '';

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: prompt + evidenceGuardrail + locationContext,
      file_urls: [image_url],
      response_json_schema: {
        type: "object",
        properties: {
          overall_score: { type: "number", description: "Suitability score 0-100" },
          summary: { type: "string", description: "Brief overall assessment" },
          findings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: { type: "string" },
                severity: { type: "string", enum: ["positive", "neutral", "warning", "critical"] },
                detail: { type: "string" }
              }
            }
          },
          recommendations: {
            type: "array",
            items: { type: "string" }
          },
          estimated_tower_height_ft: { type: "number" },
          access_feasibility: { type: "string", enum: ["easy", "moderate", "difficult", "unknown"] }
        }
      }
    });

    console.log(`AI vision analysis complete for user=${user.email} type=${analysis_type} score=${result.overall_score}`);
    return Response.json({ analysis: result });

  } catch (error) {
    console.error('aiVisionAnalyze error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});