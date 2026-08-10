# ForgeQuote — Pricing, DFM & Parameter Reference

Last updated: 2026-08-10

This is the single reference for how ForgeQuote turns a CAD file into a price:
every parameter measured, every constant used, every formula applied, and how
accurate each stage is. Implementation lives in:

| Concern | File |
|---|---|
| Pricing engine | `backend/app/services/pricing.py` |
| Geometry extraction | `backend/app/services/geometry.py` |
| Exact B-rep (STEP) | `backend/app/services/brep.py` |
| Thread detection | `backend/app/services/threads.py` |
| DFM rules | `backend/app/services/dfm.py` |
| GST / invoice math | `backend/app/services/document.py` |
| Per-user pricing catalog | `backend/app/services/catalog.py` |
| Seeded config values | `backend/app/seed.py` |
| Vendor matching | `backend/app/services/vendor_matching.py` |
| API endpoints | `backend/app/api/quotes.py` |
| Schemas / overrides | `backend/app/schemas/schemas.py` |
| Receipt UI | `frontend/src/components/PricingDisplay.tsx` |
| Tests | `backend/tests/test_smoke.py`, `test_pricing_inspection.py`, `test_pricing_audit_fixes.py` |

---

## 1) Estimation Philosophy — What the Engine Is (and Isn't)

The engine derives times **parametrically from measured geometry** — removal
volume ÷ material MRR, per-hole drilling seconds sized by fitted diameters,
finishing time from surface area, tool changes from complexity, setups from
measured B-rep orientations, DFM rules adding cycle % — all calibrated to
market benchmarks. That's the same class of model Xometry-style platforms use
for instant quotes. It's **consistent and defensible, but it's a statistical
estimate, not a physics guarantee**, because a mesh doesn't tell you
toolpaths.

The two guarantees the system *does* provide today:

1. **Transparency** — every minute and rupee is itemized in
   `pricing_explanation` and the receipt UI, so any assumption can be audited.
2. **Overridability** — every rate, time, percentage, margin and lead time
   can be overridden per quote (`pricing_overrides`) or globally (Cost
   Master / per-user catalog).

A full accuracy audit (2026-08-10) reviewed every formula against real test
parts and fixed a dozen issues — see §13 for the complete list and §14 for
what's still open.

---

## 2) Data Flow

```
CAD upload (.step/.stp/.stl, content-validated)
  → geometry analysis (trimesh mesh + exact OpenCascade B-rep for STEP;
    deterministic seed=42; cached in Redis by file hash)
  → GeometryAnalysis row (volume, bbox, holes, walls, complexity, threads, …)
  → DFM analysis (rule engine — canonical, computed backend-side)
  → vendor matching (best-fit vendor load + machine rate feed the engine)
  → pricing engine (per-part cost → overheads → margins → market multipliers)
  → PricingResponse / Quote (full explanation payload)
  → receipt UI, quote PDF (+ GST breakup), customer share page
```

## 3) Geometry Parameters Measured Per File

Extracted in `geometry.py` / `brep.py`; all downstream numbers derive from
these. STEP files get **exact** volume/area/bbox from OpenCascade's B-rep
(`analysis_library = "ocp-brep-exact"`) instead of mesh estimates whenever
the optional `cadquery-ocp` dependency is installed.

| Parameter | Method | Units |
|---|---|---|
| `volume` | exact B-rep (STEP) or watertight mesh volume | cm³ |
| `surface_area` | exact B-rep (STEP) or triangle-area sum | cm² |
| `bounding_box` x/y/z (+volume) | axis-aligned extents | cm / cm³ |
| `complexity_score` | `surface_area^1.5 / volume` (scale-robust) | — |
| `removal_ratio` | `volume / bbox_volume` | 0–1 |
| `hole_count` | B-rep cylindrical-face grouping (STEP) or boundary-loop clustering (mesh) | count |
| `hole_diameters_mm` | exact fit (STEP) or circle fit on boundary loops (mesh) | mm list |
| `estimated_thread_count` | fitted hole diameters matched against standard ISO tap-drill sizes (`threads.py`) | count |
| `min_wall_thickness` | seeded ray sampling (500 rays, `seed=42`, deterministic) | mm |
| `machining_direction_count` | distinct hole-axis direction clusters, 10° tolerance (STEP only) | count |
| `solid_count` | distinct solid bodies in the file (STEP only); >1 = assembly | count |
| `triangle_count` | mesh statistic | count |

The 3D viewer independently verifies dimensions/volume client-side via the
Part Info panel and Bounding Box overlay — both now read the backend's exact
numbers rather than a client-side mesh approximation (2026-08 fix, §13).

### 3.1 Thread detection

`threads.py` matches each fitted hole diameter against the standard ISO
metric coarse-thread tap-drill table (M2 → 1.6 mm ... M24 → 21.0 mm, ±0.15 mm
tolerance). STEP files rarely model the actual thread helix — a tapped hole
and a plain drilled hole are geometrically identical cylinders — so the
tap-drill size is the only reliable signal available from geometry alone.
When no fitted diameters exist (STL, or B-rep unavailable), the engine falls
back to a flat `round(hole_count × 0.2)` guess. The detected count and
per-hole matches (`{diameter_mm, likely_thread}`) are exposed as
`details.machining.thread_count` / `threaded_holes`, and used for the
threading time term (§6.2) instead of the flat guess whenever real diameters
are available.

