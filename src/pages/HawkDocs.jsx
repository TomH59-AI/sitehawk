import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScanLine, Scale, GitCompareArrows } from "lucide-react";
import PermitApplications from "../components/hawkdoc/PermitApplications";
import LeaseAnalysis from "../components/hawklaw/LeaseAnalysis";
import RedlineCounter from "../components/hawklaw/redline/RedlineCounter";
import HawkLawDisclaimerBanner from "../components/hawklaw/HawkLawDisclaimerBanner";

// Unified Hawk Document Intelligence hub:
//  · Permit Applications — upload zoning/permit app, AI fills, Q&A, e-sign, print
//  · Lease Analysis — single-side hard-locked telecom lease breakdown
//  · Redline Counter — original vs landlord redline, accept/reject/counter suggestions
export default function HawkDocs() {
  const [tab, setTab] = useState("permits");

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <ScanLine className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="font-heading font-bold text-2xl leading-tight">Hawk Document Intelligence</h1>
          <p className="text-sm text-muted-foreground">Permit applications, lease analysis, and redline counters — all in one place.</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="permits"><ScanLine className="w-4 h-4 mr-1.5" /> Permit Applications</TabsTrigger>
          <TabsTrigger value="lease"><Scale className="w-4 h-4 mr-1.5" /> Lease Analysis</TabsTrigger>
          <TabsTrigger value="redline"><GitCompareArrows className="w-4 h-4 mr-1.5" /> Redline Counter</TabsTrigger>
        </TabsList>

        <TabsContent value="permits"><PermitApplications /></TabsContent>

        <TabsContent value="lease">
          <HawkLawDisclaimerBanner />
          <LeaseAnalysis />
        </TabsContent>

        <TabsContent value="redline">
          <HawkLawDisclaimerBanner />
          <RedlineCounter />
        </TabsContent>
      </Tabs>
    </div>
  );
}