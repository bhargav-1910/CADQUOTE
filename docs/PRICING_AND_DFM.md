# ForgeQuote — Pricing, DFM & Parameter Reference

Last updated: 2026-07-09

This is the single reference for how ForgeQuote turns a CAD file into a price:
every parameter measured, every constant used, every formula applied, and how
accurate each stage is. Implementation lives in:

| Concern | File |
|---|---|
| Pricing engine | `backend/app/services/pricing.py` |
| Geometry extraction | `backend/app/services/geometry.py` |
| DFM rules | `backend/app/services/dfm.py` |
| Seeded config values | `backend/app/seed.py` |
| Vendor matching | `backend/app/services/vendor_matching.py` |
| API endpoints | `backend/app/api/quotes.py` |
| Schemas / overrides | `backend/app/schemas/schemas.py` |
| Smoke tests | `backend/tests/test_smoke.py` |

---

## 1) Estimation Philosophy — What the Engine Is (and Isn't)

What the engine does now: it derives times **parametrically from measured
geometry** — removal volume ÷ material MRR, per-hole drilling seconds sized by
fitted diameters, pocket time from area/depth, tool changes from complexity,
DFM rules adding cycle % — all calibrated to market benchmarks. That's the
same class of model Xometry-style platforms use for instant quotes. It's
**consistent and defensible, but it's a statistical estimate, not a physics
guarantee**, because a mesh doesn't tell you toolpaths.

The two guarantees the system *does* provide today:

1. **Transparency** — every minute and rupee is itemized in
   `pricing_explanation` and the receipt UI, so any assumption can be audited.
2. **Overridability** — every rate, time and percentage can be overridden per
   quote (`pricing_overrides`) or globally (Cost Master).

The roadmap from estimate to guarantee, in payoff order:

1. **Feedback calibration loop** — log `actual_cycle_time` / `actual_setup_time`
   on completed jobs; regression-fit MRR, feature times and setup constants
   per material/machine so the engine converges on the shop's reality.
2. **B-rep feature recognition** — ✅ **first slice shipped (2026-07-10)**.
   STEP files are now read as exact boundary representations with
   OpenCascade (`app/services/brep.py`, optional `cadquery-ocp` dependency):
   internal cylindrical faces are grouped into holes with exact fitted
   diameters and depths (partial fillet radii excluded by requiring a full
   circular sweep). These replace the mesh boundary-loop/genus heuristics
   whenever available (`analysis_library = "trimesh+ocp-brep"`). Still
   ahead: pocket depth recognition, thread detection from the model, and
   per-feature cutting-parameter pricing.
3. **Setup-count from orientation analysis** — ✅ **first slice shipped
   (2026-07-10)**. Distinct hole-axis direction clusters (10° tolerance) are
   counted per part (`machining_direction_count`); when present, the setup
   count uses this measurement instead of the complexity heuristic (see §6C,
   `setup_basis`). Still ahead: including pocket/face approach directions.

---

## 2) Data Flow

```
CAD upload (.step/.stp/.stl, content-validated)
  → geometry analysis (trimesh; deterministic seed=42; cached in Redis by file hash)
  → GeometryAnalysis row (volume, bbox, holes, walls, complexity, …)
  → DFM analysis (rule engine — canonical, computed backend-side)
  → vendor matching (best-fit vendor load + machine rate feed the engine)
  → pricing engine (per-part cost → overheads → margins → market multipliers)
  → PricingResponse / Quote (full explanation payload)
  → receipt UI, quote PDF, customer share page
```

## 3) Geometry Parameters Measured Per File

Extracted in `geometry.py`; all downstream numbers derive from these.

| Parameter | Method | Units |
|---|---|---|
| `volume` | mesh volume (watertight) | cm³ |
| `surface_area` | triangle-area sum | cm² |
| `bounding_box` x/y/z (+volume) | axis-aligned extents | cm / cm³ |
| `complexity_score` | `surface_area^1.5 / volume` (scale-robust) | — |
| `removal_ratio` | `volume / bbox_volume` | 0–1 |
| `hole_count` | boundary-loop clustering + genus for through-holes | count |
| `hole_diameters_mm` | circle fit on near-circular boundary loops | mm list |
| `min_wall_thickness` | seeded ray sampling (500 rays, `seed=42`, deterministic) | mm |
| `triangle_count` | mesh statistic | count |

