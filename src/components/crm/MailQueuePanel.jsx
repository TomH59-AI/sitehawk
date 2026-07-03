import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { MailCheck, MapPin, AlertCircle } from "lucide-react";

const STATUSES = ["staged", "verified", "sent", "returned", "responded", "opted_out", "dead"];
const STATUS_COLORS = {
  staged: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  verified: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  sent: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  returned: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  responded: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  opted_out: "bg-red-500/20 text-red-400 border-red-500/30",
  dead: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

// A row is "ready" for the Lob Phase 2 send when staged with a complete mailing address.
const isReady = (r) =>
  r.status === "staged" && r.owner_name && r.mail_street && r.mail_city && r.mail_state && r.mail_zip;

export default function MailQueuePanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    base44.entities.MailQueue.list("-updated_date", 200).then((data) => {
      setRows(data);
      setLoading(false);
    });
  }, []);

  const updateStatus = async (row, status) => {
    const patch = { status };
    if (status === "sent" && !row.sent_at) patch.sent_at = new Date().toISOString();
    if (status === "responded" && !row.responded_at) patch.responded_at = new Date().toISOString();
    if (status === "verified" && !row.lob_verified_at) patch.lob_verified_at = new Date().toISOString();
    const updated = await base44.entities.MailQueue.update(row.id, patch);
    setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: rows.filter((r) => r.status === s).length }), {});
  const readyCount = rows.filter(isReady).length;
  const filtered = statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter);
  // Sender ordering mirror: ring, tier A first, ladder_score desc.
  const sorted = [...filtered].sort(
    (a, b) =>
      (a.ring_id || "").localeCompare(b.ring_id || "") ||
      (a.tier || "B").localeCompare(b.tier || "B") ||
      (b.ladder_score || 0) - (a.ladder_score || 0)
  );

  return (
    <div className="space-y-4">
      {/* Ready-to-send banner */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex items-center gap-2">
        <MailCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <p className="text-xs text-foreground">
          <span className="font-bold text-emerald-400">{readyCount}</span> staged with a complete mailing
          address — ready for the Lob Phase 2 send.
        </p>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setStatusFilter("all")}
          className={`text-[10px] px-2.5 py-1 rounded-full border font-bold transition-all ${
            statusFilter === "all" ? "bg-primary/10 text-primary border-primary/30" : "border-border text-muted-foreground hover:border-primary/30"
          }`}
        >
          All ({rows.length})
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            className={`text-[10px] px-2.5 py-1 rounded-full border font-bold capitalize transition-all ${
              statusFilter === s ? STATUS_COLORS[s] + " ring-1 ring-current" : "border-border text-muted-foreground hover:border-primary/30"
            }`}
          >
            {s.replace("_", " ")} ({counts[s] || 0})
          </button>
        ))}
      </div>

      {/* Queue list */}
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <MailCheck className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">Mail queue is empty</p>
          <p className="text-xs text-muted-foreground">
            Ring candidates from target scans will stage here before the Lob mailer send.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((row) => {
            const isOpen = expanded === row.id;
            return (
              <button
                key={row.id}
                onClick={() => setExpanded(isOpen ? null : row.id)}
                className={`w-full text-left rounded-xl border p-4 transition-all ${
                  isOpen ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:border-primary/20"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                          row.tier === "A" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        Tier {row.tier}
                      </span>
                      <p className="font-heading font-semibold text-sm text-foreground truncate">
                        {row.owner_name || "Unknown owner"}
                      </p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold capitalize ${STATUS_COLORS[row.status]}`}>
                        {row.status?.replace("_", " ")}
                      </span>
                      {row.ladder_score != null && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
                          {row.ladder_score} · {row.ladder_rung || "—"}′
                        </span>
                      )}
                      {row.status === "staged" && !isReady(row) && (
                        <span className="text-[10px] text-amber-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Incomplete address
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {row.parcel_address || `APN ${row.apn_raw}, ${row.state}`} · Ring {row.ring_id}
                    </p>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-border space-y-3" onClick={(e) => e.stopPropagation()}>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                      <Detail label="Mailing address" value={[row.mail_street, row.mail_city, row.mail_state, row.mail_zip].filter(Boolean).join(", ")} />
                      <Detail label="Phone" value={row.phone} />
                      <Detail label="Email" value={row.email} />
                      <Detail label="Zoning" value={row.zoning} />
                      <Detail label="FEMA zone" value={row.fema_zone} />
                      <Detail label="Acreage" value={row.acreage != null ? `${row.acreage} ac` : null} />
                      <Detail label="Ladder source" value={row.ladder_source} />
                      <Detail label="Lob letter" value={row.lob_letter_id} />
                      <Detail label="Sent" value={row.sent_at ? format(new Date(row.sent_at), "MMM d, yyyy") : null} />
                    </div>
                    {row.notes && <p className="text-xs text-muted-foreground italic">{row.notes}</p>}
                    {/* Status changer */}
                    <div className="flex flex-wrap gap-1.5">
                      {STATUSES.map((s) => (
                        <button
                          key={s}
                          onClick={() => updateStatus(row, s)}
                          className={`text-[10px] px-2.5 py-1 rounded-full border font-bold capitalize transition-all ${
                            row.status === s ? STATUS_COLORS[s] : "border-border text-muted-foreground hover:border-primary/30"
                          }`}
                        >
                          {s.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="text-foreground font-medium">{value || "—"}</span>
    </div>
  );
}