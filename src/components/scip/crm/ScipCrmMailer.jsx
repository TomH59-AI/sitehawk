import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { sendTargetPostcards } from "@/functions/sendTargetPostcards";
import { draftHawkBotLetter } from "@/functions/draftHawkBotLetter";
import { Mail, Send, Loader2, CheckCircle2, AlertTriangle, Wand2, PenLine, Gift } from "lucide-react";
import { SKYWAVE } from "@/lib/skywave";

const TONES = ["professional", "friendly", "warm", "direct", "urgent"];

// Subscription-included postcard mailer INSIDE the SCIP CRM. Mails the CRM's
// own Target A–E owner contacts at no charge (included in the plan), with an
// optional HawkBot-drafted message. Uses sendTargetPostcards action "send_free".
export default function ScipCrmMailer({ contacts }) {
  const mailable = (contacts || []).filter((c) => c.mailing_address && c.owner_name).slice(0, 5);
  const [selectedIds, setSelectedIds] = useState(mailable.map((c) => c.id));
  const [sender, setSender] = useState({ name: "", company: "", phone: "", email: "", address: "" });
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("professional");
  const [drafting, setDrafting] = useState(false);
  const [phase, setPhase] = useState("setup"); // setup | sending | done | error
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("sitehawk_sender") || "{}");
      if (saved && Object.keys(saved).length) setSender((s) => ({ ...s, ...saved }));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { setSelectedIds(mailable.map((c) => c.id)); /* eslint-disable-next-line */ }, [contacts]);

  if (!mailable.length) {
    return (
      <p className="text-xs italic" style={{ color: SKYWAVE.muted }}>
        No target owners with a mailing address yet — generate parcel targets first.
      </p>
    );
  }

  const selected = mailable.filter((c) => selectedIds.includes(c.id));
  const canSend = selected.length > 0 && (sender.name || sender.company) && phase === "setup";

  const toggle = (id) => setSelectedIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function handleDraft() {
    setDrafting(true);
    try {
      const lead = selected[0] || mailable[0];
      const res = await draftHawkBotLetter({
        owner_name: lead.owner_name,
        parcel_address: lead.parcel_address,
        sender_company: sender.company,
        sender_phone: sender.phone,
        sender_email: sender.email,
        tonality: tone,
      });
      if (res.data?.error) setError(res.data.error);
      else setMessage(res.data.body || "");
    } catch (e) {
      setError(e.message);
    } finally {
      setDrafting(false);
    }
  }

  async function handleSend() {
    setPhase("sending");
    setError(null);
    try {
      localStorage.setItem("sitehawk_sender", JSON.stringify(sender));
      const targets = selected.map((c) => ({
        owner_name: c.owner_name,
        parcel_address: c.parcel_address,
        mailing_address: c.mailing_address || c.parcel_address,
      }));
      const res = await sendTargetPostcards({ action: "send_free", targets, sender, message });
      if (res.data?.error) {
        setError(res.data.error);
        setPhase("error");
      } else {
        setResults(res.data);
        setPhase("done");
      }
    } catch (e) {
      setError(e.message);
      setPhase("error");
    }
  }

  return (
    <div className="rounded-lg border p-3" style={{ borderColor: SKYWAVE.line }}>
      <div className="flex items-center gap-2 mb-1">
        <Mail className="w-4 h-4" style={{ color: SKYWAVE.blue }} />
        <span className="text-sm font-bold" style={{ color: SKYWAVE.navy }}>Mail Postcards to Targets</span>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#DCFCE7", color: "#166534" }}>
          <Gift className="w-3 h-3" /> Included — No Charge
        </span>
      </div>
      <p className="text-[11px] mb-3" style={{ color: SKYWAVE.muted }}>
        Mail engaging cell-tower-lease postcards to Target A–E, included in your subscription. HawkBot can draft the message for you.
      </p>

      {phase === "setup" && (
        <div className="space-y-3">
          {/* Target selection */}
          <div className="space-y-1.5">
            {mailable.map((c) => {
              const on = selectedIds.includes(c.id);
              return (
                <button key={c.id} onClick={() => toggle(c.id)}
                  className="w-full text-left rounded-md border px-2.5 py-2 flex items-center gap-2 transition-colors"
                  style={{ borderColor: on ? SKYWAVE.blue : SKYWAVE.line, background: on ? "rgba(27,63,174,0.05)" : "#fff" }}>
                  <div className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                    style={{ background: on ? SKYWAVE.blue : "transparent", borderColor: on ? SKYWAVE.blue : SKYWAVE.muted }}>
                    {on && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white mr-1.5" style={{ background: SKYWAVE.blue }}>{c.target_label}</span>
                    <span className="text-xs font-semibold" style={{ color: SKYWAVE.navy }}>{c.owner_name}</span>
                    <div className="text-[11px] truncate" style={{ color: SKYWAVE.muted }}>{c.mailing_address}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Sender info */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Your Name" value={sender.name} onChange={(v) => setSender({ ...sender, name: v })} />
            <Field label="Company" value={sender.company} onChange={(v) => setSender({ ...sender, company: v })} />
            <Field label="Phone" value={sender.phone} onChange={(v) => setSender({ ...sender, phone: v })} />
            <Field label="Email" value={sender.email} onChange={(v) => setSender({ ...sender, email: v })} />
            <div className="col-span-2">
              <Field label="Return Address (optional)" value={sender.address} onChange={(v) => setSender({ ...sender, address: v })} placeholder="123 Main St, Tampa, FL 33601" />
            </div>
          </div>

          {/* Message + HawkBot */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: SKYWAVE.muted }}>Message (optional)</span>
              <div className="flex items-center gap-1.5">
                <select value={tone} onChange={(e) => setTone(e.target.value)}
                  className="rounded border text-[11px] capitalize px-1.5 py-1 bg-white" style={{ borderColor: SKYWAVE.line, color: SKYWAVE.navy }}>
                  {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={handleDraft} disabled={drafting}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold text-white disabled:opacity-50" style={{ background: "#0C1B2E" }}>
                  {drafting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Draft with HawkBot
                </button>
              </div>
            </div>
            <div className="relative">
              <PenLine className="absolute top-2 left-2 w-3.5 h-3.5 pointer-events-none" style={{ color: SKYWAVE.muted }} />
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
                placeholder="Type your message, click Draft with HawkBot, or leave blank for our default tower-lease pitch."
                className="w-full pl-7 pr-2 py-2 rounded-md border text-xs resize-none" style={{ borderColor: SKYWAVE.line }} />
            </div>
          </div>

          <button onClick={handleSend} disabled={!canSend}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-40"
            style={{ background: "#059669" }}>
            <Send className="w-4 h-4" /> Mail {selected.length} Postcard{selected.length !== 1 ? "s" : ""} — Free
          </button>
        </div>
      )}

      {phase === "sending" && (
        <div className="flex flex-col items-center gap-2 py-8" style={{ color: SKYWAVE.muted }}>
          <Loader2 className="w-7 h-7 animate-spin" style={{ color: SKYWAVE.blue }} />
          <span className="text-sm font-semibold" style={{ color: SKYWAVE.navy }}>Mailing your postcards…</span>
        </div>
      )}

      {phase === "done" && results && (
        <div className="space-y-2">
          <div className="rounded-md p-2.5 flex items-center gap-2 text-sm" style={{ background: "#DCFCE7", color: "#166534" }}>
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-bold">{results.sent} of {results.total} postcards mailed — no charge</span>
          </div>
          <div className="max-h-40 overflow-y-auto divide-y rounded-md border" style={{ borderColor: SKYWAVE.line }}>
            {results.results.map((r, i) => (
              <div key={i} className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold" style={{ color: SKYWAVE.navy }}>{r.owner_name || "—"}</div>
                  {r.reason && <div className="text-red-600">{r.reason}</div>}
                  {r.expected_delivery && <div style={{ color: SKYWAVE.muted }}>ETA {r.expected_delivery}</div>}
                </div>
                <span className={`font-bold uppercase text-[10px] ${r.status === "sent" ? "text-emerald-600" : r.status === "skipped" ? "text-amber-600" : "text-red-600"}`}>{r.status}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setPhase("setup")} className="text-xs font-medium underline" style={{ color: SKYWAVE.blue }}>Mail more</button>
        </div>
      )}

      {phase === "error" && (
        <div className="rounded-md p-3 text-sm" style={{ background: "#FEE2E2" }}>
          <div className="flex items-center gap-2 font-bold text-red-700 mb-1"><AlertTriangle className="w-4 h-4" /> Mailer error</div>
          <div className="text-xs" style={{ color: SKYWAVE.muted }}>{error}</div>
          <button onClick={() => setPhase("setup")} className="mt-2 px-3 py-1.5 rounded border text-xs font-medium" style={{ borderColor: SKYWAVE.line }}>Back</button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium" style={{ color: SKYWAVE.muted }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full mt-0.5 px-2 py-1.5 rounded-md border text-xs" style={{ borderColor: SKYWAVE.line }} />
    </label>
  );
}