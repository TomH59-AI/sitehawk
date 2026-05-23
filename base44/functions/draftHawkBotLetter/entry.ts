/**
 * draftHawkBotLetter — uses InvokeLLM to draft a single-landlord proposition
 * letter in the tonality chosen by the user. Returns the body text only —
 * the front matter (sender block, To: block, signature) is rendered client-side
 * + server-side at send-time so we don't waste tokens on boilerplate.
 *
 * Payload:
 *   {
 *     owner_name, parcel_address, parcel_size_acres, zoning_classification,
 *     sender_company, sender_phone, sender_email,
 *     tonality,            // "professional" | "friendly" | "urgent" | "direct" | "warm"
 *     extra_context        // optional free-text the user wants HawkBot to weave in
 *   }
 *
 * Returns: { body: string }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TONE_GUIDE = {
  professional: "Formal, business-grade, third-party tone. Use industry terms (ground lease, easement, telecom infrastructure). No exclamation marks. Reads like outside counsel.",
  friendly: "Warm, neighborly, first-person. Light contractions, short sentences. Reads like someone they'd meet at a county chamber lunch.",
  urgent: "Time-sensitive but respectful. Mentions limited search window, comparable sites moving fast, deadline-driven without being pushy.",
  direct: "Plain, no-frills, results-oriented. Short paragraphs. Numbers up front (monthly rent, term length, footprint).",
  warm: "Personal and human. Acknowledges that an unsolicited letter is unusual. Polite, low-pressure invitation to a phone call.",
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const {
      owner_name, parcel_address, parcel_size_acres, zoning_classification,
      sender_company, sender_phone, sender_email,
      tonality = "professional",
      extra_context = "",
    } = await req.json();

    const toneInstruction = TONE_GUIDE[tonality] || TONE_GUIDE.professional;

    const prompt = `Draft the BODY of a one-page direct-mail letter from a wireless-infrastructure site acquisition agent to a property owner about leasing a small portion of their land for a cell tower. Return ONLY the letter body — no salutation ("Dear ..."), no signature, no header, no "Sincerely". Just 3–5 short paragraphs of body copy.

TONALITY: ${tonality.toUpperCase()} — ${toneInstruction}

CONTEXT TO WEAVE IN NATURALLY (do not list robotically):
- Property owner: ${owner_name || "the recipient"}
- Parcel: ${parcel_address || "their property"}
${parcel_size_acres ? `- Parcel size: ${parcel_size_acres} acres` : ""}
${zoning_classification ? `- Current zoning: ${zoning_classification}` : ""}
- Sender company: ${sender_company || "our firm"}
${sender_phone ? `- Sender phone: ${sender_phone}` : ""}
${sender_email ? `- Sender email: ${sender_email}` : ""}
${extra_context ? `- Extra context from sender: ${extra_context}` : ""}

KEY FACTS THAT MUST APPEAR SOMEWHERE IN THE BODY (phrase them in the chosen tone):
- A small ground-lease footprint (~50' x 50') is needed
- Typical lease rent is $1,500–$3,500/month
- Typical lease term is 25–30 years
- The landlord pays NOTHING — sender handles permitting, build, and maintenance
- A clear invitation to a phone call using the sender's phone/email above

CONSTRAINTS:
- 180–280 words total
- No markdown, no bullet points, no headings
- No "Dear ..." opening, no "Sincerely" closing — body only
- Plain prose, US English`;

    const out = await base44.integrations.Core.InvokeLLM({ prompt });
    const body = typeof out === "string" ? out.trim() : (out?.body || "").trim();

    if (!body) {
      return Response.json({ error: "HawkBot returned an empty draft. Please try again." }, { status: 502 });
    }
    return Response.json({ body, tonality });
  } catch (error) {
    console.error("draftHawkBotLetter error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});