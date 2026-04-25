// Proxy that fetches a Twilio recording with auth and streams it back.
// Twilio recording URLs require Basic Auth — we can't link to them directly from the browser.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { recording_url } = await req.json();
    if (!recording_url) return Response.json({ error: 'recording_url required' }, { status: 400 });

    const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const token = Deno.env.get("TWILIO_AUTH_TOKEN");
    const auth = btoa(`${sid}:${token}`);

    const res = await fetch(recording_url, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!res.ok) {
      console.error("Twilio recording fetch failed:", res.status);
      return Response.json({ error: 'Failed to fetch recording' }, { status: 502 });
    }

    const audio = await res.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("getTwilioRecording error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});