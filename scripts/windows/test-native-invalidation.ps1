[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$AppRoot,
    [Parameter(Mandatory = $true)][string]$BazelPath,
    [string]$JavaHome,
    [string]$AndroidHome,
    [string]$OutputBase,
    [string]$RepositoryCache,
    [string]$DiskCache,
    [string]$GoModCache,
    [string]$PnpmStore,
    [string]$GradleUserHome,
    [Parameter(Mandatory = $true)][string]$InitialRuntimeHar,
    [Parameter(Mandatory = $true)][string]$InitialModuleHar,
    [Parameter(Mandatory = $true)][string]$InitialApkHash,
    [switch]$RestoreCleanArtifacts
)

# Controlled fixture changes against a real built checkout, using the same isolated caches:
#  * a standalone module's native implementation rebuilds its module library and the app, and must
#    not re-export the runtime (valdi/native is unchanged);
#  * a valdi/native C++ change must fail the daily app build with the re-export instruction and
#    leave the old AAR in place, while the full entry point exports a new runtime.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')

$app = (Resolve-Path -LiteralPath $AppRoot).Path
$logs = Join-Path (Split-Path $app -Parent) 'logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$env:BAZEL_BIN = (Resolve-Path -LiteralPath $BazelPath).Path
$env:CI = 'true'
if ($JavaHome) { $env:JAVA_HOME = (Resolve-Path -LiteralPath $JavaHome).Path }
if ($AndroidHome) { $env:ANDROID_HOME = (Resolve-Path -LiteralPath $AndroidHome).Path }
if ($GradleUserHome) { $env:GRADLE_USER_HOME = $GradleUserHome }
if ($PnpmStore) { $env:npm_config_store_dir = $PnpmStore }
if ($OutputBase) {
    # The export already wrote the workspaces' rc files; keep the same output root for these builds.
    $env:VALDI_BAZEL_ARGS = ''
}

function Get-HashOf([string]$Relative) {
    $file = Join-Path $app $Relative
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing expected artifact: $file" }
    return (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
}
function Invoke-Node([string[]]$Arguments, [string]$LogName) {
    $log = Join-Path $logs $LogName
    Push-Location $app
    try {
        & node @Arguments 2>&1 | Tee-Object -FilePath $log | Out-Host
        return [int]$LASTEXITCODE
    } finally { Pop-Location }
}
function Invoke-FullBuild([string]$LogName) {
    $log = Join-Path $logs $LogName
    $arguments = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', (Join-Path $app 'scripts/windows/build-android.ps1'),
        '-SkipVisionPrepare',
        '-BazelPath', $env:BAZEL_BIN
    )
    if ($env:JAVA_HOME) { $arguments += @('-JavaHome', $env:JAVA_HOME) }
    if ($env:ANDROID_HOME) { $arguments += @('-AndroidHome', $env:ANDROID_HOME) }
    if ($OutputBase) { $arguments += @('-OutputBase', $OutputBase) }
    if ($RepositoryCache) { $arguments += @('-RepositoryCache', $RepositoryCache) }
    if ($DiskCache) { $arguments += @('-DiskCache', $DiskCache) }
    if ($GoModCache) { $arguments += @('-GoModCache', $GoModCache) }
    if ($PnpmStore) { $arguments += @('-PnpmStore', $PnpmStore) }
    if ($GradleUserHome) { $arguments += @('-GradleUserHome', $GradleUserHome) }
    & powershell @arguments 2>&1 | Tee-Object -FilePath $log | Out-Host
    return [int]$LASTEXITCODE
}

$runtimeAar = 'android/app/libs/valdi_runtime.aar'
$moduleJar = 'module-build/out/android/calculator/calculator_android.jar'
$apk = 'android/app/build/outputs/apk/debug/app-debug.apk'

$moduleSource = Join-Path $app 'valdi/modules/calculator/android/CalculatorModuleFactory.kt'
$nativeSource = Join-Path $app 'valdi/native/src/Cpp.cpp'
foreach ($file in @($moduleSource, $nativeSource)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Fixture file missing: $file" }
}
$moduleBackup = Join-Path $env:TEMP ("calculator-" + [guid]::NewGuid().ToString('N') + '.kt')
$nativeBackup = Join-Path $env:TEMP ("cpp-" + [guid]::NewGuid().ToString('N') + '.cpp')
Copy-Item -LiteralPath $moduleSource -Destination $moduleBackup
Copy-Item -LiteralPath $nativeSource -Destination $nativeBackup
$fixture = [guid]::NewGuid().ToString('N')

