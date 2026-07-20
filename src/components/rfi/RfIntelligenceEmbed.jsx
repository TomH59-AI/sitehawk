// "The RF Intelligence Map" — embedded randymajors.org custom map (counties,
// cities, townships, zip codes). Lives inside the Nationwide RF Intelligence
// Map section and follows the pipeline's active Target A: the marker (x/y)
// tracks Target A while the map centers (cx/cy) on it too.
function buildEmbedUrl(lat, lon) {
  const params = new URLSearchParams({
    x: lon.toFixed(7),
    y: lat.toFixed(7),
    cx: lon.toFixed(7),
    cy: lat.toFixed(7),
    zoom: "11",
    mapbuilder: "true",
    labels: "show",
    title: "SiteHawk",
    counties: "show",
    cities: "show",
    townships: "show",
    zipcodes: "show",
  });
  return `https://www.randymajors.org/customgmap?${params}`;
}

export default function RfIntelligenceEmbed({ lat, lon }) {
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
  return (
    <div className="space-y-2">
      <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-primary/15 via-transparent to-transparent border border-primary/30">
        <div className="font-heading font-bold text-foreground">The RF Intelligence Map</div>
        {hasCoords && (
          <div className="text-xs text-muted-foreground mt-0.5 font-mono">
            Centered on Target A · {lat.toFixed(5)}, {lon.toFixed(5)}
          </div>
        )}
      </div>
      {hasCoords ? (
        <iframe
          key={`${lat},${lon}`}
          src={buildEmbedUrl(lat, lon)}
          title="The RF Intelligence Map"
          className="w-full rounded-xl border border-border bg-white"
          style={{ height: "500px" }}
          allowFullScreen
        />
      ) : (
        <div className="w-full h-[500px] rounded-xl border border-border bg-muted/30 flex items-center justify-center text-sm text-muted-foreground">
          Resolve Target A in Section 3 to load The RF Intelligence Map.
        </div>
      )}
    </div>
  );
}