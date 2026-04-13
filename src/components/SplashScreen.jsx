import { useEffect, useState } from "react";
import HawkIcon from "./HawkIcon";

export default function SplashScreen({ onDone }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 1700);
    const doneTimer = setTimeout(() => onDone(), 2200);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return (
    <div
      style={{ transition: "opacity 0.5s ease", opacity: fading ? 0 : 1 }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background"
    >
      <div className="text-center space-y-3">
        <div className="mb-4 animate-bounce"><HawkIcon size={120} /></div>
        <h1 className="font-heading font-bold text-5xl text-foreground tracking-tight">SiteHawk</h1>
        <p className="text-lg text-muted-foreground italic">When you need the AI vision</p>
        <p className="text-xs text-muted-foreground/50 tracking-[0.25em] uppercase mt-6">Powered by SkyWave AI</p>
      </div>
    </div>
  );
}