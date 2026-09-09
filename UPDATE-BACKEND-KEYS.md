# ⚠️ IMPORTANT: Update Backend API Keys

## ✅ What I Just Did
- Updated `SUPABASE_URL` in `backend/.env` to the new project URL

## 🔑 What You Need to Do

The backend also needs the **new API keys** from your new Supabase project.

### **Step 1: Get New Keys from Supabase**
1. Go to: https://supabase.com/dashboard/project/aoszzmfazqperudswhxa
2. Go to: **Settings** → **API**
3. Copy these keys:
   - **anon public key** (starts with `eyJ...`)
   - **service_role key** (starts with `eyJ...`, scroll down to find it)

### **Step 2: Update backend/.env**
Open `backend/.env` and update these lines:

```env
SUPABASE_URL=https://aoszzmfazqperudswhxa.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvc3p6bWZhenFwZXJ1ZHN3aHhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1MTIxNzEsImV4cCI6MjA4NDA4ODE3MX0.BVmRFLWzKK6bZ2jQFS_Ey9lmemnYt3KNI8wg-whM7Cs
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvc3p6bWZhenFwZXJ1ZHN3aHhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODUxMjE3MSwiZXhwIjoyMDg0MDg4MTcxfQ.iT9tIrjXXsmPDSCi7diSIEuJNkSXJixxaj8lT7EXldg
```

### **Step 3: Restart Backend**
After updating:
1. Stop backend: Ctrl+C in backend terminal
2. Restart: `cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`

## ✅ After This
- Frontend and backend will both use the same Supabase project
- Authentication will work end-to-end
- Registration will work!
