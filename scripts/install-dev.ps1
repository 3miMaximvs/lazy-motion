[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$compiledRoot = Join-Path $projectRoot 'dist'
$manifest = Join-Path $compiledRoot 'CSXS\manifest.xml'
if (!(Test-Path -LiteralPath $manifest)) { throw "Compilez le panneau avant de l'installer." }
$extensionParent = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$destination = Join-Path $extensionParent 'dev.lazyapps.motion'
$resolvedDestination = [IO.Path]::GetFullPath($destination)
$expectedDestination = [IO.Path]::GetFullPath((Join-Path $env:APPDATA 'Adobe\CEP\extensions\dev.lazyapps.motion'))
if ($resolvedDestination -ne $expectedDestination) { throw 'Destination inattendue.' }
if (Test-Path -LiteralPath $destination) {
    $existingManifest = Join-Path $destination 'CSXS\manifest.xml'
    if (!(Test-Path -LiteralPath $existingManifest)) { throw 'Dossier existant non reconnu : installation arrêtée.' }
    [xml]$existing = Get-Content -LiteralPath $existingManifest
    if ($existing.ExtensionManifest.ExtensionBundleId -ne 'dev.lazyapps.motion') { throw 'Un autre panneau occupe le dossier.' }
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Get-ChildItem -LiteralPath $compiledRoot -Force | Copy-Item -Destination $destination -Recurse -Force
# Only CEP 12 developer loading, scoped to this Windows user. No AE script/network preference changes.
$registryPath = 'HKCU:\Software\Adobe\CSXS.12'
$backupPath = Join-Path $projectRoot 'artifacts\cep-dev-setting-before-install.json'
if (!(Test-Path -LiteralPath $backupPath)) {
    $previous = Get-ItemProperty -LiteralPath $registryPath -Name PlayerDebugMode -ErrorAction SilentlyContinue
    @{path=$registryPath; existed=($null -ne $previous); value=$previous.PlayerDebugMode} | ConvertTo-Json | Set-Content -LiteralPath $backupPath -Encoding utf8
}
New-Item -Path $registryPath -Force | Out-Null
New-ItemProperty -LiteralPath $registryPath -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
Write-Output ('Panneau de développement installé : ' + $destination)
