import { ExternalLink, FileText, Phone, Mail, MapPin, Search, Upload, RefreshCw, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const CONFIDENCE_STYLES = {
  high: "bg-green-100 text-green-800 border-green-300",
  medium: "bg-amber-100 text-amber-800 border-amber-300",
  low: "bg-red-100 text-red-700 border-red-300",
};

export default function HawkFetchResults({ data, lastVerified, fromCache, jurisdiction, stateCode, onRefetch, onUploadCta }) {
  const forms = Array.isArray(data?.application_forms) ? data.application_forms.filter((f) => f?.url) : [];
  const hasPortal = !!data?.portal_url;
  const contact = data?.dept_contact || {};
  const confidence = String(data?.confidence || "low").toLowerCase();

  // Graceful empty state — nothing verifiable found.
  if (!hasPortal && forms.length === 0) {
    return (
      <div className="mt-5 rounded-lg border border-border bg-muted/40 p-6 text-center">
        <p className="text-sm font-medium text-foreground mb-1">
          We couldn't verify official application sources for this jurisdiction yet
        </p>
        <p className="text-xs text-muted-foreground mb-4">Try a manual search on the jurisdiction's official site.</p>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() =>
            window.open(
              `https://www.google.com/search?q=${encodeURIComponent(`${jurisdiction} ${stateCode} zoning permit application`)}`,
              "_blank"
            )
          }
        >
          <Search className="w-4 h-4" /> Search Google
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-lg border border-border overflow-hidden">
      {/* Meta bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-2.5 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border capitalize ${CONFIDENCE_STYLES[confidence] || CONFIDENCE_STYLES.low}`}>
            {confidence} confidence
          </span>
          {fromCache && (
            <span className="text-[11px] text-muted-foreground">
              cached — last verified {new Date(lastVerified).toLocaleDateString()}
              <button onClick={onRefetch} className="ml-2 inline-flex items-center gap-1 text-primary font-semibold hover:underline">
                <RefreshCw className="w-3 h-3" /> Re-fetch
              </button>
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Online portal */}
        {hasPortal && (
          <div>
            <div className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground mb-2">ONLINE PORTAL</div>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="secondary" className="font-semibold">{data.portal_vendor || "Custom"}</Badge>
              <Button className="gap-2 font-heading font-semibold" onClick={() => window.open(data.portal_url, "_blank")}>
                Apply Online <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Application forms */}
        {forms.length > 0 && (
          <div>
            <div className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground mb-2">APPLICATION FORMS</div>
            <div className="space-y-2">
              {forms.map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm font-medium truncate">{f.title || "Application"}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{f.form_type || "Other"}</Badge>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => window.open(f.url, "_blank")}>
                    Open PDF <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Save the PDF, then upload it below to Hawk Intelligence.</p>
          </div>
        )}

        {/* Fee schedule */}
        {data?.fee_schedule_url && (
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="w-4 h-4 text-primary" />
            <a href={data.fee_schedule_url} target="_blank" rel="noreferrer" className="text-primary font-medium hover:underline">
              Fee Schedule
            </a>
          </div>
        )}

        {/* Department contact */}
        {(contact.phone || contact.email || contact.address) && (
          <div>
            <div className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground mb-2">PLANNING DEPARTMENT</div>
            <div className="space-y-1.5 text-sm">
              {contact.phone && <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> {contact.phone}</div>}
              {contact.email && <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-muted-foreground" /> {contact.email}</div>}
              {contact.address && <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-muted-foreground" /> {contact.address}</div>}
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
          Links retrieved from official government sources at fetch time — always verify current requirements with the jurisdiction.
        </p>

        <Button onClick={onUploadCta} variant="secondary" className="w-full gap-2 font-heading font-semibold">
          <Upload className="w-4 h-4" /> Upload to Hawk Intelligence for AI-Assisted Completion
        </Button>
      </div>
    </div>
  );
}