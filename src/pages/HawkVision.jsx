import { useEffect, useState } from "react";
import { Loader2, PencilRuler } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ScipLiveSketch from "@/components/scip/livesketch/ScipLiveSketch";
import ScipSketchSelector from "@/components/hawkvision/ScipSketchSelector";

export default function HawkVision() {
  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.ScipRecord.list("-updated_date", 50)
      .then((items) => {
        setRecords(items);
        setSelectedId(items[0]?.id || "");
      })
      .finally(() => setLoading(false));
  }, []);

  const selected = records.find((record) => record.id === selectedId);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <div className="text-[10px] font-mono tracking-[0.3em] text-muted-foreground">HAWKVISION · LIVE SITE SKETCH</div>
        <h1 className="font-heading font-bold text-2xl">HawkVision — Live Site Sketch</h1>
        <p className="text-sm text-muted-foreground">Watch SiteHawk draw the selected SCIP parcel, setbacks, compound, fall zone, and tower to scale.</p>
      </header>

      {loading ? (
        <div className="min-h-64 flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      ) : selected ? (
        <>
          <ScipSketchSelector records={records} selectedId={selectedId} onChange={setSelectedId} />
          <ScipLiveSketch record={selected} />
        </>
      ) : (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <PencilRuler className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          <h2 className="font-heading font-bold">No SCIP data available</h2>
          <p className="text-sm text-muted-foreground mt-1">Create a SCIP record first so the sketch has verified parcel and zoning data to draw.</p>
        </div>
      )}
    </div>
  );
}