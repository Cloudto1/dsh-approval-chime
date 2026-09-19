# Independent rev-14 full regression run (task t1, verification-only round).
#
# Derived from run-r12.ps1 (which was derived from run-r11.ps1 -> run-r10.ps1 -> run-r7.ps1).
# Same structure, same exception discipline, same UTF-8-without-BOM logging. Every log this
# script writes carries the `r13v-` prefix; the r4 ... r12b archives under
# verify-independent/_raw/ are NEVER overwritten (run-r12.ps1 is left exactly as it was).
#
# t2 (the mutation-soundness audit, same round) added section 2d and the reviewer registration:
#   - probe-17's five mutants used to exit 1 whenever ANY check was red -- i.e. exactly when the
#     mutant WAS caught -- so every mutation reported a false red. The driver now answers the
#     question probe-11/18/19 answer ("caught EXACTLY as declared?"): declared set all red, no
#     undeclared red, and the evaluated bytes provably differ (sha256). The five declarations
#     were re-measured: slot 9, order 3, heading 2, picker 2, rogue 6 red checks. Section 2d runs
#     all five and each must exit 0.
#   - probe-11: the exact-red-set comparison is enforced now, and its no-op self-check prints the
#     two stylesheet sha256 instead of two equal character counts.
#   - probe-18: the rewrite helper measures the anchor's occurrence count (must be exactly 1) and
#     the driver compares the mutant source digest with the shipped one, so a dead mutation can
#     no longer be mistaken for a caught one.
#   - probe-19: an undeclared red now fails the mutant (it used to be printed only).
#   - section 6 REGISTERS the four .scratch reviewer probes: registered exit code + registered
#     red set + the reason each red is expected at rev-14. Drift fails the run.
#   These four probes still carry exactly the same assertion call sites as before the audit (see
#   _raw/r13c-assertion-inventory.txt: nothing deleted, nothing softened).
#
# WHY THIS RUN EXISTS -- rev-13 and rev-14 are BOTH client-only appearance changes, and each
# of them moved the bytes that the independent probes hard-code as their anchor:
#   - rev-13 "bigger session bell": the per-session bell/caret in the session header were
#     enlarged (BELL_BOX_PX 20 -> 28, bell glyph 14px -> 22px, caret 7x10 -> 11x16, hover
#     radius 6px -> 8px). Behaviour, DOM shape, requests, audio path and popover logic were
#     untouched. lib/client.js 142330 B / 777E8796... (rev-12) -> 144687 B / 7CCE3D62...
#     (rev-13); verify/client-half.test.mjs 319 -> 327 checks.
#   - rev-14 "blue session bell": the "will ring" bell is now a solid blue chip carrying the
#     SAME design token the enable switch and the volume slider already use
#     (BELL_ON_BG = var(--dsw-alias-state-business-primary,#2563eb)), white glyph on it, its
#     own :hover (same specificity as .dacBell:hover, so the generic grey hover would
#     otherwise win), and the muted state stays caption grey with a slash. lib/client.js
#     144687 B -> 147062 B / 730D1C2F7F58E19471D4B77EE43A221B4FD255BC06AD2AE3752A2C4443466BD5;
#     verify/client-half.test.mjs 327 -> 336 checks. diagnostics.revision is now
#     'rev-14 ... blue session bell'.
#   - lib/index.js (the HOST half) is UNCHANGED since rev-11 and must stay byte-identical:
#     46638 B / 03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938.
#
# WHAT THIS ROUND CHANGED (t1; verification-only -- lib/**, verify/** and the docs are NOT
# touched by this task, only verify-independent/ is):
#   - probe-17-r7-section.mjs: the three stale fingerprint literals re-anchored to rev-14 --
#     client byte count 142330 -> 147062, sha256 777E8796... -> 730D1C2F..., and the two
#     rev-12 stamp literals -> rev-14. Those are the ONLY edits: no assertion subject, no
#     expected value, no assertion count moved (94 assertions before and after). 91/94 -> 94/94.
#   - probe-18-r10-sessions.mjs: EXPECTED_REVISION, one line only. 130/1 -> 131/0.
#   - probe-19-r12-select-parity.mjs: the FROZEN block's client bytes/sha256/revision only.
#     63/66 -> 66/66. The host half of that block still pins the rev-11 bytes, on purpose.
#   - probe-11-r4-css-rows.mjs needed nothing: 32/32, exit 0.
#   "Only literals moved" is not a claim here, it is measured: _raw/r13v-reverse-substitution.txt
#   (script _raw/r13v-reverse-substitution-check.mjs) reverses the exact substitutions on the
#   CURRENT bytes and shows the result hashes back to the pre-edit sha256 of each file,
#   byte-for-byte, with the changed lines listed one by one.
#
# WHAT THIS RUN IS EXPECTED TO REPORT AS RED, AND WHY THAT IS NOT A REGRESSION:
#   - probe-13-r4-browser.mjs (as since rev-4): no browser engine in this sandbox.
#     THE ONLY probe allowed to exit non-zero in this round. Every other member of the
#     regression set must exit 0: the other 12 probes, probe-11's and probe-19's mutation
#     modes, probe-18's --mutate=all, both probe-18 race measurements, and the four author
#     suites (124 / 336 / 22 / 75 = 557 checks).
#
# THE FROZEN MANIFEST (section 0) is a hard-coded 9-file table -- lib/client.js, lib/index.js,
# verify/_harness.mjs, verify/client-half.test.mjs, verify/custom-audio.test.mjs,
# verify/host-half.test.mjs, verify/waterfall.test.mjs, package.json, cordis.patch.yml -- with
# each file's expected byte count and sha256. It replaces run-r12's runtime "enumerate
# everything under lib/ and verify/" scan: a moved byte is now NAMED against a recorded
# baseline instead of only appearing as a before/after delta. Section 0b additionally fails
# the run if an UNRECORDED file appears under lib/ or verify/.
# README.md and CHANGELOG.md are deliberately NOT in the frozen set this round: this is a
# verification-only round and the docs are out of its scope, so a document edit must not be
# able to fail the run. Their hashes are still printed (section 0c and section 7) as an
# informational drift note.
#
# ENVIRONMENT NOTE / run-r12 lesson: run 1 of r12 once ended with "FROZEN PATHS CHANGED"
# because lib/client.js was being rewritten by another task WHILE the run executed (archived
# as r12-run1-CONCURRENT-WRITE-*). The baseline-before/baseline-after pair below is what makes
# such a window visible: any non-"identical" frozen diff means the run is tainted and must be
# repeated on a quiet worktree. Section 0 was already checked before section 1 starts, so a
# manifest mismatch is reported even when the run is otherwise green.
#
#   powershell -ExecutionPolicy Bypass -File verify-independent/run-r13.ps1
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
# the declared exception list below, or the run fails. They pin facts that rev-4 ... rev-14
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

