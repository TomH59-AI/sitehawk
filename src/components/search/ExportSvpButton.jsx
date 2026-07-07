import { useState } from "react";
import { FileJson, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { buildSvp } from "@/lib/svp";

/**
 * ExportSvpButton — emits the SVP v1.0 JSON from the live pipeline state.
 * Enabled once Target A is resolved. Downloads the .json and offers copy.
 */
export default function ExportSvpButton({ searchCenter, searchParams, targetA, zoningResult, sectionData }) {
  const [copied, setCopied] = useState(false);
  const ready = !!(searchCenter && targetA && Number.isFinite(Number(targetA.latitude)));

  const makeJson = () =>
    JSON.stringify(buildSvp({ searchCenter, searchParams, targetA, zoningResult, sectionData }), null, 2);

  const handleDownload = () => {
    const json = makeJson();
    const site = String(searchParams?.ring_name || "Site").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "Site";
    const label = String(targetA?.label || "Target-A").replace(/\s+/g, "-");
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${site}_${label}_SVP.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("SVP JSON downloaded.");
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(makeJson());
    setCopied(true);
    toast.success("SVP JSON copied to clipboard.");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="inline-flex rounded-lg overflow-hidden border border-border">
      <button
        onClick={handleDownload}
        disabled={!ready}
        title={ready ? "Export the Site Visualization Package (SVP v1.0) JSON" : "Complete Section 3 (Target A) first"}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-bold bg-card text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FileJson className="w-4 h-4" />
        Export SVP
      </button>
      <button
        onClick={handleCopy}
        disabled={!ready}
        title="Copy SVP JSON to clipboard"
        className="inline-flex items-center justify-center w-9 border-l border-border bg-card text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}