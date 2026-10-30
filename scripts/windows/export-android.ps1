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

$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$localBazelRc = @()

if ($BazelPath) {
    $bazel = (Resolve-Path $BazelPath).Path
    $env:BAZEL_BIN = $bazel
}

if ($JavaHome) {
    $env:JAVA_HOME = (Resolve-Path $JavaHome).Path
}
if ($env:JAVA_HOME) {
    $localBazelRc += 'common --action_env=JAVA_HOME'
}

if ($AndroidHome) {
    $env:ANDROID_HOME = (Resolve-Path $AndroidHome).Path
}

if ($Distdir) {
    $distdir = (Resolve-Path $Distdir).Path -replace '\\', '/'
    $localBazelRc += "common --distdir=$distdir"
}

if ($ValdiCheckout) {
    $fork = (Resolve-Path $ValdiCheckout).Path -replace '\\', '/'
    $modulePaths = @(
        @{ name = 'valdi'; path = $fork },
        @{ name = 'android_macros'; path = "$fork/bzl/macros" },
        @{ name = 'snap_macros'; path = "$fork/bzl/valdi/snap_macros" },
        @{ name = 'snap_client_toolchains'; path = "$fork/bzl/toolchains" },
        @{ name = 'snap_platforms'; path = "$fork/bzl/platforms" },
        @{ name = 'skia_user_config'; path = "$fork/third-party/skia_user_config" },
        @{ name = 'rules_hdrs'; path = "$fork/third-party/rules_hdrs" },
        @{ name = 'valdi_toolchain'; path = "$fork/bin" }
    )
    foreach ($module in $modulePaths) {
        if (-not (Test-Path -LiteralPath $module.path)) {
            throw "Valdi override path does not exist: $($module.path)"
        }
        $localBazelRc += "common --override_module=$($module.name)=$($module.path)"
    }
    $localBazelRc += "common --registry=file:///$fork/registry"
}

if ($OutputBase) {
    New-Item -ItemType Directory -Path $OutputBase -Force | Out-Null
    $resolvedOutputBase = (Resolve-Path -LiteralPath $OutputBase).Path -replace '\\', '/'
    $localBazelRc = @("startup --output_user_root=$resolvedOutputBase") + $localBazelRc
} else {
    # Short output paths keep AAPT2 below the legacy Windows MAX_PATH limit.
    $localBazelRc = @('startup --output_user_root=C:/b') + $localBazelRc
}

if (-not $RepositoryCache) {
    $defaultRepositoryCache = Join-Path $env:USERPROFILE ("_bazel_$env:USERNAME/cache/repos/v1")
    if (Test-Path -LiteralPath $defaultRepositoryCache) { $RepositoryCache = $defaultRepositoryCache }
}
if ($RepositoryCache) {
    $resolvedRepositoryCache = (Resolve-Path -LiteralPath $RepositoryCache).Path -replace '\\', '/'
    $localBazelRc += "common --repository_cache=$resolvedRepositoryCache"
}

if ($GoModCache) {
    $env:GOMODCACHE = (Resolve-Path -LiteralPath $GoModCache).Path
    $env:GOPROXY = 'off'
}

foreach ($argument in $BazelArg) {
    if ($argument) { $localBazelRc += "common $argument" }
}
foreach ($argument in ($BazelArgs -split '\|')) {
    if ($argument) { $localBazelRc += "common $argument" }
}

$localRc = Join-Path $root 'valdi/win.local.bazelrc'
$moduleLocalRc = Join-Path $root 'module-build/win.local.bazelrc'
Set-Content -LiteralPath $localRc -Value $localBazelRc -Encoding ASCII
Set-Content -LiteralPath $moduleLocalRc -Value $localBazelRc -Encoding ASCII
$env:VALDI_BAZEL_ARGS = ''

$bashCandidates = @()
if ($GitBash) { $bashCandidates += $GitBash }
$bashCandidates += (Join-Path $env:ProgramFiles 'Git/bin/bash.exe')
$bashCandidates += (Join-Path ${env:ProgramFiles(x86)} 'Git/bin/bash.exe')
$bash = $bashCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $bash) {
    throw 'Git Bash is required on Windows for the portable shell entry point. Pass -GitBash <path> if it is not installed in Program Files.'
}
$env:BAZEL_SH = $bash

$bashRoot = $root -replace '\\', '/'
$bashOutput = ''
if ($OutputDir) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    $resolvedOutput = (Resolve-Path -LiteralPath $OutputDir).Path
    $bashOutput = $resolvedOutput -replace '\\', '/'
}

$command = "cd `"$bashRoot`" && ./scripts/export-android.sh $Config"
if ($bashOutput) { $command += " `"$bashOutput`"" }

& $bash -c $command
exit $LASTEXITCODE
