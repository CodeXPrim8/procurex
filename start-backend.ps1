# Backend Startup Script for Windows

Write-Host "Starting Backend Server..." -ForegroundColor Green

# Check if Python is installed
try {
    $pythonVersion = python --version 2>&1
    Write-Host "Python found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Python is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Python from https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

# Navigate to backend directory
Set-Location backend

# Check if virtual environment exists
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
}

# Activate virtual environment
Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& .\venv\Scripts\Activate.ps1

# Install/update dependencies
Write-Host "Checking dependencies..." -ForegroundColor Yellow
pip install -q -r requirements.txt

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "WARNING: .env file not found!" -ForegroundColor Yellow
    Write-Host "Please copy .env.example to .env and configure it" -ForegroundColor Yellow
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "Created .env from .env.example - please update with your values" -ForegroundColor Yellow
    }
}

# Kill any existing processes on port 8000 FIRST
Write-Host "Cleaning up existing processes on port 8000..." -ForegroundColor Yellow
$existing = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($existing) {
    foreach ($procId in $existing) {
        try {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            Write-Host "  Stopped process $procId" -ForegroundColor Gray
        } catch {
            # Ignore errors
        }
    }
    Start-Sleep -Seconds 2
}

# Start the server WITHOUT --reload for better stability
Write-Host "Starting FastAPI server on http://localhost:8000" -ForegroundColor Green
Write-Host "API Documentation: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "Health Check: http://localhost:8000/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "NOTE: Running without --reload for better stability" -ForegroundColor Yellow
Write-Host "      Restart manually if you change code" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Use uvicorn WITHOUT --reload and with better settings
# Note: For auto-restart on crash, use start-backend-auto.ps1 or backend-watchdog.ps1 instead
uvicorn app.main:app `
    --host 0.0.0.0 `
    --port 8000 `
    --timeout-keep-alive 30 `
    --limit-concurrency 1000 `
    --backlog 2048 `
    --log-level info `
    --access-log


