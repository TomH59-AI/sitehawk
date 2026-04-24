import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ENFORMION_AP_NAME = Deno.env.get("ENFORMION_AP_NAME");
const ENFORMION_AP_PASSWORD = Deno.env.get("ENFORMION_AP_PASSWORD");
const ENFORMION_URL = "https://apis.enformion.com/api/v1/person/search";

// Rate limiting: max 10 skip traces per minute per user
const rateLimitMap = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = 10;

function isRateLimited(userId) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= MAX_REQUESTS_PER_MINUTE) return true;
  entry.count++;
  rateLimitMap.set(userId, entry);
  return false;
}

function parseName(fullName) {
  if (!fullName) return { firstName: "", lastName: "" };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return {
    firstName: parts.slice(0, parts.length - 1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function parseAddress(address) {
  if (!address) return {};
  const parts = address.split(",").map(s => s.trim());
  const addressLine1 = parts[0] || "";
  const city = parts[1] || "";
  const stateZip = (parts[2] || "").trim().split(/\s+/);
  const state = stateZip[0] || "";
  const zip = stateZip[1] || "";
  return { addressLine1, city, state, zip };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tier = user.tier || 'blind';
    const isFreeTrialSkip = (tier === 'blind' || tier === 'free') && user.free_trial_used && !user.free_trial_skip_trace_used;

    if ((tier === 'blind' || tier === 'free') && !isFreeTrialSkip) {
      return Response.json({ error: 'Upgrade required' }, { status: 403 });
    }

    // Consume the free trial skip trace slot
    if (isFreeTrialSkip) {
      console.log(`Free trial skip trace: user=${user.email}`);
      const users = await base44.asServiceRole.entities.User.filter({ email: user.email });
      if (users.length) {
        await base44.asServiceRole.entities.User.update(users[0].id, { free_trial_skip_trace_used: true });
      }
    }

    if (isRateLimited(user.id)) {
      console.warn(`Skip trace rate limit hit for user: ${user.email}`);
      return Response.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    const body = await req.json();
    const { owner_name, mailing_address, candidate_id, search_id } = body;

    console.log(`Skip trace request: user=${user.email} owner=${owner_name}`);

    const { firstName, lastName } = parseName(owner_name);
    const { addressLine1, city, state, zip } = parseAddress(mailing_address);

    const payload = {
      FirstName: firstName,
      LastName: lastName,
      Addresses: [{ AddressLine1: addressLine1, City: city, State: state, Zip: zip }],
      Page: 1,
      ResultsPerPage: 1,
    };

    console.log(`Enformion request: ${firstName} ${lastName}, ${city}, ${state}`);

    const res = await fetch(ENFORMION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "galaxy-ap-name": ENFORMION_AP_NAME,
        "galaxy-ap-password": ENFORMION_AP_PASSWORD,
        "galaxy-search-type": "Person",
      },
      body: JSON.stringify(payload),
    });

    const raw = await res.json();
    console.log(`Enformion response status: ${res.status}`);

    if (!res.ok) {
      console.error("Enformion error:", JSON.stringify(raw));
      return Response.json({ phone: null, email: null });
    }

    // Extract first record
    const records = raw?.Records?.Record || raw?.records || [];
    const record = Array.isArray(records) ? records[0] : records;

    let phone = null;
    let email = null;

    if (record) {
      // Phones
      const phones = record?.PhoneNumbers?.PhoneNumber || record?.Phones?.Phone || [];
      const phoneList = Array.isArray(phones) ? phones : [phones];
      const bestPhone = phoneList.find(p => p?.Number10 || p?.Number || p?.number);
      phone = bestPhone?.Number10 || bestPhone?.Number || bestPhone?.number || null;

      // Emails
      const emails = record?.EmailAddresses?.EmailAddress || record?.Emails?.Email || [];
      const emailList = Array.isArray(emails) ? emails : [emails];
      const bestEmail = emailList.find(e => e?.Email || e?.Address || e?.address);
      email = bestEmail?.Email || bestEmail?.Address || bestEmail?.address || null;
    }

    console.log(`Skip trace result: phone=${phone ? "found" : "none"} email=${email ? "found" : "none"}`);

    return Response.json({ phone, email });

  } catch (error) {
    console.error('skipTrace error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});