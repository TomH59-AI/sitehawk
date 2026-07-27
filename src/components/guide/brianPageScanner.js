import { base44 } from "@/api/base44Client";

// Brian's auto-learn scanner: extracts the current page's visible UI content
// and upserts it into BrianPageKnowledge (admin visits only). Brian then reads
// the stored snapshot at question time, so feature-page updates teach him
// automatically — no manual retraining.

const MAX_CONTENT = 4000;

function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return String(h);
}

function visible(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function collect(root, selector, max) {
  const seen = new Set();
  const out = [];
  for (const el of root.querySelectorAll(selector)) {
    if (!visible(el)) continue;
    const t = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ");
    if (t.length < 2 || t.length > 200 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export function extractPageContent() {
  const root = document.querySelector("main") || document.body;
  const headings = collect(root, "h1, h2, h3", 25);
  const buttons = collect(root, "button, a[role='button'], [role='tab']", 40);
  const labels = collect(root, "label, th", 40);
  const text = collect(root, "p, li", 40);

  const sections = [
    headings.length && `HEADINGS: ${headings.join(" | ")}`,
    buttons.length && `BUTTONS & TABS: ${buttons.join(" | ")}`,
    labels.length && `FIELDS & COLUMNS: ${labels.join(" | ")}`,
    text.length && `PAGE TEXT: ${text.join(" | ")}`,
  ].filter(Boolean);

  return {
    title: headings[0] || document.title || "",
    content: sections.join("\n").slice(0, MAX_CONTENT),
  };
}

let cachedIsAdmin = null;
async function isAdmin() {
  if (cachedIsAdmin === null) {
    try {
      const me = await base44.auth.me();
      cachedIsAdmin = me?.role === "admin";
    } catch {
      cachedIsAdmin = false;
    }
  }
  return cachedIsAdmin;
}

// Scan the current page and push to the knowledge base if content changed.
// Silent no-op for non-admins or on any failure.
export async function scanAndPushPage(pathname) {
  try {
    if (!pathname || pathname === "/") return;
    if (!(await isAdmin())) return;

    const { title, content } = extractPageContent();
    if (!content || content.length < 80) return; // page not rendered yet / too thin

    const hash = hashStr(content);
    const existing = await base44.entities.BrianPageKnowledge.filter({ page_key: pathname }, "-scanned_at", 1);
    const record = existing?.[0];
    if (record?.content_hash === hash) return; // nothing new to learn

    const data = {
      page_key: pathname,
      page_title: title,
      content,
      content_hash: hash,
      scanned_at: new Date().toISOString(),
    };
    if (record) await base44.entities.BrianPageKnowledge.update(record.id, data);
    else await base44.entities.BrianPageKnowledge.create(data);
  } catch {
    // never interrupt the app for a background learn
  }
}

// Fetch Brian's learned snapshot for a page (any user can read).
export async function getPageKnowledge(pathname) {
  try {
    const rows = await base44.entities.BrianPageKnowledge.filter({ page_key: pathname }, "-scanned_at", 1);
    const r = rows?.[0];
    if (!r?.content) return "";
    return `LIVE PAGE SNAPSHOT (auto-scanned ${String(r.scanned_at || "").slice(0, 10)} — this is the page's ACTUAL current UI; trust it over older descriptions):\n${r.content}`;
  } catch {
    return "";
  }
}