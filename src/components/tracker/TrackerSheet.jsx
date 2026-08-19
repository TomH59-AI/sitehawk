import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { TRACKER_GREEN } from "@/lib/hawkTracker";
import { TRACKER_SHEET_EVENT } from "@/lib/trackerSheet";
import { toast } from "sonner";

const COLUMNS = [
  ["Site Name", "site_name"],
  ["Owner's Name", "contact_name"],
  ["Parcel Address", "parcel_address"],
  ["Parcel ID", "apn"],
  ["Parcel Size (acres)", "acreage"],
  ["Zoning Classification", "zoning"],
  ["Jurisdiction", "jurisdiction"],
  ["Latitude", "latitude"],
  ["Longitude", "longitude"],
  ["FEMA Risk Factor Letter", "fema_zone"],
  ["Phone", "phone"],
  ["Email Address", "email"],
  ["Owner's Mailing Address", "mailing_address"],
];

const NUMBER_FIELDS = new Set(["acreage", "latitude", "longitude"]);

/**
 * Site Candidate Tracker — backed by the per-user FollowUpTracker entity.
 * Targets selected in Section 3 are written to that entity, so this grid and
 * the Add to Tracker action now share one durable source of truth.
 */
export default function TrackerSheet() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [savingIds, setSavingIds] = useState(() => new Set());

  const load = useCallback(async () => {
    try {
      const records = await base44.entities.FollowUpTracker.list("-created_date", 500);
      setRows(records);
    } catch (error) {
      console.error(error);
      toast.error("Could not load your tracker sites.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(TRACKER_SHEET_EVENT, load);
    return () => window.removeEventListener(TRACKER_SHEET_EVENT, load);
  }, [load]);

  const setCell = (rowIndex, field, value) => {
    setRows((current) => current.map((row, index) => (
      index === rowIndex ? { ...row, [field]: value } : row
    )));
  };

  const saveCell = async (rowIndex, field) => {
    const row = rows[rowIndex];
    if (!row?.id) return;
    if (field === "site_name" && !String(row.site_name || "").trim()) {
      toast.error("Site Name cannot be blank.");
      load();
      return;
    }

    let value = row[field];
    if (NUMBER_FIELDS.has(field)) {
      value = String(value ?? "").trim() === "" ? null : Number(value);
      if (value !== null && !Number.isFinite(value)) {
        toast.error("Enter a valid number.");
        load();
        return;
      }
    } else {
      value = String(value ?? "").trim();
    }

    setSavingIds((current) => new Set(current).add(row.id));
    try {
      await base44.entities.FollowUpTracker.update(row.id, { [field]: value });
      setRows((current) => current.map((item) => (
        item.id === row.id ? { ...item, [field]: value } : item
      )));
    } catch (error) {
      console.error(error);
      toast.error("Could not save that tracker change.");
      load();
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
    }
  };

  const addRow = async () => {
    setAdding(true);
    try {
      const record = await base44.entities.FollowUpTracker.create({
        site_name: "New Site",
        status: "New Lead",
      });
      setRows((current) => [record, ...current]);
    } catch (error) {
      console.error(error);
      toast.error("Could not add a tracker row.");
    } finally {
      setAdding(false);
    }
  };

  const deleteRow = async (row) => {
    try {
      await base44.entities.FollowUpTracker.delete(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
      toast.success("Tracker row deleted.");
    } catch (error) {
      console.error(error);
      toast.error("Could not delete that tracker row.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading font-bold text-lg text-foreground">Site Candidate Tracker</h2>
          <p className="text-xs text-muted-foreground">
            Sites you select with Add to Tracker populate here automatically and stay with your SiteHawk account.
          </p>
        </div>
        <Button size="sm" onClick={addRow} disabled={adding} style={{ background: TRACKER_GREEN }} className="font-heading font-semibold">
          {adding ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Add Row
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="min-w-full text-xs">
          <thead>
            <tr>
              {COLUMNS.map(([label]) => (
                <th key={label} className="px-2 py-2 text-left font-heading font-bold text-white whitespace-nowrap" style={{ background: TRACKER_GREEN }}>
                  {label}
                </th>
              ))}
              <th className="px-2 py-2" style={{ background: TRACKER_GREEN }} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={COLUMNS.length + 1} className="py-10 text-center text-muted-foreground">
                <Loader2 className="w-5 h-5 mx-auto animate-spin" />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={COLUMNS.length + 1} className="py-10 text-center text-muted-foreground">
                No tracked sites yet. Select a target in Site Search and click Add to Tracker.
              </td></tr>
            ) : rows.map((row, rowIndex) => (
              <tr key={row.id} className="border-t border-border">
                {COLUMNS.map(([label, field]) => (
                  <td key={field} className="p-0 border-r border-border/60">
                    <input
                      aria-label={label}
                      value={row[field] ?? ""}
                      onChange={(event) => setCell(rowIndex, field, event.target.value)}
                      onBlur={() => saveCell(rowIndex, field)}
                      className="w-40 bg-transparent px-2 py-2 text-foreground outline-none focus:bg-primary/5"
                    />
                  </td>
                ))}
                <td className="px-2 text-center">
                  {savingIds.has(row.id) ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <button
                      onClick={() => deleteRow(row)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Delete row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
