# Shared helpers for the native Windows Android entry points. Dot-source this file.

function Get-AppRoot {
    param([Parameter(Mandatory = $true)][string]$ScriptRoot)

    return (Resolve-Path -LiteralPath (Join-Path $ScriptRoot '../..')).Path
}

function Get-PinnedValdiCommit {
    param([Parameter(Mandatory = $true)][string]$AppRoot)

    $moduleFile = Join-Path $AppRoot 'valdi/MODULE.bazel'
    if (-not (Test-Path -LiteralPath $moduleFile -PathType Leaf)) {
        throw "Cannot read the Valdi pin: $moduleFile does not exist."
    }
    # Read UTF-8 explicitly: Windows PowerShell 5.1 would otherwise use the ANSI code page.
    $module = [System.IO.File]::ReadAllText($moduleFile, (New-Object System.Text.UTF8Encoding($false)))
    $match = [regex]::Match($module, '(?m)^VALDI_COMMIT = "([0-9a-f]{40})"[ \t]*\r?$')
    if (-not $match.Success) {
        throw "Cannot read VALDI_COMMIT from $moduleFile."
    }
    return $match.Groups[1].Value
}

function Get-GitExecutable {
    $git = Get-Command git.exe -ErrorAction SilentlyContinue
    if (-not $git) { $git = Get-Command git -ErrorAction SilentlyContinue }
    if ($git) { return $git.Source }

    $candidates = @()
    if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'Git/cmd/git.exe') }
    if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Git/cmd/git.exe') }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    throw 'git.exe was not found on PATH or in a Git for Windows installation.'
}

function Invoke-GitCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$AllowFailure
    )

    $git = Get-GitExecutable
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $raw = & $git -C $Directory @Arguments 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    $lines = @($raw | ForEach-Object { "$_".TrimEnd() })
    if ($code -ne 0 -and -not $AllowFailure) {
        throw ("git {0} failed in {1} (exit {2}): {3}" -f ($Arguments -join ' '), $Directory, $code, ($lines -join "`n"))
    }
    return [pscustomobject]@{ ExitCode = $code; Lines = $lines }
}

