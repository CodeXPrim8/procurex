# How to Run the Servers

## Quick Start (Step by Step)

### Step 1: Start Backend (Terminal 1)

Open PowerShell and run:

```powershell
cd C:\Users\clemx\PROCUREMENT\backend
.\venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

### Step 2: Start Frontend (Terminal 2)

Open a NEW PowerShell window and run:

```powershell
cd C:\Users\clemx\PROCUREMENT\web
npm run dev
```

You should see:
```
  ▲ Next.js 14.0.4
  - Local:        http://localhost:3000
```

### Step 3: Access the Application

- **Frontend**: Open http://localhost:3000 in your browser
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## Troubleshooting

### Backend won't start?

1. **Check if .env exists:**
   ```powershell
   cd backend
   Test-Path .env
   ```
   If False, create it:
   ```powershell
   Copy-Item .env.example .env
   ```

2. **Check database:**
   - The .env file should have: `DATABASE_URL=sqlite:///./procurement.db`
   - SQLite will create the database automatically

3. **Reinstall dependencies:**
   ```powershell
   cd backend
   .\venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

### Frontend won't start?

1. **Install dependencies:**
   ```powershell
   cd web
   npm install
   ```

2. **Check .env.local:**
   ```powershell
   cd web
   Test-Path .env.local
   ```
   If False, create it:
   ```powershell
   "NEXT_PUBLIC_API_URL=http://localhost:8000" | Out-File .env.local
   ```

### Port already in use?

If port 8000 or 3000 is busy:
- Backend: Change port in command: `--port 8001`
- Frontend: Change in package.json or use: `PORT=3001 npm run dev`

## What to Expect

✅ **Backend running**: You'll see FastAPI startup messages
✅ **Frontend running**: You'll see Next.js compilation messages
✅ **Both working**: Open http://localhost:3000 and see the login page

## Need Help?

Check the terminal output for error messages. Common issues:
- Missing dependencies → Run `pip install` or `npm install`
- Database errors → Check DATABASE_URL in .env
- Port conflicts → Change ports or stop other services

