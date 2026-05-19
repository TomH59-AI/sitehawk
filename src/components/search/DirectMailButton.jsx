import { useState } from "react";
import { Mail, Loader2, X, CheckCircle, ChevronRight, ChevronLeft, Upload, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { directMailCheckout } from "@/functions/directMailCheckout";
import { base44 } from "@/api/base44Client";

const PLANS = [
  {
    id: "3_letters",
    letters: 3,
    price: "$19.99",
    label: "Starter",
    desc: "3 personalized letters mailed over 3 weeks",
    badge: null,
  },
  {
    id: "5_letters",
    letters: 5,
    price: "$29.00",
    label: "Best Results",
    desc: "5 letters with increasing urgency over 5 weeks",
    badge: "Most Popular",
  },
];

const EMPTY_SENDER = {
  company_name: "",
  return_address: "",
  phone: "",
  email: "",
  logo_url: "",
};

export default function DirectMailButton({ candidate, searchId }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0); // 0 = plan, 1 = sender info, 2 = preview
  const [selected, setSelected] = useState("5_letters");
  const [sender, setSender] = useState(EMPTY_SENDER);
  const [logoUploading, setLogoUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  const hasAddress = !!candidate?.owner_mailing_address;
  const plan = PLANS.find(p => p.id === selected);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setSender(s => ({ ...s, logo_url: file_url }));
    setLogoUploading(false);
  };

  const handleCheckout = async () => {
    if (window.self !== window.top) {
      alert("Checkout only works from the published app. Please open SiteHawk directly.");
      return;
    }
    setLoading(true);
    const res = await directMailCheckout({
      plan: selected,
      owner_name: candidate.owner_name,
      mailing_address: candidate.owner_mailing_address,
      parcel_address: candidate.parcel_address,
      search_id: searchId,
      candidate_id: candidate.id,
      sender_company: sender.company_name,
      sender_address: sender.return_address,
      sender_phone: sender.phone,
      sender_email: sender.email,
      sender_logo_url: sender.logo_url,
    });
    const data = res.data;
    if (data?.url) {
      window.location.href = data.url;
    } else {
      alert(data?.error || "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setStep(0);
    setSender(EMPTY_SENDER);
    setSelected("5_letters");
  };

  if (!hasAddress) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 text-xs font-semibold transition-all"
      >
        <Mail className="w-3.5 h-3.5" />
        Mail the Owner
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
            {/* Progress */}
            <div className="h-1 bg-secondary">
              <div className="h-1 bg-violet-500 transition-all duration-300" style={{ width: `${((step + 1) / 3) * 100}%` }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-heading font-bold text-foreground text-sm">Direct Mail Campaign</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {step === 0 ? "Choose your plan" : step === 1 ? "Your sender info (optional)" : "Letter preview"}
                </p>
              </div>
              <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── STEP 0: Plan Selection ── */}
            {step === 0 && (
              <div className="p-5 space-y-3">
                <div className="rounded-xl bg-secondary border border-border px-4 py-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Mailing To</p>
                  <p className="text-sm font-semibold text-foreground">{candidate.owner_name || "Property Owner"}</p>
                  <p className="text-xs text-muted-foreground">{candidate.owner_mailing_address}</p>
                </div>

                {PLANS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-all ${
                      selected === p.id ? "border-violet-500/60 bg-violet-500/10" : "border-border bg-secondary hover:border-violet-500/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selected === p.id ? "border-violet-400" : "border-muted-foreground"}`}>
                          {selected === p.id && <div className="w-2 h-2 rounded-full bg-violet-400" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-foreground">{p.letters} Letters</span>
                            {p.badge && <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-bold border border-violet-500/30">{p.badge}</span>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-foreground">{p.price}</span>
                    </div>
                  </button>
                ))}

                <Button onClick={() => setStep(1)} className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold">
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* ── STEP 1: Sender Info ── */}
            {step === 1 && (
              <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
                <p className="text-xs text-muted-foreground">Add your branding so the letter reflects your company. All fields are optional.</p>

                {/* Logo upload */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Company Logo</label>
                  <div className="flex items-center gap-3">
                    {sender.logo_url ? (
                      <img src={sender.logo_url} alt="Logo" className="h-10 w-auto rounded-lg border border-border object-contain bg-white" />
                    ) : (
                      <div className="h-10 w-16 rounded-lg border border-dashed border-border flex items-center justify-center bg-secondary">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-muted text-xs font-medium text-foreground transition-all">
                      {logoUploading ? <><Loader2 className="w-3 h-3 animate-spin" /> Uploading...</> : <><Upload className="w-3 h-3" /> Upload Logo</>}
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    </label>
                    {sender.logo_url && (
                      <button onClick={() => setSender(s => ({ ...s, logo_url: "" }))} className="text-xs text-destructive hover:underline">Remove</button>
                    )}
                  </div>
                </div>

                {[
                  { key: "company_name", label: "Company / Your Name", placeholder: "e.g. SkyWave LLC" },
                  { key: "return_address", label: "Return Mailing Address", placeholder: "123 Main St, City, ST 12345" },
                  { key: "phone", label: "Phone Number", placeholder: "(555) 555-5555" },
                  { key: "email", label: "Email Address", placeholder: "you@yourcompany.com" },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">{label}</label>
                    <input
                      type="text"
                      value={sender[key]}
                      onChange={e => setSender(s => ({ ...s, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                ))}

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setStep(0)} className="gap-1 flex-1">
                    <ChevronLeft className="w-4 h-4" /> Back
                  </Button>
                  <Button onClick={() => setStep(2)} className="gap-1 flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold">
                    Preview Letter <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 2: Letter Preview + Checkout ── */}
            {step === 2 && (
              <div className="p-5 space-y-4">
                {/* Simulated letter preview */}
                <div className="rounded-xl border border-border bg-white dark:bg-card text-foreground p-4 text-xs space-y-3 max-h-64 overflow-y-auto shadow-inner">
                  {sender.logo_url && (
                    <div className="flex justify-start">
                      <img src={sender.logo_url} alt="Logo" className="h-8 w-auto object-contain" />
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground space-y-0.5">
                    {sender.company_name && <p className="font-bold text-foreground">{sender.company_name}</p>}
                    {sender.return_address && <p>{sender.return_address}</p>}
                    {sender.phone && <p>{sender.phone}</p>}
                    {sender.email && <p>{sender.email}</p>}
                  </div>

                  <div className="border-t border-border pt-2 text-[10px] text-muted-foreground">
                    <p className="font-bold text-foreground">To: {candidate.owner_name || "Property Owner"}</p>
                    <p>{candidate.owner_mailing_address}</p>
                  </div>

                  <div className="pt-1 space-y-2 text-[10px] leading-relaxed text-foreground">
                    <p className="font-bold">Re: Ground Lease Opportunity — {candidate.parcel_address || "Your Property"}</p>
                    <p>Dear {candidate.owner_name || "Property Owner"},</p>
                    <p>
                      My name is {sender.company_name || "[Your Name]"} and I am reaching out regarding a potential ground lease opportunity on your property located at <strong>{candidate.parcel_address || "[Parcel Address]"}</strong>.
                    </p>
                    <p>
                      We are actively seeking suitable sites in your area to lease ground space for the installation of a wireless cell tower. Cell tower leases typically generate <strong>$1,500–$3,500+ per month</strong> in passive income for property owners, with a lease term of 25–30 years.
                    </p>
                    <p>
                      Your property has been identified as a strong candidate based on its location, size, and zoning classification. This would require a small footprint (typically 50×50 ft) and would not interfere with the primary use of your property.
                    </p>
                    <p>There is <strong>no cost to you</strong> — we handle all permitting, construction, and maintenance.</p>
                    <p>
                      If you are interested in learning more or would like to discuss this opportunity, please contact us
                      {sender.phone ? ` at <strong>${sender.phone}</strong>` : ""}
                      {sender.email ? ` or email <strong>${sender.email}</strong>` : ""}.
                      We would love to schedule a brief call at your convenience.
                    </p>
                    <p>Thank you for your time, and we look forward to hearing from you.</p>
                    <p className="font-bold">Sincerely,<br />{sender.company_name || "[Your Name/Company]"}</p>
                  </div>
                </div>

                <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-primary">What You Get</p>
                  {[
                    `${plan.letters} professionally printed & mailed letters`,
                    "Personalized cell tower ground lease template",
                    sender.company_name ? `Branded with ${sender.company_name}` : "Your branding on the letterhead",
                    "First-class USPS delivery",
                    "Spaced for maximum response rate",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <CheckCircle className="w-3 h-3 text-primary shrink-0" />
                      <span className="text-xs text-muted-foreground">{item}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(1)} className="gap-1">
                    <ChevronLeft className="w-4 h-4" /> Back
                  </Button>
                  <Button
                    onClick={handleCheckout}
                    disabled={loading}
                    className="flex-1 gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold"
                  >
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : <><Mail className="w-4 h-4" /> Launch · {plan.price}</>}
                  </Button>
                </div>
                <p className="text-center text-[10px] text-muted-foreground">Secure checkout via Stripe · Dispatched within 3 business days</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}