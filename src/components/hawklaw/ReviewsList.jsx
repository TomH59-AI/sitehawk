import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, FileText, Plus, Scale, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { HL, SIDE_LABEL } from "./hawklawConst";

const STATUS_LABEL = {
  uploaded: "Uploaded",
  side_pending: "Side Pending",
  analyzing: "Analyzing…",
  completed: "Completed",
  failed: "Failed",
};

export default function ReviewsList({ reviews, loading, onNew, onOpen }) {
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Scale className="w-7 h-7" style={{ color: HL.blue }} />
          <div>
            <h1 className="text-2xl font-bold font-heading">HawkLaw</h1>
            <p className="text-sm text-muted-foreground">AI telecom ground-lease analyzer · one lease, one side</p>
          </div>
        </div>
        <Button onClick={onNew} style={{ background: HL.gold, color: "#1a1a1a" }} className="font-semibold">
          <Plus className="w-4 h-4 mr-1" /> New Lease Review
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin" style={{ color: HL.blue }} /></div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
          No lease reviews yet. Upload a lease to begin.
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => {
            const clickable = r.status === "completed";
            return (
              <div
                key={r.id}
                onClick={() => clickable && onOpen(r)}
                className={`flex items-center justify-between gap-4 p-4 rounded-xl border bg-card ${clickable ? "cursor-pointer hover:border-primary/40" : "opacity-80"}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-5 h-5 shrink-0" style={{ color: HL.blue }} />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.lease_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.analyzed_at ? `Analyzed ${format(new Date(r.analyzed_at), "MMM d, yyyy")}` : STATUS_LABEL[r.status] || r.status}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.side_locked_at && r.side && (
                    <Badge variant="outline" className="gap-1" style={{ borderColor: HL.blue, color: HL.blue }}>
                      <Lock className="w-3 h-3" /> {SIDE_LABEL[r.side]}
                    </Badge>
                  )}
                  <Badge variant={r.status === "completed" ? "default" : "secondary"}>
                    {STATUS_LABEL[r.status] || r.status}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}