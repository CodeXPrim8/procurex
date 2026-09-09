# 🔴 Quick Fix: Supabase Connection Error

## Problem
Your Supabase project `eugnepzbjrvqmzldhrql.supabase.co` cannot be resolved. This means the project is **PAUSED** or **DELETED**.

## ✅ Solution (Choose One)

### Option 1: Restore Paused Project (Fastest)

1. **Go to**: https://supabase.com/dashboard
2. **Login** to your account
3. **Find** project `eugnepzbjrvqmzldhrql` (or look for "Paused" projects)
4. **Click** on the project
5. **Click** "Restore" or "Resume" button
6. **Wait** 1-2 minutes for project to start
7. **Refresh** your browser at http://localhost:3000
8. **Try again** - it should work now!

### Option 2: Create New Supabase Project

If you can't find the project or it's deleted:

1. **Go to**: https://supabase.com/dashboard
2. **Click** "New Project" (green button)
3. **Fill in**:
   - Name: `ProcureX` (or any name)
   - Database Password: Create a strong password (SAVE THIS!)
   - Region: Choose closest to you
4. **Click** "Create new project"
5. **Wait** 2-3 minutes for initialization

6. **Get credentials**:
   - Go to: **Settings** → **API**
   - Copy **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - Copy **anon public key** (starts with `eyJ...`)

7. **Update `web/.env.local`**:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-new-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your-new-key
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

8. **Restart the frontend server**:
   - Stop the current server (Ctrl+C in the PowerShell window)
   - Run: `cd web && npm run dev`

9. **Test**: Open http://localhost:3000 and try registration

## 🧪 Verify It Works

After fixing:
1. Open browser console (F12)
2. Look for: `✅ Supabase connection successful`
3. Try registering a new account

## ⚠️ Important Notes

- **No spaces** around `=` in .env files
- **No quotes** around values
- **Restart server** after updating .env.local
- **Wait 1-2 minutes** after restoring paused project

## 📋 Current Configuration

Your current `.env.local` has:
- URL: `https://eugnepzbjrvqmzldhrql.supabase.co` ❌ (Cannot resolve)
- This project needs to be restored or replaced
