/**
 * EnterpriseTrialAdmin — admin-only page to grant / revoke enterprise trials.
 * Accessible only to the ADMIN_EMAIL; everyone else is redirected.
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Crown, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";

const ADMIN_EMAIL = "hodgesthomas@outlook.com";

export default function EnterpriseTrialAdmin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [searchEmail, setSearchEmail] = useState("");
  const [saving, setSaving] = useState(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    base44.auth.me().then(u => {
      if (u?.email !== ADMIN_EMAIL) { navigate("/dashboard"); return; }
      setAuthorized(true);
      loadTrialUsers();
    });
  }, []);

  const loadTrialUsers = async () => {
    setLoading(true);
    try {
      const all = await base44.entities.User.filter({ tier: "enterprise_trial" });
      setUsers(all);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const grantTrial = async () => {
    if (!searchEmail.trim()) return;
    setSaving("grant");
    try {
      const matches = await base44.entities.User.filter({ email: searchEmail.trim().toLowerCase() });
      if (!matches.length) {
        toast({ title: "User not found", description: `No user with email ${searchEmail}`, variant: "destructive" });
        setSaving(null);
        return;
      }
      const u = matches[0];
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      await base44.entities.User.update(u.id, {
        tier: "enterprise_trial",
        enterprise_trial_expires_at: expiresAt,
      });
      toast({ title: "Enterprise Trial Granted ✓", description: `${searchEmail} — expires in ${days} days` });
      setSearchEmail("");
      loadTrialUsers();
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const revokeTrial = async (user) => {
    setSaving(user.id);
    try {
      await base44.entities.User.update(user.id, {
        tier: "free",
        enterprise_trial_expires_at: null,
      });
      toast({ title: "Trial Revoked", description: `${user.email} reset to free tier.` });
      loadTrialUsers();
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const extendTrial = async (user, extraDays) => {
    setSaving(user.id + "_extend");
    try {
      const current = user.enterprise_trial_expires_at ? new Date(user.enterprise_trial_expires_at) : new Date();
      const newExpiry = new Date(Math.max(current.getTime(), Date.now()) + extraDays * 24 * 60 * 60 * 1000).toISOString();
      await base44.entities.User.update(user.id, { enterprise_trial_expires_at: newExpiry });
      toast({ title: "Trial Extended ✓", description: `${user.email} extended by ${extraDays} days.` });
      loadTrialUsers();
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  if (!authorized) return null;

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center gap-3">
        <Crown className="w-7 h-7 text-yellow-400" />
        <h1 className="font-heading font-bold text-2xl text-foreground">Enterprise Trial Manager</h1>
      </div>

      {/* Grant new trial */}
      <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/5 p-6 space-y-4">
        <h2 className="font-heading font-semibold text-foreground">Grant Enterprise Trial</h2>
        <p className="text-sm text-muted-foreground">The user must already have a SiteHawk account (invited via the dashboard).</p>
        <div className="flex gap-3 flex-wrap">
          <Input
            placeholder="user@company.com"
            value={searchEmail}
            onChange={e => setSearchEmail(e.target.value)}
            className="flex-1 min-w-[220px]"
            onKeyDown={e => e.key === "Enter" && grantTrial()}
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Duration:</span>
            <Input
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
          <Button
            onClick={grantTrial}
            disabled={saving === "grant" || !searchEmail.trim()}
            className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold"
          >
            {saving === "grant" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
            Grant Trial
          </Button>
        </div>
      </div>

      {/* Active trials */}
      <div className="space-y-3">
        <h2 className="font-heading font-semibold text-foreground">Active Enterprise Trials</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : users.length === 0 ? (
          <p className="text-muted-foreground text-sm">No active enterprise trial accounts.</p>
        ) : (
          <div className="space-y-2">
            {users.map(u => {
              const expiry = u.enterprise_trial_expires_at ? new Date(u.enterprise_trial_expires_at) : null;
              const expired = expiry && expiry < new Date();
              const daysLeft = expiry ? Math.ceil((expiry - Date.now()) / 86400000) : null;
              return (
                <div key={u.id} className="rounded-lg border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{u.email || u.full_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {expired ? (
                        <span className="flex items-center gap-1 text-xs text-red-400"><XCircle className="w-3 h-3" /> Expired {expiry?.toLocaleDateString()}</span>
                      ) : expiry ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-400"><Clock className="w-3 h-3" /> {daysLeft} day{daysLeft !== 1 ? "s" : ""} left · expires {expiry.toLocaleDateString()}</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-yellow-400"><CheckCircle2 className="w-3 h-3" /> No expiry set</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => extendTrial(u, 7)}
                      disabled={saving === u.id + "_extend"}
                    >
                      {saving === u.id + "_extend" ? <Loader2 className="w-3 h-3 animate-spin" /> : "+7 days"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => revokeTrial(u)}
                      disabled={saving === u.id}
                    >
                      {saving === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Revoke"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}