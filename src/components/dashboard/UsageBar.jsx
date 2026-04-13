import { Zap } from "lucide-react";

export default function UsageBar({ used, limit, tier }) {
  const isUnlimited = tier === "enterprise";
  const percentage = isUnlimited ? 0 : limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const remaining = isUnlimited ? "∞" : Math.max(limit - used, 0);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="font-heading font-semibold text-foreground text-sm">Search Credits</h3>
            <p className="text-xs text-muted-foreground capitalize">{tier} Plan</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-heading font-bold text-2xl text-foreground">{remaining}</p>
          <p className="text-xs text-muted-foreground">remaining</p>
        </div>
      </div>

      {!isUnlimited && (
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-right">
            {used} of {limit} searches used this month
          </p>
        </div>
      )}
      {isUnlimited && (
        <p className="text-xs text-muted-foreground">Unlimited searches with Enterprise plan</p>
      )}
    </div>
  );
}