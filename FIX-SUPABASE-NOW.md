# 🔴 URGENT: Fix Supabase Connection

## ❌ Error Confirmed
```
ERR_NAME_NOT_RESOLVED: eugnepzbjrvqmzldhrql.supabase.co
```

**This means your Supabase project is PAUSED or DELETED.**

## ✅ IMMEDIATE FIX - Choose One:

### **Option A: Reactivate Existing Project (If Paused)**

1. **Go to**: https://supabase.com/dashboard
2. **Login** to your account
3. **Find project**: `eugnepzbjrvqmzldhrql`
4. **If you see "Paused"**:
   - Click on the project
   - Click **"Restore"** or **"Resume"** button
   - Wait 1-2 minutes for project to start
5. **Try registration again**

### **Option B: Create New Supabase Project (If Deleted or Can't Find)**

**Step 1: Create New Project**
1. Go to: https://supabase.com/dashboard
2. Click **"New Project"** (green button)
3. Fill in:
   - **Name**: `ProcureX` (or any name)
   - **Database Password**: Create a strong password (SAVE THIS!)
   - **Region**: Choose closest to you
4. Click **"Create new project"**
5. **Wait 2-3 minutes** for project to initialize

**Step 2: Get New Credentials**
1. Once project is ready, go to: **Settings** → **API**
2. You'll see:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - **service_role key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (scroll down)

**Step 3: Update web/.env.local**
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-new-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your-new-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Step 4: Update backend/.env**
```env
SUPABASE_URL=https://your-new-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your-new-key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your-service-key
DATABASE_URL=sqlite:///./procurement.db
```

**Step 5: Restart Servers**
1. Stop both servers (Ctrl+C in their terminals)
2. Restart backend: `cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`
3. Restart frontend: `cd web && npm run dev`
4. Wait for both to be ready
5. Try registration again

## 🧪 Verify It Works

After updating credentials and restarting:

1. Open: `http://localhost:3000`
2. Open **Browser Console** (F12)
3. Look for: `✅ Supabase connection successful`
4. Try registration

## 📋 Quick Checklist

- [ ] Go to Supabase Dashboard
- [ ] Check if project exists
- [ ] If paused → Click "Restore"
- [ ] If deleted → Create new project
- [ ] Copy new URL and keys
- [ ] Update `web/.env.local`
- [ ] Update `backend/.env`
- [ ] Restart both servers
- [ ] Test registration

## ⚠️ Important Notes

- **No spaces** around `=` in .env files
- **No quotes** around values (unless they contain spaces)
- **Restart servers** after updating .env files
- **Wait 1-2 minutes** after reactivating paused project
