/**
 * RenderGallery — displays the Replicate-rendered photoreal images and lets
 * the user download or open each at full resolution for landowner pitches.
 */

import { Download, ExternalLink, ImageOff } from "lucide-react";

export default function RenderGallery({ urls = [], sourceImageUrl }) {
  if (!urls || urls.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
        <ImageOff className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No renders yet. Run "Generate Visualization" once you've dropped the compound center.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sourceImageUrl && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-3 py-2 bg-muted text-[10px] font-mono tracking-wider text-muted-foreground uppercase">
              Before — Source Aerial
            </div>
            <img src={sourceImageUrl} alt="Source aerial" className="w-full h-auto block" />
          </div>
        )}
        {urls.map((url, i) => (
          <div key={i} className="rounded-xl border-2 border-emerald-500/40 bg-card overflow-hidden shadow-lg">
            <div className="px-3 py-2 bg-emerald-500/10 text-[10px] font-mono tracking-wider text-emerald-700 dark:text-emerald-300 uppercase flex items-center justify-between">
              <span>After — Render {urls.length > 1 ? `#${i + 1}` : ""}</span>
              <div className="flex items-center gap-2">
                <a
                  href={url}
                  download
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  title="Download"
                >
                  <Download className="w-3 h-3" /> Download
                </a>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-3 h-3" /> Full-res
                </a>
              </div>
            </div>
            <img src={url} alt={`Tower visualization ${i + 1}`} className="w-full h-auto block" />
          </div>
        ))}
      </div>
    </div>
  );
}