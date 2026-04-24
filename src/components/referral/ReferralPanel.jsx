import { useEffect, useState } from "react";
import { referral } from "@/functions/referral";
import { Copy, Check, Gift, Users, Award } from "lucide-react";

export default function ReferralPanel() {
  const [code, setCode] = useState(null);
  const [stats, setStats] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [codeRes, statsRes] = await Promise.all([
        referral({ action: "get_my_code" }),
        referral({ action: "get_stats" }),
      ]);
      setCode(codeRes.data?.referral_code || null);
      setStats(statsRes.data || {});
      setLoading(false);
    }
    load();
  }, []);

  const referralUrl = code
    ? `${window.location.origin}/?ref=${code}`
    : null;

  const handleCopy = () => {
    if (!referralUrl) return;
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Gift className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-heading font-bold text-foreground text-lg">Refer & Earn</h3>
          <p className="text-sm text-muted-foreground">Share your link — you both get 5 free scan credits when they subscribe.</p>
        </div>
      </div>

      {/* Referral link */}
      <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Your Referral Link</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono truncate">
            {referralUrl || "—"}
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        {/* Quick share buttons */}
        <div className="flex gap-2 flex-wrap pt-1">
          <a
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralUrl || "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary transition-all text-foreground font-medium"
          >
            Share on LinkedIn
          </a>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("Discover cell tower site acquisition intelligence with SiteHawk 🦅 Use my link for 5 free scan credits:")}&url=${encodeURIComponent(referralUrl || "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary transition-all text-foreground font-medium"
          >
            Share on X / Twitter
          </a>
          <a
            href={`mailto:?subject=Check out SiteHawk&body=I've been using SiteHawk to find cell tower sites. Sign up with my referral link and we both get 5 free scan credits: ${referralUrl || ""}`}
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary transition-all text-foreground font-medium"
          >
            Share via Email
          </a>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <Users className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
            <div className="text-2xl font-bold font-heading text-foreground">{stats.total || 0}</div>
            <div className="text-xs text-muted-foreground">Referred</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <Award className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold font-heading text-foreground">{stats.credited || 0}</div>
            <div className="text-xs text-muted-foreground">Converted</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <Gift className="w-5 h-5 text-accent mx-auto mb-1" />
            <div className="text-2xl font-bold font-heading text-foreground">{stats.credits_earned || 0}</div>
            <div className="text-xs text-muted-foreground">Credits Earned</div>
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How it works</p>
        <ol className="space-y-1.5 text-sm text-muted-foreground list-decimal list-inside">
          <li>Share your unique referral link with colleagues</li>
          <li>They sign up using your link</li>
          <li>When they subscribe to any paid plan, you both receive <span className="text-foreground font-semibold">5 free scan credits</span></li>
        </ol>
      </div>
    </div>
  );
}