import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, ClipboardList, CalendarCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import TrackerSiteForm from "../components/tracker/TrackerSiteForm";
import TrackerSiteCard from "../components/tracker/TrackerSiteCard";
import WeeklyReport from "../components/tracker/WeeklyReport";
import ImportWizard from "../components/tracker/import/ImportWizard";
import { MILESTONES, TRACKER_GREEN } from "@/lib/hawkTracker";

// Hawk Tracker — 18 gates and an exit. Sites + per-gate milestone rows +
// the Friday-call weekly report.
export default function HawkTracker() {
  const [tab, setTab] = useState("sites");
  const [sites, setSites] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [s, m] = await Promise.all([
      base44.entities.HawkTrackerSite.list("-created_date", 500),
      base44.entities.HawkTrackerMilestone.list("-updated_date", 2000),
    ]);
    setSites(s);
    setMilestones(m);
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
    setSaving(false);
    setShowForm(false);
    toast.success(`${site.site_name} added to Hawk Tracker.`);
    load();
  };

  const updateMilestone = async (row, patch) => {
    const data = { ...patch, backfilled: false }; // a real user edit is real movement
    if (patch.status === "complete" && !row.completed_at) data.completed_at = new Date().toISOString();
    if (patch.status && patch.status !== "complete") data.completed_at = null;
    await base44.entities.HawkTrackerMilestone.update(row.id, data);
    // Mirror the gate onto the site's display status when it advances.
    if (patch.status === "complete" || patch.status === "in_progress") {
      await base44.entities.HawkTrackerSite.update(row.tracker_site_id, { current_status: row.milestone });
    }
    load();
  };

  const updateSite = async (site, patch) => {
    await base44.entities.HawkTrackerSite.update(site.id, patch);
    load();
  };

  const deleteSite = async (site) => {
    if (!window.confirm(`Delete ${site.site_name} and all its milestones?`)) return;
    const rows = milestones.filter((m) => m.tracker_site_id === site.id);
    await Promise.all(rows.map((r) => base44.entities.HawkTrackerMilestone.delete(r.id)));
    await base44.entities.HawkTrackerSite.delete(site.id);
    toast.success("Site deleted.");
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
        <Button size="sm" variant={tab === "sites" ? "default" : "outline"} onClick={() => setTab("sites")}
          style={tab === "sites" ? { background: TRACKER_GREEN } : undefined}>
          <ClipboardList className="w-4 h-4 mr-1" /> Sites ({sites.length})
        </Button>
        <Button size="sm" variant={tab === "report" ? "default" : "outline"} onClick={() => setTab("report")}
          style={tab === "report" ? { background: TRACKER_GREEN } : undefined}>
          <CalendarCheck className="w-4 h-4 mr-1" /> Weekly Report
        </Button>
      </div>

      {showForm && <TrackerSiteForm onSubmit={createSite} onCancel={() => setShowForm(false)} saving={saving} />}
      {showImport && <ImportWizard existingSites={sites} onClose={() => setShowImport(false)} onDone={load} />}

      {tab === "sites" && (
        <div className="space-y-3">
          {sites.length === 0 && !showForm && (
            <div className="text-sm text-muted-foreground py-10 text-center rounded-xl border border-dashed border-border">
              No tracker sites yet. Click <span className="font-semibold text-foreground">New Site</span> to start tracking a deployment.
            </div>
          )}
          {sites.map((s) => (
            <TrackerSiteCard
              key={s.id}
              site={s}
              milestones={milestones.filter((m) => m.tracker_site_id === s.id)}
              onUpdateMilestone={updateMilestone}
              onUpdateSite={updateSite}
              onDelete={deleteSite}
            />
          ))}
        </div>
      )}

      {tab === "report" && <WeeklyReport sites={sites} milestones={milestones} />}
    </div>
  );
}