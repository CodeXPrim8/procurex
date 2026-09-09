# Quick Start Script - Starts backend with watchdog
# This is the easiest way to start the backend with auto-restart

Write-Host "Starting ProcureX Backend with Auto-Restart..." -ForegroundColor Cyan
Write-Host ""

# Check if watchdog is already running
$watchdogProcess = Get-Process | Where-Object { $_.Path -like "*powershell*" -and $_.CommandLine -like "*backend-watchdog*" } -ErrorAction SilentlyContinue

if ($watchdogProcess) {
    Write-Host "⚠️  Watchdog is already running (PID: $($watchdogProcess.Id))" -ForegroundColor Yellow
    Write-Host "The backend should already be monitored." -ForegroundColor Gray
    Write-Host ""
    Write-Host "To start a new instance, first stop the existing one." -ForegroundColor Yellow
    exit 0
}

# Start watchdog in a new window
$watchdogScript = Join-Path $PSScriptRoot "backend-watchdog.ps1"
Start-Process powershell -ArgumentList "-NoExit", "-File", "`"$watchdogScript`"" -WindowStyle Normal

Write-Host "✅ Backend watchdog started in new window!" -ForegroundColor Green
Write-Host ""
Write-Host "The backend will:" -ForegroundColor Cyan
Write-Host "  • Start automatically" -ForegroundColor White
Write-Host "  • Auto-restart if it crashes" -ForegroundColor White
Write-Host "  • Be monitored every 10 seconds" -ForegroundColor White
Write-Host ""
Write-Host "Backend will be available at: http://localhost:8000" -ForegroundColor Yellow
Write-Host "Check the watchdog window for status and logs." -ForegroundColor Gray


