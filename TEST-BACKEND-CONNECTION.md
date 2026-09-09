# Backend Connection Troubleshooting Guide

## Quick Test

Run this in PowerShell to test backend connectivity:

```powershell
# Test 1: Health endpoint (should work)
Invoke-RestMethod -Uri "http://localhost:8000/health"

# Test 2: API root (should return 404 - that's normal)
Invoke-WebRequest -Uri "http://localhost:8000/api/v1" -UseBasicParsing

# Test 3: API endpoint with auth (should return 401 - that's normal)
Invoke-WebRequest -Uri "http://localhost:8000/api/v1/vendors/me" -UseBasicParsing -Headers @{"Authorization"="Bearer test"}
```

## Common Issues and Solutions

### Issue 1: "Cannot connect to backend API"
**Symptoms:** Frontend shows connection error even though backend is running

**Possible Causes:**
1. **CORS Issue**: Backend is running but browser is blocking the request
2. **Network Issue**: Browser can't reach localhost:8000
3. **Authentication Issue**: Request is being made but token is invalid

**Solutions:**
1. Check if backend is running:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:8000/health"
   ```

2. Check browser console (F12) for CORS errors:
   - Look for "CORS policy" or "Access-Control-Allow-Origin" errors
   - If you see CORS errors, check `backend/app/core/config.py` - `CORS_ORIGINS` should include your frontend URL

3. Verify you're logged in:
   - Check if you have a valid Supabase session
   - Try logging out and logging back in

4. Check backend logs:
   - Look at the backend PowerShell window for any errors
   - Check if requests are reaching the backend

### Issue 2: Backend Not Starting
**Symptoms:** Health check fails, port 8000 not listening

**Solutions:**
1. Start backend manually:
   ```powershell
   .\backend-watchdog.ps1
   ```

2. Or use the quick start script:
   ```powershell
   .\QUICK-START-BACKEND.ps1
   ```

3. Check if port 8000 is already in use:
   ```powershell
   netstat -ano | findstr ":8000"
   ```

4. Kill existing processes on port 8000:
   ```powershell
   Get-NetTCPConnection -LocalPort 8000 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
   ```

### Issue 3: 401 Unauthorized
**Symptoms:** Backend responds but returns 401 errors

**Solutions:**
1. Check if you're logged in:
   - Open browser console (F12)
   - Check if Supabase session exists
   - Try logging out and logging back in

2. Verify Supabase configuration:
   - Check `web/.env.local` has correct Supabase credentials
   - Verify Supabase project is active (not paused)

3. Check backend Supabase configuration:
   - Verify `backend/.env` has `SUPABASE_URL` and `SUPABASE_ANON_KEY`
   - These should match your frontend Supabase credentials

### Issue 4: CORS Errors
**Symptoms:** Browser console shows CORS policy errors

**Solutions:**
1. Update backend CORS configuration:
   - Edit `backend/app/core/config.py`
   - Add your frontend URL to `CORS_ORIGINS`:
     ```python
     CORS_ORIGINS: list[str] = [
         "http://localhost:3000",
         "http://localhost:8081",
         "http://127.0.0.1:3000",  # Add this if needed
     ]
     ```

2. Restart backend after changing CORS settings

3. For development, you can temporarily allow all origins (NOT for production):
   ```python
   allow_origins=["*"]  # Only for development!
   ```

## Verification Steps

1. **Backend Health:**
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:8000/health"
   ```
   Should return: `{"status":"healthy","database":"connected",...}`

2. **Backend API Docs:**
   Open in browser: `http://localhost:8000/docs`
   Should show FastAPI Swagger documentation

3. **Frontend Connection:**
   - Open browser console (F12)
   - Try registering as vendor
   - Check Network tab for failed requests
   - Look at request/response details

## Still Having Issues?

1. Check backend logs in the PowerShell window running the backend
2. Check browser console (F12) for detailed error messages
3. Verify all environment variables are set correctly
4. Try restarting both backend and frontend
5. Clear browser cache and cookies
6. Try in an incognito/private window
