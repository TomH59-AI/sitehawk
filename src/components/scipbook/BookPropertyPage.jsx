import { buildPropertySections } from "./scipBookData";

const NAVY = "#0f2a43";
const BLUE = "#1d6fb8";

// Page 1 of the SCIP Book — the full Property Data field sheet, laid out to
// match the NEWSCIP template. SARF map is embedded after the search ring block.
export default function BookPropertyPage({ record }) {
  const sections = buildPropertySections(record);
  const before = sections.slice(0, 2); // Site Acquisition + Search Ring (above SARF map)
  const after = sections.slice(2);

  return (
    <div className="text-[11px] leading-snug" style={{ color: "#1a2733" }}>
      <div className="text-center py-2 mb-3 rounded" style={{ background: NAVY }}>
        <h1 className="text-white text-base font-bold tracking-wide">SITE CANDIDATE INFORMATION PACKAGE</h1>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <div className="col-span-2 grid grid-cols-2 gap-x-6">
          {before.map((s) => <Section key={s.title} section={s} />)}
        </div>

        <div className="col-span-2">
          <SectionHeader title="SARF MAP" />
          {record?.map_image_url ? (
            <img src={record.map_image_url} alt="SARF map" className="w-full rounded border object-contain" style={{ borderColor: "#c8d4de", maxHeight: "3.4in" }} />
          ) : (
            <div className="w-full rounded border border-dashed flex items-center justify-center text-slate-400" style={{ height: "2.2in", borderColor: "#c8d4de" }}>
              SARF map not yet generated
            </div>
          )}
        </div>

        {after.map((s) => <Section key={s.title} section={s} />)}
      </div>
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div className="px-2 py-1 mb-1 rounded-sm text-white font-bold text-[10px] tracking-wider" style={{ background: BLUE }}>
      {title}
    </div>
  );
}

function Section({ section }) {
  return (
    <div className="break-inside-avoid">
      <SectionHeader title={section.title} />
      <table className="w-full">
        <tbody>
          {section.rows.map((row) => (
            <tr key={row.key} className="border-b" style={{ borderColor: "#e4ebf1" }}>
              <td className="py-[3px] pr-2 font-semibold align-top" style={{ width: "46%", color: "#3b4a58" }}>{row.label}</td>
              <td className="py-[3px] align-top">
                {row.value ? (
                  <span>
                    {row.value}
                    {row.fromQc && (
                      <span className="ml-1 px-1 rounded text-[8px] font-bold align-middle" style={{ background: "#e8f2fc", color: BLUE }}>QC</span>
                    )}
                  </span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}