/**
 * SCIPSummaryTab — Tab 2 of the SCIP.
 *
 * Same satellite render as Cell 57 (SARF center waypoint + 0.5/1.0-mi rings)
 * but with three tower pins for Targets 1, 2, and 3 — labeled A / B / C —
 * accompanied by an owner contact table populated from Enformion skip-trace
 * (name, mailing address, phone) for each of the three candidates.
 */

import { useEffect, useMemo, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";
import { skipTrace } from "@/functions/skipTrace";

const IMG_W = 1280;
const IMG_H = 1024;
const ZOOM = 13.6;

const TARGET_COLORS = ["EF4444", "F97316", "EAB308"]; // A red, B orange, C yellow
const TARGET_LABELS = ["A", "B", "C"];

// Pick the top 3 candidates by zoning fitness + match score (same rule as best-candidate picker).
function pickTopThree(candidates) {
  if (!candidates?.length) return [];
  const zoned = candidates.filter(
    (c) => c.zoning_classification && c.zoning_classification.trim() && c.zoning_classification !== "N/A"
  );
  const pool = zoned.length >= 3 ? zoned : candidates;
  return [...pool].sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0)).slice(0, 3);
}

// ─── Geometry ────────────────────────────────────────────────────────
function buildCircle(lat, lon, radiusMiles, points = 96) {
  const coords = [];
  const radiusM = radiusMiles * 1609.344;
  const dx = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const dy = radiusM / 110540;
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([lon + dx * Math.cos(theta), lat + dy * Math.sin(theta)]);
  }
  coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}

function buildGeoJSONOverlay(lat, lon) {
  return encodeURIComponent(
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { stroke: "#DC2626", "stroke-width": 3, "stroke-opacity": 0.95, "fill-opacity": 0 },
          geometry: buildCircle(lat, lon, 1.0),
        },
        {
          type: "Feature",
          properties: { stroke: "#EAB308", "stroke-width": 3, "stroke-opacity": 0.95, "fill-opacity": 0 },
          geometry: buildCircle(lat, lon, 0.5),
        },
      ],
    })
  );
}

function buildSummaryMapUrl(token, sarfLat, sarfLon, targets) {
  const geo = buildGeoJSONOverlay(sarfLat, sarfLon);
  const waypoint = `pin-l-circle+2563EB(${sarfLon},${sarfLat})`;
  const targetPins = targets
    .map((t, i) => {
      if (t.latitude == null || t.longitude == null) return null;
      const color = TARGET_COLORS[i] || "EF4444";
      const label = TARGET_LABELS[i] || "?";
      return `pin-l-${label.toLowerCase()}+${color}(${t.longitude},${t.latitude})`;
    })
    .filter(Boolean)
    .join(",");
  const overlays = [`geojson(${geo})`, waypoint, targetPins].filter(Boolean).join(",");
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
    `${overlays}/${sarfLon},${sarfLat},${ZOOM},0,0/${IMG_W}x${IMG_H}@2x` +
    `?access_token=${token}`
  );
}

// ─── Contact row (single target) ─────────────────────────────────────
function ContactRow({ label, color, target, contact, loading, error, onRetry }) {
  const phones = contact?.phones || [];
  const emails = contact?.emails || [];
  const bestPhone = phones[0];

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="py-2 px-3 align-top">
        <div
          className="inline-flex items-center justify-center w-7 h-7 rounded-full font-bold text-white text-sm"
          style={{ background: `#${color}` }}
        >
          {label}
        </div>
      </td>
      <td className="py-2 px-3 align-top">
        <div className="font-semibold text-foreground text-sm">{target?.site_name || "—"}</div>
        <div className="text-xs text-muted-foreground">{target?.parcel_address || ""}</div>
        <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
          {target?.latitude?.toFixed(5)}, {target?.longitude?.toFixed(5)} · {target?.match_score || 0}% match
        </div>
      </td>
      <td className="py-2 px-3 align-top text-sm">
        <div className="font-semibold text-foreground">{target?.owner_name || "—"}</div>
        <div className="text-xs text-muted-foreground">
          {contact?.mailing_address || target?.owner_mailing_address || "—"}
        </div>
      </td>
      <td className="py-2 px-3 align-top text-sm">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-3 h-3 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
            Looking up...
          </div>
        ) : error ? (
          <div className="text-xs text-red-500">
            {error}
            <button onClick={onRetry} className="ml-2 underline">retry</button>
          </div>
        ) : bestPhone ? (
          <div>
            <div className="font-mono font-semibold text-foreground">{bestPhone.number}</div>
            {bestPhone.type && (
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{bestPhone.type}</div>
            )}
            {phones.length > 1 && (
              <div className="text-[10px] text-muted-foreground mt-1">+{phones.length - 1} more</div>
            )}
            {emails[0] && (
              <div className="text-[10px] text-muted-foreground mt-1 truncate max-w-[180px]">
                ✉ {emails[0].address}
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">Not found</div>
        )}
      </td>
    </tr>
  );
}

