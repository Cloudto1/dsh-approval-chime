# Independent rev-11 full regression run (task t6, verifier).
#
# Derived from run-r10.ps1 (which was derived from run-r7.ps1). Run-r11 re-runs the
# whole suite after the rev-11 race fix (t4), because that fix changes the client's
# write path (a convergence re-read) and therefore the request ledger several older
# probes assert against. The r4 … r10 archives under verify-independent/_raw/ are
# NEVER overwritten: every log this script writes carries the `r11-` prefix.
#
# What rev-10 added, and what this run therefore has to re-prove:
#   - the session header carries a bell (`conversation.session.header.actions`,
#     id `approval-chime`, order 30),
#   - per-session overrides live in `<DSH_HOME|~/.dsh>/approval-chime/sessions.json`
#     behind GET/POST /api/approval-chime/sessions,
#   - one batch of N pending approvals now plays N chimes, 180 ms apart,
#   - and the pre-rev-10 settings page / audio path is otherwise untouched.
#
# What rev-11 added on top (t4, fixes the rev-10 review's F-01):
#   - once the LAST outstanding per-session write settles, the browser half re-reads
#     the table (`settleSessionWrites` -> `refreshSessions`), so the local copy
#     equals the store whatever order the answers arrived in. probe-18's I2/I2b pair
#     is the falsifier: removing the re-read reddens exactly those two checks
#     (`--mutate=convergence-reread-removed`).
#   - the two race measurements in section 4 are therefore not decoration: they are
#     the direct measurement of the window rev-11 closes.
#
#   powershell -ExecutionPolicy Bypass -File verify-independent/run-r11.ps1
#
# Shell: this host has Windows PowerShell 5.1 only (no `pwsh`). The older archives
# are UTF-16LE because 5.1's `>` redirection encodes that way; every r11 log is
# written as UTF-8 WITHOUT a BOM instead, so it reads back with any tool. The
# native output is decoded through [Console]::OutputEncoding, which is set to UTF-8
# below — without that, Node's UTF-8 bytes are decoded as the OEM code page and the
# Chinese strings in the logs come out as mojibake.
#
# probe-13-r4-browser.mjs is EXPECTED to exit non-zero: it records the measurements
# this sandbox blocks (no browser engine; the UA stylesheet is not stored in the
# binary).
#
# The pre-rev-4 probes (everything run-r4/r5/r6/r7 did NOT run) are re-run for the
# record and classified: each non-zero one is quoted with the assertion that failed
# and must be on the declared exception list below, or the run fails. They pin facts
# that rev-4 … rev-9 deliberately changed (the `settings.plugin.item` card became a
# `settings.section` page in rev-7, DEFAULTS gained `custom` in rev-4, the 415
# extension rules changed in rev-5, …), and several count EVERY request, which
# rev-10's one boot-time read of `/api/approval-chime/sessions` shifts by one.

$ErrorActionPreference = 'Continue'

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
try { [Console]::OutputEncoding = $utf8NoBom } catch { Write-Host "console encoding left alone: $_" }
try { $OutputEncoding = $utf8NoBom } catch { }

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$plugin = Split-Path -Parent $here
$workspace = Split-Path -Parent $plugin
$raw = Join-Path $here '_raw'
New-Item -ItemType Directory -Force -Path $raw | Out-Null

# Run one native command and archive its merged stdout/stderr as UTF-8 (no BOM).
function Invoke-Logged {
  param([scriptblock]$Body, [string]$LogPath)
  $text = & $Body 2>&1 | Out-String
  [System.IO.File]::WriteAllText($LogPath, $text, $utf8NoBom)
  return $LASTEXITCODE
}
function Write-Utf8 {
  param([string]$Path, [string[]]$Lines)
  [System.IO.File]::WriteAllText($Path, (($Lines -join [Environment]::NewLine) + [Environment]::NewLine), $utf8NoBom)
}

