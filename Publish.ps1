param(
    [string]$DotNet = 'dotnet',
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'dist\portable')
)

$ErrorActionPreference = 'Stop'

$project = Join-Path $PSScriptRoot 'Vizuil.csproj'
$dist = Join-Path $PSScriptRoot 'dist'
$portable = Join-Path $dist 'portable'
$output = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)
$stage = Join-Path $dist ('.portable-publish-' + [Guid]::NewGuid().ToString('N'))
$executable = Join-Path $portable 'Vizuil.exe'
$candidate = Join-Path $stage 'Vizuil.exe'
$previous = Join-Path $stage 'Vizuil.previous.exe'
$readme = Join-Path $portable 'README.md'
$stagedReadme = Join-Path $stage 'README.md'

$publishLock = [Threading.Mutex]::new($false, 'Local\Vizuil.PortablePublish')
$lockHeld = $false
$installed = $false
try {
    try { $lockHeld = $publishLock.WaitOne() }
    catch [Threading.AbandonedMutexException] { $lockHeld = $true }

    [IO.Directory]::CreateDirectory($stage) | Out-Null
    & $DotNet publish $project -c Release -r win-x64 --self-contained true `
        -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
        -p:DebugType=None -o $stage
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not update Vizuil. See the build error above.'
    }
    if ((Get-Item -LiteralPath $candidate).Length -le 0) {
        throw 'The Vizuil build produced an empty executable.'
    }
    $expectedHash = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README.md') -Destination $stagedReadme

    [IO.Directory]::CreateDirectory($portable) | Out-Null
    $candidateMoved = $false
    try {
        # A running process can keep using the renamed executable until it exits.
        if ([IO.File]::Exists($executable)) { [IO.File]::Move($executable, $previous) }
        [IO.File]::Move($candidate, $executable)
        $candidateMoved = $true
        if ((Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash -ne $expectedHash) {
            throw 'The installed executable does not match the build.'
        }
        if ([IO.File]::Exists($readme)) {
            [IO.File]::Replace($stagedReadme, $readme, (Join-Path $stage 'README.previous.md'))
        } else {
            [IO.File]::Move($stagedReadme, $readme)
        }
        $installed = $true
    } catch {
        $installError = $_
        try {
            if ($candidateMoved) { [IO.File]::Move($executable, $candidate) }
            if ([IO.File]::Exists($previous)) { [IO.File]::Move($previous, $executable) }
        } catch {
            throw "Install failed ($installError). Rollback also failed ($_). Recovery files are in '$stage'."
        }
        throw $installError
    }

    if ($output.TrimEnd('\') -ne $portable) {
        [IO.Directory]::CreateDirectory($output) | Out-Null
        Copy-Item -LiteralPath $executable, $readme -Destination $output -Force
        Write-Host "Also copied the build to $output"
    }

    Write-Host "Verified and ready to run: $executable"
} finally {
    try {
        if (($installed -or ![IO.File]::Exists($previous)) -and (Test-Path -LiteralPath $stage)) {
            $resolvedStage = (Resolve-Path -LiteralPath $stage).ProviderPath
            $resolvedDist = (Resolve-Path -LiteralPath $dist).ProviderPath
            if ((Split-Path -Parent $resolvedStage) -ne $resolvedDist) {
                throw 'The staging folder is outside the distribution folder.'
            }
            Remove-Item -LiteralPath $resolvedStage -Recurse -Force
        }
    } catch {
        Write-Warning "Could not remove the staging folder '$stage'. $_"
    } finally {
        if ($lockHeld) { $publishLock.ReleaseMutex() }
        $publishLock.Dispose()
    }
}
