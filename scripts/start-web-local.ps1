param(
  [switch]$WithExecutor
)

$ErrorActionPreference = 'Stop'

function Test-LocalPostgres {
  return Test-NetConnection -ComputerName '127.0.0.1' -Port 5432 -InformationLevel Quiet -WarningAction SilentlyContinue
}

function Start-LocalPostgresKeepalive {
  if (Test-LocalPostgres) {
    return $null
  }

  $keepalive = Start-Process -FilePath 'wsl.exe' -ArgumentList @(
    '-d', 'Ubuntu-24.04', '-u', 'root', '--', 'bash', '-lc',
    'service postgresql start && exec tail -f /dev/null'
  ) -WindowStyle Hidden -PassThru

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
$postgresKeepalive = Start-LocalPostgresKeepalive

Push-Location $workspaceRoot
try {
  if ($WithExecutor) {
    pnpm exec dotenv -e .env.local -- pnpm dev
  } else {
    pnpm exec dotenv -e .env.local -- pnpm --filter @paymorph/web dev
  }
} finally {
  Pop-Location
  if ($null -ne $postgresKeepalive -and -not $postgresKeepalive.HasExited) {
    Stop-Process -Id $postgresKeepalive.Id -Force
  }
}
