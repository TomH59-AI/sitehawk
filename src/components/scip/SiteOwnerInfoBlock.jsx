import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import HawkIcon from "@/components/HawkIcon";
import { generateSiteOwnerInfo } from "@/functions/generateSiteOwnerInfo";

const SITE_ROWS = [
  ["Parcel County",                    "parcel_county"],
  ["Parcel ID Number",                 "parcel_id"],
  ["Owner Name (on Deed)",             "owner_name_on_deed"],
  ["Parcel Street Address",            "parcel_street_address"],
  ["Parcel City",                      "parcel_city"],
  ["Parcel State",                     "parcel_state"],
  ["Parcel Zip",                       "parcel_zip"],
  ["Parcel Size (acres, MOL)",         "parcel_size_acres"],
  ["Latitude",                         "latitude"],
  ["Longitude",                        "longitude"],
  ["Tower Height",                     "tower_height"],
  ["Parcel Dimensions (feet)",         "parcel_dimensions_ft"],
  ["Ground Elevation",                 "ground_elevation"],
  ["Distance from Search Ring Center", "distance_from_ring_center"],
];

const OWNER_ROWS = [
  ["Name(s)",         "names"],
  ["Contact Person",  "contact_person"],
  ["Mailing Address", "mailing_address"],
  ["Phone Number",    "phone_number"],
];

function Section({ title, rows, data }) {
  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden">
      <div className="bg-slate-700 text-white px-4 py-2 font-heading font-semibold text-sm tracking-wide">
        {title}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, key], i) => (
            <tr key={key} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
              <td className="px-4 py-2 font-semibold text-slate-700 w-1/3 border-r border-slate-200">{label}</td>
              <td className="px-4 py-2 text-slate-900">
                {data?.[key] ?? <span className="text-slate-400 italic">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SiteOwnerInfoBlock({ lat, lon, targetLat, targetLon, towerHeightFt }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (lat == null || lon == null) {
      toast({ title: "Missing coordinates", description: "Open a SCIP with a candidate first.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await generateSiteOwnerInfo({
        lat, lon,
        target_lat: targetLat,
        target_lon: targetLon,
        tower_height_ft: towerHeightFt || 199,
      });
      if (res.data?.error) {
        toast({ title: "Generation failed", description: res.data.error, variant: "destructive" });
      } else {
        setData(res.data);
        toast({ title: "Target A info generated", description: "Site + Owner info pulled from Realie, USGS, and Enformion." });
      }
    } catch (e) {
      toast({ title: "Error", description: e?.message || "Unknown error", variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <div id="scip-site-owner-info" className="bg-card border border-border rounded-xl p-4 space-y-4">
      {/* Header with hawk-styled Generate button on the top-right */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-heading font-bold text-lg text-foreground">Target A — Site &amp; Owner Information</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pulls from Realie (parcel), USGS EPQS (elevation), and Enformion (phone).
          </p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="gap-2 bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-700 hover:to-sky-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.45)] hover:shadow-[0_0_20px_rgba(37,99,235,0.7)] transition-all"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : data ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <HawkIcon size={18} />
          )}
          {loading ? "Generating…" : data ? "Regenerate" : "Generate Site Info"}
        </Button>
      </div>

      {data && (
        <div className="space-y-3">
          <Section title="SITE INFORMATION"  rows={SITE_ROWS}  data={data.site_information} />
          <Section title="OWNER INFORMATION" rows={OWNER_ROWS} data={data.owner_information} />
        </div>
      )}
    </div>
  );
}