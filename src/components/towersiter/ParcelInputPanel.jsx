import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, Loader2, Lock, PenLine } from "lucide-react";
import PlatUpload from "./PlatUpload";

// Boundary acquisition input — Tier 1 Realie (APN / address / map click),
// Tier 2 plat upload, Tier 3 manual (rectangle or point-by-point polygon).
export default function ParcelInputPanel({
  ent, busy, clickMode, setClickMode,
  onLookup, onUseDemo, onPlatParsed,
  parcelOptions, onPickOption,
  manualRect, setManualRect, onFinishPolygon, draftCount,
}) {
  const [tab, setTab] = useState("apn");
  const [apn, setApn] = useState("");
  const [state, setState] = useState("");
  const [county, setCounty] = useState("");
  const [address, setAddress] = useState("");

  const locked = !ent.realParcels;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
      <div className="flex gap-1.5">
        {[["apn", "APN"], ["address", "Address"], ["click", "Click map"], ["manual", "Manual"]].map(([k, l]) => (
          <button key={k}
            onClick={() => { setTab(k); setClickMode(k === "click" ? "parcel" : null); }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${tab === k ? "bg-blue-600 border-blue-500 text-white" : "border-white/10 text-white/50 hover:text-white"}`}>
            {l}
          </button>
        ))}
      </div>

      {locked && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          Free tier sites the demo parcel only — upgrade to use your parcel.
        </div>
      )}

      <div className={locked ? "opacity-40 pointer-events-none" : ""}>
        {tab === "apn" && (
          <div className="space-y-2">
            <Input placeholder="Parcel ID / APN" value={apn} onChange={(e) => setApn(e.target.value)} className="h-8 bg-white/5 border-white/10 text-white" />
            <div className="flex gap-2">
              <Input placeholder="State (NC)" maxLength={2} value={state} onChange={(e) => setState(e.target.value.toUpperCase())} className="h-8 w-24 bg-white/5 border-white/10 text-white" />
              <Input placeholder="County" value={county} onChange={(e) => setCounty(e.target.value)} className="h-8 bg-white/5 border-white/10 text-white" />
            </div>
            <Button size="sm" className="w-full" disabled={busy || !apn || state.length !== 2}
              onClick={() => onLookup("apn", { apn, state, county })}>
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />} Find parcel
            </Button>
          </div>
        )}

        {tab === "address" && (
          <div className="space-y-2">
            <Input placeholder="Street address (123 Main St)" value={address} onChange={(e) => setAddress(e.target.value)} className="h-8 bg-white/5 border-white/10 text-white" />
            <div className="flex gap-2">
              <Input placeholder="State (NC)" maxLength={2} value={state} onChange={(e) => setState(e.target.value.toUpperCase())} className="h-8 w-24 bg-white/5 border-white/10 text-white" />
              <Input placeholder="County (optional)" value={county} onChange={(e) => setCounty(e.target.value)} className="h-8 bg-white/5 border-white/10 text-white" />
            </div>
            <Button size="sm" className="w-full" disabled={busy || !address || state.length !== 2}
              onClick={() => onLookup("address", { address, state, county })}>
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />} Find parcel
            </Button>
          </div>
        )}

        {tab === "click" && (
          <p className="text-[11px] text-white/50 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-cyan-400" /> Click the map on the parcel you want to site.
          </p>
        )}

        {tab === "manual" && (
          <div className="space-y-2">
            <PlatUpload onParsed={onPlatParsed} disabled={busy} />
            <div className="text-[10px] uppercase tracking-wide text-white/30 pt-1">— or manual entry —</div>
            <div className="flex gap-2 items-center">
              <Input type="number" placeholder="Frontage ft" value={manualRect.w} onChange={(e) => setManualRect({ ...manualRect, w: e.target.value })} className="h-8 bg-white/5 border-white/10 text-white" />
              <span className="text-white/30 text-xs">×</span>
              <Input type="number" placeholder="Depth ft" value={manualRect.d} onChange={(e) => setManualRect({ ...manualRect, d: e.target.value })} className="h-8 bg-white/5 border-white/10 text-white" />
            </div>
            <Button size="sm" variant="outline" className="w-full border-white/15 text-white/70"
              disabled={!(Number(manualRect.w) > 0 && Number(manualRect.d) > 0)}
              onClick={() => setClickMode("rectCenter")}>
              <MapPin className="w-4 h-4 mr-1" /> {clickMode === "rectCenter" ? "Click map to place rectangle…" : "Place rectangle on map"}
            </Button>
            <Button size="sm" variant="outline" className="w-full border-white/15 text-white/70"
              onClick={() => setClickMode(clickMode === "polygon" ? null : "polygon")}>
              <PenLine className="w-4 h-4 mr-1" /> {clickMode === "polygon" ? `Drawing… ${draftCount} pts (click map)` : "Draw polygon point-by-point"}
            </Button>
            {clickMode === "polygon" && draftCount >= 3 && (
              <Button size="sm" className="w-full" onClick={onFinishPolygon}>Finish polygon ({draftCount} points)</Button>
            )}
          </div>
        )}
      </div>

      {parcelOptions?.length > 1 && (
        <Select onValueChange={(v) => onPickOption(Number(v))}>
          <SelectTrigger className="h-8 bg-white/5 border-white/10 text-white text-xs">
            <SelectValue placeholder={`${parcelOptions.length} matches — choose one`} />
          </SelectTrigger>
          <SelectContent>
            {parcelOptions.map((p, i) => (
              <SelectItem key={i} value={String(i)}>
                {p.addressFull || p.parcelId || `Parcel ${i + 1}`} · {p.ownerName || "owner unknown"} · {p.acres ? `${p.acres} ac` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button size="sm" variant="ghost" className="w-full text-white/50 hover:text-white" onClick={onUseDemo}>
        Load demo parcel (Iredell County NC)
      </Button>
    </div>
  );
}