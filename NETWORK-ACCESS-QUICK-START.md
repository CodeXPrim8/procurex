# 🌐 Quick Start: Access App from Another Laptop

## Step 1: Setup Network Access (One Time)

Run this script on the **server computer** (where backend runs):
```powershell
.\setup-network-access.ps1
```

This will:
- ✅ Detect your network IP address
- ✅ Update CORS configuration
- ✅ Configure backend for network access
- ✅ Create access guide

## Step 2: Configure Windows Firewall

**Important**: Windows Firewall may block incoming connections.

### Quick Method (PowerShell as Administrator):
```powershell
New-NetFirewallRule -DisplayName "ProcureX Backend" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "ProcureX Frontend" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

### Manual Method:
1. Open **Windows Defender Firewall**
2. Click **Advanced Settings**
3. **Inbound Rules** → **New Rule**
4. **Port** → **TCP** → Ports: **8000, 3000**
5. **Allow the connection** → **Next** → **Finish**

## Step 3: Restart Backend

Restart the backend to apply CORS changes:
```powershell
.\RESTART-BACKEND-NOW.ps1
```

## Step 4: Access from Another Laptop

### Option A: Access Frontend on Server (Easiest)

1. **On the other laptop**, open browser
2. **Go to**: `http://YOUR-SERVER-IP:3000`
   - Replace `YOUR-SERVER-IP` with the IP shown by setup script
   - Example: `http://192.168.1.100:3000`

3. **That's it!** The frontend will connect to the backend automatically

### Option B: Run Frontend on Other Laptop

1. **Copy the project** to the other laptop
2. **Edit** `web/.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=http://YOUR-SERVER-IP:8000
   ```
3. **Start frontend**:
   ```powershell
   cd web
   npm run dev
   ```
4. **Access at**: `http://localhost:3000` (on the other laptop)

## Your Network IP

Run this to find your IP:
```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" } | Select-Object IPAddress
```

Common IPs:
- `192.168.x.x` (Home/Office network)
- `10.x.x.x` (Corporate network)

## Testing

### From Another Laptop:

1. **Test Backend Health**:
   ```
   http://YOUR-SERVER-IP:8000/health
   ```
   Should return: `{"status":"healthy"}`

2. **Test Frontend**:
   ```
   http://YOUR-SERVER-IP:3000
   ```
   Should show login page

3. **Test API Docs**:
   ```
   http://YOUR-SERVER-IP:8000/docs
   ```
   Should show FastAPI docs

## Troubleshooting

### Can't Access from Other Laptop?

1. ✅ **Check Firewall** - Ports 8000 and 3000 must be open
2. ✅ **Check Network** - Both devices on same WiFi/LAN?
3. ✅ **Check IP** - IP address correct? Run `ipconfig` to verify
4. ✅ **Check Backend** - Is backend running? Test `http://SERVER-IP:8000/health`
5. ✅ **Check CORS** - Backend restarted after CORS changes?

### Connection Errors?

- **"Cannot connect"**: Check firewall and network
- **CORS errors**: Restart backend after running setup script
- **404 errors**: Verify URLs are correct

## Quick Commands

**Find your IP:**
```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" }
```

**Test backend from another device:**
```powershell
# Replace YOUR-SERVER-IP with actual IP
Invoke-WebRequest -Uri "http://YOUR-SERVER-IP:8000/health"
```

**Restart with network access:**
```powershell
.\RESTART-BACKEND-NOW.ps1
.\start-web-network.ps1
```