function ConvertTo-NativePath {
    param([Parameter(Mandatory = $true)][string]$Path)

    return ($Path -replace '/', '\')
}

function Get-CanonicalPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    # Resolve directory junctions/symlinks so a checkout reached through a link compares
    # equal to the work tree path git reports. (PowerShell 5.1 has no ResolveLinkTarget.)
    $current = [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
    for ($depth = 0; $depth -lt 16; $depth++) {
        $item = Get-Item -LiteralPath $current -Force
        if (-not ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { break }
        $target = $item.Target
        if ($target -is [array]) { $target = $target[0] }
        if (-not $target) { break }
        if (-not [System.IO.Path]::IsPathRooted($target)) {
            $target = Join-Path $item.DirectoryName $target
        }
        $current = [System.IO.Path]::GetFullPath($target).TrimEnd('\', '/')
    }
    return $current
}

function Resolve-ValdiCheckout {
    param(
        [Parameter(Mandatory = $true)][string]$AppRoot,
        [string]$ValdiCheckout
    )

    if (-not $ValdiCheckout) { return $null }
    if (-not (Test-Path -LiteralPath $ValdiCheckout -PathType Container)) {
        throw "Valdi checkout not found: $ValdiCheckout"
    }
    $checkout = (Resolve-Path -LiteralPath $ValdiCheckout).Path.TrimEnd('\', '/')
    $pin = Get-PinnedValdiCommit $AppRoot

    $top = Invoke-GitCommand -Directory $checkout -Arguments @('rev-parse', '--show-toplevel')
    $topPath = $top.Lines | Select-Object -First 1
    if (-not $topPath) { throw "Valdi checkout is not a git work tree: $checkout" }
    $topPath = (ConvertTo-NativePath $topPath).TrimEnd('\', '/')
    if (-not [string]::Equals((Get-CanonicalPath $topPath), (Get-CanonicalPath $checkout), [System.StringComparison]::OrdinalIgnoreCase)) {
        throw ("Valdi checkout must be the git work tree root, not a subdirectory: {0} (work tree: {1})" -f $checkout, $topPath)
    }

    $head = (Invoke-GitCommand -Directory $checkout -Arguments @('rev-parse', 'HEAD')).Lines | Select-Object -First 1
    if ($head -ne $pin) {
        $message = "Valdi checkout {0} is at {1}, but valdi/MODULE.bazel pins {2}.`n" -f $checkout, $head, $pin
        throw ($message + 'The OTA fingerprint names the pinned commit, so the runtime export must be built from it: ' +
            'check out the pin, or omit -ValdiCheckout to let Bazel fetch the pinned archive.')
    }

    $status = Invoke-GitCommand -Directory $checkout -Arguments @('status', '--porcelain=v1', '--untracked-files=normal')
    if ($status.Lines.Count -gt 0) {
        $sample = ($status.Lines | Select-Object -First 8) -join '; '
        $message = "Valdi checkout {0} is not clean at {1}: {2}.`n" -f $checkout, $pin, $sample
        throw ($message + 'Commit, stash or remove those changes: the export must come from a clean checkout at the pinned ' +
            'commit, because uncommitted Valdi sources are not represented by the OTA fingerprint.')
    }

    return $checkout
}

function Resolve-GitBashPath {
    param([string]$GitBash)

    if ($GitBash) {
        if (-not (Test-Path -LiteralPath $GitBash -PathType Leaf)) {
            throw "Git Bash was not found at the -GitBash path: $GitBash"
        }
        return (Resolve-Path -LiteralPath $GitBash).Path
    }

    $candidates = @()
    if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'Git/bin/bash.exe') }
    if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Git/bin/bash.exe') }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return (Resolve-Path -LiteralPath $candidate).Path }
    }
    throw 'Git Bash is required on Windows for the portable shell entry point. Pass -GitBash <path to bash.exe> if Git for Windows is installed elsewhere.'
}

function Get-GitBashDirectories {
    param([Parameter(Mandatory = $true)][string]$BashPath)

    # Split-Path -LiteralPath -Parent is an ambiguous parameter set in Windows PowerShell 5.1.
    $gitRoot = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetDirectoryName($BashPath))
    return [pscustomobject]@{
        Root = $gitRoot
        UsrBin = Join-Path $gitRoot 'usr/bin'
        Cmd = Join-Path $gitRoot 'cmd'
    }
}

function Assert-WritableDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Description
    )

    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        throw "$Description is a file, not a directory: $Path"
    }
    New-Item -ItemType Directory -Path $Path -Force -ErrorAction Stop | Out-Null
    $probe = Join-Path $Path ('write-probe-' + [guid]::NewGuid().ToString('N'))
    try {
        [System.IO.File]::WriteAllText($probe, 'probe')
        Remove-Item -LiteralPath $probe -Force -ErrorAction Stop
    } catch {
        throw "$Description is not writable ($Path): $($_.Exception.Message)"
    }
}

function Resolve-BazelOutputBase {
    param([string]$OutputBase)

    # Short output paths keep Android AAPT2 below the legacy Windows MAX_PATH limit.
    $default = 'C:/b'
    if (-not $OutputBase) {
        try {
            Assert-WritableDirectory -Path (ConvertTo-NativePath $default) -Description 'The default Bazel startup output root C:/b'
        } catch {
            throw ("$($_.Exception.Message)`n" +
                'Pass -OutputBase <short writable directory, for example D:/b> to use another drive or directory.')
        }
        return $default
    }

    Assert-WritableDirectory -Path $OutputBase -Description 'The Bazel startup output root'
    $resolved = ((Resolve-Path -LiteralPath $OutputBase).Path -replace '\\', '/').TrimEnd('/')
    if ($resolved.Contains(' ')) {
        Write-Warning "Bazel warns that an output root containing a space can break builds: $resolved"
    }
    return $resolved
}