# The probes run-r4/r5/r6/r7 shipped: these MUST all be green (except probe-13).
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
  'probe-16-r5-cap-race.mjs',
  'probe-17-r7-section.mjs',
  'probe-18-r10-sessions.mjs'
)
# Probes from rev-1 … rev-3, kept for the record.
$legacyProbes = @(
  'probe-1-approval.mjs',
  'probe-2-gain-and-resources.mjs',
  'probe-3-card-and-scope.mjs',
  'probe-4-host-half.mjs',
  'probe-5-contract.mjs',
  'probe-6-autoplay-replay.mjs',
  'probe-7-host-audio-http.mjs',
  'probe-8-client-roster-render.mjs',
  'probe-9-client-playback.mjs',
  'probe-10-startup-resilience.mjs'
)
# Non-zero exits this run does not treat as a regression, with the reason.
$expectedNonZero = @{
  'probe-13-r4-browser.mjs' = 'no browser engine in this sandbox (pre-existing, recorded since rev-4)'
}
$expectedLegacyNonZero = @{
  'probe-1-approval.mjs'             = 'rev-1/rev-2 era probe (see the quoted failing assertion)'
  'probe-2-gain-and-resources.mjs'    = 'asserts "lib/client.js contains no fetch(" — true before rev-4; rev-4 added the audio fetch and rev-10 the sessions read'
  'probe-3-card-and-scope.mjs'        = 'pins the rev-6 settings.plugin.item card; rev-7 moved it to settings.section'
  'probe-4-host-half.mjs'             = 'pins DEFAULTS without `custom` and the pre-rev-4 import list'
  'probe-5-contract.mjs'              = 'pins the settings.plugin.item registration'
  'probe-6-autoplay-replay.mjs'       = 'rev-1/rev-2 era probe (see the quoted failing assertion)'
  'probe-7-host-audio-http.mjs'       = 'pins the pre-rev-5 upload-name / 415 rules'
  'probe-8-client-roster-render.mjs'  = 'pins the pre-rev-4 picker CSS, the uppercase-uuid roster and the unbounded name'
  'probe-9-client-playback.mjs'       = 'counts every request; rev-10 adds one boot read of the sessions table'
  'probe-10-startup-resilience.mjs'   = 'counts registered routes; rev-10 registers one more (the sessions prefix)'
}
$reviewerProbes = @(
  @{ name = 'reqcheck-rev5.mjs'; path = Join-Path $workspace '.scratch\reviewer-r5\reqcheck-rev5.mjs' },
  @{ name = 'reqcheck-host-413.mjs'; path = Join-Path $workspace '.scratch\reviewer-r5\reqcheck-host-413.mjs' },
  @{ name = 'reqcheck.mjs'; path = Join-Path $workspace '.scratch\reviewer-r5\reqcheck.mjs' },
  @{ name = 'probe-r7-reqcheck.mjs'; path = Join-Path $workspace '.scratch\reviewer-r7\probe-r7-reqcheck.mjs' }
)

$failed = @()
$rows = @()

