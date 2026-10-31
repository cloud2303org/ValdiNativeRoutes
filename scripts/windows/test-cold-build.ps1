[CmdletBinding()]
param(
    # Short isolation root: keep the Bazel output root well below MAX_PATH.
    [string]$Root = 'C:\vc',
    [string]$Repository = 'https://github.com/cloud2303org/ValdiNativeRoutes.git',
    [string]$Commit = '',
    [string]$ProxyUrl,
    [string[]]$NoProxy,
    [string]$BazelPath,
    [string]$JavaHome,
    [string]$AndroidHome,
    [string]$GitBash,
    [string]$Cmake,
    [int]$MinFreeGB = 25,
    [switch]$SkipInvalidation,
    [switch]$SkipNetworkCheck,
    [switch]$RemoveOnSuccess
)

# Prove an ordinary new computer can bootstrap: a network clone at one commit, then
# every dependency cache empty and inside this root. Installed tools (Node, pnpm
# launcher, Bazel, JDK, Android SDK/NDK/CMake, Git Bash, CMake/Ninja/curl/tar) are
# prerequisites and are reused; nothing is copied from an existing build tree.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')

$scriptRoot = Get-AppRoot $PSScriptRoot
$rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
if (Test-Path -LiteralPath $rootPath) {
    if (-not (Test-Path -LiteralPath $rootPath -PathType Container)) {
        throw "Isolation root is a file: $rootPath"
    }
    $existing = @(Get-ChildItem -LiteralPath $rootPath -Force -ErrorAction SilentlyContinue)
    if ($existing.Count -gt 0) {
        throw "Isolation root already exists and is not empty: $rootPath. Choose a new -Root or remove it yourself."
    }
} else {
    New-Item -ItemType Directory -Path $rootPath -Force | Out-Null
}
[void](Assert-FreeDiskSpace -Path $rootPath -MinimumGB $MinFreeGB)
$coldStarted = Get-Date

$app = Join-Path $rootPath 'app'
$caches = Join-Path $rootPath 'caches'
$outputBase = Join-Path $rootPath 'bazel-out'
$logDir = Join-Path $rootPath 'logs'
New-Item -ItemType Directory -Path $caches, $logDir -Force | Out-Null

$cachePaths = [ordered]@{
    pnpmStore   = Join-Path $caches 'pnpm-store'
    npmCache    = Join-Path $caches 'npm'
    bazelisk    = Join-Path $caches 'bazelisk'
    bazelRepos  = Join-Path $caches 'bazel-repos'
    bazelDisk   = Join-Path $caches 'bazel-disk'
    gradle      = Join-Path $caches 'gradle'
    goMod       = Join-Path $caches 'go-mod'
    goBuild     = Join-Path $caches 'go-build'
    coursier    = Join-Path $caches 'coursier'
}
foreach ($path in $cachePaths.Values) { New-Item -ItemType Directory -Path $path -Force | Out-Null }

Set-BuildProxyEnvironment -ProxyUrl $ProxyUrl -NoProxy $NoProxy
if (-not $SkipNetworkCheck) { Test-ProxyConnectivity -ProxyUrl $ProxyUrl }

$commit = $Commit
$git = Get-RequiredCommandPath -Name 'git'
if (-not $commit) {
    $commit = (& $git -C $scriptRoot rev-parse HEAD).Trim()
}
if ($commit -notmatch '^[0-9a-f]{40}$') { throw "Commit must be a full 40-character SHA: $commit" }
Write-Output "Cold build of $Repository @ $commit"
Write-Output "Isolation root: $rootPath"

$cloneLog = Join-Path $logDir 'clone.log'
$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    & $git clone --filter=blob:none --no-checkout $Repository $app *> $cloneLog
    $code = $LASTEXITCODE
    if ($code -eq 0) {
        & $git -C $app fetch --depth=1 origin $commit *>> $cloneLog
        $code = $LASTEXITCODE
    }
    if ($code -eq 0) {
        & $git -C $app checkout --detach $commit *>> $cloneLog
        $code = $LASTEXITCODE
    }
} finally {
    $ErrorActionPreference = $previous
}
if ($code -ne 0) { throw "Cloning $commit failed (exit $code). See $cloneLog" }
$head = (& $git -C $app rev-parse HEAD).Trim()
if ($head -ne $commit) { throw "Checked-out HEAD $head is not the requested commit $commit" }
$dirty = @(& $git -C $app status --porcelain=v1 --untracked-files=normal)
if ($dirty.Count -gt 0) { throw "Fresh clone is not clean: $($dirty -join '; ')" }

