# Setup Network Access for AI Procurement System
# This script configures the app to be accessible from other devices on the network

Write-Host "🌐 Setting Up Network Access..." -ForegroundColor Cyan
Write-Host ""

# Get network IP addresses
$ipAddresses = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    $_.IPAddress -notlike "127.*" -and 
    $_.IPAddress -notlike "169.254.*" 
} | Select-Object -ExpandProperty IPAddress

if ($ipAddresses.Count -eq 0) {
    Write-Host "❌ No network IP addresses found!" -ForegroundColor Red
    exit 1
}

Write-Host "Found Network IP Addresses:" -ForegroundColor Green
$index = 1
$ipAddresses | ForEach-Object {
    Write-Host "  $index. $_" -ForegroundColor Yellow
    $index++
}

Write-Host ""
$selectedIp = $ipAddresses[0]  # Use first IP by default
if ($ipAddresses.Count -gt 1) {
    $choice = Read-Host "Select IP address to use (1-$($ipAddresses.Count)) [Default: 1]"
    if ($choice -and [int]$choice -ge 1 -and [int]$choice -le $ipAddresses.Count) {
        $selectedIp = $ipAddresses[[int]$choice - 1]
    }
}

Write-Host ""
Write-Host "✅ Selected IP: $selectedIp" -ForegroundColor Green
Write-Host ""

# Backend URL
$backendUrl = "http://$selectedIp:8000"
$frontendUrl = "http://$selectedIp:3000"

Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  Backend URL: $backendUrl" -ForegroundColor White
Write-Host "  Frontend URL: $frontendUrl" -ForegroundColor White
Write-Host ""

# Update backend CORS configuration
Write-Host "Updating Backend CORS Configuration..." -ForegroundColor Yellow

$backendConfigPath = Join-Path $PSScriptRoot "backend\app\core\config.py"
if (Test-Path $backendConfigPath) {
    $configContent = Get-Content $backendConfigPath -Raw
    
    # Check if network IP is already in CORS_ORIGINS
    if ($configContent -notmatch $frontendUrl) {
        # Add network IP to CORS origins
        $newCorsLine = "        `"$frontendUrl`",  # Network access from other devices"
        
        # Find CORS_ORIGINS section and add the new IP
        if ($configContent -match "CORS_ORIGINS: List\[str\] = \[") {
            # Add after the last entry in the list
            $configContent = $configContent -replace "(CORS_ORIGINS: List\[str\] = \[[^\]]*)(\])", "`$1`n$newCorsLine`n    ]"
            Set-Content -Path $backendConfigPath -Value $configContent -NoNewline
            Write-Host "  ✅ Added $frontendUrl to CORS_ORIGINS" -ForegroundColor Green
        }
    } else {
        Write-Host "  ℹ️  Network IP already in CORS configuration" -ForegroundColor Gray
    }
} else {
    Write-Host "  ⚠️  Backend config file not found" -ForegroundColor Yellow
}

# Update backend .env file
Write-Host ""
Write-Host "Updating Backend .env file..." -ForegroundColor Yellow
$backendEnvPath = Join-Path $PSScriptRoot "backend\.env"
if (Test-Path $backendEnvPath) {
    $envContent = Get-Content $backendEnvPath
    $updated = $false
    
    # Update or add CORS_ORIGINS
    $newEnvContent = @()
    $corsFound = $false
    foreach ($line in $envContent) {
        if ($line -match "^CORS_ORIGINS=") {
            # Parse existing CORS_ORIGINS JSON array
            $corsJson = $line -replace "CORS_ORIGINS=", ""
            try {
                $corsArray = $corsJson | ConvertFrom-Json
                if ($corsArray -notcontains $frontendUrl) {
                    $corsArray += $frontendUrl
                    $newLine = "CORS_ORIGINS=$($corsArray | ConvertTo-Json -Compress)"
                    $newEnvContent += $newLine
                    $updated = $true
                } else {
                    $newEnvContent += $line
                }
            } catch {
                $newEnvContent += $line
            }
            $corsFound = $true
        } else {
            $newEnvContent += $line
        }
    }
    
    if (-not $corsFound) {
        $newEnvContent += "CORS_ORIGINS=[`"http://localhost:3000`",`"$frontendUrl`"]"
        $updated = $true
    }
    
    if ($updated) {
        Set-Content -Path $backendEnvPath -Value $newEnvContent
        Write-Host "  ✅ Updated CORS_ORIGINS in backend/.env" -ForegroundColor Green
    } else {
        Write-Host "  ℹ️  CORS_ORIGINS already configured" -ForegroundColor Gray
    }
} else {
    Write-Host "  ⚠️  Backend .env file not found, creating..." -ForegroundColor Yellow
    @"
CORS_ORIGINS=["http://localhost:3000","$frontendUrl"]
"@ | Out-File -FilePath $backendEnvPath -Encoding utf8
    Write-Host "  ✅ Created backend/.env with CORS configuration" -ForegroundColor Green
}

