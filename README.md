# CNC Instant Quotation Platform

A full-stack web application for generating instant, transparent CNC machining quotes. Upload CAD files, select materials and finishes, and receive professional quotation documents in seconds.

## Features

- **Authentication**: JWT access + refresh token flow with strong password policy
- **Multi-Tenant Isolation**: Per-user ownership enforcement for files and quotes
- **CAD File Upload**: Support for STEP (.stp, .step) and STL (.stl) files up to 50MB
- **3D Preview**: Interactive Three.js-powered model viewer
- **Automatic Geometry Analysis**: Extracts volume, surface area, bounding box, and complexity score
- **Rule-Based Pricing**: Transparent, explainable pricing with detailed breakdown
- **PDF Quotes**: Professional, client-ready quotation documents
- **Quote PDF Preview**: In-app authenticated preview before download/email
- **Bulk Quote Edit Restore**: Combined quotes reopen in Configure with full multi-file context
- **Points Billing**: Wallet-based usage billing with Stripe top-ups
- **Material Library**: Pre-configured materials with density and cost data
- **Surface Finishes**: Multiple finish options with associated costs
- **Inspection Levels**: Basic to CMM inspection tiers

## Technology Stack

### Backend
- **FastAPI** 0.109 - Modern async Python web framework
- **PostgreSQL** 16 - Primary database
- **Redis** 7 - Caching layer for geometry analysis
- **SQLAlchemy** 2.0 - Async ORM
- **Pydantic** 2.5 - Data validation
- **trimesh** 4.0 - Geometry analysis
- **WeasyPrint** 60.2 - PDF generation

### Frontend
- **React** 18.2 - UI library
- **TypeScript** 5.3 - Type safety
- **Vite** 5.0 - Build tool
- **Tailwind CSS** 3.4 - Styling
- **Three.js** / React Three Fiber - 3D visualization
- **Axios** - API client

## Quick Start

