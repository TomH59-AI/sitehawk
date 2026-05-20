import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { imageUrl, compoundWidth, compoundDepth, towerHeight, towerType, jurisdictionId } = payload;

    if (!imageUrl || !jurisdictionId) {
      return Response.json({ error: 'Missing required parameters: imageUrl, jurisdictionId' }, { status: 400 });
    }

    // Fetch jurisdiction from Base44 entity
    const jurisdiction = await base44.asServiceRole.entities.Jurisdiction.get(jurisdictionId);
    if (!jurisdiction) {
      return Response.json({ error: 'Jurisdiction not found' }, { status: 404 });
    }

    const { height_limit_ft, setback_ft, fall_zone_ft, stealth_required } = jurisdiction;

    // Build structured prompts
    const elevationPrompt = `Generate an ultrarealistic architectural RIGHT-SIDE ELEVATION rendering. Insert a ${towerType} tower ${towerHeight} feet tall and a ${compoundWidth} ft wide × ${compoundDepth} ft deep fenced equipment compound into the provided photo. Position the compound with a ${setback_ft} ft setback from the nearest property line. Show dimensions and setback measurements as subtle dimension lines (width, depth, setback, tower height). The tower should match the correct visual scale to surrounding trees and structures. Match lighting, shadows, and time-of-day. Photorealistic, professional, no cartoon style.${stealth_required ? ' Use a stealth/concealment tower design (e.g. monopine, flagpole, or chimney-style).' : ''}`;

    const crossSectionPrompt = `Generate an ultrarealistic CROSS-SECTION/PROFILE view showing the ${towerType} tower ${towerHeight} feet tall with the ${compoundWidth} ft × ${compoundDepth} ft compound. Include ground profile, setback measurement from property line (${setback_ft} ft), tower height annotation, and fall zone radius (${fall_zone_ft} ft) marked. Show subsurface foundation and anchor details. Include dimension lines and labels. Match the site's terrain and landscape. Photorealistic, technical drawing style with clarity.`;

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    // Generate both renders in parallel
    const [elevRes, crossRes] = await Promise.all([
      fetch('https://generativelanguage.googleapis.com/v1beta/files:generateImages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
        body: JSON.stringify({ requests: [{ prompt: elevationPrompt, image: { image_uri: imageUrl } }] }),
      }),
      fetch('https://generativelanguage.googleapis.com/v1beta/files:generateImages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
        body: JSON.stringify({ requests: [{ prompt: crossSectionPrompt, image: { image_uri: imageUrl } }] }),
      }),
    ]);

    const elevData = await elevRes.json();
    const crossData = await crossRes.json();

    if (!elevData.rasterImageResponses || !crossData.rasterImageResponses) {
      console.error('Gemini response missing rasterImageResponses:', { elevData, crossData });
      return Response.json({ error: 'Failed to generate renders', details: { elevData, crossData } }, { status: 500 });
    }

    const elevationImageUrl = elevData.rasterImageResponses[0].imageUri;
    const crossSectionImageUrl = crossData.rasterImageResponses[0].imageUri;

    // Log render to Base44 entity
    await base44.entities.VisionRender.create({
      jurisdiction_id: jurisdictionId,
      source_image_url: imageUrl,
      compound_width_ft: compoundWidth,
      compound_depth_ft: compoundDepth,
      tower_height_ft: towerHeight,
      tower_type: towerType,
      elevation_render_url: elevationImageUrl,
      cross_section_render_url: crossSectionImageUrl,
      metadata: { height_limit_ft, setback_ft, fall_zone_ft, stealth_required },
    });

    return Response.json({
      elevationImageUrl,
      crossSectionImageUrl,
      metadata: { height_limit_ft, setback_ft, fall_zone_ft, stealth_required },
    });
  } catch (error) {
    console.error('generateSiteRenders error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});