import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Printer, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import BookPropertyPage from "@/components/scipbook/BookPropertyPage";
import BookMapPage from "@/components/scipbook/BookMapPage";
import BookQcPanel from "@/components/scipbook/BookQcPanel";
import BookSheetExport from "@/components/scipbook/BookSheetExport";
import { buildMapPages } from "@/components/scipbook/scipBookData";

const PRINT_CSS = `
@page { size: Letter; margin: 0; }
@media print {
  body { background: #fff !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }
  .book-page { display: flex !important; box-shadow: none !important; border: none !important; margin: 0 !important; page-break-after: always; }
  .book-page:last-child { page-break-after: auto; }
}`;

// SCIP Book — the client-facing SCIP as a page-by-page book. On screen: one
// page at a time with Next/Back. On print: every page, color, on 8.5"×11".
export default function ScipBook() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    base44.entities.ScipRecord.get(id).then(setRecord).catch(() => setRecord(null)).finally(() => setLoading(false));
  }, [id]);

  const mapPages = useMemo(() => (record ? buildMapPages(record) : []), [record]);
  const pages = useMemo(
    () => [{ id: "property", title: "PROPERTY DATA (SCIP)" }, ...mapPages],
    [mapPages]
  );

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-100"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  }
  if (!record) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-500">SCIP record not found.</div>;
  }

  const total = pages.length;
  const go = (n) => { setPage(Math.max(0, Math.min(total - 1, n))); window.scrollTo({ top: 0 }); };

  return (
    <div className="min-h-screen py-6 px-3" style={{ background: "#e9eef3" }}>
      <style>{PRINT_CSS}</style>
      <div className="mx-auto" style={{ maxWidth: "9in" }}>
        {/* Toolbar */}
        <div className="no-print flex items-center justify-between flex-wrap gap-2 mb-4">
          <button onClick={() => navigate(`/scip/${record.id}`)} className="inline-flex items-center gap-1.5 text-sm text-slate-500">
            <ArrowLeft className="w-4 h-4" /> Back to SCIP
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500">Page {page + 1} of {total}</span>
            <BookSheetExport record={record} onUpdate={setRecord} />
            <button onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: "#0f2a43" }}>
              <Printer className="w-4 h-4" /> Print Full SCIP
            </button>
          </div>
        </div>

        {/* Gemini QC gate — must be complete before delivery */}
        <div className="no-print mb-4">
          <BookQcPanel record={record} onUpdate={setRecord} />
        </div>

        {/* Pages — one visible on screen, all rendered for print */}
        {pages.map((p, i) => (
          <div
            key={p.id}
            className={`book-page bg-white shadow-md mx-auto flex-col ${i === page ? "flex" : "hidden"}`}
            style={{ width: "8.5in", maxWidth: "100%", minHeight: "11in", padding: "0.5in", boxSizing: "border-box" }}
          >
            <div className="flex-1 flex flex-col min-h-0">
              {p.id === "property" ? <BookPropertyPage record={record} /> : <BookMapPage page={p} />}
            </div>
            {/* Footer — site name + page number (printed) */}
            <div className="pt-2 mt-2 border-t flex items-center justify-between text-[9px]" style={{ borderColor: "#e4ebf1", color: "#7a8896" }}>
              <span>{record.site_name || "SCIP"} — Site Candidate Information Package</span>
              <span>Page {i + 1} of {total}</span>
            </div>
          </div>
        ))}

        {/* On-screen pager — matches the workbook's click-through navigation */}
        <div className="no-print flex items-center justify-between gap-3 mt-4">
          <button
            onClick={() => go(page - 1)}
            disabled={page === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold bg-white border disabled:opacity-40"
            style={{ borderColor: "#1d6fb8", color: "#1d6fb8" }}
          >
            <ChevronLeft className="w-4 h-4" />
            {page > 0 ? `BACK — ${pages[page - 1].title}` : "BACK"}
          </button>
          <button
            onClick={() => go(page + 1)}
            disabled={page === total - 1}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: "#1d6fb8" }}
          >
            {page < total - 1 ? `CLICK FOR NEXT — ${pages[page + 1].title}` : "END"}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}