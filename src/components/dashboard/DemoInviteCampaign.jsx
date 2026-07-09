/**
 * DemoInviteCampaign — ADMIN ONLY dashboard panel.
 * Invite a prospect as a 3-day demo user WITH a personal campaign letter.
 * The demo clock starts at their first login; after 3 days their access
 * shuts down and the lockout screen shows Tom's phone + email for pricing.
 */
import { useState } from "react";
import { Megaphone, Send, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inviteDemoCampaign } from "@/functions/inviteDemoCampaign";

const DEFAULT_SUBJECT = "You've Got 3 Days of Full AI Hawk Vision — On Me";

function defaultLetter(name) {
  const greet = name ? `Hi ${name},` : "Hi,";
  return `${greet}

I just gave you full VIP access to SiteHawk — the AI-powered cell tower site acquisition platform.

For the next 3 days, everything is unlocked. Run a real search ring, watch the AI scan every parcel, rank the best tower targets, pull the zoning, skip-trace the owners, and generate a carrier-ready SCIP package in minutes — work that normally takes a team weeks.

Just accept the invite in the email from Base44, log in, and hit "Start Your Journey Here."

Your access closes automatically after 3 days. When you see what AI Hawk Vision can do for your pipeline, call me directly and we'll talk pricing:

Tom Hodges
📞 248-787-1888
✉️ tomhodges@onairs.com

Enjoy the flight.
— Tom`;
}

export default function DemoInviteCampaign() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [letter, setLetter] = useState(defaultLetter(""));
  const [letterTouched, setLetterTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const handleName = (v) => {
    setName(v);
    if (!letterTouched) setLetter(defaultLetter(v.trim().split(" ")[0]));
  };

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const res = await inviteDemoCampaign({ email: email.trim(), name: name.trim(), subject, letter });
      const d = res?.data ?? res;
      setResult(d);
      if (d?.invite?.ok && d?.letter?.ok) {
        setName(""); setEmail(""); setLetterTouched(false); setLetter(defaultLetter(""));
      }
    } catch (err) {
      setResult({ ok: false, invite: { ok: false, error: err?.response?.data?.error || err.message }, letter: { ok: false } });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <div className="px-5 py-3 border-b border-amber-500/20 flex items-center gap-3">
        <Megaphone className="w-5 h-5 text-amber-600" />
        <div>
          <h2 className="font-heading font-bold text-base text-foreground leading-tight">Demo Campaign Invites</h2>
          <p className="text-xs text-muted-foreground">
            Admin only · Invitee gets 3 days of full access from first login, then auto-shutdown with your number for pricing.
          </p>
        </div>
      </div>
      <form onSubmit={send} className="p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input value={name} onChange={(e) => handleName(e.target.value)} placeholder="First name (personalizes the letter)" />
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prospect@email.com" />
        </div>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" />
        <textarea
          value={letter}
          onChange={(e) => { setLetter(e.target.value); setLetterTouched(true); }}
          rows={10}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
        />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-[11px] text-muted-foreground">
            Sends the platform invite email + this letter from you (reply-to tomhodges@onairs.com).
          </p>
          <Button type="submit" disabled={sending || !email.trim()} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Invite + Send Letter
          </Button>
        </div>
        {result && (
          <div className="space-y-1 text-xs">
            <div className={`flex items-center gap-1.5 ${result.invite?.ok ? "text-emerald-600" : "text-red-600"}`}>
              {result.invite?.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              {result.invite?.ok ? "Demo invite sent — 3-day clock starts at their first login." : `Invite failed: ${result.invite?.error || "unknown error"}`}
            </div>
            <div className={`flex items-center gap-1.5 ${result.letter?.ok ? "text-emerald-600" : "text-red-600"}`}>
              {result.letter?.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              {result.letter?.ok ? "Your campaign letter was delivered." : `Letter failed: ${result.letter?.error || "unknown error"}`}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}