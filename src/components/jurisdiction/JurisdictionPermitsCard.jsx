import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Landmark, AlertTriangle, Pencil, Phone, Mail, Building2 } from "lucide-react";
import { toast } from "sonner";
import { matchScipJurisdiction } from "@/lib/jurisdictionMatch";
import ResourceButtons from "./ResourceButtons";
import JurisdictionPicker from "./JurisdictionPicker";
import { DEPARTMENTS } from "./registryConst";

/**
 * "Jurisdiction & Permits" card for a SCIP record.
 * Matches the parcel to a JurisdictionRegistry record (parcel data → county
 * fallback → manual selection), persists the match on the ScipRecord, and shows
 * only real verified links — never fabricated ones. Zoning and permitting
 * jurisdictions are tracked separately.
 */
export default function JurisdictionPermitsCard({ record, onUpdate }) {
  const [jur, setJur] = useState(null);            // governing/zoning jurisdiction
  const [permitJur, setPermitJur] = useState(null); // separate permitting jurisdiction
  const [resources, setResources] = useState([]);
  const [permitResources, setPermitResources] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [matchInfo, setMatchInfo] = useState(null); // {confidence, method, countyFallback, suggestion}
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(null); // 'governing' | 'permitting' | null

  const loadJurData = async (governing, permitting) => {
    const [res, cts, pres] = await Promise.all([
      governing ? base44.entities.JurisdictionResource.filter({ jurisdiction_id: governing.id }) : [],
      governing ? base44.entities.JurisdictionContact.filter({ jurisdiction_id: governing.id }) : [],
      permitting && permitting.id !== governing?.id
        ? base44.entities.JurisdictionResource.filter({ jurisdiction_id: permitting.id })
        : [],
    ]);
    setResources(res);
    setContacts(cts.filter((c) => c.active !== false));
    setPermitResources(pres);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let governing = null, permitting = null, info = null;
        if (record.governing_jurisdiction_id) {
          governing = await base44.entities.JurisdictionRegistry.get(record.governing_jurisdiction_id).catch(() => null);
          info = {
            confidence: record.jurisdiction_match_confidence ?? 100,
            method: record.jurisdiction_match_method || "manual_selection",
            saved: true,
          };
        } else {
          const m = await matchScipJurisdiction(record);
          info = { confidence: m.confidence, method: m.method, countyFallback: m.countyFallback, suggestion: true };
          governing = m.best;
        }
        if (record.permitting_jurisdiction_id) {
          permitting = await base44.entities.JurisdictionRegistry.get(record.permitting_jurisdiction_id).catch(() => null);
        }
        if (cancelled) return;
        setJur(governing);
        setPermitJur(permitting);
        setMatchInfo(info);
        if (governing) await loadJurData(governing, permitting);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id, record.governing_jurisdiction_id, record.permitting_jurisdiction_id]);

  const saveMatch = async (j, { manual = false } = {}) => {
    const updated = await base44.entities.ScipRecord.update(record.id, {
      governing_jurisdiction_id: j.id,
      zoning_jurisdiction_id: j.id,
      jurisdiction_match_method: manual ? "manual_selection" : (matchInfo?.method || "parcel_data"),
      jurisdiction_match_confidence: manual ? 100 : (matchInfo?.confidence || 0),
      jurisdiction_review_required: manual || (matchInfo?.confidence || 0) < 80,
    });
    onUpdate?.(updated);
    toast.success(`Jurisdiction set: ${j.name}`);
  };

  const savePermitting = async (j) => {
    const updated = await base44.entities.ScipRecord.update(record.id, {
      permitting_jurisdiction_id: j.id,
      jurisdiction_review_required: true,
    });
    onUpdate?.(updated);
    toast.success(`Permitting jurisdiction set: ${j.name}`);
  };

  const confident = (matchInfo?.confidence || 0) >= 80 && jur;
  const deptLabel = (v) => DEPARTMENTS.find((d) => d.value === v)?.label || v;

  return (
    <div className="bg-white rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Landmark className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-lg leading-tight text-secondary">Jurisdiction & Permits</h3>
            <p className="text-xs text-muted-foreground">Verified zoning, telecom code, and permit resources for this site.</p>
          </div>
        </div>
        {jur && (
          <button onClick={() => setPicker("governing")} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <Pencil className="w-3 h-3" /> Change
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground mt-4">Matching jurisdiction…</p>
      ) : !jur ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">No jurisdiction match found</p>
              <p className="text-xs mt-1">
                {record.zoning_jurisdiction
                  ? <>Likely jurisdiction: <span className="font-semibold">{record.zoning_jurisdiction}</span> — not yet in the registry.</>
                  : "This site's governing jurisdiction isn't in the registry yet."}
                {record.county ? <> County fallback: <span className="font-semibold">{record.county} County, {record.state}</span>.</> : null}
              </p>
              <button onClick={() => setPicker("governing")} className="mt-2 text-xs font-semibold text-primary hover:underline">
                Search & choose jurisdiction →
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Matched jurisdiction header + quality badge */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-sm font-bold text-secondary">{jur.name}, {jur.state}</div>
              <div className="text-[11px] text-muted-foreground">
                {jur.county ? `${jur.county} County · ` : ""}
                Matched via {matchInfo?.method === "manual_selection" ? "manual selection" : matchInfo?.method === "geocoding" ? "county fallback" : "parcel data"}
                {matchInfo?.confidence != null ? ` · ${matchInfo.confidence}% confidence` : ""}
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold ${
              confident && !record.jurisdiction_review_required
                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                : "bg-amber-100 text-amber-800 border-amber-300"
            }`}>
              {confident && !record.jurisdiction_review_required ? "Verified Match" : "Needs Review"}
            </span>
          </div>

          {/* Low-confidence suggestion: confirm or change */}
          {matchInfo?.suggestion && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-amber-900">
                {confident ? "Confirm this match to save it to the SCIP." : "Low-confidence match — confirm or choose the correct jurisdiction."}
              </p>
              <div className="flex gap-2">
                <button onClick={() => saveMatch(jur)} className="text-xs font-semibold px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                  Confirm
                </button>
                <button onClick={() => setPicker("governing")} className="text-xs font-semibold px-3 py-1 rounded-md border border-amber-400 text-amber-900 hover:bg-amber-100">
                  Choose different
                </button>
              </div>
            </div>
          )}

          <ResourceButtons resources={resources} />

          {/* Separate permitting jurisdiction (e.g. county controls building permits) */}
          <div className="pt-3 border-t border-border">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-secondary">
                <Building2 className="w-3.5 h-3.5" /> Permitting jurisdiction
                {permitJur && permitJur.id !== jur.id && <span className="font-normal text-muted-foreground">— {permitJur.name}</span>}
                {!permitJur && <span className="font-normal text-muted-foreground">— same as zoning</span>}
              </div>
              <button onClick={() => setPicker("permitting")} className="text-[11px] text-primary hover:underline">
                {permitJur ? "Change" : "Set different"}
              </button>
            </div>
            {permitJur && permitJur.id !== jur.id && (
              <div className="mt-2"><ResourceButtons resources={permitResources} /></div>
            )}
          </div>

          {/* Department contacts */}
          {contacts.length > 0 && (
            <div className="pt-3 border-t border-border">
              <div className="text-xs font-semibold text-secondary mb-2">Department contacts</div>
              <div className="grid sm:grid-cols-2 gap-2">
                {contacts.map((c) => (
                  <div key={c.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                    <div className="font-semibold">{deptLabel(c.department)}{c.contact_name ? ` — ${c.contact_name}` : ""}</div>
                    {c.title && <div className="text-muted-foreground">{c.title}</div>}
                    <div className="flex flex-wrap gap-3 mt-1">
                      {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline"><Phone className="w-3 h-3" />{c.phone}</a>}
                      {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-primary hover:underline"><Mail className="w-3 h-3" />{c.email}</a>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <JurisdictionPicker
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        title={picker === "permitting" ? "Choose permitting jurisdiction" : "Choose governing jurisdiction"}
        onSelect={(j) => (picker === "permitting" ? savePermitting(j) : saveMatch(j, { manual: true }))}
      />
    </div>
  );
}