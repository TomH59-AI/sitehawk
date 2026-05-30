import { SKYWAVE } from "@/lib/skywave";

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 6, fontSize: "9pt", padding: "2px 0" }}>
      <span style={{ color: SKYWAVE.navy, fontWeight: 700, minWidth: 120 }}>{label}:</span>
      <span style={{ color: SKYWAVE.ink }}>{value}</span>
    </div>
  );
}

function MapBlock({ title, sub, url }) {
  return (
    <div>
      <div style={{
        padding: "4px 8px", background: SKYWAVE.blue, color: "#fff", fontWeight: 700,
        fontSize: "10pt", textTransform: "uppercase", display: "flex", justifyContent: "space-between",
        borderTopLeftRadius: 6, borderTopRightRadius: 6,
        printColorAdjust: "exact", WebkitPrintColorAdjust: "exact",
      }}>
        <span>{title}</span>
        {sub && <span style={{ fontWeight: 500, opacity: 0.9 }}>{sub}</span>}
      </div>
      <div style={{ height: "3.8in", border: `1px solid ${SKYWAVE.line}`, borderTop: "none", background: SKYWAVE.bg }}>
        {url ? (
          <img src={url} alt={title} crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: SKYWAVE.muted, fontSize: "9pt" }}>
            Not generated
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScipPowerAirportPage({ data = {} }) {
  const power = data.power || null;
  const airport = data.airport || null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <MapBlock title="Electric Service" sub={power?.distance_miles != null ? `${power.distance_miles} mi to provider` : null} url={power?.map_url} />
        {power && (
          <div style={{ padding: "6px 4px" }}>
            <InfoRow label="Provider" value={power.provider_name} />
            <InfoRow label="Type" value={power.provider_type} />
            <InfoRow label="Address" value={power.provider_address} />
            <InfoRow label="Phone" value={power.provider_phone} />
            <InfoRow label="Website" value={power.provider_website} />
            <InfoRow label="Transmission Owner" value={power.line_owner} />
            <InfoRow label="Voltage" value={power.line_voltage_kv ? `${power.line_voltage_kv} kV${power.line_voltage_class ? ` (class ${power.line_voltage_class})` : ""}` : null} />
            <InfoRow label="Line" value={power.line_endpoints} />
          </div>
        )}
      </div>

      <div>
        <MapBlock title="Nearest Airport" sub={airport?.airport_callnumber || null} url={airport?.map_url} />
        {airport && (
          <div style={{ padding: "6px 4px" }}>
            <InfoRow label="Airport" value={airport.airport_name} />
            <InfoRow label="Type" value={airport.airport_type} />
            <InfoRow label="Distance" value={airport.distance_label} />
          </div>
        )}
      </div>
    </div>
  );
}