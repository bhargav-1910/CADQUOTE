# Pricing and DFM Documentation

Last updated: 2026-04-14

This document describes:
- Current pricing values used by the system
- End-to-end pricing formulas and calculation flow
- Quantity behavior (unit price vs total price)
- Single-file, batch, and combined quote behavior
- DFM (Design for Manufacturability) analysis logic (backend single source of truth)

## 1) Data Sources Used By Pricing

Pricing pulls from:
- Geometry metrics from file processing (`GeometryAnalysis`)
- Config tables (`Material`, `SurfaceFinish`, `InspectionLevel`, `MachineRate`)
- Engine benchmark clamps and fallback constants in pricing service
- Optional per-request `pricing_overrides`

Main implementation files:
- `backend/app/services/pricing.py`
- `backend/app/seed.py`
- `backend/app/schemas/schemas.py`
- `backend/app/api/quotes.py`

## 2) Current Config Defaults (Seed Values)

These are the values seeded/updated by `backend/app/seed.py`.

### 2.1 Materials

| Material | Density (g/cm^3) | Cost/kg (INR) | Machining Difficulty | Availability Factor |
|---|---:|---:|---:|---:|
| Aluminum 6061-T6 | 2.70 | 320 | 0.8 | 1.0 |
| Aluminum 7075-T6 | 2.81 | 520 | 0.8 | 1.1 |
| Mild Steel 1018 | 7.87 | 80 | 1.0 | 1.0 |
| Stainless Steel 304 | 8.00 | 260 | 1.5 | 1.0 |
| Stainless Steel 316 | 8.00 | 380 | 1.6 | 1.1 |
| Brass C360 | 8.50 | 680 | 0.7 | 1.0 |
| POM / Delrin | 1.41 | 380 | 0.6 | 1.0 |
| PEEK | 1.32 | 8000 | 0.6 | 1.3 |
| Nylon 6/6 | 1.14 | 320 | 0.6 | 1.0 |
| Titanium Grade 5 | 4.43 | 3500 | 2.0 | 1.5 |

### 2.2 Surface Finishes

| Finish | Cost Multiplier | Fixed Cost (INR) | Lead Time Add (days) |
|---|---:|---:|---:|
| As Machined | 1.00 | 0 | 0 |
| Bead Blasted | 1.10 | 1000 | 1 |
| Anodized Type II (Clear) | 1.20 | 2000 | 2 |
| Anodized Type II (Color) | 1.25 | 2500 | 3 |
| Anodized Type III (Hard) | 1.40 | 4200 | 3 |
| Powder Coated | 1.30 | 2000 | 2 |
| Electroless Nickel | 1.35 | 3000 | 3 |
| Passivated | 1.10 | 1200 | 1 |
| Polished (Mirror) | 1.50 | 2800 | 2 |

### 2.3 Inspection Levels

| Inspection | Fixed Cost (INR) | Percentage Cost | Lead Time Add (days) | Includes CMM |
|---|---:|---:|---:|---:|
| Standard Visual | 0 | 0% | 0 | No |
| Dimensional Inspection | 1000 | 0% | 0.5 | No |
| CMM Inspection | 3000 | 2% | 1.0 | Yes |
| First Article Inspection (FAI) | 6000 | 5% | 2.0 | Yes |

### 2.4 Machine Rates

| Machine | Hourly Rate (INR/hr) | Efficiency | Setup Time (hr) | Default |
|---|---:|---:|---:|---:|
| Standard 3-Axis CNC Mill | 700 | 0.75 | 0.5 | Yes |
| 5-Axis CNC Mill | 2500 | 0.70 | 1.0 | No |
| CNC Lathe | 500 | 0.80 | 0.5 | No |

## 3) Engine Benchmark Clamps and Constants

Implemented in `backend/app/services/pricing.py`.

### 3.1 Machine rate clamps (INR/hr)
- 3-axis: 500 to 800
- 5-axis: 2000 to 3000
- Lathe: 400 to 600

### 3.2 Material benchmark clamps (INR/kg)
- Aluminum 6061: 300 to 350
- Aluminum 7075: 450 to 600
- Brass C360: 600 to 750
- Nylon 6/6: 250 to 400
- PEEK: 7000 to 9000
- POM/Delrin: 300 to 450
- Mild Steel 1018: 70 to 100
- SS304: 220 to 300
- SS316: 300 to 450
- Titanium Grade 5: 3000 to 4500
- EN8: 90 to 140

### 3.3 MRR ranges (cm^3/min)
- Aluminum: 8 to 15
- Steel: 3 to 6
- Stainless: 3 to 6
- Brass: 6 to 10
- Plastic: 12 to 22
- Titanium: 2 to 4
- Fallback: 4 to 8