try {
    # --- A standalone module's native implementation -------------------------------
    $moduleText = [System.IO.File]::ReadAllText($moduleSource)
    if ($moduleText -notmatch 'left \* right') { throw 'Fixture assumption broke: calculator source changed.' }
    [System.IO.File]::WriteAllText($moduleSource, $moduleText.Replace('left * right', "left * right + 0.0 /* $fixture */"))
    $moduleBuildLog = Join-Path $logs 'invalidation-module-build.log'
    Push-Location $app
    try {
        & node scripts/node-modules.mjs android 2>&1 | Tee-Object -FilePath $moduleBuildLog
        $moduleExit = $LASTEXITCODE
    } finally { Pop-Location }
    if ($moduleExit -ne 0) { throw "Module-only rebuild failed (exit $moduleExit): $moduleBuildLog" }
    $moduleJarAfter = Get-HashOf $moduleJar
    $runtimeAfterModule = Get-HashOf $runtimeAar
    if ($moduleJarAfter -eq $InitialModuleHar) { throw 'The module library did not change after its native implementation changed.' }
    if ($runtimeAfterModule -ne $InitialRuntimeHar) { throw 'The runtime AAR changed for a standalone module change; it must not be re-exported.' }

    $dailyExit = Invoke-Node -Arguments @('scripts/project.mjs', 'android', '--no-daemon') -LogName 'invalidation-module-app.log'
    if ($dailyExit -ne 0) { throw "Daily app build failed after a module change (exit $dailyExit)." }
    $apkAfterModule = Get-HashOf $apk
    if ($apkAfterModule -eq $InitialApkHash) { throw 'The APK did not change after the module library changed.' }
    $runtimeAfterModuleApp = Get-HashOf $runtimeAar
    if ($runtimeAfterModuleApp -ne $InitialRuntimeHar) { throw 'The daily app build re-exported or changed the runtime AAR.' }
    Write-Output 'Module change: module library and APK rebuilt; runtime AAR untouched.'

    # --- valdi/native, which is linked into the runtime ---------------------------
    $nativeText = [System.IO.File]::ReadAllText($nativeSource)
    [System.IO.File]::WriteAllText($nativeSource, $nativeText + "`n// cold-invalidation-fixture $fixture`n")
    $staleExit = Invoke-Node -Arguments @('scripts/project.mjs', 'android', '--no-daemon') -LogName 'invalidation-runtime-stale.log'
    $staleLog = Get-Content -LiteralPath (Join-Path $logs 'invalidation-runtime-stale.log') -Raw
    if ($staleExit -eq 0) { throw 'The daily app build passed with a stale runtime; it must fail and ask for an export.' }
    if ($staleLog -notmatch 'runtime is out of date') { throw "The stale runtime failure did not explain the export instruction: $staleLog" }
    $runtimeAfterStale = Get-HashOf $runtimeAar
    if ($runtimeAfterStale -ne $InitialRuntimeHar) { throw 'The stale runtime AAR changed before a successful export.' }
    Write-Output 'Runtime change: daily build refused the stale AAR with the export instruction.'

    $fullExit = Invoke-FullBuild -LogName 'invalidation-runtime-export.log'
    if ($fullExit -ne 0) { throw "The full entry point failed after a valdi/native change (exit $fullExit)." }
    $runtimeAfterExport = Get-HashOf $runtimeAar
    if ($runtimeAfterExport -eq $InitialRuntimeHar) { throw 'The full entry point did not re-export the runtime after valdi/native changed.' }
    Write-Output 'Runtime change: the full entry point exported a new AAR.'
} finally {
    Copy-Item -LiteralPath $moduleBackup -Destination $moduleSource -Force
    Copy-Item -LiteralPath $nativeBackup -Destination $nativeSource -Force
    Remove-Item -LiteralPath $moduleBackup, $nativeBackup -Force -ErrorAction SilentlyContinue
}

$result = [ordered]@{
    fixture             = $fixture
    moduleChange        = [ordered]@{
        moduleLibraryChanged = $true
        runtimeUnchanged     = $true
        dailyBuildExit       = 0
        apkChanged           = $true
    }
    runtimeChange       = [ordered]@{
        dailyBuildExit          = $staleExit
        refusedStaleRuntime     = $true
        runtimeUnchangedOnFail  = $true
        fullBuildExit           = $fullExit
        runtimeAarChanged       = $true
    }
    restoredSources     = $true
    moduleJarHash       = $moduleJarAfter
    apkHash             = $apkAfterModule
    exportedRuntimeHash = $runtimeAfterExport
}

if ($RestoreCleanArtifacts) {
    # Rebuild from the restored sources so the last artifacts match the committed tree.
    $cleanExit = Invoke-FullBuild -LogName 'invalidation-restore.log'
    if ($cleanExit -ne 0) { throw "Rebuilding the restored tree failed (exit $cleanExit)." }
    $result.cleanRuntimeHash = Get-HashOf $runtimeAar
    $result.cleanModuleHash = Get-HashOf $moduleJar
    $result.cleanApkHash = Get-HashOf $apk
    $result.cleanRuntimeMatchesInitial = $result.cleanRuntimeHash -eq $InitialRuntimeHar
    $result.cleanModuleMatchesInitial = $result.cleanModuleHash -eq $InitialModuleHar
}

Write-Output ($result | ConvertTo-Json -Depth 6 -Compress)
exit 0
