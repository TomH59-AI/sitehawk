/**
 * sketchUtilityLines — turns the pipeline's already-measured fiber and power
 * findings into the short strings written on the Live Site Sketch.
 *
 * NEVER invents a distance. When a source returned nothing, the line reads
 * "No data available" with the source named, so the sketch is explicit rather
 * than silent. Distances are shown at whatever range they were measured at —
 * far-away infrastructure is still written on the drawing.
 */

const fmtFt = (ft) => `${Math.round(ft).toLocaleString()}′`;
const fmtMi = (mi) => `${Number(mi).toFixed(2)} mi`;

export function buildSketchUtilityLines(sectionData = {}) {
  const lines = [];
  const fiber = sectionData.fiber || null;
  const power = sectionData.power_grid || null;

  if (fiber) {
    const d = Number(fiber.distance_ft);
    const where = Number.isFinite(d)
      ? `${fmtFt(d)}${d >= 5280 ? ` (${fmtMi(d / 5280)})` : ""}`
      : "No data available (OSM / FCC BDC)";
    const who = fiber.operator || fiber.asset || (fiber.fcc_providers?.[0] ?? "");
    lines.push({
      color: "fiber",
      text: `FIBER — ${where}${who ? ` · ${who}` : ""}${fiber.assumed ? " · ROW-inferred" : ""}`,
    });
  } else {
    lines.push({ color: "fiber", text: "FIBER — No data available (run Fiber Optics Map)" });
  }

  if (power) {
    const mi = Number(power.nearest_substation_mi);
    const where = Number.isFinite(mi) ? fmtMi(mi) : "No data available (HIFLD)";
    const kv = power.substation_voltage_kv ? ` · ${power.substation_voltage_kv} kV` : "";
    const who = power.serving_utility ? ` · ${power.serving_utility}` : "";
    lines.push({ color: "power", text: `POWER — nearest substation ${where}${kv}${who}` });
  } else {
    lines.push({ color: "power", text: "POWER — No data available (run Power Map)" });
  }

  return lines;
}