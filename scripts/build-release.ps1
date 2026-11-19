param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\release\industrial-dashboard-offline.zip'),
  [string]$Ref = 'HEAD',
  [string]$ProjectBackup
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$commit = & git -C $projectRoot rev-parse --verify --end-of-options ($Ref + '^{commit}')
if ($LASTEXITCODE -ne 0) { throw "Cannot resolve release ref: $Ref" }

$destination = [IO.Path]::GetFullPath($OutputPath)
$backupSource = $null
if ($ProjectBackup) {
  $backupSource = (Get-Item -LiteralPath $ProjectBackup).FullName
  if ($backupSource -eq $destination) { throw "Output cannot replace the project backup" }
}
$releaseDir = [IO.Path]::GetDirectoryName($destination)
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$temporaryFile = Join-Path $releaseDir ('.industrial-hmi-' + [guid]::NewGuid() + '.zip')
$verificationDir = $null

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
  $archiveOptions = @()
  if ($backupSource) {
    $verificationDir = Join-Path $releaseDir ('.verify-handoff-' + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $verificationDir | Out-Null
    $backupCopy = Join-Path $verificationDir 'project-backup.json'
    Copy-Item -LiteralPath $backupSource -Destination $backupCopy
    $archiveOptions = @('--prefix=handoff/', "--add-file=$backupCopy", '--prefix=')
  }

  & git -C $projectRoot archive --format=zip "--output=$temporaryFile" @archiveOptions $commit -- @paths
  if ($LASTEXITCODE -ne 0) { throw "Cannot archive release commit: $commit" }

  if ($verificationDir) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $unpacked = Join-Path $verificationDir 'package'
    [IO.Compression.ZipFile]::ExtractToDirectory($temporaryFile, $unpacked)
    $verifier = Join-Path $unpacked 'apps/scada-designer/verify-handoff.mjs'
    if (!(Test-Path -LiteralPath $verifier -PathType Leaf)) {
      throw "The requested commit does not include the project handoff verifier"
    }
    & node $verifier
    if ($LASTEXITCODE -ne 0) { throw "Project handoff verification failed" }
  }
  Move-Item -LiteralPath $temporaryFile -Destination $destination -Force
} finally {
  if ($verificationDir -and (Test-Path -LiteralPath $verificationDir -PathType Container)) {
    $resolved = (Resolve-Path -LiteralPath $verificationDir).ProviderPath
    if ($resolved -eq $verificationDir -and [IO.Path]::GetDirectoryName($resolved) -eq $releaseDir) {
      Remove-Item -LiteralPath $resolved -Recurse -Force
    }
  }
  if (Test-Path -LiteralPath $temporaryFile) {
    Remove-Item -LiteralPath $temporaryFile -Force
  }
}

Write-Output "Archive: $destination"
Write-Output "Commit:  $commit"
Write-Output "SHA256:  $((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash)"
