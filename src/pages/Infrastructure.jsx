/**
 * Infrastructure — cleared. The power / fiber / overlay maps were removed
 * for a clean rebuild. This page is intentionally a placeholder until the
 * new infrastructure view is designed.
 */

import { Network } from "lucide-react";

export default function Infrastructure() {
  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500/10 via-transparent to-transparent border border-cyan-500/30">
        <div className="text-[10px] font-mono text-cyan-700 tracking-[0.3em] mb-0.5">SITEHAWK · INFRASTRUCTURE</div>
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-cyan-600" />
          <h1 className="font-heading font-bold text-xl text-foreground">
            Infrastructure View — Cleared for Rebuild
          </h1>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          The Power and Fiber overlay maps were removed. Ready to rebuild from scratch.
        </div>
      </div>
    </div>
  );
}