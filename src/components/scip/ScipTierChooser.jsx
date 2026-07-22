import { useState } from "react";
import { X, Loader2, Upload, FileText, Star, Crown } from "lucide-react";
import { base44 } from "@/api/base44Client";

const TIERS = [
  {
    key: "basic",
    name: "Hawk Basic",
    icon: FileText,
    features: [
      "Your site data input",
      "Aerial map",
      "Why-this-site-works narrative (AI assessment)",
      "Property information",
    ],
  },
  {
    key: "premier",
    name: "Hawk Premier",
    icon: Star,
    features: [
      "Everything in the SCIP…",
      "…except the Propagation map",
      "…except the HawkPerch map",
      "…except the Fiber Optics map",
      "…except the Compliance information",
    ],
  },
  {
    key: "enterprise",
    name: "Hawk Enterprise",
    icon: Crown,
    features: [
      "Absolutely everything, top to bottom",
      "Your company name on the document",
      "Your company logo",
      "Your company address",
    ],
  },
];

// Tier picker shown after choosing "SiteHawk SCIP". Enterprise reveals the
// company-branding fields (name, logo upload, address).
export default function ScipTierChooser({ onConfirm, onClose }) {
  const [tier, setTier] = useState("basic");
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setLogoUrl(file_url);
    } finally {
      setUploading(false);
    }
  };

  const confirm = () => {
    onConfirm({
      tier,
      branding: tier === "enterprise"
        ? { company_name: companyName.trim(), company_address: companyAddress.trim(), logo_url: logoUrl }
        : null,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl p-6" style={{ background: "#0C1B2E" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-bold text-lg text-white">Choose your SCIP package</h3>
          <button onClick={onClose} className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 text-white hover:bg-white/20">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          {TIERS.map((t) => {
            const Icon = t.icon;
            const active = tier === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTier(t.key)}
                className={`text-left rounded-xl border p-4 transition-colors ${
                  active ? "border-[#FFC72C] bg-white/10" : "border-white/15 bg-white/5 hover:bg-white/10"
                }`}
              >
                <Icon className="w-6 h-6 mb-2" style={{ color: "#FFC72C" }} />
                <div className="font-bold text-white mb-1">{t.name}</div>
                <ul className="text-[11px] text-white/70 space-y-1 list-disc pl-4">
                  {t.features.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </button>
            );
          })}
        </div>

        {tier === "enterprise" && (
          <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-4 space-y-3">
            <div className="text-sm font-bold text-white">Your company branding</div>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Company name"
              className="w-full px-3 py-2 rounded-lg bg-white/10 text-white placeholder-white/40 text-sm outline-none border border-white/15 focus:border-[#FFC72C]"
            />
            <input
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              placeholder="Company address"
              className="w-full px-3 py-2 rounded-lg bg-white/10 text-white placeholder-white/40 text-sm outline-none border border-white/15 focus:border-[#FFC72C]"
            />
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 text-white text-sm cursor-pointer hover:bg-white/20 border border-white/15">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {logoUrl ? "Logo uploaded ✓ (replace)" : uploading ? "Uploading…" : "Upload company logo"}
              <input type="file" accept="image/*" className="hidden" onChange={handleLogo} disabled={uploading} />
            </label>
            {logoUrl && <img src={logoUrl} alt="Company logo" className="h-12 rounded bg-white p-1" />}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={confirm}
            disabled={uploading}
            className="px-5 py-2.5 rounded-lg font-bold text-sm disabled:opacity-50"
            style={{ background: "#FFC72C", color: "#0C1B2E" }}
          >
            Generate {TIERS.find((t) => t.key === tier)?.name} SCIP
          </button>
        </div>
      </div>
    </div>
  );
}