import { Link } from "react-router-dom";
import HawkIcon from "../components/HawkIcon";
import BrandFooter from "../components/BrandFooter";
import PrivacyPolicyContent from "../components/legal/PrivacyPolicyContent";

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 py-4">
      <div className="flex items-center gap-4">
        <HawkIcon size={48} />
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground">Privacy Policy</h1>
          <p className="text-xs text-muted-foreground">SkyWave LLC — SiteHawk Platform · Last updated: July 8, 2026</p>
        </div>
      </div>

      <PrivacyPolicyContent />

      <BrandFooter />

      <div className="text-center">
        <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Back to Dashboard</Link>
      </div>
    </div>
  );
}