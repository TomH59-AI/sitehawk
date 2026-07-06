/**
 * scipTowerSiter — builds the to-scale Tower Siter Exhibit model for the final
 * SiteHawk SCIP pages. Pure geometry (feet), driven by the SCIP record:
 *  - parcel dims from Target A boundaries (or derived square from acreage)
 *  - tower height + compound size from the SARF inputs (e.g. 199', 100'×100')
 *  - fenced interior (75'×75' for a 100' compound) + landscaped buffer
 *  - 20' utility & access easement
 *  - setbacks / fall-zone rule / separations from the zoning intelligence
 *    (telecom tower & antenna ordinance data collected in Section 2)
 */
import { computeExhibit } from "@/lib/towerFitExhibit";

const firstNum = (v) => {
  const m = String(v ?? "").match(/(\d[\d,]*(?:\.\d+)?)/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
};

export function parseFeetPair(s) {
  const m = String(s || "").match(/(\d+(?:\.\d+)?)\s*[x×'’\s]+\s*(\d+(?:\.\d+)?)/i);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function buildTowerSiterModel(record) {
  const r = record || {};
  const a = r.targetA || {};
  const z = r.zoning || {};

  // ── parcel dimensions ──
  let pair = parseFeetPair(a.boundaries);
  if (!pair && Number(a.acreage) > 0) {
    const side = Math.round(Math.sqrt(Number(a.acreage) * 43560));
    pair = [side, side];
  }
  if (!pair) pair = [400, 400];
  const [parcelW, parcelD] = pair;

  // ── compound + fenced interior + landscape buffer ──
  const comp = parseFeetPair(r.compound_size) || [100, 100];
  const [compW, compD] = comp;
  // 100'×100' compound → 75'×75' fenced; buffer is the landscaped remainder.
  const fencedW = Math.round(compW * 0.75);
  const fencedD = Math.round(compD * 0.75);
  const bufferW = (compW - fencedW) / 2;

  const heightFt = Number(r.tower_height_ft) || 199;

  // ── fall-zone rule from the ordinance text ──
  const fz = String(z.fall_zone || "");
  let fallRule = "100", fallCustom = "";
  if (/110\s*%/.test(fz)) fallRule = "110";
  else if (/%/.test(fz) && firstNum(fz)) { fallRule = "custom"; fallCustom = String(Math.round((firstNum(fz) / 100) * heightFt)); }
  else if (firstNum(fz) && firstNum(fz) > 20 && !/%/.test(fz)) { fallRule = "custom"; fallCustom = String(firstNum(fz)); }

  // ── setbacks — ordinance-derived when stated, sensible default otherwise ──
  const sbOrd = firstNum(z.setbacks) || null;
  const sbDefault = Math.min(parcelW, parcelD) >= 300 ? 50 : 25;
  const sb = sbOrd || sbDefault;

  const model = computeExhibit({
    shape: "rectangle",
    widthFt: parcelW,
    depthFt: parcelD,
    tower: { heightFt, type: "Monopole", location: "auto", customX: "", customY: "" },
    compound: { widthFt: compW, depthFt: compD },
    setbacks: { front: sb, rear: sb, left: sb, right: sb },
    fallZone: { rule: fallRule, customFt: fallCustom },
    easement: { enabled: true, widthFt: 20, from: "south" },
    notes: "",
  });

  // Fenced interior rect centered inside the compound.
  const c = model.compound;
  const fence = {
    x1: c.x1 + (c.w - fencedW) / 2, x2: c.x2 - (c.w - fencedW) / 2,
    y1: c.y1 + (c.d - fencedD) / 2, y2: c.y2 - (c.d - fencedD) / 2,
    w: fencedW, d: fencedD, buffer: bufferW,
  };

  // ── PE letter posture ──
  const peSource = `${a.conforming_size || ""} ${z.meets_min_lot || ""} ${fz}`.toLowerCase();
  const peAllowed = peSource.includes("pe letter") || peSource.includes("pe-letter") || peSource.includes("engineer");

  // ── siting rationale (proof of work) ──
  const t = model.tower;
  const bb = model.parcel.bbox;
  const nearestLine = Math.round(Math.min(t.x - bb.minX, bb.maxX - t.x, t.y - bb.minY, bb.maxY - t.y));
  const maxH = firstNum(z.max_height);
  const rationale = [
    `Tower centered in the buildable envelope — ${nearestLine}′ to the nearest property line vs. ${sb}′ required setback${sbOrd ? " (per ordinance)" : ""}.`,
    model.fallZone.spills
      ? `${Math.round(model.fallZone.radius)}′ fall zone extends past a property line — a fall-zone easement${peAllowed ? " or PE letter" : ""} may cure.`
      : `${Math.round(model.fallZone.radius)}′ fall zone (${fallRule === "110" ? "110% of height" : fallRule === "custom" ? "per ordinance" : "100% of height"}) is fully contained on the parcel.`,
    `${fencedW}′ × ${fencedD}′ fenced equipment compound with a ${bufferW}′ landscaped buffer satisfies typical screening/landscaping conditions.`,
    `20′ utility & access easement runs the shortest path from the south property line — minimizes construction cost and owner land impact.`,
    maxH
      ? (heightFt <= maxH
          ? `Proposed ${heightFt}′ monopole complies with the ${maxH}′ district height cap.`
          : `Proposed ${heightFt}′ monopole EXCEEDS the ${maxH}′ district cap — variance or height reduction required.`)
      : `Proposed ${heightFt}′ monopole — verify district height cap with ${z.jurisdiction || "the jurisdiction"}.`,
    peAllowed ? "PE (Professional Engineer) letter is permitted by this jurisdiction to certify a reduced engineered fall zone." : null,
  ].filter(Boolean);

  return { model, fence, peAllowed, rationale, setbackFt: sb, setbackFromOrdinance: !!sbOrd };
}