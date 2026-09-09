# Stable Backend Startup Script with Gunicorn
# This uses Gunicorn for better process management and stability

Write-Host "Starting ProcureX Backend (Stable Mode)..." -ForegroundColor Cyan
Write-Host ""

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
$backendPath = Join-Path $PSScriptRoot "backend"
Set-Location $backendPath

# Check if virtual environment exists
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
}

# Activate virtual environment
Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& .\venv\Scripts\Activate.ps1

# Install/update dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
pip install -q -r requirements.txt
pip install -q gunicorn  # Install Gunicorn for process management

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "WARNING: .env file not found!" -ForegroundColor Yellow
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "Created .env from .env.example - please update with your values" -ForegroundColor Yellow
    }
}

# Kill any existing processes on port 8000
Write-Host "Cleaning up existing processes..." -ForegroundColor Yellow
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

# Start the server with Gunicorn
Write-Host ""
Write-Host "Starting FastAPI server with Gunicorn..." -ForegroundColor Green
Write-Host "  Backend: http://localhost:8000" -ForegroundColor Cyan
Write-Host "  API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "  Health: http://localhost:8000/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "Gunicorn Configuration:" -ForegroundColor Yellow
Write-Host "  Workers: 4" -ForegroundColor Gray
Write-Host "  Worker Class: uvicorn.workers.UvicornWorker" -ForegroundColor Gray
Write-Host "  Timeout: 120 seconds" -ForegroundColor Gray
Write-Host "  Max Requests: 1000 (auto-restart workers)" -ForegroundColor Gray
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start Gunicorn with Uvicorn workers
# This provides:
# - Multiple worker processes (better stability)
# - Automatic worker restarts
# - Better resource management
# - Production-ready configuration
gunicorn app.main:app `
    --workers 4 `
    --worker-class uvicorn.workers.UvicornWorker `
    --bind 0.0.0.0:8000 `
    --timeout 120 `
    --max-requests 1000 `
    --max-requests-jitter 50 `
    --access-logfile - `
    --error-logfile - `
    --log-level info