function ConvertTo-BazelRcOptionValue {
    param([Parameter(Mandatory = $true)][string]$Value)

    # Bazel splits rc lines on whitespace, so paths need quoting. Quotes in a Windows path are invalid anyway.
    if ($Value -match '["\r\n]') {
        throw "Bazel rc value contains characters that cannot be quoted safely: $Value"
    }
    return '"' + $Value + '"'
}

function ConvertTo-FileUrl {
    param([Parameter(Mandatory = $true)][string]$Path)

    $normalized = ($Path -replace '\\', '/').TrimEnd('/')
    if ($normalized -notmatch '^[A-Za-z]:/') {
        throw "Expected an absolute Windows path for a file registry: $Path"
    }
    # Percent-encode spaces and non-ASCII so the URL survives Bazel's registry parsing.
    return (New-Object System.Uri ('file:///' + $normalized)).AbsoluteUri.TrimEnd('/')
}

function Write-Utf8NoBomLines {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string[]]$Lines
    )

    # ASCII would replace non-ASCII Windows paths with '?'; a BOM can break rc parsing.
    $encoding = New-Object System.Text.UTF8Encoding($false)
    $text = ''
    if ($Lines -and $Lines.Count -gt 0) { $text = ($Lines -join "`r`n") + "`r`n" }
    [System.IO.File]::WriteAllText($Path, $text, $encoding)
}

function Get-ValdiModuleOverrides {
    param([Parameter(Mandatory = $true)][string]$ValdiCheckout)

    $modules = @(
        @{ Name = 'valdi'; RelativePath = '' },
        @{ Name = 'android_macros'; RelativePath = 'bzl/macros' },
        @{ Name = 'snap_macros'; RelativePath = 'bzl/valdi/snap_macros' },
        @{ Name = 'snap_client_toolchains'; RelativePath = 'bzl/toolchains' },
        @{ Name = 'snap_platforms'; RelativePath = 'bzl/platforms' },
        @{ Name = 'skia_user_config'; RelativePath = 'third-party/skia_user_config' },
        @{ Name = 'rules_hdrs'; RelativePath = 'third-party/rules_hdrs' },
        @{ Name = 'valdi_toolchain'; RelativePath = 'bin' }
    )

    $result = @()
    foreach ($module in $modules) {
        $path = if ($module.RelativePath) { Join-Path $ValdiCheckout $module.RelativePath } else { $ValdiCheckout }
        if (-not (Test-Path -LiteralPath $path -PathType Container)) {
            throw "Valdi module override path does not exist: $path"
        }
        $result += [pscustomobject]@{
            Name = $module.Name
            Path = (Resolve-Path -LiteralPath $path).Path
        }
    }
    return $result
}

function New-BazelRcOptions {
    param(
        [Parameter(Mandatory = $true)][string]$OutputBase,
        [string]$ValdiCheckout,
        [string]$Distdir,
        [string]$RepositoryCache,
        [string]$JavaHome,
        [string[]]$BazelArg,
        [string]$BazelArgs
    )

    # Startup options must come first in an rc file.
    $lines = @('startup ' + (ConvertTo-BazelRcOptionValue ('--output_user_root=' + $OutputBase)))
    if ($JavaHome) { $lines += 'common --action_env=JAVA_HOME' }
    if ($Distdir) { $lines += 'common ' + (ConvertTo-BazelRcOptionValue ('--distdir=' + ($Distdir -replace '\\', '/'))) }
    if ($ValdiCheckout) {
        foreach ($module in (Get-ValdiModuleOverrides -ValdiCheckout $ValdiCheckout)) {
            $modulePath = $module.Path -replace '\\', '/'
            $lines += 'common ' + (ConvertTo-BazelRcOptionValue ('--override_module=' + $module.Name + '=' + $modulePath))
        }
        $registryPath = Join-Path $ValdiCheckout 'registry'
        if (-not (Test-Path -LiteralPath $registryPath -PathType Container)) {
            throw "Valdi checkout has no registry directory: $registryPath"
        }
        # .bazelrc imports this file first, and Bazel keeps registry order within `common`
        # options, so this local registry takes priority over the pinned fork URL and BCR.
        $lines += 'common ' + (ConvertTo-BazelRcOptionValue ('--registry=' + (ConvertTo-FileUrl $registryPath)))
    }
    if ($RepositoryCache) {
        $lines += 'common ' + (ConvertTo-BazelRcOptionValue ('--repository_cache=' + ($RepositoryCache -replace '\\', '/')))
    }
    foreach ($argument in $BazelArg) {
        if ($argument) { $lines += (ConvertTo-BazelRcLine $argument) }
    }
    foreach ($argument in ($BazelArgs -split '\|')) {
        if ($argument) { $lines += (ConvertTo-BazelRcLine $argument) }
    }
    return $lines
}

