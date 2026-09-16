# Independent rev-5 re-verification run (task t3, verifier).
#
# Runs the implementer's four harness suites AND every independent probe against
# the REAL lib/client.js (vm classic-script sandbox) and lib/index.js (real
# node:http carrier + raw sockets), archiving the raw output under
# verify-independent/_raw/ with an `r5-` prefix (the rev-4 logs are kept as-is).
#
#   powershell -ExecutionPolicy Bypass -File verify-independent/run-r5.ps1
#
# Exit code: 0 when every suite and every probe-7..16 passes. probe-13 is
# EXPECTED to exit non-zero: it records the measurements this sandbox blocks
# (no browser engine, UA stylesheet not stored in the binary).

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$plugin = Split-Path -Parent $here
$raw = Join-Path $here '_raw'
New-Item -ItemType Directory -Force -Path $raw | Out-Null

$devSuites = @('host-half', 'client-half', 'waterfall', 'custom-audio')
$probes = @(
  'probe-7-r4-roster.mjs',
  'probe-8-r4-playback.mjs',
  'probe-9-r4-concurrency.mjs',
  'probe-10-r4-volume.mjs',
  'probe-11-r4-css-rows.mjs',
  'probe-12-r4-injection.mjs',
  'probe-13-r4-browser.mjs',
  'probe-14-r5-http-413.mjs',
  'probe-15-r5-names-files.mjs',
  'probe-16-r5-cap-race.mjs'
)

$failed = @()

Write-Host '=== implementer harness suites (read-only re-run) ==='
foreach ($suite in $devSuites) {
  $test = Join-Path $plugin "verify\$suite.test.mjs"
  $log = Join-Path $raw "r5-dev-$suite.txt"
  & node $test > $log 2>&1
  $code = $LASTEXITCODE
  $summary = (Select-String -Path $log -Pattern '^=== ' | Select-Object -Last 1).Line
  Write-Host ("{0,-22} exit={1} :: {2}" -f $suite, $code, $summary)
  if ($code -ne 0) { $failed += "dev/$suite (exit $code)" }
}

Write-Host ''
Write-Host '=== independent probes ==='
Push-Location $here
foreach ($probe in $probes) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($probe)
  $log = Join-Path $raw "r5-ind-$name.txt"
  & node $probe > $log 2>&1
  $code = $LASTEXITCODE
  $summary = (Select-String -Path $log -Pattern '^### ' | Select-Object -Last 1).Line
  Write-Host ("{0,-32} exit={1} :: {2}" -f $probe, $code, $summary)
  if ($code -ne 0) { $failed += "$probe (exit $code)" }
}
Pop-Location

Write-Host ''
Write-Host '=== summary ==='
if ($failed.Count -eq 0) {
  Write-Host 'every suite and every probe exited 0'
} else {
  Write-Host ('non-zero exits: ' + ($failed -join ', '))
  Write-Host 'probe-13 is EXPECTED to exit non-zero (browser engine + UA stylesheet are unavailable in this sandbox).'
}
