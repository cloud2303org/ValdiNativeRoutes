[CmdletBinding()]
param(
    [switch]$SkipRuntimeExport,
    [switch]$SkipVisionPrepare,
    [string]$ValdiCheckout,
    [string]$Distdir,
    [string]$OutputBase,
    [string]$RepositoryCache,
    [string]$DiskCache,
    [string]$GoModCache,
    [string]$GoProxy,
    [string]$PnpmStore,
    [string]$GradleUserHome,
    [string]$ProxyUrl,
    [string[]]$NoProxy,
    [string]$Cmake,
    [switch]$Offline,
    [switch]$SkipInstall,
    [switch]$SkipNetworkCheck,
    [int]$MinFreeGB = 15,
    [string]$BazelPath,
    [string]$JavaHome,
    [string]$AndroidHome,
    [string]$GitBash,
    [string[]]$BazelArg,
    [string]$BazelArgs
)

. (Join-Path $PSScriptRoot 'lib.ps1')

$root = Get-AppRoot $PSScriptRoot
$script:Node = 'node'

# Fail before any expensive step, and name the install command for anything missing.
Set-BuildProxyEnvironment -ProxyUrl $ProxyUrl -NoProxy $NoProxy
if (-not $SkipNetworkCheck) { Test-ProxyConnectivity -ProxyUrl $ProxyUrl }
$nodeExe = Assert-NodeRuntime -AppRoot $root
[void](Assert-PnpmLauncher -AppRoot $root)
$bazel = Assert-BazelRuntime -AppRoot $root -BazelPath $BazelPath
$BazelPath = $bazel.Path
$env:BAZEL_BIN = $bazel.Path
$JavaHome = Assert-JdkRuntime -AppRoot $root -JavaHome $JavaHome
$env:JAVA_HOME = $JavaHome
$AndroidHome = Assert-AndroidSdkRuntime -AndroidHome $AndroidHome
$env:ANDROID_HOME = $AndroidHome
$nativeTools = Assert-NativeToolRuntime -Cmake $Cmake -AndroidHome $AndroidHome
$nodeVersion = (& $nodeExe --version).Trim()
Write-Output "Prerequisites: node $nodeVersion, bazel $($bazel.Version), JDK $JavaHome, SDK $AndroidHome"
$spacePath = if ($OutputBase) { $OutputBase } else { 'C:/b' }
$freeGB = Assert-FreeDiskSpace -Path $spacePath -MinimumGB $MinFreeGB
Write-Output "Free space on the build drive: $freeGB GB"

if ($PnpmStore) {
    New-Item -ItemType Directory -Path $PnpmStore -Force | Out-Null
    $env:npm_config_store_dir = (Resolve-Path -LiteralPath $PnpmStore).Path
    Write-Output "pnpm store: $env:npm_config_store_dir"
}
if ($GradleUserHome) {
    New-Item -ItemType Directory -Path $GradleUserHome -Force | Out-Null
    $env:GRADLE_USER_HOME = (Resolve-Path -LiteralPath $GradleUserHome).Path
    Write-Output "Gradle user home: $env:GRADLE_USER_HOME"
}

