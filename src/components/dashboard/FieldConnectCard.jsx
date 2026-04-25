import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { MessageCircle, Smartphone, Lock, CheckCircle2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const PAID_TIERS = ["hawk_site", "hawkeyes", "hawkeye_apex", "monthly", "annual", "pro"];

export default function FieldConnectCard({ tier }) {
  const [opened, setOpened] = useState(false);
  const isSubscriber = PAID_TIERS.includes(tier);

  const handleConnect = () => {
    const url = base44.agents.getWhatsAppConnectURL("parcel_scout");
    window.open(url, "_blank", "noopener,noreferrer");
    setOpened(true);
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="relative p-6 sm:p-7" style={{
        background: "linear-gradient(135deg, rgba(37,211,102,0.08) 0%, rgba(37,211,102,0.02) 100%)",
      }}>
        <div className="flex flex-col md:flex-row items-start gap-5">
          {/* Icon */}
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg" style={{
            background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
          }}>
            <MessageCircle className="w-7 h-7 text-white" fill="white" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <h2 className="font-heading font-bold text-lg text-foreground">Field Connect — WhatsApp</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-green-500/15 text-green-500 border border-green-500/30">
                Subscribers
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              Scout parcels straight from your phone in the field. Text site coordinates, addresses, or photos to your AI agent on WhatsApp — get instant zoning, scoring, and CRM logging.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 mb-5">
              <FeaturePill icon={<Smartphone className="w-3 h-3" />} label="Text from anywhere" />
              <FeaturePill icon={<CheckCircle2 className="w-3 h-3" />} label="Auto-logs to CRM" />
              <FeaturePill icon={<MessageCircle className="w-3 h-3" />} label="Hands-free in truck" />
            </div>

            {/* CTA */}
            {isSubscriber ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleConnect}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-heading font-bold text-sm text-white shadow-md transition-all hover:scale-[1.02]"
                  style={{ background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)" }}
                >
                  <MessageCircle className="w-4 h-4" fill="white" />
                  {opened ? "Reopen WhatsApp" : "Connect WhatsApp Now"}
                  <ArrowRight className="w-4 h-4" />
                </button>
                {opened && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-green-500 font-medium px-2">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Link opened — finish setup in WhatsApp
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 items-start">
                <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-medium border border-border">
                  <Lock className="w-4 h-4" />
                  Available on Hawk Site, Hawkeyes & Apex
                </div>
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all"
                >
                  Upgrade to unlock
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}

            {isSubscriber && (
              <p className="text-[11px] text-muted-foreground mt-3">
                You'll be redirected to WhatsApp. Send your first message to activate the connection — no extra setup needed.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturePill({ icon, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/60 border border-border text-[11px] text-foreground font-medium">
      <span className="text-green-500">{icon}</span>
      {label}
    </span>
  );
}