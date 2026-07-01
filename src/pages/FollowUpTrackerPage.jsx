/**
 * Follow-Up Tracker — Master site follow-up tracker.
 * Mirrors the Excel "Master Follow-Up Sites" sheet the subscriber uploaded.
 * Auto-populated from Target selection. Syncs to Google Sheets. Printable.
 */
import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { followUpTrackerSync } from "@/functions/followUpTrackerSync";
import { Button } from "@/components/ui/button";
import {
  FileSpreadsheet, Plus, Printer, RefreshCw, Trash2,
  ExternalLink, ChevronDown, Save, X, CheckCircle2, AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

const HEADER_GREEN = "#628C83";

const STATUS_OPTIONS = [
  "New Lead", "Mailer Sent", "Contacted", "Interested",
  "Not Interested", "LOI Issued", "LOI Executed", "Dead"
];

const STATUS_COLORS = {
  "New Lead":       "bg-sky-100 text-sky-800 border-sky-300",
  "Mailer Sent":    "bg-violet-100 text-violet-800 border-violet-300",
  "Contacted":      "bg-amber-100 text-amber-800 border-amber-300",
  "Interested":     "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Not Interested": "bg-red-100 text-red-700 border-red-300",
  "LOI Issued":     "bg-blue-100 text-blue-800 border-blue-300",
  "LOI Executed":   "bg-green-100 text-green-800 border-green-300",
  "Dead":           "bg-gray-100 text-gray-600 border-gray-300",
};

const COLS = [
  { key: "pm",                label: "PM",               width: 60,  type: "text" },
  { key: "site_name",         label: "Site Name",        width: 160, type: "text" },
  { key: "jurisdiction",      label: "Jurisdiction",     width: 160, type: "text" },
  { key: "search_ring_center",label: "Search Ring Ctr",  width: 140, type: "text" },
  { key: "contact_name",      label: "Contact Name",     width: 140, type: "text" },
  { key: "email",             label: "Email",            width: 160, type: "text" },
  { key: "phone",             label: "Phone",            width: 120, type: "text" },
  { key: "parcel_address",    label: "Parcel Address",   width: 180, type: "text" },
  { key: "mailers_sent",      label: "Mailers Sent",     width: 80,  type: "number" },
  { key: "last_mailer_date",  label: "Last Mailer",      width: 110, type: "date" },
  { key: "status",            label: "Status",           width: 130, type: "status" },
  { key: "notes",             label: "To-Do / Notes",    width: 240, type: "textarea" },
];

function emptyRow() {
  return {
    pm: "", site_name: "", jurisdiction: "", search_ring_center: "",
    contact_name: "", email: "", phone: "", parcel_address: "",
    mailing_address: "", apn: "", zoning: "", fema_zone: "",
    acreage: null, status: "New Lead", mailers_sent: 0,
    last_mailer_date: "", notes: "",
  };
}

export default function FollowUpTrackerPage() {
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState({});
  const [syncing, setSyncing]       = useState(false);
  const [sheetUrl, setSheetUrl]     = useState(null);
  const [sheetId, setSheetId]       = useState(null);
  const [clearConfirm, setClearConfirm] = useState(null); // rowId | "all"
  const [user, setUser]             = useState(null);
  const printRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    loadRows();
    loadSheetId();
  }, []);

  async function loadRows() {
    setLoading(true);
    try {
      const data = await base44.entities.FollowUpTracker.list("-created_date", 500);
      setRows(data);
    } catch (e) {
      toast.error("Could not load tracker: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSheetId() {
    try {
      const res = await followUpTrackerSync({ action: "getSheetId" });
      const id = res?.data?.spreadsheetId;
      if (id) { setSheetId(id); setSheetUrl(`https://docs.google.com/spreadsheets/d/${id}`); }
    } catch { /* not yet linked */ }
  }

  async function handleAddRow() {
    const rec = await base44.entities.FollowUpTracker.create({ ...emptyRow(), site_name: "New Site" });
    setRows((prev) => [rec, ...prev]);
  }

  async function handleSaveCell(row, field, value) {
    const updated = { ...row, [field]: value };
    setRows((prev) => prev.map((r) => r.id === row.id ? updated : r));
    setSaving((s) => ({ ...s, [row.id]: true }));
    try {
      await base44.entities.FollowUpTracker.update(row.id, { [field]: value });
    } catch (e) {
      toast.error("Save failed: " + e.message);
    } finally {
      setSaving((s) => ({ ...s, [row.id]: false }));
    }
  }

  async function handleDeleteRow(id) {
    await base44.entities.FollowUpTracker.delete(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
    setClearConfirm(null);
    toast.success("Row deleted.");
  }

  async function handleClearAll() {
    for (const r of rows) {
      await base44.entities.FollowUpTracker.delete(r.id);
    }
    setRows([]);
    setClearConfirm(null);
    toast.success("Tracker cleared.");
  }

  async function handleInitSheet() {
    setSyncing(true);
    try {
      const res = await followUpTrackerSync({ action: "init", spreadsheetId: sheetId });
      const url = res?.data?.spreadsheetUrl;
      const id  = res?.data?.spreadsheetId;
      setSheetUrl(url);
      setSheetId(id);
      toast.success("Google Sheet created & linked!");
    } catch (e) {
      toast.error("Sheet setup failed: " + e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncAll() {
    if (!sheetId) { await handleInitSheet(); return; }
    setSyncing(true);
    try {
      const res = await followUpTrackerSync({ action: "pushAll", spreadsheetId: sheetId });
      toast.success(`Synced ${res?.data?.count ?? rows.length} rows to Google Sheets.`);
    } catch (e) {
      toast.error("Sync failed: " + e.message);
    } finally {
      setSyncing(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  const lastUpdated = rows.length
    ? moment(Math.max(...rows.map((r) => new Date(r.updated_date || r.created_date).getTime()))).format("MMM D, YYYY")
    : "—";

  return (
    <div className="space-y-4">
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #follow-up-tracker-print, #follow-up-tracker-print * { visibility: visible !important; }
          #follow-up-tracker-print { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          table { font-size: 9px !important; border-collapse: collapse; }
          th, td { border: 1px solid #ccc !important; padding: 3px 5px !important; }
          thead th { background: #628C83 !important; color: white !important; -webkit-print-color-adjust: exact; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            Master Follow-Up Tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Last Updated: <span className="font-semibold text-foreground">{lastUpdated}</span>
            &nbsp;·&nbsp; {rows.length} site{rows.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={handleAddRow} className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white">
            <Plus className="w-4 h-4" /> Add Row
          </Button>
          <Button size="sm" variant="outline" onClick={handleSyncAll} disabled={syncing} className="gap-1.5">
            {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 text-green-600" />}
            {sheetId ? "Sync to Google Sheets" : "Link Google Sheet"}
          </Button>
          {sheetUrl && (
            <a href={sheetUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline" className="gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> Open Sheet
              </Button>
            </a>
          )}
          <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5">
            <Printer className="w-4 h-4" /> Print
          </Button>
          {rows.length > 0 && (
            <Button
              size="sm" variant="outline"
              className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => setClearConfirm("all")}
            >
              <Trash2 className="w-4 h-4" /> Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Confirm dialog */}
      {clearConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 no-print">
          <div className="bg-card rounded-2xl border border-border p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-2 text-red-600 mb-3">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-bold text-base">
                {clearConfirm === "all" ? "Clear entire tracker?" : "Delete this row?"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setClearConfirm(null)}>Cancel</Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-500 text-white"
                onClick={() => clearConfirm === "all" ? handleClearAll() : handleDeleteRow(clearConfirm)}
              >
                {clearConfirm === "all" ? "Clear All" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div id="follow-up-tracker-print" ref={printRef}>
        {/* Print header */}
        <div className="hidden print:block mb-4 text-center">
          <h1 className="text-xl font-bold" style={{ color: HEADER_GREEN }}>SiteHawk — Master Follow-Up Sites Tracker</h1>
          <p className="text-xs text-gray-500">Last Updated: {lastUpdated} · Printed {new Date().toLocaleDateString()}</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16 no-print">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground no-print">
            <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No sites tracked yet</p>
            <p className="text-sm mt-1">Sites are added automatically when you select a Target in the SCIP pipeline, or click "Add Row" above.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr style={{ background: HEADER_GREEN }}>
                    {COLS.map((c) => (
                      <th
                        key={c.key}
                        className="px-3 py-2.5 text-left text-white font-semibold text-xs uppercase tracking-wide whitespace-nowrap border-r border-white/20 last:border-r-0"
                        style={{ minWidth: c.width }}
                      >
                        {c.label}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-white font-semibold text-xs uppercase tracking-wide no-print" style={{ minWidth: 60 }}>
                      &nbsp;
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={row.id} className={ri % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                      {COLS.map((col) => (
                        <td key={col.key} className="border-t border-border p-0 align-top">
                          <TrackerCell
                            col={col}
                            value={row[col.key]}
                            onChange={(v) => handleSaveCell(row, col.key, v)}
                          />
                        </td>
                      ))}
                      <td className="border-t border-border px-2 py-2 text-center align-middle no-print">
                        <div className="flex items-center gap-1">
                          {saving[row.id] && (
                            <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
                          )}
                          <button
                            onClick={() => setClearConfirm(row.id)}
                            className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                            title="Delete row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Print footer */}
        <div className="hidden print:block mt-4 text-[9px] text-gray-400 text-center border-t border-gray-200 pt-2">
          SiteHawk · Master Follow-Up Sites Tracker · {new Date().toLocaleDateString()} · For internal use only — not a legal document.
        </div>
      </div>
    </div>
  );
}

// ── Inline editable cell ───────────────────────────────────────────────────
function TrackerCell({ col, value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value ?? ""); }, [value]);

  function commit() {
    setEditing(false);
    const coerced = col.type === "number" ? (draft === "" ? null : Number(draft)) : draft;
    if (coerced !== value) onChange(coerced);
  }

  function onKey(e) {
    if (e.key === "Enter" && col.type !== "textarea") commit();
    if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
  }

  if (col.type === "status") {
    return (
      <div className="relative px-2 py-1.5">
        <select
          value={draft}
          onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); }}
          className={`w-full text-xs font-semibold rounded-full border px-2 py-1 cursor-pointer focus:outline-none ${STATUS_COLORS[draft] || "bg-gray-100 text-gray-700 border-gray-300"}`}
        >
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    );
  }

  if (col.type === "textarea") {
    return (
      <textarea
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        rows={2}
        placeholder="Notes…"
        className="w-full px-3 py-2 text-xs bg-transparent focus:bg-sky-50 dark:focus:bg-sky-950/20 outline-none resize-y text-foreground placeholder:text-muted-foreground"
        style={{ minWidth: col.width }}
      />
    );
  }

  if (col.type === "date") {
    return (
      <input
        type="date"
        value={draft || ""}
        onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); }}
        className="w-full px-3 py-2 text-xs bg-transparent focus:bg-sky-50 dark:focus:bg-sky-950/20 outline-none text-foreground"
      />
    );
  }

  return (
    <input
      ref={inputRef}
      type={col.type === "number" ? "number" : "text"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      placeholder="—"
      className="w-full px-3 py-2 text-xs bg-transparent focus:bg-sky-50 dark:focus:bg-sky-950/20 outline-none text-foreground placeholder:text-muted-foreground"
      style={{ minWidth: col.width }}
    />
  );
}