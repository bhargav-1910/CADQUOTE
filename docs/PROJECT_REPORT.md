# ForgeQuote — Complete Project Report

*How the platform is built, what every piece does, and why it was built that way.*
*Last updated: 18 July 2026 (commit `dc24df0`).*

---

## 1. What ForgeQuote is

ForgeQuote is a **CNC quoting platform for Indian job shops**. A machine shop owner uploads a customer's CAD file (STEP or STL), and within seconds the platform:

1. analyzes the part's exact geometry (volume, surfaces, holes, machining directions),
2. runs manufacturability (DFM) checks,
3. computes a fully itemized price from a benchmarked cost model (material, machining time, setups, CAM programming, tooling wear, finishing, inspection, margin, GST),
4. produces a branded PDF quotation,
5. gives the shop a shareable link the customer can open to view, download, **accept or decline** the quote — no customer account needed,
6. tracks every customer and their win rate in a built-in CRM.

The one-line pitch: **"Upload CAD, price the job, send the quote — every rupee itemized."** The differentiator vs. spreadsheet quoting is speed and consistency; the differentiator vs. big platforms (Paperless Parts, aPriori) is that it's self-hosted, India-priced (INR, GST-aware), and the pricing logic is fully explainable — every number on the quote can be traced to a formula.

---

## 2. Tech stack — what is used for what

| Layer | Technology | Why this choice |
|---|---|---|
| Backend API | **FastAPI** (Python 3.11) | Async, automatic OpenAPI docs at `/docs`, Pydantic validation everywhere |
| Database | **PostgreSQL 16** | Relational integrity for quotes/customers; UUID keys; JSON columns for flexible detail blobs |
| ORM / migrations | **SQLAlchemy 2 (async) + Alembic** | Typed models, versioned schema migrations (21 migrations to date) |
| Cache | **Redis 7** | Geometry results cached by file hash — re-uploading an identical file prices instantly; degrades gracefully if Redis is down |
| Mesh geometry | **trimesh + cascadio** | trimesh computes mesh properties (area, watertightness, ray casting for wall thickness); cascadio converts STEP→mesh via OpenCASCADE |
| Exact geometry | **cadquery-ocp (OpenCASCADE B-rep)** | Reads the STEP file's *exact* boundary representation: true volume/area (mesh tessellation lies on assemblies), exact hole diameters/depths/axes, face orientations → setup counts |
| PDF generation | **WeasyPrint** (HTML/CSS → PDF), **reportlab** fallback | WeasyPrint renders the branded HTML template; reportlab is a loud fallback for hosts where WeasyPrint's native deps are missing |
| Auth | **JWT (python-jose) + bcrypt (passlib)** | Stateless access tokens (2 h) + rotating refresh tokens (30 d) stored hashed server-side |
| Frontend | **React 18 + TypeScript + Vite** | SPA; Vite for fast builds; strict typing across the API boundary |
| Styling | **Tailwind CSS** | Design tokens in `tailwind.config.js`: sky-blue primary, machined-orange accent, blueprint-grid background; single dark-mode remap layer in `index.css` |
| 3D viewer | **three.js (@react-three/fiber + drei)** | In-browser STEP/STL preview with an OCCT WASM parser |
| Reverse proxy | **nginx** | Serves the built SPA, proxies `/api`, enforces rate limits and security headers (CSP, X-Frame-Options) |
| Packaging | **Docker Compose** (4 containers) | One-command deployment: postgres, redis, backend, frontend |
| Thumbnails | **matplotlib** (already bundled with trimesh) | Renders a shaded isometric PNG of every part in the geometry worker — zero added dependencies |

---

## 3. System architecture

```
                        ┌────────────────────────────────────────────┐
     Browser ──HTTP──►  │  nginx (frontend container, port 80)       │
                        │  • serves React SPA build                  │
                        │  • rate limits: 10/min auth, 300/min API   │
                        │  • CSP + security headers                  │
                        └───────────────┬────────────────────────────┘
                                        │ proxy /api, /uploads/company_logos
                        ┌───────────────▼────────────────────────────┐
                        │  FastAPI backend (port 8000, loopback only)│
                        │  7 routers: auth, billing, files, config,  │
                        │  quotes, public, customers                 │
                        │  ┌──────────────────────────────────────┐  │
                        │  │ ProcessPoolExecutor (2 workers)      │  │
                        │  │ CAD analysis runs OUTSIDE the web    │  │
                        │  │ process → no GIL stalls, OOM-safe    │  │
                        │  └──────────────────────────────────────┘  │
                        └────────┬──────────────────┬────────────────┘
                                 │                  │
                    ┌────────────▼───┐   ┌──────────▼─────────┐
                    │ PostgreSQL 16  │   │ Redis 7            │
                    │ (loopback only)│   │ geometry cache     │
                    └────────────────┘   └────────────────────┘
```

