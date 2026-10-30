[CmdletBinding()]
param(
    [string]$BazelPath,
    [switch]$Integration
)

# Checks the Windows build helpers: pinned/clean Valdi identity, rc quoting and encoding,
# output-base probing, Git Bash resolution, and argument-safe bash invocation.

. (Join-Path $PSScriptRoot 'lib.ps1')

$script:Checks = 0
$script:Failures = 0
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('valdi-windows-tests-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

function Test-Case {
    param([string]$Name, [scriptblock]$Body)

    $script:Checks++
    try {
        & $Body
        Write-Host "ok   $Name"
    } catch {
        $script:Failures++
        Write-Host "FAIL $Name`: $($_.Exception.Message)"
    }
}

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Assert-Equal {
    param([string]$Expected, [string]$Actual, [string]$Message)
    if ($Expected -ne $Actual) { throw "$Message (expected [$Expected], actual [$Actual])" }
}

function Assert-Throws {
    param([scriptblock]$Body, [string]$Pattern, [string]$Message)

    $threw = $false
    try {
        & $Body | Out-Null
    } catch {
        $threw = $true
        if ($_.Exception.Message -notmatch $Pattern) {
            throw "$Message (unexpected message: $($_.Exception.Message))"
        }
    }
    if (-not $threw) { throw "$Message (no error was thrown)" }
}

function New-TestRepository {
    param([string]$Path)

    New-Item -ItemType Directory -Path $Path -Force | Out-Null
    Invoke-GitCommand -Directory $Path -Arguments @('init', '--quiet') | Out-Null
    Invoke-GitCommand -Directory $Path -Arguments @('config', 'core.autocrlf', 'false') | Out-Null
    Invoke-GitCommand -Directory $Path -Arguments @('config', 'user.name', 'Windows Build Test') | Out-Null
    Invoke-GitCommand -Directory $Path -Arguments @('config', 'user.email', 'windows-build-test@example.invalid') | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $Path 'a.txt'), "one`n")
    Invoke-GitCommand -Directory $Path -Arguments @('add', 'a.txt') | Out-Null
    Invoke-GitCommand -Directory $Path -Arguments @('commit', '--quiet', '-m', 'initial') | Out-Null
    return (Invoke-GitCommand -Directory $Path -Arguments @('rev-parse', 'HEAD')).Lines[0]
}

function New-FakeAppRoot {
    param([string]$Path, [string]$Commit)

    $valdiDir = Join-Path $Path 'valdi'
    New-Item -ItemType Directory -Path $valdiDir -Force | Out-Null
    $lines = @(
        'module(name = "test")',
        '',
        ('VALDI_COMMIT = "' + $Commit + '"'),
        ''
    )
    Write-Utf8NoBomLines -Path (Join-Path $valdiDir 'MODULE.bazel') -Lines $lines
    return $Path
}

function New-FakeValdiTree {
    param([string]$Path)

    foreach ($relative in @('', 'bzl/macros', 'bzl/valdi/snap_macros', 'bzl/toolchains', 'bzl/platforms',
            'third-party/skia_user_config', 'third-party/rules_hdrs', 'bin', 'registry')) {
        New-Item -ItemType Directory -Path (Join-Path $Path $relative) -Force | Out-Null
    }
    return $Path
}