# Create network access instructions
Write-Host ""
Write-Host "Creating Network Access Guide..." -ForegroundColor Yellow
$guidePath = Join-Path $PSScriptRoot "NETWORK-ACCESS-GUIDE.md"

@"
# 🌐 Network Access Guide

## Access from Another Laptop/Device

### On This Computer (Server):
- **Backend URL**: $backendUrl
- **Frontend URL**: $frontendUrl
- **Your IP Address**: $selectedIp

### On Another Laptop/Device:

#### Option 1: Access via Network IP (Recommended)

1. **Make sure both devices are on the same network** (WiFi or LAN)

2. **On the other laptop, open browser and go to:**
   ```
   $frontendUrl
   ```

3. **If you see connection errors**, you may need to:
   - Configure the frontend to use the network backend URL
   - See "Option 2" below

#### Option 2: Configure Frontend on Other Laptop

If you're running the frontend on the other laptop:

1. **Copy the project** to the other laptop

2. **Create/Edit** `web/.env.local` on the other laptop:
   ```env
   NEXT_PUBLIC_API_URL=$backendUrl
   ```

3. **Start the frontend** on the other laptop:
   ```powershell
   cd web
   npm run dev
   ```

4. **Access at**: `http://localhost:3000` (on the other laptop)

#### Option 3: Use Hostname (If Available)

If your computer has a hostname, you can use:
- `http://YOUR-COMPUTER-NAME:3000` (frontend)
- `http://YOUR-COMPUTER-NAME:8000` (backend)

## Firewall Configuration

**Windows Firewall** may block incoming connections. To allow:

1. Open **Windows Defender Firewall**
2. Click **Advanced Settings**
3. Click **Inbound Rules** → **New Rule**
4. Select **Port** → **Next**
5. Select **TCP**, enter ports: **8000, 3000** → **Next**
6. Select **Allow the connection** → **Next**
7. Check all profiles → **Next**
8. Name: "ProcureX App" → **Finish**

Or run this PowerShell command (as Administrator):
```powershell
New-NetFirewallRule -DisplayName "ProcureX Backend" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "ProcureX Frontend" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

## Testing Network Access

### From Another Device:

1. **Test Backend:**
   ```
   http://$selectedIp:8000/health
   ```
   Should return: `{"status":"healthy",...}`

2. **Test Frontend:**
   ```
   http://$selectedIp:3000
   ```
   Should show the login page

3. **Test API Docs:**
   ```
   http://$selectedIp:8000/docs
   ```
   Should show FastAPI documentation

## Troubleshooting

### Can't Access from Other Laptop?

1. **Check Firewall**: Windows Firewall may be blocking ports
2. **Check Network**: Both devices must be on same network
3. **Check IP**: Verify IP address hasn't changed (run `ipconfig`)
4. **Check Backend**: Ensure backend is running with `--host 0.0.0.0`
5. **Check CORS**: Verify CORS includes the network IP

### Backend Not Accessible?

The backend is configured with `--host 0.0.0.0` which allows network access.
If still not accessible:
- Check Windows Firewall rules
- Verify backend is actually running
- Try accessing `http://$selectedIp:8000/health` from the server itself first

### Frontend Shows Connection Errors?

- Make sure backend is accessible from the other laptop
- Check that `NEXT_PUBLIC_API_URL` points to the correct backend IP
- Verify CORS includes the frontend URL

## Quick Reference

**Server IP**: $selectedIp
**Backend**: $backendUrl
**Frontend**: $frontendUrl
**API Docs**: $backendUrl/docs

**To restart with network access:**
```powershell
.\RESTART-BACKEND-NOW.ps1
.\start-web.ps1
```

Then access from another device at: $frontendUrl
"@ | Out-File -FilePath $guidePath -Encoding utf8

Write-Host "  ✅ Created NETWORK-ACCESS-GUIDE.md" -ForegroundColor Green

Write-Host ""
Write-Host "✅ Network Access Configuration Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Summary:" -ForegroundColor Cyan
Write-Host "  Your IP: $selectedIp" -ForegroundColor White
Write-Host "  Backend: $backendUrl" -ForegroundColor White
Write-Host "  Frontend: $frontendUrl" -ForegroundColor White
Write-Host ""
Write-Host "⚠️  IMPORTANT: Restart Backend for CORS Changes to Take Effect!" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Restart backend: .\RESTART-BACKEND-NOW.ps1" -ForegroundColor White
Write-Host "2. Configure Windows Firewall (see NETWORK-ACCESS-GUIDE.md)" -ForegroundColor White
Write-Host "3. Access from other laptop: $frontendUrl" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