## 4) Configuration Defaults (Seed Values, current)

Re-seed with `docker compose exec backend python -m app.seed` (upserts by
name). A user with their own Cost Master / catalog entries prices against
those instead of the shared defaults (`catalog.resolve_machine_rate`, etc.) —
their own rows always win, falling back to system defaults for anything
they haven't customised.

### 4.1 Materials

| Material | Density g/cm³ | Cost ₹/kg | Difficulty | Availability |
|---|---:|---:|---:|---:|
| Aluminum 6061-T6 | 2.70 | 320 | 0.8 | 1.0 |
| Aluminum 7075-T6 | 2.81 | 520 | 0.8 | 1.1 |
| Mild Steel 1018 | 7.87 | 70 | 1.0 | 1.0 |
| Stainless Steel 304 | 8.00 | 260 | 1.5 | 1.0 |
| Stainless Steel 316 | 8.00 | 380 | 1.6 | 1.1 |
| Brass C360 | 8.50 | 620 | 0.7 | 1.0 |
| POM / Delrin | 1.41 | 380 | 0.6 | 1.0 |
| PEEK | 1.32 | 8000 | 0.6 | 1.3 |
| Nylon 6/6 | 1.14 | 320 | 0.6 | 1.0 |
| Titanium Grade 5 | 4.43 | 3500 | 2.0 | 1.5 |

`machining_difficulty_factor` divides effective MRR (harder → slower).
`availability_factor` is the material-procurement floor for lead time (days).

### 4.2 Machine Rates

| Machine | ₹/hr | Efficiency | Setup hr | Default |
|---|---:|---:|---:|---|
| 3 Axis VMC | 700 | 0.75 | 0.75 | ✓ |
| 4/5 Axis VMC | 2200 | 0.72 | 1.0 | |
| CNC Turning Centre | 500 | 0.80 | 0.5 | |
| Turn Mill | 800 | 0.75 | 0.75 | |

### 4.3 Surface Finishes

| Finish | Multiplier | Lot fixed ₹ | Lead +days |
|---|---:|---:|---:|
| As Machined | 1.00 | 0 | 0 |
| Bead Blasted | 1.10 | 1000 | 1 |
| Anodized Type II (Clear) | 1.20 | 1200 | 2 |
| Anodized Type II (Color) | 1.25 | 1500 | 3 |
| Anodized Type III (Hard) | 1.40 | 2800 | 3 |
| Powder Coated | 1.30 | 2000 | 2 |
| Electroless Nickel | 1.35 | 3000 | 3 |
| Passivated | 1.10 | 1200 | 1 |
| Polished (Mirror) | 1.50 | 2800 | 2 |

**"As Machined" is the default finish selection in the UI** (2026-08 fix,
§13) — previously whichever finish happened to load first from the API.

Finishes may also carry `rate_per_kg`, `rate_per_sq_inch`, `rate_per_sq_ft`,
`rate_per_piece` — all applied additively when non-zero (§6.5).

### 4.4 Inspection Levels

| Inspection | Fixed ₹/lot | % of cost basis | Lead +days | CMM |
|---|---:|---:|---:|---|
| Standard Visual | 0 | 0% | 0 | – |
| Dimensional Inspection | 1000 | 0% | 0.5 | – |
| CMM Inspection | 3000 | 2% | 1.0 | ✓ |
| First Article Inspection (FAI) | 6000 | 5% | 2.0 | ✓ |

**FAI is priced as a one-time charge amortized across the batch, not a
per-part charge** (2026-08 fix, §13) — see §6.6.

## 5) Engine Constants (`pricing.py`)

### 5.1 Machine-rate clamps (₹/hr) — sanity bounds on configured rates
- 3-axis: 500–1200 · 5-axis: 2000–3000 · lathe: 400–800
- A configured rate is clamped straight into this range. (The old "divide by
  10 if over 3000" legacy-data hack was removed in the 2026-08 audit — it
  could silently mangle a genuinely-configured premium rate; the clamp alone
  already neutralizes stale data.)

### 5.2 Material rate benchmark clamps (₹/kg)
Al 6061 300–350 · Al 7075 450–600 · brass 600–750 · nylon 250–400 ·
PEEK 7000–9000 · POM 300–450 · MS1018 70–100 · SS304 220–300 ·
SS316 300–450 · Ti Gr5 3000–4500 · EN8 90–140

### 5.3 Effective MRR (cm³/min) — full-cycle averages, not peak roughing
Aluminum 10–20 · steel 4–8 · stainless 3–6 · brass 6–10 · plastic 12–22 ·
titanium 2–4 · fallback 4–8. Complexity interpolates from the top of the
range (simple part) to the bottom (complex part). Bulk stock removal itself
runs at **3× this band** (`roughing_mrr`) since the blended figure already
has finishing feeds folded in — charging every roughed cm³ at the blended
rate double-counted finishing time.

