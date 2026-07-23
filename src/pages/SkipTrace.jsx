import { useState } from "react";
import { PhoneCall, Mail, Copy, Sparkles, RefreshCw, AlertTriangle, Building2, User, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import HawkFlightSpinner from "@/components/search/HawkFlightSpinner";
import { skipTraceCascade } from "@/functions/skipTraceCascade";

const BRAND_GREEN = "#628C83";
const BADGE_COLORS = { CyberBackgroundChecks: "#0e7490", Spokeo: "#7c3aed", WhitePages: "#b45309", TruthFinder: "#be123c" };
const badgeStyle = (s) => (!s ? { background: "#64748b" } : s.startsWith("Aggregated") ? { background: BRAND_GREEN } : { background: BADGE_COLORS[s] || "#475569" });
const copy = (val, what) => { navigator.clipboard?.writeText(val); toast.success(`${what} copied`); };

export default function SkipTrace() {
  const [ownerName, setOwnerName] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    if (!ownerName.trim()) { toast.error("Enter an owner name to trace."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await skipTraceCascade({
        owner_name: ownerName.trim(),
        mailing_address: address.trim(),
        target_label: "Manual Skip-Trace",
      });
      setResult(res?.data ?? res);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Skip-Trace failed.");
    } finally {
      setLoading(false);
    }
  };

  const phones = result?.phones || [];
  const emails = result?.emails || [];
  const isEntity = result?.is_entity_owner;
  const noHits = result && !isEntity && phones.length === 0 && emails.length === 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Hero */}
      <div className="rounded-2xl overflow-hidden border border-[#628C83]/40 shadow-sm">
        <div className="px-6 py-7 text-white relative" style={{ background: `linear-gradient(135deg, #0C1B2E 0%, ${BRAND_GREEN} 130%)` }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
              <PhoneCall className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[10px] font-mono tracking-[0.35em] opacity-70">HAWK SKIP-TRACE</div>
              <h1 className="font-heading font-bold text-2xl leading-tight">Owner Contact Finder</h1>
              <p className="text-sm text-white/80 mt-0.5">Pull every phone &amp; email for a property owner across all people-search sources.</p>
            </div>
          </div>
        </div>

        {/* Lookup form */}
        <div className="bg-card p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <User className="w-3.5 h-3.5" /> Owner Name
              </label>
              <Input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run()}
                placeholder="John Smith  or  Smith, John"
                className="h-11"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <MapPin className="w-3.5 h-3.5" /> Mailing Address <span className="opacity-60 font-normal">(improves accuracy)</span>
              </label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run()}
                placeholder="123 Main St, Tampa, FL 33601"
                className="h-11"
              />
            </div>
          </div>
          <Button onClick={run} disabled={loading} className="w-full h-11 font-semibold text-white shadow" style={{ background: BRAND_GREEN }}>
            {loading ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Searching…</> : <><Search className="w-4 h-4 mr-2" /> Run Skip-Trace</>}
          </Button>
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <HawkFlightSpinner label="Searching TruthFinder, WhitePages, Spokeo & CyberBackgroundChecks… (this can take ~60s)" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-destructive">Skip-Trace failed: {error}</div>
            <Button onClick={run} size="sm" variant="outline" className="mt-2 border-destructive/40 text-destructive hover:bg-destructive/10">
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </div>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-5">
          {isEntity && (
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-300/50 px-5 py-4 flex items-start gap-3">
              <Building2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <span className="font-semibold">Entity / business owner.</span> People-search can't match an LLC / Trust / Corp. Look up the registered agent or officers manually.
              </div>
            </div>
          )}

          {noHits && (
            <div className="rounded-2xl bg-muted px-5 py-4 text-sm text-muted-foreground text-center">
              No phones or emails found across all sources. Try adding the mailing address, or run again.
            </div>
          )}

          {/* PHONE CALL SHEET */}
          {phones.length > 0 && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                <PhoneCall className="w-4 h-4" /> Call Sheet · {phones.length} number{phones.length !== 1 ? "s" : ""} · ranked freshest first
              </div>
              <div className="divide-y divide-border">
                {phones.map((p, i) => (
                  <div key={p.phone} className={`flex items-center justify-between gap-4 px-5 py-4 ${i === 0 ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <a href={`tel:${p.phone}`} className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 hover:opacity-90" style={{ background: i === 0 ? "#059669" : BRAND_GREEN }} title="Call">
                        <PhoneCall className="w-4 h-4" />
                      </a>
                      <div className="min-w-0">
                        <a href={`tel:${p.phone}`} className="font-mono font-bold text-lg text-foreground hover:underline">{p.display}</a>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {i === 0 && <span className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded" style={{ background: "#059669" }}>BEST</span>}
                          {p.mobile && <span className="text-[9px] font-semibold text-green-600">MOBILE</span>}
                          {p.lastReported && <span className="text-[10px] text-muted-foreground">{p.lastReported}</span>}
                          {(p.sources || []).map((s) => (
                            <span key={s} className="text-[9px] font-semibold text-white px-1.5 py-0.5 rounded" style={badgeStyle(s)}>{s}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => copy(p.display, "Phone")} title="Copy" className="text-muted-foreground hover:text-foreground p-2 shrink-0">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EMAILS */}
          {emails.length > 0 && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                <Mail className="w-4 h-4" /> Emails · {emails.length}
              </div>
              <div className="divide-y divide-border">
                {emails.map((e) => (
                  <div key={e.email} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <a href={`mailto:${e.email}`} className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 hover:opacity-90" style={{ background: BRAND_GREEN }} title="Email">
                        <Mail className="w-4 h-4" />
                      </a>
                      <div className="min-w-0">
                        <a href={`mailto:${e.email}`} className="font-medium text-foreground hover:underline truncate block">{e.email}</a>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {(e.sources || []).map((s) => (
                            <span key={s} className="text-[9px] font-semibold text-white px-1.5 py-0.5 rounded" style={badgeStyle(s)}>{s}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => copy(e.email, "Email")} title="Copy" className="text-muted-foreground hover:text-foreground p-2 shrink-0">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}