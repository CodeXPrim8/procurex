# Start Both Backend and Frontend Servers with Auto-Restart

Write-Host "Starting AI Procurement System..." -ForegroundColor Cyan
Write-Host ""

# Check if watchdog is already running
$watchdogRunning = Get-Process | Where-Object { 
    $_.ProcessName -eq "powershell" -and 
    $_.CommandLine -like "*backend-watchdog*" 
} -ErrorAction SilentlyContinue

if (-not $watchdogRunning) {
    # Start backend with watchdog (auto-restart) in a new window
    Write-Host "Starting Backend Server with Auto-Restart (Watchdog)..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-File", "$PSScriptRoot\backend-watchdog.ps1"
    Write-Host "  ✅ Backend watchdog started - will auto-restart if it crashes" -ForegroundColor Gray
} else {
    Write-Host "Backend watchdog is already running" -ForegroundColor Yellow
}

# Wait a bit for backend to start
Start-Sleep -Seconds 3

# Start frontend in a new window
Write-Host "Starting Frontend Server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-File", "$PSScriptRoot\start-web.ps1"

Write-Host ""
Write-Host "Both servers are starting in separate windows" -ForegroundColor Cyan
Write-Host "Backend: http://localhost:8000 (with auto-restart watchdog)" -ForegroundColor Yellow
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Yellow
Write-Host ""
Write-Host "💡 TIP: To ensure backend never goes offline, install as Windows service:" -ForegroundColor Cyan
Write-Host "   Run as Administrator: .\install-backend-service.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "Press any key to exit this window (servers will continue running)..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")


