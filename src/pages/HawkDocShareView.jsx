/**
 * HawkDocShareView — public read-only view of a shared Hawk application.
 * Accessed via /hawk-doc-share?id=<share_id>. No login required.
 */
import { useEffect, useState } from "react";
import { hawkDocShare } from "@/functions/hawkDocShare";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import DocPrintView from "../components/hawkdoc/DocPrintView";
import { printHawkDoc } from "@/lib/hawkDocPrint";

export default function HawkDocShareView() {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) { setError("Missing share id"); return; }
    hawkDocShare({ action: "get", share_id: id })
      .then((res) => setDoc(res?.data ?? res))
      .catch((e) => setError(e.message || "Failed to load shared application"));
  }, []);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <h1 className="font-heading font-bold text-xl text-foreground">Application unavailable</h1>
        <p className="text-muted-foreground mt-2">{error}</p>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-muted/30 min-h-screen py-6 px-4">
      <div className="max-w-3xl mx-auto mb-4 flex items-center justify-between no-print">
        <div>
          <div className="text-[10px] text-cyan-500 tracking-[0.25em] font-bold font-mono">SHARED · READ-ONLY</div>
          <h1 className="font-heading font-bold text-xl text-foreground">{doc.doc_name}</h1>
        </div>
        <Button onClick={() => printHawkDoc()} size="sm" variant="outline">
          <Printer className="w-4 h-4 mr-2" /> Print
        </Button>
      </div>
      <DocPrintView document={doc} />
    </div>
  );
}