The 3D viewer independently verifies dimensions/volume client-side (exact
OCCT tessellation; signed-tetrahedron volume) via the Part Info panel.

## 4) Configuration Defaults (Seed Values, current)

Re-seed with `docker compose exec backend python -m app.seed` (upserts by name).

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

Finishes may also carry `rate_per_kg`, `rate_per_sq_inch`, `rate_per_sq_ft`,
`rate_per_piece` — all applied additively when non-zero (§6.5).

### 4.4 Inspection Levels

| Inspection | Fixed ₹/lot | % of (mat+mach+setup) | Lead +days | CMM |
|---|---:|---:|---:|---|
| Standard Visual | 0 | 0% | 0 | – |
| Dimensional Inspection | 1000 | 0% | 0.5 | – |
| CMM Inspection | 3000 | 2% | 1.0 | ✓ |
| First Article Inspection | 6000 | 5% | 2.0 | ✓ |

## 5) Engine Constants (`pricing.py`)

### 5.1 Machine-rate clamps (₹/hr) — sanity bounds on configured rates
- 3-axis: 500–1200 · 5-axis: 2000–3000 · lathe: 400–800

### 5.2 Material rate benchmark clamps (₹/kg)
Al 6061 300–350 · Al 7075 450–600 · brass 600–750 · nylon 250–400 ·
PEEK 7000–9000 · POM 300–450 · MS1018 70–100 · SS304 220–300 ·
SS316 300–450 · Ti Gr5 3000–4500 · EN8 90–140

### 5.3 Effective MRR (cm³/min) — full-cycle averages, not peak roughing
Aluminum 10–20 · steel 4–8 · stainless 3–6 · brass 6–10 · plastic 12–22 ·
titanium 2–4 · fallback 4–8. Complexity interpolates from the top of the
range (simple part) to the bottom (complex part).

### 5.4 Tooling base ₹/batch
Aluminum 120 · steel/brass 200 · stainless 350 · titanium 500 · plastic 100

### 5.5 Secondary op benchmarks ₹/part
Anodizing 15–40 · powder coating 25–70 · heat treatment 20–80

### 5.6 Quality benchmarks ₹/part
Basic 10–20 · vernier/gauges 20–50 · CMM 100–300

### 5.7 Marketplace defaults
Vendor margin 18% · platform commission 8% · vendor overhead 15% (10–20%) ·
platform overhead 7% (5–10%) · risk 5–20% · vendor load 70% ·
negotiation buffer 7% (5–10%) · MOQ disabled by default

### 5.8 Volume discount tiers (on unit price, beyond fixed-cost spreading)
qty ≥ 100 → −5% · ≥ 250 → −8% · ≥ 500 → −12%

### 5.9 Tolerance tiers
| Tier | Machining × | Inspection × | Lead +days |
|---|---:|---:|---:|
| General ±0.10 mm | 1.00 | 1.0 | 0 |
| Precision ±0.05 mm | 1.35 | 1.5 | 0.5 |
| Tight ±0.01 mm | 2.00 | 2.5 | 1.5 |

## 6) Pricing Formula, Step by Step

Per-part cost is computed first, then rolled to order total.
`complexity_norm = clamp((complexity_score − 14) / 18, 0, 1)` is used
throughout (simple prismatic ≈ 0, highly complex ≈ 1).

### 6.1 A — Material (stock model per process)

**Turning** (inferred from machine name or removal profile): round bar
`π/4 · d² · L` where the turning axis is the bbox dimension whose two
perpendicular dimensions are most similar; +5% parting/facing allowance.
Reported as `round_bar` with `diameter_mm × length_mm`.

**Milling**: full sawn billet = bounding box + **3 mm machining/saw allowance
per side**. (Correctness fix 2026-07-09: previously part-volume + 10–25%
wastage, which under-billed pocketed parts while machining time still charged
for clearing the envelope.)

