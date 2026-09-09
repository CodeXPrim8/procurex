# Quick Setup Guide

## Prerequisites Installation

### 1. Install Python
- Download from: https://www.python.org/downloads/
- During installation, check "Add Python to PATH"
- Verify: Open PowerShell and run `python --version`

### 2. Install Node.js
- Download from: https://nodejs.org/ (LTS version recommended)
- Verify: Open PowerShell and run `node --version`

### 3. Install PostgreSQL (Optional - for production)
- Download from: https://www.postgresql.org/download/
- Or use SQLite for development (modify DATABASE_URL in .env)

## Quick Start (Windows)

### Method 1: Use the startup scripts

1. **Start everything at once:**
   ```powershell
   .\start-all.ps1
   ```
   This will open two PowerShell windows - one for backend, one for frontend.

2. **Or start individually:**
   ```powershell
   # Terminal 1 - Backend
   .\start-backend.ps1
   
   # Terminal 2 - Frontend  
   .\start-web.ps1
   ```

### Method 2: Manual start

**Backend:**
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Create .env file (copy from .env.example)
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```powershell
cd web
npm install
npm run dev
```

## First Time Setup

1. **Backend Environment:**
   - Copy `backend/.env.example` to `backend/.env`
   - Update `DATABASE_URL` (use SQLite for quick start: `sqlite:///./procurement.db`)
   - Add your `OPENAI_API_KEY` (optional, for AI features)

2. **Frontend Environment:**
   - Create `web/.env.local` with:
     ```
     NEXT_PUBLIC_API_URL=http://localhost:8000
     ```

## Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## Troubleshooting

- **"Python not found"**: Install Python and add to PATH
- **"Node not found"**: Install Node.js and add to PATH  
- **Port conflicts**: Change ports in the startup commands
- **Database errors**: Check DATABASE_URL in .env file


