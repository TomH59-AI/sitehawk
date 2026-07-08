import HawkIcon from "../components/HawkIcon";
import BrandFooter from "../components/BrandFooter";
import PrivacyPolicyContent from "../components/legal/PrivacyPolicyContent";

// PUBLIC privacy policy page — no login required. This is the URL to submit
// in App Store Connect / createPlus as the app's privacy policy URL:
//   https://<your-published-domain>/privacy-policy
export default function PrivacyPolicyPublic() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto space-y-6 py-8 px-4">
        <div className="flex items-center gap-4">
          <HawkIcon size={48} />
          <div>
            <h1 className="font-heading font-bold text-2xl text-foreground">Privacy Policy</h1>
            <p className="text-xs text-muted-foreground">SkyWave LLC — SiteHawk Platform · Last updated: July 8, 2026</p>
          </div>
        </div>
        <PrivacyPolicyContent />
        <BrandFooter />
      </div>
    </div>
  );
}