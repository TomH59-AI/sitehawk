import { useEffect, useState } from "react";
import { Loader2, Shield } from "lucide-react";
import { nearestPublicSafetyDept } from "@/functions/nearestPublicSafetyDept";

function DeptCard({ emoji, title, dept, note }) {
  const address = dept
    ? [dept.street_address, dept.city, dept.state, dept.zip].filter(Boolean).join(", ")
    : null;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {emoji} {title}
      </div>
      <div className="text-sm">
        <span className="text-muted-foreground">Name: </span>
        <span className="font-semibold text-foreground">{dept?.name || "—"}</span>
        {dept?.distance_mi != null && (
          <span className="text-xs text-muted-foreground"> · {dept.distance_mi} mi</span>
        )}
      </div>
      <div className="text-sm">
        <span className="text-muted-foreground">Address: </span>
        <span className="text-foreground">{address || "—"}</span>
      </div>
      <div className="text-sm">
        <span className="text-muted-foreground">Non-Emergency Phone: </span>
        {dept?.phone ? (
          <a href={`tel:${dept.phone}`} className="font-semibold text-primary hover:underline">{dept.phone}</a>
        ) : (
          <span className="text-foreground">—</span>
        )}
      </div>
      {note && <div className="text-[11px] text-muted-foreground italic">{note}</div>}
    </div>
  );
}

/**
 * PublicSafetyContacts — nearest Police + Fire department (non-emergency)
 * for Target A, from the FL/GA public-safety directory. Planning contacts
 * only — for emergencies, call 911.
 */
export default function PublicSafetyContacts({ lat, lon }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    setLoading(true);
    nearestPublicSafetyDept({ lat, lon })
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [lat, lon]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
        <Shield className="w-3.5 h-3.5" />Public Safety — Non-Emergency Contacts
      </div>
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Finding nearest departments…
        </div>
      )}
      {!loading && data && (
        <>
          {data.note && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-300/50 text-xs text-amber-800 dark:text-amber-200">
              {data.note}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <DeptCard
              emoji="🚓" title="Police / Law Enforcement" dept={data.police}
              note={data.police && !data.police.phone ? "Contact details not published in the source dataset — verify with the department." : null}
            />
            <DeptCard emoji="🚒" title="Fire Department" dept={data.fire} />
          </div>
          {data.psap && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                📟 911 Dispatch Center (PSAP) — Non-Emergency
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Name: </span>
                <span className="font-semibold text-foreground">{data.psap.name || "—"}</span>
                {data.psap.distance_mi != null && (
                  <span className="text-xs text-muted-foreground"> · {data.psap.distance_mi} mi</span>
                )}
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Address: </span>
                <span className="text-foreground">
                  {data.psap.address || [data.psap.city, data.psap.county && `${data.psap.county} County`, data.psap.state].filter(Boolean).join(", ") || "—"}
                </span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Non-Emergency Phone: </span>
                {data.psap.phone ? (
                  <a href={`tel:${data.psap.phone}`} className="font-semibold text-primary hover:underline">{data.psap.phone}</a>
                ) : (
                  <span className="text-foreground">—</span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground italic">
                FCC Master PSAP Registry — contact details verified via web lookup; confirm before filing.
              </div>
            </div>
          )}
          <div className="text-[10px] text-muted-foreground italic">
            Planning directory (FBI CDE + USFA registry) — not an emergency resource. For emergencies, call 911.
          </div>
        </>
      )}
    </div>
  );
}