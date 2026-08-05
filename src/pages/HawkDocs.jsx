import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScanLine, Map } from "lucide-react";
import PermitApplications from "../components/hawkdoc/PermitApplications";
import ZoningMapPanel from "../components/hawkdoc/ZoningMapPanel";
import HawkFetchModule from "../components/hawkfetch/HawkFetchModule";

// Unified Hawk Document Intelligence hub:
//  · Permit Applications — upload zoning/permit app, AI fills, Q&A, e-sign, print
//  · Lease Analysis — single-side hard-locked telecom lease breakdown
//  · Redline Counter — original vs landlord redline, accept/reject/counter suggestions
export default function HawkDocs() {
  const [searchParams, setSearchParams] = useSearchParams();
  // One-shot handoff from Hawk Forms (“Yes, help me fill it out”): capture once, then
  // strip the params so refresh/back doesn't re-trigger the agency fetch.
  const [formImport] = useState(() => {
    const importUrl = searchParams.get("importUrl");
    return importUrl ? { importUrl, importName: searchParams.get("importName") || "" } : null;
  });
  const [tab, setTab] = useState("permits");

  useEffect(() => {
    if (formImport) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <ScanLine className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="font-heading font-bold text-2xl leading-tight">Hawk Building and Permit Applications Assistant</h1>
          <p className="text-sm text-muted-foreground">Retrieve a jurisdiction's building and zoning permit applications, then get AI help completing them.</p>
        </div>
      </div>

      {/* HawkFetch — standalone permit-application finder. Upload CTA jumps to the Permit Applications upload flow. */}
      <HawkFetchModule
        onUploadCta={() => {
          setTab("permits");
          setTimeout(() => document.getElementById("hawkdocs-permits")?.scrollIntoView({ behavior: "smooth" }), 100);
        }}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="permits"><ScanLine className="w-4 h-4 mr-1.5" /> Zoning Application</TabsTrigger>
          <TabsTrigger value="zoning-map"><Map className="w-4 h-4 mr-1.5" /> Zoning Map</TabsTrigger>
        </TabsList>

        <TabsContent value="permits"><div id="hawkdocs-permits"><PermitApplications formImport={formImport} /></div></TabsContent>

        <TabsContent value="zoning-map">
          <ZoningMapPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}