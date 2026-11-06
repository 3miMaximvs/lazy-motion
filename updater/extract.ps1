[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Archive, [Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$target = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $target) { throw 'Le dossier de préparation existe déjà.' }
$zip = [IO.Compression.ZipFile]::OpenRead($Archive)
try {
    if ($zip.Entries.Count -lt 1 -or $zip.Entries.Count -gt 2000) { throw 'Nombre de fichiers refusé.' }
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    [long]$total = 0
    # Validate every entry before writing anything. Windows device names, ADS, links,
    # traversal and case-insensitive collisions are forbidden.
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName.Replace('\','/')
        $parts = $name.TrimEnd('/').Split('/')
        if ($parts[0] -cne 'dev.lazyapps.motion') { throw 'Racine de l’archive refusée.' }
        foreach ($part in $parts) {
            if (!$part -or $part -eq '.' -or $part -eq '..' -or $part -match '[<>:"|?*\x00-\x1f]' -or $part -match '[. ]$' -or $part -match '^(?i:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)') { throw 'Nom de fichier refusé.' }
        }
        $resolved = [IO.Path]::GetFullPath((Join-Path $target ($name.Replace('/','\'))))
        if (!$resolved.StartsWith($target + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or !$seen.Add($resolved)) { throw 'Chemin ou doublon refusé.' }
        $kind = (($entry.ExternalAttributes -shr 16) -band 0xF000)
        if ($kind -ne 0 -and $kind -ne 0x8000 -and $kind -ne 0x4000) { throw 'Lien ou fichier spécial refusé.' }
        $total += $entry.Length
        if ($entry.Length -gt 20971520 -or $total -gt 52428800) { throw 'Archive décompressée trop volumineuse.' }
    }
    [IO.Directory]::CreateDirectory($target) | Out-Null
    foreach ($entry in $zip.Entries) {
        $file = Join-Path $target ($entry.FullName.Replace('/','\'))
        if ($entry.FullName.EndsWith('/') -or $entry.FullName.EndsWith('\')) { [IO.Directory]::CreateDirectory($file) | Out-Null; continue }
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file)) | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $file, $false)
    }
} finally { $zip.Dispose() }