### 5.4 Tooling base ₹/batch
Aluminum 120 · steel/brass 200 · stainless 350 · titanium 500 · plastic 100

Plus wear consumption charged per spindle-hour actually cut (not per
feature): aluminum 80 · steel 150 · stainless 250 · brass 100 · plastic 40 ·
titanium 500 ₹/hr.

### 5.5 Secondary op benchmarks ₹/part
Anodizing 15–40 · powder coating 25–70 · heat treatment 20–80

### 5.6 Quality benchmarks ₹/part (base inspection labor, before fixed/% add-ons)
Basic 10–20 · vernier/gauges 20–50 · CMM 100–300

### 5.7 Marketplace defaults
Vendor margin 18% · platform commission 8% · vendor overhead 15% (10–20%) ·
platform overhead 7% (5–10%) · risk 5–20% · vendor load 70% ·
negotiation buffer 7% (5–10%) · MOQ disabled by default.

These compound multiplicatively (margin × commission × overheads × risk ×
load × surge × negotiation), which typically lands the effective markup over
direct cost around **80–100%** — noticeably higher than any single knob
suggests. **Vendor margin and the resulting effective markup are always
editable in the receipt UI**, with a highlighted note that the default runs
high (2026-08 UI fix).

### 5.8 Volume discount tiers (on unit price, beyond fixed-cost spreading)
qty ≥ 100 → −5% · ≥ 250 → −8% · ≥ 500 → −12%
(`details.quantity.discount_percentage` now reports this correctly — it was
hardcoded to 0 regardless of the real discount applied, 2026-08 fix.)

### 5.9 Tolerance tiers
| Tier | Machining × | Inspection × | Lead +days |
|---|---:|---:|---:|
| General ±0.10 mm | 1.00 | 1.0 | 0 |
| Precision ±0.05 mm | 1.35 | 1.5 | 0.5 |
| Tight ±0.01 mm | 2.00 | 2.5 | 1.5 |

### 5.10 Stock-size sanity cap

A milled billet or turned bar is sized from the bounding box (§6.1). For a
part whose real volume is a tiny fraction of that box — a long thin rail, or
a mostly-hollow shell with a huge bounding box — the naive model can call for
a billet dozens of times the finished part's weight. A real shop would
switch to extruded/near-net/sheet stock rather than actually machine
something that large, so **buy weight is capped at 15× the part's raw
weight** (2026-08 fix, §13); the material section reports
`stock_size_capped: true` when this kicks in, and the UI shows a "needs
manual review" note.

## 6) Pricing Formula, Step by Step

Per-part cost is computed first, then rolled to order total.
`complexity_norm = clamp((complexity_score − 14) / 18, 0, 1)` is used
throughout the *cost* formulas (simple prismatic ≈ 0, highly complex ≈ 1).
This is a separate, independently-calibrated scale from the DFM severity
thresholds in §9.2 — recalibrating one does not change the other.

### 6.1 A — Material (stock model per process)

