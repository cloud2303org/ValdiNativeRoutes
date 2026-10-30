[CmdletBinding()]
param(
    [switch]$SkipRuntimeExport,
    [switch]$SkipVisionPrepare,
    [string]$ValdiCheckout,
    [string]$Distdir,
    [string]$OutputBase,
    [string]$RepositoryCache,
    [string]$GoModCache,
    [string]$BazelPath,
    [string]$JavaHome,
    [string]$AndroidHome,
    [string]$GitBash
)

. (Join-Path $PSScriptRoot 'lib.ps1')

$root = Get-AppRoot $PSScriptRoot
$script:Node = 'node'

if (-not $AndroidHome) {
    $AndroidHome = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
}
if (-not (Test-Path -LiteralPath $AndroidHome)) {
    throw "Android SDK not found: $AndroidHome"
}
$AndroidHome = (Resolve-Path -LiteralPath $AndroidHome).Path
$env:ANDROID_HOME = $AndroidHome

if (-not $JavaHome) {
    $JavaHome = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { $null }
    if (-not $JavaHome) {
        $javac = Get-Command javac.exe -ErrorAction SilentlyContinue
        if ($javac) { $JavaHome = Split-Path (Split-Path $javac.Source) -Parent }
    }
}
if ($JavaHome) {
    if (-not (Test-Path -LiteralPath $JavaHome)) { throw "JDK not found: $JavaHome" }
    $env:JAVA_HOME = (Resolve-Path -LiteralPath $JavaHome).Path
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
$env:VISION_CMAKE = $sdkCmake

# Bazel's Windows launcher can otherwise pick the system WSL bash.
$gitBashPath = Resolve-GitBashPath $GitBash
$gitBashDirectories = Get-GitBashDirectories $gitBashPath
$env:BAZEL_SH = $gitBashPath
$gitBashPathEntries = @($gitBashDirectories.UsrBin, $gitBashDirectories.Cmd) |
    Where-Object { Test-Path -LiteralPath $_ -PathType Container }
if ($gitBashPathEntries) {
    $env:PATH = (($gitBashPathEntries -join ';') + ';' + $env:PATH)
}
Write-Host "Git Bash: $gitBashPath"

$resolvedValdi = Resolve-ValdiCheckout -AppRoot $root -ValdiCheckout $ValdiCheckout
if ($resolvedValdi) {
    Write-Host "Valdi checkout: $resolvedValdi @ $(Get-PinnedValdiCommit $root) (clean)"
}

if (-not $SkipRuntimeExport) {
    $exportArguments = @{
        Config = 'debug'
        BazelPath = $BazelPath
        ValdiCheckout = $resolvedValdi
        Distdir = $Distdir
        OutputBase = $OutputBase
        RepositoryCache = $RepositoryCache
        GoModCache = $GoModCache
        JavaHome = $env:JAVA_HOME
        AndroidHome = $AndroidHome
        GitBash = $gitBashPath
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
if (-not $SkipVisionPrepare -and ($visionLibraries | Where-Object { -not (Test-Path -LiteralPath $_) })) {
    & $script:Node (Join-Path $root 'vision/scripts/prepare-native.cjs') '--target' 'android-arm64'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($BazelPath) { $env:BAZEL_BIN = (Resolve-Path -LiteralPath $BazelPath).Path }
& $script:Node (Join-Path $root 'scripts/project.mjs') 'android'
exit $LASTEXITCODE
