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
import { realieParcelsInRing } from "@/functions/realieParcelsInRing";

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
  { key: "fema_risk",             label: "FEMA Risk Factor Letter:" },
];

function emptyTarget() {
  const t = {};
  for (const r of ROWS) if (!r.header) t[r.key] = "";
  return t;
}
function emptyState() {
  return { 1: emptyTarget(), 2: emptyTarget(), 3: emptyTarget() };
}

function mapParcel(p) {
  if (!p) return emptyTarget();
  return {
    owner_name: p.owner_name || p.owner || "",
    parcel_address: p.parcel_address || p.address || "",
    parcel_id: p.parcel_id || p.apn || "",
    parcel_size: p.acreage != null ? Number(p.acreage).toFixed(2) : "",
    zoning: p.zoning || p.zoning_classification || "",
    mailing_address: p.mailing_address || p.owner_mailing_address || "",
    latitude: p.latitude != null ? Number(p.latitude).toFixed(6) : "",
    longitude: p.longitude != null ? Number(p.longitude).toFixed(6) : "",
    phone: p.phone || "",
    fema_risk: p.fema_risk_factor || p.fema_zone || "",
  };
}

export default function HawkParcelDetails({ lat, lon }) {
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
      const res = await realieParcelsInRing({ lat, lon, radius_miles: 1.0 });
      const parcels = res.data?.parcels || [];
      const next = emptyState();
      [1, 2, 3].forEach((n, idx) => {
        if (parcels[idx]) next[n] = mapParcel(parcels[idx]);
      });
      setValues(next);
      setGenerated(true);
      toast.success(`Hawk Parcel Intelligence found ${Math.min(parcels.length, 3)} target parcel${parcels.length === 1 ? "" : "s"}.`);
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