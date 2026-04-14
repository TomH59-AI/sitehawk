import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPABASE_URL = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/sitehawk-scan";
const SUPABASE_KEY = Deno.env.get("SUPABASE_ANON_KEY");

// Rate limiting: track requests per user in memory (resets on cold start, good enough for burst protection)
const rateLimitMap = new Map();
const RATE_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_MINUTE = 5;

function isRateLimited(userId) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId) || { count: 0, windowStart: now };

  if (now - entry.windowStart > RATE_WINDOW_MS) {
    // Reset window
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return false;
  }

  if (entry.count >= MAX_REQUESTS_PER_MINUTE) {
    return true;
  }

  entry.count++;
  rateLimitMap.set(userId, entry);
  return false;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Block free/blind tier users
    const tier = user.tier || 'blind';
    if (tier === 'blind' || tier === 'free') {
      return Response.json({ error: 'Upgrade required' }, { status: 403 });
    }

    // Rate limit check
    if (isRateLimited(user.id)) {
      console.warn(`Rate limit hit for user: ${user.email}`);
      return Response.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    const body = await req.json();
    const { lat, lon, radius_miles, offset } = body;

    if (!lat || !lon) {
      return Response.json({ error: 'lat and lon are required' }, { status: 400 });
    }

    console.log(`Scan request: user=${user.email} tier=${tier} lat=${lat} lon=${lon} offset=${offset || 0}`);

    const res = await fetch(SUPABASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ lat, lon, radius_miles: radius_miles || 0.5, offset: offset || 0 }),
    });

    const data = await res.json();
    return Response.json(data);

  } catch (error) {
    console.error('siteSearch error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});