// ─── Main component ──────────────────────────────────────────────────
export default function SCIPSummaryTab({ candidate, searchCenter, allResults }) {
  const [open, setOpen] = useState(true);
  const [token, setToken] = useState("");
  const [contacts, setContacts] = useState({}); // keyed by index 0/1/2
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});

  useEffect(() => {
    loadPublicConfig().then((cfg) => setToken(cfg.mapboxAccessToken || ""));
  }, []);

  const sarfLat = searchCenter?.lat ?? candidate?.latitude;
  const sarfLon = searchCenter?.lon ?? candidate?.longitude;

  const targets = useMemo(() => {
    const top = pickTopThree(allResults || [candidate].filter(Boolean));
    // Ensure the primary candidate is always Target A
    if (candidate && top[0]?.id !== candidate.id && top[0]?.parcel_id !== candidate.parcel_id) {
      const without = top.filter((t) => t !== candidate && t.parcel_id !== candidate.parcel_id);
      return [candidate, ...without].slice(0, 3);
    }
    return top;
  }, [candidate, allResults]);

  const runSkipTrace = async (idx) => {
    const t = targets[idx];
    if (!t?.owner_name) return;
    setLoading((l) => ({ ...l, [idx]: true }));
    setErrors((e) => ({ ...e, [idx]: null }));
    try {
      const res = await skipTrace({
        owner_name: t.owner_name,
        mailing_address: t.owner_mailing_address,
        candidate_id: t.id,
        search_id: t.search_id,
      });
      setContacts((c) => ({ ...c, [idx]: res.data }));
    } catch (err) {
      setErrors((e) => ({ ...e, [idx]: err?.response?.data?.error || err.message || "Failed" }));
    } finally {
      setLoading((l) => ({ ...l, [idx]: false }));
    }
  };

  // Auto-trigger skip-trace for all 3 targets on mount (parallel)
  useEffect(() => {
    if (!targets.length) return;
    targets.forEach((_, idx) => runSkipTrace(idx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets.length]);

  if (sarfLat == null || sarfLon == null) return null;

  const mapUrl = token ? buildSummaryMapUrl(token, sarfLat, sarfLon, targets) : null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#0C1B2E] text-white hover:bg-[#13294a] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 text-xs font-bold uppercase tracking-widest">Summary</span>
          <span className="font-heading font-bold">Top 3 Targets — Owners & Contact Info</span>
        </div>
        <span className="text-cyan-400 text-sm">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Top 3 candidates ranked by zoning + match score, pinned on the same satellite render as Cell 57.
            Owner contact info is pulled live from the Enformion skip-trace API.
          </p>

          {/* Summary map */}
          {mapUrl ? (
            <div className="rounded-lg overflow-hidden border border-border bg-[#0a0e17]">
              <img
                src={mapUrl}
                alt="Top 3 Targets — Summary Map"
                crossOrigin="anonymous"
                className="w-full block"
                style={{ aspectRatio: `${IMG_W}/${IMG_H}`, objectFit: "cover" }}
              />
            </div>
          ) : (
            <div className="py-12 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          )}

          {/* Legend */}
          <div className="flex gap-3 flex-wrap text-[11px] font-mono">
            {targets.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full font-bold text-white text-[10px]"
                  style={{ background: `#${TARGET_COLORS[i]}` }}
                >
                  {TARGET_LABELS[i]}
                </span>
                <span className="text-muted-foreground truncate max-w-[200px]">
                  {t.site_name || t.parcel_address || `Target ${TARGET_LABELS[i]}`}
                </span>
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 ml-auto">
              <span className="w-3 h-3 rounded-full bg-blue-600 border border-blue-800" />
              <span className="text-muted-foreground">SARF center</span>
            </span>
          </div>

          {/* Owner contact table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#0d1829] text-white">
                <tr>
                  <th className="text-left py-2 px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 w-12">Tgt</th>
                  <th className="text-left py-2 px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400">Site / Parcel</th>
                  <th className="text-left py-2 px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400">Owner & Mailing Address</th>
                  <th className="text-left py-2 px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400">Phone / Email</th>
                </tr>
              </thead>
              <tbody className="bg-card">
                {targets.map((t, i) => (
                  <ContactRow
                    key={i}
                    label={TARGET_LABELS[i]}
                    color={TARGET_COLORS[i]}
                    target={t}
                    contact={contacts[i]}
                    loading={loading[i]}
                    error={errors[i]}
                    onRetry={() => runSkipTrace(i)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-[10px] text-muted-foreground pt-1">
            Source: Mapbox Satellite-Streets (base) · Enformion (skip-trace owner contacts)
          </div>
        </div>
      )}
    </div>
  );
}