# THE FROZEN MANIFEST -- 9 files, recorded from the rev-14 worktree. Re-anchoring this table
# is the ONLY edit a future revision should need here (plus the two anchors in section 0c).
$frozenManifest = @(
  @{ path = 'lib\client.js';               bytes = 147062; sha = '730D1C2F7F58E19471D4B77EE43A221B4FD255BC06AD2AE3752A2C4443466BD5' },
  @{ path = 'lib\index.js';                bytes = 46638;  sha = '03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938' },
  @{ path = 'verify\_harness.mjs';         bytes = 24855;  sha = 'DD1D6E8123D81A3E4FD27155C3850ACA444734E0A4652ACD052E9240A4286BB0' },
  @{ path = 'verify\client-half.test.mjs'; bytes = 77626;  sha = 'D24FA9911315F4544F0F53179215CB8667FE0014212C171BA8F78DC0AF361B9F' },
  @{ path = 'verify\custom-audio.test.mjs'; bytes = 20263; sha = 'A0071E2E86AF02FF9D78FCFD0A51C2121D13E0322989AD067E753621408E885F' },
  @{ path = 'verify\host-half.test.mjs';   bytes = 29685;  sha = '8AF6315DB2B48A6F089E7DEF96B6C281921209ED0E69799CCFAFD1BC04A3146B' },
  @{ path = 'verify\waterfall.test.mjs';   bytes = 8888;   sha = '010811A5D233C70B058198056BC73B1A9DE1B17560E8A76626F0FE6D4BD6EFC9' },
  @{ path = 'package.json';                bytes = 664;    sha = 'FF68D824385654AAB3B489AA9D2709B55DB67671E1974E41A27BE762E448284A' },
  @{ path = 'cordis.patch.yml';            bytes = 809;    sha = '505A61D6FD1F63A4FB2CE208AE3FC481FFF862D7A212D9530E5D3502683BD3C0' }
)
$docPaths = @('README.md', 'CHANGELOG.md')