```
raw_weight_kg  = volume_cm3 × density / 1000          (finished part)
buy_weight_kg  = stock_volume_cm3 × density / 1000    (billet or bar)
wastage_pct    = buy/raw − 1                          (reported, derived)
rate           = clamp(configured ₹/kg, benchmark range)
material_gross = buy_weight_kg × rate
scrap_credit   = (buy − raw) kg × scrap_₹/kg          (optional subtract)
```

### 6.2 B — Machining time & cost

```
removal_cm3        = bbox_volume − part_volume
base_mrr           = mrr_min + (mrr_max − mrr_min) × (1 − complexity_norm)
adjusted_mrr       = max(0.5, base_mrr × efficiency / difficulty)
removal_time_min   = removal_cm3 / adjusted_mrr
```

**Feature time**
- Holes (per fitted diameter): <3 mm → 12 + 10·c s (pecking) ·
  3–12 mm → 5 + 10·c s · >12 mm → 25 + 35·c s (boring/interpolation);
  unsized holes → 5–15 s by complexity. c = complexity_norm.
- Threads: `round(hole_count × 0.2)` estimated, 20–60 s each by complexity.
- Pockets: `surface_area_cm2 × clamp(removal_ratio, 0.2, 1.8) × 0.01 ×
  (1 + 0.6·c)` minutes.

**Tool changes**: count `= max(1, round(1 + 2c + holes/8))`,
0.8–1.5 min each by complexity.

```
cycle_time_min = (removal + feature + tool-change time)
               × tolerance_machining_multiplier
               × (1 + DFM cycle_time_pct / 100)
machine_rate   = clamp(configured ₹/hr, machine-type clamp)
machining_cost = cycle_time_min × machine_rate / 60
```

### 6.3 C — Setup & CAM (amortized over quantity)

```
# STEP + OCP (setup_basis = "brep_machining_directions"):
base_setups        = clamp(machining_direction_count, 1, 6)
# otherwise (setup_basis = "complexity_estimate"):
base_setups        = max(1, round(1 + 1.5·c))

number_of_setups   = base_setups + DFM extra_setups
setup_total        = setups × setup_time_hours × setup_hour_rate
setup_per_part     = setup_total / qty

cam_time_hours     = 0.25 + 1.25·c + min(holes,40)·0.01 + clamp(area/800, 0, 0.75)
cam_rate           = machine_rate × 0.35
cam_per_part       = cam_time × cam_rate / qty
```

### 6.4 D — Tooling (amortized)

```
tooling_total = base(material) + holes × 2 + 40·c
              + large_bores(>12mm) × 15 + DFM tooling_add
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

```
inspection = quality_benchmark(level) + fixed_cost / qty
           + pct × (material + machining + setup_per_part)
then × tolerance_inspection_multiplier
```

### 6.7 Direct cost → sell price

```
direct  = material + machining + setup + cam + tooling + finish + inspection
risked  = direct × (1 + vendor_oh + platform_oh) × (1 + risk + DFM risk_pct)
vendor  = risked × (1 + vendor_margin)
customer= vendor × (1 + platform_commission)
unit    = customer × dynamic_load × surge(urgency) × negotiation
unit    = unit × (1 − volume_discount)          (qty ≥ 100/250/500)
total   = max(unit × qty, min_order_value)
unit    = total / qty
```

### 6.8 Lead time

```
machining_days = (cycle_min × qty / 60 + setup_hr) / (6.5 h/day × efficiency)
lead = max(1, availability_factor) + machining_days
     + finish_days + inspection_days + tolerance_days
     + DFM (+1.0 if blocking, +0.5 if score < 70)
