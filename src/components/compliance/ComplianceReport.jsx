/**
 * ComplianceReport — a consolidated, printable NEPA + SHPO + THPO compliance
 * report generated entirely from the active ComplianceCheck record (which is
 * pre-screened from the Target A candidate on the linked ScipRecord). Pure
 * presentation + print: it reads `record` and prints to PDF via the browser.
 * No business logic, no entity writes — fully non-disruptive.
 */

import { useRef } from "react";
import { X, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TRIGGERS, NEPA_BADGE, DISCLAIMER, HC, computeDetermination, daysSince } from "./complianceConst";

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

export default function ComplianceReport({ record, onClose }) {
  const ref = useRef(null);

  const determination = computeDetermination(
    record.nepaTriggerFlags, record.groundDisturbanceArea, record.projectType
  );
  const badge = NEPA_BADGE[determination] || NEPA_BADGE["Not Started"];
  const firedTriggers = TRIGGERS.filter((t) => record.nepaTriggerFlags?.[t.key]);
  const shpo = record.shpoRecords || [];
  const thpo = record.thpoRecords || [];

  const handlePrint = () => {
    const html = ref.current?.innerHTML;
    if (!html) return;
    const w = window.open("", "_blank", "width=850,height=1100");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Hawk Compliance Report — ${record.siteName || ""}</title>
      <style>
        *{box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;}
        body{margin:40px;color:#1a1a1a;font-size:13px;line-height:1.5;}
        h1{font-size:22px;margin:0 0 4px;} h2{font-size:15px;margin:22px 0 8px;border-bottom:2px solid ${HC.green};padding-bottom:4px;color:${HC.greenDark};}
        table{width:100%;border-collapse:collapse;margin-top:6px;} th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:12px;}
        th{background:#f5f5f5;} .badge{display:inline-block;padding:4px 10px;border-radius:6px;color:#fff;font-weight:700;font-size:12px;}
        .muted{color:#666;} .disclaimer{margin-top:24px;padding:10px;border:1px solid ${HC.amber};background:rgba(255,184,0,0.08);font-size:11px;border-radius:6px;}
      </style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl border border-border max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-heading font-bold">Compliance Report — {record.siteName}</h3>
          <div className="flex items-center gap-2">
            <Button onClick={handlePrint} size="sm" className="text-white" style={{ background: HC.green }}>
              <Printer className="w-4 h-4 mr-2" /> Print / Save PDF
            </Button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div ref={ref}>
            <h1>Hawk Compliance Report</h1>
            <div className="muted" style={{ marginBottom: 4 }}>Section 106 / NEPA Regulatory Clearance Summary</div>
            <table>
              <tbody>
                <tr><th style={{ width: "30%" }}>Site Name</th><td>{record.siteName || "—"}</td></tr>
                <tr><th>Target A Owner</th><td>{record.ownerName || "—"}</td></tr>
                <tr><th>Project Type</th><td>{record.projectType === "collocation" ? "Collocation (Form 621)" : "New Tower (Form 620)"}</td></tr>
                {(Number.isFinite(record.targetLat) && Number.isFinite(record.targetLon)) && (
                  <tr><th>Coordinates</th><td>{Number(record.targetLat).toFixed(6)}, {Number(record.targetLon).toFixed(6)}</td></tr>
                )}
                {(record.county || record.state) && (
                  <tr><th>County / State</th><td>{[record.county, record.state].filter(Boolean).join(", ")}</td></tr>
                )}
                <tr><th>Ground Disturbance</th><td>{record.groundDisturbanceArea ? `${record.groundDisturbanceArea} sq ft` : "—"}{record.groundDisturbanceDepth ? ` · ${record.groundDisturbanceDepth} in deep` : ""}</td></tr>
                <tr><th>Generated</th><td>{new Date().toLocaleString()}</td></tr>
              </tbody>
            </table>

            <h2>NEPA Determination (47 CFR 1.1307)</h2>
            <p><span className="badge" style={{ background: badge.bg, color: badge.color || "#fff" }}>{badge.label}</span></p>
            <table>
              <thead><tr><th>Environmental Trigger</th><th>Source</th><th>Status</th></tr></thead>
              <tbody>
                {TRIGGERS.map((t) => (
                  <tr key={t.key}>
                    <td>{t.label}</td>
                    <td className="muted">{t.source}</td>
                    <td style={{ fontWeight: 700, color: record.nepaTriggerFlags?.[t.key] ? HC.red : HC.ok }}>
                      {record.nepaTriggerFlags?.[t.key] ? "TRIGGERED" : "Clear"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ marginTop: 6 }}>
              {firedTriggers.length === 0
                ? "No environmental triggers fired from Target A pre-screen."
                : `${firedTriggers.length} trigger(s) fired: ${firedTriggers.map((t) => t.label).join(", ")}.`}
            </p>

            <h2>SHPO — State Historic Preservation Office Review</h2>
            {shpo.length === 0 ? (
              <p className="muted">No SHPO submissions recorded yet.</p>
            ) : (
              <table>
                <thead><tr><th>State</th><th>Submitted</th><th>Determination</th><th>Response</th><th>Days Out</th></tr></thead>
                <tbody>
                  {shpo.map((s, i) => (
                    <tr key={i}>
                      <td>{s.state || "—"}</td><td>{fmtDate(s.submissionDate)}</td>
                      <td>{s.determination || "Not Submitted"}</td><td>{fmtDate(s.responseDate)}</td>
                      <td>{s.submissionDate && !s.responseDate ? (daysSince(s.submissionDate) ?? "—") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2>THPO — Tribal Historic Preservation Office Consultation</h2>
            {thpo.length === 0 ? (
              <p className="muted">No tribal consultations recorded yet.{(record.nacdTribesIdentified || []).length ? ` NACD tribes identified: ${record.nacdTribesIdentified.join(", ")}.` : ""}</p>
            ) : (
              <table>
                <thead><tr><th>Tribe</th><th>Notified</th><th>Status</th><th>Response</th><th>Days Out</th></tr></thead>
                <tbody>
                  {thpo.map((t, i) => (
                    <tr key={i}>
                      <td>{t.tribeName || "—"}</td><td>{fmtDate(t.notificationDate)}</td>
                      <td>{t.status || "Not Notified"}</td><td>{fmtDate(t.responseDate)}</td>
                      <td>{t.notificationDate && !t.responseDate ? (daysSince(t.notificationDate) ?? "—") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="disclaimer">{DISCLAIMER}</div>
          </div>
        </div>
      </div>
    </div>
  );
}