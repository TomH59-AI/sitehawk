import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TRACKER_GREEN } from "@/lib/hawkTracker";
import {
  TRACKER_COLUMNS, TRACKER_SHEET_EVENT, blankTrackerRow, loadTrackerRows, saveTrackerRows,
} from "@/lib/trackerSheet";

/**
 * Site Candidate Tracker — the SiteHawk template opened INSIDE the app as a
 * live editable grid. Nothing is exported or downloaded; rows stay in the
 * browser so the user can follow their sites during a meeting.
 */
export default function TrackerSheet() {
  const [rows, setRows] = useState(loadTrackerRows);

  // New sites created elsewhere on the page drop straight into this grid.
  useEffect(() => {
    const sync = () => setRows(loadTrackerRows());
    window.addEventListener(TRACKER_SHEET_EVENT, sync);
    return () => window.removeEventListener(TRACKER_SHEET_EVENT, sync);
  }, []);

  const update = (next) => { setRows(next); saveTrackerRows(next); };

  const setCell = (r, c, v) =>
    update(rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? v : cell)) : row)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading font-bold text-lg text-foreground">Site Candidate Tracker</h2>
          <p className="text-xs text-muted-foreground">
            Fill this in live during your meetings. It stays inside SiteHawk — nothing is exported.
          </p>
        </div>
        <Button size="sm" onClick={() => update([...rows, blankTrackerRow()])} style={{ background: TRACKER_GREEN }} className="font-heading font-semibold">
          <Plus className="w-4 h-4 mr-1" /> Add Row
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="min-w-full text-xs">
          <thead>
            <tr>
              {TRACKER_COLUMNS.map((c) => (
                <th key={c} className="px-2 py-2 text-left font-heading font-bold text-white whitespace-nowrap" style={{ background: TRACKER_GREEN }}>
                  {c}
                </th>
              ))}
              <th className="px-2 py-2" style={{ background: TRACKER_GREEN }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-t border-border">
                {row.map((cell, c) => (
                  <td key={c} className="p-0 border-r border-border/60">
                    <input
                      value={cell}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      className="w-40 bg-transparent px-2 py-2 text-foreground outline-none focus:bg-primary/5"
                    />
                  </td>
                ))}
                <td className="px-2 text-center">
                  <button
                    onClick={() => update(rows.filter((_, i) => i !== r))}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Delete row"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}