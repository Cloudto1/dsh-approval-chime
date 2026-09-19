# Independent rev-12 full regression run (task t6, verifier).
#
# Derived from run-r11.ps1 (which was derived from run-r10.ps1 -> run-r7.ps1). Same
# structure, same exception discipline, same UTF-8-without-BOM logging. Every log this
# script writes carries the `r12b-` prefix; the r4 ... r11 archives under
# verify-independent/_raw/ are NEVER overwritten.
#
# What rev-12 changed, and why this run exists:
#   - CLIENT-ONLY change to the tone dropdowns. Before rev-12 only the settings card's
#     <select> opted into `appearance: base-select`; the per-session bell popover's
#     <select> got colours only and therefore rendered the user agent's square grey list.
#     rev-12 puts BOTH lists through ONE shared `::picker(select)` rule, so the two can
#     differ only in the row cap:
#       * both selects get `appearance:base-select` (one selector list, two subjects),
#       * one shared box rule carries every non-max-height declaration for both lists,
#       * `.dacCard select::picker(select){max-height:84px}` (exactly three rows) and
#         `.dacPop select::picker(select){max-height:120px}` (four default rows + 8px
#         slack) are the only per-list declarations left,
#       * one shared option-row rule (radius 7 / padding 4px 9px / line-height 20px) and
#         one shared :hover,:checked highlight rule name both lists,
#       * both lists state `font-size:13px` themselves, so the popover's 12px panel does
#         not shrink its menu,
#       * the pre-rev-12 `.dacPop select option{...}` colour copy was deleted, because the
#         fallback rule now names both selects in one selector list.
#   - lib/index.js is UNCHANGED and must stay byte-identical to rev-11
#     (46638 B / 03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938).
#   - new probe verify-independent/probe-19-r12-select-parity.mjs re-derives that claim
#     from the shipped bytes: it boots the real bundle, takes the injected <style>, reads
#     the two <select> elements out of the REAL rendered React trees, parses the CSS and
#     resolves the cascade for each list, then compares the two property maps. It is the
#     direct falsifier for "one design by construction" and it costs 65 assertions.
#
# What this run is EXPECTED to report as red, and why that is not a regression:
#   - probe-13-r4-browser.mjs (as since rev-4): no browser engine in this sandbox.
#   - probe-17-r7-section.mjs: rev-12 legitimately invalidated three of its assertions,
#     because they hard-code the PRE-rev-12 CSS SHAPE (one single `::picker(select){...}`
#     block that carries `box-sizing:content-box` and `max-height:84px` together, and an
#     option rule whose text starts with `.dacCard select option{`). rev-12 splits that
#     block on purpose, so the three expectations are stale BY DESIGN -- but they are not
#     fingerprint literals, and this task's instructions were explicit: bump ONLY the byte
#     count / sha256 / revision-stamp literals in probe-17 and EXPECTED_REVISION in
#     probe-18, and REPORT anything else.
#   - probe-11-r4-css-rows.mjs: green in r10/r11, CRASHED under rev-12 -- its `pickerRule`
#     was "the LAST rule inside @supports whose selector mentions ::picker(select)", which in
#     rev-12 is the popover's cap rule, so appearance / box-sizing / overflow / padding /
#     border all read null, `max-height` read 120px instead of 84px, and line 144 threw on
#     `pickerPadding[0]`.
#
# r12b (t2 repair round, captain's decision "fix, do not tolerate"). Both files are repaired
# and this run has NO new exception entries:
#   - probe-11: the lookup now CASCADES over every rule whose selector list names
#     `.dacCard select::picker(select)` (shared box rule + card-only cap rule), the same
#     (specificity, written-order) resolution probe-19 uses; every existing assertion kept its
#     subject and its expected value; an "in the SAME rule as max-height" phrasing is gone
#     because that co-location is exactly what rev-12 removed; every derived number is
#     null-safe, so a future re-split reports FAIL instead of an uncaught TypeError; one new
#     cross-check asserts the popover list is styled by the SAME shared rule. 31 -> 32 checks,
#     plus a `--mutate=card-cap-92px` falsifier (section 2c).
#   - probe-17: the three assertions that hard-coded the pre-rev-12 CSS SHAPE now resolve the
#     card list's declarations instead (subject and expected values unchanged, and one of them
#     is now STRONGER: it compares the resolved max-height to 3 x 28 instead of re-asserting a
#     constant). `--mutate=picker` is re-anchored to the card cap rule that exists in rev-12
#     and is live again. Two PRE-EXISTING defects in `--mutate=slot` were found and fixed while
#     doing this: its two-line anchor carried a bare `\n` while this worktree checks
#     `lib/client.js` out as CRLF (`git ls-files --eol`: `i/lf w/crlf`), and its `once` helper
#     sliced the ORIGINAL source on every call, so of three substitutions only the last one
#     survived. All five of probe-17's mutations now rewrite the source and catch exactly
#     their declared checks.
#
# ENVIRONMENT HAZARD observed during this round (see the archived run-1 logs):
#   run 1 ended with `FROZEN PATHS CHANGED: lib/client.js 142286 B / 375BEA07...` (expected
#   142330 B / 777E8796...). The captain confirmed it was his own mutate/restore experiment on
#   `lib/client.js` while run 1 was executing, and that verify/client-half.test.mjs, README.md,
#   CHANGELOG.md and docs/ were being rewritten in the same window -- i.e. run 1 is NOT a clean
#   frozen-input run. Its logs are kept as `r12-run1-CONCURRENT-WRITE-*.txt`. This script's
#   baseline-before/baseline-after pair is what makes such a window visible; treat any
#   non-`identical` frozen diff as a tainted run.
#
#   powershell -ExecutionPolicy Bypass -File verify-independent/run-r12.ps1
#
# Shell: this host has Windows PowerShell 5.1 only (no `pwsh`). The older archives are
# UTF-16LE because 5.1's `>` redirection encodes that way; every log is written as
# UTF-8 WITHOUT a BOM instead, so it reads back with any tool. The native output is
# decoded through [Console]::OutputEncoding, which is set to UTF-8 below -- without that,
# Node's UTF-8 bytes are decoded as the OEM code page and the Chinese strings in the logs
# come out as mojibake. This script is ASCII-only on purpose (run-r11 contained U+2026
# ellipses, which 5.1 mis-decodes when it reads a BOM-less file as ANSI).
#
# The pre-rev-4 probes (everything run-r4/r5/r6/r7 did NOT run) are re-run for the record
# and classified: each non-zero one is quoted with the assertion that failed and must be on
# the declared exception list below, or the run fails. They pin facts that rev-4 ... rev-11
# deliberately changed (the `settings.plugin.item` card became a `settings.section` page in
# rev-7, DEFAULTS gained `custom` in rev-4, the 415 extension rules changed in rev-5, ...),
# and several count EVERY request, which rev-10's one boot-time read of
# `/api/approval-chime/sessions` shifts by one.

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
function Get-FailedAssertions {
  param([string]$LogPath)
  return @(Select-String -Path $LogPath -Pattern '^    FAILED: ' -Encoding UTF8 | ForEach-Object { $_.Line.Substring('    FAILED: '.Length).Trim() })
}

