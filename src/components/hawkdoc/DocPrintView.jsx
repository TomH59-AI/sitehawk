// DocPrintView — print-formatted rendering of a completed Hawk application.
// Used by both the authenticated fields view (#hawkdoc-print-root) and the
// public share page. Groups answers by section and renders the signature block.
import { useMemo } from "react";

export default function DocPrintView({ document }) {
  const sections = useMemo(() => {
    const groups = {};
    (document.fields || []).forEach((f) => {
      const sec = f.section || "General";
      (groups[sec] = groups[sec] || []).push(f);
    });
    return groups;
  }, [document]);

  return (
    <div id="hawkdoc-print-root" className="bg-white text-slate-900 mx-auto print:shadow-none" style={{ maxWidth: "8.5in" }}>
      <div className="px-10 py-8">
        {/* Header */}
        <div className="border-b-2 border-slate-800 pb-4 mb-6">
          <div className="text-[10px] font-mono tracking-[0.3em] text-slate-500 uppercase">SiteHawk · Hawk Document Intelligence</div>
          <h1 className="font-bold text-2xl mt-1">{document.doc_name}</h1>
          {document.doc_type && <div className="text-sm font-semibold text-slate-600 mt-0.5">{document.doc_type}</div>}
          {document.doc_summary && <p className="text-xs text-slate-600 mt-2 leading-relaxed">{document.doc_summary}</p>}
        </div>

        {/* Answers by section */}
        {Object.entries(sections).map(([section, rows]) => (
          <div key={section} className="mb-6" style={{ breakInside: "avoid" }}>
            <h2 className="font-bold text-sm uppercase tracking-wide text-slate-700 border-b border-slate-300 pb-1 mb-3">{section}</h2>
            <table className="w-full text-sm">
              <tbody>
                {rows.map((f, i) => (
                  <tr key={i} className="align-top" style={{ breakInside: "avoid" }}>
                    <td className="py-1.5 pr-4 font-medium text-slate-600 w-2/5">
                      {f.label}{f.required ? <span className="text-red-600"> *</span> : null}
                    </td>
                    <td className="py-1.5 text-slate-900 border-b border-dotted border-slate-300">
                      {f.value && f.value.trim() ? f.value : <span className="text-slate-400 italic">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* Signature block */}
        <div className="mt-10 pt-6 border-t-2 border-slate-800" style={{ breakInside: "avoid" }}>
          <h2 className="font-bold text-sm uppercase tracking-wide text-slate-700 mb-4">Applicant Signature</h2>
          <div className="flex items-end gap-12">
            <div className="flex-1">
              <div className="h-16 flex items-end">
                {document.applicant_signature ? (
                  document.signature_mode === "drawn"
                    ? <img src={document.applicant_signature} alt="signature" className="h-16" />
                    : <span className="text-2xl" style={{ fontFamily: "'Brush Script MT', cursive" }}>{document.applicant_signature}</span>
                ) : null}
              </div>
              <div className="border-t border-slate-800 pt-1 text-xs text-slate-600">Signature — {document.signed_by || "________________________"}</div>
            </div>
            <div className="w-48">
              <div className="h-16 flex items-end pb-1 text-sm">
                {document.signed_at ? new Date(document.signed_at).toLocaleDateString() : ""}
              </div>
              <div className="border-t border-slate-800 pt-1 text-xs text-slate-600">Date</div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-[10px] text-slate-400 text-center">
          Prepared with SiteHawk Hawk Document Intelligence · {new Date().toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}