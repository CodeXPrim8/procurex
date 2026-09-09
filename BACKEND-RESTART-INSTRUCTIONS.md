# 🔄 Backend Restart Instructions

## Why Restart?
The CORS configuration has been updated, but the backend needs to be restarted for the changes to take effect.

## Quick Restart (Easiest Method)

**Option 1: Use the restart script**
```powershell
.\RESTART-BACKEND-NOW.ps1
```

**Option 2: Manual restart**
1. **Stop the backend:**
   - Find the PowerShell window running the backend
   - Press `Ctrl+C` to stop it, OR
   - Close that PowerShell window

2. **Start the backend:**
   ```powershell
   .\backend-watchdog.ps1
   ```

3. **Wait 5-10 seconds** for the backend to start

4. **Verify it's running:**
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:8000/health"
   ```
   Should return: `{"status":"healthy","database":"connected",...}`

## After Restart

1. **Refresh your browser** (hard refresh: `Ctrl+Shift+R` or `Ctrl+F5`)
2. **Clear browser cache** if needed (optional but recommended)
3. **Try registering as a vendor again**

## Verify CORS is Working

After restarting, check the browser console (F12):
- ✅ You should see successful API requests
- ✅ No CORS errors
- ✅ POST requests should work

## Troubleshooting

### Backend won't start?
1. Check the backend PowerShell window for error messages
2. Verify Python virtual environment exists: `backend\venv\Scripts\Activate.ps1`
3. Check if port 8000 is available: `netstat -ano | findstr ":8000"`

### Still getting CORS errors?
1. Make sure you restarted the backend (not just refreshed the page)
2. Clear browser cache completely
3. Try in an incognito/private window
4. Check browser console for specific error messages

### Backend starts but immediately crashes?
1. Check `backend-watchdog.log` for errors
2. Check the backend PowerShell window for Python errors
3. Verify database connection is working
4. Check `.env` file configuration

## Need Help?

If the backend still won't start or CORS errors persist:
1. Check `backend-watchdog.log` for detailed error messages
2. Check the backend PowerShell window output
3. Verify all environment variables are set correctly
4. Try starting backend manually:
   ```powershell
   cd backend
   .\venv\Scripts\Activate.ps1
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