# The probes run-r4/r5/r6/r7 shipped, plus the rev-12 parity probe.
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
  'probe-18-r10-sessions.mjs',
  'probe-19-r12-select-parity.mjs'
)
# Probes from rev-1 ... rev-3, kept for the record.
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
# r12b: probe-17-r7-section.mjs is GONE from this list -- it was repaired and is green.
$expectedNonZero = @{
  'probe-13-r4-browser.mjs' = 'no browser engine in this sandbox (pre-existing, recorded since rev-4)'
}
# For a tolerated non-zero probe, the EXACT set of red assertions. Drift fails the run.
# Empty in r12b on purpose: the two probes that needed an entry in r12 (probe-11 and
# probe-17) were both repaired, and this round adds no new tolerated non-zero probe.
$expectedFailingAssertions = @{}
$expectedLegacyNonZero = @{
  'probe-1-approval.mjs'             = 'rev-1/rev-2 era probe (see the quoted failing assertion)'
  'probe-2-gain-and-resources.mjs'    = 'asserts "lib/client.js contains no fetch(" -- true before rev-4; rev-4 added the audio fetch and rev-10 the sessions read'
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
$beforePath = Join-Path $raw 'r12b-baseline-before.txt'
Write-Utf8 -Path $beforePath -Lines $before
Write-Host ("{0} frozen files recorded -> {1}" -f $before.Count, $beforePath)

Write-Host ''
Write-Host '=== 0b. the anchors this run asserts against ==='
Write-Host 'rev-12 is client-only: lib/index.js must still be the rev-11 bytes.'
foreach ($row in @(
    @{ path = (Join-Path $plugin 'lib\client.js'); bytes = 142330; sha = '777E87968DE82FE250D69D032785675803097AD7B3EBACBCD7FCB1274F3418ED' },
    @{ path = (Join-Path $plugin 'lib\index.js'); bytes = 46638;  sha = '03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938' })) {
  $item = Get-Item $row.path
  $hash = (Get-FileHash $row.path -Algorithm SHA256).Hash
  $ok = ($item.Length -eq $row.bytes) -and ($hash -eq $row.sha)
  Write-Host ("{0,-16} {1,8} B  {2}  {3}" -f $item.Name, $item.Length, $hash.Substring(0, 16), $(if ($ok) { 'OK' } else { 'MISMATCH' }))
  if (-not $ok) {
    Write-Host ("    expected {0} B / {1}" -f $row.bytes, $row.sha) -ForegroundColor Red
    $failed += "anchor $($item.Name)"
  }
}

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
  $log = Join-Path $raw "r12b-dev-$suite.txt"
  $code = Invoke-Logged -Body { & node $test } -LogPath $log
  $summary = (Select-String -Path $log -Pattern '^=== ' -Encoding UTF8 | Select-Object -Last 1).Line
  Write-Host ("{0,-16} exit={1} :: {2}" -f $suite, $code, $summary)
  $rows += [pscustomobject]@{ kind = 'harness'; name = $suite; exit = $code; summary = $summary }
  if ($code -ne 0) { $failed += "dev/$suite (exit $code)" }
}
$afterDev = Get-AudioListing
Write-Host ("audio/ after the suites: {0} file(s) {1}" -f $afterDev.Count, ($afterDev -join ', '))

