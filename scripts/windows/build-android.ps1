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

$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
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
$gitBash = Join-Path $env:ProgramFiles 'Git/bin/bash.exe'
if (Test-Path -LiteralPath $gitBash) {
    $gitUsrBin = Join-Path $env:ProgramFiles 'Git/usr/bin'
    $gitCmd = Join-Path $env:ProgramFiles 'Git/cmd'
    $env:BAZEL_SH = $gitBash
    $env:PATH = "$gitUsrBin;$gitCmd;$env:PATH"
}

if (-not $SkipRuntimeExport) {
    $exportArguments = @{
        Config = 'debug'
        BazelPath = $BazelPath
        ValdiCheckout = $ValdiCheckout
        Distdir = $Distdir
        OutputBase = $OutputBase
        RepositoryCache = $RepositoryCache
        GoModCache = $GoModCache
        JavaHome = $env:JAVA_HOME
        AndroidHome = $AndroidHome
        GitBash = $GitBash
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

$env:BAZEL_BIN = if ($BazelPath) { (Resolve-Path $BazelPath).Path } else { $env:BAZEL_BIN }
& $script:Node (Join-Path $root 'scripts/project.mjs') 'android'
exit $LASTEXITCODE
