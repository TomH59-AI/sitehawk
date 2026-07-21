import { useEffect, useState } from "react";
import { Landmark, Loader2, Pencil, Save, X } from "lucide-react";
import { getLocalAuthorities, saveLocalAuthorities } from "@/lib/localAuthorities";
import LocalAuthoritiesRows from "./LocalAuthoritiesRows";
import SiteDirectionsRow from "./SiteDirectionsRow";

// "Local Governing Authorities & Area Profile" — auto-populated from the
// pipeline's site coordinates (Target A, falling back to the SARF center).
// Shown directly above the Generate SCIP button on every site. Read-only
// against all other pipeline data; edits persist only to the LocalAuthorities
// county+state cache record.
export default function LocalAuthoritiesTable({ lat, lng }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    let cancelled = false;
    setLoading(true);
    getLocalAuthorities({ lat, lng })
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lat, lng]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const startEdit = () => {
    setDraft({
      police: { ...(data?.police || {}) },
      fire: { ...(data?.fire || {}) },
      dispatchName: data?.dispatchName || "Local Dispatch",
      nonEmergency911: data?.nonEmergency911 || "",
      census: { ...(data?.census || {}) },
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const patch = {
        police: draft.police,
        fire: draft.fire,
        dispatch_name: draft.dispatchName,
        non_emergency_911: draft.nonEmergency911 || null,
        census: { ...draft.census, population: draft.census.population ? Number(draft.census.population) : null },
      };
      const saved = await saveLocalAuthorities({
        recordId: data?.recordId, county: data?.county, state: data?.state, patch,
      });
      setData((prev) => ({
        ...prev,
        recordId: prev?.recordId || saved?.id || null,
        police: draft.police,
        fire: draft.fire,
        dispatchName: draft.dispatchName,
        nonEmergency911: draft.nonEmergency911 || null,
        census: patch.census,
      }));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-primary" />
          <h3 className="font-heading font-bold text-sm text-foreground">HawkGuard — Local Governing Authorities &amp; Area Profile</h3>
        </div>
        {data && !loading && (
          editing ? (
            <div className="flex items-center gap-1.5">
              <button onClick={saveEdit} disabled={saving} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
              </button>
              <button onClick={() => setEditing(false)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80">
                <X className="w-3 h-3" /> Cancel
              </button>
            </div>
          ) : (
            <button onClick={startEdit} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80">
              <Pencil className="w-3 h-3" /> Edit / Verify
            </button>
          )
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Resolving local authorities &amp; area profile for this site…
        </div>
      )}
      {!loading && !data && (
        <div className="px-4 py-5 text-sm text-muted-foreground">
          Could not resolve local authorities for this location — verify manually.
        </div>
      )}
      {!loading && data && (
        <LocalAuthoritiesRows data={data} editing={editing} draft={draft} setDraft={setDraft} />
      )}

      {/* Directions to the site from the busiest nearby crossroads */}
      <SiteDirectionsRow lat={lat} lng={lng} />
    </div>
  );
}