**Turning** (inferred from machine name, not removal profile — a low
removal ratio alone doesn't mean round stock): round bar `π/4 · d² · L`
where the turning axis is the bbox dimension whose two perpendicular
dimensions are most similar; +5% parting/facing allowance. Reported as
`round_bar` with `diameter_mm × length_mm`.

**Milling**: full sawn billet = bounding box + **3 mm machining/saw
allowance per side**.

```
raw_weight_kg  = volume_cm3 × density / 1000          (finished part)
buy_weight_kg  = stock_volume_cm3 × density / 1000    (billet or bar)
buy_weight_kg  = min(buy_weight_kg, raw_weight_kg × 15)   (§5.10 cap)
wastage_pct    = buy/raw − 1                          (reported, derived)
rate           = clamp(configured ₹/kg, benchmark range)
material_gross = buy_weight_kg × rate
scrap_credit   = (buy − raw) kg × scrap_₹/kg          (optional subtract)
min_charge     = max(₹150, rate × 0.5 kg)             (§6.1.1)
```

#### 6.1.1 Minimum stock charge

No supplier sells a 30 g offcut at bare weight price. The floor is now
**material-rate-scaled** (2026-08 fix) — `max(₹150, effective_rate × 0.5 kg)`
— instead of a flat ₹150 regardless of material, which understated the real
minimum for expensive materials (a titanium offcut floored at the same ₹150
as an aluminum one).

#### 6.1.2 Scrap saving toggle

The leftover offcut (`buy_weight − raw_weight`) has resale value as scrap
metal. The "Scrap Saving" toggle in the Raw Material breakdown controls
whether that resale value is credited back to reduce the customer's material
cost ("included") or the customer pays the full billet cost with no credit
("excluded").

### 6.2 B — Machining time & cost

```
removal_cm3        = bbox_volume − part_volume
base_mrr           = mrr_min + (mrr_max − mrr_min) × (1 − complexity_norm)
adjusted_mrr       = max(0.5, base_mrr × efficiency / difficulty)
roughing_mrr        = adjusted_mrr × 3.0               (§5.3)
removal_time_min   = removal_cm3 / roughing_mrr
```

**Feature time**
- Holes (per fitted diameter): <3 mm → 12 + 10·c s (pecking) ·
  3–12 mm → 5 + 10·c s · >12 mm → 25 + 35·c s (boring/interpolation);
  unsized holes → 5–15 s by complexity. c = complexity_norm.
- Threads: detected tap-drill matches (§3.1), or `round(hole_count × 0.2)` if
  diameters aren't available; 20–60 s each by complexity.
- Finishing: `surface_area_cm2 / finishing_rate_cm2_min` minutes, where
  `finishing_rate = max(10 − 5·c, 3)` cm²/min — every machined face gets
  covered again at finishing feeds. Benchmarked against machinist estimates
  this was the single largest historical gap (bulk MRR alone under-called
  20–35 h jobs by 10–15×).

**Tool changes**: count `= max(1, round(1 + 2c + holes/8))`,
0.8–1.5 min each by complexity.

**Handling**: 8 min per setup (unload, re-clamp, indicate, probe) — added
after the tolerance/DFM multipliers, not scaled by them.

```
base_cycle_time_min = removal_time_min + feature_time_min + tool_change_time_min
cycle_time_min = base_cycle_time_min
               × tolerance_machining_multiplier
               × (1 + DFM cycle_time_pct / 100)
               + handling_time_min
machine_rate   = clamp(configured ₹/hr, machine-type clamp)
machining_cost = cycle_time_min × machine_rate / 60
```

### 6.3 C — Setup, CAM, NRE (amortized over quantity)

```
# STEP + OCP, 3-axis (setup_basis = "brep_machining_directions"):
base_setups = clamp(orientations, 1, 8) + min(3, surface_area_cm2 / 1500)
# STEP + OCP, 5-axis (6+ orientations collapses setups — one clamping
# reaches most of them):
base_setups = clamp(2 + (orientations − 6) // 4, 2, 5)
# otherwise (setup_basis = "complexity_estimate"):
base_setups = max(1, round(1 + 1.5·c))

number_of_setups   = base_setups + DFM extra_setups
heft_factor        = 1 + min(buy_weight_kg, 60) / 60      (heavier parts fixture slower)
setup_time_hours   = clamp(configured_hours × heft_factor, 0.1, 4.0)
setup_total        = number_of_setups × setup_time_hours × setup_hour_rate
setup_per_part     = setup_total / qty

cam_time_hours = clamp(
  0.5 + 0.3·setups + min(holes,60)·0.015 + clamp(area/600, 0, 3) + (1 if 5-axis),
  0.5, 8.0)
cam_rate       = machine_rate × 0.35
cam_per_part   = cam_time × cam_rate / qty

# NRE: process/fixture engineering, only on jobs complex enough to need it.
nre_hours      = 0 unless 5-axis or 6+ setups, else 2 + 0.5·setups
nre_total      = nre_hours × machine_rate × 0.5
nre_per_part   = nre_total / qty
```

NRE is now shown as its own line in the "Setup, CAM, Tooling & NRE" receipt
section when non-zero (2026-08 UI fix) — it was computed but never surfaced
before, silently folded into the Machining total.

### 6.4 D — Tooling (amortized)

```
tooling_total = base(material) + holes × 2 + 40·c
              + large_bores(>12mm) × 15 + DFM tooling_add
              + wear_rate(material) × cycle_time_hours × qty
tooling_per_part = tooling_total / qty
```

### 6.5 E — Finish

```
finish = secondary_benchmark(finish_name)                    (₹/part)
       + rate_per_kg × raw_weight + rate_per_sq_inch × area_in²
       + rate_per_sq_ft × area_ft² + rate_per_piece
       + lot_fixed_cost / qty
then × cost_multiplier (if > 1)
```

### 6.6 F — Inspection

Most inspection levels re-check **every part** (visual, dimensional, CMM),
so their cost is a genuine per-part charge:

```
base_for_pct = material + machining + setup_per_part
inspection   = quality_benchmark(level) + fixed_cost / qty
             + pct × base_for_pct
then × tolerance_inspection_multiplier × DFM inspection_multiplier
```

**First Article Inspection is different** (2026-08 fix, §13): AS9102
practice inspects **one** article from the run, not every part, so its cost
is a single batch-level charge amortized across the batch:

```
# FAI only:
base_for_pct   = material + machining + setup_cost_total   (undiluted — the
                                                              one inspected
                                                              article needed
                                                              the full setup,
                                                              not a per-part
                                                              share of it)
one_time_total = quality_benchmark + fixed_cost + pct × base_for_pct
inspection     = one_time_total / qty
then × tolerance_inspection_multiplier × DFM inspection_multiplier
```

`details.quality.is_first_article_amortized` and `amortized_batch_size`
report which basis was used; the receipt UI shows a note explaining the
amortization when it applies.

### 6.7 Direct cost → sell price

```
direct  = material + machining + setup + cam + tooling + nre + finish + inspection
risked  = direct × (1 + vendor_oh + platform_oh) × (1 + risk + DFM risk_pct)
vendor  = risked × (1 + vendor_margin)
customer= vendor × (1 + platform_commission)
unit    = customer × dynamic_load × surge(urgency) × negotiation
unit    = unit × (1 − volume_discount)          (qty ≥ 100/250/500)
total   = max(unit × qty, min_order_value)
unit    = total / qty
```

**This total excludes GST** — the receipt UI and quote review screens now
say "(excl. GST)" next to Total Price / Unit Price (2026-08 UI fix). GST is
added as a separate line on the generated PDF invoice (§9.5); before the
fix, nothing in the app disclosed that the two totals differ.

### 6.8 Dynamic load, urgency, negotiation

- **Load** (from matched vendor's `current_load_pct`, default 70%): <40% →
  up to −10%; 40–80% → neutral (×1.0); >80% → ramps continuously from ×1.0
  at 80% up to ×1.20 at 100%. (2026-08 fix: this used to jump straight from
  ×1.0 to ×1.10 the instant load crossed 80%, a hard discontinuity right at
  the boundary — it now ramps smoothly.)
- **Urgency**: 0 → none; 0<x<25 → normalized to +25%; 25–40 → as given;
  >40 → clamped +40%. Urgent also ×0.85 on lead time.
- **Negotiation buffer**: clamped 5–10%, always applied.

### 6.9 Lead time

```
machining_days = (cycle_min × qty / 60 + setup_hr) / (6.5 h/day × efficiency)
lead = max(1, availability_factor) + machining_days
     + finish_days + inspection_days + tolerance_days
     + DFM (+1.0 if blocking, +0.5 if score < 70)
if urgent: lead × 0.85
rounded to nearest 0.5 day, min 1
```

**Lead time is always manually overridable** (`pricing_overrides.lead_time_days`,
2026-08 addition) — shop schedules vary in ways the formula can't see
(backlog, material on hand, holidays). When overridden, the calculated value
is still shown (`details.lead_time.calculated_lead_time_days`) alongside
`lead_time_overridden: true` for transparency; the override directly
replaces the number shown everywhere else (quote, PDF, share page).

## 7) Quantity Behavior

Fixed components (setup, CAM, tooling, NRE, finish/inspection lot fees)
divide by quantity; variable components (material, cycle time, % inspection)
scale with it — so unit price falls with quantity. Above 100/250/500 pcs the
volume discount tiers (§5.8) additionally cut the variable price 5/8/12%,
matching observed market bid curves. Every response includes
`details.quantity_breaks` (qty 1/10/50/100 + requested) with unit, total,
and savings vs single-part; `details.quantity.discount_percentage` now
reports the actual applied discount.

## 8) Combined / Batch Quotes

`/quotes/combined` prices each line item independently through the full
engine above, then sums material/machining/finish/inspection/subtotal/total
across items. **Lead time takes the max across line items**, not the sum —
this assumes parallel production capacity across different parts. For a
single-machine shop working items sequentially, the real lead time is closer
to a sum; this is a modeling assumption worth revisiting if combined quotes
routinely under-promise on delivery.

## 9) DFM Analysis

### 9.1 Scoring
`complexity_score = area^1.5 / volume`. Each triggered rule carries a
penalty; `score = clamp(100 − Σpenalty, 0, 100)`; blocking = any `error`
severity. Labels: 85+ Excellent · 70–84 Good · 50–69 Moderate · <50 High
Risk. Every issue carries a `confidence` ∈ [0,1].

### 9.2 Rule thresholds (recalibrated 2026-08-10)

The complexity and removal-ratio thresholds were miscalibrated against the
kind of parts this system actually quotes. `surface_area^1.5/volume` scores
any thin-walled or sheet-like shape as "complex" (a cube scores ~15, but a
100×100×2mm plate — a mechanically trivial single-sided job — scores ~150),
and `removal_ratio` is inherently tiny for any hollow/enclosure-style part
by definition of its shape, not because material is being wastefully
removed. Testing against 9 representative real parts (brackets, enclosures)
showed both rules firing as "blocking error" on essentially every upload —
not a useful signal. Thresholds below were recalibrated off that
population so the flags mean "genuinely unusual", not "has any wall
thickness or hollow cavity at all":

| Rule | Old thresholds | **New thresholds** |
|---|---|---|
| Complexity | >32 error · >24 warning · >18 info | **>400 error · >200 warning · >80 info** |
| Removal ratio | <20% error · <35% warning | **<1% error · <8% warning** |

Other thresholds, unchanged (no comparable overwhelming-trigger evidence
found against them):
- **Wall thickness**: <1.0 mm critical · 1.0–1.5 error · 1.5–2.0 warning ·
  unknown → warning
- **Hole density** (per 100 cm³): >40 error · >25 warning · count>15 info
- **Aspect ratio**: >20 error · >12 warning · >8 info
- **Relative thinness**: wall/min-dim < 8% warning
- **Proxies**: deep-drillability, tool-access/undercut, micro-feature density
- **Mesh**: >500k triangles info

The `complexity_norm` clamp used by the *cost* formulas (§6, `(score−14)/18`)
is a separate, independently-benchmarked scale — this recalibration only
touches DFM severity/scoring, not machining-time math.

### 9.3 Per-rule economics (`DFM_COST_RULES`)
Each rule maps to concrete cost mechanics rather than a flat surcharge:

| Rule | Cycle % | Tooling ₹ | Extra setups | Inspection % | Risk % |
|---|---:|---:|---:|---:|---:|
| wall-too-thin-critical | 18 | | | 10 | |
| wall-too-thin | 12 | | | 6 | |
| wall-thin-warning | 5 | | | | |
| wall-thickness-unknown | | | | | 3 |
| complexity-very-high | 10 | | 1 | | |
| complexity-high | 6 | | | | |
| complexity-elevated | 2 | | | | |
| removal-ratio-critical | | | | | 4 |
| removal-ratio-high | | | | | 2 |
| holes-dense-critical | 8 | 60 | | | |
| holes-dense | 4 | 30 | | | |
| holes-many | 1.5 | | | | |
| aspect-ratio-critical | 6 | | 1 | | |
| aspect-ratio-high | 4 | | | | |
| aspect-ratio-elevated | 1.5 | | | | |
| thinness-ratio-high | 4 | | | | |
| deep-drillability-risk | 5 | 80 | | | |
| tool-access-risk | 6 | | 1 | | |
| micro-feature-density-high | 5 | | | | |
| mesh-very-dense | | | | | 0.5 |
| multi-body-file | | | | | 5 |

Unmapped rules fall back to `risk_pct = min(penalty × 0.15, 3)`. Per-issue
`estimated_cost_per_part` is exposed as `details.dfm.issue_cost_impacts` and
shown in the UI as "estimated savings if resolved".

### 9.4 Where DFM appears
Geometry API → pricing response → quote PDF summary → frontend DFM panel and
wall-thickness heatmap → customer-facing savings hints. The wall-thickness
heatmap in the 3D viewer is a **separate, client-side-only** ray-cast
estimate (not fed by `dfm.py`) — see §9.6.

### 9.5 GST / tax (invoice only, not the app's displayed price)

`document.py::gst_breakup` parses a rate from the quote's free-text GST
field (preferring a number immediately followed by "%" over any earlier
digit sequence, e.g. an HSN code — 2026-08 fix), then:
- Same state (first 2 GSTIN digits match) → CGST + SGST, split so the two
  halves always sum exactly to the total tax (no independent-rounding drift).
- Different state → IGST.
- No usable GSTINs → flat "GST" line.
- No parseable rate → PDF falls back to "As applicable".

Tax is computed on `quote.total_price` (the final sale price, correct per
GST practice — tax applies to the taxable value of the supply) and **added
on top** as a separate PDF line; `Grand Total = subtotal + tax`. This is
mathematically correct but is a genuinely higher number than what's shown as
"Total Price" anywhere in the web app — hence the "(excl. GST)" label added
in §6.7.

### 9.6 Wall-thickness heatmap (3D viewer, client-side)

Independent of the backend DFM engine: for each sampled mesh face, a ray is
cast inward from the face centroid to the opposite wall (three-mesh-bvh
accelerated), and the hit distance is colored red (<1.5mm) / orange (<2.5mm)
/ yellow (<4mm) / steel-gray (ok). Two bugs fixed 2026-08-10:
1. **Seam noise**: adjacent B-rep faces tessellate into near-coincident
   triangles right at the ray origin, so the nearest "hit" was often that
   seam (~0mm) rather than the true opposite wall. Fixed by taking the first
   hit beyond a 0.05mm noise floor instead of the literal nearest hit.
2. **Invisible coloring**: toggling the heatmap flips the mesh material's
   `vertexColors` flag, which Three.js requires a shader recompile for —
   React-Three-Fiber's normal prop diffing doesn't trigger that on an
   existing material instance, so the color data was computed correctly but
   never actually drawn. Fixed by keying the material so React mounts a
   fresh instance on toggle.

Also relevant: the client-side STEP parser (`occt-import-js`, WASM) is
currently blocked by this deployment's CSP (`script-src` lacks plain
`unsafe-eval`, which the WASM glue code needs beyond `wasm-unsafe-eval`), so
every STEP file silently falls back to a server-converted GLB mesh preview.
That fallback returns coordinates in **meters** (glTF spec convention) while
the rest of the viewer assumes millimeters — fixed with an explicit ×1000
scale correction in `parseGlbBuffer` (2026-08-10). The "Mesh preview" badge
(vs. "Exact CAD geometry") in the viewer always discloses which path was
used.

## 10) Pricing Overrides (quote-scoped)

`pricing_overrides` accepts: `material_cost_per_kg`, `material_density`,
`material_machining_difficulty_factor`, `scrap_cost_per_kg`,
`include_scrap_saving`, `surface_finish_fixed_cost`,
`surface_finish_cost_multiplier`, `surface_finish_rate_per_kg`,
`surface_finish_rate_per_sq_inch`, `surface_finish_rate_per_sq_ft`,
`surface_finish_rate_per_piece`, `inspection_fixed_cost`,
`inspection_percentage_cost`, `machine_hourly_rate`,
`machine_setup_hourly_rate`, `machine_efficiency_rate`,
`machine_setup_time_hours`, `machine_name`, `margin_factor` (legacy alias for
`vendor_margin_pct`), `vendor_margin_pct`, `platform_commission_pct`,
`vendor_overhead_pct`, `platform_overhead_pct`, `risk_factor_pct`,
`vendor_load_pct`, `urgent_factor_pct`, `negotiation_buffer_pct`,
`min_order_value`, `tolerance_tier`, **`lead_time_days`** (2026-08 addition).

Validation: risk 0–20 · urgent 0–40 · efficiency 0.1–1.0 · lead_time_days
0.5–365 · quantity 1–10000. Explicit user overrides always beat
vendor-matched values.

In the receipt UI, material rate, scrap rate, machine rate, **lead time**,
and **vendor margin** are always editable inline (pencil icon) regardless of
whether "Quote-Specific Price Editing" is toggled on — the toggle only gates
the larger batch-override panel in Configuration Controls.

## 11) API Flows

- `POST /api/pricing` — single file instant price (runs vendor match)
- `POST /api/pricing/batch` — shared config across many files
- `POST /api/quotes` / `/quotes/batch` / `/quotes/combined` — formal quotes
  (same engine; combined sums line items, see §8)
- Quotes past `valid_until` lazily persist as `expired`; emailing an expired
  quote is blocked. `accepted`/`declined` (customer response via share link)
  are terminal and never lapse.

## 12) UI Breakdown Mapping

`pricing_explanation` keys → receipt sections: `raw_material` (stock form +
dimensions incl. allowance, mass, rate, scrap, `stock_size_capped`),
`material`, `machining` (cycle/feature/tool-change minutes, MRR, rate,
`thread_count`/`threaded_holes`), `setup` (count, hours, rate),
`cam_programming`, `tooling`, `nre` (hours, cost — shown when non-zero),
`secondary_operations`, `quality` (incl. `is_first_article_amortized`),
`marketplace` (margins, multipliers, volume discount, MOQ), `dfm`,
`lead_time` (incl. `calculated_lead_time_days`, `lead_time_overridden`),
`quantity_breaks`, `vendor_match`.

The "Machining" receipt section shows only the pure cycle-time cost
(`machining.machining_cost_per_part`); setup/CAM/tooling/NRE have their own
section ("Setup, CAM, Tooling & NRE") so the two don't double-count when a
customer expands both (2026-08 fix — the Machining section used to show the
combined bucket as its headline number while its own detail rows only
explained a fraction of it).

## 13) 2026-08-10 Audit — Full Findings & Fixes

A full accuracy audit checked every calculation against real test parts and
standard practice. All of the following were found and fixed in one pass:

**Display bugs (math was right, UI was misleading or incomplete):**
1. "Machining" receipt section double-counted setup/CAM/tooling by showing
   the combined cost bucket as its own headline total, right next to a
   second section showing the same setup/CAM/tooling costs again. Fixed:
   Machining now shows only the pure cycle-time cost.
2. NRE cost (5-axis / 6+ setup jobs) was computed but never shown anywhere.
   Fixed: added as its own line, shown when non-zero.
3. Thread count/cost wasn't shown in the cost breakdown despite being
   computed. Fixed: added to the Machining section.
4. "Total Price" was never labeled as excluding GST, while the PDF adds GST
   on top as a separate line — two different totals with no in-app
   explanation. Fixed: "(excl. GST)" label added.
5. `details.quantity.discount_percentage` was hardcoded to 0 even though a
   real volume discount was computed and applied elsewhere. Fixed.
6. 3D viewer Part Info panel and Bounding Box overlay showed dimensions
   computed from the (unit-mismatched, see §9.6) client mesh instead of the
   backend's exact numbers — sometimes wildly wrong (a 155mm part read as
   "0.2mm"), sometimes just slightly off on curved features. Fixed: both
   now prefer backend geometry.
