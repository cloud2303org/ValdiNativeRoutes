[CmdletBinding()]
param(
    [ValidateSet('debug', 'release')]
    [string]$Config = 'debug',
    [string]$OutputDir,
    [string]$ValdiCheckout,
    [string]$Distdir,
    [string]$BazelPath,
    [string]$OutputBase,
    [string]$RepositoryCache,
    [string]$GoModCache,
    [string]$JavaHome,
    [string]$AndroidHome,
    [string]$GitBash,
    [string[]]$BazelArg,
    [string]$BazelArgs
)

. (Join-Path $PSScriptRoot 'lib.ps1')

$root = Get-AppRoot $PSScriptRoot

if ($BazelPath) {
    if (-not (Test-Path -LiteralPath $BazelPath -PathType Leaf)) {
        throw "Bazel executable not found: $BazelPath"
    }
    $env:BAZEL_BIN = (Resolve-Path -LiteralPath $BazelPath).Path
}

if ($JavaHome) {
    if (-not (Test-Path -LiteralPath $JavaHome -PathType Container)) {
        throw "JDK not found: $JavaHome"
    }
    $env:JAVA_HOME = (Resolve-Path -LiteralPath $JavaHome).Path
}

if ($AndroidHome) {
    if (-not (Test-Path -LiteralPath $AndroidHome -PathType Container)) {
        throw "Android SDK not found: $AndroidHome"
    }
    $env:ANDROID_HOME = (Resolve-Path -LiteralPath $AndroidHome).Path
}

$resolvedDistdir = $null
if ($Distdir) {
    if (-not (Test-Path -LiteralPath $Distdir -PathType Container)) {
        throw "Bazel distdir not found: $Distdir"
    }
    $resolvedDistdir = (Resolve-Path -LiteralPath $Distdir).Path
}

$resolvedValdi = Resolve-ValdiCheckout -AppRoot $root -ValdiCheckout $ValdiCheckout
if ($resolvedValdi) {
    $pin = Get-PinnedValdiCommit $root
    Write-Host "Valdi checkout: $resolvedValdi @ $pin (clean)"
}

$resolvedOutputBase = Resolve-BazelOutputBase $OutputBase

if (-not $RepositoryCache) {
    $defaultRepositoryCache = Join-Path $env:USERPROFILE ("_bazel_$env:USERNAME/cache/repos/v1")
    if (Test-Path -LiteralPath $defaultRepositoryCache) { $RepositoryCache = $defaultRepositoryCache }
}
$resolvedRepositoryCache = $null
if ($RepositoryCache) {
    if (-not (Test-Path -LiteralPath $RepositoryCache -PathType Container)) {
        throw "Bazel repository cache not found: $RepositoryCache"
    }
    $resolvedRepositoryCache = (Resolve-Path -LiteralPath $RepositoryCache).Path
}

if ($GoModCache) {
    if (-not (Test-Path -LiteralPath $GoModCache -PathType Container)) {
        throw "Go module cache not found: $GoModCache"
    }
    $env:GOMODCACHE = (Resolve-Path -LiteralPath $GoModCache).Path
    $env:GOPROXY = 'off'
}

$localBazelRc = New-BazelRcOptions -OutputBase $resolvedOutputBase -ValdiCheckout $resolvedValdi `
    -Distdir $resolvedDistdir -RepositoryCache $resolvedRepositoryCache -JavaHome $env:JAVA_HOME `
    -BazelArg $BazelArg -BazelArgs $BazelArgs
Write-BazelRcFiles -AppRoot $root -Lines $localBazelRc
$env:VALDI_BAZEL_ARGS = ''

$bash = Resolve-GitBashPath $GitBash
$env:BAZEL_SH = $bash
Write-Host "Git Bash: $bash"
Write-Host "Bazel output root: $resolvedOutputBase"

$bashOutput = ''
if ($OutputDir) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    $resolvedOutput = (Resolve-Path -LiteralPath $OutputDir).Path
    $bashOutput = $resolvedOutput
}

$exportArguments = @($Config)
if ($bashOutput) { $exportArguments += $bashOutput }

$exitCode = Invoke-GitBash -BashPath $bash -ScriptPath (Join-Path $root 'scripts/export-android.sh') -Arguments $exportArguments
exit $exitCode
