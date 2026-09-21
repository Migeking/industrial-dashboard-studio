param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\release\industrial-dashboard-offline.zip')
)

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$releaseDir = Split-Path -Parent $OutputPath
$staging = Join-Path $releaseDir 'industrial-dashboard-offline'

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
if (Test-Path -LiteralPath $OutputPath) { Remove-Item -LiteralPath $OutputPath -Force }
New-Item -ItemType Directory -Force -Path $staging | Out-Null

foreach ($entry in 'apps', 'assets', 'scenarios', 'packages', 'skills', 'vendor') {
  Copy-Item -LiteralPath (Join-Path $projectRoot $entry) -Destination (Join-Path $staging $entry) -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $staging 'docs') | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\architecture.md') -Destination (Join-Path $staging 'docs\architecture.md') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\offline-delivery.md') -Destination (Join-Path $staging 'docs\offline-delivery.md') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'README.md') -Destination (Join-Path $staging 'README.md') -Force
Get-ChildItem -LiteralPath $staging -Force | Compress-Archive -DestinationPath $OutputPath -CompressionLevel Optimal
Remove-Item -LiteralPath $staging -Recurse -Force
Write-Output "已生成离线交付包：$OutputPath"