7. Wall-thickness heatmap computed correct data but never rendered visible
   color (§9.6) — fixed.

**Calculation issues that changed the price:**
8. DFM complexity/removal-ratio thresholds miscalibrated — near-universally
   flagged real parts as "blocking error" (§9.2). This fed into a minimum 3%
   risk surcharge and +1 lead-time day on almost every quote. Fixed.
9. Dynamic load multiplier had a hard discontinuity at 80% vendor load
   (jumped from ×1.0 to ×1.10 instantly). Fixed to ramp continuously.
10. Machine-rate ">3000 → divide by 10" legacy-data hack could silently
    corrupt a genuinely-configured premium rate. Removed; the existing
    clamp already handles stale data safely.
11. Milled-part stock model (bounding-box billet) could blow up to 100x+ a
    part's real weight on long/thin or mostly-hollow shapes. Fixed with a
    15× wastage cap and a `stock_size_capped` flag for manual review.
12. ₹150 flat minimum stock charge didn't scale by material (same floor for
    aluminum and titanium offcuts). Fixed: now scales with material rate.
13. FAI's percentage-of-cost basis used the batch-amortized setup cost
    instead of the true cost of the one article actually inspected,
    slightly understating the charge at large batch sizes. Fixed.

**Minor:**
14. GST rate parsing took the first number found anywhere in the free-text
    field, which could misfire if an HSN code preceded the actual rate.
    Fixed: prefers a number immediately followed by "%".

