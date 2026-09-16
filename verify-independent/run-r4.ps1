# Independent rev-4 verification run (task t1, verifier).
#
# Runs every independent probe against the REAL lib/client.js (vm classic-script
# sandbox + stub platform services) and against the REAL lib/index.js (route
# handler), and archives the raw output under verify-independent/_raw/.
#
#   pwsh -File verify-independent/run-r4.ps1
#
# Exit code: 0 when probes 7-12 all pass; probe-13 is expected to exit non-zero,
# because it reports what the sandbox made impossible to measure (no browser).

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$raw = Join-Path $here '_raw'
New-Item -ItemType Directory -Force -Path $raw | Out-Null

$probes = @(
  'probe-7-r4-roster.mjs',
  'probe-8-r4-playback.mjs',
  'probe-9-r4-concurrency.mjs',
  'probe-10-r4-volume.mjs',
  'probe-11-r4-css-rows.mjs',
  'probe-12-r4-injection.mjs',
  'probe-13-r4-browser.mjs'
)

$failed = @()
foreach ($probe in $probes) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($probe)
  $log = Join-Path $raw "ind-$name.txt"
  Write-Host "`n=== $probe ===" -ForegroundColor Cyan
  Push-Location $here
  & node $probe *>&1 | Tee-Object -FilePath $log
  $code = $LASTEXITCODE
  Pop-Location
  Write-Host "--- exit code: $code (raw log: $log)"
  if ($code -ne 0) { $failed += "$probe (exit $code)" }
}

Write-Host "`n=== summary ==="
if ($failed.Count -eq 0) {
  Write-Host 'all probes exited 0'
} else {
  Write-Host ('non-zero exits: ' + ($failed -join ', '))
  Write-Host 'probe-13 is EXPECTED to exit non-zero: it records the browser/UA measurements this sandbox blocks.'
}
