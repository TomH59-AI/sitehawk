import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Check, AlertTriangle, Ban, Save, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import StatusBadge from "./StatusBadge";
import { RESOURCE_TYPES, JURISDICTION_TYPES, DEPARTMENTS, SOURCE_PLATFORMS, resourceTypeLabel } from "./registryConst";

const today = () => new Date().toISOString().slice(0, 10);

// Admin editor for one jurisdiction: core fields + resources + contacts CRUD.
export default function JurisdictionEditor({ jurisdiction, onSaved, onDeleted }) {
  const isNew = !jurisdiction?.id;
  const [form, setForm] = useState({});
  const [resources, setResources] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [newRes, setNewRes] = useState(null);
  const [newContact, setNewContact] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm({
      name: jurisdiction?.name || "", state: jurisdiction?.state || "",
      county: jurisdiction?.county || "", jurisdiction_type: jurisdiction?.jurisdiction_type || "municipality",
      fips_code: jurisdiction?.fips_code || "", official_website_url: jurisdiction?.official_website_url || "",
      boundary_reference: jurisdiction?.boundary_reference || "", active: jurisdiction?.active !== false,
    });
    setNewRes(null); setNewContact(null);
    if (jurisdiction?.id) {
      base44.entities.JurisdictionResource.filter({ jurisdiction_id: jurisdiction.id }).then(setResources);
      base44.entities.JurisdictionContact.filter({ jurisdiction_id: jurisdiction.id }).then(setContacts);
    } else { setResources([]); setContacts([]); }
  }, [jurisdiction]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveJurisdiction = async () => {
    if (!form.name || !form.state) return toast.error("Name and state are required");
    setBusy(true);
    try {
      const payload = { ...form, state: form.state.toUpperCase() };
      const saved = isNew
        ? await base44.entities.JurisdictionRegistry.create(payload)
        : await base44.entities.JurisdictionRegistry.update(jurisdiction.id, payload);
      toast.success("Jurisdiction saved");
      onSaved?.(saved);
    } catch (e) { toast.error(e.message || "Save failed"); }
    finally { setBusy(false); }
  };

  const deleteJurisdiction = async () => {
    if (!window.confirm(`Delete ${jurisdiction.name} and all its resources/contacts?`)) return;
    await Promise.all(resources.map((r) => base44.entities.JurisdictionResource.delete(r.id)));
    await Promise.all(contacts.map((c) => base44.entities.JurisdictionContact.delete(c.id)));
    await base44.entities.JurisdictionRegistry.delete(jurisdiction.id);
    toast.success("Jurisdiction deleted");
    onDeleted?.();
  };

  const setResStatus = async (r, status) => {
    const patch = { status, last_checked_at: new Date().toISOString() };
    if (status === "verified") {
      if (!(r.url || "").trim()) return toast.error("Cannot verify a resource without a URL");
      patch.verified_on = today();
    }
    const upd = await base44.entities.JurisdictionResource.update(r.id, patch);
    setResources((list) => list.map((x) => (x.id === r.id ? upd : x)));
  };

  const addResource = async () => {
    if (!newRes?.resource_type) return toast.error("Pick a resource type");
    const created = await base44.entities.JurisdictionResource.create({
      jurisdiction_id: jurisdiction.id, resource_type: newRes.resource_type,
      title: newRes.title || "", url: newRes.url || "", source_platform: newRes.source_platform || "",
      notes: newRes.notes || "", status: "needs_review", active: true,
    });
    setResources((l) => [...l, created]); setNewRes(null);
  };

  const addContact = async () => {
    if (!newContact?.department) return toast.error("Pick a department");
    const created = await base44.entities.JurisdictionContact.create({
      jurisdiction_id: jurisdiction.id, department: newContact.department,
      contact_name: newContact.contact_name || "", title: newContact.title || "",
      email: newContact.email || "", phone: newContact.phone || "",
      website_url: newContact.website_url || "", notes: newContact.notes || "", active: true,
    });
    setContacts((l) => [...l, created]); setNewContact(null);
  };

  const sel = "h-9 rounded-md border border-input bg-white px-2 text-sm";

  return (
    <div className="space-y-5">
      {/* Core fields */}
      <div className="grid sm:grid-cols-2 gap-3">
        <Input placeholder="Jurisdiction name *" value={form.name || ""} onChange={(e) => set("name", e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="State (FL) *" maxLength={2} value={form.state || ""} onChange={(e) => set("state", e.target.value.toUpperCase())} />
          <Input placeholder="County" value={form.county || ""} onChange={(e) => set("county", e.target.value)} />
        </div>
        <select className={sel} value={form.jurisdiction_type} onChange={(e) => set("jurisdiction_type", e.target.value)}>
          {JURISDICTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <Input placeholder="FIPS code (optional)" value={form.fips_code || ""} onChange={(e) => set("fips_code", e.target.value)} />
        <Input placeholder="Official website URL" value={form.official_website_url || ""} onChange={(e) => set("official_website_url", e.target.value)} />
        <Input placeholder="Boundary reference (GIS URL, optional)" value={form.boundary_reference || ""} onChange={(e) => set("boundary_reference", e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={saveJurisdiction} disabled={busy}><Save className="w-4 h-4 mr-1.5" /> {isNew ? "Create Jurisdiction" : "Save Changes"}</Button>
        {!isNew && (
          <Button variant="outline" onClick={deleteJurisdiction} className="text-destructive border-destructive/40 hover:bg-destructive/10">
            <Trash2 className="w-4 h-4 mr-1.5" /> Delete
          </Button>
        )}
      </div>

      {!isNew && (
        <>
          {/* Resources */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-heading font-bold text-sm">Resource Links ({resources.length})</h4>
              <Button size="sm" variant="outline" onClick={() => setNewRes({ resource_type: "" })}><Plus className="w-3.5 h-3.5 mr-1" /> Add link</Button>
            </div>
            <div className="space-y-2">
              {resources.map((r) => (
                <div key={r.id} className="rounded-lg border border-border px-3 py-2 flex items-center gap-2 flex-wrap">
                  <div className="flex-1 min-w-[180px]">
                    <div className="text-xs font-semibold">{resourceTypeLabel(r.resource_type)}{r.title ? ` — ${r.title}` : ""}</div>
                    <div className="text-[11px] text-muted-foreground truncate max-w-md">
                      {r.url
                        ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">{r.url}<ExternalLink className="w-3 h-3" /></a>
                        : <span className="italic">No URL yet</span>}
                      {r.source_platform ? ` · ${r.source_platform}` : ""}{r.verified_on ? ` · verified ${r.verified_on}` : ""}
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                  <div className="flex gap-1">
                    <button title="Mark verified" onClick={() => setResStatus(r, "verified")} className="p-1.5 rounded-md hover:bg-emerald-100 text-emerald-700"><Check className="w-3.5 h-3.5" /></button>
                    <button title="Needs review" onClick={() => setResStatus(r, "needs_review")} className="p-1.5 rounded-md hover:bg-amber-100 text-amber-700"><AlertTriangle className="w-3.5 h-3.5" /></button>
                    <button title="Mark broken" onClick={() => setResStatus(r, "broken")} className="p-1.5 rounded-md hover:bg-red-100 text-red-700"><Ban className="w-3.5 h-3.5" /></button>
                    <button title="Delete" onClick={async () => { await base44.entities.JurisdictionResource.delete(r.id); setResources((l) => l.filter((x) => x.id !== r.id)); }} className="p-1.5 rounded-md hover:bg-red-100 text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
              {newRes && (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 grid sm:grid-cols-2 gap-2">
                  <select className={sel} value={newRes.resource_type} onChange={(e) => setNewRes({ ...newRes, resource_type: e.target.value })}>
                    <option value="">Resource type…</option>
                    {RESOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <Input placeholder="Title" value={newRes.title || ""} onChange={(e) => setNewRes({ ...newRes, title: e.target.value })} />
                  <Input placeholder="URL (leave blank if unverified)" value={newRes.url || ""} onChange={(e) => setNewRes({ ...newRes, url: e.target.value })} />
                  <select className={sel} value={newRes.source_platform || ""} onChange={(e) => setNewRes({ ...newRes, source_platform: e.target.value })}>
                    <option value="">Source platform…</option>
                    {SOURCE_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <Input placeholder="Notes" className="sm:col-span-2" value={newRes.notes || ""} onChange={(e) => setNewRes({ ...newRes, notes: e.target.value })} />
                  <div className="flex gap-2 sm:col-span-2">
                    <Button size="sm" onClick={addResource}>Add (as Needs Review)</Button>
                    <Button size="sm" variant="ghost" onClick={() => setNewRes(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Contacts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-heading font-bold text-sm">Contacts ({contacts.length})</h4>
              <Button size="sm" variant="outline" onClick={() => setNewContact({ department: "" })}><Plus className="w-3.5 h-3.5 mr-1" /> Add contact</Button>
            </div>
            <div className="space-y-2">
              {contacts.map((c) => (
                <div key={c.id} className="rounded-lg border border-border px-3 py-2 flex items-center gap-2">
                  <div className="flex-1 text-xs">
                    <span className="font-semibold capitalize">{(c.department || "").replace(/_/g, " ")}</span>
                    {c.contact_name ? ` — ${c.contact_name}` : ""}{c.title ? `, ${c.title}` : ""}
                    <span className="text-muted-foreground"> {[c.phone, c.email].filter(Boolean).join(" · ")}</span>
                  </div>
                  <button title="Delete" onClick={async () => { await base44.entities.JurisdictionContact.delete(c.id); setContacts((l) => l.filter((x) => x.id !== c.id)); }} className="p-1.5 rounded-md hover:bg-red-100 text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {newContact && (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 grid sm:grid-cols-2 gap-2">
                  <select className={sel} value={newContact.department} onChange={(e) => setNewContact({ ...newContact, department: e.target.value })}>
                    <option value="">Department…</option>
                    {DEPARTMENTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <Input placeholder="Contact name" value={newContact.contact_name || ""} onChange={(e) => setNewContact({ ...newContact, contact_name: e.target.value })} />
                  <Input placeholder="Title" value={newContact.title || ""} onChange={(e) => setNewContact({ ...newContact, title: e.target.value })} />
                  <Input placeholder="Email" value={newContact.email || ""} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
                  <Input placeholder="Phone" value={newContact.phone || ""} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
                  <Input placeholder="Website URL" value={newContact.website_url || ""} onChange={(e) => setNewContact({ ...newContact, website_url: e.target.value })} />
                  <div className="flex gap-2 sm:col-span-2">
                    <Button size="sm" onClick={addContact}>Add contact</Button>
                    <Button size="sm" variant="ghost" onClick={() => setNewContact(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}