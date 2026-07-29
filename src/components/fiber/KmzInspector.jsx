/**
 * KmzInspector — read-only KMZ preview. Parses a .kmz entirely in the browser
 * so you can see exactly what's inside (points / routes / service areas and
 * their ExtendedData) BEFORE committing it to the database via the provider
 * import below. Nothing here writes to Supabase.
 */
import { useCallback, useState } from "react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Loader2, Download, FileSearch } from "lucide-react";

const MAX_ROWS = 500;

function parseCoords(text) {
  return text.trim().split(/\s+/).flatMap((token) => {
    const [lon, lat] = token.split(",");
    const parsed = { lon: parseFloat(lon), lat: parseFloat(lat) };
    return Number.isFinite(parsed.lon) && Number.isFinite(parsed.lat) ? [parsed] : [];
  });
}

export default function KmzInspector() {
  const [features, setFeatures] = useState([]);
  const [summary, setSummary] = useState({ points: 0, lines: 0, polygons: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  const parseKmz = useCallback(async (file) => {
    setLoading(true);
    setError("");
    setFeatures([]);
    setFileName(file.name);
    try {
      const zip = await JSZip.loadAsync(file);
      const kmls = zip.file(/\.kml$/i);
      if (!kmls.length) throw new Error("No KML file found inside the KMZ.");
      const entry = kmls.find((f) => /doc\.kml$/i.test(f.name)) || kmls[0];
      const xml = new DOMParser().parseFromString(await entry.async("text"), "text/xml");

      const results = [];
      let points = 0, lines = 0, polygons = 0;

      xml.querySelectorAll("Placemark").forEach((pm) => {
        const coordsEl =
          pm.querySelector("LineString coordinates") ||
          pm.querySelector("Point coordinates") ||
          pm.querySelector("Polygon coordinates") ||
          pm.querySelector("LinearRing coordinates");
        if (!coordsEl) return;

        let type = "Point";
        if (pm.querySelector("LineString")) type = "LineString";
        else if (pm.querySelector("Polygon")) type = "Polygon";
        if (type === "Point") points++;
        else if (type === "LineString") lines++;
        else polygons++;

        const properties = {};
        pm.querySelectorAll("SimpleData, Data").forEach((d) => {
          const key = d.getAttribute("name");
          if (key) properties[key] = d.textContent?.trim() || "";
        });

        results.push({
          name: pm.querySelector("name")?.textContent?.trim() || "Unnamed",
          description: pm.querySelector("description")?.textContent?.trim() || "",
          type,
          coordinates: parseCoords(coordsEl.textContent),
          properties,
        });
      });

      if (!results.length) throw new Error("No Point, LineString, or Polygon placemarks found.");
      setFeatures(results);
      setSummary({ points, lines, polygons });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFile = (e) => {
    const file = e.target.files?.[0] || e.dataTransfer?.files?.[0];
    if (file) parseKmz(file);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ source_file: fileName, features }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName.replace(/\.kmz$/i, "") || "kmz"}_features.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-heading text-base font-bold text-foreground">
        <FileSearch className="h-4 w-4 text-primary" /> Inspect a KMZ (preview only)
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        See what's inside a file before importing it. Runs entirely in your browser — nothing is saved.
      </p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFile(e); }}
        onClick={() => document.getElementById("kmz-inspect-input")?.click()}
        className="mt-3 cursor-pointer rounded-xl border-2 border-dashed border-primary/40 bg-secondary/40 p-6 text-center transition-colors hover:bg-secondary"
      >
        {loading ? (
          <p className="flex items-center justify-center gap-2 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin" /> Parsing {fileName}…
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Drop a <strong className="text-foreground">.kmz</strong> here, or click to browse
          </p>
        )}
        <input id="kmz-inspect-input" type="file" accept=".kmz" className="hidden" onChange={handleFile} />
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {features.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-border bg-secondary px-3 py-1">{features.length.toLocaleString()} features</span>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-600">{summary.points.toLocaleString()} points / nodes</span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-600">{summary.lines.toLocaleString()} routes</span>
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-violet-600">{summary.polygons.toLocaleString()} service areas</span>
          </div>

          <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-secondary">
                <tr className="text-left text-muted-foreground">
                  <th className="p-2 font-semibold">Name</th>
                  <th className="p-2 font-semibold">Type</th>
                  <th className="p-2 font-semibold">Coords</th>
                  <th className="p-2 font-semibold">Attributes</th>
                </tr>
              </thead>
              <tbody>
                {features.slice(0, MAX_ROWS).map((f, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2 font-medium text-foreground">{f.name}</td>
                    <td className="p-2 text-muted-foreground">{f.type}</td>
                    <td className="p-2 text-muted-foreground">{f.coordinates.length} pts</td>
                    <td className="max-w-xs truncate p-2 text-muted-foreground">
                      {Object.keys(f.properties).length
                        ? Object.entries(f.properties).map(([k, v]) => `${k}: ${v}`).join(", ")
                        : f.description || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {features.length > MAX_ROWS && (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing the first {MAX_ROWS} of {features.length.toLocaleString()} features. Export the JSON to see them all.
            </p>
          )}

          <Button size="sm" variant="outline" onClick={exportJSON} className="mt-3 gap-1.5">
            <Download className="h-4 w-4" /> Export all as JSON
          </Button>
        </>
      )}
    </div>
  );
}