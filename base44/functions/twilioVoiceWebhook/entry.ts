// Twilio Voice webhook — plays welcome message, records callback voicemail.
// Configure this URL in Twilio Console: Phone Numbers → Active → Voice & Fax → "A Call Comes In" → Webhook (HTTP POST)

const WELCOME_MESSAGE = "Thank you for calling SiteHawk, the AI-powered site acquisition platform by SkyWave. We're sorry we missed your call. Please leave your name, your callback number, and a brief message after the tone, and a member of our team will return your call within 24 hours. Thank you.";

Deno.serve(async (req) => {
  try {
    // Build absolute URL for the recording webhook (same origin, sibling function)
    const url = new URL(req.url);
    const recordingActionUrl = `${url.origin}${url.pathname.replace(/twilioVoiceWebhook$/, "twilioRecordingWebhook")}`;

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