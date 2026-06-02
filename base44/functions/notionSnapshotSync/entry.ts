/**
 * notionSnapshotSync — OPTIONAL human-readable Notion mirror for one
 * DataSourceSnapshot. Base44/DataSourceSnapshot is the SOURCE OF TRUTH; Notion
 * is only a review/audit layer.
 *
 * NEVER mirrored to Notion: secrets, API keys, payment data, or raw_response.
 * Only safe summary fields + key normalized values go to Notion.
 *
 * Non-blocking by contract: on ANY failure it marks the snapshot
 * notion_sync_status='failed' (+ reason) and returns 200 with synced:false.
 * The snapshot itself is never altered/deleted.
 *
 * Payload: { snapshot_id, scip_link?, parent_page_id? }
 *
 * Notion target: a database row. Provide the database id via NOTION_SNAPSHOT_DB_ID
 * env, OR this function will create the database once under parent_page_id
 * (or NOTION_MASTER_ZONING_PAGE_ID) and you can save that id as the env var.
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function normId(raw) {
  const clean = (raw || "").trim().replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  if (clean.length !== 32) return null;
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}
const rt = (t) => [{ type: "text", text: { content: String(t ?? "").slice(0, 1900) } }];
const TARGET_LABELS = ["Target A", "Target B", "Target C"];

// Build a short, sanitized human summary from normalized_result. Keep it tiny
// and free of any sensitive payloads.
function summarize(snap) {
  const n = snap.normalized_result || {};
  const bits = [];
  const push = (k, v) => { if (v !== undefined && v !== null && String(v).trim() !== "") bits.push(`${k}: ${v}`); };
  switch (snap.section_key) {
    case "parcel_owner":
      push("Owner", n.owner_name); push("APN", n.apn); push("Acreage", n.acreage); push("Zoning", n.zoning_classification);
      break;
    case "zoning":
      push("Jurisdiction", n.jurisdiction || n.zoning_jurisdiction); push("Zone", n.zone_code || n.zoning_classification);
      break;
    case "fiber":
      push("Operator", n.nearest_operator || n.fiber_operator); push("Nearest (mi)", n.nearest_distance_miles ?? n.fiber_distance_miles); push("Has fiber", n.has_fiber);
      break;
    case "electric_power":
      push("Utility", n.serving_utility || n.utility_name || n.power_utility); push("Transmission (mi)", n.nearest_transmission_distance_miles);
      break;
    case "airport":
      push("Airport", n.airport_name); push("Distance (mi)", n.distance_miles ?? n.crow_miles);
      break;
    case "cell_tower":
      push("Nearest tower (mi)", n.distance_miles ?? n.nearest_distance_miles); push("Operator", n.operator);
      break;
    case "coverage_viewshed":
      push("Max range (km)", n.max_range_km); push("Area (sq km)", n.area_covered_sq_km);
      break;
    case "rf_analysis":
      push("Verdict", n.verdict);
      break;
    case "utility_infrastructure":
      push("Fiber pts", n.fiber_count); push("Power features", n.power_count);
      break;
    case "postcard_address_verification":
      push("Deliverable", n.address_verified); push("Note", n.verification_note);
      break;
    case "scorecard":
      push("Overall", n.overall); push("Recommendation", n.recommendation);
      break;
    default:
      break;
  }
  return bits.slice(0, 8).join("  •  ") || "(no key values)";
}

const PROPS_SCHEMA = {
  Name: { title: {} },
  "Snapshot ID": { rich_text: {} },
  "SCIP Record": { rich_text: {} },
  Target: { rich_text: {} },
  Section: { select: {} },
  Source: { rich_text: {} },
  Provider: { rich_text: {} },
  "Stale Status": {
    select: { options: [
      { name: "fresh", color: "green" }, { name: "aging", color: "yellow" },
      { name: "stale", color: "red" }, { name: "failed", color: "gray" },
    ] },
  },
  Confidence: { select: { options: [{ name: "high", color: "green" }, { name: "medium", color: "yellow" }, { name: "low", color: "orange" }] } },
  "Fetched At": { date: {} },
  "Expires At": { date: {} },
  Summary: { rich_text: {} },
  Link: { url: {} },
  "Source URL": { url: {} },
};

async function notionFetch(token, path, method, body) {
  const r = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message || `Notion HTTP ${r.status}`);
  return data;
}

async function ensureDatabase(token, parentPageId) {
  const envDb = normId(Deno.env.get("NOTION_SNAPSHOT_DB_ID"));
  if (envDb) return envDb;
  const parent = normId(parentPageId) || normId(Deno.env.get("NOTION_MASTER_ZONING_PAGE_ID"));
  if (!parent) throw new Error("No NOTION_SNAPSHOT_DB_ID and no parent page id to create the audit database");
  const db = await notionFetch(token, "/databases", "POST", {
    parent: { type: "page_id", page_id: parent },
    title: rt("SiteHawk — SCIP Data Source Snapshots"),
    properties: PROPS_SCHEMA,
  });
  return db.id;
}

function buildProperties(snap, scipLink) {
  const target = TARGET_LABELS[snap.target_index || 0] || `Target ${(snap.target_index || 0) + 1}`;
  const safeUrl = (u) => (u && /^https?:\/\//i.test(u) ? u : null);
  return {
    Name: { title: rt(`${snap.section_key} — ${target} — ${snap.scip_record_id?.slice(0, 8)}`) },
    "Snapshot ID": { rich_text: rt(snap.id) },
    "SCIP Record": { rich_text: rt(snap.scip_record_id) },
    Target: { rich_text: rt(`${target} (#${snap.target_index || 0})`) },
    Section: { select: { name: snap.section_key } },
    Source: { rich_text: rt(snap.source_name || "") },
    Provider: { rich_text: rt(snap.provider || "") },
    "Stale Status": snap.stale_status ? { select: { name: snap.stale_status } } : { select: null },
    Confidence: snap.confidence ? { select: { name: snap.confidence } } : { select: null },
    "Fetched At": snap.fetched_at ? { date: { start: snap.fetched_at } } : { date: null },
    "Expires At": snap.expires_at ? { date: { start: snap.expires_at } } : { date: null },
    Summary: { rich_text: rt(summarize(snap)) },
    Link: { url: safeUrl(scipLink) },
    "Source URL": { url: safeUrl(snap.source_url) },
  };
}

Deno.serve(async (req) => {
  let base44, snapshotId;
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    snapshotId = body.snapshot_id;
    if (!snapshotId) return Response.json({ error: "snapshot_id is required" }, { status: 400 });

    const snap = await base44.asServiceRole.entities.DataSourceSnapshot.get(snapshotId);
    if (!snap) return Response.json({ error: "Snapshot not found" }, { status: 404 });

    // Notion connector token (review mirror only).
    const conn = await base44.asServiceRole.connectors.getConnection("notion").catch(() => null);
    const token = conn?.accessToken;
    if (!token) throw new Error("Notion not connected");

    const dbId = await ensureDatabase(token, body.parent_page_id);
    const properties = buildProperties(snap, body.scip_link);

    let pageId = snap.notion_page_id;
    if (pageId) {
      // Update the existing mirror row.
      await notionFetch(token, `/pages/${pageId}`, "PATCH", { properties });
    } else {
      const page = await notionFetch(token, "/pages", "POST", { parent: { database_id: dbId }, properties });
      pageId = page.id;
    }

    await base44.asServiceRole.entities.DataSourceSnapshot.update(snapshotId, {
      notion_sync_status: "synced",
      notion_page_id: pageId,
      notion_synced_at: new Date().toISOString(),
      notion_sync_error: "",
    });

    return Response.json({ synced: true, notion_page_id: pageId, notion_database_id: dbId });
  } catch (error) {
    // Non-blocking: mark the snapshot failed, keep it intact, return 200.
    console.error("notionSnapshotSync error:", error.message);
    try {
      if (base44 && snapshotId) {
        await base44.asServiceRole.entities.DataSourceSnapshot.update(snapshotId, {
          notion_sync_status: "failed",
          notion_sync_error: String(error.message).slice(0, 300),
        });
      }
    } catch (_) { /* never throw from the failure path */ }
    return Response.json({ synced: false, error: error.message });
  }
});