# Cleanup Script - Kills all Python processes related to ProcureX backend
# Use this to clean up before starting a fresh backend

Write-Host "🧹 Cleaning up ProcureX backend processes..." -ForegroundColor Cyan
Write-Host ""

# Find processes on port 8000
Write-Host "Finding processes on port 8000..." -ForegroundColor Yellow
$portProcesses = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($portProcesses) {
    Write-Host "Found $($portProcesses.Count) process(es) on port 8000" -ForegroundColor Yellow
    foreach ($procId in $portProcesses) {
        try {
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "  Killing PID $procId ($($proc.ProcessName))" -ForegroundColor Gray
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Host "  Could not kill PID $procId: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "No processes found on port 8000" -ForegroundColor Green
}

# Find Python processes that might be related (optional - be careful with this)
Write-Host ""
Write-Host "Finding Python processes with 'uvicorn' or 'app.main' in command line..." -ForegroundColor Yellow
$pythonProcesses = Get-WmiObject Win32_Process -Filter "name = 'python.exe' OR name = 'pythonw.exe'" | Where-Object {
    $_.CommandLine -like "*uvicorn*" -or 
    $_.CommandLine -like "*app.main*" -or
    $_.CommandLine -like "*procurex*" -or
    $_.CommandLine -like "*backend*"
}

if ($pythonProcesses) {
    Write-Host "Found $($pythonProcesses.Count) related Python process(es)" -ForegroundColor Yellow
    foreach ($proc in $pythonProcesses) {
        try {
            Write-Host "  Killing PID $($proc.ProcessId) - $($proc.CommandLine.Substring(0, [Math]::Min(80, $proc.CommandLine.Length)))" -ForegroundColor Gray
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
        } catch {
            Write-Host "  Could not kill PID $($proc.ProcessId): $($_.Exception.Message)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "No related Python processes found" -ForegroundColor Green
}

# Wait a moment for processes to fully terminate
Start-Sleep -Seconds 2

# Verify port 8000 is free
Write-Host ""
Write-Host "Verifying port 8000 is free..." -ForegroundColor Yellow
$stillRunning = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($stillRunning) {
    Write-Host "⚠️  WARNING: Port 8000 is still in use!" -ForegroundColor Red
    Write-Host "   You may need to restart your computer or manually kill processes" -ForegroundColor Yellow
} else {
    Write-Host "✅ Port 8000 is now free" -ForegroundColor Green
}

Write-Host ""
Write-Host "Cleanup complete!" -ForegroundColor Green

