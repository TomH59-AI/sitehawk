import { useState, useEffect } from "react";
import { X, Send, Loader2, CheckCircle2, AlertTriangle, MapPin, Sparkles, Plus } from "lucide-react";
import { sendTargetPostcards } from "@/functions/sendTargetPostcards";
import { findMoreTargets } from "@/functions/findMoreTargets";

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

  // Prefill sender from saved localStorage so they don't retype it.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("sitehawk_sender") || "{}");
      if (saved && Object.keys(saved).length) setSender((s) => ({ ...s, ...saved }));
    } catch { /* ignore */ }
  }, []);

  const selected = deals.filter((d) => selectedIds.includes(d.id));
  const PRICE = 12;
  const BONUS_PRICE = 1;
  const bonusCount = bonusOn ? bonusTargets.length : 0;
  const total = selected.length * PRICE + (bonusOn && bonusTargets.length ? BONUS_PRICE : 0);

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
        lat: center.latitude, lon: center.longitude, exclude_owners: excludeOwners, limit: 5,
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

  const canSend = (selected.length > 0 || bonusCount > 0) && (sender.name || sender.company) && phase === "setup";

  const handleSend = async () => {
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
      const res = await sendTargetPostcards({ action: "send", targets, sender, bonus_count: extraTargets.length });
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
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl border border-border max-w-2xl w-full max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-heading font-bold text-foreground">Mail Target Postcards</h3>
            <p className="text-xs text-muted-foreground">Pitch up to 3 owners a cell-tower lease · ${PRICE}/postcard</p>
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
                      <Sparkles className="w-4 h-4" /> Add 5 more targets — just $1
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      We'll scan nearby parcels (Realie) for the most tower-friendly land — big, vacant/agricultural lots with mailable owners — and mail them too. Five extra shots on goal for a single dollar.
                    </p>
                  </div>
                  {!bonusOn && (
                    <button
                      onClick={handleFindMore}
                      disabled={bonusLoading}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {bonusLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Find 5 More
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

              {/* Charge summary */}
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {selected.length} postcard{selected.length !== 1 ? "s" : ""} × ${PRICE}
                    {bonusCount > 0 ? ` + ${bonusCount} bonus × $1 flat` : ""}
                  </p>
                  <p className="font-heading font-bold text-2xl text-emerald-600">${total.toFixed(2)}</p>
                </div>
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-bold transition-all"
                >
                  <Send className="w-4 h-4" /> Send & Charge ${total.toFixed(2)}
                </button>
              </div>
            </>
          )}

          {phase === "sending" && (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <div className="text-sm font-semibold text-foreground">Printing & mailing postcards via Lob…</div>
              <div className="text-xs">Please don't close this window.</div>
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