Write-Host ''
Write-Host '=== 2. independent probes (the set run-r4 ... run-r7 shipped, plus probe-18 and probe-19) ==='
Push-Location $here
foreach ($probe in $probes) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($probe)
  $log = Join-Path $raw "r12b-ind-$name.txt"
  $code = Invoke-Logged -Body { & node $probe } -LogPath $log
  $summary = (Select-String -Path $log -Pattern '^### ' -Encoding UTF8 | Select-Object -Last 1).Line
  Write-Host ("{0,-32} exit={1} :: {2}" -f $probe, $code, $summary)
  $rows += [pscustomobject]@{ kind = 'independent'; name = $name; exit = $code; summary = $summary }
  if ($code -ne 0) {
    if ($expectedNonZero.ContainsKey($probe)) {
      Write-Host ("    EXPECTED non-zero: {0}" -f $expectedNonZero[$probe]) -ForegroundColor Yellow
      if ($expectedFailingAssertions.ContainsKey($probe)) {
        $declared = $expectedFailingAssertions[$probe]
        $observed = Get-FailedAssertions -LogPath $log
        $missing = @($declared | Where-Object { $observed -notcontains $_ })
        $extra = @($observed | Where-Object { $declared -notcontains $_ })
        if ($missing.Count -eq 0 -and $extra.Count -eq 0) {
          Write-Host ("    the {0} red check(s) are EXACTLY the declared pre-rev-12 CSS-shape assertions" -f $observed.Count)
        } else {
          Write-Host '    the red set is NOT the declared one' -ForegroundColor Red
          if ($missing.Count -gt 0) { Write-Host ("      declared but still green: {0}" -f ($missing -join ' | ')) -ForegroundColor Red }
          if ($extra.Count -gt 0) { Write-Host ("      red but undeclared: {0}" -f ($extra -join ' | ')) -ForegroundColor Red }
          $failed += "$probe (failing-assertion set drifted)"
        }
      }
    } else {
      Write-Host ("    UNEXPECTED non-zero - see {0}" -f $log) -ForegroundColor Red
      $failed += "$probe (exit $code)"
    }
  }
}
Pop-Location

