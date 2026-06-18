import { Phone, Mail, Crown, Zap, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import HawkIcon from "@/components/HawkIcon";
import { useNavigate } from "react-router-dom";

export default function EnterpriseTrialExpiredScreen() {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-8 text-center">

        {/* Header */}
        <div className="flex flex-col items-center gap-3">
          <HawkIcon size={64} />
          <h1 className="font-heading font-bold text-3xl text-foreground">Your Enterprise Trial Has Ended</h1>
          <p className="text-muted-foreground text-lg max-w-md">
            Thank you for evaluating SiteHawk. To continue accessing the platform, please contact us or select a plan below.
          </p>
        </div>

        {/* Call to action — Apex */}
        <div className="rounded-2xl border-2 border-yellow-400/40 bg-yellow-400/5 p-6 space-y-3">
          <div className="flex items-center justify-center gap-2">
            <Crown className="w-6 h-6 text-yellow-400" />
            <span className="font-heading font-bold text-xl text-foreground">Hawkeye Apex — Enterprise Plan</span>
          </div>
          <p className="text-muted-foreground text-sm">Unlimited rings · Unlimited seats · Full PDF/CSV · Mailer · Skip trace · Dedicated account team</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-2">
            <a
              href="tel:+19188176197"
              className="flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-3 px-6 rounded-lg transition-colors"
            >
              <Phone className="w-4 h-4" />
              Call Tom: (918) 817-6197
            </a>
            <a
              href="mailto:tomhodges@onairs.org?subject=Hawkeye%20Apex%20Enterprise%20Plan"
              className="flex items-center justify-center gap-2 border border-yellow-400/50 text-yellow-400 hover:bg-yellow-400/10 font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              <Mail className="w-4 h-4" />
              Email Tom
            </a>
          </div>
        </div>

        {/* Or pick a self-serve plan */}
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm font-medium">— or choose a self-serve plan —</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-4 text-left space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="font-heading font-semibold text-foreground">Hawk Site</span>
                <span className="ml-auto font-bold text-foreground">$249/mo</span>
              </div>
              <p className="text-xs text-muted-foreground">15 Search Rings/month · Targets A, B & C</p>
            </div>
            <div className="rounded-xl border border-accent/40 bg-card p-4 text-left space-y-2">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-accent" />
                <span className="font-heading font-semibold text-foreground">Hawkeyes</span>
                <span className="ml-auto font-bold text-foreground">$599/mo</span>
              </div>
              <p className="text-xs text-muted-foreground">40 Search Rings/month · 3 seats · Exports</p>
            </div>
          </div>
          <Button
            className="w-full mt-2"
            onClick={() => navigate("/pricing")}
          >
            View All Plans & Subscribe
          </Button>
        </div>

      </div>
    </div>
  );
}