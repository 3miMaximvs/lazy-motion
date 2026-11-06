$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pkg = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version = $pkg.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version stable requise.' }
$dist = Join-Path $root 'dist'
$info = Get-Content -LiteralPath (Join-Path $dist 'build-info.json') -Raw | ConvertFrom-Json
if ($info.version -ne $version) { throw 'Reconstruire le panneau avant de créer la release.' }
if ($env:RELEASE_TAG -and $env:RELEASE_TAG -cne "v$version") { throw 'Le tag et la version du panneau diffèrent.' }
$stage = Join-Path $root ('artifacts\package-' + [guid]::NewGuid().ToString('N'))
$bundle = Join-Path $stage 'dev.lazyapps.motion'
New-Item -ItemType Directory -Path $bundle -Force | Out-Null
Get-ChildItem -LiteralPath $dist -Force | Copy-Item -Destination $bundle -Recurse -Force
[IO.File]::WriteAllText((Join-Path $stage 'Installer-Lazy-Motion.ps1'), [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'install.ps1')), [Text.UTF8Encoding]::new($true))
$output = Join-Path $root 'release'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$archive = Join-Path $output "lazy-motion-$version.zip"
# The update archive contains only the panel. The first-install script is a separate asset.
Compress-Archive -LiteralPath $bundle -DestinationPath $archive -Force
$stream = [IO.File]::OpenRead($archive)
$sha = [Security.Cryptography.SHA256]::Create()
try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() } finally { $stream.Dispose(); $sha.Dispose() }
"$hash  lazy-motion-$version.zip" | Set-Content -LiteralPath "$archive.sha256" -Encoding ascii
Copy-Item -LiteralPath (Join-Path $stage 'Installer-Lazy-Motion.ps1') -Destination (Join-Path $output 'Installer-Lazy-Motion.ps1') -Force
Write-Output "Release créée : $archive"