# The probes run-r4/r5/r6/r7 shipped, plus the rev-10 sessions probe and the rev-12 parity probe.
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
# The ONLY entry, and the only probe that may exit non-zero in this round:
$expectedNonZero = @{
  'probe-13-r4-browser.mjs' = 'no browser engine in this sandbox (pre-existing, recorded since rev-4)'
}
# For a tolerated non-zero probe, the EXACT set of red assertions. Drift fails the run.
# Empty in r13 on purpose: probe-11/17/18/19 are all GREEN, and this round adds no new
# tolerated non-zero probe.
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
  @{ name = 'reqcheck-rev5.mjs'; path = Join-Path $workspace '.scratch\reviewer-r5\reqcheck-rev5.mjs'; expectedExit = 1; marker = 'reqcheck-rev5.mjs:260';
     why = 'rev-5 render harness: it captures the settings entry with "the LAST slots.register wins", which held while the plugin had exactly ONE registration. rev-7 moved the entry to settings.section and rev-10 added a second registration (the session-header bell), so the shim now captures the bell; the bell renders nothing without a sessionId prop, and the probe throws TypeError at reqcheck-rev5.mjs:260 (row.props.className) BEFORE any assertion runs. Re-baselining it would rewrite what the rev-5 round measured; the live facts are re-derived from rev-14 bytes by probe-17 (slot counts, page controls) and probe-18.' }
  @{ name = 'reqcheck-host-413.mjs'; path = Join-Path $workspace '.scratch\reviewer-r5\reqcheck-host-413.mjs'; expectedExit = 0; marker = '### reviewer host-413 probe: 9 passed / 0 failed';
     why = 'STILL GREEN at rev-14: the rev-5 415 / extension-name rules it checks have not moved.' }
  @{ name = 'reqcheck.mjs'; path = Join-Path $workspace '.scratch\reviewer-r5\reqcheck.mjs'; expectedExit = 1; marker = 'reqcheck.mjs:251';
     why = 'same rev-5 render harness as reqcheck-rev5.mjs (a duplicate snapshot taken at the time): one registration per rev-5, two since rev-10, so it captures the bell and dies at reqcheck.mjs:251 before any assertion runs.' }
  @{ name = 'probe-r7-reqcheck.mjs'; path = Join-Path $workspace '.scratch\reviewer-r7\probe-r7-reqcheck.mjs'; expectedExit = 1; marker = '7 failed';
     why = 'the rev-7 review probe. Seven of its assertions pin the rev-7 product, each superseded on purpose: the rev-7 stamp literal (line 82), the badge text (line 477), "exactly one slots.inject / one register" (lines 398/400/414 -- rev-10 added the session-header bell, so there are two), the over-broad "the old plugin title string must not occur in client.js" substring check (line 452 -- rev-10 introduced an aria-label that legitimately contains those words), and the pre-rev-12 co-location regex that wants box-sizing:content-box and max-height:84px in ONE rule (line 497 -- rev-12 split that rule; probe-11 re-derives the resolved values by cascade). Rewriting those expectations would erase the rev-7 record; the rev-14 facts are covered by probe-17/probe-11.' }
)
# probe-r7-reqcheck's registered red set, verbatim -- drift fails this run.
$reviewerRedSet = @{
  'probe-r7-reqcheck.mjs' = @(
    'the rev-7 stamp names the new revision',
    'exactly one slots.inject happened',
    'exactly one registration landed',
    'client.js has exactly one slots.inject / one slots.register call site',
    'no competing page-level title remains',
    'the bundle revision stamp is on the page',
    '::picker(select) keeps content-box + max-height:84px'
  )
}

$failed = @()
$rows = @()