Regression tests for all of the above live in
`backend/tests/test_pricing_audit_fixes.py` and
`backend/tests/test_pricing_inspection.py`.

## 14) Known Limitations (still open)

1. Wall thickness is still mesh-sampled; holes on STL uploads remain mesh
   heuristics (STEP uploads get exact B-rep holes).
2. DFM thresholds are global, not per material/process — a thin plastic
   part and a thin titanium part get the same wall-thickness rule.
3. Orientation-derived setups count hole axes only; pocket/face approach
   directions are not yet included (STL uploads stay complexity-derived).
4. No actuals feedback loop yet — quotes record a predicted-costing
   snapshot and `PUT /quotes/{id}/actuals` exists for machinist corrections,
   but nothing regression-fits the engine's constants against that data yet.
5. Combined-quote PDFs summarize DFM at quote level, not per line item.
6. Combined-quote lead time takes the max across line items, not the sum —
   optimistic for single-machine shops working items sequentially (§8).
7. The stock-size cap (§5.10) is a sanity ceiling, not a real near-net/sheet
   stock model — capped quotes still need a manual look before sending.
8. Client-side exact STEP parsing (`occt-import-js` WASM) is CSP-blocked in
   this deployment, so the 3D viewer always uses the lower-fidelity
   server-converted mesh preview rather than the intended exact-geometry
   path. Loosening CSP to fix this is a real security tradeoff and hasn't
   been made — flagged here rather than done unilaterally.
