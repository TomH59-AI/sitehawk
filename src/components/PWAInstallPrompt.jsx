import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";
import HawkIcon from "./HawkIcon";

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already installed or previously dismissed
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone ||
      localStorage.getItem("pwa-dismissed")
    ) return;

    // iOS detection (Safari doesn't fire beforeinstallprompt)
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    if (ios) {
      setIsIOS(true);
      setShowBanner(true);
      return;
    }

    // Android / Chrome
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setShowBanner(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa-dismissed", "1");
    setShowBanner(false);
    setIsDismissed(true);
  };

  if (!showBanner || isDismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="rounded-2xl border border-primary/30 bg-card shadow-2xl shadow-black/20 p-4 flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl overflow-hidden bg-[#0C1B2E] flex items-center justify-center">
          <HawkIcon size={36} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-heading font-bold text-sm text-foreground">Install SiteHawk</p>
          {isIOS ? (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Tap <span className="font-semibold text-foreground">Share</span> then{" "}
              <span className="font-semibold text-foreground">Add to Home Screen</span> for the full app experience.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Add SiteHawk to your home screen for instant access — no app store needed.
            </p>
          )}
          {!isIOS && (
            <button
              onClick={handleInstall}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              <Download className="w-3 h-3" />
              Install App
            </button>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}