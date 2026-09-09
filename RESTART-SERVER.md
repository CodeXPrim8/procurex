# How to Restart Next.js Server After Updating .env.local

## ⚠️ Important
**Environment variables are only loaded when the server starts.** You MUST restart the Next.js dev server after updating `.env.local`.

## 🔄 Steps to Restart

### **Option 1: Restart via Terminal**
1. Find the terminal window running Next.js (usually shows "next dev" or "npm run dev")
2. Press `Ctrl + C` to stop the server
3. Run: `npm run dev` (in the `web/` directory)
4. Wait for "Ready" message
5. Try registration again

### **Option 2: Restart via PowerShell Script**
Run this command:
```powershell
cd web
npm run dev
```

### **Option 3: Use the Startup Script**
```powershell
.\start-web.ps1
```

## ✅ Verify Server Restarted
After restarting, you should see:
- `▲ Next.js 14.0.4`
- `- Local: http://localhost:3000`
- `✓ Ready in X seconds`

## 🧪 Test After Restart

1. **Open browser**: `http://localhost:3000/register`
2. **Open browser console** (F12 → Console tab)
3. **Look for**: 
   - `✅ Supabase connection successful` (good!)
   - `❌ Cannot connect to Supabase` (still an issue)
4. **Try registration** with a test email
5. **Check console** for any error messages

## 🔍 If Still Getting Network Error

1. **Check browser console** (F12) for specific error
2. **Verify Supabase project is active** at https://supabase.com/dashboard
3. **Check .env.local format**:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
4. **No spaces** around `=` sign
5. **No quotes** around values (unless they contain spaces)
6. **Restart server again** after any changes
