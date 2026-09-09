# AI Procurement System - Backend

FastAPI backend for the AI-powered IT procurement platform.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set up PostgreSQL database:
```bash
createdb procurement_db
```

3. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
# Edit .env with your settings
```

4. Run migrations (if using Alembic):
```bash
alembic upgrade head
```

5. Run the server:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

API documentation: `http://localhost:8000/docs`

## Required environment variables

Create a `.env` file (or update the existing one) with:

```
DATABASE_URL=sqlite:///./procurement.db  # or your PostgreSQL URL
SECRET_KEY=dev-secret-key-change-in-production
OPENAI_API_KEY=sk-...                    # Needed for ProcureX AI responses
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
CORS_ORIGINS=["http://localhost:3000","http://localhost:8081"]
```

Without an `OPENAI_API_KEY`, the chat endpoint returns a friendly placeholder response instead of GPT-4 output.

## Seeding vendor data

The chat assistant streams live vendor inventory. Make sure you have:

1. At least one `Product` row (via `/api/v1/products` or the admin tooling).
2. A Supabase-authenticated user who registers as a vendor (`POST /api/v1/vendors`).
3. Vendor catalog entries created with `POST /api/v1/vendors/me/products` supplying `product_id`, `stock_quantity`, and `price`.

Each vendor product adds price/stock/contact metadata that ProcureX references in responses. Keep the catalog up to date for accurate pricing.