### 3.4 Wastage
- Milling: 10% to 25% (scaled by complexity)
- Turning: 5% to 15% (scaled by complexity)

### 3.5 Tooling base costs (INR total before per-part allocation)
- Aluminum: 120
- Steel/Brass: 200
- Stainless: 350
- Titanium: 500
- Plastic: 100

### 3.6 Secondary operation benchmark ranges (INR/part)
- Anodizing: 15 to 40
- Powder coating: 25 to 70
- Heat treatment: 20 to 80

### 3.7 Quality benchmark ranges (INR/part)
- Basic: 10 to 20
- Vernier/Gauges: 20 to 50
- CMM: 100 to 300

### 3.8 Marketplace defaults
- Vendor margin: 18%
- Platform commission: 8%
- Vendor overhead: 15% (clamped to 10%-20%)
- Platform overhead: 7% (clamped to 5%-10%)
- Risk factor: inferred and clamped to 5%-20%
- Vendor load: 70%
- Urgent factor: 0% default, normalized to 25%-40% when urgent > 0
- Negotiation buffer: 7% (clamped to 5%-10%)
- Min order value (MOQ): default disabled (0), can be enabled via overrides

## 4) Pricing Formula Flow (Per Part Then Order Total)

The engine computes per-part cost first, then multiplies by quantity.

### 4.1 Material cost
1. Raw weight (kg):
   - `raw_weight_kg = (volume_cm3 * density_g_per_cm3) / 1000`
2. Buy weight with wastage:
   - `buy_weight_kg = raw_weight_kg * (1 + wastage_pct)`
3. Effective material rate:
   - configured `cost_per_kg` clamped to material benchmark range (if mapped)
4. Material cost per part:
   - `material_cost = buy_weight_kg * effective_material_rate`

### 4.2 Machining cost
1. Removal volume:
   - `removal_cm3 = max(bounding_box_volume_cm3 - volume_cm3, 0)`
2. Base MRR selected from material range; complexity reduces usable MRR
3. Efficiency and machining difficulty adjust MRR:
   - `adjusted_mrr = base_mrr * machine_efficiency / machining_difficulty_factor`
4. Material removal time:
  - `removal_time_min = removal_cm3 / adjusted_mrr`
5. Feature time includes:
   - Hole time (5-15 sec each, scaled by complexity)
   - Thread estimate time (20-60 sec each, scaled by complexity)
   - Pocket time from area, removal ratio, and depth factor
6. Tool change time includes:
  - Tool change count estimated from complexity + feature count
  - Time per change scaled by complexity
7. Total cycle time:
  - `cycle_time_min = removal_time_min + feature_time_min + tool_change_time_min`
8. Machine rate normalized to machine-type clamp
9. Machining cost per part:
   - `machining_cost = cycle_time_min * machine_rate_per_hour / 60`

### 4.3 Setup, CAM programming, and tooling allocation
- Setup total:
  - `setup_cost_total = setup_time_hours * machine_rate_per_hour`
- Setup per part:
  - `setup_cost_per_part = setup_cost_total / quantity`
- CAM total:
  - `cam_cost_total = cam_time_hours * cam_rate_per_hour`
- CAM per part:
  - `cam_cost_per_part = cam_cost_total / quantity`
- Tooling total:
  - `tooling_total = tooling_base(material) + hole_count * 2 + complexity_norm * 40`
- Tooling per part:
  - `tooling_per_part = tooling_total / quantity`

### 4.4 Finish and inspection
- Finish per part:
  - `finish_cost = secondary_cost(finish_name) + (finish_fixed_cost / quantity)`
  - If multiplier > 1, multiply finish cost by `finish_cost_multiplier`
- Inspection per part:
  - `inspection_cost = quality_base(inspection_name) + (inspection_fixed_cost / quantity)`
  - If percentage cost > 0, add percentage of `(material + machining + setup_per_part)`

### 4.5 Direct subtotal per part
- `direct_cost_per_part = material + machining + setup_per_part + cam_cost_per_part + tooling_per_part + finish + inspection`

### 4.6 Overheads and risk
- Overhead multiplier:
  - `1 + vendor_overhead + platform_overhead`
- Risk multiplier:
  - `1 + risk_factor`
- `risk_adjusted_cost_per_part = direct_cost_per_part * overhead_multiplier * risk_multiplier`

### 4.7 Marketplace pricing
- Vendor price:
  - `vendor_price = risk_adjusted_cost_per_part * (1 + vendor_margin)`