function New-BazelCacheRcOptions {
    param([string]$DiskCache)

    # Imported after the checked-in defaults (last try-import in each .bazelrc) so an
    # isolated build can point the action cache at its own directory.
    if (-not $DiskCache) { return @() }
    return @('build ' + (ConvertTo-BazelRcOptionValue ('--disk_cache=' + ($DiskCache -replace '\\', '/'))))
}

function ConvertTo-BazelRcLine {
    param([Parameter(Mandatory = $true)][string]$Argument)

    # A caller can target one command ("build ...") instead of the default "common ...":
    # fetch-only runs such as `bazel fetch --repo=@valdi` reject build-only flags.
    if ($Argument -match '^(startup|common|build|test|fetch)\s') { return $Argument }
    return "common $Argument"
}

function Write-BazelRcFiles {
    param(
        [Parameter(Mandatory = $true)][string]$AppRoot,
        [string[]]$Lines,
        [string[]]$CacheLines
    )

    Write-Utf8NoBomLines -Path (Join-Path $AppRoot 'valdi/win.local.bazelrc') -Lines $Lines
    Write-Utf8NoBomLines -Path (Join-Path $AppRoot 'module-build/win.local.bazelrc') -Lines $Lines
    # Always rewrite this file: a previous isolated run must not keep redirecting the caches.
    $cacheComment = @('# Written by scripts/windows/lib.ps1. Empty means the checked-in cache defaults apply.')
    if (-not $CacheLines) { $CacheLines = $cacheComment }
    Write-Utf8NoBomLines -Path (Join-Path $AppRoot 'valdi/win.cache.bazelrc') -Lines $CacheLines
    Write-Utf8NoBomLines -Path (Join-Path $AppRoot 'module-build/win.cache.bazelrc') -Lines $CacheLines
}

function Invoke-GitBash {
    param(
        [Parameter(Mandatory = $true)][string]$BashPath,
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [string[]]$Arguments = @()
    )

    if (-not (Test-Path -LiteralPath $ScriptPath -PathType Leaf)) {
        throw "Script not found: $ScriptPath"
    }
    # Pass paths as argv instead of interpolating them into a bash -c string: quoting is then done by
    # PowerShell and nothing in the path is expanded as shell syntax.
    $script = $ScriptPath -replace '\\', '/'
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $BashPath $script @Arguments | Out-Host
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    return $code
}

function Get-RequiredCommandPath {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$Hint
    )

    # Application only: Windows PowerShell aliases `curl` to Invoke-WebRequest, which cannot
    # be executed with curl's arguments.
    $commands = @(Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue)
    $command = $commands | Where-Object { $_.Source -match '\.exe$' } | Select-Object -First 1
    if (-not $command) { $command = $commands | Select-Object -First 1 }
    if (-not $command) {
        $message = "$Name was not found on PATH."
        if ($Hint) { $message += " $Hint" }
        throw $message
    }
    return $command.Source
}

