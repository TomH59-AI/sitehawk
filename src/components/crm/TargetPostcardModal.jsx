import { useState, useEffect } from "react";
import { X, Send, Loader2, CheckCircle2, AlertTriangle, MapPin, Sparkles, Plus, Wand2, PenLine } from "lucide-react";
import { sendTargetPostcards } from "@/functions/sendTargetPostcards";
import { findMoreTargets } from "@/functions/findMoreTargets";
import { draftHawkBotLetter } from "@/functions/draftHawkBotLetter";

const TONES = ["professional", "friendly", "warm", "direct", "urgent"];

// Lets the user pick up to 3 target leads, enter their own contact info, review
// the charge, and mail engaging cell-tower-lease postcards via Lob.
export default function TargetPostcardModal({ deals, onClose }) {
  const [selectedIds, setSelectedIds] = useState(deals.slice(0, 3).map((d) => d.id));
  const [sender, setSender] = useState({ name: "", company: "", phone: "", email: "", address: "" });
  const [phase, setPhase] = useState("setup"); // setup | sending | done | error
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  // $1 add-on: 5 extra tower-friendly targets discovered nearby via Realie.
  const [bonusOn, setBonusOn] = useState(false);
  const [bonusTargets, setBonusTargets] = useState([]);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [bonusError, setBonusError] = useState(null);
  // Optional custom letter body printed on the postcard back (HawkBot or typed).
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("professional");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState(null);

  // Prefill sender from saved localStorage so they don't retype it.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("sitehawk_sender") || "{}");
      if (saved && Object.keys(saved).length) setSender((s) => ({ ...s, ...saved }));
    } catch { /* ignore */ }
  }, []);

  const selected = deals.filter((d) => selectedIds.includes(d.id));
  const PRIMARY_BATCH = 12; // flat — up to 3 cards
  const BONUS_BATCH = 1;    // flat — up to 3 bonus cards
  const bonusCount = bonusOn ? bonusTargets.length : 0;
  const total = (selected.length ? PRIMARY_BATCH : 0) + (bonusOn && bonusTargets.length ? BONUS_BATCH : 0);

  const toggle = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev; // cap at 3 targets
      return [...prev, id];
    });
  };

  // Find 5 more nearby tower-friendly targets via Realie, centered on a selected lead.
  const handleFindMore = async () => {
    setBonusError(null);
    const center = selected.find((d) => d.latitude && d.longitude) || deals.find((d) => d.latitude && d.longitude);
    if (!center) {
      setBonusError("No mapped coordinates on your leads to search around.");
      return;
    }
    setBonusLoading(true);
    setBonusOn(true);
    try {
      const excludeOwners = [...selected, ...deals].map((d) => d.owner_name).filter(Boolean);
      const res = await findMoreTargets({
        lat: center.latitude, lon: center.longitude, exclude_owners: excludeOwners, limit: 3,
      });
      if (res.data?.error) {
        setBonusError(res.data.error);
        setBonusOn(false);
      } else {
        setBonusTargets(res.data.targets || []);
        if (!res.data.targets?.length) setBonusError("No additional qualifying parcels found nearby.");
      }
    } catch (e) {
      setBonusError(e.message);
      setBonusOn(false);
    } finally {
      setBonusLoading(false);
    }
  };

  // Ask HawkBot to draft an engaging letter body for the first selected owner.
  const handleDraft = async () => {
    setDraftError(null);
    setDrafting(true);
    try {
      const lead = selected[0] || deals[0] || {};
      const res = await draftHawkBotLetter({
        owner_name: lead.owner_name,
        parcel_address: lead.parcel_address,
        sender_company: sender.company,
        sender_phone: sender.phone,
        sender_email: sender.email,
        tonality: tone,
      });
      if (res.data?.error) setDraftError(res.data.error);
      else setMessage(res.data.body || "");
    } catch (e) {
      setDraftError(e.message);
    } finally {
      setDrafting(false);
    }
  };

  const canSend = (selected.length > 0 || bonusCount > 0) && (sender.name || sender.company) && phase === "setup";

  const handleSend = async () => {
    // Block checkout inside the builder iframe (Stripe needs the published app).
    if (window.self !== window.top) {
      setError("Checkout only works from the published app. Open your live app to pay & mail.");
      setPhase("error");
      return;
    }
    setPhase("sending");
    try {
      localStorage.setItem("sitehawk_sender", JSON.stringify(sender));
      const baseTargets = selected.map((d) => ({
        owner_name: d.owner_name,
        parcel_address: d.parcel_address,
        mailing_address: d.owner_mailing_address || d.parcel_address,
      }));
      const extraTargets = (bonusOn ? bonusTargets : []).map((t) => ({
        owner_name: t.owner_name,
        parcel_address: t.parcel_address,
        mailing_address: t.mailing_address || t.parcel_address,
      }));
      const targets = [...baseTargets, ...extraTargets];
      // Pay first — fulfillment (Lob send) happens in the Stripe webhook.
      const res = await sendTargetPostcards({
        action: "checkout", targets, sender, message,
        bonus_count: extraTargets.length,
        return_path: window.location.pathname,
      });
      if (res.data?.error) {
        setError(res.data.error);
        setPhase("error");
      } else if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        setError("Could not start checkout.");
        setPhase("error");
      }
    } catch (e) {
      setError(e.message);
      setPhase("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl border border-border max-w-2xl w-full max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-heading font-bold text-foreground">Mail Target Postcards</h3>
            <p className="text-xs text-muted-foreground">3 postcards for ${PRIMARY_BATCH} · add 3 more for ${BONUS_BATCH}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {phase === "setup" && (
            <>
              {/* Target selection */}
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
                  Select Targets ({selected.length}/3)
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {deals.map((d) => {
                    const on = selectedIds.includes(d.id);
                    const disabled = !on && selected.length >= 3;
                    return (
                      <button
                        key={d.id}
                        onClick={() => toggle(d.id)}
                        disabled={disabled}
                        className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all flex items-center gap-3 ${
                          on ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/40 hover:border-primary/20"
                        } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                          {on && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">{d.owner_name}</p>
                          <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {d.owner_mailing_address || d.parcel_address || "No address"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* $1 bonus upsell — 5 more nearby tower-friendly targets */}
              <div className="rounded-xl border-2 border-amber-400/50 bg-gradient-to-br from-amber-400/10 to-orange-500/5 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 font-heading font-bold text-sm text-amber-700 dark:text-amber-300">
                      <Sparkles className="w-4 h-4" /> Add 3 more targets — just $1
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      We'll scan nearby parcels (Realie) for the most tower-friendly land — big, vacant/agricultural lots with mailable owners — and mail them too. Three extra shots on goal for a single dollar.
                    </p>
                  </div>
                  {!bonusOn && (
                    <button
                      onClick={handleFindMore}
                      disabled={bonusLoading}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {bonusLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Find 3 More
                    </button>
                  )}
                </div>

                {bonusError && <p className="text-xs text-red-600 mt-2">{bonusError}</p>}

                {bonusOn && bonusTargets.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-300">
                        {bonusTargets.length} bonus targets found (+$1)
                      </span>
                      <button onClick={() => { setBonusOn(false); setBonusTargets([]); }} className="text-[11px] text-muted-foreground hover:text-foreground underline">
                        Remove
                      </button>
                    </div>
                    {bonusTargets.map((t, i) => (
                      <div key={i} className="rounded-lg border border-amber-400/30 bg-card/60 px-3 py-2 flex items-center gap-2">
                        <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground truncate">{t.owner_name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {t.acreage ? `${Number(t.acreage).toFixed(1)} ac · ` : ""}{t.land_use || ""} · {t.mailing_address || t.parcel_address}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sender contact info */}
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
                  Your Contact Info (printed on the postcard)
                </p>
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

              {/* Postcard message — HawkBot draft or type your own */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                    Postcard Message <span className="normal-case font-normal">(optional — defaults to our pitch)</span>
                  </p>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      className="rounded-md border border-border bg-secondary text-[11px] capitalize px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button
                      onClick={handleDraft}
                      disabled={drafting}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0C1B2E] hover:bg-[#15263f] text-white text-[11px] font-bold transition-all disabled:opacity-50"
                    >
                      {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                      Draft with HawkBot
                    </button>
                  </div>
                </div>
                {draftError && <p className="text-xs text-red-600 mb-1.5">{draftError}</p>}
                <div className="relative">
                  <PenLine className="absolute top-2.5 left-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    placeholder="Type your own engaging letter here, or click Draft with HawkBot. Leave blank to use our default tower-lease pitch."
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-secondary text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed"
                  />
                </div>
              </div>

              {/* Charge summary */}
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {selected.length ? `${selected.length} postcard${selected.length !== 1 ? "s" : ""} — $${PRIMARY_BATCH} flat` : "No primary targets"}
                    {bonusCount > 0 ? ` + ${bonusCount} bonus — $${BONUS_BATCH} flat` : ""}
                  </p>
                  <p className="font-heading font-bold text-2xl text-emerald-600">${total.toFixed(2)}</p>
                </div>
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-bold transition-all"
                >
                  <Send className="w-4 h-4" /> Pay & Mail ${total.toFixed(2)}
                </button>
              </div>
            </>
          )}

          {phase === "sending" && (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <div className="text-sm font-semibold text-foreground">Redirecting to secure checkout…</div>
              <div className="text-xs">Your postcards mail automatically once payment clears.</div>
            </div>
          )}

          {phase === "done" && results && (
            <div className="space-y-3">
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <div className="font-bold text-emerald-700 dark:text-emerald-300">
                  {results.sent} of {results.total} postcards mailed · ${(results.charged_usd || 0).toFixed(2)} charged
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-border border border-border rounded-lg">
                {results.results.map((r, i) => (
                  <div key={i} className="px-3 py-2 flex items-start justify-between gap-3 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground">{r.owner_name || "—"}</div>
                      {r.reason && <div className="text-red-600">{r.reason}</div>}
                      {r.expected_delivery && <div className="text-muted-foreground">ETA {r.expected_delivery}</div>}
                    </div>
                    <span className={`font-bold uppercase text-[10px] tracking-wider ${
                      r.status === "sent" ? "text-emerald-600" : r.status === "skipped" ? "text-amber-600" : "text-red-600"
                    }`}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button onClick={onClose} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold">Done</button>
              </div>
            </div>
          )}

          {phase === "error" && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-sm">
              <div className="flex items-center gap-2 font-bold text-red-700 dark:text-red-300 mb-1">
                <AlertTriangle className="w-4 h-4" /> Mailer error
              </div>
              <div className="text-xs text-muted-foreground">{error}</div>
              <button onClick={() => setPhase("setup")} className="mt-3 px-4 py-2 rounded-lg border border-border text-sm font-medium">
                Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-secondary text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}