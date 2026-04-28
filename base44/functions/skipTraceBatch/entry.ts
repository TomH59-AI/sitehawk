import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ENDATO_URL = "https://devapi.endato.com/PersonSearch";
const AP_NAME = Deno.env.get("ENFORMION_AP_NAME");
const AP_PASSWORD = Deno.env.get("ENFORMION_AP_PASSWORD");

// Rate limiting: max 10 skip traces per minute per user
const rateLimitMap = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = 10;

function checkRateLimit(userId, count = 1) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(userId, { count, windowStart: now });
    return false;
  }
  if (entry.count + count > MAX_REQUESTS_PER_MINUTE) return true;
  entry.count += count;
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

// Direct call to Endato (Enformion) PersonSearch API
async function runSingleTrace(owner_name, mailing_address) {
  const { firstName, lastName } = parseName(owner_name);
  const { addressLine1, city, state, zip } = parseAddress(mailing_address);

  const payload = {
    FirstName: firstName,
    LastName: lastName,
    Addresses: [{ AddressLine1: addressLine1, City: city, State: state, Zip: zip }],
    Page: 1,
    ResultsPerPage: 1,
  };

  const res = await fetch(ENDATO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "galaxy-ap-name": AP_NAME,
      "galaxy-ap-password": AP_PASSWORD,
      "galaxy-search-type": "Person",
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.json();
  if (!res.ok) {
    console.error(`Endato error ${res.status}:`, JSON.stringify(raw).slice(0, 300));
    return { phones: [], emails: [], error: raw?.error || `HTTP ${res.status}` };
  }

  const records = raw?.persons || raw?.Records?.Record || raw?.records || [];
  const record = Array.isArray(records) ? records[0] : records;

  const phones = [];
  const emails = [];

  if (record) {
    const phoneRaw = record?.phoneNumbers || record?.PhoneNumbers?.PhoneNumber || record?.Phones?.Phone || [];
    const phoneList = Array.isArray(phoneRaw) ? phoneRaw : [phoneRaw];
    for (const p of phoneList) {
      const number = p?.phoneNumber || p?.Number10 || p?.Number || p?.number;
      if (number && !phones.find(x => x.number === number)) {
        phones.push({
          number,
          type: (p?.phoneType || p?.Type || "primary").toLowerCase(),
          confidence: "high",
        });
      }
    }

    const emailRaw = record?.emails || record?.EmailAddresses?.EmailAddress || record?.Emails?.Email || [];
    const emailList = Array.isArray(emailRaw) ? emailRaw : [emailRaw];
    for (const e of emailList) {
      const address = e?.emailAddress || e?.Email || e?.Address || e?.address;
      if (address && !emails.find(x => x.address === address)) {
        emails.push({ address, type: "primary", confidence: "high" });
      }
    }
  }

  return { phones, emails };
}

function buildResult({ phones, emails }) {
  const status = phones.length > 0 || emails.length > 0
    ? (phones.length > 0 && emails.length > 0 ? "found" : "partial")
    : "not_found";
  return {
    phones,
    emails,
    associated_llcs: [],
    status,
    phone: phones[0]?.number || null,
    email: emails[0]?.address || null,
  };
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

    if (!AP_NAME || !AP_PASSWORD) {
      console.error("ENFORMION_AP_NAME / ENFORMION_AP_PASSWORD not set");
      return Response.json({ error: 'Skip trace API not configured' }, { status: 500 });
    }

    const body = await req.json();
    const { mode, owner_name, mailing_address, candidate_id, search_id, candidates } = body;

    // ── SINGLE MODE ──────────────────────────────────────────
    if (mode !== 'batch') {
      if (checkRateLimit(user.id, 1)) {
        return Response.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
      }

      console.log(`Skip trace single: user=${user.email} owner=${owner_name}`);

      const traced = await runSingleTrace(owner_name, mailing_address);
      const normalized = buildResult(traced);

      // Consume free trial slot
      if (isFreeTrialSkip) {
        const users = await base44.asServiceRole.entities.User.filter({ email: user.email });
        if (users.length) {
          await base44.asServiceRole.entities.User.update(users[0].id, { free_trial_skip_trace_used: true });
        }
      }

      // Persist to SkipTraceLog
      if (candidate_id) {
        const existing = await base44.asServiceRole.entities.SkipTraceLog.filter({ candidate_id });
        const attempt_number = (existing?.length || 0) + 1;
        await base44.asServiceRole.entities.SkipTraceLog.create({
          candidate_id,
          search_id,
          owner_name,
          mailing_address,
          phones: normalized.phones,
          emails: normalized.emails,
          associated_llcs: [],
          raw_result: JSON.stringify(traced),
          status: normalized.status,
          attempt_number,
        });
      }

      return Response.json(normalized);
    }

    // ── BATCH MODE ────────────────────────────────────────────
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return Response.json({ error: 'candidates array is required for batch mode' }, { status: 400 });
    }

    const batchSize = Math.min(candidates.length, 10);
    if (checkRateLimit(user.id, batchSize)) {
      return Response.json({ error: 'Rate limit would be exceeded. Reduce batch size or wait.' }, { status: 429 });
    }

    console.log(`Skip trace batch: user=${user.email} count=${batchSize}`);

    const results = await Promise.allSettled(
      candidates.slice(0, batchSize).map(async (c) => {
        const traced = await runSingleTrace(c.owner_name, c.owner_mailing_address);
        const normalized = buildResult(traced);

        if (c.id) {
          const existing = await base44.asServiceRole.entities.SkipTraceLog.filter({ candidate_id: c.id });
          const attempt_number = (existing?.length || 0) + 1;
          await base44.asServiceRole.entities.SkipTraceLog.create({
            candidate_id: c.id,
            search_id: c.search_id,
            owner_name: c.owner_name,
            mailing_address: c.owner_mailing_address,
            phones: normalized.phones,
            emails: normalized.emails,
            associated_llcs: [],
            raw_result: JSON.stringify(traced),
            status: normalized.status,
            attempt_number,
          });
        }

        return { candidate_id: c.id, owner_name: c.owner_name, ...normalized };
      })
    );

    const output = results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { candidate_id: candidates[i]?.id, owner_name: candidates[i]?.owner_name, status: 'error', error: r.reason?.message }
    );

    return Response.json({ results: output });

  } catch (error) {
    console.error('skipTraceBatch error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});