9. Per-user pricing catalog (`catalog.py`) resolves a user's own machine
   rate/material/etc. over the shared default, but wasn't in scope of the
   2026-08 formula audit — only the shared pricing engine formulas were
   checked line-by-line.

## 15) Calibration History

### 2026-08-10 — Full accuracy audit
See §13 for the complete list. DFM thresholds recalibrated, stock model
capped, FAI/discount/machine-rate/load-multiplier bugs fixed, receipt UI
display bugs fixed (double-counting, missing NRE/thread lines, GST
disclosure), 3D viewer dimension and wall-thickness-heatmap bugs fixed.

### 2026-07-16 — Pricing accuracy overhaul
Exact B-rep volume/area/bbox override mesh estimates when available;
finishing-time term added (surface_area/rate) as the dominant missing cost
driver on large parts; setups collapse for 5-axis (2-5 range); CAM time
driven by setups/holes/area rather than complexity_score (was inflating CAM
2-3x on thin sheet-like parts); benchmarked 0.63-1.42x vs machinist
estimates on 5 real parts; calibration snapshot + actuals endpoint added.

### 2026-07-10 — Exact B-rep features (STEP)
1. `app/services/brep.py`: OpenCascade (`cadquery-ocp`) reads the exact
   boundary representation — holes recovered from internal cylindrical
   faces with exact diameters/depths; edge fillets excluded via the
   full-sweep test.