function Invoke-LoggedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$LogPath,
        [switch]$Append
    )

    # Windows PowerShell 5.1 raises a terminating NativeCommandError for any stderr line while
    # $ErrorActionPreference is Stop, and Bazel/Node print ordinary progress to stderr. Keep the
    # preference at Continue for the child and report its own exit code instead.
    #
    # Output goes to files rather than a pipeline: a long-lived grandchild (a Bazel server) inherits
    # the handle, and a pipeline keeps waiting for it after this process has finished, which is what
    # stalled the CI step. -RedirectStandardOutput only waits for this process itself.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($LogPath) {
            $stdout = "$LogPath.stdout.tmp"
            $stderr = "$LogPath.stderr.tmp"
            Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
            $quoted = @($Arguments | ForEach-Object { if ($_ -match '\s') { '"{0}"' -f $_ } else { $_ } })
            $process = Start-Process -FilePath $FilePath -ArgumentList $quoted -NoNewWindow -PassThru `
                -RedirectStandardOutput $stdout -RedirectStandardError $stderr
            $process.WaitForExit()
            $code = $process.ExitCode
            $lines = @()
            if (Test-Path -LiteralPath $stdout) { $lines += Get-Content -LiteralPath $stdout }
            if (Test-Path -LiteralPath $stderr) { $lines += Get-Content -LiteralPath $stderr }
            if ($lines.Count) {
                if ($Append) { $lines | Add-Content -LiteralPath $LogPath -Encoding UTF8 }
                else { $lines | Set-Content -LiteralPath $LogPath -Encoding UTF8 }
                $lines | Out-Host
            }
            Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
        } else {
            & $FilePath @Arguments 2>&1 | Out-Host
            $code = $LASTEXITCODE
        }
    } finally {
        $ErrorActionPreference = $previous
    }
    return [int]$code
}

function Get-CommandVersion {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [string[]]$Arguments = @('--version')
    )

    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $Executable @Arguments 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    return [pscustomobject]@{
        ExitCode = $code
        Text = (($output | ForEach-Object { "$_".Trim() }) -join "`n").Trim()
    }
}

function Assert-NodeRuntime {
    param([Parameter(Mandatory = $true)][string]$AppRoot)

    $node = Get-RequiredCommandPath -Name 'node' -Hint 'Install Node 24 (the repository pins the pnpm 10 launcher).'
    $version = Get-CommandVersion -Executable $node
    if ($version.ExitCode -ne 0) { throw "node --version failed: $($version.Text)" }
    $major = [int](($version.Text -replace '^v', '').Split('.')[0])
    if ($major -lt 24) {
        throw "Node 24 or newer is required; found $($version.Text) at $node."
    }
    return $node
}

function Assert-PnpmLauncher {
    param([Parameter(Mandatory = $true)][string]$AppRoot)

    $package = Get-Content -LiteralPath (Join-Path $AppRoot 'package.json') -Raw | ConvertFrom-Json
    $expected = $package.packageManager -replace '^pnpm@', ''
    if (-not $expected) { throw "package.json does not pin packageManager." }
    $script = Join-Path $AppRoot 'scripts/pnpm.mjs'
    if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw "Missing pnpm launcher: $script" }

    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        Push-Location $AppRoot
        $actual = & node $script '--version' 2>&1
        $code = $LASTEXITCODE
        Pop-Location
    } finally {
        $ErrorActionPreference = $previous
    }
    $text = (($actual | ForEach-Object { "$_".Trim() }) -join ' ').Trim()
    if ($code -ne 0) {
        throw ("Cannot run the pinned pnpm launcher through node (exit {0}): {1}`n" -f $code, $text) +
            'Install Corepack or pnpm so node_modules/corepack/dist/pnpm.js (or pnpm/bin/pnpm.cjs) exists next to node.'
    }
    if ($text -ne $expected) { throw "Expected pnpm $expected (package.json packageManager), got '$text'." }
    return $expected
}

