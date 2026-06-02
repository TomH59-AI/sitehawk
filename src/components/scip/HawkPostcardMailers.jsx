import { useState } from "react";
import { Mail, Send, MapPin, Sparkles, DollarSign, UserCheck } from "lucide-react";
import { SKYWAVE } from "@/lib/skywave";
import TargetPostcardModal from "../crm/TargetPostcardModal";

// Hawk Post Card Candidate Mailers — pulls the SCIP's parcel_targets, lets the
// user add more nearby targets, private-label with their own contact info, see
// the worked-out process & pricing, then pay & mail (handled inside the modal).
export default function HawkPostcardMailers({ record }) {
  const [open, setOpen] = useState(false);
  const targets = Array.isArray(record?.parcel_targets) ? record.parcel_targets : [];

  // Map SCIP targets to the shape TargetPostcardModal expects (id + owner/address).
  const deals = targets
    .filter((t) => t.owner_name)
    .map((t, i) => ({
      id: `scip_target_${i}`,
      owner_name: t.owner_name,
      parcel_address: t.parcel_address,
      owner_mailing_address: t.mailing_address || t.parcel_address,
      latitude: t.latitude,
      longitude: t.longitude,
    }));

  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: SKYWAVE.line }}>
      {/* Branded header */}
      <div className="flex items-center gap-3 px-5 py-3.5" style={{ background: SKYWAVE.blue }}>
        <Mail className="w-5 h-5 text-white" />
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[2px]" style={{ color: SKYWAVE.yellow }}>Direct Mail</div>
          <h3 className="font-heading font-bold text-white leading-tight">Hawk Post Card Candidate Mailers</h3>
        </div>
      </div>

      <div className="p-5 bg-card">
        <p className="text-sm text-muted-foreground mb-4">
          Mail engaging cell-tower-lease postcards to your SCIP candidate owners — privately labeled with <strong>your</strong> name, company and contact info so owners respond directly to you.
        </p>

        {/* The worked-out process */}
        <div className="grid sm:grid-cols-4 gap-3 mb-5">
          {[
            { icon: MapPin, t: "Grab Targets", d: "Pulls this SCIP's candidate parcel owners automatically." },
            { icon: Sparkles, t: "Add More", d: "Find 3 more tower-friendly owners nearby for just $1." },
            { icon: UserCheck, t: "Private Label", d: "Your contact info (and optional HawkBot letter) on every card." },
            { icon: DollarSign, t: "Pay & Mail", d: "$12 flat for up to 3 cards — paid, then mailed via Lob." },
          ].map((s, i) => (
            <div key={i} className="rounded-lg border p-3" style={{ borderColor: SKYWAVE.line }}>
              <div className="flex items-center gap-1.5 font-semibold text-sm" style={{ color: SKYWAVE.navy }}>
                <s.icon className="w-4 h-4" style={{ color: SKYWAVE.blue }} /> {s.t}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{s.d}</p>
            </div>
          ))}
        </div>

        {deals.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground text-center" style={{ borderColor: SKYWAVE.line }}>
            Generate parcel targets (Section 3) first — then your candidate owners will appear here to mail.
          </div>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-white font-bold transition-all"
            style={{ background: SKYWAVE.blue }}
          >
            <Send className="w-4 h-4" /> Mail {deals.length} Candidate{deals.length !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      {open && <TargetPostcardModal deals={deals} onClose={() => setOpen(false)} />}
    </div>
  );
}