- Customer base price:
  - `customer_price = vendor_price * (1 + platform_commission)`
- Apply market multipliers:
  - `dynamic_load_multiplier`
  - `surge_multiplier` (urgent)
  - `negotiation_multiplier`
- `priced_unit_before_moq = customer_price * dynamic * surge * negotiation`

### 4.8 Quantity and total
- `total_before_moq = priced_unit_before_moq * quantity`
- `total_price = max(total_before_moq, min_order_value)`
- `unit_price = total_price / quantity`

## 5) Quantity Behavior (Why Unit Drops As Quantity Increases)

The model has both fixed and variable components.

- Fixed-like costs spread with quantity:
  - setup fixed cost
  - tooling total
  - finish fixed cost
  - inspection fixed cost
- Variable costs scale with part count:
  - material consumption
  - cycle-time machining
  - percentage-based inspection (if enabled)

Because fixed costs are divided by quantity, unit price usually decreases as quantity increases. Total price still increases with quantity unless MOQ floor is active.

## 6) Dynamic Pricing and Urgency Behavior

### 6.1 Dynamic load multiplier
- Load < 40%: up to -10% discount
- 40% to 80%: no change
- > 80%: +10% to +20% uplift

### 6.2 Urgency normalization
- 0% => no urgency uplift
- 0% < urgent < 25% => normalized to +25%
- 25% to 40% => applied as provided
- > 40% => clamped to +40%

Urgent jobs also reduce estimated lead time by multiplying lead time by 0.85.

## 7) Pricing Overrides (Quote-Scoped)

Supported in request payload under `pricing_overrides`.

### 7.1 Available override fields
- material_cost_per_kg
- material_machining_difficulty_factor
- surface_finish_fixed_cost
- surface_finish_cost_multiplier
- inspection_fixed_cost
- inspection_percentage_cost
- machine_hourly_rate
- machine_efficiency_rate
- machine_setup_time_hours
- machine_name
- margin_factor (legacy compatibility)
- vendor_margin_pct
- platform_commission_pct
- vendor_overhead_pct
- platform_overhead_pct
- risk_factor_pct
- vendor_load_pct
- urgent_factor_pct
- min_order_value
- negotiation_buffer_pct

### 7.2 Validation limits (schema)
- risk_factor_pct: 0 to 20
- urgent_factor_pct: 0 to 40
- machine_efficiency_rate: 0.1 to 1.0
- quantity: 1 to 10000
(Additional field-level validation is defined in `backend/app/schemas/schemas.py`.)

## 8) Pricing In API Flows

### 8.1 Single pricing
- Endpoint: `POST /api/pricing`
- Uses selected file + one config set + quantity

### 8.2 Batch pricing
- Endpoint: `POST /api/pricing/batch`
- Uses shared config and shared quantity across many files
- Returns one pricing response per file

### 8.3 Formal quote creation
- Endpoints:
  - `POST /api/quotes`
  - `POST /api/quotes/batch`
  - `POST /api/quotes/combined`
- All call the same pricing engine
- Combined quote sums line-item totals into one quote record

## 9) UI Pricing Breakdown (Single + Multi File)

Detailed pricing cards are now consistent across:
- Single-file pricing flow (`POST /api/pricing`)
- Multi-file pricing flow (`POST /api/pricing/batch` or per-file fallback)

In multi-file mode, the active/selected file renders the same detailed breakdown card used in single-file mode, while bulk totals remain visible separately.

### 9.1 Cost summary row
- Total price for requested quantity
- Unit price
- Quantity
- Estimated lead time

### 9.2 Cost breakup sections and parameters

Raw Material Cost:
- Raw Material Stock Dimension (mm)
- Raw Material Mass (kg)
- Raw Material Rate per Kg (INR/kg)
- Scrap Saving Cost (and whether included in cost)
- Scrap Weight (kg)
- Scrap Cost per Kg (INR/kg)

Machining Cost:
- Total Machining Time
- Machine Hour Rate (INR/hr)
- Feature Time
- Tool Change Time

Setup Cost Per Item:
- Total Setup Cost
- Number of Setups
- Setup Time
- Setup Hour Rate (INR/hr)

Additional manufacturing contributors:
- CAM Programming cost per part, CAM time, CAM hourly rate
- Tooling allocation per part
- Quality/inspection cost per part

### 9.3 Backend explanation keys powering the UI
Primary values are supplied in `pricing_explanation`:
- `raw_material`
- `material`
- `machining`
- `setup`
- `cam_programming`
- `tooling`
- `quality`
- `manufacturing_charges`

