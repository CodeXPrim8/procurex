# Frontend Startup Script for Network Access
# This script starts the frontend configured for network access

Write-Host "🌐 Starting Web Frontend (Network Access Mode)..." -ForegroundColor Green
Write-Host ""

# Get network IP
$ipAddresses = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    $_.IPAddress -notlike "127.*" -and 
    $_.IPAddress -notlike "169.254.*" 
} | Select-Object -ExpandProperty IPAddress

if ($ipAddresses.Count -eq 0) {
    Write-Host "❌ No network IP found. Using localhost..." -ForegroundColor Yellow
    $networkIp = "localhost"
} else {
    $networkIp = $ipAddresses[0]
    Write-Host "Network IP: $networkIp" -ForegroundColor Cyan
}

$backendUrl = "http://$networkIp:8000"

# Check if Node.js is installed
try {
    $nodeVersion = node --version 2>&1
    Write-Host "Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Navigate to web directory
Set-Location web

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
} else {
    Write-Host "Dependencies already installed" -ForegroundColor Green
}

# Update .env.local with network backend URL
Write-Host ""
Write-Host "Configuring for network access..." -ForegroundColor Yellow
if (Test-Path ".env.local") {
    $envContent = Get-Content ".env.local"
    $updated = $false
    $newEnvContent = @()
    
    foreach ($line in $envContent) {
        if ($line -match "^NEXT_PUBLIC_API_URL=") {
            $newEnvContent += "NEXT_PUBLIC_API_URL=$backendUrl"
            $updated = $true
        } else {
            $newEnvContent += $line
        }
    }
    
    if (-not $updated) {
        $newEnvContent += "NEXT_PUBLIC_API_URL=$backendUrl"
    }
    
    Set-Content -Path ".env.local" -Value $newEnvContent
    Write-Host "  ✅ Updated NEXT_PUBLIC_API_URL to $backendUrl" -ForegroundColor Green
} else {
    @"
NEXT_PUBLIC_API_URL=$backendUrl
"@ | Out-File -FilePath ".env.local" -Encoding utf8
    Write-Host "  ✅ Created .env.local with network backend URL" -ForegroundColor Green
}

Write-Host ""
Write-Host "Starting Next.js development server..." -ForegroundColor Green
Write-Host "  Frontend: http://localhost:3000 (local)" -ForegroundColor Cyan
Write-Host "  Frontend: http://$networkIp:3000 (network)" -ForegroundColor Cyan
Write-Host "  Backend: $backendUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "Access from another laptop: http://$networkIp:3000" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Gray
Write-Host ""

npm run dev
