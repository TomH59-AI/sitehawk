/**
 * TEMPORARY DIAGNOSTIC — Static Image Sanity Check.
 * Renders a hardcoded Mapbox Static Images API URL (Milford, MI) to prove plain
 * <img> rendering works in this app. If this satellite map shows, the UI is
 * healthy and any black/empty map is a URL-generation bug, not a render bug.
 * DELETE this component (and its import in Section6Proximity) once verified.
 */
import { useEffect, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";

export default function StaticImageSanityCheck() {
  const [url, setUrl] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    loadPublicConfig().then((cfg) => {
      const t = cfg.mapboxAccessToken;
      setToken(t || null);
      if (t) {
        setUrl(`https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/-83.5978,42.5836,14,0/600x400?access_token=${t}`);
      }
    });
  }, []);

  return (
    <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
      <div className="text-xs font-mono font-bold tracking-wider text-amber-700 dark:text-amber-300">
        🔬 TEMP DIAGNOSTIC · STATIC IMAGE SANITY CHECK (Milford, MI)
      </div>
      <div className="text-[11px] font-mono text-amber-700/80 dark:text-amber-300/80 break-all">
        token: {token ? `${String(token).slice(0, 10)}…` : "NULL — no token from getPublicConfig"}
      </div>
      {url ? (
        <img src={url} alt="Milford Test" className="w-full max-w-[600px] h-auto rounded border border-amber-300" />
      ) : (
        <div className="text-sm text-amber-700">Loading token…</div>
      )}
      <div className="text-[11px] text-amber-700/70">
        If this satellite map shows, plain static images render fine — delete this panel once confirmed.
      </div>
    </div>
  );
}