$initial = [ordered]@{
    commit        = $commit
    repository    = $Repository
    root          = $rootPath
    startedAt     = (Get-Date).ToUniversalTime().ToString('o')
    proxy         = $ProxyUrl
    emptyAtStart  = [ordered]@{}
    clone         = @{ head = $head; clean = $true }
    preinstalled  = [ordered]@{
        node  = (& node --version).Trim()
        bazel = ''
        java  = ''
        sdk   = ''
    }
}
foreach ($entry in $cachePaths.GetEnumerator()) {
    $initial.emptyAtStart[$entry.Key] = (@(Get-ChildItem -LiteralPath $entry.Value -Force).Count -eq 0)
}
foreach ($artifact in @('android/app/libs/valdi_runtime.aar', 'android/app/libs/valdi_ota.json',
        'module-build/out/android/calculator/calculator_android.jar',
        'android/app/build/outputs/apk/debug/app-debug.apk',
        'vision/vendor/cache', 'vision/vendor/install')) {
    if (Test-Path -LiteralPath (Join-Path $app $artifact)) {
        throw "Fresh clone unexpectedly already contains $artifact"
    }
}

# Reuse the installed tools explicitly instead of whatever a shell profile chose.
$bazel = Assert-BazelRuntime -AppRoot $app -BazelPath $BazelPath
$JavaHome = Assert-JdkRuntime -AppRoot $app -JavaHome $JavaHome
$AndroidHome = Assert-AndroidSdkRuntime -AndroidHome $AndroidHome
$initial.preinstalled.bazel = $bazel.Version
$initial.preinstalled.java = $JavaHome
$initial.preinstalled.sdk = $AndroidHome

$nodeLauncher = Join-Path (Split-Path (Get-Command node).Source) 'node_modules/corepack/dist/pnpm.js'
if (Test-Path -LiteralPath $nodeLauncher -PathType Leaf) { $env:npm_execpath = $nodeLauncher }

# Every cache the build can write lives in the isolation root.
$env:npm_config_store_dir = $cachePaths.pnpmStore
$env:npm_config_cache = $cachePaths.npmCache
$env:GRADLE_USER_HOME = $cachePaths.gradle
$env:GOMODCACHE = $cachePaths.goMod
$env:GOCACHE = $cachePaths.goBuild
$env:COURSIER_CACHE = $cachePaths.coursier
$env:BAZELISK_HOME = $cachePaths.bazelisk
$env:CI = 'true'
Remove-Item Env:\GOPROXY -ErrorAction SilentlyContinue

$buildLog = Join-Path $logDir 'cold-build.log'
$arguments = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', (Join-Path $app 'scripts/windows/build-android.ps1'),
    '-BazelPath', $bazel.Path,
    '-JavaHome', $JavaHome,
    '-AndroidHome', $AndroidHome,
    '-OutputBase', $outputBase,
    '-RepositoryCache', $cachePaths.bazelRepos,
    '-DiskCache', $cachePaths.bazelDisk,
    '-GoModCache', $cachePaths.goMod,
    '-PnpmStore', $cachePaths.pnpmStore,
    '-GradleUserHome', $cachePaths.gradle,
    '-MinFreeGB', "$MinFreeGB",
    '-BazelArg', 'build --experimental_disk_cache_gc_max_size=3G'
)
if ($GitBash) { $arguments += @('-GitBash', $GitBash) }
if ($Cmake) { $arguments += @('-Cmake', $Cmake) }
if ($ProxyUrl) { $arguments += @('-ProxyUrl', $ProxyUrl) }
if ($NoProxy) { $arguments += @('-NoProxy', ($NoProxy -join ',')); $arguments += @('-SkipNetworkCheck') }
if ($SkipNetworkCheck) { $arguments += '-SkipNetworkCheck' }

