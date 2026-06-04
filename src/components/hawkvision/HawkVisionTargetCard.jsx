/**
 * HawkVisionTargetCard - single target readout for the Hawk Vision page.
 *
 * Shows Target A/B/C with owner, parcel, zoning, CUP, PE-letter, and contact
 * details returned by findBestParcelForTower.
 */

import {
  Building2,
  Crosshair,
  FileCheck2,
  Hash,
  Mail,
  Map as MapIcon,
  Phone,
  Radio,
  Ruler,
  ShieldCheck,
  User,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import PushToNotionButton from "./PushToNotionButton";

const LABELS = ["TARGET A", "TARGET B", "TARGET C"];
const ACCENTS = [
  { ring: "#00d4ff", glow: "rgba(0,212,255,0.35)", chip: "from-cyan-500 to-blue-500" },
  { ring: "#10b981", glow: "rgba(16,185,129,0.35)", chip: "from-emerald-500 to-teal-500" },
  { ring: "#f59e0b", glow: "rgba(245,158,11,0.35)", chip: "from-amber-500 to-orange-500" },
];

function Row({ icon: Icon, label, value, mono = true, highlight = false }) {
  const has = value != null && value !== "" && value !== "-";
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-[#1e293b] last:border-b-0">
      <Icon className="w-3.5 h-3.5 text-slate-500 mt-1 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500 font-mono">
          {label}
        </div>
        <div
          className={`text-[13px] leading-snug break-words ${mono ? "font-mono" : ""} ${
            has ? (highlight ? "text-cyan-300 font-semibold" : "text-slate-100") : "text-slate-600 italic"
          }`}
        >
          {has ? value : "-"}
        </div>
      </div>
    </div>
  );
}

function cupText(target) {
  if (!target.requires_cup) return "Not required by extracted criteria";
  if (target.cup_path_available) return "Required / path found";
  if (target.cup_assumed) return "Assumed required - verify jurisdiction";
  return "Required - verify jurisdiction";
}

function peText(target) {
  if (target.pe_letter_accepted) return "Accepted or usable - requirements scored favorably";
  return "Checked, not verified - conservative sizing used";
}

export default function HawkVisionTargetCard({ target, index, searchCenter }) {
  const accent = ACCENTS[index] || ACCENTS[0];
  const label = LABELS[index] || `TARGET ${index + 1}`;
  const fmtCoord = (n) => (Number.isFinite(n) ? Number(n).toFixed(6) : "-");
  const navigate = useNavigate();
  const criteriaSummary = Array.isArray(target.selection_criteria)
    ? target.selection_criteria.join(" ")
    : "";

  return (
    <div
      className="rounded-2xl border bg-[#0a0e17]/90 backdrop-blur overflow-hidden transition-transform hover:scale-[1.005]"
      style={{ borderColor: `${accent.ring}55`, boxShadow: `0 0 30px ${accent.glow}` }}
    >
      <div className={`px-5 py-3 bg-gradient-to-r ${accent.chip} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-[#0a0e17]" />
          <span className="font-mono font-bold text-[#0a0e17] tracking-[0.2em] text-sm">
            {label}
          </span>
        </div>
        {target.score != null && (
          <span className="font-mono text-[10px] font-bold text-[#0a0e17] bg-white/30 px-2 py-0.5 rounded">
            SCORE {target.score}
          </span>
        )}
      </div>

      <div className="px-5 py-4">
        <Row icon={User} label="Owner's Name" value={target.owner_name} mono={false} highlight />
        <Row icon={Building2} label="Parcel Address" value={target.parcel_address} mono={false} />
        <Row icon={Hash} label="Parcel ID" value={target.parcel_id} />
        <Row
          icon={Ruler}
          label="Parcel Size (acres)"
          value={target.acreage != null ? `${target.acreage} ac` : null}
        />
        <Row icon={MapIcon} label="Zoning Classification" value={target.zoning} highlight />
        <Row icon={ShieldCheck} label="Zoning Fit" value={target.zoning_fit} highlight />
        <Row icon={FileCheck2} label="CUP Path" value={cupText(target)} />
        <Row icon={FileCheck2} label="PE Letter" value={peText(target)} />
        <Row icon={Mail} label="Owner's Mailing Address" value={target.mailing_address || target.parcel_address} mono={false} />

        <div className="grid grid-cols-2 gap-3 mt-1">
          <Row icon={Crosshair} label="Latitude" value={fmtCoord(target.latitude)} />
          <Row icon={Crosshair} label="Longitude" value={fmtCoord(target.longitude)} />
        </div>

        <Row icon={Phone} label="Phone" value={target.phone} highlight />
        <Row icon={ShieldCheck} label="Selection Criteria" value={criteriaSummary} mono={false} />

        <button
          onClick={() => navigate("/hawk-frequency", { state: { target } })}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-mono font-bold text-[11px] tracking-[0.15em] bg-cyan-400 text-[#0a0e17] hover:bg-cyan-300 transition-colors"
        >
          <Radio className="w-4 h-4" /> HAWK FREQUENCY - RF ANALYSIS
        </button>

        <PushToNotionButton target={target} searchCenter={searchCenter} />
      </div>
    </div>
  );
}
