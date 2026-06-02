import { Users, UserCheck, UserX, AlertTriangle, CreditCard, CalendarClock, FileWarning, ArrowUpCircle } from "lucide-react";
import { isToday, parseISO } from "date-fns";
import { suggestNextActions } from "@/lib/subscriberCrm";

const days = (d) => (d ? (Date.now() - new Date(d).getTime()) / 86400000 : Infinity);

function Stat({ icon: Icon, label, value, tone = "default" }) {
  const toneClass = {
    default: "text-primary bg-primary/10",
    good: "text-emerald-600 bg-emerald-500/10",
    warn: "text-amber-600 bg-amber-500/10",
    bad: "text-red-600 bg-red-500/10",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${toneClass}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-heading font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// Admin dashboard stat row for the subscriber CRM.
export default function SubscriberStats({ contacts, tasks }) {
  const newSignups = contacts.filter((c) => days(c.signup_date) <= 7).length;
  const active = contacts.filter((c) => c.subscription_status === "active" || c.subscription_status === "trialing").length;
  const inactive = contacts.filter((c) => days(c.last_active_at) > 14).length;
  const churnRisk = contacts.filter((c) => c.churn_risk === "high").length;
  const failedPayments = contacts.filter((c) => c.subscription_status === "past_due").length;
  const dueToday = (tasks || []).filter((t) => t.status === "open" && t.due_date && isToday(parseISO(t.due_date))).length;
  const scipNotExported = contacts.filter((c) => (c.total_scips_created > 0) && !(c.total_scips_exported > 0)).length;
  const upgradeReady = contacts.filter((c) => suggestNextActions(c).some((s) => s.includes("Hawk Site") || s.includes("upgrade"))).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat icon={Users} label="New signups (7d)" value={newSignups} />
      <Stat icon={UserCheck} label="Active subscribers" value={active} tone="good" />
      <Stat icon={UserX} label="Inactive (14d+)" value={inactive} tone="warn" />
      <Stat icon={AlertTriangle} label="High churn risk" value={churnRisk} tone="bad" />
      <Stat icon={CreditCard} label="Failed payments" value={failedPayments} tone="bad" />
      <Stat icon={CalendarClock} label="Follow-ups due today" value={dueToday} tone="warn" />
      <Stat icon={FileWarning} label="SCIP not exported" value={scipNotExported} tone="warn" />
      <Stat icon={ArrowUpCircle} label="Upgrade-ready" value={upgradeReady} tone="good" />
    </div>
  );
}