Backward compatibility:
- Existing keys are preserved.
- New fields were added (not replacing old fields) so older consumers keep working.

## 10) DFM Analysis Logic (Backend Canonical)

DFM is now computed in backend and reused everywhere:
1) Geometry API (`GET /api/files/{file_id}/geometry`)
2) Pricing computation (`POST /api/pricing`, quote creation endpoints)
3) PDF generation (DFM summary section)
4) Frontend DFM UI rendering (uses backend result; frontend fallback only if missing)

Primary implementation:
- `backend/app/services/dfm.py`

### 10.1 Backend geometry extraction inputs
Geometry extraction is implemented in `backend/app/services/geometry.py`.

Computed metrics used as DFM inputs:
- volume (cm^3)
- surface_area (cm^2)
- bounding box x/y/z and volume
- complexity_score
- removal_ratio
- hole_count (estimated)
- min_wall_thickness (heuristic)
- triangle_count

### 9.2 Canonical DFM rule set (weighted)
Implemented in `analyze_dfm_metrics` in `backend/app/services/dfm.py`.

Complexity metric used by geometry and DFM:
- `complexity_score = (surface_area_cm2 ^ 1.5) / volume_cm3`
- This replaces the old `surface_area / volume` ratio and is more robust to scale changes.

Rule families:
- Wall thickness checks:
  - Unknown wall thickness (warning)
  - < 1.0 mm (critical error)
  - 1.0 to < 1.5 mm (error)
  - 1.5 to < 2.0 mm (warning)
- Complexity checks:
  - > 32 (error)
  - > 24 (warning)
  - > 18 (info)
- Material removal efficiency:
  - removal_ratio < 0.2 (error)
  - removal_ratio < 0.35 (warning)
- Hole density checks (holes per 100 cm^3):
  - > 40 (error)
  - > 25 (warning)
  - hole_count > 15 (info)
- Aspect ratio checks:
  - > 20 (error)
  - > 12 (warning)
  - > 8 (info)
- Relative thinness:
  - wall/min-dimension ratio < 8% (warning)
- CAD-like proxy detectors:
  - Deep drillability risk (high hole count + thin sections)
  - Tool access / undercut likelihood (high complexity + low removal + dense holes)
  - Micro-feature density (triangle density proxy)
- Very dense mesh:
  - triangle_count > 500,000 (info)

### 9.3 DFM score and labels
- `total_penalty = sum(issue.penalty)`
- `score = clamp(100 - total_penalty, 0, 100)`
- `has_blocking_issue = any(issue.severity == "error")`
- Each issue includes `confidence` in range [0, 1]
- Analysis includes `confidence_score` (average confidence of reported issues)

Label mapping:
- 85 to 100: Excellent
- 70 to 84: Good
- 50 to 69: Moderate
- 0 to 49: High Risk

### 9.4 DFM in pricing (now active)
Pricing engine computes DFM first and applies explicit DFM penalties.

Implemented in `backend/app/services/pricing.py`:
- DFM cost penalty percent:
  - `dfm_penalty_pct = clamp(total_penalty * 0.25, 0, 20)`
  - If blocking issue exists, minimum DFM penalty is 8%
- DFM cost multiplier:
  - `dfm_multiplier = 1 + dfm_penalty_pct / 100`
- DFM lead-time add:
  - +1.0 day if blocking issue exists
  - +0.5 day if DFM score < 70

These values are included in pricing explanation details under:
- `details["dfm"]`
- `details["lead_time"]["dfm_lead_time_add_days"]`

Pricing complexity normalization now uses the new complexity scale:
- `complexity_norm = clamp((complexity_score - 14) / 18, 0, 1)`

### 9.5 DFM in API responses
DFM is now available in backend responses:
- Geometry response: `dfm_analysis`
- Pricing response: `dfm_analysis`

Schemas are defined in `backend/app/schemas/schemas.py`:
- `DFMIssueResponse`
- `DFMAnalysisResponse`

### 9.6 DFM in quote PDFs
PDF generator includes DFM summary (score, label, top findings) using backend analysis.

Implemented in:
- `backend/app/services/document.py`

## 10) Current Limitations and Recommended Improvements

1. Hole and wall-thickness extraction are still heuristic because they are mesh-derived.
2. DFM thresholds are global; material/process-specific thresholds can further improve realism.
3. DFM penalties are linearized from total penalty; per-rule configurable economic impact can improve calibration.
4. Combined-quote PDFs currently summarize DFM at quote context; per-line-item DFM sections can be added for deeper traceability.

## 11) Frontend Behavior Notes

