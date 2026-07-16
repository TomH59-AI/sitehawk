import { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Landmark, Plus, Search, Download, Upload, FileDown, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import JurisdictionEditor from "./JurisdictionEditor";
import { RESOURCE_TYPES, JURISDICTION_TYPES } from "./registryConst";
import { buildTemplateCsv, downloadCsv, exportRegistryCsv, importRegistryCsv } from "./csvRegistry";

/**
 * Jurisdiction Resource Manager — internal admin screen inside Hawk Document
 * Intelligence. Search, CRUD, verification workflow, gap-finding, CSV I/O.
 */
export default function JurisdictionResourceManager() {
  const [isAdmin, setIsAdmin] = useState(null);
  const [jurisdictions, setJurisdictions] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [missingKeyLinks, setMissingKeyLinks] = useState(false);
  const [selected, setSelected] = useState(null); // jurisdiction | 'new' | null
  const [busyCsv, setBusyCsv] = useState(false);
  const fileRef = useRef(null);

  const reload = async () => {
    setLoading(true);
    const [js, rs] = await Promise.all([
      base44.entities.JurisdictionRegistry.list("-updated_date", 1000),
      base44.entities.JurisdictionResource.list("-updated_date", 5000),
    ]);
    setJurisdictions(js);
    setResources(rs);
    setLoading(false);
  };

  useEffect(() => {
    base44.auth.me().then((u) => setIsAdmin(u?.role === "admin")).catch(() => setIsAdmin(false));
    reload();
  }, []);

  const resByJur = useMemo(() => {
    const m = {};
    for (const r of resources) (m[r.jurisdiction_id] ||= []).push(r);
    return m;
  }, [resources]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return jurisdictions.filter((j) => {
      const jr = resByJur[j.id] || [];
      if (q && ![j.name, j.state, j.county].some((f) => (f || "").toLowerCase().includes(q))
        && !jr.some((r) => (r.resource_type || "").includes(q.replace(/\s+/g, "_")))) return false;
      if (typeFilter && !jr.some((r) => r.resource_type === typeFilter && (r.url || "").trim())) return false;
      if (needsReviewOnly && !jr.some((r) => r.status === "needs_review" || r.status === "broken")) return false;
      if (missingKeyLinks) {
        const has = (t) => jr.some((r) => r.resource_type === t && (r.url || "").trim());
        if (has("wireless_telecom_ordinance") && has("permit_portal")) return false;
      }
      return true;
    });
  }, [jurisdictions, resByJur, query, typeFilter, needsReviewOnly, missingKeyLinks]);

  const handleExport = async () => {
    setBusyCsv(true);
    try { downloadCsv("jurisdiction_registry_export.csv", await exportRegistryCsv()); }
    finally { setBusyCsv(false); }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusyCsv(true);
    try {
      const result = await importRegistryCsv(await file.text());
      toast.success(`Imported: ${result.created} jurisdictions, ${result.resourcesCreated} resources, ${result.contactsCreated} contacts${result.skipped ? ` (${result.skipped} rows skipped)` : ""}`);
      await reload();
    } catch (err) {
      toast.error(err.message || "Import failed");
    } finally { setBusyCsv(false); }
  };

  const countBadge = (j) => {
    const jr = resByJur[j.id] || [];
    const verified = jr.filter((r) => r.status === "verified" && (r.url || "").trim()).length;
    const review = jr.filter((r) => r.status === "needs_review" || r.status === "broken").length;
    return { total: jr.length, verified, review };
  };

  if (isAdmin === false) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
        The Jurisdiction Resource Manager is an admin-only tool. Verified jurisdiction links still appear automatically on your SCIP pages.
      </div>
    );
  }

  if (selected) {
    return (
      <div className="bg-white rounded-xl border border-border p-5">
        <button onClick={() => { setSelected(null); reload(); }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to registry
        </button>
        <h3 className="font-heading font-bold text-lg mb-4">{selected === "new" ? "New Jurisdiction" : selected.name}</h3>
        <JurisdictionEditor
          jurisdiction={selected === "new" ? null : selected}
          onSaved={(j) => setSelected(j)}
          onDeleted={() => { setSelected(null); reload(); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center"><Landmark className="w-4.5 h-4.5 text-primary" /></div>
          <div>
            <h2 className="font-heading font-bold text-xl leading-tight">Jurisdiction Resource Manager</h2>
            <p className="text-xs text-muted-foreground">Verified zoning, telecom, and permitting links — one record serves every SCIP in that jurisdiction.</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => downloadCsv("jurisdiction_import_template.csv", buildTemplateCsv())}><FileDown className="w-3.5 h-3.5 mr-1.5" /> Template</Button>
          <Button size="sm" variant="outline" onClick={handleExport} disabled={busyCsv}><Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV</Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busyCsv}>
            {busyCsv ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />} Import CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
          <Button size="sm" onClick={() => setSelected("new")}><Plus className="w-3.5 h-3.5 mr-1.5" /> Add Jurisdiction</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, state, county, or resource type…" className="pl-9" />
        </div>
        <select className="h-9 rounded-md border border-input bg-white px-2 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Any resource type</option>
          {RESOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>Has: {t.label}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer">
          <input type="checkbox" checked={needsReviewOnly} onChange={(e) => setNeedsReviewOnly(e.target.checked)} /> Needs review
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer">
          <input type="checkbox" checked={missingKeyLinks} onChange={(e) => setMissingKeyLinks(e.target.checked)} /> Missing Telecom Code or Permit Portal
        </label>
      </div>

      {/* Registry list */}
      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : !filtered.length ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No jurisdictions match. Add one or import the CSV template to get started.
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Jurisdiction</th>
                <th className="px-3 py-2 font-semibold hidden sm:table-cell">Type</th>
                <th className="px-3 py-2 font-semibold hidden md:table-cell">County</th>
                <th className="px-3 py-2 font-semibold">Links</th>
                <th className="px-3 py-2 font-semibold">Quality</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => {
                const c = countBadge(j);
                return (
                  <tr key={j.id} onClick={() => setSelected(j)} className="border-t border-border hover:bg-primary/5 cursor-pointer">
                    <td className="px-3 py-2.5">
                      <div className="font-semibold">{j.name}</div>
                      <div className="text-[11px] text-muted-foreground">{j.state}{j.active === false ? " · inactive" : ""}</div>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell text-xs capitalize">{JURISDICTION_TYPES.find((t) => t.value === j.jurisdiction_type)?.label || j.jurisdiction_type}</td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-xs">{j.county || "—"}</td>
                    <td className="px-3 py-2.5 text-xs">{c.total}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1.5 text-[10px] font-semibold">
                        {c.verified > 0 && <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">{c.verified} verified</span>}
                        {c.review > 0 && <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">{c.review} review</span>}
                        {!c.total && <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">no links</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}