# Quick Backend Restart Script
# This script restarts the backend to apply CORS fixes

Write-Host "🔄 Restarting Backend Server..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Stop existing backend
Write-Host "Step 1: Stopping existing backend..." -ForegroundColor Yellow
$processes = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($processes) {
    foreach ($pid in $processes) {
        try {
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "  Stopping process $pid ($($proc.ProcessName))..." -ForegroundColor Gray
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Host "  Could not stop process $pid" -ForegroundColor Yellow
        }
    }
    Write-Host "  ✅ Processes stopped" -ForegroundColor Green
    Start-Sleep -Seconds 2
} else {
    Write-Host "  ℹ️  No backend process found on port 8000" -ForegroundColor Gray
}

# Step 2: Start backend with watchdog
Write-Host ""
Write-Host "Step 2: Starting backend with watchdog..." -ForegroundColor Yellow

$watchdogScript = Join-Path $PSScriptRoot "backend-watchdog.ps1"
if (Test-Path $watchdogScript) {
    Start-Process powershell -ArgumentList "-NoExit", "-File", $watchdogScript
    Write-Host "  ✅ Backend watchdog started in a new window" -ForegroundColor Green
} else {
    Write-Host "  ❌ Watchdog script not found at $watchdogScript" -ForegroundColor Red
    exit 1
}

# Step 3: Wait for backend to start
Write-Host ""
Write-Host "Step 3: Waiting for backend to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

$attempts = 0
$maxAttempts = 10
$started = $false

while ($attempts -lt $maxAttempts -and -not $started) {
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:8000/health" -TimeoutSec 2 -ErrorAction Stop
        if ($health.status -eq "healthy") {
            Write-Host ""
            Write-Host "✅ Backend is running!" -ForegroundColor Green
            Write-Host "   Status: $($health.status)" -ForegroundColor Gray
            Write-Host "   Database: $($health.database)" -ForegroundColor Gray
            Write-Host "   URL: http://localhost:8000" -ForegroundColor Gray
            Write-Host ""
            Write-Host "🎉 CORS fixes are now active!" -ForegroundColor Cyan
            Write-Host "   You can now try registering as a vendor again." -ForegroundColor Gray
            $started = $true
        }
    } catch {
        $attempts++
        if ($attempts -lt $maxAttempts) {
            Write-Host "." -NoNewline -ForegroundColor Gray
            Start-Sleep -Seconds 2
        }
    }
}

if (-not $started) {
    Write-Host ""
    Write-Host "⚠️  Backend may still be starting..." -ForegroundColor Yellow
    Write-Host "   Please check the backend window for any errors." -ForegroundColor Gray
    Write-Host "   You can also check: http://localhost:8000/health" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
