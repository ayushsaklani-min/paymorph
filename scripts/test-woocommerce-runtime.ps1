$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddHHmmss')
$runtime = Join-Path $repo "artifacts\wordpress\runtime-$stamp"
$dataDir = Join-Path $runtime 'mysql-data'
$siteRoot = Join-Path $env:TEMP "paymorph-wordpress-$stamp"
$site = Join-Path $siteRoot 'wordpress'
$toolsDir = Join-Path $runtime 'tools'
$mysqlBase = 'C:\Program Files\MySQL\MySQL Server 8.0'
$mysqld = Join-Path $mysqlBase 'bin\mysqld.exe'
$mysql = Join-Path $mysqlBase 'bin\mysql.exe'
$mysqlAdmin = Join-Path $mysqlBase 'bin\mysqladmin.exe'
$mysqlPort = 3307
$wordpressPort = 8097
$mysqlProcess = $null
$phpProcess = $null

function Find-Php {
    $command = Get-Command php.exe -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }
    $packages = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
    $candidate = Get-ChildItem -LiteralPath $packages -Filter php.exe -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object FullName |
        Select-Object -Last 1
    if (-not $candidate) {
        throw 'PHP 8.1 or newer is required. Install PHP or expose php.exe on PATH.'
    }
    return $candidate.FullName
}

function Start-HiddenProcess([string]$file, [string[]]$arguments, [string]$workingDirectory) {
    $start = [System.Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $file
    $start.WorkingDirectory = $workingDirectory
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    foreach ($argument in $arguments) {
        [void]$start.ArgumentList.Add($argument)
    }
    return [System.Diagnostics.Process]::Start($start)
}

$php = Find-Php
$extensionDir = Join-Path (Split-Path -Parent $php) 'ext'
$phpOptions = @(
    '-d', 'memory_limit=512M',
    '-d', "extension_dir=$extensionDir",
    '-d', 'extension=mysqli',
    '-d', 'extension=pdo_mysql',
    '-d', 'extension=curl',
    '-d', 'extension=mbstring',
    '-d', 'extension=openssl',
    '-d', 'extension=zip',
    '-d', 'extension=intl',
    '-d', 'extension=gd',
    '-d', 'extension=fileinfo'
)

function Invoke-Wp([string[]]$arguments) {
    & $php @phpOptions $script:wpCli @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "WP-CLI failed: $($arguments -join ' ')"
    }
}

function Invoke-WpCapture([string[]]$arguments) {
    $output = & $php @phpOptions $script:wpCli @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "WP-CLI failed: $($arguments -join ' ')"
    }
    return ($output -join "`n").Trim()
}

