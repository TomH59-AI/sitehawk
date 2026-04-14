import { MapPin, User, Phone, Mail, Shield, Hash, Ruler, Building, Lightbulb, PlaneTakeoff, Radio } from "lucide-react";
import SkipTraceButton from "./SkipTraceButton";
import { Badge } from "@/components/ui/badge";
import CRMPanel from "@/components/crm/CRMPanel";

function getScoreColor(score) {
  if (score >= 80) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (score >= 60) return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  if (score >= 40) return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  return "bg-red-500/10 text-red-400 border-red-500/20";
}

function getScoreLabel(score) {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Poor";
}

export default function ResultCard({ result, rank, searchId, skipTraceResult, onSkipTraceResult }) {
  return (
    <div id={`candidate-card-${rank - 1}`} className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-all duration-300">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center justify-center px-2 py-1 rounded-lg bg-primary/10 border border-primary/20 min-w-[56px]">
            <span className="text-[9px] uppercase tracking-widest text-primary font-medium">Candidate</span>
            <span className="text-primary font-heading font-bold text-lg leading-none">{rank}</span>
          </div>
          <div>
            <h3 className="font-heading font-semibold text-foreground text-sm">{result.site_name}</h3>
            <p className="text-xs text-muted-foreground">{result.parcel_address || "Address pending"}</p>
          </div>
        </div>
        <div className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${getScoreColor(result.match_score)}`}>
          {result.match_score}% — {getScoreLabel(result.match_score)}
        </div>
      </div>

      {/* Parcel ID — prominent standalone display */}
      {result.parcel_id && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <Hash className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-xs text-muted-foreground font-medium">Parcel ID:</span>
          <span className="text-sm font-bold text-foreground tracking-wide font-mono">{result.parcel_id}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <InfoRow icon={User} label="Owner" value={result.owner_name} />
        <InfoRow icon={Ruler} label="Parcel Size" value={result.parcel_size_acres ? `${result.parcel_size_acres} acres` : null} />
        <InfoRow icon={Building} label="Zoning" value={result.zoning_classification} />
        <InfoRow icon={MapPin} label="Coordinates" value={`${result.latitude?.toFixed(5)}, ${result.longitude?.toFixed(5)}`} />
        <InfoRow icon={Shield} label="FEMA Risk" value={result.fema_risk_factor} />
        {result.airport_iata && (
          <div className="sm:col-span-2">
            <div className="flex items-start gap-2">
              <PlaneTakeoff className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-xs">
                <span className="text-muted-foreground">Nearest Airport: </span>
                <span className="font-bold text-foreground">{result.airport_iata}</span>
                <span className="text-foreground font-medium"> — {result.airport_name}</span>
                <span className="text-muted-foreground"> · {result.airport_distance_miles?.toFixed(1)} mi away</span>
                {result.airport_lat && (
                  <span className="text-muted-foreground"> · {result.airport_lat?.toFixed(5)}, {result.airport_lon?.toFixed(5)}</span>
                )}
              </div>
            </div>
          </div>
        )}
        {result.cell_towers && result.cell_towers.length > 0 && (
          <div className="sm:col-span-2">
            <div className="flex items-start gap-2">
              <Radio className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-xs">
                <span className="text-muted-foreground font-medium">Nearest Cell Towers: </span>
                <div className="mt-1 space-y-0.5">
                  {result.cell_towers.map((t, i) => (
                    <div key={i} className="text-foreground">
                      <span className="font-semibold">{t.operator}</span>
                      <span className="text-muted-foreground"> ({t.type}) · {t.distance_miles?.toFixed(1)} mi</span>
                      {t.lat && <span className="text-muted-foreground"> · {t.lat?.toFixed(5)}, {t.lon?.toFixed(5)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        <InfoRow icon={Phone} label="Phone" value={result.phone} />
        <InfoRow icon={Mail} label="Email" value={result.email} />
        {result.owner_mailing_address && (
          <div className="sm:col-span-2">
            <InfoRow icon={MapPin} label="Mailing Address" value={result.owner_mailing_address} />
          </div>
        )}
      </div>
      {result.match_reason && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
          <Lightbulb className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground"><span className="text-primary font-medium">Why this parcel: </span>{result.match_reason}</p>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <SkipTraceButton
          candidate={result}
          searchId={searchId}
          result={skipTraceResult}
          onResult={onSkipTraceResult}
        />
      </div>

      <CRMPanel result={result} searchId={searchId} />
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <span className="text-muted-foreground">{label}: </span>
        <span className="text-foreground font-medium">{value || "N/A"}</span>
      </div>
    </div>
  );
}