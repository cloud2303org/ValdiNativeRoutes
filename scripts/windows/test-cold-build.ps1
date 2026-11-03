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
    [switch]$SkipNewModule,
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
if ($ProxyUrl) {
    # An empty Gradle home has to download the wrapper distribution and the Android Gradle Plugin.
    # Java ignores HTTPS_PROXY, and direct HTTPS from this host times out, so give the wrapper and the
    # build explicit JVM proxy settings (isolated to this run's Gradle home).
    $proxy = [Uri]$ProxyUrl
    $proxyJvm = @(
        "-Dhttp.proxyHost=$($proxy.Host)", "-Dhttp.proxyPort=$($proxy.Port)",
        "-Dhttps.proxyHost=$($proxy.Host)", "-Dhttps.proxyPort=$($proxy.Port)",
        '-Dorg.gradle.wrapper.networkTimeout=120000'
    ) -join ' '
    $env:GRADLE_OPTS = $proxyJvm
    $gradleProperties = Join-Path $cachePaths.gradle 'gradle.properties'
    Set-Content -LiteralPath $gradleProperties -Encoding ASCII -Value @(
        "systemProp.http.proxyHost=$($proxy.Host)",
        "systemProp.http.proxyPort=$($proxy.Port)",
        "systemProp.https.proxyHost=$($proxy.Host)",
        "systemProp.https.proxyPort=$($proxy.Port)",
        'systemProp.org.gradle.internal.http.connectionTimeout=120000',
        'systemProp.org.gradle.internal.http.socketTimeout=120000'
    )
}

$commit = $Commit
$git = Get-RequiredCommandPath -Name 'git'
if (-not $commit) {
    $commit = (& $git -C $scriptRoot rev-parse HEAD).Trim()
}
if ($commit -notmatch '^[0-9a-f]{40}$') { throw "Commit must be a full 40-character SHA: $commit" }
Write-Output "Cold build of $Repository @ $commit"
Write-Output "Isolation root: $rootPath"

$cloneLog = Join-Path $logDir 'clone.log'
# A fresh network clone is the point of this check, so a proxy reset must not fail the proof. Fetch only
# the requested commit (the same shape the CI checkout uses) and retry with a longer backoff.
function Invoke-FreshClone([string]$Target, [string]$Commit) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        New-Item -ItemType Directory -Path $Target -Force | Out-Null
        & $git -C $Target init *> $cloneLog
        $exit = $LASTEXITCODE
        if ($exit -eq 0) {
            & $git -C $Target remote add origin $Repository *>> $cloneLog
            $exit = $LASTEXITCODE
        }
        if ($exit -eq 0) {
            & $git -C $Target fetch --depth=1 origin $Commit *>> $cloneLog
            $exit = $LASTEXITCODE
        }
        if ($exit -eq 0) {
            & $git -C $Target checkout --detach $Commit *>> $cloneLog
            $exit = $LASTEXITCODE
        }
    } finally {
        $ErrorActionPreference = $previous
    }
    return $exit
}
$code = 1
$attempts = 4
for ($attempt = 1; $attempt -le $attempts; $attempt++) {
    if (Test-Path -LiteralPath $app) { Remove-Item -LiteralPath $app -Recurse -Force -ErrorAction SilentlyContinue }
    if ($attempt -gt 1 -and -not $SkipNetworkCheck) { Test-ProxyConnectivity -ProxyUrl $ProxyUrl }
    $code = Invoke-FreshClone -Target $app -Commit $commit
    if ($code -eq 0) { break }
    if ($attempt -lt $attempts) {
        Write-Output "Clone attempt $attempt failed (exit $code); retrying the clone..."
        Start-Sleep -Seconds (10 * $attempt)
    }
}
if ($code -ne 0) { throw "Cloning $commit failed (exit $code) after $attempts attempts. See $cloneLog" }
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
$nativeTools = Assert-NativeToolRuntime -Cmake $Cmake -AndroidHome $AndroidHome
$env:BAZEL_BIN = $bazel.Path
$env:VISION_CMAKE = $nativeTools.Cmake
$initial.preinstalled.bazel = $bazel.Version
$initial.preinstalled.java = $JavaHome
$initial.preinstalled.sdk = $AndroidHome
$initial.preinstalled.cmake = $nativeTools.Cmake
$initial.preinstalled.ninja = $nativeTools.Ninja

$nodeExe = Get-RequiredCommandPath -Name 'node'
$nodeLauncher = Join-Path (Split-Path $nodeExe) 'node_modules/corepack/dist/pnpm.js'
if (Test-Path -LiteralPath $nodeLauncher -PathType Leaf) { $env:npm_execpath = $nodeLauncher }