try {
    foreach ($required in @($mysqld, $mysql, $mysqlAdmin)) {
        if (-not (Test-Path -LiteralPath $required)) {
            throw "Required MySQL executable is missing: $required"
        }
    }
    if (Get-NetTCPConnection -State Listen -LocalPort $mysqlPort, $wordpressPort -ErrorAction SilentlyContinue) {
        throw "Acceptance ports $mysqlPort or $wordpressPort are already in use"
    }

    New-Item -ItemType Directory -Path $dataDir, $siteRoot, $toolsDir -Force | Out-Null

    Write-Output 'Initializing isolated MySQL...'
    & $mysqld --no-defaults --initialize-insecure "--basedir=$mysqlBase" "--datadir=$dataDir" --console
    if ($LASTEXITCODE -ne 0) {
        throw "mysqld initialization failed with exit code $LASTEXITCODE"
    }

    $mysqlProcess = Start-HiddenProcess $mysqld @(
        '--no-defaults',
        "--basedir=$mysqlBase",
        "--datadir=$dataDir",
        "--port=$mysqlPort",
        '--bind-address=127.0.0.1',
        '--mysqlx=0',
        "--log-error=$(Join-Path $runtime 'mysql-error.log')"
    ) $runtime

    $mysqlReady = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Milliseconds 500
        & $mysql --protocol=tcp -h 127.0.0.1 -P $mysqlPort -u root -e 'SELECT 1' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $mysqlReady = $true
            break
        }
        if ($mysqlProcess.HasExited) {
            break
        }
    }
    if (-not $mysqlReady) {
        throw 'Isolated MySQL did not become ready'
    }

    $dbPassword = [Convert]::ToBase64String(
        [Security.Cryptography.RandomNumberGenerator]::GetBytes(24)
    ).TrimEnd('=').Replace('+', 'A').Replace('/', 'B')
    $sql = @(
        'CREATE DATABASE paymorph_wp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
        "CREATE USER 'paymorph_wp'@'127.0.0.1' IDENTIFIED BY '$dbPassword'",
        "GRANT ALL PRIVILEGES ON paymorph_wp.* TO 'paymorph_wp'@'127.0.0.1'",
        'FLUSH PRIVILEGES'
    ) -join '; '
    & $mysql --protocol=tcp -h 127.0.0.1 -P $mysqlPort -u root -e $sql
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to provision the isolated WordPress database'
    }

    $script:wpCli = Join-Path $toolsDir 'wp-cli.phar'
    $cachedWpCli = $null
    $cachedCandidates = Get-ChildItem -LiteralPath (Join-Path $repo 'artifacts\wordpress') -Filter wp-cli.phar -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.Length -gt 1MB } |
        Sort-Object LastWriteTime -Descending
    foreach ($candidate in $cachedCandidates) {
        & $php $candidate.FullName --info *> $null
        if ($LASTEXITCODE -eq 0) {
            $cachedWpCli = $candidate
            break
        }
    }
    if ($cachedWpCli) {
        Copy-Item -LiteralPath $cachedWpCli.FullName -Destination $script:wpCli
    } else {
        $downloaded = $false
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            try {
                Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar' -OutFile $script:wpCli -UseBasicParsing -TimeoutSec 120
                & $php $script:wpCli --info *> $null
                if ($LASTEXITCODE -ne 0) {
                    throw 'Downloaded WP-CLI PHAR did not pass integrity validation'
                }
                $downloaded = $true
                break
            } catch {
                if ($attempt -eq 3) { throw }
                Start-Sleep -Seconds (2 * $attempt)
            }
        }
        if (-not $downloaded) { throw 'Unable to download WP-CLI' }
    }

    Write-Output 'Downloading official WordPress...'
    $wordpressArchive = Join-Path (Join-Path $repo 'artifacts\wordpress') 'wordpress-latest.zip'
    if (-not (Test-Path -LiteralPath $wordpressArchive) -or (Get-Item -LiteralPath $wordpressArchive).Length -lt 1MB) {
        Invoke-WebRequest -Uri 'https://wordpress.org/latest.zip' -OutFile $wordpressArchive -UseBasicParsing -TimeoutSec 180
    }
    Expand-Archive -LiteralPath $wordpressArchive -DestinationPath $siteRoot -Force
    if (-not (Test-Path -LiteralPath (Join-Path $site 'wp-load.php'))) {
        throw 'Official WordPress archive did not contain wp-load.php'
    }
    Invoke-Wp @(
        'config', 'create',
        "--path=$site",
        '--dbname=paymorph_wp',
        '--dbuser=paymorph_wp',
        "--dbpass=$dbPassword",
        "--dbhost=127.0.0.1:$mysqlPort",
        '--skip-check'
    )
    $adminPassword = [Convert]::ToBase64String(
        [Security.Cryptography.RandomNumberGenerator]::GetBytes(24)
    ).TrimEnd('=').Replace('+', 'C').Replace('/', 'D')
    Invoke-Wp @(
        'core', 'install',
        "--path=$site",
        "--url=http://127.0.0.1:$wordpressPort",
        '--title=PayMorph WooCommerce Acceptance',
        '--admin_user=paymorph_acceptance',
        "--admin_password=$adminPassword",
        '--admin_email=acceptance@paymorph.invalid',
        '--skip-email'
    )

    Write-Output 'Installing official WooCommerce...'
    Invoke-Wp @('plugin', 'install', 'woocommerce', '--activate', "--path=$site")
    $pluginDir = Join-Path $site 'wp-content\plugins\paymorph-woocommerce'
    New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $repo 'apps\woocommerce-gateway\paymorph-woocommerce.php') -Destination (Join-Path $pluginDir 'paymorph-woocommerce.php')
    Invoke-Wp @('plugin', 'activate', 'paymorph-woocommerce', "--path=$site")

    $gatewayCheck = @'
