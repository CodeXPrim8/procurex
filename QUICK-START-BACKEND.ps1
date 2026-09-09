# Quick Start Backend Script
# This script checks if the backend is running and starts it if needed

Write-Host "🔍 Checking Backend Status..." -ForegroundColor Cyan
Write-Host ""

$backendUrl = "http://localhost:8000"
$healthUrl = "$backendUrl/health"

try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        $health = $response.Content | ConvertFrom-Json
        Write-Host "✅ Backend is already running!" -ForegroundColor Green
        Write-Host "   Status: $($health.status)" -ForegroundColor Gray
        Write-Host "   Database: $($health.database)" -ForegroundColor Gray
        Write-Host "   URL: $backendUrl" -ForegroundColor Gray
        Write-Host ""
        Write-Host "You can now use the frontend application." -ForegroundColor Cyan
        exit 0
    }
} catch {
    Write-Host "❌ Backend is not running" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "🚀 Starting Backend Server..." -ForegroundColor Cyan
Write-Host ""

# Check if watchdog script exists
$watchdogScript = Join-Path $PSScriptRoot "backend-watchdog.ps1"
if (Test-Path $watchdogScript) {
    Write-Host "Starting backend with watchdog (auto-restart)..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-File", $watchdogScript
    Write-Host ""
    Write-Host "✅ Backend watchdog started in a new window" -ForegroundColor Green
    Write-Host "   The backend will auto-restart if it crashes" -ForegroundColor Gray
} else {
    Write-Host "⚠️  Watchdog script not found. Starting backend manually..." -ForegroundColor Yellow
    
    $backendPath = Join-Path $PSScriptRoot "backend"
    if (Test-Path $backendPath) {
        Set-Location $backendPath
        
        if (Test-Path "venv\Scripts\Activate.ps1") {
            Write-Host "Activating virtual environment..." -ForegroundColor Gray
            & ".\venv\Scripts\Activate.ps1"
            
            Write-Host "Starting backend server..." -ForegroundColor Gray
            Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; .\venv\Scripts\Activate.ps1; uvicorn app.main:app --host 0.0.0.0 --port 8000"
            Write-Host "✅ Backend started in a new window" -ForegroundColor Green
        } else {
            Write-Host "❌ Virtual environment not found at $backendPath\venv" -ForegroundColor Red
            Write-Host "   Please run: cd backend && python -m venv venv && .\venv\Scripts\Activate.ps1 && pip install -r requirements.txt" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "❌ Backend directory not found at $backendPath" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "⏳ Waiting for backend to start..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

# Check if backend started successfully
$maxAttempts = 6
$attempt = 0
$started = $false

while ($attempt -lt $maxAttempts -and -not $started) {
    try {
        $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $health = $response.Content | ConvertFrom-Json
            Write-Host ""
            Write-Host "✅ Backend is now running!" -ForegroundColor Green
            Write-Host "   Status: $($health.status)" -ForegroundColor Gray
            Write-Host "   Database: $($health.database)" -ForegroundColor Gray
            Write-Host "   URL: $backendUrl" -ForegroundColor Gray
            Write-Host ""
            Write-Host "🎉 You can now use the frontend application!" -ForegroundColor Cyan
            $started = $true
        }
    } catch {
        $attempt++
        if ($attempt -lt $maxAttempts) {
            Write-Host "." -NoNewline -ForegroundColor Gray
            Start-Sleep -Seconds 2
        }
    }
}

if (-not $started) {
    Write-Host ""
    Write-Host "⚠️  Backend may still be starting. Please check the backend window for any errors." -ForegroundColor Yellow
    Write-Host "   You can also check: http://localhost:8000/health" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