2. Setup count from measured orientation: distinct hole-axis clusters
   (`machining_direction_count`) replace the complexity heuristic when
   available; `details.setup.setup_basis` records which basis priced the
   quote. Degrades gracefully to mesh heuristics for STL or when OCP is
   not installed.

### 2026-07-09 — Market calibration (2026 India benchmarks)
1. **Milled billet stock model** (correctness): bbox + 3 mm/side allowance
   replaces part-volume+wastage; material was understated up to 2–3× on
   pocketed parts.
2. Machine-rate clamps widened (3-axis →1200, lathe →800); seed rates
   corrected (VMC 700, 5-axis 2200, turning 500, turn-mill 800; VMC setup
   0.75 hr).
3. MRR raised toward handbook values (Al 10–20, steel 4–8 cm³/min).
4. Deep-volume discounts added (5/8/12% at 100/250/500 pcs).
5. Brass 680→620, MS1018 80→70 ₹/kg; anodize lot fees 1200/1500/2800.
Sources: MechHub India 2026 cost guide, IndiaMART job-work rates, supplier
price lists, Machinery's-Handbook-class MRR rules.

### 2026-07-06 — Engine feature upgrades
Round-bar stock for turned parts · deterministic wall sampling (seed=42) ·
real hole detection with fitted diameters · tolerance tiers · per-rule DFM
economics (replacing flat `penalty × 0.25`) · live vendor load in instant
pricing · quantity breaks in every response · quote expiry enforcement.

## 16) Operational Commands

```bash
docker compose exec backend python -m app.seed        # upsert config values
docker compose exec backend python -m pytest tests -q # engine smoke tests
docker exec quote-backend sh -c "cd /app && PYTHONPATH=/app python tests/test_pricing_audit_fixes.py"
docker compose up -d --build                          # rebuild stack
```
