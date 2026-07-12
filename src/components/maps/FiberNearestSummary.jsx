function NearestRow({ label, name, distance }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-slate-800 py-1.5">
      <div><div className="text-slate-300">{label}</div><div className="truncate text-[10px] text-slate-500">{name || "No licensed result in view"}</div></div>
      <strong className="text-cyan-300">{distance != null ? `${distance} mi` : "—"}</strong>
    </div>
  );
}

export default function FiberNearestSummary({ insights }) {
  const visible = insights.fiber_routes_loaded || insights.nearest_fiber_pop_miles != null || insights.nearest_interconnection_miles != null || insights.nearest_lit_building_miles != null;
  if (!visible) return null;
  return (
    <section className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 text-xs">
      <div className="font-black uppercase tracking-widest text-cyan-300">Nearest fiber intelligence</div>
      <div className="mt-2">
        <NearestRow label="Visible route" name={insights.nearest_fiber_route} distance={insights.nearest_fiber_route_miles} />
        <NearestRow label="POP / carrier hotel" name={insights.nearest_fiber_pop} distance={insights.nearest_fiber_pop_miles} />
        <NearestRow label="Interconnection facility" name={insights.nearest_interconnection} distance={insights.nearest_interconnection_miles} />
      </div>
      <p className="mt-2 text-[10px] leading-4 text-slate-500">Straight-line distance from the selected SiteHawk candidate. Generalized data is not exact underground placement.</p>
    </section>
  );
}