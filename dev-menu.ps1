param(
  [ValidateSet(
    "menu",
    "dev-all",
    "postgres-start",
    "frontend-checks",
    "db-seed-demo",
    "db-migrate-target",
    "endpoint-tests",
    "help"
  )]
  [string]$Action = "menu"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSCommandPath
$ServerRoot = Join-Path $ProjectRoot "server"
$NodePathPrefix = "D:\ghaith\tools\node24-current"

function Get-ConfiguredPort {
  param(
    [Parameter(Mandatory = $true)][string]$PrimaryEnv,
    [int]$DefaultPort,
    [string]$SecondaryEnv = ""
  )

  $raw = ""
  $primaryValue = (Get-Item -Path "Env:$PrimaryEnv" -ErrorAction SilentlyContinue).Value
  $secondaryValue = if ($SecondaryEnv) {
    (Get-Item -Path "Env:$SecondaryEnv" -ErrorAction SilentlyContinue).Value
  } else {
    $null
  }

  if ($primaryValue) {
    $raw = $primaryValue
  } elseif ($secondaryValue) {
    $raw = $secondaryValue
  }

  if (-not $raw) { return $DefaultPort }

  $parsed = 0
  if ([int]::TryParse($raw, [ref]$parsed) -and $parsed -ge 1 -and $parsed -le 65535) {
    return $parsed
  }

  Write-Warning "Invalid port value '$raw' for $PrimaryEnv. Falling back to $DefaultPort."
  return $DefaultPort
}

$BackendPort = Get-ConfiguredPort -PrimaryEnv "PRODUCTIER_BACKEND_PORT" -SecondaryEnv "PORT" -DefaultPort 3001
$FrontendPort = Get-ConfiguredPort -PrimaryEnv "PRODUCTIER_FRONTEND_PORT" -DefaultPort 5173

# Prefer local Node 24 first.
$env:Path = "$NodePathPrefix;$env:Path"

function Test-CommandExists {
  param([Parameter(Mandatory = $true)][string]$CommandName)
  return $null -ne (Get-Command $CommandName -ErrorAction SilentlyContinue)
}

function Confirm-NpmInstalled {
  if (-not (Test-CommandExists "npm")) {
    throw "npm is not available on PATH. Install Node.js and try again."
  }
}

function Confirm-BunInstalled {
  if (-not (Test-CommandExists "bun")) {
    throw "bun is not available on PATH. Install Bun from https://bun.sh/ and try again."
  }
}

function Initialize-RootDependencies {
  param([string]$RequiredPackage = "")

  Confirm-NpmInstalled
  $nodeModules = Join-Path $ProjectRoot "node_modules"
  $needsInstall = -not (Test-Path $nodeModules)

  if (-not $needsInstall -and $RequiredPackage) {
    $packagePath = Join-Path $nodeModules $RequiredPackage
    $needsInstall = -not (Test-Path $packagePath)
  }

  if ($needsInstall) {
    Write-Host "Installing root dependencies (npm install)..."
    Push-Location $ProjectRoot
    try {
      & npm install
    } finally {
      Pop-Location
    }
  }
}

function Initialize-ServerDependencies {
  param([string]$RequiredPackage = "")

  Confirm-BunInstalled
  $nodeModules = Join-Path $ServerRoot "node_modules"
  $needsInstall = -not (Test-Path $nodeModules)

  if (-not $needsInstall -and $RequiredPackage) {
    $packagePath = Join-Path $nodeModules $RequiredPackage
    $needsInstall = -not (Test-Path $packagePath)
  }

  if ($needsInstall) {
    Write-Host "Installing server dependencies (bun install)..."
    Push-Location $ServerRoot
    try {
      & bun install
    } finally {
      Pop-Location
    }
  }
}

function Test-PostgresPortOpen {
  try {
    $conn = Test-NetConnection -ComputerName "127.0.0.1" -Port 5432 -WarningAction SilentlyContinue
    return [bool]$conn.TcpTestSucceeded
  } catch {
    return $false
  }
}

function Start-PostgresIfNeeded {
  if (Test-PostgresPortOpen) {
    Write-Host "PostgreSQL detected on 127.0.0.1:5432."
    return $true
  }

  $postgresServices = @(Get-Service -Name "postgres*" -ErrorAction SilentlyContinue)
  if ($postgresServices.Count -gt 0) {
    $stoppedServices = $postgresServices | Where-Object { $_.Status -ne "Running" }
    foreach ($service in $stoppedServices) {
      try {
        Start-Service -Name $service.Name -ErrorAction Stop
        Write-Host "Started service: $($service.DisplayName)"
      } catch {
        Write-Warning "Could not start service '$($service.Name)': $($_.Exception.Message)"
      }
    }

    Start-Sleep -Seconds 2
    if (Test-PostgresPortOpen) {
      Write-Host "PostgreSQL is now running on 127.0.0.1:5432."
      return $true
    }
  }

  Write-Warning "PostgreSQL is not available on 127.0.0.1:5432."
  Write-Host "Install/start PostgreSQL and ensure server\.env points to your DB."
  Write-Host "Example DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/productier"
  return $false
}

function Stop-ProcessesByPort {
  param([Parameter(Mandatory = $true)][int[]]$Ports)

  foreach ($port in $Ports) {
    $connections = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
    if ($connections.Count -eq 0) { continue }

    $procIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $procIds) {
      try {
        Stop-Process -Id $procId -Force -ErrorAction Stop
        Write-Host "Stopped process $procId listening on port $port"
      } catch {
        Write-Warning "Could not stop PID $procId on port ${port}: $($_.Exception.Message)"
      }
    }
  }
}

