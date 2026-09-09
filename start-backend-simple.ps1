# Simple Backend Startup - Single Process with Better Error Handling
# This is a simpler alternative that's more stable than the current setup

Write-Host "Starting ProcureX Backend (Simple Stable Mode)..." -ForegroundColor Cyan
Write-Host ""

# Check if Python is installed
try {
    $pythonVersion = python --version 2>&1
    Write-Host "Python found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Python is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# Navigate to backend directory
$backendPath = Join-Path $PSScriptRoot "backend"
Set-Location $backendPath

# Check if virtual environment exists
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
}

# Activate virtual environment
& .\venv\Scripts\Activate.ps1

# Install dependencies
Write-Host "Checking dependencies..." -ForegroundColor Yellow
pip install -q -r requirements.txt

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "WARNING: .env file not found!" -ForegroundColor Yellow
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
    }
}

# Kill any existing processes on port 8000
Write-Host "Cleaning up port 8000..." -ForegroundColor Yellow
$existing = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($existing) {
    foreach ($procId in $existing) {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

# Start the server WITHOUT --reload for better stability
Write-Host ""
Write-Host "Starting FastAPI server (Production Mode - No Auto-reload)..." -ForegroundColor Green
Write-Host "  Backend: http://localhost:8000" -ForegroundColor Cyan
Write-Host "  API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "Note: Running without --reload for better stability" -ForegroundColor Yellow
Write-Host "      Restart manually if you change code" -ForegroundColor Yellow
Write-Host ""

# Use uvicorn without --reload for better stability
# Add better timeout and connection settings
uvicorn app.main:app `
    --host 0.0.0.0 `
    --port 8000 `
    --timeout-keep-alive 30 `
    --limit-concurrency 1000 `
    --backlog 2048

