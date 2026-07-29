/**
 * Fiber Operators — a backhaul CALL LIST, not a mapped layer.
 * Regional co-ops, municipal utilities and rural telcos that own fiber in the
 * markets where Zayo and FCC BDC go blind. Coverage/contacts are only shown
 * when a human has verified them; nothing here is inferred.
 */
import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Search, Network, Info } from "lucide-react";
import FiberOperatorRow from "@/components/fiber/FiberOperatorRow";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "cooperative", label: "Electric Co-ops" },
  { id: "municipal", label: "Municipal" },
  { id: "telco", label: "Rural Telcos" },
  { id: "regional_carrier", label: "Regional Carriers" },
  { id: "data_center", label: "Data Centers" },
];

export default function FiberOperators() {
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    base44.entities.FiberOperator.filter({ active: true }, "name", 500)
      .then(setOperators)
      .finally(() => setLoading(false));
  }, []);

  const visible = operators.filter((o) => {
    if (filter !== "all" && (o.operator_type || "unknown") !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      o.name?.toLowerCase().includes(q) ||
      (o.states_served || []).some((s) => s.toLowerCase().includes(q))
    );
  });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="flex items-center gap-2 font-heading text-2xl font-bold text-foreground">
        <Network className="h-6 w-6 text-primary" /> Fiber Operators
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Backhaul call list — regional co-ops, municipal utilities, and rural telcos that own fiber where the
        national datasets go blind. These are operators to phone, not routes on a map.
      </p>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Names and websites come from the Fiber Network Alliance public member directory. Coverage areas and
          phone numbers are intentionally blank until verified — nothing on this page is guessed.
        </span>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by operator name or state…"
          className="w-full bg-transparent text-sm focus:outline-none"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {loading ? "Loading…" : `${visible.length} of ${operators.length} operators`}
      </p>

      <div className="mt-2 space-y-2">
        {visible.map((o) => (
          <FiberOperatorRow key={o.id} operator={o} />
        ))}
        {!loading && visible.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No operators match that search.</p>
        )}
      </div>
    </div>
  );
}