if (!class_exists('WC_Gateway_PayMorph')) {
    throw new Exception('PayMorph gateway class missing');
}
$gateways = WC()->payment_gateways()->payment_gateways();
if (!isset($gateways['paymorph'])) {
    throw new Exception('PayMorph gateway not registered');
}
echo "PAYMORPH_GATEWAY_REGISTERED\n";
'@
    Invoke-Wp @('eval', $gatewayCheck, "--path=$site")

    $invoiceId = '11111111-1111-4111-8111-111111111111'
    $receiptId = '22222222-2222-4222-8222-222222222222'
    $flareHash = '0x' + ('a' * 64)
    $webhookSecret = [Convert]::ToBase64String(
        [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    ).TrimEnd('=').Replace('+', 'E').Replace('/', 'F')
    $settings = @{
        enabled = 'yes'
        api_base_url = 'http://127.0.0.1:3000'
        api_key = 'pm_test_runtime_acceptance_key_1234567890'
        recipient_address = '0x1111111111111111111111111111111111111111'
        webhook_secret = $webhookSecret
    } | ConvertTo-Json -Compress
    Invoke-Wp @(
        'option', 'update', 'woocommerce_paymorph_settings', $settings,
        '--format=json', "--path=$site"
    )

    $createOrder = @"
`$order = wc_create_order();
`$order->set_currency('USD');
`$order->set_total(19.90);
`$order->set_payment_method('paymorph');
`$order->update_meta_data('_paymorph_invoice_id', '$invoiceId');
`$order->save();
echo `$order->get_id();
"@
    $orderId = Invoke-WpCapture @('eval', $createOrder, "--path=$site")
    if ($orderId -notmatch '^\d+$') {
        throw "WooCommerce did not return a numeric order ID: $orderId"
    }

    $phpProcess = Start-HiddenProcess $php @(
        $phpOptions + @('-S', "127.0.0.1:$wordpressPort", '-t', $site)
    ) $site
    $wordpressReady = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Milliseconds 500
        try {
            $health = Invoke-WebRequest -Uri "http://127.0.0.1:$wordpressPort/" -UseBasicParsing -TimeoutSec 2
            if ($health.StatusCode -ge 200 -and $health.StatusCode -lt 500) {
                $wordpressReady = $true
                break
            }
        } catch {
            if ($phpProcess.HasExited) {
                break
            }
        }
    }
    if (-not $wordpressReady) {
        throw 'WordPress PHP server did not become ready'
    }

    $event = @{
        type = 'payment.settled'
        data = @{
            invoiceId = $invoiceId
            flareTxHash = $flareHash
            receiptPath = "/receipts/$receiptId"
        }
    }
    $body = $event | ConvertTo-Json -Compress -Depth 5
    $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
    $hmac = [Security.Cryptography.HMACSHA256]::new(
        [Text.Encoding]::UTF8.GetBytes($webhookSecret)
    )
    try {
        $signature = [Convert]::ToHexString(
            $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$timestamp.$body"))
        ).ToLowerInvariant()
    } finally {
        $hmac.Dispose()
    }
    $headers = @{
        'PayMorph-Timestamp' = $timestamp
        'PayMorph-Signature' = $signature
    }
    $endpoint = "http://127.0.0.1:$wordpressPort/?rest_route=/paymorph/v1/webhook"
    $first = Invoke-RestMethod -Uri $endpoint -Method Post -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 30
    $second = Invoke-RestMethod -Uri $endpoint -Method Post -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 30
    if ($first.received -ne $true -or $second.received -ne $true) {
        throw 'WordPress webhook endpoint did not acknowledge valid duplicate deliveries'
    }

    $orderCheck = @"
`$order = wc_get_order($orderId);
echo wp_json_encode(array(
    'paid' => `$order->is_paid(),
    'transactionId' => `$order->get_transaction_id(),
    'receiptPath' => `$order->get_meta('_paymorph_receipt_path', true),
));
"@
    $orderEvidence = Invoke-WpCapture @('eval', $orderCheck, "--path=$site") |
        ConvertFrom-Json
    if (
        $orderEvidence.paid -ne $true -or
        $orderEvidence.transactionId -ne $flareHash -or
        $orderEvidence.receiptPath -ne "/receipts/$receiptId"
    ) {
        throw 'WooCommerce order evidence does not match the verified settlement webhook'
    }

    $wordpressVersion = Invoke-WpCapture @('core', 'version', "--path=$site")
    $woocommerceVersion = Invoke-WpCapture @(
        'plugin', 'get', 'woocommerce', '--field=version', "--path=$site"
    )
    Write-Output "WORDPRESS_VERSION=$wordpressVersion"
    Write-Output "WOOCOMMERCE_VERSION=$woocommerceVersion"
    Write-Output "RUNTIME_PATH=$runtime"
    Write-Output 'WORDPRESS_WOOCOMMERCE_ACCEPTANCE=PASS'
} finally {
    if ($phpProcess -and -not $phpProcess.HasExited) {
        $phpProcess.Kill($true)
        $phpProcess.WaitForExit(10000) | Out-Null
    }
    if ($mysqlProcess -and -not $mysqlProcess.HasExited) {
        & $mysqlAdmin --protocol=tcp -h 127.0.0.1 -P $mysqlPort -u root shutdown 2>$null
        if (-not $mysqlProcess.WaitForExit(10000)) {
            $mysqlProcess.Kill($true)
            $mysqlProcess.WaitForExit(10000) | Out-Null
        }
    }
    if (Test-Path -LiteralPath $siteRoot) {
        Remove-Item -LiteralPath $siteRoot -Recurse -Force
    }
}
