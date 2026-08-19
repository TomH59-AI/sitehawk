import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { sendPostcardMailers } from "@/functions/sendPostcardMailers";
import { draftHawkBotLetter } from "@/functions/draftHawkBotLetter";
import {
  X, Send, Loader2, CheckCircle2, AlertTriangle, MapPin, Wand2, PenLine,
  ShieldCheck, Eye, Plus, ImagePlus, FileText,
} from "lucide-react";
import PostcardPreview from "./PostcardPreview";

const MERGE_SUBSTITUTIONS = (r, sender) => ({
  "{{owner_name}}": r.owner_name || "Property Owner",
  "{{parcel_address}}": r.parcel_address || "your property",
  "{{mailing_address}}": r.mailing_address || "",
  "{{sender_name}}": sender.name || sender.company || "",
  "{{sender_company}}": sender.company || "",
  "{{sender_phone}}": sender.phone || "",
  "{{sender_email}}": sender.email || "",
});

function applyMergeFields(body, recipient, sender) {
  if (!body) return "";
  const subs = MERGE_SUBSTITUTIONS(recipient, sender);
  return Object.entries(subs).reduce((acc, [k, v]) => acc.replaceAll(k, v), body);
}

const TARGET_LABELS = ["Target A", "Target B", "Target C"];

// Build the SCIP target recipients (Target A/B/C) from parcel_targets.
function scipRecipients(record) {
  const targets = Array.isArray(record?.parcel_targets) ? record.parcel_targets : [];
  return targets.slice(0, 3).map((t, i) => ({
    key: `scip_${i}`,
    label: t.label || TARGET_LABELS[i] || `Target ${i + 1}`,
    source: "scip_target",
    owner_name: t.owner_name || "",
    mailing_address: t.mailing_address || t.parcel_address || "",
    parcel_address: t.parcel_address || "",
    apn: t.apn || "",
    latitude: t.latitude ?? null,
    longitude: t.longitude ?? null,
  })).filter((r) => r.owner_name && r.mailing_address);
}

