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
    [string]$DiskCache,
    [string]$GoModCache,
    [string]$GoProxy,
    [switch]$Offline,
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
    Write-Output "Valdi checkout: $resolvedValdi @ $pin (clean)"
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
    # A fresh build supplies an empty directory; Bazel's Go rules fill it over the network.
    New-Item -ItemType Directory -Path $GoModCache -Force | Out-Null
    $env:GOMODCACHE = (Resolve-Path -LiteralPath $GoModCache).Path
}
if ($GoProxy) {
    $env:GOPROXY = $GoProxy
}
if ($Offline) {
    $env:GOPROXY = 'off'
}

$localBazelRc = New-BazelRcOptions -OutputBase $resolvedOutputBase -ValdiCheckout $resolvedValdi `
    -Distdir $resolvedDistdir -RepositoryCache $resolvedRepositoryCache -JavaHome $env:JAVA_HOME `
    -BazelArg $BazelArg -BazelArgs $BazelArgs
$resolvedDiskCache = $null
if ($DiskCache) {
    New-Item -ItemType Directory -Path $DiskCache -Force | Out-Null
    $resolvedDiskCache = (Resolve-Path -LiteralPath $DiskCache).Path
}
$cacheBazelRc = New-BazelCacheRcOptions -DiskCache $resolvedDiskCache
Write-BazelRcFiles -AppRoot $root -Lines $localBazelRc -CacheLines $cacheBazelRc
# A user-level ~/.bazelrc is loaded after the workspace files and can therefore redirect the output base or
# the repository cache. Command-line startup/build flags are the only thing that beats it, so an explicit
# isolated root also becomes an environment flag for the export and the module-build workspace.
$env:VALDI_BAZEL_STARTUP_ARGS = if ($OutputBase) {
    $root = $resolvedOutputBase -replace '\\', '/'
    # A host rc that sets `startup --output_base` beats --output_user_root, so name both. valdi and
    # module-build are different workspaces and each gets its own base under this run's root.
    $env:VALDI_BAZEL_OUTPUT_BASE_ROOT = "$root/base"
    "--output_user_root=$root --output_base=$root/base/valdi"
} else { '' }
$env:VALDI_BAZEL_ARGS = if ($RepositoryCache) { '--repository_cache=' + ($resolvedRepositoryCache -replace '\\', '/') } else { '' }

$bash = Resolve-GitBashPath $GitBash
$env:BAZEL_SH = $bash
Write-Output "Git Bash: $bash"
Write-Output "Bazel output root: $resolvedOutputBase"
if ($resolvedDiskCache) { Write-Output "Bazel disk action cache: $resolvedDiskCache" }

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
