import { useCallback, useState } from "react";
import { ChevronDown, Loader2, Waypoints } from "lucide-react";
import { fccBdcConnectivity } from "@/functions/fccBdcConnectivity";
import FccCoverageCard from "./FccCoverageCard";

const COLS = ["Target A", "Target B", "Target C"];

function TargetCoverage({ index, target }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("idle");
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    setStatus("loading");
    const response = await fccBdcConnectivity({ lat: target.latitude, lon: target.longitude });
    if (response.data?.error) throw new Error(response.data.error);
    setData(response.data); setStatus("done");
  }, [target]);
  if (!target) return <div className="border-r border-border px-3 py-3 text-xs text-muted-foreground last:border-r-0">—</div>;
  const toggle = () => { const next = !open; setOpen(next); if (next && status === "idle") load().catch(() => setStatus("error")); };
  return (
    <div className="border-r border-border px-3 py-3 text-sm last:border-r-0">
      <button onClick={toggle} className="flex w-full items-center justify-between gap-2 font-semibold text-foreground hover:text-primary">
        <span className="flex items-center gap-1.5"><Waypoints className="h-4 w-4 text-primary" />{COLS[index]} Connectivity</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="mt-2">
        {status === "loading" && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading FCC coverage…</div>}
        {status === "error" && <div className="text-xs text-destructive">No data available — FCC Broadband Data Collection lookup failed.</div>}
        {status === "done" && data && <FccCoverageCard data={data} />}
      </div>}
    </div>
  );
}

export default function ConnectivityPanel({ targets = [] }) {
  if (!targets.some(Boolean)) return null;
  return <div className="grid border-t border-border" style={{ gridTemplateColumns: "200px repeat(3, minmax(220px, 1fr))" }}>
    <div className="flex items-center gap-1.5 border-r border-border bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"><Waypoints className="h-4 w-4" />FCC Connectivity</div>
    {[0, 1, 2].map((index) => <TargetCoverage key={index} index={index} target={targets[index]} />)}
  </div>;
}