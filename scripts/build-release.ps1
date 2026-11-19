param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\release\industrial-dashboard-offline.zip'),
  [string]$Ref = 'HEAD'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$commit = & git -C $projectRoot rev-parse --verify --end-of-options ($Ref + '^{commit}')
if ($LASTEXITCODE -ne 0) { throw "Cannot resolve release ref: $Ref" }

$destination = [IO.Path]::GetFullPath($OutputPath)
$releaseDir = [IO.Path]::GetDirectoryName($destination)
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$temporaryFile = Join-Path $releaseDir ('.industrial-hmi-' + [guid]::NewGuid() + '.zip')

$paths = @(
  'apps', 'assets', 'packages', 'skills', 'vendor',
  'scenarios/water-treatment', 'scenarios/process-control',
  'scenarios/predictive-maintenance', 'scenarios/reactor-safety',
  'scenarios/building-automation',
  'docs/screenshots', 'docs/acceptance', 'docs/architecture.md', 'docs/offline-delivery.md',
  'README.md', 'README_EN.md', 'LICENSE',
  'tests/studio_monitor_soak.py', 'tests/studio_project_platform_check.py'
)

try {
  & git -C $projectRoot archive --format=zip "--output=$temporaryFile" $commit -- @paths
  if ($LASTEXITCODE -ne 0) { throw "Cannot archive release commit: $commit" }
  Move-Item -LiteralPath $temporaryFile -Destination $destination -Force
} finally {
  if (Test-Path -LiteralPath $temporaryFile) {
    Remove-Item -LiteralPath $temporaryFile -Force
  }
}

Write-Output "Archive: $destination"
Write-Output "Commit:  $commit"
Write-Output "SHA256:  $((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash)"