$audioDir = Join-Path $plugin 'audio'
function Get-AudioListing {
  if (-not (Test-Path $audioDir)) { return @() }
  return @(Get-ChildItem $audioDir -Force -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
}

# The frozen manifest turned into the canonical "hash  bytes  relpath" rows.
function Get-FrozenListing {
  return @($frozenManifest | Sort-Object { $_.path } | ForEach-Object {
    $full = Join-Path $plugin $_.path
    if (-not (Test-Path $full)) { return ("{0} {1,10}  {2}" -f ('-' * 64), 0, $_.path) }
    $digest = (Get-FileHash $full -Algorithm SHA256).Hash
    return ("{0}  {1,10}  {2}" -f $digest, (Get-Item $full).Length, $_.path)
  })
}
# README/CHANGELOG, printed for the record only -- they cannot fail this run.
function Get-DocListing {
  return @($docPaths | ForEach-Object {
    $full = Join-Path $plugin $_
    if (-not (Test-Path $full)) { return ("{0} {1,10}  {2}" -f ('-' * 64), 0, $_) }
    return ("{0}  {1,10}  {2}" -f (Get-FileHash $full -Algorithm SHA256).Hash, (Get-Item $full).Length, $_)
  })
}

Write-Host '=== 0. frozen manifest: 9 recorded files byte-identical to the rev-14 baseline ==='
foreach ($row in $frozenManifest) {
  $full = Join-Path $plugin $row.path
  if (-not (Test-Path $full)) {
    Write-Host ("    {0,-30} MISSING" -f $row.path) -ForegroundColor Red
    $failed += "frozen/$($row.path) (missing)"
    continue
  }
  $item = Get-Item $full
  $hash = (Get-FileHash $full -Algorithm SHA256).Hash
  $ok = ($item.Length -eq $row.bytes) -and ($hash -eq $row.sha)
  Write-Host ("    {0,-30} {1,8} B  {2}  {3}" -f $row.path, $item.Length, $hash.Substring(0, 16), $(if ($ok) { 'OK' } else { 'MISMATCH' }))
  if (-not $ok) {
    Write-Host ("        expected {0} B / {1}" -f $row.bytes, $row.sha) -ForegroundColor Red
    $failed += "frozen/$($row.path)"
  }
}
$before = Get-FrozenListing
$beforePath = Join-Path $raw 'r13v-baseline-before.txt'
Write-Utf8 -Path $beforePath -Lines $before
Write-Host ("{0} frozen files recorded -> {1}" -f $before.Count, $beforePath)

Write-Host ''
Write-Host '=== 0b. no UNRECORDED file under lib/ or verify/ ==='
$recorded = @($frozenManifest | Where-Object { $_.path -like 'lib\*' -or $_.path -like 'verify\*' } | ForEach-Object { $_.path })
$onDisk = @()
foreach ($group in @('lib', 'verify')) {
  $dir = Join-Path $plugin $group
  if (Test-Path $dir) {
    $onDisk += @(Get-ChildItem $dir -Recurse -File | ForEach-Object { $_.FullName.Substring($plugin.Length + 1) })
  }
}
$unrecorded = @($onDisk | Where-Object { $recorded -notcontains $_ })
Write-Host ("    {0} file(s) under lib/ + verify/, {1} of them recorded in the manifest" -f $onDisk.Count, $recorded.Count)
if ($unrecorded.Count -eq 0) {
  Write-Host '    no unrecorded file: a new product/test file would have to be added to the manifest first'
} else {
  Write-Host ("    UNRECORDED: {0}" -f ($unrecorded -join ', ')) -ForegroundColor Red
  $failed += 'unrecorded file under lib/ or verify/'
}

Write-Host ''
Write-Host '=== 0c. the revision anchors this run asserts against, and the doc drift note ==='
Write-Host 'rev-13 and rev-14 are client-only appearance changes: lib/index.js must still be the rev-11 bytes.'
foreach ($row in @(
    @{ path = (Join-Path $plugin 'lib\client.js'); bytes = 147062; sha = '730D1C2F7F58E19471D4B77EE43A221B4FD255BC06AD2AE3752A2C4443466BD5' },
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
$docBefore = Get-DocListing
foreach ($row in $docBefore) { Write-Host ("    note doc: {0}" -f $row) }
Write-Host '    (README.md / CHANGELOG.md are out of scope for this verification-only round: informational only)'

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
  $log = Join-Path $raw "r13v-dev-$suite.txt"
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
  $log = Join-Path $raw "r13v-ind-$name.txt"
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
          Write-Host ("    the {0} red check(s) are EXACTLY the declared ones" -f $observed.Count)
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
$parityMutationLog = Join-Path $raw 'r13v-ind-probe-19-mutations.txt'
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
Write-Host '=== 2c. probe-11 falsifiability: the row-arithmetic probe must go RED too ==='
Push-Location $here
$rowMutationLog = Join-Path $raw 'r13v-ind-probe-11-mutations.txt'
$rowMutationCode = Invoke-Logged -Body { & node 'probe-11-r4-css-rows.mjs' '--mutate=card-cap-92px' } -LogPath $rowMutationLog
$rowRed = ((Select-String -Path $rowMutationLog -Pattern 'checks that turned red' -Encoding UTF8 | ForEach-Object { $_.Line.Trim() }) -join '')
$rowVerdict = ((Select-String -Path $rowMutationLog -Pattern '^\[(PASS|FAIL)\] every expected check failed|^\[(PASS|FAIL)\] no undeclared check turned red|^\[(PASS|FAIL)\] the mutation really rewrote' -Encoding UTF8 | ForEach-Object { $_.Line.Trim() }) -join ' | ')
Write-Host ("probe-11 --mutate=card-cap-92px exit={0}" -f $rowMutationCode)
Write-Host ("    {0}" -f $rowRed)
Write-Host ("    {0}" -f $rowVerdict)
$rows += [pscustomobject]@{ kind = 'mutation'; name = 'probe-11 --mutate=card-cap-92px'; exit = $rowMutationCode; summary = $rowVerdict }
if ($rowMutationCode -ne 0) { $failed += "probe-11 --mutate=card-cap-92px (exit $rowMutationCode)" }
Pop-Location

Write-Host ''
Write-Host '=== 2d. probe-17 falsifiability: all FIVE mutants must be caught exactly as declared ==='
Write-Host 'Before t2 this probe exited 1 whenever ANY check was red -- i.e. exactly when the mutant WAS'
Write-Host 'caught -- so every mutation reported a false red. The driver now answers the same question'
Write-Host 'probe-11/18/19 answer: declared set all red, NOTHING else red, and the evaluated bytes'
Write-Host 'provably differ. A caught mutant exits 0; a dead mutant or a drifted red set exits 1.'
Push-Location $here
$probe17Caught = 0
foreach ($mutation in @('slot', 'order', 'heading', 'picker', 'rogue')) {
  $log = Join-Path $raw "r13v-ind-probe-17-mut-$mutation.txt"
  $code = Invoke-Logged -Body { & node 'probe-17-r7-section.mjs' "--mutate=$mutation" } -LogPath $log
  $summary = (Select-String -Path $log -Pattern '^### ' -Encoding UTF8 | Select-Object -Last 1).Line
  $verdict = ((Select-String -Path $log -Pattern 'every expected check failed under|no undeclared check turned red|the mutation really rewrote the evaluated source' -Encoding UTF8 | ForEach-Object { $_.Line.Trim() }) -join ' | ')
  Write-Host ("{0,-10} exit={1} :: {2}" -f $mutation, $code, $summary)
  Write-Host ("    {0}" -f $verdict)
  $rows += [pscustomobject]@{ kind = 'mutation'; name = "probe-17 --mutate=$mutation"; exit = $code; summary = $summary }
  if ($code -ne 0) { $failed += "probe-17 --mutate=$mutation (exit $code)" } else { $probe17Caught += 1 }
}
Write-Host ("probe-17 mutants caught exactly as declared: {0}/5" -f $probe17Caught)
Pop-Location

Write-Host ''
Write-Host '=== 3. probe-18 falsifiability: every declared mutation must redden exactly its declared checks ==='
Push-Location $here
$mutationLog = Join-Path $raw 'r13v-ind-probe-18-mutations.txt'
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
  $raceLog = Join-Path $raw ("r13v-ind-probe-18-race-" + $mode.tag + ".txt")
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
  $log = Join-Path $raw "r13v-legacy-$name.txt"
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
  $log = Join-Path $raw ("r13v-reviewer-" + $probe.name.Replace('.mjs', '') + ".txt")
  if (-not (Test-Path $probe.path)) {
    Write-Host ("{0,-24} SKIPPED (not found at {1})" -f $probe.name, $probe.path)
    continue
  }
  $code = Invoke-Logged -Body { & node $probe.path } -LogPath $log
  $summary = (Select-String -Path $log -Pattern '^### ' -Encoding UTF8 | Select-Object -Last 1).Line
  Write-Host ("{0,-24} exit={1} (registered {2}) :: {3}" -f $probe.name, $code, $probe.expectedExit, $summary)
  $rows += [pscustomobject]@{ kind = 'reviewer'; name = $probe.name; exit = $code; summary = $summary }
  # t2: REGISTERED, not tolerated. Each of these four is a recorded artifact from the rev-5 /
  # rev-7 review rounds; three of them assert facts that later revisions replaced on purpose
  # (see `why`). The registration below is a contract: the exit code and, where it has one,
  # the exact red set must still match the record -- if a reviewer probe starts behaving
  # differently, this run fails and somebody has to look, instead of a note nobody reads.
  Write-Host ("    why non-zero: {0}" -f $probe.why)
  if ($code -ne $probe.expectedExit) {
    Write-Host ("    REGISTERED EXIT CODE DRIFTED: registered {0}, observed {1}" -f $probe.expectedExit, $code) -ForegroundColor Red
    $failed += "reviewer/$($probe.name) (registered exit drifted)"
  }
  if ($probe.marker -and -not ((Get-Content $log -Raw -Encoding UTF8).Contains($probe.marker))) {
    Write-Host ("    REGISTERED MARKER MISSING: '{0}' is not in the log" -f $probe.marker) -ForegroundColor Red
    $failed += "reviewer/$($probe.name) (registered marker drifted)"
  }
  if ($reviewerRedSet.ContainsKey($probe.name)) {
    $observedRed = Get-FailedAssertions -LogPath $log
    $registeredRed = $reviewerRedSet[$probe.name]
    $missingRed = @($registeredRed | Where-Object { $observedRed -notcontains $_ })
    $extraRed = @($observedRed | Where-Object { $registeredRed -notcontains $_ })
    if ($missingRed.Count -eq 0 -and $extraRed.Count -eq 0) {
      Write-Host ("    the {0} red assertion(s) are EXACTLY the registered set" -f $observedRed.Count)
    } else {
      Write-Host '    REGISTERED RED SET DRIFTED:' -ForegroundColor Red
      if ($missingRed.Count -gt 0) { Write-Host ("      registered but now green: {0}" -f ($missingRed -join ' | ')) -ForegroundColor Red }
      if ($extraRed.Count -gt 0) { Write-Host ("      newly red, not registered: {0}" -f ($extraRed -join ' | ')) -ForegroundColor Red }
      $failed += "reviewer/$($probe.name) (registered red set drifted)"
    }
  }
}
Pop-Location

Write-Host ''
Write-Host '=== 7. frozen-manifest diff (before vs after the run) ==='
$after = Get-FrozenListing
$afterPath = Join-Path $raw 'r13v-baseline-after.txt'
Write-Utf8 -Path $afterPath -Lines $after
$diff = Compare-Object -ReferenceObject $before -DifferenceObject $after
$diffPath = Join-Path $raw 'r13v-frozen-diff.txt'
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
$docAfter = Get-DocListing
$docDiff = Compare-Object -ReferenceObject $docBefore -DifferenceObject $docAfter
if ($docDiff) {
  Write-Host 'NOTE (informational, cannot fail this run): a document changed DURING the run:' -ForegroundColor Yellow
  $docDiff | ForEach-Object { Write-Host ("  {0} {1}" -f $_.SideIndicator, $_.InputObject) }
} else {
  Write-Host 'README.md / CHANGELOG.md unchanged before/after the run (informational, not part of the frozen manifest)'
}

Write-Host ''
Write-Host '=== summary ==='
$rows | Format-Table -AutoSize
if ($failed.Count -eq 0) {
  Write-Host 'every harness suite exited 0 (124 / 336 / 22 / 75 = 557 checks); every probe of the run-r4 ... run-r12 set'
  Write-Host 'exited 0 except probe-13 (declared, no browser engine); ALL EIGHTEEN declared mutants (probe-11 x1,'
  Write-Host 'probe-17 x5 in section 2d, probe-18 x9, probe-19 x3) rewrite the source, redden EXACTLY their'
  Write-Host 'declared checks and exit 0; probe-18 race measurements ran; the 9 frozen files are byte-identical'
  Write-Host 'to the rev-14 manifest before and after; the four .scratch reviewer probes still match their'
  Write-Host 'registered exit codes and red sets (three are registered non-zero for the reasons printed in section 6).'
} else {
  Write-Host ('FAILURES: ' + ($failed -join ', ')) -ForegroundColor Red
}
Write-Host 'checker: only probe-13-r4-browser.mjs may be non-zero in the regression set (no browser engine).'
Write-Host '         the legacy (rev-1 ... rev-3) probes are recorded in section 5 with a proven reason for each non-zero exit.'
exit ([int]($failed.Count -ne 0))
