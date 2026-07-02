import { Link } from "react-router-dom";

const CARDS = [
  {
    n: "01",
    icon: "🗺️",
    title: "Parcel & Owner Data",
    finds: "Owner name, mailing address, parcel ID, acreage, zoning, assessed value.",
    how: "Drop a pin on Site Search → Top 3 candidate parcels return in ~30 sec.",
  },
  {
    n: "02",
    icon: "🏛",
    title: "Local Zoning Ordinance",
    finds: "Setbacks, height limits, permitted tower types, permit pathway, conditional uses.",
    how: "Auto-extracted on every scan and shown in the Ordinance Card above results.",
  },
  {
    n: "03",
    icon: "🌊",
    title: "FEMA Flood + ASCE Wind",
    finds: "FEMA flood zone, SFHA flag, BFE, ASCE 7-22 design wind speed, hurricane-prone region.",
    how: "Stamped directly on each candidate card and the printable SCIP report.",
  },
  {
    n: "04",
    icon: "📡",
    title: "RF, Fiber & Power",
    finds: "Nearest cell towers + carrier, FCC fiber providers, electric utility, transmission lines.",
    how: "Toggle the Competitor Coverage heatmap on the scan map — gaps = opportunity.",
  },
  {
    n: "05",
    icon: "🌿",
    title: "USFWS NWI Wetlands",
    finds: "On-site/adjacent wetlands, Cowardin code, acreage, USGS topo + detail map exhibits.",
    how: "Included on every scan and rendered as full-page exhibits in the SCIP PDF.",
  },
];

export default function DataUseCaseCards() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs uppercase tracking-widest text-[#FFC72C] font-bold mb-3">What You'll Find · How to Find It</p>
          <h2 className="font-heading font-bold text-4xl md:text-5xl text-white">
            5 Data Layers.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FFC72C] to-[#FFE08A]">One Scan.</span>
          </h2>
          <p className="text-white/40 mt-4 max-w-2xl mx-auto">
            Every Site-Hawk-Pro scan returns these five data layers — fully cross-referenced and ready for your SCIP package.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {CARDS.map((c) => (
            <div
              key={c.n}
              className="rounded-2xl border border-white/5 bg-white/3 hover:bg-white/5 hover:border-[#FFC72C]/30 p-5 flex flex-col transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black text-[#FFC72C]/60 tracking-widest font-mono">{c.n}</span>
                <span className="text-2xl">{c.icon}</span>
              </div>
              <h3 className="font-heading font-bold text-white text-base mb-2 group-hover:text-[#FFC72C] transition-colors leading-tight">
                {c.title}
              </h3>
              <p className="text-[11px] text-white/60 leading-relaxed mb-3">
                <span className="text-[#FFC72C] font-semibold uppercase tracking-wider text-[9px] block mb-1">You'll Find</span>
                {c.finds}
              </p>
              <p className="text-[11px] text-white/45 leading-relaxed mt-auto pt-3 border-t border-white/5">
                <span className="text-emerald-400 font-semibold uppercase tracking-wider text-[9px] block mb-1">How to Find It</span>
                {c.how}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <Link
            to="/search"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-[#FFC72C] hover:bg-[#FFD75E] text-[#000000] font-heading font-bold text-sm shadow-lg shadow-[#FFC72C]/20 transition-all"
          >
            Run Your Free Scan →
          </Link>
        </div>
      </div>
    </section>
  );
}