try {
    $repo = Join-Path $tempRoot 'Valdi at pinned commit'
    $head = New-TestRepository $repo
    $appRoot = New-FakeAppRoot (Join-Path $tempRoot 'app') $head

    Test-Case 'clean checkout at the pinned commit is accepted' {
        $resolved = Resolve-ValdiCheckout -AppRoot $appRoot -ValdiCheckout $repo
        Assert-Equal (Resolve-Path -LiteralPath $repo).Path (ConvertTo-NativePath $resolved) 'checkout path'
    }

    Test-Case 'omitted checkout returns $null' {
        Assert-True ($null -eq (Resolve-ValdiCheckout -AppRoot $appRoot)) 'expected $null'
    }

    Test-Case 'missing checkout is rejected' {
        Assert-Throws { Resolve-ValdiCheckout -AppRoot $appRoot -ValdiCheckout (Join-Path $tempRoot 'missing') } 'not found' 'missing path'
    }

    Test-Case 'wrong commit is rejected' {
        [System.IO.File]::WriteAllText((Join-Path $repo 'b.txt'), "two`n")
        Invoke-GitCommand -Directory $repo -Arguments @('add', 'b.txt') | Out-Null
        Invoke-GitCommand -Directory $repo -Arguments @('commit', '--quiet', '-m', 'second') | Out-Null
        $newHead = (Invoke-GitCommand -Directory $repo -Arguments @('rev-parse', 'HEAD')).Lines[0]
        try {
            Assert-Throws { Resolve-ValdiCheckout -AppRoot $appRoot -ValdiCheckout $repo } 'pins' 'wrong commit'
        } finally {
            Invoke-GitCommand -Directory $repo -Arguments @('reset', '--quiet', '--hard', $head) | Out-Null
        }
        Assert-True ($newHead -ne $head) 'the test commit must change HEAD'
    }

    Test-Case 'modified tracked file is rejected' {
        [System.IO.File]::WriteAllText((Join-Path $repo 'a.txt'), "modified`n")
        try {
            Assert-Throws { Resolve-ValdiCheckout -AppRoot $appRoot -ValdiCheckout $repo } 'not clean' 'dirty tracked file'
        } finally {
            Invoke-GitCommand -Directory $repo -Arguments @('checkout', '--', 'a.txt') | Out-Null
        }
    }

    Test-Case 'untracked file is rejected' {
        [System.IO.File]::WriteAllText((Join-Path $repo 'untracked.txt'), "new`n")
        try {
            Assert-Throws { Resolve-ValdiCheckout -AppRoot $appRoot -ValdiCheckout $repo } 'not clean' 'untracked file'
        } finally {
            Remove-Item -LiteralPath (Join-Path $repo 'untracked.txt') -Force
        }
    }

    Test-Case 'non-git directory is rejected' {
        $plain = Join-Path $tempRoot 'plain directory'
        New-Item -ItemType Directory -Path $plain -Force | Out-Null
        Assert-Throws { Resolve-ValdiCheckout -AppRoot $appRoot -ValdiCheckout $plain } 'not a git work tree|git rev-parse' 'non-git directory'
    }

    Test-Case 'subdirectory of a checkout is rejected' {
        $sub = Join-Path $repo 'sub'
        New-Item -ItemType Directory -Path $sub -Force | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $sub 'keep.txt'), "keep`n")
        Invoke-GitCommand -Directory $repo -Arguments @('add', 'sub/keep.txt') | Out-Null
        Invoke-GitCommand -Directory $repo -Arguments @('commit', '--quiet', '-m', 'sub') | Out-Null
        try {
            Assert-Throws { Resolve-ValdiCheckout -AppRoot $appRoot -ValdiCheckout $sub } 'work tree root' 'subdirectory'
        } finally {
            Invoke-GitCommand -Directory $repo -Arguments @('reset', '--quiet', '--hard', $head) | Out-Null
            Invoke-GitCommand -Directory $repo -Arguments @('clean', '-ffdx') | Out-Null
        }
    }

    # Windows PowerShell 5.1 parses BOM-less scripts as ANSI, so build non-ASCII strings from code points.
    $unicodeWord = 'na' + [char]0xEF + 've'
    $fakeFork = New-FakeValdiTree (Join-Path $tempRoot ('Valdi ' + $unicodeWord + ' fork'))
    $spacedDistdir = Join-Path $tempRoot 'dist dir'
    $spacedCache = Join-Path $tempRoot 'repo cache dir'
    New-Item -ItemType Directory -Path $spacedDistdir -Force | Out-Null
    New-Item -ItemType Directory -Path $spacedCache -Force | Out-Null

    Test-Case 'generated rc options quote paths with spaces' {
        $lines = New-BazelRcOptions -OutputBase 'C:/b' -ValdiCheckout $fakeFork -Distdir $spacedDistdir `
            -RepositoryCache $spacedCache -JavaHome 'C:\Program Files\Java\jdk-17'
        Assert-True ($lines[0].StartsWith('startup "')) 'startup option must be first and quoted'
        $generated = @($lines | Where-Object { $_ -ne 'common --action_env=JAVA_HOME' })
        foreach ($line in $generated) {
            Assert-True ($line -match '^(common|startup) "') "path option is not quoted: $line"
        }
        $override = $lines | Where-Object { $_ -like '*--override_module=valdi=*' }
        Assert-True ($override.Contains($unicodeWord)) 'override must keep the non-ASCII path'
        $registry = $lines | Where-Object { $_ -like '*--registry=*' }
        Assert-True ($registry -match '%20') "registry URL must percent-encode spaces: $registry"
        Assert-True ($registry -match '%C3%AF') "registry URL must percent-encode non-ASCII: $registry"
    }

    Test-Case 'file URLs encode spaces and non-ASCII' {
        Assert-Equal ('file:///C:/Temp/valdi%20na%C3%AFve') (ConvertTo-FileUrl ('C:\Temp\valdi ' + $unicodeWord)) 'file URL'
    }

    Test-Case 'rc file is UTF-8 without BOM and round-trips non-ASCII' {
        $rcFile = Join-Path $tempRoot 'win.local.bazelrc'
        Write-Utf8NoBomLines -Path $rcFile -Lines @('startup "--output_user_root=C:/b"', ('common "--distdir=C:/dist ' + $unicodeWord + '"'))
        $bytes = [System.IO.File]::ReadAllBytes($rcFile)
        Assert-True (-not ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)) 'rc file must not start with a BOM'
        $text = [System.IO.File]::ReadAllText($rcFile, (New-Object System.Text.UTF8Encoding($false)))
        Assert-True ($text.Contains($unicodeWord)) 'non-ASCII text must survive'
    }

    Test-Case 'custom output base with spaces is created and normalized' {
        $custom = Join-Path $tempRoot 'bazel output base'
        $resolved = Resolve-BazelOutputBase $custom
        Assert-True (-not $resolved.Contains('\')) 'output base must use forward slashes'
        Assert-True (Test-Path -LiteralPath (ConvertTo-NativePath $resolved) -PathType Container) 'output base must exist'
    }

    Test-Case 'output base that is a file is rejected' {
        $file = Join-Path $tempRoot 'not a directory'
        [System.IO.File]::WriteAllText($file, 'x')
        Assert-Throws { Resolve-BazelOutputBase $file } 'is a file' 'file output base'
    }

    Test-Case 'default output base is C:/b' {
        Assert-Equal 'C:/b' (Resolve-BazelOutputBase $null) 'default output base'
    }

    Test-Case 'Git Bash default resolution' {
        $bash = Resolve-GitBashPath $null
        Assert-True ($bash -match 'bash\.exe$') "unexpected Git Bash path: $bash"
    }

    Test-Case 'explicit Git Bash path with spaces is used' {
        $defaultBash = Resolve-GitBashPath $null
        $customDir = Join-Path $tempRoot 'Git Bash copy'
        New-Item -ItemType Directory -Path $customDir -Force | Out-Null
        $customBash = Join-Path $customDir 'bash.exe'
        Copy-Item -LiteralPath $defaultBash -Destination $customBash
        Assert-Equal $customBash (Resolve-GitBashPath $customBash) 'custom Git Bash'
    }

    Test-Case 'missing explicit Git Bash is rejected' {
        Assert-Throws { Resolve-GitBashPath (Join-Path $tempRoot 'missing bash.exe') } 'was not found' 'missing Git Bash'
    }

    Test-Case 'bash receives paths and shell metacharacters as arguments' {
        $bash = Resolve-GitBashPath $null
        $scriptDir = Join-Path $tempRoot 'space dir'
        New-Item -ItemType Directory -Path $scriptDir -Force | Out-Null
        $scriptPath = Join-Path $scriptDir 'capture arguments.sh'
        $outputFile = Join-Path $tempRoot 'captured args.txt'
        $scriptText = @(
            '#!/bin/sh',
            'out=$1',
            'shift',
            '{',
            '  printf ''%s\n'' "$#"',
            '  for argument in "$@"; do printf ''%s\n'' "$argument"; done',
            '} > "$out"',
            'exit "${TEST_EXIT_CODE:-0}"'
        ) -join "`n"
        [System.IO.File]::WriteAllText($scriptPath, $scriptText, (New-Object System.Text.UTF8Encoding($false)))
        $arguments = @('debug', 'C:\out dir with space', '$HOME', '`not-run`', '%PATH%', $unicodeWord, 'a;b')
        $code = Invoke-GitBash -BashPath $bash -ScriptPath $scriptPath -Arguments (@($outputFile) + $arguments)
        Assert-Equal '0' "$code" 'bash exit code'
        $captured = [System.IO.File]::ReadAllLines($outputFile)
        Assert-Equal "$($arguments.Count)" $captured[0] 'argument count'
        for ($index = 0; $index -lt $arguments.Count; $index++) {
            Assert-Equal $arguments[$index] $captured[$index + 1] "argument $index"
        }
    }

    Test-Case 'bash exit code is propagated' {
        $bash = Resolve-GitBashPath $null
        $scriptPath = Join-Path $tempRoot 'exit code.sh'
        [System.IO.File]::WriteAllText($scriptPath, "#!/bin/sh`nexit 7`n", (New-Object System.Text.UTF8Encoding($false)))
        $env:TEST_EXIT_CODE = '7'
        try {
            Assert-Equal '7' "$(Invoke-GitBash -BashPath $bash -ScriptPath $scriptPath)" 'bash exit code'
        } finally {
            Remove-Item Env:\TEST_EXIT_CODE -ErrorAction SilentlyContinue
        }
    }

    Test-Case 'module override paths are validated' {
        $incomplete = Join-Path $tempRoot 'incomplete fork'
        New-Item -ItemType Directory -Path $incomplete -Force | Out-Null
        Assert-Throws { Get-ValdiModuleOverrides $incomplete } 'override path does not exist' 'incomplete fork'
    }

    if ($Integration) {
        Test-Case 'Bazel parses quoted output roots with spaces and non-ASCII' {
            $bazel = if ($BazelPath) { (Resolve-Path -LiteralPath $BazelPath).Path } else { (Get-Command bazel.exe).Source }
            $workspace = Join-Path $tempRoot 'bazel workspace'
            New-Item -ItemType Directory -Path $workspace -Force | Out-Null
            [System.IO.File]::WriteAllText((Join-Path $workspace 'MODULE.bazel'), "module(name = `"test_workspace`")`n")
            $outputBase = Join-Path $tempRoot ('Bazel output ' + $unicodeWord)
            $rcFile = Join-Path $workspace 'parse.bazelrc'
            Write-Utf8NoBomLines -Path $rcFile -Lines @(('startup ' + (ConvertTo-BazelRcOptionValue ('--output_user_root=' + ($outputBase -replace '\\', '/')))))
            Push-Location $workspace
            try {
                & $bazel ('--bazelrc=' + $rcFile) '--nosystem_rc' '--nohome_rc' 'info' 'release' | Out-Null
                Assert-Equal '0' "$LASTEXITCODE" 'bazel info exit code'
                Assert-True (Test-Path -LiteralPath $outputBase -PathType Container) 'Bazel must use the quoted output root'
            } finally {
                & $bazel ('--bazelrc=' + $rcFile) '--nosystem_rc' '--nohome_rc' 'shutdown' 2>&1 | Out-Null
                Pop-Location
            }
        }
    }
} finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host "$($script:Checks - $script:Failures)/$($script:Checks) checks passed"
if ($script:Failures -gt 0) { exit 1 }
exit 0
