import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon, ordinance, candidates } = await req.json();
    if (!lat || !lon) return Response.json({ error: 'lat and lon are required' }, { status: 400 });

    const candidateContext = (candidates || []).slice(0, 3).map((c, i) => ({
      rank: i + 1,
      parcel_address: c.parcel_address || null,
      zoning: c.zoning || c.zoning_classification || null,
      parcel_id: c.parcel_id || null,
    }));

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'gemini_3_flash',
      add_context_from_internet: true,
      prompt: `You are a municipal zoning research analyst for telecom site acquisition.\n\nTask: identify the local municipal/county zoning ordinance sections that govern wireless telecommunications facilities, telecom towers, communication towers, antennas, small wireless facilities, wireless support structures, collocation, stealth/concealment, setbacks, height, special use permits, conditional use permits, and related approvals for the location below.\n\nCoordinates: ${lat}, ${lon}\nExisting scan ordinance context: ${JSON.stringify(ordinance || {})}\nCandidate parcel context: ${JSON.stringify(candidateContext)}\n\nCritical accuracy rules:\n- Use only current public sources you can find on the internet.\n- Do not invent section numbers, clause text, URLs, jurisdiction names, permit requirements, or height limits.\n- If the relevant ordinance cannot be verified, return status='not_verified' and explain what is missing.\n- For each clause, include the exact source URL and quote or close paraphrase only if supported by the source.\n- Prefer official municipal/county ordinance/code library URLs over summaries.\n- Focus specifically on telecom tower and antenna zoning sections, not generic parcel zoning.`,
      response_json_schema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['verified', 'partial', 'not_verified'] },
          jurisdiction: { type: 'string' },
          ordinance_title: { type: 'string' },
          source_urls: { type: 'array', items: { type: 'string' } },
          ldc_display: { type: 'string' },
          section_ref: { type: 'string' },
          section_title: { type: 'string' },
          telecom_sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                section_ref: { type: 'string' },
                section_title: { type: 'string' },
                topic: { type: 'string' },
                clause_summary: { type: 'string' },
                source_url: { type: 'string' },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
              }
            }
          },
          height_limit_ft: { type: 'number' },
          permit_type: { type: 'string' },
          collocation_required: { type: 'boolean' },
          stealth_required: { type: 'boolean' },
          setback_summary: { type: 'string' },
          extraction_notes: { type: 'string' }
        }
      }
    });

    const sections = Array.isArray(result.telecom_sections) ? result.telecom_sections : [];
    const sourceUrls = Array.isArray(result.source_urls) ? result.source_urls : [];
    const hasVerifiedSource = sections.some(s => s.source_url) || sourceUrls.length > 0;

    const normalized = {
      ...result,
      status: hasVerifiedSource ? (result.status || 'partial') : 'not_verified',
      telecom_sections: sections,
      source_urls: sourceUrls,
      extracted_at: new Date().toISOString(),
      extracted_by: 'SiteHawk AI ordinance extraction',
    };

    console.log(`Ordinance extraction ${normalized.status}: user=${user.email} jurisdiction=${normalized.jurisdiction || 'unknown'} sections=${sections.length}`);
    return Response.json({ ordinance_metadata: normalized });
  } catch (error) {
    console.error('extractTelecomOrdinance error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});