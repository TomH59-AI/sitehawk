import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ADMIN-ONLY. HawkBot drafts a marketing/lifecycle email (subject + body) for a
// SiteHawk subscriber campaign. Returns a DRAFT only — it never sends. An admin
// must review and approve before sending.
const TYPE_GUIDE = {
  product_update: "Announce a product update / improvement. Excited but professional.",
  special: "Promote a limited-time special or discount. Clear value + soft urgency.",
  onboarding: "Help a new subscriber get their first win (their first SCIP). Encouraging, step-by-step.",
  winback: "Re-engage a canceled or lapsed subscriber. Warm, no guilt, remind them of value.",
  announcement: "Announce a brand-new feature. Highlight the benefit and how to try it.",
  upgrade_nudge: "Nudge a subscriber toward a higher tier based on their usage. Helpful, not pushy.",
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (me?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const { type = 'product_update', segment = 'all', topic = '', tone = 'friendly and professional' } = await req.json().catch(() => ({}));

    const prompt = `You are HawkBot, the marketing assistant for SiteHawk / SkyWave — a SaaS platform that helps cell-tower site-acquisition pros run SCIPs (Site Candidate Information Packages), zoning, parcel targeting, postcard mailers and coverage analysis.

Write a single ${type.replace(/_/g, ' ')} email.
Purpose: ${TYPE_GUIDE[type] || TYPE_GUIDE.product_update}
Target audience segment: ${segment}
${topic ? `Specific topic / details to include: ${topic}` : ''}
Tone: ${tone}.

Rules:
- Keep it concise (120-200 words).
- Personalize with a {{name}} merge tag at the greeting.
- Do NOT include an unsubscribe footer — the system appends it automatically.
- Plain, friendly language. One clear call to action.

Return a compelling subject line and an HTML email body (simple inline HTML, no <html>/<head> wrappers).`;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          subject: { type: 'string' },
          body: { type: 'string', description: 'HTML email body' },
        },
        required: ['subject', 'body'],
      },
    });

    return Response.json({ subject: res.subject, body: res.body });
  } catch (error) {
    console.error('subscriberCampaignDraft error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});