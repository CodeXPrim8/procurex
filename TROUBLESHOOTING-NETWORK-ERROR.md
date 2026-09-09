# Troubleshooting: Network Error During Registration

## 🔴 Problem
Getting "Network error. Please check your internet connection and try again." when trying to create an account.

## 🔍 Root Cause Analysis

The error occurs when the frontend cannot connect to Supabase. Common causes:

1. **Supabase Project is Paused** (Most Common)
   - Free tier projects pause after inactivity
   - Project needs to be reactivated

2. **Incorrect Supabase URL**
   - URL in `.env.local` doesn't match actual project
   - Typo in the URL

3. **Invalid API Key**
   - API key expired or incorrect
   - Wrong key copied from dashboard

4. **Network/Firewall Issues**
   - Internet connection problems
   - Firewall blocking Supabase domain
   - Corporate network restrictions

5. **Supabase Project Deleted**
   - Project was deleted from Supabase dashboard
   - Need to create new project

## ✅ Solutions

### **Solution 1: Check if Supabase Project is Active**

1. Go to: https://supabase.com/dashboard
2. Login to your account
3. Check if your project `eugnepzbjrvqmzldhrql` is listed
4. If project shows "Paused" or is missing:
   - Click on project
   - Click "Restore" or "Resume" to reactivate
   - Wait 1-2 minutes for project to start

### **Solution 2: Verify Supabase Credentials**

1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/eugnepzbjrvqmzldhrql
2. Go to: **Settings** → **API**
3. Verify:
   - **Project URL**: Should match `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`
   - **anon/public key**: Should match `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`
4. Copy fresh keys if needed
5. Update `web/.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://eugnepzbjrvqmzldhrql.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<copy-fresh-key-here>
   ```
6. **Restart Next.js dev server** (important!)

### **Solution 3: Test Supabase Connection**

Open browser console (F12) and run:
```javascript
fetch('https://eugnepzbjrvqmzldhrql.supabase.co/rest/v1/', {
  headers: { 'apikey': 'YOUR_ANON_KEY_HERE' }
}).then(r => console.log('Status:', r.status)).catch(e => console.error('Error:', e))
```

- **Status 200**: ✅ Connection works
- **Status 401**: ❌ API key is invalid
- **Status 404**: ❌ Project not found (paused or deleted)
- **Network Error**: ❌ Cannot reach Supabase (internet/firewall issue)

### **Solution 4: Check Browser Console**

1. Open browser DevTools (F12)
2. Go to **Console** tab
3. Try to register again
4. Look for error messages:
   - `❌ Cannot connect to Supabase` → Connection issue
   - `❌ Supabase API key is invalid` → Key issue
   - `❌ Supabase project not found` → Project paused/deleted
   - `Failed to fetch` → Network issue

### **Solution 5: Restart Development Server**

After updating `.env.local`:
1. Stop the Next.js server (Ctrl+C)
2. Restart it: `npm run dev` in `web/` directory
3. Clear browser cache (Ctrl+Shift+Delete)
4. Try registration again

### **Solution 6: Create New Supabase Project (If Project Deleted)**

If project was deleted:
1. Go to: https://supabase.com/dashboard
2. Click "New Project"
3. Fill in project details
4. Wait for project to initialize
5. Go to **Settings** → **API**
6. Copy new URL and keys
7. Update `web/.env.local` and `backend/.env`
8. Restart servers

## 🔧 Quick Fix Checklist

- [ ] Check Supabase Dashboard - is project active?
- [ ] Verify `.env.local` has correct Supabase URL
- [ ] Verify `.env.local` has correct API key
- [ ] Restart Next.js dev server after updating `.env.local`
- [ ] Check browser console for specific errors
- [ ] Test internet connection (can you access supabase.com?)
- [ ] Try in incognito/private browser window
- [ ] Check if firewall/antivirus is blocking

## 📝 Current Configuration

Based on your setup:
- **Supabase URL**: `https://eugnepzbjrvqmzldhrql.supabase.co`
- **Status**: ⚠️ **URL cannot be resolved** (project may be paused)

## 🎯 Most Likely Fix

**The Supabase project is probably paused.** 

1. Go to: https://supabase.com/dashboard
2. Find project `eugnepzbjrvqmzldhrql`
3. If paused, click "Restore" or "Resume"
4. Wait 1-2 minutes
5. Try registration again

## 📞 Still Not Working?

If none of the above works:
1. Check browser console for exact error message
2. Check Supabase Dashboard for project status
3. Verify you can access https://supabase.com in browser
4. Try creating a new Supabase project
5. Update credentials in both `.env.local` and `.env` files
