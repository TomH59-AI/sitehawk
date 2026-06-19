import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Users, Copy, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// The 5 fixed demo accounts — passcodes are the passwords set during invite.
// Emails follow the pattern demo+N@sitehawk.io so they're distinct login identities.
const DEMO_SLOTS = [
  { email: "demo+1@sitehawk.io", passcode: "HAWK-DEMO-7741", slot: 1 },
  { email: "belinda.bodie@att.net", passcode: "HAWK-DEMO-3892", slot: 2, label: "Belinda Bodie" },
  { email: "walter.boyanton@crowncastle.com", passcode: "HAWK-DEMO-5514", slot: 3, label: "Walter Boyanton" },
  { email: "demo+4@sitehawk.io", passcode: "HAWK-DEMO-2267", slot: 4 },
  { email: "demo+5@sitehawk.io", passcode: "HAWK-DEMO-9930", slot: 5 },
];

export default function DemoManager() {
  const [user, setUser] = useState(null);
  const [demoUsers, setDemoUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [copiedSlot, setCopiedSlot] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    loadDemoUsers();
  }, []);

  const loadDemoUsers = async () => {
    setLoading(true);
    try {
      const emails = DEMO_SLOTS.map(s => s.email);
      // Load all demo-role users
      const all = await base44.entities.User.filter({ role: "demo" });
      setDemoUsers(Array.isArray(all) ? all : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleDisabled = async (dbUser, newDisabled) => {
    setSaving(p => ({ ...p, [dbUser.id]: true }));
    try {
      await base44.entities.User.update(dbUser.id, { demo_disabled: newDisabled });
      setDemoUsers(prev => prev.map(u => u.id === dbUser.id ? { ...u, demo_disabled: newDisabled } : u));
      toast.success(newDisabled ? `Demo slot disabled.` : `Demo slot re-enabled.`);
    } catch (e) {
      toast.error("Failed to update: " + e.message);
    } finally {
      setSaving(p => ({ ...p, [dbUser.id]: false }));
    }
  };

  const updateLabel = async (dbUser, label) => {
    setSaving(p => ({ ...p, [dbUser.id]: true }));
    try {
      await base44.entities.User.update(dbUser.id, { demo_label: label });
      setDemoUsers(prev => prev.map(u => u.id === dbUser.id ? { ...u, demo_label: label } : u));
      toast.success("Label saved.");
    } catch (e) {
      toast.error("Failed to save label.");
    } finally {
      setSaving(p => ({ ...p, [dbUser.id]: false }));
    }
  };

  const copyCredentials = (slot) => {
    const text = `SiteHawk Demo Login\nEmail: ${slot.email}\nPassword: ${slot.passcode}\nURL: ${window.location.origin}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSlot(slot.slot);
      toast.success("Credentials copied to clipboard!");
      setTimeout(() => setCopiedSlot(null), 2000);
    });
  };

  if (user && user.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-purple-500" /> Demo Account Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            5 sales demo slots — share credentials with reps, disable any slot instantly to cut off access.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadDemoUsers} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Instructions banner */}
      <div className="rounded-xl border border-purple-400/30 bg-purple-500/10 px-4 py-3 text-sm text-purple-700 dark:text-purple-300 space-y-1">
        <p className="font-semibold">How to set up a new demo slot:</p>
        <ol className="list-decimal list-inside space-y-0.5 opacity-90">
          <li>Go to <strong>Settings → Invite Users</strong> and invite the demo email with role <strong>"demo"</strong>.</li>
          <li>The invitee sets their password — share the passcode below as their initial password.</li>
          <li>Use the label field to note which sales rep is using each slot.</li>
          <li>Toggle the switch OFF instantly to disable any slot if you see misuse.</li>
        </ol>
      </div>

      <div className="space-y-3">
        {DEMO_SLOTS.map(slot => {
          const dbUser = demoUsers.find(u => u.email === slot.email);
          const isDisabled = dbUser?.demo_disabled ?? false;
          const isRegistered = !!dbUser;

          return (
            <div key={slot.slot} className={`rounded-xl border bg-card p-4 space-y-3 transition-opacity ${isDisabled ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${isDisabled ? "bg-slate-400" : "bg-purple-600"}`}>
                    {slot.slot}
                  </div>
                  <div>
                    <div className="font-semibold text-sm flex items-center gap-2">
                      Slot {slot.slot}
                      {isRegistered ? (
                        <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 text-[10px]">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Registered
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[10px]">
                          <XCircle className="w-3 h-3 mr-1" /> Not yet invited
                        </Badge>
                      )}
                      {isDisabled && <Badge className="bg-red-500/15 text-red-600 text-[10px]">DISABLED</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{slot.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Copy credentials */}
                  <Button
                    size="sm" variant="outline"
                    onClick={() => copyCredentials(slot)}
                    className="text-xs"
                  >
                    {copiedSlot === slot.slot ? (
                      <><CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-500" /> Copied!</>
                    ) : (
                      <><Copy className="w-3.5 h-3.5 mr-1" /> Copy Credentials</>
                    )}
                  </Button>

                  {/* Enable / Disable toggle */}
                  {isRegistered && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">{isDisabled ? "Disabled" : "Active"}</Label>
                      <Switch
                        checked={!isDisabled}
                        disabled={!!saving[dbUser?.id]}
                        onCheckedChange={(v) => toggleDisabled(dbUser, !v)}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Passcode display + trial status */}
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground">Passcode:</span>
                <span className="font-mono font-bold text-sm tracking-widest">{slot.passcode}</span>
              </div>
              {isRegistered && (() => {
                const started = dbUser?.demo_trial_started_at;
                if (!started) return <p className="text-xs text-muted-foreground italic">No SCIPs run yet — trial not started.</p>;
                const expiresAt = new Date(started).getTime() + 5 * 24 * 60 * 60 * 1000;
                const expired = Date.now() > expiresAt;
                const daysLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000));
                return (
                  <div className={`text-xs px-3 py-1.5 rounded-lg ${expired ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"}`}>
                    {expired
                      ? `⚠ Demo expired — started ${new Date(started).toLocaleDateString()}, ended ${new Date(expiresAt).toLocaleDateString()}`
                      : `✓ Trial active — ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left (expires ${new Date(expiresAt).toLocaleDateString()})`}
                  </div>
                );
              })()}

              {/* Label / notes for this slot */}
              {isRegistered && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Label (e.g. John Smith — Texas Region)"
                    defaultValue={dbUser?.demo_label || ""}
                    className="text-sm h-8"
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if (val !== (dbUser?.demo_label || "")) updateLabel(dbUser, val);
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Demo accounts have full Hawkeye Apex–level access. Toggling a slot off takes effect immediately on their next page load.
      </p>
    </div>
  );
}