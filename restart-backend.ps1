# Quick Backend Restart Script
# This script kills any existing backend processes and starts a fresh one

Write-Host "Restarting ProcureX Backend..." -ForegroundColor Cyan
Write-Host ""

# Kill all Python/uvicorn processes on port 8000
Write-Host "Stopping existing backend processes..." -ForegroundColor Yellow
$processes = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($processes) {
    foreach ($procId in $processes) {
        try {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            Write-Host "  Stopped process $procId" -ForegroundColor Gray
        } catch {
            # Ignore errors
        }
    }
    Start-Sleep -Seconds 2
}

# Wait for port to be free
Write-Host "Waiting for port 8000 to be free..." -ForegroundColor Yellow
$maxWait = 10
$waited = 0
while ($waited -lt $maxWait) {
    $inUse = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
    if (-not $inUse) {
        break
    }
    Start-Sleep -Seconds 1
    $waited++
}

# Start backend
Write-Host "Starting backend server..." -ForegroundColor Green
Set-Location backend

if (Test-Path "venv\Scripts\Activate.ps1") {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; .\venv\Scripts\Activate.ps1; Write-Host 'ProcureX Backend Server' -ForegroundColor Green; Write-Host 'API: http://localhost:8000' -ForegroundColor Cyan; Write-Host 'Docs: http://localhost:8000/docs' -ForegroundColor Cyan; Write-Host ''; uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" -WindowStyle Normal
    
    Write-Host ""
    Write-Host "✅ Backend starting in new window..." -ForegroundColor Green
    Write-Host "   Check the new PowerShell window for status" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Backend will be available at:" -ForegroundColor Cyan
    Write-Host "  • API: http://localhost:8000" -ForegroundColor White
    Write-Host "  • Docs: http://localhost:8000/docs" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "❌ Virtual environment not found!" -ForegroundColor Red
    Write-Host "   Run: cd backend; python -m venv venv" -ForegroundColor Yellow
    exit 1
}

Set-Location ..


