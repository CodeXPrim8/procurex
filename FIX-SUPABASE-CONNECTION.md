# 🔴 FIX: Supabase Connection Error

## Problem Confirmed
The Supabase URL `eugnepzbjrvqmzldhrql.supabase.co` **cannot be resolved**. This means:
- ❌ Project is **PAUSED** (most likely)
- ❌ Project was **DELETED**
- ❌ URL is **INCORRECT**

## ✅ Solution: Check & Reactivate Supabase Project

### **Step 1: Check Supabase Dashboard**

1. **Go to**: https://supabase.com/dashboard
2. **Login** to your account
3. **Look for project**: `eugnepzbjrvqmzldhrql`
4. **Check status**:
   - ✅ **Active** → Project is running (but URL still not resolving - see Step 2)
   - ⏸️ **Paused** → Click "Restore" or "Resume"
   - ❌ **Not Found** → Project was deleted (see Step 3)

### **Step 2: If Project is Active but Still Not Working**

1. **Go to**: Settings → API
2. **Copy the EXACT Project URL** (should be like `https://xxxxx.supabase.co`)
3. **Copy the anon/public key**
4. **Update `web/.env.local`**:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
5. **Restart Next.js server** (Ctrl+C, then `npm run dev`)

### **Step 3: If Project is Deleted or Not Found**

**Create a NEW Supabase Project:**

1. **Go to**: https://supabase.com/dashboard
2. **Click**: "New Project"
3. **Fill in**:
   - Name: `ProcureX` (or any name)
   - Database Password: (save this!)
   - Region: Choose closest to you
4. **Wait** 2-3 minutes for project to initialize
5. **Go to**: Settings → API
6. **Copy**:
   - Project URL
   - anon/public key
7. **Update BOTH files**:

   **`web/.env.local`:**
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-new-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-new-anon-key
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

   **`backend/.env`:**
   ```env
   SUPABASE_URL=https://your-new-project.supabase.co
   SUPABASE_ANON_KEY=your-new-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-new-service-role-key
   DATABASE_URL=sqlite:///./procurement.db
   ```

8. **Restart BOTH servers**:
   - Backend: Stop and restart
   - Frontend: Stop and restart (`npm run dev` in `web/`)

### **Step 4: Verify Connection**

After updating credentials:

1. **Open browser**: `http://localhost:3000`
2. **Open Console** (F12 → Console tab)
3. **Look for**: `✅ Supabase connection successful`
4. **Try registration** again

## 🧪 Test Connection

Open this file in your browser to test:
- `http://localhost:3000/test-supabase.html`

Or test in browser console:
```javascript
fetch('https://YOUR-PROJECT-URL.supabase.co/rest/v1/', {
  headers: { 'apikey': 'YOUR-ANON-KEY' }
}).then(r => console.log('Status:', r.status)).catch(e => console.error('Error:', e))
```

## 📋 Quick Checklist

- [ ] Check Supabase Dashboard - is project active?
- [ ] If paused → Click "Restore"
- [ ] If deleted → Create new project
- [ ] Copy fresh URL and keys from Settings → API
- [ ] Update `web/.env.local` with new credentials
- [ ] Update `backend/.env` with new credentials
- [ ] Restart Next.js server (Ctrl+C, then `npm run dev`)
- [ ] Restart backend server
- [ ] Test registration again
- [ ] Check browser console for connection status

## 🎯 Most Likely Fix

**Your Supabase project is PAUSED.** 

1. Go to https://supabase.com/dashboard
2. Find your project
3. Click "Restore" or "Resume"
4. Wait 1-2 minutes
5. Try registration again

If project doesn't exist, create a new one and update credentials in both `.env.local` and `.env` files.
