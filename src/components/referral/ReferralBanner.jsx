import { useEffect, useState } from "react";
import { referral } from "@/functions/referral";
import { Gift, Copy, Check } from "lucide-react";

// Compact, attention-grabbing dashboard banner that surfaces the user's referral
// link inline — "give 5, get 5" growth loop. Reuses the existing referral function.
export default function ReferralBanner() {
  const [code, setCode] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await referral({ action: "get_my_code" });
        setCode(res.data?.referral_code || null);
      } catch { /* non-critical */ }
    })();
  }, []);

  const url = code ? `${window.location.origin}/?ref=${code}` : null;

  const handleCopy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!url) return null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-accent/5 to-transparent p-5 flex flex-col md:flex-row md:items-center gap-4">
      <div className="flex items-center gap-3 flex-1">
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Gift className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="font-heading font-bold text-foreground">Give 3 scans, get 3 scans</p>
          <p className="text-sm text-muted-foreground">Invite a colleague — you both get 3 free scan credits when they subscribe.</p>
        </div>
      </div>
      <div className="flex items-center gap-2 w-full md:w-auto">
        <div className="flex-1 md:w-72 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono truncate">
          {url}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all shrink-0"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </div>
  );
}