function Assert-BazelRuntime {
    param(
        [Parameter(Mandatory = $true)][string]$AppRoot,
        [string]$BazelPath
    )

    $bazel = $BazelPath
    if (-not $bazel) { $bazel = $env:BAZEL_BIN }
    if (-not $bazel) {
        $command = Get-Command bazel.exe -ErrorAction SilentlyContinue
        if (-not $command) { $command = Get-Command bazel -ErrorAction SilentlyContinue }
        if (-not $command) { $command = Get-Command bazelisk.exe -ErrorAction SilentlyContinue }
        if ($command) { $bazel = $command.Source }
    }
    if (-not $bazel) {
        throw 'Bazel 8.2.1 was not found. Pass -BazelPath <path to bazel.exe> or set BAZEL_BIN.'
    }
    if (-not (Test-Path -LiteralPath $bazel -PathType Leaf)) { throw "Bazel executable not found: $bazel" }
    $bazel = (Resolve-Path -LiteralPath $bazel).Path

    $versionFile = Join-Path $AppRoot 'valdi/.bazelversion'
    if (-not (Test-Path -LiteralPath $versionFile -PathType Leaf)) { throw "Missing pin: $versionFile" }
    $expected = (Get-Content -LiteralPath $versionFile -Raw).Trim()
    $actual = Get-CommandVersion -Executable $bazel
    if ($actual.ExitCode -ne 0 -or $actual.Text -ne "bazel $expected") {
        throw "Expected Bazel $expected (valdi/.bazelversion), got '$($actual.Text)' from $bazel."
    }
    return [pscustomobject]@{ Path = $bazel; Version = $expected }
}

function Assert-JdkRuntime {
    param(
        [Parameter(Mandatory = $true)][string]$AppRoot,
        [string]$JavaHome
    )

    if (-not $JavaHome) { $JavaHome = $env:JAVA_HOME }
    if (-not $JavaHome) {
        $javac = Get-Command javac.exe -ErrorAction SilentlyContinue
        if (-not $javac) { $javac = Get-Command javac -ErrorAction SilentlyContinue }
        if ($javac) { $JavaHome = Split-Path (Split-Path $javac.Source) -Parent }
    }
    if (-not $JavaHome) { throw 'No JDK found. Pass -JavaHome <JDK 17 directory> or set JAVA_HOME.' }
    if (-not (Test-Path -LiteralPath $JavaHome -PathType Container)) { throw "JDK directory not found: $JavaHome" }
    $JavaHome = (Resolve-Path -LiteralPath $JavaHome).Path
    $java = Join-Path $JavaHome 'bin/java.exe'
    if (-not (Test-Path -LiteralPath $java -PathType Leaf)) { throw "JDK has no bin/java.exe: $JavaHome" }
    $version = Get-CommandVersion -Executable $java -Arguments @('-version')
    $match = [regex]::Match($version.Text, 'version "(\d+)')
    if (-not $match.Success) { throw "Cannot read the JDK version from '$($version.Text)' ($JavaHome)." }
    $major = [int]$match.Groups[1].Value
    if ($major -lt 17) { throw "JDK 17 or newer is required; $JavaHome is Java $major." }
    if ($major -ne 17) {
        Write-Warning "The project builds with JDK 17 (CI installs Temurin 17); this host uses Java $major from $JavaHome."
    }
    return $JavaHome
}

