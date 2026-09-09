# ProcureX Backend Watchdog - Auto-restart on failure
# This script monitors the backend and restarts it if it crashes

$ErrorActionPreference = "Continue"
$backendPath = Join-Path $PSScriptRoot "backend"
$logFile = Join-Path $PSScriptRoot "backend-watchdog.log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    Add-Content -Path $logFile -Value $logMessage
}

function Test-BackendHealth {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Start-Backend {
    Write-Log "Starting backend server..."
    
    Set-Location $backendPath
    
    if (-not (Test-Path "venv\Scripts\Activate.ps1")) {
        Write-Log "ERROR: Virtual environment not found at $backendPath\venv"
        return $false
    }
    
    # Kill any existing processes on port 8000
    $existing = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    if ($existing) {
        Write-Log "Killing existing processes on port 8000: $existing"
        foreach ($procId in $existing) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
    }
    
    # Start backend in background (without --reload for better stability)
    $process = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; .\venv\Scripts\Activate.ps1; Write-Host 'ProcureX Backend - Auto-managed by Watchdog' -ForegroundColor Green; Write-Host 'API: http://localhost:8000' -ForegroundColor Cyan; Write-Host 'Auto-restart enabled - will restart if crashed' -ForegroundColor Yellow; uvicorn app.main:app --host 0.0.0.0 --port 8000 --timeout-keep-alive 30 --limit-concurrency 1000 --backlog 2048 --log-level info" -WindowStyle Minimized -PassThru
    
    Write-Log "Backend process started with PID: $($process.Id)"
    
    # Wait for backend to start
    $maxWait = 30
    $waited = 0
    while ($waited -lt $maxWait) {
        Start-Sleep -Seconds 1
        $waited++
        if (Test-BackendHealth) {
            Write-Log "Backend is healthy and responding!"
            Set-Location $PSScriptRoot
            return $true
        }
    }
    
    Write-Log "WARNING: Backend started but health check failed after $maxWait seconds"
    Set-Location $PSScriptRoot
    return $false
}

function Monitor-Backend {
    Write-Log "Starting backend watchdog monitor..."
    Write-Log "Monitoring backend at http://localhost:8000"
    Write-Log "Press Ctrl+C to stop the watchdog"
    Write-Log ""
    
    $restartCount = 0
    $maxRestartsPerMinute = 5
    $restartTimes = @()
    $checkInterval = 10  # Check every 10 seconds
    
    while ($true) {
        # Clean old restart times (older than 1 minute)
        $oneMinuteAgo = (Get-Date).AddMinutes(-1)
        $restartTimes = $restartTimes | Where-Object { $_ -gt $oneMinuteAgo }
        
        # Check if backend is healthy
        $isHealthy = Test-BackendHealth
        
        if (-not $isHealthy) {
            Write-Log "WARNING: Backend health check failed!"
            
            # Check restart rate limit
            if ($restartTimes.Count -ge $maxRestartsPerMinute) {
                Write-Log "ERROR: Too many restarts in the last minute. Waiting 60 seconds before retry..."
                Start-Sleep -Seconds 60
                $restartTimes = @()
                continue
            }
            
            Write-Log "Attempting to restart backend (restart #$($restartCount + 1))..."
            $restartCount++
            $restartTimes += Get-Date
            
            $started = Start-Backend
            if ($started) {
                Write-Log "Backend restarted successfully!"
            } else {
                Write-Log "ERROR: Failed to start backend. Will retry in $checkInterval seconds..."
            }
        } else {
            # Backend is healthy, reset restart count after 5 minutes of stability
            if ($restartCount -gt 0) {
                Write-Log "Backend is stable. Reset restart counter."
                $restartCount = 0
            }
        }
        
        Start-Sleep -Seconds $checkInterval
    }
}

# Main execution
Write-Log "=========================================="
Write-Log "ProcureX Backend Watchdog Starting"
Write-Log "=========================================="

# Initial start
if (-not (Test-BackendHealth)) {
    Write-Log "Backend is not running. Starting it now..."
    Start-Backend
} else {
    Write-Log "Backend is already running and healthy."
}

# Start monitoring
Monitor-Backend


