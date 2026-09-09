# Setup Always-On Backend
# This script sets up the backend to never go offline

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "ProcureX Backend - Always-On Setup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

Write-Host "Choose setup option:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Quick Setup (Watchdog only - No admin required)" -ForegroundColor Green
Write-Host "   • Auto-restarts backend if it crashes" -ForegroundColor Gray
Write-Host "   • Must start manually each time" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Full Setup (Windows Service - Requires admin)" -ForegroundColor Green
Write-Host "   • Auto-starts on Windows boot" -ForegroundColor Gray
Write-Host "   • Auto-starts on user login" -ForegroundColor Gray
Write-Host "   • Auto-restarts if it crashes" -ForegroundColor Gray
Write-Host "   • Runs even when logged out" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "Enter choice (1 or 2)"

if ($choice -eq "1") {
    Write-Host ""
    Write-Host "Setting up Quick Setup (Watchdog)..." -ForegroundColor Yellow
    
    # Create a startup script that uses watchdog
    $startupScript = @"
# Auto-start backend with watchdog
`$scriptPath = Split-Path -Parent `$MyInvocation.MyCommand.Path
Set-Location `$scriptPath
Start-Process powershell -ArgumentList "-NoExit", "-File", "`"`$scriptPath\backend-watchdog.ps1`"" -WindowStyle Minimized
"@
    
    $startupFile = Join-Path $PSScriptRoot "start-backend-watchdog.ps1"
    $startupScript | Out-File -FilePath $startupFile -Encoding UTF8
    
    Write-Host "✅ Created startup script: start-backend-watchdog.ps1" -ForegroundColor Green
    Write-Host ""
    Write-Host "To start backend with watchdog, run:" -ForegroundColor Cyan
    Write-Host "  .\start-backend-watchdog.ps1" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or use:" -ForegroundColor Cyan
    Write-Host "  .\start-backend-auto.ps1" -ForegroundColor Yellow
    Write-Host "  .\start-all.ps1" -ForegroundColor Yellow
    
} elseif ($choice -eq "2") {
    if (-not $isAdmin) {
        Write-Host ""
        Write-Host "ERROR: This option requires Administrator privileges!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please:" -ForegroundColor Yellow
        Write-Host "1. Right-click PowerShell" -ForegroundColor White
        Write-Host "2. Select 'Run as Administrator'" -ForegroundColor White
        Write-Host "3. Run this script again" -ForegroundColor White
        Write-Host ""
        exit 1
    }
    
    Write-Host ""
    Write-Host "Setting up Full Setup (Windows Service)..." -ForegroundColor Yellow
    Write-Host ""
    
    # Install the service
    & "$PSScriptRoot\install-backend-service.ps1"
    
    Write-Host ""
    Write-Host "✅ Backend service installed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "The backend will now:" -ForegroundColor Cyan
    Write-Host "  ✅ Start automatically when Windows boots" -ForegroundColor White
    Write-Host "  ✅ Start automatically when you log in" -ForegroundColor White
    Write-Host "  ✅ Auto-restart if it crashes" -ForegroundColor White
    Write-Host "  ✅ Run even when you're logged out" -ForegroundColor White
    Write-Host ""
    Write-Host "To start it now, run:" -ForegroundColor Yellow
    Write-Host "  .\backend-watchdog.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "Or restart your computer - it will start automatically!" -ForegroundColor Cyan
    
} else {
    Write-Host ""
    Write-Host "Invalid choice. Please run the script again and choose 1 or 2." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📖 For more information, see: ENSURE-BACKEND-ALWAYS-ON.md" -ForegroundColor Gray
