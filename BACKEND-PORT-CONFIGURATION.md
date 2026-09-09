# Backend Port Configuration Guide

## Default Configuration

**Current Setup:**
- Backend runs on: `http://localhost:8000`
- Frontend connects to: `http://localhost:8000` (configurable)

## Alternative Ports

Yes, you can run the backend on a different port! Here are your options:

### Option 1: Change Backend Port (Recommended)

**Backend Configuration:**
1. Edit `backend-watchdog.ps1` or `start-backend.ps1`
2. Change the port in the uvicorn command:
   ```powershell
   # Change from:
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   
   # To (example - port 8080):
   uvicorn app.main:app --host 0.0.0.0 --port 8080
   ```

**Frontend Configuration:**
1. Edit `web/.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8080
   ```

2. Restart both backend and frontend

### Option 2: Use Environment Variable

**Backend:**
Create or edit `backend/.env`:
```env
PORT=8080
```

Then modify `backend-watchdog.ps1` to read from env:
```powershell
$port = $env:PORT
if (-not $port) { $port = 8000 }
uvicorn app.main:app --host 0.0.0.0 --port $port
```

**Frontend:**
Update `web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### Option 3: Use Different Host

You can also run on a different host:
- `http://127.0.0.1:8000` (same as localhost)
- `http://0.0.0.0:8000` (accessible from network)
- `http://192.168.x.x:8000` (your local IP)

## Common Port Alternatives

| Port | Use Case | Notes |
|------|----------|-------|
| 8000 | Default | Current setup |
| 8080 | Alternative | Common alternative |
| 3001 | If 3000 is frontend | Avoid conflicts |
| 5000 | Flask default | Common Python port |
| 9000 | Custom | Any available port |

## Quick Port Change Script

I can create a script to easily change ports. Would you like me to create one?

## Important Notes

1. **CORS Configuration**: If you change the port, make sure to update CORS origins in `backend/app/core/config.py`:
   ```python
   CORS_ORIGINS: List[str] = [
       "http://localhost:3000",  # Frontend
       "http://localhost:8080",  # New backend port (if changed)
   ]
   ```

2. **Firewall**: Some ports may be blocked by Windows Firewall

3. **Port Conflicts**: Check if port is available:
   ```powershell
   netstat -ano | findstr ":8080"
   ```

4. **Restart Required**: Always restart backend after port changes

## Current Status

✅ Backend is running on: `http://localhost:8000`
✅ Frontend is configured to connect to: `http://localhost:8000`
✅ Vendors page is connected via `vendorsAPI` from `@/lib/api`

## Testing Connection

To test if vendors page is connected:
1. Open browser console (F12)
2. Navigate to `/vendor` page
3. Check Network tab for API requests to `http://localhost:8000/api/v1/vendors`