Design principles:

- **Layered monolith**: `api/` (HTTP handlers) → `services/` (business logic) → `models/` (SQLAlchemy) → `schemas/` (Pydantic request/response). No microservices — one deployable unit, one database.
- **Only nginx is exposed.** Postgres, Redis, and the backend bind to loopback; all external traffic goes through the proxy.
- **Heavy compute is isolated.** Geometry analysis (OpenCASCADE + trimesh, CPU/RAM heavy) runs in separate worker processes with a queue of 2 — a pathological CAD file can crash a worker without taking down the site.
- **Startup janitors** (async tasks in the FastAPI lifespan): re-queue CAD files stranded mid-processing by a crash, backfill customer links on pre-CRM quotes, re-analyze geometry rows produced by older engine versions.

---

## 4. The quote pipeline, end to end

This is the core product flow — what happens between "drag a file" and "customer accepted".

### Step 1 — Upload (`POST /api/files/upload`)
- File is validated (extension, magic bytes, ≤100 MB), SHA-256 hashed, and stored under a date-partitioned path with a UUID filename. Storage is an abstraction (`services/storage.py`) — local disk today, S3/R2 compatible via env vars.
- **Deduplication**: same bytes uploaded twice by the same user → the existing record is reused.
- **Subscription gate**: free-plan users may only upload the built-in sample part (matched by its known SHA-256). Anything else returns HTTP 402, which the frontend turns into an upgrade prompt. Upload is the single choke point — everything downstream needs an uploaded file, so one gate covers the product.
- A background task queues geometry processing and returns immediately; the frontend polls `processing_status`.

### Step 2 — Geometry analysis (`services/geometry.py` + `services/brep.py`)
Runs in a worker process. Two engines in sequence:

1. **Mesh pass (trimesh)** — always runs: volume, surface area, bounding box, triangle/vertex counts, complexity score (A^1.5/V, scale-robust), removal ratio, min wall thickness (seeded ray casting so results are reproducible), boundary-loop + genus hole detection.
2. **Exact B-rep pass (OpenCASCADE)** — STEP files only, overrides the mesh values where it can: exact solid volume/area/bbox (mesh tessellation over-reports on assemblies), **exact holes** (internal cylindrical faces, grouped by axis+radius, full-sweep test excludes fillets, depth from UV bounds), **machining direction count** (hole axes + planar face normals clustered at 10° tolerance — this drives setup count), and solid-body count (>1 = assembly → DFM warning).

A shaded isometric **thumbnail PNG** is rendered here too (matplotlib), keyed by file hash, shown in quote lists. Results persist to `geometry_analyses` and cache in Redis by file hash.

### Step 3 — DFM analysis (`services/dfm.py`)
Rule-based manufacturability checks: thin walls, deep pockets, tiny holes, sharp internal corners, multi-body files, extreme aspect ratios. Each issue carries a severity and a **cost effect** (cycle-time %, extra setups, tooling adders, inspection %) — DFM findings literally change the price rather than just being warnings.

### Step 4 — Pricing (`services/pricing.py`, ~1,300 lines, the heart of the product)
A deterministic engine — no ML, every term explainable. **Benchmarked against machinist estimates on 5 real parts** (July 2026): machining-time accuracy improved from 0.03–0.97× of actual to 0.63–1.42×. Cost blocks:

- **A. Material**: stock dimensions inferred (bar/plate/block by aspect ratio, +machining allowances), stock mass × material rate (₹/kg, benchmarked bands per material), minus scrap credit, minimum stock charge.
- **B. Machining time** = removal time + feature time + finishing time + tool changes + handling:
  - *Removal*: (bbox − part volume) ÷ roughing MRR (material-specific cm³/min bands, complexity-derated, ×3 roughing factor);
  - *Features*: per-hole drilling seconds from exact diameters/depths, thread estimates;
  - *Finishing*: surface area ÷ finishing rate — added after benchmarking showed bulk MRR alone under-called 20–35 h jobs by 10–15×;
  - *Handling*: 8 min × setups (unload, re-clamp, indicate).
- **C. Setups**: from **measured machining directions** (B-rep) when available — clamped 1–8, +1 per ~1,500 cm² of machined surface, collapsed to 2–5 for 5-axis; falls back to a complexity heuristic for STL. Setup hours scale with part weight (heavy parts fixture slower). Setup cost is amortized across the batch.
- **C2. CAM programming**: 0.5–8 h driven by setups + holes + surface area (deliberately *not* the complexity score, which misread thin plates), at 35% of the machine rate, amortized.
- **D–G**: tooling wear ₹/spindle-hour by material, finish costs (anodize/powder/heat-treat per-area bands), inspection tier (basic/vernier/CMM), tolerance multipliers (±0.10 / ±0.05 / ±0.01 mm), vendor load factor, urgency, margin, volume discounts (5–12% at 100–500+ pcs), NRE line.

