import { useEffect, useState } from "react";
import { driveFiberFiles } from "@/functions/driveFiberFiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Folder, FileText, Loader2, ChevronLeft, Search, X } from "lucide-react";

/**
 * Browse the connected Google Drive and pick a fiber geometry file (.kmz/.kml/
 * .geojson/.json/.zip). Selecting one downloads it from Drive into Base44
 * storage and hands the resulting file_url back via onPick — the existing
 * importers consume that URL unchanged.
 */
export default function DriveFilePicker({ onPick, onClose }) {
  const [stack, setStack] = useState([{ id: "root", name: "My Drive" }]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [fetchingId, setFetchingId] = useState("");

  const current = stack[stack.length - 1];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    driveFiberFiles(query ? { action: "list", search: query } : { action: "list", folder_id: current.id })
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((e) => { if (!cancelled) setError(e?.response?.data?.error || e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [current.id, query]);

  const openFolder = (f) => { setQuery(""); setSearch(""); setStack((s) => [...s, f]); };
  const goBack = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  const pickFile = async (f) => {
    setFetchingId(f.id);
    setError("");
    try {
      const res = await driveFiberFiles({ action: "fetch", file_id: f.id });
      onPick({ file_url: res.data.file_url, name: res.data.name });
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setFetchingId("");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={stack.length < 2 || !!query} onClick={goBack}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="truncate text-sm font-semibold">
          {query ? `Search: “${query}”` : current.name}
        </span>
        {onClose && (
          <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <form
        className="flex items-center gap-2 border-b border-border px-3 py-2"
        onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}
      >
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search all of Drive by file name…"
          className="h-8 text-xs"
        />
        <Button type="submit" size="sm" variant="secondary" className="gap-1.5">
          <Search className="h-3.5 w-3.5" /> Search
        </Button>
        {query && (
          <Button type="button" size="sm" variant="ghost" onClick={() => { setQuery(""); setSearch(""); }}>
            Clear
          </Button>
        )}
      </form>

      {error && <div className="px-3 py-2 text-xs text-destructive">{error}</div>}

      <div className="max-h-72 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading Drive…
          </div>
        ) : (
          <>
            {(data?.folders || []).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => openFolder(f)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-secondary"
              >
                <Folder className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">{f.name}</span>
              </button>
            ))}
            {(data?.files || []).map((f) => (
              <button
                key={f.id}
                type="button"
                disabled={!!fetchingId}
                onClick={() => pickFile(f)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-secondary disabled:opacity-50"
              >
                {fetchingId === f.id
                  ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="truncate">{f.name}</span>
                {f.size != null && (
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                    {(f.size / 1048576).toFixed(1)} MB
                  </span>
                )}
              </button>
            ))}
            {!data?.folders?.length && !data?.files?.length && (
              <div className="px-2 py-6 text-sm text-muted-foreground">
                No folders or geometry files (.kmz, .kml, .geojson, .json, .zip) here.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}