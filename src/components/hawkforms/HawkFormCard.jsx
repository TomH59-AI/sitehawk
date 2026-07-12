import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, FileText, Info, ScanLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

export default function HawkFormCard({ item }) {
  const [askDI, setAskDI] = useState(false);
  const navigate = useNavigate();

  function openForm() {
    window.open(item.url, "_blank", "noopener,noreferrer");
    // Fillable PDF forms get the Document Intelligence offer; portals & info pages just open.
    if (item.fillable) setAskDI(true);
  }

  function goDocIntel() {
    setAskDI(false);
    navigate(
      `/hawk-docs?importUrl=${encodeURIComponent(item.url)}&importName=${encodeURIComponent(item.name)}`
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-3 hover:shadow-lg hover:border-primary/30 transition-all group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 text-primary">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-foreground leading-tight group-hover:text-primary transition-colors">
              {item.name}
            </h3>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">{item.subtitle}</p>
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px]">{item.tag}</Badge>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed flex-1">{item.purpose}</p>

      {item.url ? (
        <button
          onClick={openForm}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-heading font-bold hover:bg-primary/90 transition-colors"
        >
          Open Form <ExternalLink className="w-4 h-4" />
        </button>
      ) : (
        <div className="inline-flex items-start gap-2 px-4 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-xs font-medium">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
          <span>{item.noLinkNote}</span>
        </div>
      )}

      <AlertDialog open={askDI} onOpenChange={setAskDI}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-primary" />
              Want help filling out {item.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The form just opened in a new tab. Hawk can also load it into Document
              Intelligence — it reads every field, explains what the agency is asking for,
              and pre-fills what it can from your SCIP data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No thanks</AlertDialogCancel>
            <AlertDialogAction onClick={goDocIntel}>
              Yes, help me fill it out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}