Write-Output "Running the complete Windows entry point with isolated caches (log: $buildLog)"
$started = Get-Date
& powershell @arguments 2>&1 | Tee-Object -FilePath $buildLog
$buildCode = $LASTEXITCODE
$elapsed = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)
if ($buildCode -ne 0) {
    Write-Output "Cold build FAILED after $elapsed min (exit $buildCode): $buildLog"
    exit $buildCode
}

function Get-HashOf([string]$Relative) {
    $file = Join-Path $app $Relative
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing expected output: $file" }
    return (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
}
$runtimeAar = 'android/app/libs/valdi_runtime.aar'
$moduleJar = 'module-build/out/android/calculator/calculator_android.jar'
$apk = 'android/app/build/outputs/apk/debug/app-debug.apk'
$hashes = [ordered]@{ runtimeAar = Get-HashOf $runtimeAar; moduleJar = Get-HashOf $moduleJar; apk = Get-HashOf $apk }

# The pipeline tests run against the fetched Valdi sources the export left in .valdi-sources.
$testLog = Join-Path $logDir 'cold-test.log'
Push-Location $app
try {
    & node scripts/project.mjs test --valdi (Join-Path $app 'valdi/.valdi-sources/external/valdi+') 2>&1 | Tee-Object -FilePath $testLog
    $testCode = $LASTEXITCODE
} finally {
    Pop-Location
}
if ($testCode -ne 0) {
    Write-Output "Pipeline tests FAILED (exit $testCode): $testLog"
    exit $testCode
}

$invalidation = $null
if (-not $SkipInvalidation) {
    $invalidationOutput = @(& (Join-Path $PSScriptRoot 'test-native-invalidation.ps1') -AppRoot $app -BazelPath $bazel.Path `
        -JavaHome $JavaHome -AndroidHome $AndroidHome -OutputBase $outputBase `
        -RepositoryCache $cachePaths.bazelRepos -DiskCache $cachePaths.bazelDisk `
        -GoModCache $cachePaths.goMod -PnpmStore $cachePaths.pnpmStore -GradleUserHome $cachePaths.gradle `
        -InitialRuntimeHar $hashes.runtimeAar -InitialModuleHar $hashes.moduleJar -InitialApkHash $hashes.apk `
        -RestoreCleanArtifacts)
    $invalidationCode = $LASTEXITCODE
    if ($invalidationCode -ne 0) { exit $invalidationCode }
    $invalidation = ($invalidationOutput | Where-Object { $_ -and "$_".Trim().StartsWith('{') } | Select-Object -Last 1) | ConvertFrom-Json
}

# Evidence that the caches were populated by this run, not by the host.
$sizes = [ordered]@{}
foreach ($entry in $cachePaths.GetEnumerator()) {
    $bytes = (Get-ChildItem -LiteralPath $entry.Value -Recurse -Force -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
    $sizes[$entry.Key] = [math]::Round([double]$bytes / 1MB, 1)
}
$bazelState = @()
Push-Location (Join-Path $app 'valdi')
try {
    $bazelState = @(& $bazel.Path info output_base 2>&1 | ForEach-Object { "$_".Trim() })
} finally { Pop-Location }

$report = [ordered]@{
    result        = 'success'
    commit        = $commit
    repository    = $Repository
    root          = $rootPath
    minutes       = [math]::Round(((Get-Date) - $coldStarted).TotalMinutes, 1)
    finishedAt    = (Get-Date).ToUniversalTime().ToString('o')
    isolation     = $initial.emptyAtStart
    cacheMegabytesAfter = $sizes
    bazelOutputBase = $bazelState
    hashes        = $hashes
    tests         = @{ exitCode = $testCode; log = $testLog }
    invalidation  = $invalidation
    logs          = @{ clone = $cloneLog; build = $buildLog }
}
$reportPath = Join-Path $logDir 'cold-build-report.json'
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding UTF8
Write-Output "Cold build succeeded in $elapsed min."
Write-Output "Runtime AAR $($hashes.runtimeAar)"
Write-Output "Calculator jar $($hashes.moduleJar)"
Write-Output "APK $($hashes.apk)"
Write-Output "Report: $reportPath"
if ($RemoveOnSuccess) {
    Write-Output "Leaving $rootPath in place; remove it yourself when the evidence is no longer needed."
}
exit 0
