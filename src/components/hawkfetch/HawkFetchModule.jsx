import { useState, useEffect } from "react";
import { Download, Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import HawkIcon from "@/components/HawkIcon";
import HawkFetchResults from "./HawkFetchResults";
import HawkPermitDocs from "./HawkPermitDocs";
import { hawkPermitDocFetch } from "@/functions/hawkPermitDocFetch";
import { US_STATES } from "./usStates";

const LOADING_LINES = [
  "HawkFetch is hunting…",
  "Scanning official government sources…",
  "Verifying application links…",
];

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    portal_url: { type: ["string", "null"] },
    portal_vendor: { type: ["string", "null"] },
    online_submission: { type: "boolean" },
    application_forms: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          form_type: { type: "string" },
        },
      },
    },
    fee_schedule_url: { type: ["string", "null"] },
    planning_dept_url: { type: ["string", "null"] },
    dept_contact: {
      type: "object",
      properties: {
        phone: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        address: { type: ["string", "null"] },
      },
    },
    confidence: { type: "string" },
    notes: { type: ["string", "null"] },
  },
};

const buildPrompt = (jurisdiction, state) =>
  `Find the official zoning and land-use permit application resources for ${jurisdiction}, ${state}, USA. Search only official government sources (the jurisdiction's own website — .gov, .us, or its official domain). Return: (1) the online permitting portal URL if the jurisdiction accepts online submissions — identify the portal vendor from the URL (accela/CitizenAccess = Accela; energov/tylerhost/selfservice = Tyler EnerGov; viewpointcloud/opengov = OpenGov; cloudpermit = Cloudpermit; etrakit = eTRAKiT; citizenserve = Citizenserve; mygovernmentonline = MyGovernmentOnline; smartgov = SmartGov; otherwise Custom); (2) direct URLs to downloadable application PDFs for: special use / special exception, conditional use, rezoning, site plan / site development, variance, and any tower/wireless/telecommunications-specific applications; (3) the fee schedule URL if available; (4) the planning/zoning department's phone, email, and address; (5) a confidence rating (high = official portal AND forms found; medium = one of the two; low = uncertain). Only return URLs you actually found on official sources — never invent or guess URLs. Return null for anything you cannot verify. For each application form set form_type to one of: Special Use, Conditional Use, Rezoning, Site Plan, Variance, Tower/Wireless, Other.`;

// HawkFetch — standalone jurisdiction permit-application finder. Self-contained:
// only touches the PermitAppCache entity and the Core InvokeLLM integration.
export default function HawkFetchModule({ onUploadCta }) {
  const [jurisdiction, setJurisdiction] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [lineIdx, setLineIdx] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { payload, last_verified, fromCache }
  // Oxylabs-sourced building + zoning permit applications for the typed jurisdiction.
  const [docsLoading, setDocsLoading] = useState(false);
  const [docs, setDocs] = useState(null);
  const [docsError, setDocsError] = useState(null);

  const fetchPermitDocs = async (j, st) => {
    setDocsLoading(true);
    setDocs(null);
    setDocsError(null);
    try {
      const res = await hawkPermitDocFetch({ jurisdiction: j, state: st });
      setDocs(res.data);
    } catch (e) {
      console.error("[HawkPermitDocs]", e);
      setDocsError("Couldn't retrieve permit applications from Oxylabs. Please try again.");
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setLineIdx((i) => (i + 1) % LOADING_LINES.length), 2500);
    return () => clearInterval(t);
  }, [loading]);

  const runFetch = async (force = false) => {
    const j = jurisdiction.trim().toLowerCase();
    if (!j || !stateCode) return;
    setLoading(true);
    setError(null);
    setResult(null);
    fetchPermitDocs(jurisdiction.trim(), stateCode);
    try {
      const rows = await base44.entities.PermitAppCache.filter({ state: stateCode, jurisdiction: j });
      const cached = rows?.[0];
      const fresh =
        cached?.last_verified &&
        Date.now() - new Date(cached.last_verified).getTime() < 90 * 24 * 60 * 60 * 1000;

      if (cached && fresh && !force) {
        setResult({ payload: cached.payload, last_verified: cached.last_verified, fromCache: true });
        return;
      }

      const payload = await base44.integrations.Core.InvokeLLM({
        prompt: buildPrompt(jurisdiction.trim(), stateCode),
        add_context_from_internet: true,
        response_json_schema: RESPONSE_SCHEMA,
      });
      const now = new Date().toISOString();
      if (cached) {
        await base44.entities.PermitAppCache.update(cached.id, { payload, last_verified: now });
      } else {
        await base44.entities.PermitAppCache.create({ state: stateCode, jurisdiction: j, payload, last_verified: now });
      }
      setResult({ payload, last_verified: now, fromCache: false });
    } catch (e) {
      console.error("[HawkFetch]", e);
      setError("HawkFetch couldn't complete the lookup. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setJurisdiction("");
    setStateCode("");
    setError(null);
    setResult(null);
    setDocs(null);
    setDocsError(null);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 md:p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-[#0C1B2E] flex items-center justify-center shrink-0">
          <HawkIcon size={28} />
        </div>
        <div>
          <h2 className="font-heading font-bold text-lg leading-tight">Find Building &amp; Zoning Permit Applications</h2>
          <p className="text-xs text-muted-foreground">Enter the jurisdiction — we retrieve the building permit and zoning permit applications, then help you fill them out.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Jurisdiction</label>
          <Input
            placeholder="e.g., Pasco County"
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runFetch()}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">State</label>
          <Select value={stateCode} onValueChange={setStateCode}>
            <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {US_STATES.map(([code, name]) => (
                <SelectItem key={code} value={code}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => runFetch()}
          disabled={loading || !jurisdiction.trim() || !stateCode}
          className="gap-2 font-heading font-semibold"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Fetch Applications
        </Button>
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          disabled={loading || docsLoading}
          className="gap-1.5 text-muted-foreground"
        >
          <X className="w-3.5 h-3.5" /> Clear
        </Button>
      </div>

      {loading && (
        <div className="mt-5 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
          <span className="text-sm font-medium text-primary">{LOADING_LINES[lineIdx]}</span>
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <HawkPermitDocs loading={docsLoading} data={docs} error={docsError} onUploadCta={onUploadCta} />

      {result && !loading && (
        <HawkFetchResults
          data={result.payload}
          lastVerified={result.last_verified}
          fromCache={result.fromCache}
          jurisdiction={jurisdiction.trim()}
          stateCode={stateCode}
          onRefetch={() => runFetch(true)}
          onUploadCta={onUploadCta}
        />
      )}
    </div>
  );
}