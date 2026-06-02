import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { User, Phone, Mail, MapPin } from "lucide-react";
import { SKYWAVE } from "@/lib/skywave";
import { CONTACT_STATUS } from "@/lib/scipCrm";

const STATUS_OPTS = Object.entries(CONTACT_STATUS);

// Per-target landlord contacts for a SCIP CRM deal.
export default function ScipCrmContacts({ contacts, onUpdate }) {
  if (!contacts?.length) {
    return <p className="text-xs italic" style={{ color: SKYWAVE.muted }}>No target owners yet — generate parcel targets first.</p>;
  }
  return (
    <div className="space-y-2">
      {contacts.map((c) => (
        <ContactRow key={c.id} contact={c} onUpdate={onUpdate} />
      ))}
    </div>
  );
}

function ContactRow({ contact, onUpdate }) {
  const [status, setStatus] = useState(contact.contact_status || "not_contacted");
  const [saving, setSaving] = useState(false);

  async function changeStatus(next) {
    setStatus(next);
    setSaving(true);
    const patch = { contact_status: next };
    if (next === "attempted" || next === "reached") patch.last_contacted = new Date().toISOString().slice(0, 10);
    const updated = await base44.entities.ScipCRMContact.update(contact.id, patch);
    await base44.entities.ScipCRMActivity.create({
      scip_crm_deal_id: contact.scip_crm_deal_id,
      scip_record_id: contact.scip_record_id,
      scip_crm_contact_id: contact.id,
      type: "note",
      summary: `${contact.target_label} (${contact.owner_name}) → ${CONTACT_STATUS[next]}`,
    });
    setSaving(false);
    onUpdate?.(updated);
  }

  return (
    <div className="rounded-lg border p-3" style={{ borderColor: SKYWAVE.line }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: SKYWAVE.blue }}>{contact.target_label}</span>
            <span className="text-sm font-semibold truncate" style={{ color: SKYWAVE.navy }}>{contact.owner_name}</span>
          </div>
          <div className="mt-1.5 space-y-0.5 text-xs" style={{ color: SKYWAVE.muted }}>
            {contact.mailing_address && <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3 shrink-0" /> {contact.mailing_address}</div>}
            {contact.phone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 shrink-0" /> {contact.phone}</div>}
            {contact.email && <div className="flex items-center gap-1.5"><Mail className="w-3 h-3 shrink-0" /> {contact.email}</div>}
            {contact.apn && <div className="flex items-center gap-1.5"><User className="w-3 h-3 shrink-0" /> APN {contact.apn}</div>}
          </div>
        </div>
        <select
          value={status}
          onChange={(e) => changeStatus(e.target.value)}
          disabled={saving}
          className="text-xs rounded-md border px-2 py-1 bg-white shrink-0"
          style={{ borderColor: SKYWAVE.line, color: SKYWAVE.navy }}
        >
          {STATUS_OPTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>
    </div>
  );
}