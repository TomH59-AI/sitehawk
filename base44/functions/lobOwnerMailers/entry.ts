import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Send physical mail to a batch of parcel owners via Lob.
// Two phases:
//   action="quote"  → returns per-recipient + total cost preview (no send)
//   action="send"   → actually creates the Lob letters and returns send statuses

const LOB_BASE = "https://api.lob.com/v1";
const LETTER_COST_USD = 1.50; // standard 1-page letter — used for the confirmation preview

function lobHeaders(apiKey) {
  return {
    Authorization: `Basic ${btoa(apiKey + ":")}`,
    "Content-Type": "application/json",
  };
}

function parseMailingAddress(str) {
  if (!str) return null;
  // Try "street, city, ST zip"
  const parts = str.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const street = parts[0];
  const city = parts[1];
  const stateZip = (parts[2] || "").split(/\s+/);
  const state = stateZip[0] || "";
  const zip = stateZip[1] || "";
  return { street, city, state, zip };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { action, recipients, from_name, message_body, search_id } = await req.json();
    if (!Array.isArray(recipients) || !recipients.length) {
      return Response.json({ error: "recipients array is required" }, { status: 400 });
    }

    const apiKey = Deno.env.get("LOB_API_KEY");
    if (!apiKey) return Response.json({ error: "LOB_API_KEY not set" }, { status: 500 });

    // ---- QUOTE phase: validate addresses + return cost preview ----
    if (action === "quote") {
      const validated = recipients.map((r) => {
        const parsed = parseMailingAddress(r.mailing_address);
        return {
          owner_name: r.owner_name,
          mailing_address: r.mailing_address,
          parsed,
          valid: !!(parsed && parsed.street && parsed.city && parsed.state),
          cost_usd: LETTER_COST_USD,
        };
      });
      const validCount = validated.filter((v) => v.valid).length;
      return Response.json({
        recipients: validated,
        valid_count: validCount,
        total_cost_usd: validCount * LETTER_COST_USD,
        unit_cost_usd: LETTER_COST_USD,
      });
    }

    // ---- SEND phase: actually create letters via Lob ----
    if (action === "send") {
      const fromName = from_name || user.full_name || "SiteHawk Land Acquisition";
      const body = message_body || "We are evaluating properties in your area for a wireless infrastructure project. If you would like to discuss a possible long-term lease opportunity, please contact us at your convenience.";

      const results = [];
      for (const r of recipients) {
        const parsed = parseMailingAddress(r.mailing_address);
        if (!parsed || !parsed.street || !parsed.city || !parsed.state) {
          results.push({ owner_name: r.owner_name, status: "skipped", reason: "Invalid address" });
          continue;
        }
        try {
          const lobRes = await fetch(`${LOB_BASE}/letters`, {
            method: "POST",
            headers: lobHeaders(apiKey),
            body: JSON.stringify({
              description: `SiteHawk owner outreach — ${search_id || "ad-hoc"}`,
              to: {
                name: r.owner_name || "Property Owner",
                address_line1: parsed.street,
                address_city: parsed.city,
                address_state: parsed.state,
                address_zip: parsed.zip || "",
                address_country: "US",
              },
              from: {
                name: fromName,
                address_line1: "PO Box 100",
                address_city: "Tampa",
                address_state: "FL",
                address_zip: "33601",
                address_country: "US",
              },
              file: `<html><body style="font-family:sans-serif;padding:1in;"><p>Dear ${r.owner_name || "Property Owner"},</p><p>${body}</p><p>Sincerely,<br/>${fromName}</p></body></html>`,
              color: false,
            }),
          });
          const lobData = await lobRes.json();
          if (!lobRes.ok) {
            results.push({ owner_name: r.owner_name, status: "failed", reason: lobData.error?.message || `HTTP ${lobRes.status}` });
          } else {
            results.push({ owner_name: r.owner_name, status: "sent", lob_id: lobData.id, expected_delivery: lobData.expected_delivery_date });
          }
        } catch (e) {
          results.push({ owner_name: r.owner_name, status: "failed", reason: e.message });
        }
      }

      const sent = results.filter((r) => r.status === "sent").length;
      return Response.json({ sent, total: recipients.length, results });
    }

    return Response.json({ error: "action must be 'quote' or 'send'" }, { status: 400 });
  } catch (error) {
    console.error("lobOwnerMailers error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});