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

## Pricing Model

The pricing engine uses transparent, rule-based logic:

### Cost Components

1. **Material Cost**
   ```
   Material Cost = Volume (cm³) × Density (g/cm³) × (Cost per kg / 1000)
   ```

2. **Machining Cost**
   ```
   Estimated Time = Volume × Time/Volume Factor × Complexity Multiplier
   Machining Cost = Estimated Time × Hourly Rate
   ```

3. **Surface Finish Cost**
   ```
   Finish Cost = (Machining Cost × Multiplier) + Fixed Cost
   ```

4. **Inspection Cost**
   ```
   Inspection Cost = Fixed Cost + (Subtotal × Percentage)
   ```

5. **Total Price**
   ```
   Subtotal = Material + Machining + Finish + Inspection
   Total = (Subtotal × Profit Margin) - Quantity Discount
   ```

### Complexity Factors

| Complexity Score | Multiplier |
|-----------------|------------|
| < 5 | 0.8x |
| 5-10 | 1.0x |
| 10-20 | 1.3x |
| 20-35 | 1.6x |
| > 35 | 2.0x |

### Quantity Discounts

| Quantity | Discount |
|----------|----------|
| 1 | 0% |
| 2-5 | 5% |
| 6-10 | 10% |
| 11-25 | 15% |
| 26-50 | 20% |
| 50+ | 25% |

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a user and issue access/refresh tokens
- `POST /api/auth/login` - Login and issue access/refresh tokens
- `POST /api/auth/refresh` - Rotate refresh token and issue a new access token
- `POST /api/auth/logout` - Invalidate current refresh session
- `GET /api/auth/me` - Get authenticated user profile

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
