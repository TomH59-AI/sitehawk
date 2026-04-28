import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPABASE_URL = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/sitehawk-skip-trace";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

// Simple per-user rate limit: 10/minute
const rateLimitMap = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = 10;

function checkRateLimit(userId) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count + 1 > MAX_REQUESTS_PER_MINUTE) return true;
  entry.count += 1;
  rateLimitMap.set(userId, entry);
  return false;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const tier = user.tier || 'blind';
    const isFreeTrialSkip = (tier === 'blind' || tier === 'free') && user.free_trial_used && !user.free_trial_skip_trace_used;

    if ((tier === 'blind' || tier === 'free') && !isFreeTrialSkip) {
      return Response.json({ error: 'Upgrade required' }, { status: 403 });
    }

    if (!SUPABASE_ANON_KEY) {
      console.error("SUPABASE_ANON_KEY not set");
      return Response.json({ error: 'Skip trace not configured' }, { status: 500 });
    }

    if (checkRateLimit(user.id)) {
      return Response.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    const { owner_name, mailing_address, candidate_id, search_id } = await req.json();

    console.log(`Skip trace: user=${user.email} owner=${owner_name}`);

    const res = await fetch(SUPABASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ owner_name, mailing_address, candidate_id, search_id }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error(`Supabase skip-trace error ${res.status}:`, JSON.stringify(data).slice(0, 300));
      return Response.json({ error: data?.error || `HTTP ${res.status}` }, { status: res.status });
    }

    if (isFreeTrialSkip) {
      const users = await base44.asServiceRole.entities.User.filter({ email: user.email });
      if (users.length) {
        await base44.asServiceRole.entities.User.update(users[0].id, { free_trial_skip_trace_used: true });
      }
    }

    return Response.json(data);
  } catch (error) {
    console.error('skipTrace error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});