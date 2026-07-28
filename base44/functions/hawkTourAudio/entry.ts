import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Hawk Voice Guide — returns a cached narration MP3 URL for a tour stop,
// generating it via ElevenLabs only the first time (or when the script text
// changes). All users share the cache, so credits are spent once per clip.

function hashText(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Public route — no auth required. Audio clips are globally cached and shared,
    // so anonymous viewers can replay them without costing extra ElevenLabs credits.
    const user = await base44.auth.me().catch(() => null);
    // (user is informational only; tour audio is not user-scoped)

    const { page_key, text, voice_id = 'nPczCjzI2devNBz1zQrb' } = await req.json();
    if (!page_key || !text || !String(text).trim()) {
      return Response.json({ error: 'page_key and text are required' }, { status: 400 });
    }

    const textHash = hashText(String(text));
    const cached = await base44.asServiceRole.entities.TourAudioClip.filter({
      page_key, text_hash: textHash, voice_id,
    });
    if (cached.length) {
      return Response.json({ audio_url: cached[0].audio_url, cached: true });
    }

    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'xi-api-key': Deno.env.get('ELEVENLABS_API_KEY'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: String(text), model_id: 'eleven_multilingual_v2' }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      console.error('ElevenLabs error:', resp.status, detail);
      return Response.json({ error: `ElevenLabs ${resp.status}: ${detail}` }, { status: 502 });
    }

    const bytes = new Uint8Array(await resp.arrayBuffer());
    const safeName = page_key.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'tour';
    const file = new File([bytes], `hawk_tour_${safeName}_${textHash}.mp3`, { type: 'audio/mpeg' });
    const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file });

    await base44.asServiceRole.entities.TourAudioClip.create({
      page_key, text_hash: textHash, voice_id, audio_url: file_url, characters: String(text).length,
    });

    return Response.json({ audio_url: file_url, cached: false });
  } catch (error) {
    console.error('hawkTourAudio error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});