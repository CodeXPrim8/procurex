# How to Run the Application on Localhost

## Prerequisites

1. **Python 3.8+** - Install from [python.org](https://www.python.org/downloads/) or Microsoft Store
2. **Node.js 18+** - Install from [nodejs.org](https://nodejs.org/)
3. **PostgreSQL** - Install from [postgresql.org](https://www.postgresql.org/download/) (or use Docker)

## Quick Start

### Option 1: Using the provided scripts (Windows)

1. **Start Backend:**
   ```powershell
   .\start-backend.ps1
   ```

2. **Start Frontend (in a new terminal):**
   ```powershell
   .\start-web.ps1
   ```

### Option 2: Manual Setup

#### Backend Setup

1. Navigate to backend directory:
   ```powershell
   cd backend
   ```

2. Create virtual environment:
   ```powershell
   python -m venv venv
   ```

3. Activate virtual environment:
   ```powershell
   .\venv\Scripts\Activate.ps1
   ```

4. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```

5. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Update the values (especially `DATABASE_URL` and `OPENAI_API_KEY`)

6. Set up PostgreSQL database:
   ```sql
   CREATE DATABASE procurement_db;
   ```

7. Run the server:
   ```powershell
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

   Backend will be available at: `http://localhost:8000`
   API Docs: `http://localhost:8000/docs`

#### Frontend Setup

1. Navigate to web directory:
   ```powershell
   cd web
   ```

2. Install dependencies:
   ```powershell
   npm install
   ```

3. Create `.env.local` file (optional):
   ```
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

4. Run the development server:
   ```powershell
   npm run dev
   ```

   Frontend will be available at: `http://localhost:3000`

## Environment Variables

### Backend (.env)
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/procurement_db
SECRET_KEY=your-secret-key-change-in-production
OPENAI_API_KEY=your-openai-api-key-here
CORS_ORIGINS=["http://localhost:3000","http://localhost:8081"]
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Troubleshooting

1. **Python not found**: Make sure Python is installed and added to PATH
2. **Node not found**: Make sure Node.js is installed and added to PATH
3. **Database connection error**: Check PostgreSQL is running and DATABASE_URL is correct
4. **Port already in use**: Change the port in the command (e.g., `--port 8001`)

## Access Points

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **API Health Check**: http://localhost:8000/health


