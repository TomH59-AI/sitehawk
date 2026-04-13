import { Link } from "react-router-dom";
import { FileText } from "lucide-react";

export default function Terms() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 py-4">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <FileText className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground">Terms of Service</h1>
          <p className="text-xs text-muted-foreground">SkyWave LLC — SiteHawk Platform</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-8 text-center space-y-4">
        <p className="font-heading font-semibold text-xl text-foreground">Coming Soon</p>
        <p className="text-muted-foreground text-sm">
          Our full Terms of Service are being finalized. For questions, please contact us directly.
        </p>
        <div className="pt-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">SkyWave LLC</span> — Michigan, USA
          </p>
          <a href="mailto:support@site-hawk-pro.com" className="text-primary text-sm hover:underline">
            support@site-hawk-pro.com
          </a>
        </div>
      </div>

      <div className="text-center">
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Back to Dashboard</Link>
      </div>
    </div>
  );
}