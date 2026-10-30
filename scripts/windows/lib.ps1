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
    if (-not [string]::Equals($topPath, $checkout, [System.StringComparison]::OrdinalIgnoreCase)) {
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

    $gitRoot = Split-Path -LiteralPath (Split-Path -LiteralPath $BashPath -Parent) -Parent
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
        if ($argument) { $lines += "common $argument" }
    }
    foreach ($argument in ($BazelArgs -split '\|')) {
        if ($argument) { $lines += "common $argument" }
    }
    return $lines
}

function Write-BazelRcFiles {
    param(
        [Parameter(Mandatory = $true)][string]$AppRoot,
        [string[]]$Lines
    )

    Write-Utf8NoBomLines -Path (Join-Path $AppRoot 'valdi/win.local.bazelrc') -Lines $Lines
    Write-Utf8NoBomLines -Path (Join-Path $AppRoot 'module-build/win.local.bazelrc') -Lines $Lines
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
