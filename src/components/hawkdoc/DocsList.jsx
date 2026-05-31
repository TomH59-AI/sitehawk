import { base44 } from "@/api/base44Client";
import { FileText, Plus, ScanLine, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const STATUS_STYLES = {
  ready: "text-green-700 bg-green-100",
  analyzing: "text-amber-700 bg-amber-100",
  failed: "text-destructive bg-destructive/10",
  uploaded: "text-muted-foreground bg-muted",
};

// List of the user's analyzed applications.
export default function DocsList({ docs, loading, onNew, onOpen, onDeleted }) {
  async function remove(e, id) {
    e.stopPropagation();
    if (!confirm("Delete this document?")) return;
    try {
      await base44.entities.HawkDocument.delete(id);
      toast.success("Deleted.");
      onDeleted?.();
    } catch (err) {
      toast.error(err.message || "Delete failed");
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ScanLine className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-heading font-bold text-2xl leading-tight">Hawk Document Intelligence</h1>
            <p className="text-sm text-muted-foreground">Upload an application — Hawk reads it, explains every field, and fills what it can.</p>
          </div>
        </div>
        <Button onClick={onNew}><Plus className="w-4 h-4 mr-2" />New Application</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">No applications yet.</p>
          <Button onClick={onNew}><Plus className="w-4 h-4 mr-2" />Upload your first application</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((d) => {
            const filled = (d.fields || []).filter((f) => f.value && f.value.trim()).length;
            const total = (d.fields || []).length;
            return (
              <button
                key={d.id}
                onClick={() => d.status === "ready" && onOpen(d)}
                className="w-full text-left bg-card rounded-xl border border-border p-4 hover:border-primary/40 transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground truncate">{d.doc_name}</span>
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS_STYLES[d.status] || STATUS_STYLES.uploaded}`}>{d.status}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {d.doc_type || d.source_file_name}{total ? ` · ${filled}/${total} fields filled` : ""}
                  </div>
                </div>
                <Trash2 onClick={(e) => remove(e, d.id)} className="w-4 h-4 text-muted-foreground hover:text-destructive shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}