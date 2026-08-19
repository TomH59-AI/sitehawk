import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Upload, FileSpreadsheet, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import TrackerSiteForm from "../components/tracker/TrackerSiteForm";
import ImportWizard from "../components/tracker/import/ImportWizard";
import TrackerSheet from "../components/tracker/TrackerSheet";
import TrackerTasks from "../components/tracker/TrackerTasks";
import { MILESTONES, TRACKER_GREEN } from "@/lib/hawkTracker";
import { TRACKER_SHEET_EVENT } from "@/lib/trackerSheet";

// Hawk Tracker — 18 gates and an exit. Sites + per-gate milestone rows +
// the Friday-call weekly report.
export default function HawkTracker() {
  const [tab, setTab] = useState("tracker");
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const s = await base44.entities.HawkTrackerSite.list("-created_date", 500);
    setSites(s);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createSite = async (form) => {
    setSaving(true);
    const data = { ...form };
    if (!data.target_on_air) delete data.target_on_air;
    if (data.state) data.state = data.state.toUpperCase();
    const site = await base44.entities.HawkTrackerSite.create(data);
    // One row per gate — independent statuses, display order only.
    await base44.entities.HawkTrackerMilestone.bulkCreate(
      MILESTONES.map((m) => ({ tracker_site_id: site.id, milestone: m.key, status: "pending" }))
    );
    // Keep manually created milestone sites in the same durable, per-user
    // spreadsheet that receives targets selected in Site Search.
    const existingRows = await base44.entities.FollowUpTracker.filter({ site_name: site.site_name });
    if (!existingRows?.length) {
      await base44.entities.FollowUpTracker.create({
        site_name: site.site_name,
        jurisdiction: site.jurisdiction || "",
        latitude: site.latitude ?? null,
        longitude: site.longitude ?? null,
        status: "New Lead",
      });
    }
    window.dispatchEvent(new Event(TRACKER_SHEET_EVENT));
    setSaving(false);
    setShowForm(false);
    setTab("tracker");
    toast.success(`${site.site_name} added to the tracker.`);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground">Hawk Tracker</h1>
          <p className="text-sm text-muted-foreground">Site acquisition milestone tracking — 18 gates and an exit.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)} className="font-heading font-semibold">
            <Upload className="w-4 h-4 mr-1" /> Import CSV/XLSX
          </Button>
          <Button onClick={() => setShowForm(true)} style={{ background: TRACKER_GREEN }} className="font-heading font-semibold">
            <Plus className="w-4 h-4 mr-1" /> New Site
          </Button>
        </div>
      </div>

      <div className="flex gap-2 no-print">
        <Button size="sm" variant={tab === "tracker" ? "default" : "outline"} onClick={() => setTab("tracker")}
          style={tab === "tracker" ? { background: TRACKER_GREEN } : undefined}>
          <FileSpreadsheet className="w-4 h-4 mr-1" /> Click for tracker
        </Button>
        <Button size="sm" variant={tab === "tasks" ? "default" : "outline"} onClick={() => setTab("tasks")}
          style={tab === "tasks" ? { background: TRACKER_GREEN } : undefined}>
          <CheckSquare className="w-4 h-4 mr-1" /> Tasks
        </Button>
      </div>

      {showForm && <TrackerSiteForm onSubmit={createSite} onCancel={() => setShowForm(false)} saving={saving} />}
      {showImport && <ImportWizard existingSites={sites} onClose={() => setShowImport(false)} onDone={load} />}

      {tab === "tracker" && <TrackerSheet />}

      {tab === "tasks" && <TrackerTasks />}
    </div>
  );
}