# Every cache the build can write lives in the isolation root.
$env:npm_config_store_dir = $cachePaths.pnpmStore
$env:npm_config_cache = $cachePaths.npmCache
$env:GRADLE_USER_HOME = $cachePaths.gradle
$env:GOMODCACHE = $cachePaths.goMod
$env:GOCACHE = $cachePaths.goBuild
$env:COURSIER_CACHE = $cachePaths.coursier
$env:BAZELISK_HOME = $cachePaths.bazelisk
# Explicit flags beat any host rc file, so every child build (and the checks below) stays inside the root.
# valdi and module-build are different Bazel workspaces and must not share an output base, so only the
# root travels here; each workspace appends its own name.
$isolatedRoot = $outputBase -replace '\\', '/'
$env:VALDI_BAZEL_OUTPUT_BASE_ROOT = "$isolatedRoot/base"
$env:VALDI_BAZEL_STARTUP_ARGS = "--output_user_root=$isolatedRoot"
$env:VALDI_BAZEL_ARGS = '--repository_cache=' + ($cachePaths.bazelRepos -replace '\\', '/')
# A cold install downloads everything at once; ride out proxy resets instead of failing the proof.
$env:npm_config_fetch_retries = '6'
$env:npm_config_fetch_retry_mintimeout = '10000'
$env:npm_config_fetch_retry_maxtimeout = '120000'
$env:npm_config_fetch_timeout = '180000'
$env:npm_config_network_concurrency = '4'
$env:CI = 'true'
Remove-Item Env:\GOPROXY -ErrorAction SilentlyContinue

$buildLog = Join-Path $logDir 'cold-build.log'
# The unified entry point: prebuild (sources/bindings/runtime/vision/module libraries) then the
# Gradle build, with the isolated caches and the explicit tool paths.
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidHome
$arguments = @(
    (Join-Path $app 'scripts/cli.mjs'), 'android', '--no-install', '--no-launch',
    '--bazel-path', $bazel.Path,
    '--output-base', $outputBase,
    '--repository-cache', $cachePaths.bazelRepos,
    '--disk-cache', $cachePaths.bazelDisk,
    '--go-mod-cache', $cachePaths.goMod,
    '--pnpm-store', $cachePaths.pnpmStore,
    '--gradle-user-home', $cachePaths.gradle
)
if ($ProxyUrl) { $arguments += @('--proxy-url', $ProxyUrl) }
if ($NoProxy) { $arguments += @('--no-proxy', ($NoProxy -join ',')) }
if ($GitBash) { $env:BAZEL_SH = $GitBash }
if ($Cmake) { $env:VISION_CMAKE = $Cmake }

Write-Output "Running pnpm android (unified prebuild + build) with isolated caches (log: $buildLog)"
$started = Get-Date

