import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Rate limiting: max 20 chat messages per minute per user
const rateLimitMap = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = 20;

function isRateLimited(userId) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId) || { count: 0, windowStart: now };

  if (now - entry.windowStart > RATE_WINDOW_MS) {
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

    const tier = user.tier || 'blind';
    const isAdmin = user.role === 'admin';
    if (!isAdmin && (tier === 'blind' || tier === 'free')) {
      return Response.json({ error: 'Upgrade required' }, { status: 403 });
    }

    if (isRateLimited(user.id)) {
      console.warn(`Chat rate limit hit for user: ${user.email}`);
      return Response.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    const body = await req.json();
    const message = body?.message || "";
    const scipFormat = body?.context?.scip_format || "";

    if (!message.trim()) {
      return Response.json({ error: 'Empty message' }, { status: 400 });
    }

    // Answer with the latest Anthropic model via Base44's InvokeLLM.
    const prompt = `${scipFormat}\n\nUser question: ${message}`;
    const response = await base44.integrations.Core.InvokeLLM({
      prompt,
      model: "claude_opus_4_8",
    });

    return Response.json({ response });

  } catch (error) {
    console.error('siteChat error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});