if urgent: lead × 0.85
rounded to nearest 0.5 day, min 1
```

## 7) Quantity Behavior

Fixed components (setup, CAM, tooling, finish/inspection lot fees) divide by
quantity; variable components (material, cycle time, % inspection) scale with
it — so unit price falls with quantity. Above 100/250/500 pcs the volume
discount tiers (§5.8) additionally cut the variable price 5/8/12%, matching
observed market bid curves. Every response includes `details.quantity_breaks`
(qty 1/10/50/100 + requested) with unit, total, and savings vs single-part.

## 8) Dynamic Pricing & Urgency

- **Load** (from matched vendor's `current_load_pct`): <40% → up to −10%;
  40–80% → neutral; >80% → +10–20%.
- **Urgency**: 0 → none; 0<x<25 → normalized to +25%; 25–40 → as given;
  >40 → clamped +40%. Urgent also ×0.85 on lead time.

## 9) DFM Analysis

### 9.1 Scoring
`complexity_score = area^1.5 / volume`. Each triggered rule carries a penalty;
`score = clamp(100 − Σpenalty, 0, 100)`; blocking = any `error` severity.
Labels: 85+ Excellent · 70–84 Good · 50–69 Moderate · <50 High Risk.
Every issue carries a `confidence` ∈ [0,1].

### 9.2 Rule thresholds
- **Wall thickness**: <1.0 mm critical · 1.0–1.5 error · 1.5–2.0 warning ·
  unknown → warning
- **Complexity**: >32 error · >24 warning · >18 info
- **Removal ratio**: <0.2 error · <0.35 warning
- **Hole density** (per 100 cm³): >40 error · >25 warning · count>15 info
- **Aspect ratio**: >20 error · >12 warning · >8 info
- **Relative thinness**: wall/min-dim < 8% warning
- **Proxies**: deep-drillability, tool-access/undercut, micro-feature density
- **Mesh**: >500k triangles info

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

Unmapped rules fall back to `risk_pct = min(penalty × 0.15, 3)`. Per-issue
`estimated_cost_per_part` is exposed as `details.dfm.issue_cost_impacts` and
shown in the UI as "estimated savings if resolved".

### 9.4 Where DFM appears
Geometry API → pricing response → quote PDF summary → frontend DFM panel and
wall-thickness heatmap (client BVH raycast) → customer-facing savings hints.

## 10) Pricing Overrides (quote-scoped)

`pricing_overrides` accepts: `material_cost_per_kg`,
`material_machining_difficulty_factor`, `surface_finish_fixed_cost`,
`surface_finish_cost_multiplier`, `inspection_fixed_cost`,
`inspection_percentage_cost`, `machine_hourly_rate`, `machine_efficiency_rate`,
`machine_setup_time_hours`, `machine_name`, `margin_factor` (legacy),
`vendor_margin_pct`, `platform_commission_pct`, `vendor_overhead_pct`,
`platform_overhead_pct`, `risk_factor_pct`, `vendor_load_pct`,
`urgent_factor_pct`, `min_order_value`, `negotiation_buffer_pct`,
`tolerance_tier`.

Validation: risk 0–20 · urgent 0–40 · efficiency 0.1–1.0 · quantity 1–10000.
Explicit user overrides always beat vendor-matched values.

## 11) API Flows

- `POST /api/pricing` — single file instant price (runs vendor match)
- `POST /api/pricing/batch` — shared config across many files
- `POST /api/quotes` / `/quotes/batch` / `/quotes/combined` — formal quotes
  (same engine; combined sums line items)
- Quotes past `valid_until` lazily persist as `expired`; emailing an expired
  quote is blocked. `accepted`/`declined` (customer response via share link)
  are terminal and never lapse.

## 12) UI Breakdown Mapping

`pricing_explanation` keys → receipt sections: `raw_material` (stock form +
dimensions incl. allowance, mass, rate, scrap), `material`, `machining`
(cycle/feature/tool-change minutes, MRR, rate), `setup` (count, hours, rate),
`cam_programming`, `tooling`, `secondary_operations`, `quality`,
`marketplace` (margins, multipliers, volume discount, MOQ), `dfm`,
`lead_time`, `quantity_breaks`, `vendor_match`.

## 13) Calibration History

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

## 14) Known Limitations

1. Wall thickness is still mesh-sampled; holes on STL uploads remain
   mesh heuristics (STEP uploads get exact B-rep holes).
2. DFM thresholds are global, not per material/process.
3. Orientation-derived setups count hole axes only; pocket/face approach
   directions are not yet included (STL uploads stay complexity-derived).
4. No actuals feedback loop yet (§1 roadmap item 1).
5. Combined-quote PDFs summarize DFM at quote level, not per line item.

## 15) Operational Commands

```bash
docker compose exec backend python -m app.seed        # upsert config values
docker compose exec backend python -m pytest tests -q # engine smoke tests
docker compose up -d --build                          # rebuild stack
```