Write-Host ''
Write-Host '=== 2b. probe-19 falsifiability: the rev-12 parity claim must be able to go RED ==='
Push-Location $here
$parityMutationLog = Join-Path $raw 'r12b-ind-probe-19-mutations.txt'
$parityMutationCode = Invoke-Logged -Body { & node 'probe-19-r12-select-parity.mjs' '--mutate=all' } -LogPath $parityMutationLog
$paritySummary = (Select-String -Path $parityMutationLog -Pattern '^### mutation ' -Encoding UTF8 | ForEach-Object { $_.Line.Trim() })
$parityVerdict = (Select-String -Path $parityMutationLog -Pattern '^probe-19 verdict' -Encoding UTF8 | Select-Object -Last 1).Line
Write-Host ("probe-19 --mutate=all exit={0}" -f $parityMutationCode)
foreach ($line in $paritySummary) { Write-Host ("    {0}" -f $line) }
Write-Host ("    {0}" -f $parityVerdict)
$rows += [pscustomobject]@{ kind = 'mutation'; name = 'probe-19 --mutate=all'; exit = $parityMutationCode; summary = $parityVerdict }
if ($parityMutationCode -ne 0) { $failed += "probe-19 --mutate=all (exit $parityMutationCode)" }
Pop-Location

Write-Host ''
Write-Host '=== 2c. probe-11 falsifiability: the repaired row-arithmetic probe must go RED too ==='
Push-Location $here
$rowMutationLog = Join-Path $raw 'r12b-ind-probe-11-mutations.txt'
$rowMutationCode = Invoke-Logged -Body { & node 'probe-11-r4-css-rows.mjs' '--mutate=card-cap-92px' } -LogPath $rowMutationLog
$rowRed = ((Select-String -Path $rowMutationLog -Pattern 'checks that turned red' -Encoding UTF8 | ForEach-Object { $_.Line.Trim() }) -join '')
$rowVerdict = ((Select-String -Path $rowMutationLog -Pattern '^\[(PASS|FAIL)\] every expected check failed|^\[(PASS|FAIL)\] the mutation really rewrote' -Encoding UTF8 | ForEach-Object { $_.Line.Trim() }) -join ' | ')
Write-Host ("probe-11 --mutate=card-cap-92px exit={0}" -f $rowMutationCode)
Write-Host ("    {0}" -f $rowRed)
Write-Host ("    {0}" -f $rowVerdict)
$rows += [pscustomobject]@{ kind = 'mutation'; name = 'probe-11 --mutate=card-cap-92px'; exit = $rowMutationCode; summary = $rowVerdict }
if ($rowMutationCode -ne 0) { $failed += "probe-11 --mutate=card-cap-92px (exit $rowMutationCode)" }
Pop-Location

Write-Host ''
Write-Host '=== 3. probe-18 falsifiability: every declared mutation must redden exactly its declared checks ==='
Push-Location $here
$mutationLog = Join-Path $raw 'r12b-ind-probe-18-mutations.txt'
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
  $raceLog = Join-Path $raw ("r12b-ind-probe-18-race-" + $mode.tag + ".txt")
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
Write-Host '=== 5. legacy probes from rev-1 ... rev-3 (recorded, classified) ==='
Push-Location $here
foreach ($probe in $legacyProbes) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($probe)
  $log = Join-Path $raw "r12b-legacy-$name.txt"
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
  $log = Join-Path $raw ("r12b-reviewer-" + $probe.name.Replace('.mjs', '') + ".txt")
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
$afterPath = Join-Path $raw 'r12b-baseline-after.txt'
Write-Utf8 -Path $afterPath -Lines $after
$diff = Compare-Object -ReferenceObject $before -DifferenceObject $after
$diffPath = Join-Path $raw 'r12b-frozen-diff.txt'
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
  Write-Host 'every harness suite exited 0; every probe of the run-r4 ... run-r12 set exited 0 except probe-13 (declared);'
  Write-Host 'probe-19 reddens exactly its three declared mutations (pairwise different subsets); probe-11 and probe-18'
  Write-Host 'mutations all bite; the frozen paths are unchanged.'
} else {
  Write-Host ('FAILURES: ' + ($failed -join ', ')) -ForegroundColor Red
}
Write-Host 'checker: only probe-13-r4-browser.mjs may be non-zero in the regression set (no browser engine).'
Write-Host '         the legacy (rev-1 ... rev-3) probes are recorded in section 5 with a proven reason for each non-zero exit.'
exit ([int]($failed.Count -ne 0))