function Invoke-RootNpmScript {
  param([Parameter(Mandatory = $true)][string]$ScriptName)

  Initialize-RootDependencies
  Push-Location $ProjectRoot
  try {
    & npm run $ScriptName
  } finally {
    Pop-Location
  }
}

function Invoke-ServerBunScript {
  param([Parameter(Mandatory = $true)][string]$ScriptName)

  Initialize-ServerDependencies
  Push-Location $ServerRoot
  try {
    & bun run $ScriptName
  } finally {
    Pop-Location
  }
}

function Invoke-DevAll {
  if (-not (Start-PostgresIfNeeded)) {
    throw "Unable to start PostgreSQL. Start it manually and retry."
  }

  Stop-ProcessesByPort -Ports @($BackendPort, $FrontendPort)
  Initialize-RootDependencies
  Initialize-ServerDependencies

  $frontendCommand = "Set-Location '$ProjectRoot'; `$env:Path = '$NodePathPrefix;' + `$env:Path; npm run dev -- --port $FrontendPort"
  $backendCommand = "Set-Location '$ServerRoot'; `$env:PORT = '$BackendPort'; bun run dev"

  $frontendProcess = Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoProfile",
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $frontendCommand
  ) -PassThru

  $backendProcess = Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoProfile",
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $backendCommand
  ) -PassThru

  Write-Host ""
  Write-Host "Started frontend (PID $($frontendProcess.Id)) and backend (PID $($backendProcess.Id)) in new windows."
  Write-Host "Frontend URL: http://localhost:$FrontendPort"
  Write-Host "Backend URL: http://localhost:$BackendPort"
}

function Invoke-FrontendChecks {
  Initialize-RootDependencies -RequiredPackage "vue-tsc"
  Push-Location $ProjectRoot
  try {
    Write-Host "Running frontend lint/type checks..."
    & npm run lint
    if ($LASTEXITCODE -ne 0) { throw "npm run lint failed." }

    Write-Host "Running frontend tests..."
    & npm run test
    if ($LASTEXITCODE -ne 0) { throw "npm run test failed." }
  } finally {
    Pop-Location
  }
}

function Show-SeedPasswordReminder {
  Write-Host "Reminder: set SEED_DEMO_PASSWORD in server\.env (or shell env) before seeding."
}

function Invoke-SeedDemo {
  if (-not (Start-PostgresIfNeeded)) { throw "PostgreSQL is required for demo seed." }
  Show-SeedPasswordReminder
  Invoke-ServerBunScript "db:migrate"
  Invoke-ServerBunScript "db:seed:full"
}

function ConvertTo-RedactedDatabaseUrl {
  param([Parameter(Mandatory = $true)][string]$DatabaseUrl)

  try {
    $uri = [System.Uri]$DatabaseUrl
    return "{0}://{1}:{2}{3}" -f $uri.Scheme, $uri.Host, $uri.Port, $uri.AbsolutePath
  } catch {
    return "(unparseable DATABASE_URL)"
  }
}