# An empty Gradle home has to fetch the pinned wrapper distribution, and the wrapper does not retry a
# reset itself. Install it first (still a network download) so the build is not lost to one bad connection.
$wrapperLog = Join-Path $logDir 'gradle-wrapper.log'
Write-Output "Installing the Gradle wrapper distribution (retried)..."
$wrapperCode = 1
Push-Location (Join-Path $app 'android')
try {
    for ($wrapperAttempt = 1; $wrapperAttempt -le 4; $wrapperAttempt++) {
        $wrapperCode = Invoke-LoggedCommand -FilePath 'cmd.exe' -LogPath $wrapperLog -Append:($wrapperAttempt -gt 1) `
            -Arguments @('/d', '/s', '/c', 'gradlew.bat', '--version')
        if ($wrapperCode -eq 0) { break }
        if ($wrapperAttempt -lt 4) {
            Write-Output "Gradle wrapper download attempt $wrapperAttempt failed (exit $wrapperCode); retrying..."
            Start-Sleep -Seconds (10 * $wrapperAttempt)
        }
    }
} finally { Pop-Location }
if ($wrapperCode -ne 0) {
    Write-Output "The Gradle wrapper distribution could not be downloaded (exit $wrapperCode): $wrapperLog"
    exit $wrapperCode
}

Push-Location $app
try {
    $buildCode = Invoke-LoggedCommand -FilePath 'node' -Arguments $arguments -LogPath $buildLog
} finally { Pop-Location }
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
    $testCode = Invoke-LoggedCommand -FilePath 'node' -LogPath $testLog `
        -Arguments @('scripts/project.mjs', 'test', '--valdi', (Join-Path $app 'valdi/.valdi-sources/external/valdi+'))
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

# A module added through the documented scaffold must reach the module bundles without touching
# the exported runtime. This runs last because the scaffold writes generated bindings.
$newModule = $null
if (-not $SkipNewModule) {
    $moduleName = 'cold_probe'
    $moduleLog = Join-Path $logDir 'cold-new-module.log'
    $bundle = Join-Path $app "tools/valdi-rolldown/out/$moduleName.valdimodule"
    $tsx = Join-Path $app 'tools/valdi-rolldown/node_modules/tsx/dist/cli.mjs'
    Push-Location $app
    try {
        $scaffoldExit = Invoke-LoggedCommand -FilePath 'node' -LogPath $moduleLog `
            -Arguments @($tsx, (Join-Path $app 'tools/valdi-rolldown/new-module.ts'), $moduleName)
        if ($scaffoldExit -eq 0) {
            $bundleExit = Invoke-LoggedCommand -FilePath 'node' -LogPath $moduleLog -Append `
                -Arguments @((Join-Path $app 'scripts/project.mjs'), 'modules')
        } else { $bundleExit = $scaffoldExit }
    } finally { Pop-Location }
    if ($scaffoldExit -ne 0) { Write-Output "New module scaffold FAILED (exit $scaffoldExit): $moduleLog"; exit $scaffoldExit }
    if ($bundleExit -ne 0) { Write-Output "Module bundle build FAILED after adding a module (exit $bundleExit): $moduleLog"; exit $bundleExit }
    if (-not (Test-Path -LiteralPath $bundle -PathType Leaf)) { throw "The new module has no bundle: $bundle" }
    if ((Get-HashOf $runtimeAar) -ne $hashes.runtimeAar) { throw 'Adding a module re-exported or changed the runtime AAR.' }
    # Record what the fingerprints say about a later preparation of this tree (no export here).
    Push-Location $app
    try {
        $previous = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $planText = (& node (Join-Path $app 'scripts/cli.mjs') prebuild --platform android --dry-run --json 2>&1) -join "`n"
            $planExit = $LASTEXITCODE
        } finally { $ErrorActionPreference = $previous }
    } finally { Pop-Location }
    $plan = if ($planExit -eq 0) { $planText | ConvertFrom-Json } else { $null }
    Remove-Item -LiteralPath (Join-Path $app "valdi/modules/$moduleName") -Recurse -Force
    $newModule = [ordered]@{
        name             = $moduleName
        scaffoldExit     = $scaffoldExit
        bundleExit       = $bundleExit
        bundleBytes      = (Get-Item -LiteralPath $bundle).Length
        runtimeUnchanged = $true
        planExit         = $planExit
        plan             = @($plan.steps | ForEach-Object { "$($_.step): $($_.action)" })
    }
    Write-Output "New module: $moduleName scaffolded and bundled into $([System.IO.Path]::GetFileName($bundle))."
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
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $bazelState = @(& $bazel.Path "--output_user_root=$isolatedRoot" "--output_base=$isolatedRoot/base/valdi" info output_base 2>&1 |
            ForEach-Object { "$_".Trim() })
    }
    finally { $ErrorActionPreference = $previous }
} finally { Pop-Location }
$bazelOutputBase = @($bazelState | Where-Object { $_ })[-1]
$isolatedPrefix = $rootPath -replace '\\', '/'
if (-not $bazelOutputBase -or -not $bazelOutputBase.StartsWith($isolatedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    # A host-level ~/.bazelrc wins over the workspace files; only explicit flags keep the proof isolated.
    throw "Bazel output base '$bazelOutputBase' is outside the isolation root '$rootPath'."
}

# The module-build workspace is a different Bazel workspace; it must have its own base inside the root.
$moduleBazelState = @()
Push-Location (Join-Path $app 'module-build')
try {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $moduleBazelState = @(& $bazel.Path "--output_user_root=$isolatedRoot" "--output_base=$isolatedRoot/base/module-build" info output_base 2>&1 |
            ForEach-Object { "$_".Trim() })
    }
    finally { $ErrorActionPreference = $previous }
} finally { Pop-Location }
$bazelModuleOutputBase = @($moduleBazelState | Where-Object { $_ })[-1]
if (-not $bazelModuleOutputBase -or -not $bazelModuleOutputBase.StartsWith($isolatedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "The module-build output base '$bazelModuleOutputBase' is outside the isolation root '$rootPath'."
}
if ($bazelModuleOutputBase -eq $bazelOutputBase) {
    throw "valdi and module-build share the output base '$bazelOutputBase'; they are different workspaces."
}

$report = [ordered]@{
    result        = 'success'
    commit        = $commit
    repository    = $Repository
    root          = $rootPath
    minutes       = [math]::Round(((Get-Date) - $coldStarted).TotalMinutes, 1)
    finishedAt    = (Get-Date).ToUniversalTime().ToString('o')
    isolation     = $initial.emptyAtStart
    cacheMegabytesAfter = $sizes
    bazelOutputBase       = $bazelOutputBase
    bazelModuleOutputBase = $bazelModuleOutputBase
    hashes        = $hashes
    tests         = @{ exitCode = $testCode; log = $testLog }
    invalidation  = $invalidation
    newModule     = $newModule
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
