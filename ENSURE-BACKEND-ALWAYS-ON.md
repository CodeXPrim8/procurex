# 🔒 Ensure Backend Never Goes Offline

This guide shows you how to ensure your ProcureX backend **never goes offline** again.

## ✅ Quick Solution (Recommended)

### Option 1: Use Watchdog (Easiest - No Admin Required)

The backend watchdog automatically restarts the backend if it crashes:

```powershell
# Start backend with watchdog
.\start-backend-auto.ps1

# Or start everything with watchdog
.\start-all.ps1
```

**Features:**
- ✅ Auto-restarts backend if it crashes
- ✅ Monitors health every 10 seconds
- ✅ Rate limiting (prevents restart loops)
- ✅ Logs all restarts to `backend-watchdog.log`

### Option 2: Install as Windows Service (Best for Production)

This ensures the backend starts automatically on boot and runs as a Windows service:

```powershell
# Run PowerShell as Administrator, then:
.\install-backend-service.ps1
```

**Features:**
- ✅ Starts automatically when Windows boots
- ✅ Starts automatically when you log in
- ✅ Runs as Windows service (more stable)
- ✅ Auto-restarts if it crashes
- ✅ Survives user logout

**To uninstall:**
```powershell
.\install-backend-service.ps1 -Uninstall
```

## 📋 What Each Script Does

### `start-backend-auto.ps1`
- Starts the backend watchdog
- Watchdog monitors and auto-restarts backend
- **Use this for daily development**

### `backend-watchdog.ps1`
- Monitors backend health every 10 seconds
- Auto-restarts if backend goes down
- Prevents restart loops (max 5 restarts/minute)
- Logs everything to `backend-watchdog.log`

### `install-backend-service.ps1`
- Installs backend as Windows Scheduled Task
- Runs on system boot and user login
- **Use this for production/always-on setup**

### `start-backend-stable.ps1`
- Uses Gunicorn with multiple workers
- Better for production workloads
- More stable than single uvicorn process

## 🎯 Recommended Setup

### For Development:
```powershell
# Just run this - it uses watchdog automatically
.\start-all.ps1
```

### For Production/Always-On:
```powershell
# 1. Install as Windows service (run as Admin)
.\install-backend-service.ps1

# 2. Start frontend manually or create another service
.\start-web.ps1
```

## 🔍 Monitoring

### Check Backend Status:
```powershell
# Test health endpoint
Invoke-WebRequest -Uri "http://localhost:8000/health"

# Check if backend is running
netstat -ano | findstr ":8000"
```

### View Watchdog Logs:
```powershell
# View watchdog log
Get-Content backend-watchdog.log -Tail 50

# View health monitor log
Get-Content backend-health.log -Tail 50
```

## 🛠️ Troubleshooting

### Backend Keeps Restarting?
1. Check `backend-watchdog.log` for errors
2. Check backend logs in the PowerShell window
3. Verify `.env` file is configured correctly
4. Check if port 8000 is available

### Watchdog Not Starting?
1. Make sure PowerShell execution policy allows scripts:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
2. Check if port 8000 is already in use
3. Verify Python and virtual environment are set up

### Service Not Starting on Boot?
1. Check Windows Event Viewer for errors
2. Verify the scheduled task exists:
   ```powershell
   Get-ScheduledTask -TaskName "ProcureX Backend Watchdog"
   ```
3. Check task history:
   ```powershell
   Get-ScheduledTask -TaskName "ProcureX Backend Watchdog" | Get-ScheduledTaskInfo
   ```

## 📊 Health Check Endpoints

- **Health**: `http://localhost:8000/health`
- **API Docs**: `http://localhost:8000/docs`
- **Root**: `http://localhost:8000/`

## ⚙️ Configuration

### Watchdog Settings (in `backend-watchdog.ps1`):
- **Check Interval**: 10 seconds (line 77)
- **Max Restarts/Minute**: 5 (line 75)
- **Health Check Timeout**: 3 seconds (line 18)

### Backend Settings (in `start-backend.ps1`):
- **Port**: 8000
- **Host**: 0.0.0.0 (all interfaces)
- **Timeout**: 30 seconds
- **Max Connections**: 1000

## 🎉 Success Indicators

You'll know it's working when:
- ✅ Backend stays online even after errors
- ✅ Watchdog log shows "Backend is healthy"
- ✅ Frontend can always connect to backend
- ✅ Backend restarts automatically after crashes

## 💡 Pro Tips

1. **Always use watchdog** - Even for development, it prevents downtime
2. **Install as service** - For production or when you need it always on
3. **Monitor logs** - Check `backend-watchdog.log` regularly
4. **Test health endpoint** - Add monitoring/alerting if needed

---

**Your backend will now stay online! 🚀**
