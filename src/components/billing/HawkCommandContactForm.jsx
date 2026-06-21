/**
 * HawkCommandContactForm — enterprise inquiry form that emails hodgesthomas@outlook.com
 */
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Send } from "lucide-react";

export default function HawkCommandContactForm() {
  const [form, setForm] = useState({ company: "", name: "", email: "", phone: "", monthly_scips: "", use_case: "" });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await base44.integrations.Core.SendEmail({
        to: "hodgesthomas@outlook.com",
        from_name: "SiteHawk HawkCommand Inquiry",
        subject: `HawkCommand Enterprise Inquiry — ${form.company || form.name}`,
        body: `
New HawkCommand enterprise inquiry from the SiteHawk pricing page.

Company: ${form.company}
Contact: ${form.name}
Email: ${form.email}
Phone: ${form.phone || "—"}
Expected Monthly SCIPs: ${form.monthly_scips || "—"}

Use Case:
${form.use_case}
        `.trim(),
      });
      setSent(true);
    } catch (err) {
      setError(err.message || "Failed to send. Please email hodgesthomas@outlook.com directly.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <CheckCircle2 className="w-10 h-10 text-emerald-500" />
      <div className="font-semibold text-foreground">Inquiry sent!</div>
      <div className="text-sm text-muted-foreground">We'll be in touch within 1 business day.</div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Company *</label>
          <Input required value={form.company} onChange={e => set("company", e.target.value)} placeholder="Acme Tower Co." />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Your name *</label>
          <Input required value={form.name} onChange={e => set("name", e.target.value)} placeholder="Jane Smith" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Email *</label>
          <Input required type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="jane@example.com" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
          <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(555) 000-0000" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Expected SCIPs/month</label>
          <Input value={form.monthly_scips} onChange={e => set("monthly_scips", e.target.value)} placeholder="e.g. 100+" />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Use case *</label>
        <textarea
          required
          value={form.use_case}
          onChange={e => set("use_case", e.target.value)}
          rows={3}
          placeholder="Describe your team's workflow and what you need from HawkCommand..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full gap-2">
        <Send className="w-4 h-4" />
        {loading ? "Sending…" : "Send inquiry"}
      </Button>
    </form>
  );
}