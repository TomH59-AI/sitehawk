import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Scale, FileText, Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const HAWK_LAW_DISCLAIMER_HEADER = "⚖️ Hawk Law Analysis — Built on Anthropic Law (open-source from Anthropic). This output is informational only and is not legal advice. Consult a licensed attorney before executing any agreement.";

function Field({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-sm text-foreground">{String(value)}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <h3 className="font-heading font-semibold text-foreground border-b border-border pb-2">{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{children}</div>
    </div>
  );
}

const EVENT_COLORS = {
  LOI_Sent: "bg-blue-500",
  LOI_Executed: "bg-cyan-500",
  Draft_Sent: "bg-violet-500",
  Redlines_Received: "bg-amber-500",
  Counter_Sent: "bg-orange-500",
  Executed: "bg-emerald-500",
  Rent_Started: "bg-green-500",
  Option_Exercised: "bg-teal-500",
  Termination: "bg-red-500",
  Custom: "bg-slate-400",
};

export default function HawkLeaseSiteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [site, setSite] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.HawkLeaseSite.filter({ id }),
      base44.entities.HawkLeaseEvent.filter({ hawklease_site_id: id }),
    ]).then(([sArr, eArr]) => {
      setSite(Array.isArray(sArr) ? sArr[0] : sArr);
      const sorted = (Array.isArray(eArr) ? eArr : []).sort((a, b) => new Date(b.event_date) - new Date(a.event_date));
      setEvents(sorted);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>;
  if (!site) return <div className="text-sm text-muted-foreground py-12 text-center">Site not found.</div>;

  const fmt = (v) => v ? new Date(v).toLocaleDateString() : "—";
  const fmtMoney = (v) => v != null ? `$${Number(v).toLocaleString()}` : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/hawk-lease/sites")} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-xl text-foreground">{site.site_name}</h2>
          <p className="text-sm text-muted-foreground">{site.property_address}, {site.city}, {site.state} {site.zip}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to={`/hawk-law?site_id=${id}&site_name=${encodeURIComponent(site.site_name)}`}>
              <Scale className="w-4 h-4 mr-1" /> Analyze with Hawk Law
            </Link>
          </Button>
          <Button size="sm" variant="outline">
            <FileText className="w-4 h-4 mr-1" /> Generate Brief
          </Button>
        </div>
      </div>

      <Section title="Property">
        <Field label="Site Name" value={site.site_name} />
        <Field label="Address" value={site.property_address} />
        <Field label="City" value={site.city} />
        <Field label="State" value={site.state} />
        <Field label="County" value={site.county} />
        <Field label="ZIP" value={site.zip} />
        <Field label="Parcel APN" value={site.parcel_apn} />
        <Field label="FEMA Zone" value={site.fema_zone} />
        <Field label="FEMA Risk" value={site.fema_risk} />
        <Field label="Lease Type" value={site.lease_type?.replace(/_/g, " ")} />
        <Field label="Carrier" value={site.carrier} />
        <Field label="Status" value={site.status} />
      </Section>

      <Section title="Landlord">
        <Field label="Landlord Name" value={site.landlord_name} />
        <Field label="Entity Type" value={site.landlord_entity_type} />
        <Field label="Entity State" value={site.landlord_entity_state} />
        <Field label="Contact Name" value={site.landlord_contact_name} />
        <Field label="Contact Email" value={site.landlord_contact_email} />
        <Field label="Contact Phone" value={site.landlord_contact_phone} />
        <Field label="Mailing Address" value={site.landlord_mailing_address} />
      </Section>

      <Section title="Lease Terms">
        <Field label="Base Monthly Rent" value={fmtMoney(site.base_monthly_rent)} />
        <Field label="Initial Term" value={site.initial_term_years ? `${site.initial_term_years} years` : null} />
        <Field label="Renewals" value={site.renewal_count ? `${site.renewal_count} × ${site.renewal_term_years} yrs` : null} />
        <Field label="Total Potential Term" value={site.total_potential_term_years ? `${site.total_potential_term_years} years` : null} />
        <Field label="Escalation" value={site.escalation_value ? `${site.escalation_value}% ${site.escalation_frequency} (${site.escalation_type?.replace(/_/g, " ")})` : null} />
        <Field label="Revenue Share" value={site.revenue_share_type !== "none" ? `${site.revenue_share_type} — ${site.revenue_share_value}` : "None"} />
        <Field label="Due Diligence" value={site.due_diligence_months ? `${site.due_diligence_months} months` : null} />
        <Field label="DD Payment" value={fmtMoney(site.due_diligence_payment)} />
        <Field label="Additional Consideration" value={site.additional_consideration} />
      </Section>

      <Section title="Key Dates">
        <Field label="Term Commencement" value={fmt(site.term_commencement_date)} />
        <Field label="Rent Commencement" value={fmt(site.rent_commencement_date)} />
        <Field label="Lease Execution" value={fmt(site.lease_execution_date)} />
        <Field label="Lease Expiration" value={fmt(site.lease_expiration_date)} />
        <Field label="Next Option Date" value={fmt(site.next_option_date)} />
      </Section>

      <Section title="Key Clauses">
        <Field label="Exclusivity Radius" value={site.exclusivity_radius_miles ? `${site.exclusivity_radius_miles} miles` : null} />
        <Field label="ROFR Match Window" value={site.rofr_match_window_days ? `${site.rofr_match_window_days} days` : null} />
        <Field label="Non-Renewal Notice" value={site.non_renewal_notice_days ? `${site.non_renewal_notice_days} days` : null} />
        <Field label="Cure Period" value={site.cure_period_days ? `${site.cure_period_days} days` : null} />
        <Field label="Post-Install Modifications" value={site.post_install_modifications_approval ? "Approval Required" : "Not Specified"} />
      </Section>

      <Section title="Insurance">
        <Field label="CGL Per Occurrence" value={fmtMoney(site.insurance_cgl_per_occurrence)} />
        <Field label="CGL Aggregate" value={fmtMoney(site.insurance_cgl_aggregate)} />
        <Field label="Umbrella" value={fmtMoney(site.insurance_umbrella_amount)} />
      </Section>

      <Section title="Signatory & Witnesses">
        <Field label="Signatory Name" value={site.signatory_name} />
        <Field label="Signatory Title" value={site.signatory_title} />
        <Field label="Signatory Email" value={site.signatory_email} />
        <Field label="Tax ID" value={site.signatory_tax_id} />
        <Field label="Witness Names" value={site.witness_names} />
        <Field label="Witness Emails" value={site.witness_emails} />
      </Section>

      {/* Event Timeline */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4" /> Event Timeline
          </h3>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events logged yet.</p>
        ) : (
          <div className="space-y-3">
            {events.map((e, i) => (
              <div key={e.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full ${EVENT_COLORS[e.event_type] || "bg-slate-400"}`} />
                  {i < events.length - 1 && <div className="w-0.5 flex-1 bg-border mt-1" />}
                </div>
                <div className="pb-3 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground">{e.event_type?.replace(/_/g, " ")}</span>
                    <span className="text-xs text-muted-foreground">{fmt(e.event_date)}</span>
                    {e.counterparty && <span className="text-xs text-muted-foreground">· {e.counterparty}</span>}
                  </div>
                  {e.notes && <p className="text-xs text-muted-foreground mt-0.5">{e.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {site.notes && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-heading font-semibold text-foreground mb-2">Notes</h3>
          <p className="text-sm text-foreground whitespace-pre-wrap">{site.notes}</p>
        </div>
      )}
    </div>
  );
}