import { useEffect, useState } from "react";
import { ExternalLink, Map, Radio } from "lucide-react";
import { SKYWAVE } from "@/lib/skywave";

const NATIONAL_MAP_URL = "https://apps.nationalmap.gov/viewer/";

export default function RFIntelligenceEngine() {
  const [isEditorPreview, setIsEditorPreview] = useState(null);

  useEffect(() => {
    // Base44 renders its editor preview inside a frame. The National Map sends
    // X-Frame-Options: SAMEORIGIN, so it cannot be displayed inside that frame.
    const framed = window.self !== window.top;
    setIsEditorPreview(framed);

    if (framed) return undefined;

    // On the published SiteHawk route, navigate in the same tab. This avoids
    // popup blockers and lets the user return to SiteHawk with the Back button.
    const redirect = window.setTimeout(() => {
      window.location.assign(NATIONAL_MAP_URL);
    }, 700);

    return () => window.clearTimeout(redirect);
  }, []);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <section className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div
          className="h-1.5 w-full"
          style={{ background: `linear-gradient(90deg, ${SKYWAVE.blue}, #22c55e)` }}
        />

        <div className="p-6 sm:p-8 text-center">
          <div
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${SKYWAVE.blue}18`, color: SKYWAVE.blue }}
          >
            <Radio className="h-8 w-8" />
          </div>

          <h1 className="font-heading text-3xl">RF Intelligence Engine</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
            Nationwide towers, coverage &amp; dead zones — carrier, band and technology visualization.
          </p>

          <div className="mx-auto mt-6 max-w-xl rounded-xl border border-border bg-secondary/40 p-4 text-left">
            <div className="flex gap-3">
              <Map className="mt-0.5 h-5 w-5 shrink-0" style={{ color: SKYWAVE.blue }} />
              <div>
                <p className="text-sm font-semibold">
                  {isEditorPreview === false ? "Opening The National Map…" : "Open The National Map"}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  The USGS viewer blocks in-app embedding, so SiteHawk opens the official viewer directly.
                  Use your browser&apos;s Back button to return to SiteHawk.
                </p>
              </div>
            </div>
          </div>

          <a
            href={NATIONAL_MAP_URL}
            target={isEditorPreview ? "_blank" : "_self"}
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ backgroundColor: SKYWAVE.blue }}
          >
            Open National Map
            <ExternalLink className="h-4 w-4" />
          </a>

          {isEditorPreview && (
            <p className="mt-3 text-xs text-muted-foreground">
              Editor preview detected — the viewer will open in a new tab.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}