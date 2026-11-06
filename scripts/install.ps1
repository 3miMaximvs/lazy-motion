# First installation only. Future updates are installed by the panel itself.
[CmdletBinding()]
param([string]$Archive)
$ErrorActionPreference = 'Stop'
if (!$Archive) {
    $archives = @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter 'lazy-motion-*.zip' -File)
    if ($archives.Count -ne 1) { throw 'Placez ce script à côté d''une seule archive lazy-motion-VERSION.zip.' }
    $Archive = $archives[0].FullName
}
if (Get-Process -Name AfterFX -ErrorAction SilentlyContinue) { throw 'Fermez After Effects avant la première installation.' }
$archivePath = (Resolve-Path -LiteralPath $Archive).Path
$checksumPath = "$archivePath.sha256"
if (!(Test-Path -LiteralPath $checksumPath)) { throw 'Placez aussi le fichier .zip.sha256 à côté de l''archive.' }
$checksum = (Get-Content -LiteralPath $checksumPath -Raw).Trim().Split(' ')[0]
$stream = [IO.File]::OpenRead($archivePath)
$sha = [Security.Cryptography.SHA256]::Create()
try { $actualHash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','') } finally { $stream.Dispose(); $sha.Dispose() }
if ($checksum -notmatch '^[a-fA-F0-9]{64}$' -or $actualHash -ine $checksum) { throw 'La vérification de l''archive a échoué.' }
$parent = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$destination = Join-Path $parent 'dev.lazyapps.motion'
$storage = Join-Path $env:APPDATA 'Adobe\CEP\.lazy-motion-updates'
if (Test-Path -LiteralPath $destination) {
    [xml]$existing = Get-Content -LiteralPath (Join-Path $destination 'CSXS\manifest.xml')
    if ($existing.ExtensionManifest.ExtensionBundleId -cne 'dev.lazyapps.motion') { throw 'Dossier existant non reconnu.' }
}
# Reject redirected installation directories, including parent junctions.
foreach ($installPath in @($destination, $storage)) {
    $cursor = [IO.Path]::GetFullPath($installPath)
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Un lien occupe le chemin d''installation.' }
        }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
}
$job = Join-Path $storage ('install-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $job -Force | Out-Null
# Only use this initial installer with the official archive obtained from GitHub Releases.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    [long]$total = 0
    if ($zip.Entries.Count -gt 2000) { throw 'Archive trop volumineuse.' }
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName.Replace('\','/')
        if (!$name.StartsWith('dev.lazyapps.motion/',[StringComparison]::Ordinal)) { throw 'Archive inattendue.' }
        foreach ($part in $name.TrimEnd('/').Split('/')) {
            if (!$part -or $part -eq '.' -or $part -eq '..' -or $part -match '[<>:"|?*\x00-\x1f]' -or $part -match '[. ]$' -or $part -match '^(?i:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)') { throw 'Chemin d''archive refusé.' }
        }
        $total += $entry.Length
        $kind = (($entry.ExternalAttributes -shr 16) -band 0xF000)
        if ($total -gt 52428800 -or $entry.Length -gt 20971520 -or !$seen.Add($name.TrimEnd('/')) -or ($kind -ne 0 -and $kind -ne 0x8000 -and $kind -ne 0x4000)) { throw 'Archive refusée.' }
    }
} finally { $zip.Dispose() }
Expand-Archive -LiteralPath $archivePath -DestinationPath (Join-Path $job 'unpacked')
$candidate = Join-Path $job 'unpacked\dev.lazyapps.motion'
[xml]$manifest = Get-Content -LiteralPath (Join-Path $candidate 'CSXS\manifest.xml')
if ($manifest.ExtensionManifest.ExtensionBundleId -cne 'dev.lazyapps.motion') { throw 'Panneau non reconnu.' }
New-Item -ItemType Directory -Path $parent -Force | Out-Null
$backup = Join-Path $job 'previous'
# Check resolved paths before moving any directory recursively.
if ([IO.Path]::GetFullPath($destination) -ine [IO.Path]::GetFullPath((Join-Path $env:APPDATA 'Adobe\CEP\extensions\dev.lazyapps.motion')) -or ![IO.Path]::GetFullPath($candidate).StartsWith([IO.Path]::GetFullPath($job) + '\', [StringComparison]::OrdinalIgnoreCase) -or ![IO.Path]::GetFullPath($backup).StartsWith([IO.Path]::GetFullPath($storage) + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Destination de déplacement refusée.' }
$moved = $false
try {
    if (Test-Path -LiteralPath $destination) { Move-Item -LiteralPath $destination -Destination $backup; $moved = $true }
    Move-Item -LiteralPath $candidate -Destination $destination
} catch {
    if ($moved -and !(Test-Path -LiteralPath $destination)) { Move-Item -LiteralPath $backup -Destination $destination }
    throw
}
$registry = 'HKCU:\Software\Adobe\CSXS.12'
$previous = Get-ItemProperty -LiteralPath $registry -Name PlayerDebugMode -ErrorAction SilentlyContinue
@{existed=($null -ne $previous); value=$previous.PlayerDebugMode} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $job 'cep-setting-before.json') -Encoding utf8
New-Item -Path $registry -Force | Out-Null
New-ItemProperty -LiteralPath $registry -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
Write-Output 'Lazy Motion est installé. Ouvrez After Effects > Fenêtre > Extensions > Lazy Motion.'