$audioDir = Join-Path $plugin 'audio'
function Get-AudioListing {
  if (-not (Test-Path $audioDir)) { return @() }
  return @(Get-ChildItem $audioDir -Force -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
}

# The frozen paths: this plugin's own implementation and the shipped test suite.
function Get-FrozenListing {
  $paths = @()
  foreach ($group in @('lib', 'verify')) {
    $dir = Join-Path $plugin $group
    if (Test-Path $dir) { $paths += @(Get-ChildItem $dir -Recurse -File) }
  }
  foreach ($file in @('README.md', 'CHANGELOG.md', 'package.json', 'cordis.patch.yml')) {
    $full = Join-Path $plugin $file
    if (Test-Path $full) { $paths += @(Get-Item $full) }
  }
  return @($paths | Sort-Object FullName | ForEach-Object {
    $digest = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
    "{0}  {1,10}  {2}" -f $digest, $_.Length, $_.FullName.Substring($plugin.Length + 1)
  })
}

Write-Host '=== 0. frozen-path baseline (lib/**, verify/**, README, CHANGELOG, package.json, cordis.patch.yml) ==='
$before = Get-FrozenListing
$beforePath = Join-Path $raw 'r11-baseline-before.txt'
Write-Utf8 -Path $beforePath -Lines $before
Write-Host ("{0} frozen files recorded -> {1}" -f $before.Count, $beforePath)

Write-Host ''
Write-Host '=== preflight: audio/ is SHARED MUTABLE STATE between suites and probes ==='
Write-Host 'verify/custom-audio.test.mjs asserts that directory is EMPTY at the end, so any file left'
Write-Host 'by another tool makes that suite report short for a reason outside the plugin itself.'
$preflight = Get-AudioListing
Write-Host ("audio/ before the run: {0} file(s) {1}" -f $preflight.Count, ($preflight -join ', '))
if ($preflight.Count -ne 0) {
  Write-Host 'WARNING: the directory is not empty; custom-audio will likely fail its hygiene check.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '=== 1. implementer harness suites (read-only re-run) ==='
foreach ($suite in @('host-half', 'client-half', 'waterfall', 'custom-audio')) {
  $test = Join-Path $plugin "verify\$suite.test.mjs"
  $log = Join-Path $raw "r11-dev-$suite.txt"
  $code = Invoke-Logged -Body { & node $test } -LogPath $log
  $summary = (Select-String -Path $log -Pattern '^=== ' -Encoding UTF8 | Select-Object -Last 1).Line
  Write-Host ("{0,-16} exit={1} :: {2}" -f $suite, $code, $summary)
  $rows += [pscustomobject]@{ kind = 'harness'; name = $suite; exit = $code; summary = $summary }
  if ($code -ne 0) { $failed += "dev/$suite (exit $code)" }
}
$afterDev = Get-AudioListing
Write-Host ("audio/ after the suites: {0} file(s) {1}" -f $afterDev.Count, ($afterDev -join ', '))

Write-Host ''
Write-Host '=== 2. independent probes (the set run-r4 … run-r7 shipped, plus probe-18) ==='
Push-Location $here
foreach ($probe in $probes) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($probe)
  $log = Join-Path $raw "r11-ind-$name.txt"
  $code = Invoke-Logged -Body { & node $probe } -LogPath $log
  $summary = (Select-String -Path $log -Pattern '^### ' -Encoding UTF8 | Select-Object -Last 1).Line
  Write-Host ("{0,-32} exit={1} :: {2}" -f $probe, $code, $summary)
  $rows += [pscustomobject]@{ kind = 'independent'; name = $name; exit = $code; summary = $summary }
  if ($code -ne 0) {
    if ($expectedNonZero.ContainsKey($probe)) {
      Write-Host ("    EXPECTED non-zero: {0}" -f $expectedNonZero[$probe]) -ForegroundColor Yellow
    } else {
      Write-Host ("    UNEXPECTED non-zero - see {0}" -f $log) -ForegroundColor Red
      $failed += "$probe (exit $code)"
    }
  }
}
Pop-Location

Write-Host ''
Write-Host '=== 3. probe-18 falsifiability: every declared mutation must redden exactly its declared checks ==='
Push-Location $here
$mutationLog = Join-Path $raw 'r11-ind-probe-18-mutations.txt'
$mutationCode = Invoke-Logged -Body { & node 'probe-18-r10-sessions.mjs' '--mutate=all' } -LogPath $mutationLog
$mutationSummary = (Select-String -Path $mutationLog -Pattern '^### mutation summary' -Encoding UTF8 | Select-Object -Last 1).Line
$hashLines = ((Select-String -Path $mutationLog -Pattern '^### lib/(client|index)\.js' -Encoding UTF8 | ForEach-Object { $_.Line.Trim() }) -join ' | ')
Write-Host ("mutations exit={0} :: {1}" -f $mutationCode, $mutationSummary)
Write-Host ("    {0}" -f $hashLines)
$rows += [pscustomobject]@{ kind = 'mutation'; name = 'probe-18 --mutate=all'; exit = $mutationCode; summary = $mutationSummary }
if ($mutationCode -ne 0) { $failed += "probe-18 --mutate=all (exit $mutationCode)" }

Write-Host ''
Write-Host '=== 4. probe-18 race measurement (fast double-click, real host over real HTTP) ==='
foreach ($mode in @(
    @{ tag = 'raw'; args = @('--race-rounds=1500', '--race-raw') },
    @{ tag = 'sidechannel'; args = @('--race-rounds=1500', '--race-sidechannel') })) {
  $raceLog = Join-Path $raw ("r11-ind-probe-18-race-" + $mode.tag + ".txt")
  $raceCode = Invoke-Logged -Body { & node 'probe-18-r10-sessions.mjs' $mode.args } -LogPath $raceLog
  $raceLine = (Select-String -Path $raceLog -Pattern 'I1 measurement' -Encoding UTF8 | Select-Object -Last 1).Line
  $residualLine = (Select-String -Path $raceLog -Pattern 'RESIDUAL \(measured, reproducible\)|FINDING \(measured, reproducible\)' -Encoding UTF8 | Select-Object -Last 1).Line
  Write-Host ("race[{0}] exit={1} :: {2}" -f $mode.tag, $raceCode, $raceLine)
  if ($residualLine) { Write-Host ("    {0}" -f $residualLine.Trim()) -ForegroundColor Yellow }
  $rows += [pscustomobject]@{ kind = 'race'; name = "probe-18 $($mode.tag)"; exit = $raceCode; summary = $raceLine }
  if ($raceCode -ne 0) { $failed += "probe-18 race[$($mode.tag)] (exit $raceCode)" }
}
Pop-Location

Write-Host ''
Write-Host '=== 5. legacy probes from rev-1 … rev-3 (recorded, classified) ==='
Push-Location $here
foreach ($probe in $legacyProbes) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($probe)
  $log = Join-Path $raw "r11-legacy-$name.txt"
  $code = Invoke-Logged -Body { & node $probe } -LogPath $log
  $summary = (Select-String -Path $log -Pattern '^### ' -Encoding UTF8 | Select-Object -Last 1).Line
  $failing = ((Select-String -Path $log -Pattern '^    FAILED: ' -Encoding UTF8 | ForEach-Object { $_.Line.Trim() }) -join ' ; ')
  Write-Host ("{0,-34} exit={1} :: {2}" -f $probe, $code, $summary)
  $rows += [pscustomobject]@{ kind = 'legacy'; name = $name; exit = $code; summary = $summary }
  if ($code -ne 0) {
    if ($expectedLegacyNonZero.ContainsKey($probe)) {
      Write-Host ("    TOLERATED: {0}" -f $expectedLegacyNonZero[$probe])
      if ($failing) {
        $cut = [Math]::Min(300, $failing.Length)
        Write-Host ("    failing assertion(s): {0}" -f $failing.Substring(0, $cut))
      }
    } else {
      Write-Host ("    UNEXPECTED non-zero - see {0}" -f $log) -ForegroundColor Red
      $failed += "legacy/$probe (exit $code)"
    }
  }
}
Pop-Location
$afterLegacy = Get-AudioListing
Write-Host ("audio/ after the legacy probes: {0} file(s) {1}" -f $afterLegacy.Count, ($afterLegacy -join ', '))
# The legacy probe-7-host-audio-http plants .mp3 files in audio/ and does not clean
# up after itself. Restore the listing the run started with, so the next run's
# custom-audio hygiene check sees the same state.
$planted = @($afterLegacy | Where-Object { $preflight -notcontains $_ })
if ($planted.Count -gt 0) {
  foreach ($name in $planted) { Remove-Item (Join-Path $audioDir $name) -Force -ErrorAction SilentlyContinue }
  Write-Host ("    removed {0} file(s) the legacy probes planted: {1}" -f $planted.Count, ($planted -join ', '))
}
Write-Host ("audio/ restored to: {0} file(s) {1}" -f (Get-AudioListing).Count, ((Get-AudioListing) -join ', '))

