# 🔴 CORS Error - Quick Fix Guide

## Problem
You're seeing: **"Cannot connect to server. Please check if the backend is running at http://localhost:8000"**

But the backend IS running! This is actually a **CORS error** - the browser is blocking the request before it reaches the backend.

## Why This Happens
- Backend is running ✅
- CORS configuration exists ✅  
- BUT: Backend needs restart to apply CORS fixes ❌
- OR: Browser cached old CORS response ❌

## Quick Fix (3 Steps)

### Step 1: Restart Backend
```powershell
.\RESTART-BACKEND-NOW.ps1
```

Or manually:
1. Stop backend (close PowerShell window or Ctrl+C)
2. Start backend: `.\backend-watchdog.ps1`

### Step 2: Hard Refresh Browser
- Press `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- This clears cached CORS responses

### Step 3: Try Again
- Go to `/vendor` page
- Try registering as vendor
- Check browser console (F12) - should see successful requests

## Verify CORS is Working

After restarting, test in browser console:
```javascript
fetch('http://localhost:8000/api/v1/vendors', {
  method: 'OPTIONS',
  headers: {
    'Origin': 'http://localhost:3000',
    'Access-Control-Request-Method': 'POST'
  }
}).then(r => {
  console.log('CORS Headers:', r.headers.get('access-control-allow-origin'))
})
```

Should return: `http://localhost:3000`

## Still Not Working?

1. **Check backend logs** - Look for CORS configuration messages
2. **Clear browser cache completely** - Settings → Clear browsing data
3. **Try incognito/private window** - Rules out extensions
4. **Check Network tab** - Look for OPTIONS preflight request
5. **Verify CORS in backend** - Check `backend/app/main.py` line 36 for CORS log

## What Changed

The backend CORS configuration was updated to:
- Explicitly allow POST, PUT, DELETE, OPTIONS methods
- Properly handle preflight OPTIONS requests
- Include all necessary CORS headers

But **the backend must be restarted** for these changes to take effect!
