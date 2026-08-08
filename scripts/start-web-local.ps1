$ErrorActionPreference = 'Stop'

function Test-LocalPostgres {
  # A stale wslrelay listener can accept a TCP probe even after the Linux
  # PostgreSQL service has stopped. Verify the actual server in the distro as
  # well as the Windows loopback forwarding path before declaring it usable.
  & wsl.exe -d Ubuntu-24.04 -u root -- bash -lc 'pg_isready -q'
  if ($LASTEXITCODE -ne 0) {
    return $false
  }
  return Test-NetConnection -ComputerName '127.0.0.1' -Port 5432 -InformationLevel Quiet -WarningAction SilentlyContinue
}

function Start-LocalPostgresKeepalive {
  # Always retain a keepalive we own. A probe may briefly start WSL and make
  # PostgreSQL look available, but the distro can immediately stop again once
  # that probe exits.
  # Start-Process joins an argument array before launching WSL. Keep the bash
  # command quoted as one argument so WSL receives the tail keepalive rather
  # than only the first `service` token.
  $keepaliveArguments = '-d Ubuntu-24.04 -u root -- bash -lc "service postgresql start && exec tail -f /dev/null"'
  $keepalive = Start-Process -FilePath 'wsl.exe' -ArgumentList $keepaliveArguments -WindowStyle Hidden -PassThru

  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 500
    if (Test-LocalPostgres) {
      return $keepalive
    }
    if ($keepalive.HasExited) {
      throw 'WSL PostgreSQL exited before accepting local connections.'
    }
  }

  Stop-Process -Id $keepalive.Id -Force -ErrorAction SilentlyContinue
  throw 'WSL PostgreSQL did not accept connections on 127.0.0.1:5432 within 20 seconds.'
}

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $workspaceRoot '.env.local'
if (-not (Test-Path -LiteralPath $envFile)) {
  throw 'Missing .env.local. Copy .env.example and configure local testnet credentials first.'
}

$environmentContents = Get-Content -LiteralPath $envFile -Raw
$databaseLine = $environmentContents -split "`r?`n" | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if ($null -eq $databaseLine) {
  throw 'Missing DATABASE_URL in .env.local.'
}

# WSL assigns a new private address after restarts. Windows exposes its forwarded
# PostgreSQL service on loopback, so prefer that stable local endpoint for dev.
$updatedEnvironmentContents = [regex]::Replace(
  $environmentContents,
  '(?m)(^DATABASE_URL=.*@)172\.31\.\d+\.\d+',
  { param($match) "$($match.Groups[1].Value)127.0.0.1" }
)
if ($updatedEnvironmentContents -ne $environmentContents) {
  [System.IO.File]::WriteAllText($envFile, $updatedEnvironmentContents)
  Write-Output 'Updated the local DATABASE_URL host to the stable WSL loopback endpoint.'
  $databaseLine = $updatedEnvironmentContents -split "`r?`n" | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
}
$env:DATABASE_URL = $databaseLine.Substring('DATABASE_URL='.Length)
# A temporary public tunnel is not a valid local origin after it expires.
# The local launcher is intentionally localhost-only; use the deployment
# environment for Xaman callbacks that require public HTTPS.
$env:APP_URL = 'http://localhost:3000'
$postgresKeepalive = Start-LocalPostgresKeepalive
$dotenvCli = Join-Path $workspaceRoot 'node_modules\dotenv-cli\cli.js'
if (-not (Test-Path -LiteralPath $dotenvCli)) {
  throw 'Missing dotenv-cli. Run pnpm install before starting local PayMorph.'
}

Push-Location $workspaceRoot
try {
  # Load the root configuration explicitly. Next.js otherwise looks only for
  # apps/web/.env.local, and pnpm exec can consume the workspace filter.
  node $dotenvCli -e $envFile -- pnpm --filter @paymorph/web dev
} finally {
  Pop-Location
  if ($null -ne $postgresKeepalive -and -not $postgresKeepalive.HasExited) {
    Stop-Process -Id $postgresKeepalive.Id -Force
  }
}