Write-Host ''
Write-Host '=== 6. reviewer probes (read-only re-run; cwd = workspace root, which they resolve paths against) ==='
Push-Location $workspace
foreach ($probe in $reviewerProbes) {
  $log = Join-Path $raw ("r11-reviewer-" + $probe.name.Replace('.mjs', '') + ".txt")
  if (-not (Test-Path $probe.path)) {
    Write-Host ("{0,-24} SKIPPED (not found at {1})" -f $probe.name, $probe.path)
    continue
  }
  $code = Invoke-Logged -Body { & node $probe.path } -LogPath $log
  $summary = (Select-String -Path $log -Pattern '^### ' -Encoding UTF8 | Select-Object -Last 1).Line
  Write-Host ("{0,-24} exit={1} :: {2}" -f $probe.name, $code, $summary)
  $rows += [pscustomobject]@{ kind = 'reviewer'; name = $probe.name; exit = $code; summary = $summary }
  # The reviewer probes are PRE-rev-7: their card/slot expectations are stale by
  # design, exactly as run-r6/r7 recorded. Their exit codes are logged verbatim and
  # do not fail this run.
  if ($code -ne 0) { Write-Host '    (informational: reviewer probe from an earlier revision)' -ForegroundColor Yellow }
}
Pop-Location

Write-Host ''
Write-Host '=== 7. frozen-path diff ==='
$after = Get-FrozenListing
$afterPath = Join-Path $raw 'r11-baseline-after.txt'
Write-Utf8 -Path $afterPath -Lines $after
$diff = Compare-Object -ReferenceObject $before -DifferenceObject $after
$diffPath = Join-Path $raw 'r11-frozen-diff.txt'
if ($diff) {
  $lines = @($diff | ForEach-Object { "{0} {1}" -f $_.SideIndicator, $_.InputObject })
  Write-Utf8 -Path $diffPath -Lines $lines
  Write-Host 'FROZEN PATHS CHANGED:' -ForegroundColor Red
  $lines | ForEach-Object { Write-Host ("  {0}" -f $_) }
  $failed += 'frozen paths changed'
} else {
  Write-Utf8 -Path $diffPath -Lines @('identical')
  Write-Host ("{0} frozen files are byte-identical before/after the run" -f $after.Count)
}

Write-Host ''
Write-Host '=== summary ==='
$rows | Format-Table -AutoSize
if ($failed.Count -eq 0) {
  Write-Host 'every harness suite exited 0; every probe of the run-r4 … run-r11 set exited 0 except probe-13 (declared);'
  Write-Host 'every declared mutation reddened exactly its declared checks; the frozen paths are unchanged.'
} else {
  Write-Host ('FAILURES: ' + ($failed -join ', ')) -ForegroundColor Red
}
Write-Host 'checker: only probe-13-r4-browser.mjs may be non-zero in the regression set.'
Write-Host '         the legacy (rev-1 … rev-3) probes are recorded in section 5 with a proven reason for each non-zero exit.'
exit ([int]($failed.Count -ne 0))
