/**
 * SendPropositionButton — single-landlord proposition flow.
 *
 * 5 steps:
 *   1. Recipient confirm  → owner_name + mailing_address
 *   2. Sender info        → company, return address, phone, email
 *   3. Tonality + HawkBot → choose tone, optional extra context, draft body
 *   4. Edit & preview     → user can hand-tweak the body
 *   5. Pay & send         → Stripe $9.99 → webhook → Lob letter
 */

import { useState } from "react";
import { Send, Loader2, X, ChevronRight, ChevronLeft, Sparkles, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { draftHawkBotLetter } from "@/functions/draftHawkBotLetter";
import { singlePropositionCheckout } from "@/functions/singlePropositionCheckout";

const PRICE = "$9.99";

const TONES = [
  { id: "professional", label: "Professional", blurb: "Formal, business-grade. Reads like outside counsel." },
  { id: "friendly",     label: "Friendly",     blurb: "Warm, neighborly. First-person, short sentences." },
  { id: "urgent",       label: "Urgent",       blurb: "Time-sensitive but respectful. Limited window framing." },
  { id: "direct",       label: "Direct",       blurb: "Plain, no-frills. Numbers up front." },
  { id: "warm",         label: "Warm",         blurb: "Personal & human. Low-pressure invitation." },
];

const EMPTY_SENDER = { company_name: "", return_address: "", phone: "", email: "" };

export default function SendPropositionButton({ candidate, searchId }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [sender, setSender] = useState(EMPTY_SENDER);
  const [tonality, setTonality] = useState("professional");
  const [extra, setExtra] = useState("");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState(null);
  const [paying, setPaying] = useState(false);

  if (!candidate?.owner_mailing_address) return null;

  const close = () => {
    setOpen(false); setStep(0); setSender(EMPTY_SENDER);
    setTonality("professional"); setExtra(""); setBody("");
    setDrafting(false); setDraftError(null); setPaying(false);
  };

  async function handleDraft() {
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await draftHawkBotLetter({
        owner_name: candidate.owner_name,
        parcel_address: candidate.parcel_address,
        parcel_size_acres: candidate.parcel_size_acres,
        zoning_classification: candidate.zoning_classification,
        sender_company: sender.company_name,
        sender_phone: sender.phone,
        sender_email: sender.email,
        tonality,
        extra_context: extra,
      });
      const data = res.data;
      if (data?.error) {
        setDraftError(data.error);
      } else {
        setBody(data.body || "");
        setStep(3);
      }
    } catch (e) {
      setDraftError(e.message);
    } finally {
      setDrafting(false);
    }
  }

  async function handlePay() {
    if (window.self !== window.top) {
      alert("Checkout only works from the published app. Please open SiteHawk directly.");
      return;
    }
    setPaying(true);
    const res = await singlePropositionCheckout({
      owner_name: candidate.owner_name,
      mailing_address: candidate.owner_mailing_address,
      parcel_address: candidate.parcel_address,
      sender_company: sender.company_name,
      sender_address: sender.return_address,
      sender_phone: sender.phone,
      sender_email: sender.email,
      letter_body: body,
      tonality,
      search_id: searchId,
      candidate_id: candidate.id,
    });
    const data = res.data;
    if (data?.url) {
      window.location.href = data.url;
    } else {
      alert(data?.error || "Checkout failed. Please try again.");
      setPaying(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 text-xs font-semibold transition-all"
      >
        <Send className="w-3.5 h-3.5" />
        Send Proposition · {PRICE}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Progress */}
            <div className="h-1 bg-secondary">
              <div className="h-1 bg-cyan-500 transition-all duration-300" style={{ width: `${((step + 1) / 5) * 100}%` }} />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-heading font-bold text-foreground text-sm">Send Proposition Letter</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {["Recipient", "Sender Info", "Tonality", "Draft & Edit", "Pay & Send"][step]} · Step {step + 1} of 5
                </p>
              </div>
              <button onClick={close} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Step 0 — Recipient */}
              {step === 0 && (
                <>
                  <div className="rounded-xl bg-secondary border border-border px-4 py-3 space-y-1">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Mailing To</p>
                    <p className="text-sm font-semibold text-foreground">{candidate.owner_name || "Property Owner"}</p>
                    <p className="text-xs text-muted-foreground">{candidate.owner_mailing_address}</p>
                    {candidate.parcel_address && (
                      <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/60 mt-1">Re: <span className="font-semibold text-foreground">{candidate.parcel_address}</span></p>
                    )}
                  </div>
                  <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/20 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
                    You'll send <span className="font-bold text-cyan-400">one personalized letter</span> to this landlord.
                    HawkBot will draft the body in the tone you choose. Total: <span className="font-bold text-foreground">{PRICE}</span> (covers printing, Lob first-class mailing, and tax).
                  </div>
                </>
              )}

              {/* Step 1 — Sender */}
              {step === 1 && (
                <>
                  <p className="text-xs text-muted-foreground">Your branding for the letterhead and signature. Required so we can route replies to you.</p>
                  {[
                    { key: "company_name", label: "Company / Your Name", placeholder: "e.g. SkyWave Site Acquisition" },
                    { key: "return_address", label: "Return Mailing Address", placeholder: "123 Main St, City, ST 12345" },
                    { key: "phone", label: "Phone Number", placeholder: "(555) 555-5555" },
                    { key: "email", label: "Email Address", placeholder: "you@yourcompany.com" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">{label}</label>
                      <input
                        type="text"
                        value={sender[key]}
                        onChange={e => setSender(s => ({ ...s, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      />
                    </div>
                  ))}
                </>
              )}

              {/* Step 2 — Tonality */}
              {step === 2 && (
                <>
                  <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 px-4 py-3 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                    <div className="text-xs text-foreground leading-relaxed">
                      <span className="font-bold text-cyan-400">Want HawkBot to draft the letter?</span><br />
                      Choose a tonality below and HawkBot will write the body for you. You can edit before sending.
                    </div>
                  </div>
                  <div className="space-y-2">
                    {TONES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setTonality(t.id)}
                        className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all ${
                          tonality === t.id ? "border-cyan-500/60 bg-cyan-500/10" : "border-border bg-secondary hover:border-cyan-500/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-foreground">{t.label}</span>
                          <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${tonality === t.id ? "border-cyan-400" : "border-muted-foreground"}`}>
                            {tonality === t.id && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{t.blurb}</p>
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Anything HawkBot should mention? <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <textarea
                      value={extra}
                      onChange={e => setExtra(e.target.value)}
                      placeholder="e.g. We just signed a tower nearby on Highway 27 — would love to discuss similar terms."
                      rows={3}
                      className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none"
                    />
                  </div>
                  {draftError && <div className="text-xs text-red-500">{draftError}</div>}
                </>
              )}

              {/* Step 3 — Edit & preview */}
              {step === 3 && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      Drafted by HawkBot in <span className="font-bold text-cyan-400">{TONES.find(t => t.id === tonality)?.label}</span> tone. Edit anything before sending.
                    </div>
                    <button
                      onClick={handleDraft}
                      disabled={drafting}
                      className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
                    >
                      {drafting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      REDRAFT
                    </button>
                  </div>
                  <div className="rounded-xl border border-border bg-white dark:bg-card overflow-hidden">
                    <div className="px-3 py-1.5 bg-secondary border-b border-border flex items-center gap-1.5">
                      <Pencil className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] font-mono font-bold tracking-wider text-muted-foreground">LETTER BODY</span>
                    </div>
                    <textarea
                      value={body}
                      onChange={e => setBody(e.target.value)}
                      rows={14}
                      className="w-full bg-transparent px-4 py-3 text-xs text-foreground focus:outline-none resize-none leading-relaxed font-serif"
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground text-right">{body.length} chars · ~{Math.ceil(body.split(/\s+/).filter(Boolean).length)} words</div>
                </>
              )}

              {/* Step 4 — Pay & Send */}
              {step === 4 && (
                <>
                  <div className="rounded-xl border border-border bg-white dark:bg-card text-foreground p-4 text-xs space-y-3 shadow-inner max-h-72 overflow-y-auto font-serif">
                    <div className="text-[11px]">
                      {sender.company_name && <p className="font-bold">{sender.company_name}</p>}
                      {sender.return_address && <p className="text-muted-foreground">{sender.return_address}</p>}
                      {(sender.phone || sender.email) && <p className="text-muted-foreground">{[sender.phone, sender.email].filter(Boolean).join(" · ")}</p>}
                    </div>
                    <div className="border-t border-border pt-2">
                      <p className="font-bold">{candidate.owner_name || "Property Owner"}</p>
                      <p className="text-muted-foreground">{candidate.owner_mailing_address}</p>
                    </div>
                    {candidate.parcel_address && <p className="font-bold">Re: Ground Lease Opportunity — {candidate.parcel_address}</p>}
                    <p>Dear {candidate.owner_name || "Property Owner"},</p>
                    <div className="whitespace-pre-wrap leading-relaxed">{body}</div>
                    <p>Sincerely,</p>
                    <p className="font-bold">{sender.company_name || "[Your Name]"}</p>
                  </div>
                  <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/20 px-4 py-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-foreground">Total</span>
                      <span className="text-cyan-400 text-base">{PRICE}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Includes Lob first-class printing & mailing, tax, and processing. Letter is dispatched within 1 business day after payment.</p>
                  </div>
                </>
              )}
            </div>

            {/* Footer nav */}
            <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2 bg-secondary/30">
              {step > 0 ? (
                <Button variant="outline" size="sm" onClick={() => setStep(step - 1)} className="gap-1">
                  <ChevronLeft className="w-4 h-4" /> Back
                </Button>
              ) : <div />}
              {step === 0 && (
                <Button onClick={() => setStep(1)} className="gap-1 bg-cyan-600 hover:bg-cyan-700 text-white">
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              )}
              {step === 1 && (
                <Button
                  onClick={() => setStep(2)}
                  disabled={!sender.company_name || !sender.return_address}
                  className="gap-1 bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              )}
              {step === 2 && (
                <Button onClick={handleDraft} disabled={drafting} className="gap-1 bg-cyan-600 hover:bg-cyan-700 text-white">
                  {drafting ? <><Loader2 className="w-4 h-4 animate-spin" /> HawkBot drafting…</> : <><Sparkles className="w-4 h-4" /> Have HawkBot draft it</>}
                </Button>
              )}
              {step === 3 && (
                <Button onClick={() => setStep(4)} disabled={!body || body.length < 40} className="gap-1 bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50">
                  Preview & Pay <ChevronRight className="w-4 h-4" />
                </Button>
              )}
              {step === 4 && (
                <Button onClick={handlePay} disabled={paying} className="gap-2 bg-cyan-600 hover:bg-cyan-700 text-white">
                  {paying ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting…</> : <><Send className="w-4 h-4" /> Pay & Send · {PRICE}</>}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}