1. Frontend DFM display now consumes backend `dfm_analysis` as canonical output.
2. Frontend performs fallback local analysis only if backend DFM is unavailable.
3. Quote risk badges and DFM panel are aligned to backend blocking-issue semantics.

## 12) Quick Operational Commands

- Re-seed config values:
  - `docker-compose exec backend python -m app.seed`
- Restart stack:
  - `docker-compose up -d --build`

This ensures configured defaults and engine code are aligned.

## 13) Engine Updates (2026-07-06)

1. **Round-bar stock for turned parts** — when the inferred process is turning, raw stock is priced as a cylinder (`pi/4 * d^2 * L`, +5% parting/facing allowance) instead of a rectangular billet. The turning axis is the bbox dimension whose two perpendicular dimensions are most similar, so both shafts and discs resolve correctly. Stock is reported as `round_bar` (`diameter_mm` × `length_mm`) in `details.raw_material`.
2. **Deterministic geometry analysis** — wall-thickness sampling is seeded (`seed=42`), so re-processing the same file always yields the same thickness, DFM result and price.
3. **Real hole detection** — boundary edges are clustered into loops; near-circular loops get fitted diameters (`geometry_analyses.hole_diameters_mm`, migration `20260706_0012`). Watertight meshes contribute through-holes via genus. Drilling time is sized per hole (small <3 mm, medium, large >12 mm bores), and large bores add tooling cost.
4. **Tolerance tiers** — `tolerance_tier` (`general` ±0.10 / `precision` ±0.05 / `tight` ±0.01) scales machining time (×1.0/×1.35/×2.0), inspection cost (×1.0/×1.5/×2.5) and lead time. Sent via `pricing_overrides.tolerance_tier`; selectable in the configuration panel.
5. **Per-rule DFM economics** — the single `total_penalty * 0.25` surcharge is replaced by `DFM_COST_RULES`: each issue code maps to concrete cycle-time %, tooling adds, extra setups and inspection load. Only residual risk stays a percentage. Per-issue `estimated_cost_per_part` is exposed in `details.dfm.issue_cost_impacts` and surfaced in the UI as "estimated savings if resolved".
6. **Live vendor load in instant pricing** — `/api/pricing` and `/api/pricing/batch` now run vendor matching and feed the matched vendor's `current_load_pct` / machine rate into the engine (explicit user overrides win). Section 6.1 dynamic load pricing is therefore live end-to-end; match details appear in `pricing_explanation.vendor_match`.
7. **Quantity breaks** — every pricing response includes `details.quantity_breaks` (qty 1/10/50/100 + requested) with unit price, total and savings vs single-part price; rendered as a table in the price panel.
8. **Quote expiry enforcement** — quotes past `valid_until` are reported and lazily persisted as `expired`; emailing an expired quote is blocked with a re-quote prompt.

## 14) Market Calibration (2026-07-09)

Benchmarked against 2026 India job-shop data (MechHub cost guide, IndiaMART
job-work rates, supplier price lists). Changes:

1. **Milled billet stock model (correctness fix)** — milled parts now buy the
   full billet: bounding box + 3 mm machining/saw allowance per side. The old
   model billed part volume + 10-25% wastage while machining time charged for
   clearing the whole envelope, understating material on pocketed parts by up
   to 2-3x. Turned parts already used true round-bar stock. Stock dims in
   `details.raw_material` now include the allowance.
2. **Machine rate clamps widened** — 3-axis 500-1200 INR/hr (was 500-800),
   lathe 400-800 (was 400-600). Blended 2026 VMC rates run 800-1400.
3. **Seed machine rates corrected** — 3-Axis VMC 700/hr (setup 0.75 hr),
   4/5-Axis 2200/hr, CNC Turning 500/hr, Turn Mill 800/hr. Previous seeds
   (400/500/300/400) only produced sane prices via engine clamps.
4. **MRR raised toward handbook values** — aluminum 10-20 cm3/min (was 8-15),
   steel 4-8 (was 3-6). Values remain full-cycle averages, not peak roughing.
5. **Deep-volume discount** — beyond fixed-cost spreading, unit price now
   drops 5% at qty>=100, 8% at >=250, 12% at >=500
   (`details.marketplace.volume_discount_pct`), matching market bid curves.
6. **Material seed tweaks** — Brass C360 680 -> 620 INR/kg, Mild Steel 1018
   80 -> 70 INR/kg.
7. **Anodizing lot fees reduced to India job-work norms** — Type II clear
   2000 -> 1200, color 2500 -> 1500, Type III hard 4200 -> 2800.

Validated by smoke tests (`tests/test_smoke.py`): billet stock weight, stock
dimension reporting, and volume-discount monotonicity.
