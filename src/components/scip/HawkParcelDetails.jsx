/**
 * HawkParcelDetails — side-by-side fillable parcel details template
 * for Target 1 / Target 2 / Target 3, mirroring the "Property Ownership"
 * sheet of ParcelDetails_Fillable_Template.xlsx exactly.
 *
 * Has its own "Generate with Hawk Parcel Intelligence" button that
 * pulls the top 3 Realie parcels in a 1-mile ring around the search
 * center, completely independent from the SARF map and the Hawk
 * Zoning Overview blocks.
 */

import { useState } from "react";
import { LandPlot, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { findBestParcelForTower } from "@/functions/findBestParcelForTower";

const NHR = "NEEDS_HUMAN_REVIEW";

const ROWS = [
  { key: "owner_name",            label: "Owner's Name:" },
  { key: "parcel_address",        label: "Parcel Address:" },
  { key: "parcel_id",             label: "Parcel ID:" },
  { key: "parcel_size",           label: "Parcel Size (acres):" },
  { key: "zoning",                label: "Zoning Classification:" },
  { key: "mailing_address",       label: "Owner's Mailing Address:" },
  { key: "coordinates_header",    label: "Coordinates:", header: true },
  { key: "latitude",              label: "Latitude:" },
  { key: "longitude",             label: "Longitude:" },
  { key: "phone",                 label: "Phone:" },
];

function emptyTarget() {
  const t = {};
  for (const r of ROWS) if (!r.header) t[r.key] = "";
  return t;
}
function emptyState() {
  return { 1: emptyTarget(), 2: emptyTarget(), 3: emptyTarget() };
}

// Treat null/undefined/""/NaN as unresolved → 'NEEDS_HUMAN_REVIEW'.
function nhr(v) {
  if (v === null || v === undefined) return NHR;
  if (typeof v === "number" && !Number.isFinite(v)) return NHR;
  const s = String(v).trim();
  return s === "" ? NHR : s;
}

function mapParcel(t) {
  if (!t) return emptyTarget();

  const owner = nhr(t.owner_name || t.owner);
  const parcelAddress = nhr(t.parcel_address || t.address);
  const parcelId = nhr(t.parcel_id || t.apn);

  const acres = Number(t.acreage);
  const parcelSize = Number.isFinite(acres) ? acres.toFixed(2) : NHR;

  const zoning = nhr(t.zoning_classification || t.zoning);
  const mailing = nhr(t.mailing_address);

  const latRaw = t.latitude;
  const lonRaw = t.longitude;
  const hasLat = latRaw !== null && latRaw !== undefined && latRaw !== "" && Number.isFinite(Number(latRaw));
  const hasLon = lonRaw !== null && lonRaw !== undefined && lonRaw !== "" && Number.isFinite(Number(lonRaw));
  const latitude = hasLat ? String(latRaw) : NHR;
  const longitude = hasLon ? String(lonRaw) : NHR;
  // coordinates field intentionally not present in template inputs (header row only);
  // we still resolve it per spec for downstream consumers if needed later.
  // const coordinates = hasLat && hasLon ? `${latRaw}, ${lonRaw}` : NHR;

  const phone = nhr(t.phone || t.phones?.[0]?.number);

  return {
    owner_name: owner,
    parcel_address: parcelAddress,
    parcel_id: parcelId,
    parcel_size: parcelSize,
    zoning,
    mailing_address: mailing,
    latitude,
    longitude,
    phone,
  };
}

export default function HawkParcelDetails({ lat, lon, radiusMiles = 1.0 }) {
  const [values, setValues] = useState(emptyState);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const handleChange = (targetNum, key, val) => {
    setValues((prev) => ({
      ...prev,
      [targetNum]: { ...prev[targetNum], [key]: val },
    }));
  };

  async function handleGenerate() {
    if (lat == null || lon == null) {
      toast.error("Coordinates required — run a scan first.");
      return;
    }
    setLoading(true);
    try {
      const res = await findBestParcelForTower({ lat, lon, radiusMiles });
      const targets = res.data?.targets || [];
      setValues((prev) => {
        const next = emptyState();
        [1, 2, 3].forEach((n, idx) => {
          if (targets[idx]) {
            const mapped = mapParcel(targets[idx]);
            // Preserve pre-existing user input only when new value is NEEDS_HUMAN_REVIEW.
            const merged = {};
            for (const k of Object.keys(mapped)) {
              const newVal = mapped[k];
              const prevVal = prev?.[n]?.[k];
              merged[k] =
                newVal === NHR && prevVal && prevVal !== "" && prevVal !== NHR
                  ? prevVal
                  : newVal;
            }
            next[n] = merged;
          } else if (prev?.[n]) {
            next[n] = prev[n];
          }
        });
        return next;
      });
      setGenerated(true);
      toast.success(`Hawk Parcel Intelligence found ${Math.min(targets.length, 3)} target parcel${targets.length === 1 ? "" : "s"}.`);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Hawk Parcel Intelligence lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Banner — brand-aligned blue gradient */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <LandPlot className="w-5 h-5" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · PROPERTY OWNERSHIP</div>
            <h2 className="font-heading font-bold text-lg leading-tight">Hawk Parcel Details — Targets 1 · 2 · 3</h2>
          </div>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
          ) : (
            <><Sparkles className="w-4 h-4 mr-2" /> {generated ? "Regenerate" : "Generate with Hawk Parcel Intelligence"}</>
          )}
        </Button>
      </div>

      {/* Side-by-side fillable template */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-800 text-white">
              {[1, 2, 3].map((n) => (
                <th key={n} colSpan={2} className="px-3 py-2 text-left font-heading font-bold tracking-wider border border-slate-700">
                  Target {n} <span className="text-blue-300 font-normal text-xs ml-2">Parcel Details</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, rIdx) => {
              if (row.header) {
                return (
                  <tr key={row.key} className="bg-blue-50 dark:bg-blue-950/30">
                    {[1, 2, 3].map((n) => (
                      <td
                        key={n}
                        colSpan={2}
                        className="px-3 py-2 font-semibold text-foreground border border-border"
                      >
                        {row.label}
                      </td>
                    ))}
                  </tr>
                );
              }
              return (
                <tr key={row.key} className={rIdx % 2 === 0 ? "bg-background" : "bg-muted/40"}>
                  {[1, 2, 3].map((n) => (
                    <>
                      <td
                        key={`${n}-l`}
                        className="px-3 py-2 align-top text-sm font-medium text-foreground border border-border w-[180px]"
                      >
                        {row.label}
                      </td>
                      <td
                        key={`${n}-v`}
                        className="border border-border p-0"
                      >
                        <input
                          type="text"
                          value={values[n][row.key]}
                          onChange={(e) => handleChange(n, row.key, e.target.value)}
                          placeholder="—"
                          className="w-full px-3 py-2 text-sm bg-transparent outline-none focus:bg-blue-50 dark:focus:bg-blue-950/30"
                        />
                      </td>
                    </>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}