$dependencyDirectories = @('node_modules', 'valdi/node_modules', 'tools/valdi-rolldown/node_modules')
$missing = @($dependencyDirectories | Where-Object { -not (Test-Path -LiteralPath (Join-Path $root $_)) })
if ($missing.Count -gt 0 -and -not $SkipInstall) {
    Write-Output "Missing JS dependencies ($($missing -join ', ')); installing from the frozen lockfiles."
    Push-Location $root
    try {
        & $script:Node 'scripts/pnpm.mjs' 'install' '--frozen-lockfile'
        $installCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($installCode -ne 0) { throw "pnpm install --frozen-lockfile failed (exit $installCode)." }
} elseif ($missing.Count -gt 0) {
    throw "Missing JS dependencies ($($missing -join ', ')) and -SkipInstall was passed. Run: pnpm install --frozen-lockfile"
}

$appNdk = Join-Path $AndroidHome 'ndk/27.1.12297006'
if (-not (Test-Path -LiteralPath $appNdk)) {
    throw "Android NDK 27.1.12297006 not found: $appNdk"
}
$env:VISION_ANDROID_NDK = $appNdk

$sdkCmake = Join-Path $AndroidHome 'cmake/3.22.1/bin/cmake.exe'
if (-not (Test-Path -LiteralPath $sdkCmake)) {
    throw "Android SDK CMake 3.22.1 not found: $sdkCmake"
}
$env:VISION_CMAKE = if ($Cmake) { $nativeTools.Cmake } else { $sdkCmake }

# Bazel's Windows launcher can otherwise pick the system WSL bash.
$gitBashPath = Resolve-GitBashPath $GitBash
$gitBashDirectories = Get-GitBashDirectories $gitBashPath
$env:BAZEL_SH = $gitBashPath
$gitBashPathEntries = @($gitBashDirectories.UsrBin, $gitBashDirectories.Cmd) |
    Where-Object { Test-Path -LiteralPath $_ -PathType Container }
if ($gitBashPathEntries) {
    $env:PATH = (($gitBashPathEntries -join ';') + ';' + $env:PATH)
}
Write-Output "Git Bash: $gitBashPath"

$resolvedValdi = Resolve-ValdiCheckout -AppRoot $root -ValdiCheckout $ValdiCheckout
if ($resolvedValdi) {
    Write-Output "Valdi checkout: $resolvedValdi @ $(Get-PinnedValdiCommit $root) (clean)"
}

if (-not $SkipRuntimeExport) {
    $exportArguments = @{
        Config = 'debug'
        BazelPath = $BazelPath
        ValdiCheckout = $resolvedValdi
        Distdir = $Distdir
        OutputBase = $OutputBase
        RepositoryCache = $RepositoryCache
        DiskCache = $DiskCache
        GoModCache = $GoModCache
        GoProxy = $GoProxy
        Offline = $Offline
        JavaHome = $env:JAVA_HOME
        AndroidHome = $AndroidHome
        GitBash = $gitBashPath
        BazelArg = $BazelArg
        BazelArgs = $BazelArgs
    }
    & (Join-Path $PSScriptRoot 'export-android.ps1') @exportArguments
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$visionLibraries = @(
    'opencv_core',
    'opencv_imgproc',
    'opencv_highgui',
    'ncnn'
) | ForEach-Object { Join-Path $root "vision/vendor/install/android-arm64/lib/lib$_.a" }
$visionStale = -not (Test-VisionInstallCurrent -AppRoot $root -Target 'android-arm64')
if (-not $SkipVisionPrepare -and (($visionLibraries | Where-Object { -not (Test-Path -LiteralPath $_) }) -or $visionStale)) {
    if ($visionStale) { Write-Output 'Vision dependencies were built from another vendor lock; preparing them again.' }
    & $script:Node (Join-Path $root 'vision/scripts/prepare-native.cjs') '--target' 'android-arm64'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($BazelPath) { $env:BAZEL_BIN = (Resolve-Path -LiteralPath $BazelPath).Path }

# module-build/modules is a symlink in git. A Windows checkout without symlink
# support (a limited runner account) writes it as a text file, so the module
# workspace has no modules/<name> packages; a junction needs no privilege.
# The app bundle's tsconfigs must extend the Valdi sources that exist on this host;
# the workspace's bazel-valdi link may not be readable from the Gradle process.
if ($resolvedValdi) { $env:VALDI_SOURCE_ROOT = $resolvedValdi }

# `scripts/node-modules.mjs` creates the module-build/modules junction for the Bazel
# build and restores the tracked symlink text, so daily and standalone runs work too.
# CI pipes this step through Tee-Object; a Gradle daemon started here inherits stdout
# and keeps that pipe open after the build, so the step never finishes.
$projectArgs = @((Join-Path $root 'scripts/project.mjs'), 'android')
if ($env:CI) { $projectArgs += '--no-daemon' }
& $script:Node @projectArgs
$exitCode = $LASTEXITCODE
exit $exitCode