Everything lands in a `details` JSON blob stored with the quote — the PDF, the UI breakdown, and the API all read from the same trace.

**Calibration loop**: every quote snapshots the engine's predicted costing at creation; `PUT /quotes/{id}/actuals` + a quote-detail form record machinist-corrected values, building the dataset for coefficient refitting.

### Step 5 — Quote creation (`POST /api/quotes`, `/quotes/batch`, `/quotes/combined`)
Three modes: single part, batch (N files → N quotes), combined (N parts → one quote with line items, encoded in a structured notes block parsed by the PDF/UI). Quote numbers: `QT-YYYYMMDD-XXXXXX`. Customer identity resolves through the CRM service (find-or-create by email, then name; blank-filling, never overwriting). Editing an unanswered quote **replaces** it — no stale duplicates.

### Step 6 — PDF (`services/document.py`)
Branded HTML template → WeasyPrint. Includes the shop's logo/brand color (per-user), line items with HSN codes, **GST breakup** — CGST+SGST vs IGST decided by comparing the state codes (first 2 digits) of the seller's and customer's GSTINs — amount in words (Indian numbering), DFM summary, terms. PDFs regenerate only when stale, and are served **only** through authenticated/tokenized endpoints (never static paths).

### Step 7 — Share link & customer response (`/api/public/*`)
"Share with customer" mints a 192-bit capability token → `https://host/q/{token}`. Anyone with the link (no login) can view a customer-safe version, download the PDF, and **accept or decline with a note**. Sharing IS delivery: the quote auto-advances to `sent`. Responses are terminal (409 on double-respond). The owner can also **manually mark accepted/declined** for quotes delivered outside the app (forwarded PDF, phone call) — expiry doesn't block recording reality.

### Step 8 — CRM & feedback (`/api/customers`)
Every quote links to a customer record. The Customers screens show per-customer totals, win rate, last activity, expiring-soon quotes, full timeline. The dashboard shows a Customer Responses widget and the sidebar bell polls every 60 s for new accepts/declines and quotes expiring within 7 days.

---

## 5. Data model (18 tables)

| Table | Purpose |
|---|---|
| `users` | Shop owner accounts: auth, company profile (logo, brand color, **GSTIN**), `plan` (free/pro) + expiry, refresh-token hash |
| `cad_files` | Uploaded file records: hash, storage path, format, processing status/error |
| `geometry_analyses` | One per file: mesh + B-rep metrics, hole data JSON, machining direction count, solid count, engine version |
| `quotes` | The center of the schema: config FKs, price, `details` JSON trace, costing snapshot for calibration, status lifecycle (`draft → generated → sent → accepted/declined/expired`), share token, customer response fields, PDF path |
| `customers` | CRM-lite: name/email/company/phone/GSTIN/notes per owner |
| `materials`, `surface_finishes`, `inspection_levels`, `machine_rates` | Seeded, owner-editable cost configuration ("Cost Master" screen) |
| `vendors` + capability/expertise/certification tables | Vendor marketplace data; matched vendors feed real machine rates into pricing |
| `points_wallets`, `points_ledger_entries`, `points_packages`, `stripe_checkout_credits` | Points/billing scaffolding (disabled by master switch; Stripe not wired) |

Quote status lifecycle: `draft → generated → sent → accepted | declined`, with `expired` computed lazily from `valid_until` (14-day default) and persisted on read.

---

## 6. Frontend composition

**Pages** (`src/pages/`):
- `LandingPage` — public marketing page (dark industrial design, blueprint grid)
- `LoginPage` / `SignupPage` — split-panel auth; signup is 4 fields with a live password-rule checklist, auto-logs-in, then auto-opens the profile modal
- `HomePage` — dashboard: drag-and-drop upload, stat tiles, onboarding checklist ("create → share → get response"), profile-completion nudge, quote trend chart, Customer Responses + Expiring Soon widgets
- `QuoteBuilder` — the configure step: per-file material/finish/inspection/qty, customer picker (CRM autocomplete), commercial fields (RFQ, tolerances, HSN, routing), instant pricing preview, single/batch/combined modes, edit mode
- `QuoteList` / `QuoteDetail` — table with thumbnails/status/actions; detail shows lifecycle timeline, full price breakdown, share-link card, response recording, actuals form, PDF preview/download
- `CustomersPage` / `CustomerDetail` — CRM list with aggregates; detail with stat tiles, editable contact card, expiring strip, quote timeline
- `PublicQuotePage` (`/q/:token`) — the customer-facing view: line items, totals, accept/decline
- `AdminPricing` ("Cost Master") — edit material rates, finishes, inspection levels, machine rates
- `BillingPage` — plan picker (Starter/Professional/Enterprise)

