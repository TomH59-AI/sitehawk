import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, Radio, AlertTriangle, Lock, Loader2, ArrowLeft } from "lucide-react";
import { HL } from "./hawklawConst";

// THE CRITICAL STEP. Pick a side, acknowledge disclaimer, then lock + analyze.
// No side switch is offered anywhere after this confirms.
export default function SidePicker({ leaseName, onBack, onConfirm, analyzing }) {
  const [side, setSide] = useState(null);
  const [ack, setAck] = useState(false);

  const canConfirm = side && ack && !analyzing;

  if (analyzing) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Loader2 className="w-10 h-10 animate-spin mb-4" style={{ color: HL.blue }} />
        <p className="font-medium">HawkLaw is reviewing the lease…</p>
        <p className="text-sm text-muted-foreground mt-1">Analyzing from the {side} side. This can take a minute.</p>
      </div>
    );
  }

  const Option = ({ value, icon: Icon, title, sub }) => {
    const active = side === value;
    return (
      <button
        onClick={() => setSide(value)}
        className="flex items-start gap-3 p-5 rounded-xl border-2 text-left transition-all"
        style={{ borderColor: active ? HL.blue : "var(--border)", background: active ? "rgba(0,102,255,0.05)" : "transparent" }}
      >
        <Icon className="w-6 h-6 shrink-0" style={{ color: HL.blue }} />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{sub}</p>
        </div>
      </button>
    );
  };

  return (
    <div className="max-w-xl">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground mb-5">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <Card className="p-6" style={{ borderTop: `3px solid ${HL.blue}` }}>
        <h2 className="text-xl font-bold mb-1">Pick Your Side</h2>
        <p className="text-sm text-muted-foreground mb-5 truncate">{leaseName}</p>

        <div className="grid gap-3 mb-5">
          <Option value="landlord" icon={Building2} title="I represent the LANDLORD" sub="Property owner" />
          <Option value="carrier" icon={Radio} title="I represent the CARRIER / TENANT" sub="Wireless company" />
        </div>

        <div className="flex gap-3 p-4 rounded-lg mb-5" style={{ border: `2px solid ${HL.gold}`, background: "rgba(255,184,0,0.08)" }}>
          <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: HL.gold }} />
          <p className="text-sm">
            <strong>Choose carefully.</strong> HawkLaw will analyze this lease from <strong>ONE side only</strong>.
            Once you confirm, this lease is <strong>LOCKED</strong> to that side — you will not be able to view the
            other side's negotiation playbook for this lease. This prevents you from negotiating against yourself.
            A different lease = a new review.
          </p>
        </div>

        <label className="flex items-start gap-3 mb-6 cursor-pointer">
          <Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} className="mt-0.5" />
          <span className="text-sm text-muted-foreground">
            I understand HawkLaw provides analysis, not legal advice, and I will have a qualified attorney review before signing.
          </span>
        </label>

        <Button onClick={() => onConfirm(side)} disabled={!canConfirm}
          style={{ background: canConfirm ? HL.gold : undefined, color: canConfirm ? "#1a1a1a" : undefined }}
          className="w-full font-semibold">
          <Lock className="w-4 h-4 mr-1.5" />
          {side ? `Lock to ${side === "landlord" ? "Landlord" : "Carrier"} and Analyze` : "Select a side"}
        </Button>
      </Card>
    </div>
  );
}