// notionPushTarget — push a single Hawk Vision target's site feasibility
// report into the Notion Master Zoning workspace as a new child page.
//
// The user's NOTION_MASTER_ZONING_PAGE_ID is a Notion *page* that holds the
// jurisdiction sub-pages, so we create a child page beneath it titled with
// the target site name and write the feasibility report as content blocks.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const NOTION_VERSION = "2022-06-28";

function normalizeNotionId(raw) {
  const clean = (raw || "").trim().replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  if (clean.length !== 32) return null;
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}

// Helpers to build Notion block / rich-text payloads safely.
function rt(text) {
  return [{ type: "text", text: { content: String(text ?? "").slice(0, 1900) } }];
}
function heading(level, text) {
  return { object: "block", type: `heading_${level}`, [`heading_${level}`]: { rich_text: rt(text) } };
}
function paragraph(text) {
  return { object: "block", type: "paragraph", paragraph: { rich_text: rt(text) } };
}
function bullet(text) {
  return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rt(text) } };
}
function kv(label, value) {
  const v = value == null || value === "" ? "—" : String(value);
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [
        { type: "text", text: { content: `${label}: ` }, annotations: { bold: true } },
        { type: "text", text: { content: v.slice(0, 1900) } },
      ],
    },
  };
}

function buildBlocks(target, meta) {
  const blocks = [];

  blocks.push(paragraph(`Site feasibility snapshot pushed from SiteHawk on ${new Date().toUTCString()}.`));

  blocks.push(heading(2, "Owner & Parcel"));
  blocks.push(kv("Owner's Name", target.owner_name));
  blocks.push(kv("Parcel Address", target.parcel_address));
  blocks.push(kv("Parcel ID", target.parcel_id));
  blocks.push(kv("Parcel Size (acres)", target.acreage));
  blocks.push(kv("Owner's Mailing Address", target.mailing_address || target.parcel_address));
  blocks.push(kv("Phone", target.phone));
  blocks.push(kv("Email", target.email));

  blocks.push(heading(2, "Location"));
  blocks.push(kv("Latitude", target.latitude));
  blocks.push(kv("Longitude", target.longitude));
  if (target.latitude != null && target.longitude != null) {
    blocks.push(kv("Google Maps", `https://www.google.com/maps?q=${target.latitude},${target.longitude}`));
  }

  blocks.push(heading(2, "Zoning & Jurisdiction"));
  blocks.push(kv("Zoning Classification", target.zoning || target.zoning_classification));
  blocks.push(kv("Zoning Jurisdiction", target.zoning_jurisdiction));
  blocks.push(kv("Zoning Process", target.zoning_process));
  blocks.push(kv("Zoning Fees", target.zoning_fees));
  blocks.push(kv("Zoning Contact", target.zoning_contact));

  blocks.push(heading(2, "Site Feasibility Indicators"));
  blocks.push(kv("Match Score", target.score ?? target.match_score));
  blocks.push(kv("FEMA Flood Zone", target.fema_risk_factor));
  blocks.push(kv("FEMA Risk Level", target.fema_risk_level));
  blocks.push(kv("ASCE 7-22 Wind Speed (mph)", target.wind_speed_mph));
  blocks.push(kv("Wind Risk Level", target.wind_risk_level));
  blocks.push(kv("Ground Elevation (ft AMSL)", target.ground_elevation_ft));
  blocks.push(kv("Wetlands Present", target.wetlands_present));
  blocks.push(kv("Nearest Airport", target.airport_name ? `${target.airport_name} (${target.airport_distance_miles} mi)` : null));

  blocks.push(heading(2, "Infrastructure"));
  blocks.push(kv("Power Utility", target.power_utility));
  blocks.push(kv("Transmission Line Distance (mi)", target.transmission_line_distance_miles));
  blocks.push(kv("Fiber Available (FCC)", target.has_fiber));
  blocks.push(kv("Fiber Distance (mi)", target.fiber_distance_miles));
  blocks.push(kv("Fiber Operator", target.fiber_operator));

  if (meta?.search_center?.lat != null) {
    blocks.push(heading(2, "Source Search"));
    blocks.push(kv("Search Center", `${meta.search_center.lat}, ${meta.search_center.lon}`));
    if (meta.pushed_by) blocks.push(kv("Pushed By", meta.pushed_by));
  }

  // Notion caps block-children to 100 per create call — buildBlocks stays well under that.
  return blocks.slice(0, 95);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { target, search_center } = await req.json();
    if (!target) return Response.json({ error: "target is required" }, { status: 400 });

    const notionToken = Deno.env.get("NOTION_API_TOKEN");
    const parentRaw = Deno.env.get("NOTION_MASTER_ZONING_PAGE_ID");
    if (!notionToken || !parentRaw) {
      return Response.json({ error: "NOTION_API_TOKEN or NOTION_MASTER_ZONING_PAGE_ID not configured" }, { status: 500 });
    }
    const parentId = normalizeNotionId(parentRaw);
    if (!parentId) {
      return Response.json({ error: `Invalid Notion page ID format: ${parentRaw.slice(0, 60)}` }, { status: 500 });
    }

    const title =
      target.site_name ||
      target.owner_name ||
      target.parcel_address ||
      `Target @ ${target.latitude},${target.longitude}`;

    const payload = {
      parent: { type: "page_id", page_id: parentId },
      properties: {
        title: { title: rt(`SiteHawk Feasibility — ${title}`) },
      },
      children: buildBlocks(target, { search_center, pushed_by: user.email }),
    };

    const r = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionToken.trim()}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json();
    if (!r.ok) {
      console.error("Notion create page failed:", r.status, JSON.stringify(data).slice(0, 500));
      return Response.json(
        { error: data?.message || `Notion HTTP ${r.status}`, code: data?.code },
        { status: 502 }
      );
    }

    return Response.json({
      success: true,
      notion_page_id: data.id,
      notion_url: data.url,
      title: `SiteHawk Feasibility — ${title}`,
    });
  } catch (error) {
    console.error("notionPushTarget error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});