### Using Docker (Recommended)

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd Quote
   ```

2. Copy environment configuration:
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. Start all services:
   ```bash
   docker-compose up -d
   ```

4. Run database migrations:
   ```bash
   docker-compose exec backend alembic upgrade head
   ```

5. Seed the database:
   ```bash
   docker-compose exec backend python -m app.seed
   ```

6. Access the application:
   - Frontend: http://localhost
   - API Docs: http://localhost:8000/docs
   - ReDoc: http://localhost:8000/redoc

### Local Development

#### Backend

1. Create a virtual environment:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   venv\Scripts\activate     # Windows
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Set environment variables:
   ```bash
   # Create .env file in backend directory
   DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/quote_db
   REDIS_URL=redis://localhost:6379
   SECRET_KEY=your-secret-key
   DEBUG=true
   ```

4. Run migrations:
   ```bash
   alembic upgrade head
   ```

5. Initialize seed data:
   ```bash
   python -m app.seed
   ```

6. Run the development server:
   ```bash
   uvicorn app.main:app --reload
   ```

#### Frontend

1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. Access at http://localhost:5173

## Pricing and DFM Documentation

Pricing and DFM logic is documented in detail in:

- `docs/PRICING_AND_DFM.md`

That document includes:

- Current material, machine, finish, and inspection values
- Full pricing formulas and quantity behavior
- Marketplace logic (overheads, risk, load, urgency, MOQ)
- Quote override parameters and validation limits
- Backend canonical DFM rules, weighted scoring, and issue model
- How DFM affects pricing penalties, lead-time adjustments, API responses, and PDF output

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a user and issue access/refresh tokens
- `POST /api/auth/login` - Login and issue access/refresh tokens
- `POST /api/auth/refresh` - Rotate refresh token and issue a new access token
- `POST /api/auth/logout` - Invalidate current refresh session
- `GET /api/auth/me` - Get authenticated user profile

### Billing
- `GET /api/billing/packages` - List active points packages
- `POST /api/billing/packages` - Create points package (admin workflow)
- `PATCH /api/billing/packages/{package_code}` - Update points package (admin workflow)
- `GET /api/billing/wallet` - Get current points wallet balance
- `GET /api/billing/ledger` - Get points transaction history
- `POST /api/billing/checkout-session` - Create Stripe checkout session for top-up
- `POST /api/billing/webhook` - Stripe webhook handler

### Files
- `POST /api/files/upload` - Upload CAD file
- `GET /api/files/{file_id}` - Get file info
- `GET /api/files/{file_id}/geometry` - Get geometry analysis
- `POST /api/files/{file_id}/process` - Process/reprocess file

### Configuration
- `GET /api/config/materials` - List materials
- `GET /api/config/surface-finishes` - List surface finishes
- `GET /api/config/inspection-levels` - List inspection levels

### Quotes
- `POST /api/pricing` - Calculate instant price
- `POST /api/pricing/batch` - Calculate instant prices for multiple files
- `POST /api/quotes` - Create formal quote
- `POST /api/quotes/batch` - Create multiple quotes with shared configuration
- `POST /api/quotes/combined` - Create one combined quote for multiple files
- `GET /api/quotes` - List quotes
- `GET /api/quotes/{quote_id}` - Get quote details
- `POST /api/quotes/{quote_id}/pdf` - Generate PDF
- `GET /api/quotes/{quote_id}/pdf/download` - Download PDF
- `GET /api/quotes/{quote_id}/pdf/preview` - Preview PDF inline

## Database Migrations (Alembic)

- Create a new migration after model changes:
   ```bash
   cd backend
   alembic revision --autogenerate -m "describe change"
   ```
- Apply migrations:
   ```bash
   cd backend
   alembic upgrade head
   ```
- Roll back one revision:
   ```bash
   cd backend
   alembic downgrade -1
   ```

## One-Time Combined Quote Metadata Migration

Use this utility to enrich older combined quotes so "Edit in Configure" can reopen them in full bulk mode.

- Dry run (recommended first):
   ```bash
   cd backend
   python migrate_combined_quote_notes.py
   ```
- Apply changes:
   ```bash
   cd backend
   python migrate_combined_quote_notes.py --apply
   ```
- Migrate a single quote only:
   ```bash
   cd backend
   python migrate_combined_quote_notes.py --apply --quote-id <quote-uuid>
   ```

## Stripe Setup

1. Add Stripe keys in [backend/.env](backend/.env):
   ```bash
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   FRONTEND_BASE_URL=http://localhost:5173
   BILLING_CURRENCY=inr
   ```

2. Install backend dependencies:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

3. Apply migrations:
   ```bash
   cd backend
   alembic upgrade head
   ```

4. Start Stripe webhook forwarding (local):
   ```bash
   stripe listen --forward-to http://localhost:8000/api/billing/webhook
   ```

5. Copy the printed webhook signing secret from Stripe CLI to `STRIPE_WEBHOOK_SECRET`.

6. Open Billing page in app and buy points via Stripe Checkout.

## Admin Points Package Configuration

- Go to Cost Master screen and manage "Points Packages (Stripe Billing)".
- You can add new packages and edit points, price, order, and active status.
- Stripe checkout always uses active packages from the database.

## Project Structure

```
Quote/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── files.py          # File upload endpoints
│   │   │   ├── config.py         # Configuration endpoints
│   │   │   └── quotes.py         # Quote endpoints
│   │   ├── core/
│   │   │   ├── config.py         # Settings management
│   │   │   ├── database.py       # Database connection
│   │   │   └── cache.py          # Redis cache
│   │   ├── models/
│   │   │   └── models.py         # SQLAlchemy models
│   │   ├── schemas/
│   │   │   └── schemas.py        # Pydantic schemas
│   │   ├── services/
│   │   │   ├── storage.py        # File storage
│   │   │   ├── upload.py         # Upload handling
│   │   │   ├── geometry.py       # Geometry analysis
│   │   │   ├── pricing.py        # Pricing engine
│   │   │   ├── quote.py          # Quote management
│   │   │   └── document.py       # PDF generation
│   │   ├── main.py               # FastAPI app
│   │   └── seed.py               # Database seeding
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.tsx
│   │   │   ├── FileUpload.tsx
│   │   │   ├── ModelViewer.tsx
│   │   │   ├── ConfigurationPanel.tsx
│   │   │   └── PricingDisplay.tsx
│   │   ├── pages/
│   │   │   ├── HomePage.tsx
│   │   │   ├── QuoteBuilder.tsx
│   │   │   ├── QuoteList.tsx
│   │   │   └── QuoteDetail.tsx
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   └── App.tsx
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_USER` | PostgreSQL username | `quote_user` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `quote_password` |
| `POSTGRES_DB` | Database name | `quote_db` |
| `SECRET_KEY` | App secret key | - |
| `JWT_SECRET_KEY` | JWT signing key | - |
| `DEBUG` | Debug mode | `false` |
| `ENVIRONMENT` | Environment name | `production` |

## Materials (Pre-seeded)

- Aluminum 6061-T6
- Aluminum 7075-T6
- Stainless Steel 304
- Stainless Steel 316
- Carbon Steel 1018
- Brass C360
- Copper C110
- Titanium Grade 5 (Ti-6Al-4V)
- PEEK
- Delrin (POM)

## Surface Finishes (Pre-seeded)

- As Machined (Ra 3.2μm)
- Smooth (Ra 1.6μm)
- Fine (Ra 0.8μm)
- Bead Blast
- Anodize Type II (Clear)
- Anodize Type II (Color)
- Anodize Type III (Hard)
- Powder Coat
- Electropolish

## Inspection Levels (Pre-seeded)

- Basic (Visual inspection)
- Standard (Dimensional check + COC)
- Full (100% inspection + measurements)
- CMM (CMM inspection + full report)

## License

MIT License
