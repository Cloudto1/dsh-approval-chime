# Independent rev-6 re-verification run (task t5, verifier).
#
# Narrow re-check of rev-6 (N3 case closure + R-RESID blank-name fallback), run as
# a FULL regression so nothing else moved:
#   - the four implementer harness suites (read-only re-run),
#   - every independent probe of mine (probe-7 .. probe-16),
#   - the reviewer's own probes from .scratch/reviewer-r5/.
#
# Raw output is archived under verify-independent/_raw/ with an `r6-` prefix; the
# rev-4 (`ind-probe-*-r4-*`) and rev-5 (`r5-*`) archives are never overwritten.
#
#   powershell -ExecutionPolicy Bypass -File verify-independent/run-r6.ps1
#
# probe-13 is EXPECTED to exit non-zero: it records the measurements this sandbox
# blocks (no browser engine; the UA stylesheet is not stored in the binary).

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$plugin = Split-Path -Parent $here
$workspace = Split-Path -Parent $plugin
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
$reviewerProbes = @(
  @{ name = 'reqcheck-rev5.mjs'; path = Join-Path $workspace '.scratch\reviewer-r5\reqcheck-rev5.mjs' },
  @{ name = 'reqcheck-host-413.mjs'; path = Join-Path $workspace '.scratch\reviewer-r5\reqcheck-host-413.mjs' },
  @{ name = 'reqcheck.mjs'; path = Join-Path $workspace '.scratch\reviewer-r5\reqcheck.mjs' }
)

$failed = @()

$audioDir = Join-Path $plugin 'audio'
function Get-AudioListing {
  if (-not (Test-Path $audioDir)) { return @() }
  return @(Get-ChildItem $audioDir -Force -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
}

Write-Host '=== preflight: audio/ is SHARED MUTABLE STATE between suites and probes ==='
Write-Host 'verify/custom-audio.test.mjs asserts that directory is EMPTY at the end, so any file left'
Write-Host 'by another tool makes that suite report 69/70 for a reason outside the plugin itself.'
$preflight = Get-AudioListing
Write-Host ("audio/ before the run: {0} file(s) {1}" -f $preflight.Count, ($preflight -join ', '))
if ($preflight.Count -ne 0) {
  Write-Host 'WARNING: the directory is not empty; custom-audio will likely fail its hygiene check.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '=== implementer harness suites (read-only re-run) ==='
foreach ($suite in $devSuites) {
  $test = Join-Path $plugin "verify\$suite.test.mjs"
  $log = Join-Path $raw "r6-dev-$suite.txt"
  & node $test > $log 2>&1
  $code = $LASTEXITCODE
  $summary = (Select-String -Path $log -Pattern '^=== ' | Select-Object -Last 1).Line
  Write-Host ("{0,-22} exit={1} :: {2}" -f $suite, $code, $summary)
  if ($code -ne 0) { $failed += "dev/$suite (exit $code)" }
}
$afterDev = Get-AudioListing
Write-Host ("audio/ after the suites: {0} file(s) {1}" -f $afterDev.Count, ($afterDev -join ', '))

Write-Host ''
Write-Host '=== independent probes ==='
Push-Location $here
foreach ($probe in $probes) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($probe)
  $log = Join-Path $raw "r6-ind-$name.txt"
  & node $probe > $log 2>&1
  $code = $LASTEXITCODE
  $summary = (Select-String -Path $log -Pattern '^### ' | Select-Object -Last 1).Line
  Write-Host ("{0,-32} exit={1} :: {2}" -f $probe, $code, $summary)
  if ($code -ne 0) { $failed += "$probe (exit $code)" }
}
Pop-Location

Write-Host ''
Write-Host '=== reviewer probes (read-only re-run; cwd = workspace root, which they resolve paths against) ==='
Push-Location $workspace
foreach ($probe in $reviewerProbes) {
  $log = Join-Path $raw ("r6-reviewer-" + $probe.name.Replace('.mjs', '') + ".txt")
  if (-not (Test-Path $probe.path)) {
    Write-Host ("{0,-24} SKIPPED (not found at {1})" -f $probe.name, $probe.path)
    continue
  }
  & node $probe.path > $log 2>&1
  $code = $LASTEXITCODE
  $summary = (Select-String -Path $log -Pattern '^### ' | Select-Object -Last 1).Line
  Write-Host ("{0,-24} exit={1} :: {2}" -f $probe.name, $code, $summary)
  if ($code -ne 0) { $failed += ("reviewer/" + $probe.name + " (exit $code)") }
}
Pop-Location
$afterReviewer = Get-AudioListing
Write-Host ("audio/ after the reviewer probes: {0} file(s) {1}" -f $afterReviewer.Count, ($afterReviewer -join ', '))

Write-Host ''
Write-Host '=== summary ==='
if ($failed.Count -eq 0) {
  Write-Host 'every suite and every probe exited 0'
} else {
  Write-Host ('non-zero exits: ' + ($failed -join ', '))
  Write-Host 'probe-13 is EXPECTED to exit non-zero (no browser engine / no UA stylesheet in this sandbox).'
  Write-Host 'reqcheck.mjs is the reviewer''s PRE-rev-5 probe: its picker-box expectations are stale by design.'
}
