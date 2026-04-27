// Twilio Voice webhook — plays welcome message, records callback voicemail.
// Configure this URL in Twilio Console: Phone Numbers → Active → Voice & Fax → "A Call Comes In" → Webhook (HTTP POST)

const WELCOME_MESSAGE = "Thank you for calling SiteHawk, the AI-powered site acquisition platform by SkyWave. We're sorry we missed your call. Please leave your name, your callback number, and a brief message after the tone, and a member of our team will return your call within 24 hours. Thank you.";

Deno.serve(async (req) => {
  try {
    // Recording webhook URL must be set as a secret (each Base44 function has its own URL)
    const recordingActionUrl = Deno.env.get("TWILIO_RECORDING_WEBHOOK_URL");
    if (!recordingActionUrl) {
      console.error("TWILIO_RECORDING_WEBHOOK_URL secret is not set");
      const fallback = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>This phone line is not yet configured. Please email info@site-hawk-pro.com.</Say><Hangup/></Response>`;
      return new Response(fallback, { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${WELCOME_MESSAGE}</Say>
  <Record
    action="${recordingActionUrl}"
    method="POST"
    maxLength="180"
    playBeep="true"
    transcribe="true"
    transcribeCallback="${recordingActionUrl}"
    finishOnKey="#"
    timeout="5"
  />
  <Say voice="Polly.Joanna">We did not receive a recording. Goodbye.</Say>
  <Hangup/>
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("twilioVoiceWebhook error:", error.message);
    const fallback = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>We are experiencing technical difficulties. Please try again later.</Say><Hangup/></Response>`;
    return new Response(fallback, { status: 200, headers: { "Content-Type": "text/xml" } });
  }
});