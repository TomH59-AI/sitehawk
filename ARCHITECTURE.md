# SiteHawk — Ordinance & Siting Architecture

Read this before changing anything under `base44/shared/`, `base44/functions/codehawk*`,
`base44/functions/talonfitSolve`, or `src/lib/HawkPerchSolver*`.

Each rule below exists because breaking it produces a wrong number in a customer
deliverable — usually silently. Several were bugs that shipped and got fixed.

---

## 1. CodeHawk — what the ordinance says

`base44/functions/codehawk*` + `base44/shared/codehawk.ts` + `codehawkRun.ts`

Fills `TelecomOrdinance` with tower rules, cited to the published code.

**Registry first.** Every lookup checks `TelecomOrdinance` before spending anything.
`codehawkHunt` returns instantly on a complete record.

**The strict gate — do not relax this.** A value is written only if it has:
a verbatim quote that is *programmatically found in the scraped source text*,
a section reference, a passing adversarial QC verdict, confidence above `low`,
and no conflict with what is already on file. Everything else goes to
`OrdinanceReviewQueue`. The quote-in-source check is the real guard — an LLM
saying it found a quote is not evidence that the quote exists.

**The agent has READ-ONLY registry access.** `base44/agents/ordinance_hunter.jsonc`
must never be granted create/update on `TelecomOrdinance`. Uncited agent writes are
how the registry filled with 1,203 valueless rows in the first place.

**Fetch order is direct → OxyLabs → Scrapfly**, and all candidates are tried
*directly and in parallel* before ANY paid escalation, then only one candidate
escalates. Reverting to "escalate everything" turns a 25-jurisdiction night into
~100 OxyLabs calls.

**A failed hunt is stamped.** `last_verified_date` is written even when nothing is
found, so the 30-day cooldown applies. Without it the nightly batch re-grinds the
same dead ends forever and never advances.

**Un-Incorporated Jurisdiction is a real answer.** When a governing body has adopted
no zoning, the tower rows say so and *overwrite* the AI gap-fill. Inferred setbacks
for a place with no adopted setbacks are worse than useless — an agent could design
to a fall zone that legally does not exist.

**County-equivalents are state-aware** (`countyEquivalentLabel`). LA = Parish,
AK = Borough, CT/RI = no county government at all. In PA/NJ a "Borough" is a
*municipality*, so the county-word pattern must stay state-scoped.

---

## 2. TalonFit / HawkPerch — will it fit, how tall

`base44/shared/hawkPerchSolver.ts` (canonical) · `src/lib/HawkPerchSolver.ts` (re-export)

**THE LLM NEVER DOES THE GEOMETRY.** The solver is deterministic and covered by
203 tests, three of them checked against hand-derived analytic optima. The product
claim is "it won't make mistakes"; that rests entirely on determinism. If an agent
ever computes a setback or a height, that claim is gone. `base44/agents/talonfit.jsonc`
says this explicitly — keep it there.

**One implementation, two consumers.** The solver lives in `base44/shared/` because
backend functions cannot import from `src/`, but the frontend *can* import from
`base44/shared/`. This was tested both directions. Do not create a second copy for
the frontend — two copies of siting math drift, and the day they disagree a client
hears two different maximum heights for the same parcel.

**Grader, not bouncer.** Nothing is rejected; every point gets a max height, a rung,
and ladder points. A FAIL is scored and reported with its binding constraint. That
is what makes Target A/B/C rankable, and a FAIL tells an acquisition agent which
door not to knock on.

**Frontage is OPTIONAL, not core.** Tower ordinances write one setback "from all
property lines", and the registry stores one `setback_ft`. When setbacks are uniform,
`talonfitSolve` skips the road fetch entirely (`frontage.method: 'not_required'`).
Do not put Overpass back on the critical path — it 504s under load, and it cannot
answer the question that actually matters.

**Residential adjacency comes from PARCEL data, never roads.** Roads cannot tell you
what the neighbour is zoned. `residentialAdjacency.ts` pulls Realie neighbours,
classifies them with a byte-compatible copy of `resolveZoneClass` from
`realieParcelsInRing`, and probes *outward* from each edge — which is why a house
across a right-of-way correctly does not flag. Keep the two classifiers identical.

**"Could not check" ≠ "nothing found."** If Realie is unreachable the report keeps
warning that the residential rule was NOT applied. Never convert a failed lookup
into an all-clear.

**Never invent a certified collapse radius.** `pe_fall_zone_allowed` means the
ordinance *permits* a PE-certified reduction. The radius itself comes from a licensed
engineer. The modelled `pe_scenario` always carries its illustrative-only caveat.

---

## 3. The subscriber path

`base44/functions/generateZoningPermitReport/entry.ts`

**The SCIP zoning section must always come back filled.** The LLM gap-fill fills
every row; the registry overlays on top of it. CodeHawk runs *in parallel* with the
gap-fill on a 45-second budget and can only ADD. It must never block, empty a field,
or fail the SCIP.

**City, then county.** Most tower sites are on unincorporated land where the COUNTY
governs. Looking up only the city skipped the registry for all of them.

**Rows carry their provenance.** `SiteHawk Registry (cited)` vs `SiteHawk Registry`
vs AI, and `normalizeSource` in `section2/SourceBadge.jsx` must keep the `registry`
case — without it, our best-sourced data was badged "Manual".

---

## 4. Shadow mode — NOT user-facing

`src/lib/solverShadow.ts` · `SolverShadowDiff` · `/talonfit` admin panel

The live `hawkfitGeometry.computeFit` is still authoritative. The v2 solver runs
alongside on every fit check and records disagreements only. It is fed the *identical*
setbacks and cap as the live call site, so any diff is the engine, not the inputs.
Every path is fire-and-forget: a diagnostic that breaks the product it is diagnosing
is worse than no diagnostic.

**The known live-engine defect:** `computeFit` applies `max(front, side, rear)` as one
setback to every edge, rejecting points that clear their own edge's rule. That is the
main thing the cutover fixes. Review the shadow panel before switching.

---

## 5. Secrets

All API keys (`REALIE_API_KEY`, `OXYLABS_*`, `SCRAPFLY_API_KEY`, `MAPBOX_*`) live in
Base44's secret store and are read server-side via `Deno.env.get` / `secrets.get`.
**Never hardcode a key in this repo** — it lands in git history permanently and
rotating it becomes a code change instead of a settings change.

---

## Test suites

```
npx esbuild src/lib/<name>.ts --bundle --platform=node --format=esm \
  --outfile=/tmp/t.mjs && node /tmp/t.mjs
```

`HawkPerchSolver.smoke` (15) · `HawkPerchSolver.hardening` (48) ·
`ordinanceToSolver.smoke` (48) · `frontageDetect.smoke` (37) ·
`solverShadow.smoke` (25) · `residentialAdjacency.smoke` (30)

`__realworld.probe.ts` runs the solver against live OpenStreetMap geometry — it is a
probe, not a unit test, and needs network.

**Run all six before merging anything in this area.** Several of the tests above
encode a specific bug that already shipped once; a green suite is the only cheap
proof they have not come back.
