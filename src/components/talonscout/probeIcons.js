import L from "leaflet";

// TalonFit™ probe pins — a clicked point inside the 2-mile search ring becomes a
// standing marker so the subscriber builds a picture of the whole ring.
// Green tower = buildable at the requested height. Red = rejected. Amber = verify.
const STYLE = {
  fit: { color: "#16a34a", label: "BUILDABLE" },
  ejected: { color: "#dc2626", label: "REJECTED" },
  verify: { color: "#d97706", label: "VERIFY" },
  pending: { color: "#64748b", label: "CHECKING…" },
};

function towerSvg(color) {
  return `<svg width="22" height="30" viewBox="0 0 20 26" fill="none">
    <path d="M10 6 L3 25 M10 6 L17 25 M5.6 17 H14.4 M4.3 22 H15.7" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="10" cy="4" r="2.6" fill="${color}"/>
  </svg>`;
}

// A rejected point still reports the height it COULD carry when the solver
// produced one — the chip never invents a number it wasn't given.
export function probePinIcon(probe) {
  const s = STYLE[probe.verdict] || STYLE.pending;
  const maxFt = Number(probe.max_height_ft);
  const chip =
    probe.verdict === "pending"
      ? s.label
      : Number.isFinite(maxFt) && maxFt > 0
      ? `${s.label} · ${maxFt} FT`
      : s.label;
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;filter:drop-shadow(0 1px 3px rgba(0,0,0,.7))">
      ${towerSvg(s.color)}
      <span style="margin-top:-3px;background:${s.color};color:#fff;font:800 9px/1 system-ui;letter-spacing:.05em;padding:3px 5px;border-radius:3px;white-space:nowrap;border:1px solid rgba(255,255,255,.85)">${chip}</span>
    </div>`,
    iconSize: [90, 44],
    iconAnchor: [45, 40],
    popupAnchor: [0, -40],
  });
}