/**
 * ViewshedTiles — renders the four N/S/E/W 2D directional viewshed maps that
 * scipViewshed produces, inside a Map Suite sub-step. Pure presentational: it
 * receives the `viewshed` object ({ aerial_ring_url, tower_height_ft, directions })
 * and lays out the aerial ring + the four cardinal tiles with their obstruction
 * read-out. No data fetching here — Section4MapSuite calls scipViewshed and
 * passes the result in, mirroring how the other sub-steps pass data to renderers.
 */

export default function ViewshedTiles({ viewshed }) {
  if (!viewshed) return null;
  const directions = viewshed.directions || [];

  return (
    <div className="absolute inset-0 overflow-auto bg-card p-3">
      {viewshed.aerial_ring_url && (
        <div className="mb-3">
          <div className="text-[11px] font-mono tracking-wider text-muted-foreground mb-1">
            TARGET A AERIAL · {viewshed.tower_height_ft} FT TOWER
          </div>
          <img
            src={viewshed.aerial_ring_url}
            alt="Target A aerial ring"
            className="w-full rounded-lg border border-border"
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {directions.map((d) => (
          <div key={d.short} className="rounded-lg border border-border overflow-hidden">
            <div
              className="px-3 py-1.5 flex items-center justify-between text-white text-sm font-semibold"
              style={{ background: d.color }}
            >
              <span>{d.label}</span>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-mono ${
                  d.clear ? "bg-white/20" : "bg-black/30"
                }`}
              >
                {d.clear ? "CLEAR" : `OBSTRUCTED @ ${d.first_obstruction_mi} mi`}
              </span>
            </div>
            {d.map_url && (
              <img src={d.map_url} alt={`${d.label} viewshed`} className="w-full block" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}