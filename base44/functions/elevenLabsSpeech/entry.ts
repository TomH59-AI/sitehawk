import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ElevenLabs text-to-speech — returns MP3 audio as base64 for easy playback
// in the frontend (new Audio("data:audio/mpeg;base64,...")).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { text, voice_id = 'JBFqnCBsd6RMkjVDRZzb' } = await req.json();
    if (!text || !String(text).trim()) {
      return Response.json({ error: 'text is required' }, { status: 400 });
    }

    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'xi-api-key': Deno.env.get('ELEVENLABS_API_KEY'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: String(text),
        model_id: 'eleven_multilingual_v2',
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error('ElevenLabs error:', resp.status, detail);
      return Response.json({ error: `ElevenLabs ${resp.status}: ${detail}` }, { status: resp.status });
    }

    const bytes = new Uint8Array(await resp.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return Response.json({
      audio_base64: btoa(binary),
      content_type: 'audio/mpeg',
      characters: String(text).length,
    });
  } catch (error) {
    console.error('elevenLabsSpeech error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});