function Invoke-DbMigrateTarget {
  Initialize-ServerDependencies

  Write-Host ""
  Write-Host "Select migration target:"
  Write-Host "1) Local DB (DATABASE_URL from server/.env)"
  Write-Host "2) Hosted DB (enter DATABASE_URL for this run only)"
  $targetChoice = (Read-Host "Choose 1 or 2").Trim()

  if ($targetChoice -eq "1") {
    if (-not (Start-PostgresIfNeeded)) { throw "PostgreSQL is required for local migration." }
    Invoke-ServerBunScript "db:migrate"
    return
  }

  if ($targetChoice -eq "2") {
    $targetDatabaseUrl = (Read-Host "Enter hosted DATABASE_URL").Trim()
    if (-not $targetDatabaseUrl) {
      throw "Hosted DATABASE_URL cannot be empty."
    }

    Push-Location $ServerRoot
    $previousDatabaseUrl = $env:DATABASE_URL
    try {
      $env:DATABASE_URL = $targetDatabaseUrl
      Write-Host "Running migration against $(ConvertTo-RedactedDatabaseUrl -DatabaseUrl $targetDatabaseUrl)"
      & bun run db:migrate
    } finally {
      if ($null -eq $previousDatabaseUrl) {
        Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
      } else {
        $env:DATABASE_URL = $previousDatabaseUrl
      }
      Pop-Location
    }
    return
  }

  throw "Invalid target selection. Choose 1 or 2."
}

function Invoke-EndpointTests {
  if (-not (Start-PostgresIfNeeded)) { throw "PostgreSQL is required for endpoint tests." }
  Initialize-RootDependencies
  Initialize-ServerDependencies

  Push-Location $ProjectRoot
  try {
    Write-Host "Seeding dedicated endpoint-test workspace..."
    & npm run db:seed:endpoint-test
    if ($LASTEXITCODE -ne 0) { throw "npm run db:seed:endpoint-test failed." }

    Write-Host "Running endpoint coverage tests..."
    & npm run endpoint:test
    if ($LASTEXITCODE -ne 0) { throw "npm run endpoint:test failed." }

    Write-Host "Running endpoint permission matrix..."
    & npm run endpoint:test:permissions
    if ($LASTEXITCODE -ne 0) { throw "npm run endpoint:test:permissions failed." }
  } finally {
    Pop-Location
  }
}

function Show-Usage {
  Write-Host ""
  Write-Host "Usage:"
  Write-Host "  .\dev-menu.ps1                       # interactive menu"
  Write-Host "  .\dev-menu.ps1 -Action dev-all"
  Write-Host "  .\dev-menu.ps1 -Action postgres-start"
  Write-Host "  .\dev-menu.ps1 -Action frontend-checks"
  Write-Host "  .\dev-menu.ps1 -Action db-seed-demo"
  Write-Host "  .\dev-menu.ps1 -Action db-migrate-target"
  Write-Host "  .\dev-menu.ps1 -Action endpoint-tests"
  Write-Host ""
}

function Show-Menu {
  Write-Host ""
  Write-Host "=== Productier Dev Menu ==="
  Write-Host "1) Start frontend + backend (also starts PostgreSQL if needed)"
  Write-Host "2) Start PostgreSQL only"
  Write-Host "3) Frontend full checks (lint + tests)"
  Write-Host "4) Seed demo data (migrate + db:seed:full)"
  Write-Host "5) DB migrate target (local or hosted)"
  Write-Host "6) Backend endpoint tests (seed endpoint + endpoint + permissions)"
  Write-Host "Q) Quit"
  Write-Host ""
}

function Invoke-SelectedAction {
  param([Parameter(Mandatory = $true)][string]$SelectedAction)

  switch ($SelectedAction) {
    "dev-all" { Invoke-DevAll }
    "postgres-start" { [void](Start-PostgresIfNeeded) }
    "frontend-checks" { Invoke-FrontendChecks }
    "db-seed-demo" { Invoke-SeedDemo }
    "db-migrate-target" { Invoke-DbMigrateTarget }
    "endpoint-tests" { Invoke-EndpointTests }
    "help" { Show-Usage }
    default { throw "Unknown action: $SelectedAction" }
  }
}

Write-Host "Project root: $ProjectRoot"
Write-Host "Node path prefix: $NodePathPrefix"
Write-Host ""
Write-Host "Node version:"
& node --version
Write-Host ""

if ($Action -ne "menu") {
  Invoke-SelectedAction $Action
  exit $LASTEXITCODE
}

while ($true) {
  Show-Menu
  $choice = (Read-Host "Select an option").Trim().ToLower()
  $shouldExitMenu = $false

  switch ($choice) {
    "1" { Invoke-SelectedAction "dev-all" }
    "2" { Invoke-SelectedAction "postgres-start" }
    "3" { Invoke-SelectedAction "frontend-checks" }
    "4" { Invoke-SelectedAction "db-seed-demo" }
    "5" { Invoke-SelectedAction "db-migrate-target" }
    "6" { Invoke-SelectedAction "endpoint-tests" }
    "q" { $shouldExitMenu = $true }
    default { Write-Warning "Invalid option. Choose 1-6 or Q." }
  }

  if ($shouldExitMenu) { break }

  if ($choice -ne "q") {
    Write-Host ""
    [void](Read-Host "Press Enter to return to menu")
  }
}

Write-Host "Exited dev menu."
