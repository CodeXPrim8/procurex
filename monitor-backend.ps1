# Backend Health Monitor Script
# Monitors the backend health endpoint and logs status

$ErrorActionPreference = "Continue"
$backendUrl = "http://localhost:8000"
$healthEndpoint = "$backendUrl/health"
$checkInterval = 10  # Check every 10 seconds
$logFile = Join-Path $PSScriptRoot "backend-health.log"
$unhealthyCount = 0
$maxUnhealthyChecks = 3  # Alert after 3 consecutive failures

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    Write-Host $logEntry
    Add-Content -Path $logFile -Value $logEntry
}

function Test-BackendHealth {
    try {
        $response = Invoke-WebRequest -Uri $healthEndpoint -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $data = $response.Content | ConvertFrom-Json
            if ($data.status -eq "healthy") {
                return @{ Healthy = $true; Data = $data }
            } else {
                return @{ Healthy = $false; Data = $data; Error = "Status: $($data.status)" }
            }
        } else {
            return @{ Healthy = $false; Error = "HTTP $($response.StatusCode)" }
        }
    } catch {
        return @{ Healthy = $false; Error = $_.Exception.Message }
    }
}

Write-Log "==========================================" "INFO"
Write-Log "ProcureX Backend Health Monitor Started" "INFO"
Write-Log "Monitoring: $healthEndpoint" "INFO"
Write-Log "Check Interval: $checkInterval seconds" "INFO"
Write-Log "==========================================" "INFO"
Write-Log ""

while ($true) {
    $health = Test-BackendHealth
    
    if ($health.Healthy) {
        $unhealthyCount = 0
        $dbStatus = if ($health.Data.database) { $health.Data.database } else { "unknown" }
        Write-Log "✅ Backend is HEALTHY (Database: $dbStatus)" "INFO"
    } else {
        $unhealthyCount++
        $errorMsg = if ($health.Error) { $health.Error } else { "Unknown error" }
        Write-Log "❌ Backend is UNHEALTHY: $errorMsg" "ERROR"
        
        if ($unhealthyCount -ge $maxUnhealthyChecks) {
            Write-Log "⚠️  ALERT: Backend has been unhealthy for $unhealthyCount consecutive checks!" "ERROR"
            Write-Log "   Consider restarting the backend" "ERROR"
        }
    }
    
    Start-Sleep -Seconds $checkInterval
}

