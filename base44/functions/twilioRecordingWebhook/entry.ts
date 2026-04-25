// Twilio Recording + Transcription webhook handler.
// Twilio calls this twice: once when recording finishes, once when transcription is ready.
// We upsert by CallSid so both calls update the same Voicemail record.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function extractCallbackNumber(text) {
  if (!text) return null;
  // Look for any 10-11 digit US phone number pattern in the transcription
  const match = text.match(/(\+?1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/);
  if (!match) return null;
  return `+1${match[2]}${match[3]}${match[4]}`;
}

async function parseFormBody(req) {
  const text = await req.text();
  const params = new URLSearchParams(text);
  const obj = {};
  for (const [k, v] of params) obj[k] = v;
  return obj;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const data = await parseFormBody(req);

    console.log("Twilio recording webhook received:", JSON.stringify({
      CallSid: data.CallSid,
      From: data.From,
      RecordingSid: data.RecordingSid,
      hasTranscription: !!data.TranscriptionText,
    }));

    const callSid = data.CallSid;
    if (!callSid) {
      console.error("Missing CallSid");
      return new Response("OK", { status: 200 });
    }

    // Find existing record for this call
    const existing = await base44.asServiceRole.entities.Voicemail.filter({ call_sid: callSid });
    const record = existing[0];

    const isTranscriptionCallback = !!data.TranscriptionText || !!data.TranscriptionStatus;
    const followUpDue = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    if (isTranscriptionCallback) {
      // Transcription is ready — update the record
      const transcription = data.TranscriptionText || "";
      const callbackNum = extractCallbackNumber(transcription) || (record?.callback_number ?? null);

      if (record) {
        await base44.asServiceRole.entities.Voicemail.update(record.id, {
          transcription,
          callback_number: callbackNum,
        });
      } else {
        await base44.asServiceRole.entities.Voicemail.create({
          call_sid: callSid,
          from_number: data.From || "Unknown",
          from_city: data.FromCity || null,
          from_state: data.FromState || null,
          to_number: data.To || null,
          transcription,
          callback_number: callbackNum,
          status: "new",
          follow_up_due: followUpDue,
        });
      }
    } else {
      // Recording is ready — save URL + duration
      const recordingUrl = data.RecordingUrl ? `${data.RecordingUrl}.mp3` : null;
      const durationSec = data.RecordingDuration ? parseInt(data.RecordingDuration) : null;

      if (record) {
        await base44.asServiceRole.entities.Voicemail.update(record.id, {
          recording_url: recordingUrl,
          recording_sid: data.RecordingSid || null,
          recording_duration_sec: durationSec,
        });
      } else {
        await base44.asServiceRole.entities.Voicemail.create({
          call_sid: callSid,
          from_number: data.From || "Unknown",
          from_city: data.FromCity || null,
          from_state: data.FromState || null,
          to_number: data.To || null,
          recording_url: recordingUrl,
          recording_sid: data.RecordingSid || null,
          recording_duration_sec: durationSec,
          status: "new",
          follow_up_due: followUpDue,
        });
      }
    }

    // Twilio expects an empty TwiML or 200 OK
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("twilioRecordingWebhook error:", error.message, error.stack);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
});