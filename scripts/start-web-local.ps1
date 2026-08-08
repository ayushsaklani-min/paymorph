param(
  [switch]$WithExecutor
)

$ErrorActionPreference = 'Stop'

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

Push-Location $workspaceRoot
try {
  if ($WithExecutor) {
    pnpm exec dotenv -e .env.local -- pnpm dev
  } else {
    pnpm exec dotenv -e .env.local -- pnpm --filter @paymorph/web dev
  }
} finally {
  Pop-Location
}
