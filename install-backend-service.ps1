# Install ProcureX Backend as Windows Service (Auto-start on boot)
# Run this script as Administrator

param(
    [switch]$Uninstall
)

if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

$scriptPath = $PSScriptRoot
$watchdogScript = Join-Path $scriptPath "backend-watchdog.ps1"
$taskName = "ProcureX Backend Watchdog"

if ($Uninstall) {
    Write-Host "Uninstalling ProcureX Backend service..." -ForegroundColor Yellow
    
    # Remove scheduled task
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Host "✅ Removed scheduled task" -ForegroundColor Green
    }
    
    Write-Host "Uninstallation complete!" -ForegroundColor Green
    exit 0
}

Write-Host "Installing ProcureX Backend Auto-Start Service..." -ForegroundColor Cyan
Write-Host ""

# Check if task already exists
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "Task already exists. Updating..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Create scheduled task action
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$watchdogScript`"" -WorkingDirectory $scriptPath

# Create trigger (at logon and on system startup)
$trigger1 = New-ScheduledTaskTrigger -AtLogOn
$trigger2 = New-ScheduledTaskTrigger -AtStartup

# Create settings
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

# Create principal (run as current user)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

# Register the task
try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($trigger1, $trigger2) -Settings $settings -Principal $principal -Description "ProcureX Backend Watchdog - Auto-starts and monitors the backend server" | Out-Null
    
    Write-Host "✅ Successfully installed ProcureX Backend service!" -ForegroundColor Green
    Write-Host ""
    Write-Host "The backend will now:" -ForegroundColor Cyan
    Write-Host "  • Start automatically when Windows boots" -ForegroundColor White
    Write-Host "  • Start automatically when you log in" -ForegroundColor White
    Write-Host "  • Auto-restart if it crashes" -ForegroundColor White
    Write-Host "  • Be monitored by the watchdog" -ForegroundColor White
    Write-Host ""
    Write-Host "To start it now, run: .\backend-watchdog.ps1" -ForegroundColor Yellow
    Write-Host "Or it will start automatically on next boot/login" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To uninstall, run: .\install-backend-service.ps1 -Uninstall" -ForegroundColor Gray
    
} catch {
    Write-Host "ERROR: Failed to install service: $_" -ForegroundColor Red
    exit 1
}


