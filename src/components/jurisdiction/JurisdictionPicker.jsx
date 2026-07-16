import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Landmark } from "lucide-react";
import { searchJurisdictions } from "@/lib/jurisdictionMatch";
import { JURISDICTION_TYPES } from "./registryConst";

// Manual jurisdiction search & selection (used when auto-match is uncertain).
export default function JurisdictionPicker({ open, onOpenChange, onSelect, title = "Choose jurisdiction" }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(() => {
      searchJurisdictions(query).then(setResults).finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

  const typeLabel = (v) => JURISDICTION_TYPES.find((t) => t.value === v)?.label || v;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Landmark className="w-4 h-4" /> {title}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, state, or county…"
            className="pl-9"
          />
        </div>
        <div className="max-h-72 overflow-y-auto space-y-1">
          {loading && <p className="text-xs text-muted-foreground py-2">Searching…</p>}
          {!loading && !results.length && (
            <p className="text-xs text-muted-foreground py-2">
              No jurisdictions found. An admin can add jurisdictions in the Jurisdiction Resource Manager (Hawk Document Intelligence).
            </p>
          )}
          {results.map((j) => (
            <button
              key={j.id}
              onClick={() => { onSelect(j); onOpenChange(false); }}
              className="w-full text-left px-3 py-2 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <div className="text-sm font-semibold">{j.name}</div>
              <div className="text-xs text-muted-foreground">
                {typeLabel(j.jurisdiction_type)} · {j.county ? `${j.county} County, ` : ""}{j.state}
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}