function Assert-AndroidSdkRuntime {
    param([string]$AndroidHome)

    if (-not $AndroidHome) {
        if ($env:ANDROID_HOME) { $AndroidHome = $env:ANDROID_HOME }
        elseif ($env:ANDROID_SDK_ROOT) { $AndroidHome = $env:ANDROID_SDK_ROOT }
        elseif ($env:LOCALAPPDATA) { $AndroidHome = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
    }
    if (-not $AndroidHome) { throw 'Android SDK not found. Pass -AndroidHome <sdk directory> or set ANDROID_HOME.' }
    if (-not (Test-Path -LiteralPath $AndroidHome -PathType Container)) { throw "Android SDK not found: $AndroidHome" }
    $AndroidHome = (Resolve-Path -LiteralPath $AndroidHome).Path

    $required = @(
        @{ Path = 'ndk/27.1.12297006'; Hint = 'Install it: sdkmanager "ndk;27.1.12297006"' },
        @{ Path = 'cmake/3.22.1'; Hint = 'Install it: sdkmanager "cmake;3.22.1"' },
        @{ Path = 'build-tools/37.0.0'; Hint = 'Install it: sdkmanager "build-tools;37.0.0"' }
    )
    foreach ($entry in $required) {
        $path = Join-Path $AndroidHome $entry.Path
        if (-not (Test-Path -LiteralPath $path -PathType Container)) {
            throw "Android SDK component missing: $path. $($entry.Hint)"
        }
    }
    $platform = @('platforms/android-37.0', 'platforms/android-37') |
        ForEach-Object { Join-Path $AndroidHome $_ } |
        Where-Object { Test-Path -LiteralPath $_ -PathType Container } |
        Select-Object -First 1
    if (-not $platform) {
        throw "Android SDK platform missing: $AndroidHome/platforms/android-37(.0). Install it: sdkmanager `"platforms;android-37.0`""
    }
    return $AndroidHome
}

function Assert-NativeToolRuntime {
    param(
        [string]$Cmake,
        [string]$AndroidHome
    )

    $resolved = [ordered]@{}
    if ($Cmake) {
        if (-not (Test-Path -LiteralPath $Cmake -PathType Leaf)) { throw "CMake not found: $Cmake" }
        $resolved.Cmake = (Resolve-Path -LiteralPath $Cmake).Path
    } elseif ($env:VISION_CMAKE) {
        if (-not (Test-Path -LiteralPath $env:VISION_CMAKE -PathType Leaf)) { throw "VISION_CMAKE does not exist: $($env:VISION_CMAKE)" }
        $resolved.Cmake = (Resolve-Path -LiteralPath $env:VISION_CMAKE).Path
    } else {
        $resolved.Cmake = Get-RequiredCommandPath -Name 'cmake' -Hint 'Install CMake 3.22 or pass -Cmake <cmake.exe>.'
    }
    $ninjaCommands = @(Get-Command ninja -CommandType Application -ErrorAction SilentlyContinue)
    $ninja = $ninjaCommands | Where-Object { $_.Source -match '\.exe$' } | Select-Object -First 1
    if (-not $ninja) { $ninja = $ninjaCommands | Select-Object -First 1 }
    if ($ninja) {
        $resolved.Ninja = $ninja.Source
    } else {
        # The Android SDK's cmake package ships ninja next to cmake; expose it to the vision build.
        $sdkNinja = if ($AndroidHome) { Join-Path $AndroidHome 'cmake/3.22.1/bin/ninja.exe' } else { $null }
        if (-not $sdkNinja -or -not (Test-Path -LiteralPath $sdkNinja -PathType Leaf)) {
            throw 'ninja was not found on PATH or in the Android SDK cmake package. Install Ninja (the vision build uses the Ninja generator).'
        }
        $resolved.Ninja = $sdkNinja
        $env:PATH = (Split-Path $sdkNinja) + ';' + $env:PATH
    }
    $resolved.Curl = Get-RequiredCommandPath -Name 'curl' -Hint 'Windows ships curl.exe in System32; add it to PATH.'
    $tar = Join-Path $env:SystemRoot 'System32/tar.exe'
    if (-not (Test-Path -LiteralPath $tar -PathType Leaf)) { throw "Windows tar.exe not found: $tar" }
    $resolved.Tar = $tar
    return [pscustomobject]$resolved
}

function Assert-FreeDiskSpace {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [int]$MinimumGB = 15
    )

    $full = [System.IO.Path]::GetFullPath($Path)
    $root = [System.IO.Path]::GetPathRoot($full)
    $drive = $root.TrimEnd('\', '/').TrimEnd(':')
    if (-not $drive) { return }
    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($drive):'" -ErrorAction SilentlyContinue
    if (-not $disk) { return }
    $freeGB = [math]::Round($disk.FreeSpace / 1GB, 1)
    if ($freeGB -lt $MinimumGB) {
        throw "Only $freeGB GB free on $($drive):; a cold native build needs at least $MinimumGB GB. Free space or choose a different drive."
    }
    return $freeGB
}

function Merge-NoProxyList {
    param([string[]]$Entries)

    $values = @('localhost', '127.0.0.1', '::1')
    if ($env:NO_PROXY) { $values += ($env:NO_PROXY -split ',' | ForEach-Object { $_.Trim() }) }
    if ($env:no_proxy) { $values += ($env:no_proxy -split ',' | ForEach-Object { $_.Trim() }) }
    if ($Entries) { $values += ($Entries -split ',') }
    return (($values | Where-Object { $_ } | Select-Object -Unique) -join ',')
}

function Set-BuildProxyEnvironment {
    param(
        [string]$ProxyUrl,
        [string[]]$NoProxy
    )

    if (-not $ProxyUrl) { return }
    if ($ProxyUrl -notmatch '^https?://') { throw "Proxy URL must start with http:// or https://: $ProxyUrl" }
    $list = Merge-NoProxyList -Entries $NoProxy
    foreach ($name in @('HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy')) {
        Set-Item -Path "env:$name" -Value $ProxyUrl
    }
    foreach ($name in @('NO_PROXY', 'no_proxy')) {
        Set-Item -Path "env:$name" -Value $list
    }
    # Git's http.proxy covers the GitHub fetches even when a tool ignores the environment.
    $env:GIT_CONFIG_COUNT = '1'
    $env:GIT_CONFIG_KEY_0 = 'http.https://github.com/.proxy'
    $env:GIT_CONFIG_VALUE_0 = $ProxyUrl
    Write-Output "Proxy for build processes: $ProxyUrl (NO_PROXY=$list)"
}

function Test-ProxyConnectivity {
    param(
        [string]$ProxyUrl,
        [string]$Url = 'https://github.com',
        [int]$TimeoutSeconds = 20
    )

    if (-not $ProxyUrl) { return }
    $curl = Get-RequiredCommandPath -Name 'curl'
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $result = & $curl '--silent' '--show-error' '--head' '--max-time' "$TimeoutSeconds" '--output' 'NUL' '--write-out' '%{http_code}' $Url 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($code -ne 0) { throw "Cannot reach $Url through the configured proxy: $($result -join ' ')" }
    Write-Output "Network check: $Url via proxy returned HTTP $($result -join '')."
}

function Test-VisionInstallCurrent {
    param(
        [Parameter(Mandatory = $true)][string]$AppRoot,
        [string]$Target = 'android-arm64'
    )

    # A warm tree can hold vision libraries built from an older vendor-lock; the app
    # fingerprint names the lock, so reusing them would silently mix inputs.
    $lockPath = Join-Path $AppRoot 'vision/vendor-lock.json'
    $stampPath = Join-Path $AppRoot "vision/vendor/install/$Target/native-routes-vision.json"
    if (-not (Test-Path -LiteralPath $stampPath -PathType Leaf)) { return $false }
    try {
        $lock = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json
        $stamp = Get-Content -LiteralPath $stampPath -Raw | ConvertFrom-Json
    } catch { return $false }
    return (
        $stamp.opencv -eq $lock.opencv.version -and
        $stamp.ncnn -eq $lock.ncnn.version -and
        $stamp.sourcePins.opencv -eq $lock.opencv.sha256 -and
        $stamp.sourcePins.ncnn -eq $lock.ncnn.sha256
    )
}
