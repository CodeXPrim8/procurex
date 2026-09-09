# Manual Start Instructions

Follow these steps **one by one** in separate terminal windows.

## Step 1: Start Backend Server

**Open PowerShell Terminal 1:**

```powershell
# Navigate to backend folder
cd C:\Users\clemx\PROCUREMENT\backend

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Start the server
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Wait until you see:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

**Keep this terminal open!** Don't close it.

---

## Step 2: Start Frontend Server

**Open a NEW PowerShell Terminal 2:**

```powershell
# Navigate to web folder
cd C:\Users\clemx\PROCUREMENT\web

# Start the development server
npm run dev
```

**Wait until you see:**
```
  ▲ Next.js 14.0.4
  - Local:        http://localhost:3000
  ✓ Ready in X seconds
```

**Keep this terminal open too!** Don't close it.

---

## Step 3: Open in Browser

Once both servers are running:

1. **Open your web browser**
2. **Go to:** http://localhost:3000
3. You should see the login page

---

## Troubleshooting

### If Backend Won't Start:

**Check if .env file exists:**
```powershell
cd C:\Users\clemx\PROCUREMENT\backend
Test-Path .env
```

If it says `False`, create it:
```powershell
# Copy the example file
Copy-Item .env.example .env

# Or create manually with SQLite
@"
DATABASE_URL=sqlite:///./procurement.db
SECRET_KEY=dev-secret-key-change-in-production
OPENAI_API_KEY=
CORS_ORIGINS=["http://localhost:3000"]
"@ | Out-File -FilePath ".env" -Encoding utf8
```

**If you see database errors:**
- The SQLite database will be created automatically
- Make sure you're in the `backend` folder when running

**If you see "Module not found" errors:**
```powershell
cd C:\Users\clemx\PROCUREMENT\backend
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### If Frontend Won't Start:

**If you see "node_modules not found":**
```powershell
cd C:\Users\clemx\PROCUREMENT\web
npm install
```

**If you see port 3000 already in use:**
- Close the other application using port 3000
- Or change the port: `PORT=3001 npm run dev`

**If you see API connection errors:**
- Make sure backend is running first (Step 1)
- Check that backend shows "Application startup complete"

---

## Summary Checklist

- [ ] Terminal 1: Backend running on http://localhost:8000
- [ ] Terminal 2: Frontend running on http://localhost:3000
- [ ] Browser: Opened http://localhost:3000
- [ ] Can see the login page

---

## Quick Commands Reference

**Backend:**
```powershell
cd backend
.\venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```powershell
cd web
npm run dev
```

**Stop Servers:**
- Press `Ctrl+C` in each terminal window

---

## What You Should See

**Backend Terminal:**
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000
```

**Frontend Terminal:**
```
  ▲ Next.js 14.0.4
  - Local:        http://localhost:3000
  ✓ Ready in 2.5s
```

**Browser:**
- Login page with "AI Procurement System" title
- Or home page if already logged in