export default function PostcardMailerModal({ record, onClose, onSent }) {
  const scipRecips = useMemo(() => scipRecipients(record), [record]);
  const [selected, setSelected] = useState(() => scipRecips.map((r) => r.key));
  const [extras, setExtras] = useState([]); // chosen extra evaluated parcels (max 2)
  const [extraPool, setExtraPool] = useState([]); // available evaluated parcels
  const [poolLoading, setPoolLoading] = useState(true);

  const [sender, setSender] = useState({ name: "", company: "", phone: "", email: "", address: "", branding_mode: "sitehawk", logo_url: "" });
  const [logoUploading, setLogoUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("friendly");
  const [drafting, setDrafting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  // Load saved postcard templates (default is pre-selected).
  useEffect(() => {
    (async () => {
      try {
        const rows = await base44.entities.PostcardTemplate.list("-updated_date", 50);
        setTemplates(rows || []);
        const def = (rows || []).find((t) => t.is_default);
        if (def) {
          setSelectedTemplateId(def.id);
          setMessage(def.body || "");
          setTone(def.tone || "friendly");
        }
      } catch { /* ignore */ } finally {
        setTemplatesLoading(false);
      }
    })();
  }, []);

  const applyTemplate = (templateId) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const t = templates.find((x) => x.id === templateId);
    if (t) {
      setMessage(t.body || "");
      setTone(t.tone || tone);
    }
  };

  const [phase, setPhase] = useState("setup"); // setup | verifying | confirm | sending | error
  const [verified, setVerified] = useState(null); // verified recipients from backend
  const [confirmCheck, setConfirmCheck] = useState(false);
  const [error, setError] = useState(null);

  // Prefill sender from localStorage.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("sitehawk_sender") || "{}");
      if (saved && Object.keys(saved).length) setSender((s) => ({ ...s, ...saved }));
    } catch { /* ignore */ }
  }, []);

  // Load already-evaluated parcels (SearchResult) the user can add as extras.
  useEffect(() => {
    (async () => {
      try {
        const ownerNames = new Set(scipRecips.map((r) => (r.owner_name || "").toLowerCase()));
        const rows = await base44.entities.SearchResult.list("-created_date", 60);
        const pool = (rows || [])
          .filter((r) => r.owner_name && (r.owner_mailing_address || r.parcel_address))
          .filter((r) => !ownerNames.has((r.owner_name || "").toLowerCase()))
          .map((r) => ({
            key: `extra_${r.id}`,
            label: "",
            source: "extra",
            owner_name: r.owner_name,
            mailing_address: r.owner_mailing_address || r.parcel_address,
            parcel_address: r.parcel_address || "",
            apn: r.parcel_id || "",
            latitude: r.latitude ?? null,
            longitude: r.longitude ?? null,
          }));
        // de-dupe by owner+address
        const seen = new Set();
        const deduped = pool.filter((p) => {
          const k = `${p.owner_name}|${p.mailing_address}`.toLowerCase();
          if (seen.has(k)) return false; seen.add(k); return true;
        });
        setExtraPool(deduped.slice(0, 25));
      } catch { /* ignore */ } finally {
        setPoolLoading(false);
      }
    })();
  }, [scipRecips]);

  const toggleScip = (key) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const toggleExtra = (parcel) => {
    setExtras((prev) => {
      if (prev.find((e) => e.key === parcel.key)) return prev.filter((e) => e.key !== parcel.key);
      if (prev.length >= 2) return prev; // cap at 2 extras
      return [...prev, parcel];
    });
  };

  // Final recipient list, with Extra 1/Extra 2 labels assigned.
  const recipients = useMemo(() => {
    const chosenScip = scipRecips.filter((r) => selected.includes(r.key));
    const chosenExtras = extras.map((e, i) => ({ ...e, label: `Extra ${i + 1}` }));
    return [...chosenScip, ...chosenExtras].slice(0, 5);
  }, [scipRecips, selected, extras]);

  const count = recipients.length;
  const price = count === 0 ? 0 : count <= 3 ? 49 : 79;
  const previewRecip = recipients[0] || scipRecips[0] || { owner_name: "Property Owner", parcel_address: "" };
  const canStart = count > 0 && (sender.name || sender.company) && phase === "setup";

  async function handleDraft() {
    setDrafting(true);
    try {
      const lead = recipients[0] || {};
      const res = await draftHawkBotLetter({
        owner_name: lead.owner_name,
        parcel_address: lead.parcel_address,
        sender_company: sender.company,
        sender_phone: sender.phone,
        sender_email: sender.email,
        tonality: tone,
        extra_context: "This is a POSTCARD asking only whether the owner is OPEN TO DISCUSSING a potential cell tower ground lease. Keep it short (under 90 words), factual, friendly, and strictly non-binding. Do NOT promise approval, a specific rent amount, or a guaranteed lease.",
      });
      if (res.data?.error) setError(res.data.error);
      else setMessage((res.data.body || "").trim());
    } catch (e) {
      setError(e.message);
    } finally {
      setDrafting(false);
    }
  }

  // Step 1 → verify addresses with Lob, then move to the confirm screen.
  async function handleVerify() {
    setError(null);
    setPhase("verifying");
    try {
      const res = await sendPostcardMailers({
        action: "verify",
        recipients: recipients.map((r) => ({
          label: r.label, source: r.source, owner_name: r.owner_name,
          mailing_address: r.mailing_address, parcel_address: r.parcel_address,
          apn: r.apn, latitude: r.latitude, longitude: r.longitude,
        })),
      });
      if (res.data?.error) { setError(res.data.error); setPhase("error"); return; }
      setVerified(res.data.recipients || []);
      setPhase("confirm");
    } catch (e) {
      setError(e.message); setPhase("error");
    }
  }

  // Step 2 → charge + create order (Lob send happens post-payment in the webhook).
  async function handlePayAndSend() {
    if (window.self !== window.top) {
      setError("Checkout only works from the published app. Open your live app to pay & mail.");
      setPhase("error");
      return;
    }
    setPhase("sending");
    try {
      localStorage.setItem("sitehawk_sender", JSON.stringify(sender));
      const deliverable = (verified || []).filter((v) => v.address_verified);
      const res = await sendPostcardMailers({
        action: "checkout",
        scip_record_id: record.id,
        site_name: record.site_name,
        recipients: deliverable,
        sender,
        message_copy: message,
        return_path: `/scip/${record.id}`,
      });
      if (res.data?.error) { setError(res.data.error); setPhase("error"); return; }
      if (res.data?.url) { window.location.href = res.data.url; }
      else { setError("Could not start checkout."); setPhase("error"); }
    } catch (e) {
      setError(e.message); setPhase("error");
    }
  }

  async function handleLogoUpload(file) {
    if (!file) return;
    setLogoUploading(true);
    try {
      const uploaded = await base44.integrations.Core.UploadFile({ file });
      setSender((current) => ({ ...current, branding_mode: "customer", logo_url: uploaded.file_url }));
    } finally {
      setLogoUploading(false);
    }
  }

  const deliverableCount = (verified || []).filter((v) => v.address_verified).length;
  const confirmPrice = deliverableCount === 0 ? 0 : deliverableCount <= 3 ? 49 : 79;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl border border-border max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-heading font-bold text-foreground">Send Postcard Mailers</h3>
            <p className="text-xs text-muted-foreground">Postcard Mailer Pack · up to 3 for $49 · up to 5 for $79</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {phase === "setup" && (
            <>
              {/* SCIP targets */}
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">SCIP Targets</p>
                {scipRecips.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    No SCIP targets with mailing data yet. Pick your 3 targets first.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {scipRecips.map((r) => (
                      <RecipientRow key={r.key} r={r} on={selected.includes(r.key)} onToggle={() => toggleScip(r.key)} />
                    ))}
                  </div>
                )}
              </div>

              {/* Optional extra evaluated parcels (max 2) */}
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
                  Add More Parcels You Evaluated (optional, up to 2) — {extras.length}/2
                </p>
                {poolLoading ? (
                  <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading evaluated parcels…</div>
                ) : extraPool.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No other evaluated parcels with mailing data found.</div>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {extraPool.map((p) => {
                      const on = !!extras.find((e) => e.key === p.key);
                      const disabled = !on && extras.length >= 2;
                      return <RecipientRow key={p.key} r={p} on={on} disabled={disabled} icon={Plus} onToggle={() => toggleExtra(p)} />;
                    })}
                  </div>
                )}
              </div>

              {/* Sender */}
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">Postcard Branding</p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button onClick={() => setSender({ ...sender, branding_mode: "sitehawk", logo_url: "" })}
                    className={`rounded-lg border p-3 text-left text-xs ${sender.branding_mode === "sitehawk" ? "border-primary bg-primary/5" : "border-border"}`}>
                    <strong className="block text-foreground">Use SiteHawk branding</strong>
                    <span className="text-muted-foreground">Our logo and design</span>
                  </button>
                  <label className={`rounded-lg border p-3 text-left text-xs cursor-pointer ${sender.branding_mode === "customer" ? "border-primary bg-primary/5" : "border-border"}`}>
                    <strong className="flex items-center gap-1 text-foreground"><ImagePlus className="w-3.5 h-3.5" /> Use my logo</strong>
                    <span className="text-muted-foreground">{logoUploading ? "Uploading…" : sender.logo_url ? "Logo ready" : "Upload PNG or JPG"}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" disabled={logoUploading}
                      onChange={(e) => handleLogoUpload(e.target.files?.[0])} className="hidden" />
                  </label>
                </div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">Your Contact Info (printed on the postcard)</p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Your Name" value={sender.name} onChange={(v) => setSender({ ...sender, name: v })} />
                  <Field label="Company" value={sender.company} onChange={(v) => setSender({ ...sender, company: v })} />
                  <Field label="Phone" value={sender.phone} onChange={(v) => setSender({ ...sender, phone: v })} />
                  <Field label="Email" value={sender.email} onChange={(v) => setSender({ ...sender, email: v })} />
                  <div className="col-span-2">
                    <Field label="Return Address (optional)" value={sender.address} onChange={(v) => setSender({ ...sender, address: v })} placeholder="123 Main St, Tampa, FL 33601" />
                  </div>
                </div>
              </div>

              {/* Saved template selector */}
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">Saved Template (optional)</p>
                {templatesLoading ? (
                  <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading templates…</div>
                ) : templates.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No saved templates yet. Draft with Brian below or create reusable templates in the Mail Orders tab.</div>
                ) : (
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <select value={selectedTemplateId} onChange={(e) => applyTemplate(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                      <option value="">— None (draft fresh) —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}{t.is_default ? " (default)" : ""}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* HawkBot draft */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Postcard Message</p>
                  <div className="flex items-center gap-1.5">
                    <select value={tone} onChange={(e) => setTone(e.target.value)}
                      className="rounded-md border border-border bg-secondary text-[11px] capitalize px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                      {["friendly", "professional", "warm", "direct"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button onClick={handleDraft} disabled={drafting}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0C1B2E] hover:bg-[#15263f] text-white text-[11px] font-bold transition-all disabled:opacity-50">
                      {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Draft with Brian
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <PenLine className="absolute top-2.5 left-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5}
                    placeholder="Click Draft with Brian, then edit. Leave blank to use our default exploratory inquiry."
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-secondary text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed" />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Factual, friendly & non-binding — no promises of approval, rent, or a guaranteed lease.</p>
              </div>

              {/* Preview toggle */}
              <div>
                <button onClick={() => setShowPreview((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Eye className="w-4 h-4" /> {showPreview ? "Hide" : "Show"} postcard preview
                </button>
                {showPreview && <div className="mt-3"><PostcardPreview recipient={previewRecip} sender={sender} message={applyMergeFields(message, previewRecip, sender)} /></div>}
              </div>

              {/* Verify + price */}
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{count} recipient{count !== 1 ? "s" : ""} selected</p>
                  <p className="font-heading font-bold text-2xl text-emerald-600">${price.toFixed(2)}</p>
                </div>
                <button onClick={handleVerify} disabled={!canStart}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-bold transition-all">
                  <ShieldCheck className="w-4 h-4" /> Verify Addresses
                </button>
              </div>
            </>
          )}

          {phase === "verifying" && <Centered text="Verifying addresses with Lob…" />}
          {phase === "sending" && <Centered text="Redirecting to secure checkout…" sub="Your postcards mail automatically once payment clears." />}

          {/* Confirm screen — verification results + explicit confirmation */}
          {phase === "confirm" && verified && (
            <div className="space-y-4">
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Address Verification</p>
              <div className="divide-y divide-border border border-border rounded-lg">
                {verified.map((v, i) => (
                  <div key={i} className="px-3 py-2.5 flex items-start gap-3 text-xs">
                    {v.address_verified
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                      : <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground">{v.label} · {v.owner_name || "—"}</div>
                      <div className="text-muted-foreground truncate">{v.mailing_address}</div>
                      {!v.address_verified && <div className="text-amber-600">{v.verification_note || "Not deliverable — will be skipped"}</div>}
                    </div>
                  </div>
                ))}
              </div>

              {deliverableCount === 0 ? (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-700 dark:text-red-300">
                  No deliverable addresses. Fix mailing addresses and try again.
                </div>
              ) : (
                <>
                  <label className="flex items-start gap-2 text-xs text-foreground bg-secondary/50 rounded-lg p-3">
                    <input type="checkbox" checked={confirmCheck} onChange={(e) => setConfirmCheck(e.target.checked)} className="mt-0.5" />
                    <span>I confirm I want to mail <strong>{deliverableCount}</strong> physical postcard{deliverableCount !== 1 ? "s" : ""} and authorize the <strong>${confirmPrice.toFixed(2)}</strong> charge.</span>
                  </label>
                  <div className="flex items-center justify-between gap-3">
                    <button onClick={() => setPhase("setup")} className="px-4 py-2 rounded-lg border border-border text-sm font-medium">Back</button>
                    <button onClick={handlePayAndSend} disabled={!confirmCheck}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-bold transition-all">
                      <Send className="w-4 h-4" /> Pay & Mail ${confirmPrice.toFixed(2)}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {phase === "error" && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-sm">
              <div className="flex items-center gap-2 font-bold text-red-700 dark:text-red-300 mb-1"><AlertTriangle className="w-4 h-4" /> Mailer error</div>
              <div className="text-xs text-muted-foreground">{error}</div>
              <button onClick={() => setPhase("setup")} className="mt-3 px-4 py-2 rounded-lg border border-border text-sm font-medium">Back</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecipientRow({ r, on, disabled, onToggle, icon: Icon = CheckCircle2 }) {
  return (
    <button onClick={onToggle} disabled={disabled}
      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all flex items-center gap-3 ${
        on ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/40 hover:border-primary/20"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}>
      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-primary border-primary" : "border-muted-foreground"}`}>
        {on && <Icon className="w-3 h-3 text-primary-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">
          {r.label ? <span className="text-primary">{r.label} · </span> : null}{r.owner_name}
        </p>
        <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
          <MapPin className="w-3 h-3" /> {r.mailing_address || "No address"}{r.apn ? ` · APN ${r.apn}` : ""}
        </p>
      </div>
    </button>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-secondary text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
    </label>
  );
}

function Centered({ text, sub }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <div className="text-sm font-semibold text-foreground">{text}</div>
      {sub && <div className="text-xs">{sub}</div>}
    </div>
  );
}