**Key components**: `Layout` (sidebar with grouped nav, orange New Quote CTA, notification bell, plan badge/upsell, upgrade modal, theme toggle), `AuthProvider` (JWT lifecycle, proactive refresh), `CustomerPicker`, `PartThumbnail` (authed blob fetch + cache), `ModelViewer` (three.js), `CommandPalette` (Ctrl-K), `ProfileEditModal`, `FileUpload`, `PricingDisplay`, `DFXAnalysis`.

**Cross-cutting frontend patterns**: one axios client with auth-header injection, 401→refresh→retry, and 402→global "subscription required" event; typed API layer mirroring backend schemas; dark mode via a single CSS remap layer (`.dark` rules in `index.css`) so pages don't need per-component dark variants.

---

## 7. Security measures

- Passwords: bcrypt; strength policy enforced server-side and mirrored client-side.
- JWT access (2 h) + rotating refresh tokens (30 d, stored hashed, invalidated on logout); production refuses the default JWT secret; secrets live only in gitignored `.env`.
- nginx: rate limiting (10/min on login/register — brute-force protection; 300/min general), CSP, X-Frame-Options, referrer policy.
- Only `uploads/company_logos` is publicly served; quote PDFs and CAD files require auth or a share token (fixed: they were once static-served and guessable).
- DB/Redis/backend ports bind to loopback only; all traffic passes nginx.
- Share links: 192-bit `secrets.token_urlsafe(24)` capability URLs.
- Ownership checks on every resource access (files, quotes, customers scoped to `user_id`).
- Subscription gate server-side at upload (client checks are cosmetic only).

---

## 8. Testing & verification

- `backend/tests/` — pytest suite (~24 tests): pricing invariants (setup basis, GST breakup math, subscription logic, customer identity normalization), B-rep recognition against a procedurally built STEP (box + holes + fillet: exact diameters found, fillet excluded, direction count correct), API smoke tests.
- **Benchmark suite** (`Test files/`): 5 real STEP parts with machinist cost estimates; the July 2026 pricing overhaul was validated against them.
- Working practice: every feature is verified **live** before commit — API flows via scripted httpx runs against the docker stack, UI via headless-Chrome (puppeteer) driving the real login/upload/quote/share/respond flows with screenshots.

---

## 9. Known limitations & roadmap

**Current limitations (honest list):**
- No payment gateway — Pro plan is granted manually (Stripe scaffolding exists but is deliberately unwired; Razorpay is the intended gateway).
- No password reset (email infrastructure was removed) — Google sign-in is the planned fix.
- Machining time is parametric, not toolpath-based — ±40% band; the calibration loop exists to tighten coefficients.
- Single-user workspaces (no teams/roles).
- English/INR only.

**Roadmap (researched & planned):**
1. Cutting-parameter physics refinement + actuals-driven coefficient refitting (in progress — calibration data collecting).
2. OpenCAMLib toolpath-length finishing times for freeform surfaces.
3. Google login; Razorpay subscriptions.
4. Customer upload portal (customers upload CAD → instant draft quote → shop approves).
5. Fusion Automation API pilot for true CAM cycle times on high-value quotes.

---

## 10. Glossary (for explaining to non-engineers)

- **STEP/STL** — 3D CAD file formats. STEP carries exact geometry (curves, surfaces); STL is a triangle mesh approximation.
- **B-rep** — "boundary representation": the exact mathematical surfaces of a part. Lets us measure a hole as "Ø6.00 mm, 12.0 mm deep" instead of guessing from triangles.
- **DFM** — Design for Manufacturability: automated checks for features that are hard/expensive to machine.
- **MRR** — Material Removal Rate (cm³/min): how fast a machine can cut a given material; the core of machining-time math.
- **Setup** — each time the part must be re-clamped in a different orientation on the machine. Setups cost time and money; we count them from measured geometry.
- **CAM** — programming the machine's toolpaths; charged as engineering time on quotes.
- **GST CGST/SGST/IGST** — India's tax split: intra-state sales split the rate into central+state halves; inter-state charges the full rate as IGST. Determined by the first two digits of buyer/seller GSTINs.
- **Capability URL** — a link whose secret token IS the permission (like an unlisted document link); how customers see quotes without accounts.
