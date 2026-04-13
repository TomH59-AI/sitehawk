import { MapPin, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import moment from "moment";

const statusConfig = {
  completed: { icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  pending: { icon: Loader2, color: "text-amber-400", bg: "bg-amber-500/10" },
  failed: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
};

export default function SearchHistoryTable({ searches }) {
  if (!searches || searches.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
        <p className="text-muted-foreground text-sm">No searches yet</p>
        <Link to="/search" className="text-primary text-sm font-medium hover:underline mt-1 inline-block">
          Run your first scan →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="text-left px-5 py-3 font-medium text-muted-foreground text-xs">Location</th>
              <th className="text-left px-5 py-3 font-medium text-muted-foreground text-xs">Coordinates</th>
              <th className="text-left px-5 py-3 font-medium text-muted-foreground text-xs">Results</th>
              <th className="text-left px-5 py-3 font-medium text-muted-foreground text-xs">Status</th>
              <th className="text-left px-5 py-3 font-medium text-muted-foreground text-xs">Date</th>
            </tr>
          </thead>
          <tbody>
            {searches.map((search) => {
              const status = statusConfig[search.status] || statusConfig.pending;
              const StatusIcon = status.icon;
              return (
                <tr key={search.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-4">
                    <Link to={`/search?id=${search.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                      {search.search_label || "Unnamed Search"}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground font-mono text-xs">
                    {search.latitude?.toFixed(4)}, {search.longitude?.toFixed(4)}
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-heading font-semibold text-foreground">{search.results_count || 0}</span>
                    <span className="text-muted-foreground"> parcels</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      <span className="capitalize">{search.status}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground text-xs">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {moment(search.created_date).fromNow()}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}