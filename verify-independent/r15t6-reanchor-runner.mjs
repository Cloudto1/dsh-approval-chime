/**
 * r15 / t6 -- re-anchor the canonical runner run-r13.ps1 to rev-15 and wire in the failure-path probe.
 *
 * The canonical runner keeps the file name run-r13.ps1 (the r15 round re-anchors it in place, the way
 * the r13w round did) but it is the rev-15 runner now. What changes:
 *   1. the log prefix moves to `r15-` so the r13w-* / r13-final-* evidence of the r13 round is never
 *      overwritten (only quoted log-path literals move; the historical prose about the r13w round
 *      stays true);
 *   2. the frozen manifest (9 files) and the two section-0c anchors re-anchor lib/client.js,
 *      verify/client-half.test.mjs and verify/custom-audio.test.mjs to the rev-15 bytes;
 *   3. `$probes` gains the new independent failure-path probe verify-independent/r15t2-independent-probe.mjs
 *      (41641 B / B36E0B4B...), whose shipped mode must exit 0;
 *   4. a NEW section 2f runs that probe's `--mutant` mode, which must redden EXACTLY its ten declared
 *      checks and exit 0;
 *   5. the ten rev-1 ... rev-3 legacy probes are RETIRED from the exception table ($expectedLegacyNonZero
 *      -> $legacyHistory, history only): a non-zero exit from any of them is a FAILURE now;
 *   6. a new section 7b builds the rev-15 mutation table (verify-independent/r15t6-mutation-table.mjs:
 *      all 29 declared probe-11/17/18/19/20 mutations + the r15 failure-path mutant, re-run on the
 *      rev-15 bytes) and fails the run when any row is not ok.
 *
 * Every edit is a literal with an asserted occurrence count; a missing or doubled anchor aborts before
 * anything is written. The pre-edit bytes are archived under _raw/r15-t6-archive/ first.
 *
 *     node verify-independent/r15t6-reanchor-runner.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, '_raw');
const ARCHIVE = join(RAW, 'r15-t6-archive');
const RUNNER = join(HERE, 'run-r13.ps1');
const RECORDED = 'BA4910D9142D7EB2793AA094D681A9E0970E912C9EC39242AE7D170A00BF0513';
const REV14_SHA = '730D1C2F7F58E19471D4B77EE43A221B4FD255BC06AD2AE3752A2C4443466BD5';
const REV15_SHA = '32F0E31FB5ABE1BE7B5C14746213C29EA75896CD54A88401FD70925D6D67BD55';

const sha = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').toUpperCase();

/** [id, from, to, expectedOccurrences] */
const EDITS = [
  /* ---------------------------------------------------------------- 1. identity / intro */
  [
    'header-intro',
    `# Independent rev-14 full regression run (task t1, verification-only round).\n#\n# Derived from run-r12.ps1 (which was derived from run-r11.ps1 -> run-r10.ps1 -> run-r7.ps1).\n# Same structure, same exception discipline, same UTF-8-without-BOM logging. Every log this\n# script writes carries the \`r13w-\` prefix (t6); the r4 ... r12b archives AND the r13-*/r13b-*/\n# r13c-*/r13-final-* evidence of the r12/r13 rounds under verify-independent/_raw/ are NEVER\n# overwritten (run-r12.ps1 is left exactly as it was).`,
    `# Independent rev-15 full regression run (task t6, integration close-out round).\n#\n# Derived from run-r12.ps1 (which was derived from run-r11.ps1 -> run-r10.ps1 -> run-r7.ps1) and\n# re-anchored by r15/t6. Same structure, same exception discipline, same UTF-8-without-BOM\n# logging. Every log this script writes carries the \`r15-\` prefix; the r4 ... r12b archives AND\n# the r13-*/r13b-*/r13c-*/r13-final-*/r13w-* evidence of the r12/r13 rounds under\n# verify-independent/_raw/ are NEVER overwritten (run-r12.ps1 is left exactly as it was).`,
    1,
  ],
  [
    'history-heading',
    `# WHY THIS RUN EXISTS -- rev-13 and rev-14 are BOTH client-only appearance changes, and each\n# of them moved the bytes that the independent probes hard-code as their anchor:`,
    `# WHY THE r13 RUN EXISTED (history, kept verbatim) -- rev-13 and rev-14 were both client-only\n# appearance changes, and each moved the bytes the independent probes hard-code as their anchor:`,
    1,
  ],
  [
    'rev15-rationale',
    `# WHAT THIS ROUND CHANGED (t1; verification-only -- lib/**, verify/** and the docs are NOT\n# touched by this task, only verify-independent/ is):`,
    `# WHY THIS RUN EXISTS AT rev-15 -- rev-15 is the first BEHAVIOURAL change since rev-11, and the\n# first change to lib/client.js since rev-14's appearance work: a convergence re-read that FAILS\n# now keeps the last known per-session table (fail-safe: quieter, never louder) instead of\n# degrading to "no overrides", with the reason on the popover's existing error line.\n#   - lib/client.js 147062 B / 730D1C2F... -> 149196 B / 32F0E31F...; diagnostics.revision is now\n#     'rev-15 ... a failed re-read keeps the mutes'.\n#   - verify/client-half.test.mjs 77626 B / D24FA991... -> 88005 B / BB2C1A34... (the new 5j group:\n#     35 assertions, 11 of which are red on the verbatim rev-14 bytes).\n#   - verify/custom-audio.test.mjs 20263 B / A0071E2E... -> 20263 B / D13A8D63... -- ONE byte\n#     (the version literal at :267; the assertion count is unchanged at 83 call sites).\n#   - lib/index.js (the HOST half) is STILL the rev-11 bytes\n#     46638 B / 03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938, and\n#     verify/host-half.test.mjs, verify/waterfall.test.mjs, verify/_harness.mjs, package.json and\n#     cordis.patch.yml are untouched.\n#   - the new independent FAILURE-PATH probe t2 wrote -- r15t2-independent-probe.mjs, 41641 B /\n#     B36E0B4B7AD175F5AD502BEC015E78D079BA0F92FF32D4954A60FC5E395AAF51 -- joins the regression\n#     set (shipped 42/42, section 2) and its --mutant mode runs in section 2f (exactly ten declared\n#     red checks, exit 0).\n#   - the ten rev-1 ... rev-3 legacy probes are GREEN since r15/t3 (10/10, 0 red) and are RETIRED\n#     from the exception table in this round: section 5 now treats a non-zero exit as a FAILURE.\n# WHAT THE r13 ROUND CHANGED (t1; verification-only -- lib/**, verify/** and the docs were NOT\n# touched by that task, only verify-independent/ was):`,
    1,
  ],
  [
    'expected-red',
    `# WHAT THIS RUN IS EXPECTED TO REPORT AS RED, AND WHY THAT IS NOT A REGRESSION:\n#   - probe-13-r4-browser.mjs (as since rev-4): no browser engine in this sandbox.\n#     THE ONLY probe allowed to exit non-zero in this round. Every other member of the\n#     regression set must exit 0: the other 12 probes, probe-11's and probe-19's mutation\n#     modes, probe-18's --mutate=all, both probe-18 race measurements, and the four author\n#     suites (124 / 336 / 22 / 75 = 557 checks).`,
    `# WHAT THIS RUN IS EXPECTED TO REPORT AS RED, AND WHY THAT IS NOT A REGRESSION:\n#   - probe-13-r4-browser.mjs (as since rev-4): no browser engine in this sandbox.\n#     THE ONLY probe allowed to exit non-zero in this round. Every other member of the\n#     regression set must exit 0: the other 13 probes (including the new r15t2 failure-path\n#     probe), probe-11's / probe-17's / probe-19's / probe-20's mutation modes, probe-18's\n#     --mutate=all, both probe-18 race measurements, the r15t2 --mutant mode, and the four\n#     author suites (124 / 371 / 22 / 75 = 592 checks). The ten rev-1 ... rev-3 legacy probes\n#     are green since r15/t3 and are no longer tolerated non-zero.`,
    1,
  ],
  /* ---------------------------------------------------------------- 2. frozen manifest */
  [
    'manifest-comment',
    `# THE FROZEN MANIFEST -- 9 files, recorded from the rev-14 worktree. Re-anchoring this table`,
    `# THE FROZEN MANIFEST -- 9 files, recorded from the rev-15 worktree. Re-anchoring this table`,
    1,
  ],
  [
    'manifest-client',
    `  @{ path = 'lib\\client.js';               bytes = 147062; sha = '${REV14_SHA}' },`,
    `  @{ path = 'lib\\client.js';               bytes = 149196; sha = '${REV15_SHA}' },`,
    1,
  ],
  [
    'manifest-client-half',
    `  @{ path = 'verify\\client-half.test.mjs'; bytes = 77626;  sha = 'D24FA9911315F4544F0F53179215CB8667FE0014212C171BA8F78DC0AF361B9F' },`,
    `  @{ path = 'verify\\client-half.test.mjs'; bytes = 88005;  sha = 'BB2C1A34049C9F24FAF2D147043C465083A39B403A183D997041FFC3DC54943C' },`,
    1,
  ],
  [
    'manifest-custom-audio',
    `  @{ path = 'verify\\custom-audio.test.mjs'; bytes = 20263; sha = 'A0071E2E86AF02FF9D78FCFD0A51C2121D13E0322989AD067E753621408E885F' },`,
    `  @{ path = 'verify\\custom-audio.test.mjs'; bytes = 20263; sha = 'D13A8D63F073FA1748070996839F09DBD9E760F2448F555ABD865AC45218E822' },`,
    1,
  ],
  /* ---------------------------------------------------------------- 3. probe set */
  [
    'probes-add-r15t2',
    `  'probe-20-r14-bell-appearance.mjs'\n)`,
    `  'probe-20-r14-bell-appearance.mjs',\n  # r15/t6: t2's independent failure-path probe (shipped mode here; --mutant mode in section 2f).\n  'r15t2-independent-probe.mjs'\n)`,
    1,
  ],
  /* ---------------------------------------------------------------- 4. legacy retirement */
  [
    'legacy-table',
    `# Non-zero exits this run does not treat as a regression, with the reason.\n# The ONLY entry, and the only probe that may exit non-zero in this round:\n$expectedNonZero = @{\n  'probe-13-r4-browser.mjs' = 'no browser engine in this sandbox (pre-existing, recorded since rev-4)'\n}`,
    `# Non-zero exits this run does not treat as a regression, with the reason.\n# The ONLY entry, and the only probe that may exit non-zero in this round:\n$expectedNonZero = @{\n  'probe-13-r4-browser.mjs' = 'no browser engine in this sandbox (pre-existing, recorded since rev-4)'\n}`,
    1,
  ],
  [
    'legacy-history-table',
    `$expectedLegacyNonZero = @{\n  'probe-1-approval.mjs'             = 'rev-1/rev-2 era probe (see the quoted failing assertion)'\n  'probe-2-gain-and-resources.mjs'    = 'asserts "lib/client.js contains no fetch(" -- true before rev-4; rev-4 added the audio fetch and rev-10 the sessions read'\n  'probe-3-card-and-scope.mjs'        = 'pins the rev-6 settings.plugin.item card; rev-7 moved it to settings.section'\n  'probe-4-host-half.mjs'             = 'pins DEFAULTS without \`custom\` and the pre-rev-4 import list'\n  'probe-5-contract.mjs'              = 'pins the settings.plugin.item registration'\n  'probe-6-autoplay-replay.mjs'       = 'rev-1/rev-2 era probe (see the quoted failing assertion)'\n  'probe-7-host-audio-http.mjs'       = 'pins the pre-rev-5 upload-name / 415 rules'\n  'probe-8-client-roster-render.mjs'  = 'pins the pre-rev-4 picker CSS, the uppercase-uuid roster and the unbounded name'\n  'probe-9-client-playback.mjs'       = 'counts every request; rev-10 adds one boot read of the sessions table'\n  'probe-10-startup-resilience.mjs'   = 'counts registered routes; rev-10 registers one more (the sessions prefix)'\n}`,
    `# The rev-1 ... rev-3 legacy probes: HISTORY ONLY, no longer an exception table.\n# Through rev-14 ten of these exited non-zero and this run tolerated it. r15/t3 re-baselined all\n# ten against the rev-15 bytes (10/10 exit 0, 0 red, 820 checks; the baseline is archived in\n# _raw/r15-t3-before-*.txt and was re-run independently by the captain). A tolerated known-red set\n# is exactly how a real regression hides, so since r15/t6 a non-zero exit from ANY legacy probe\n# fails this run (section 5). The text below is kept because it is the record of what each probe\n# measured when it was written -- not a licence to be red.\n$legacyHistory = @{\n  'probe-1-approval.mjs'             = 'was non-zero through rev-14: rev-1/rev-2 era probe (see the quoted failing assertion)'\n  'probe-2-gain-and-resources.mjs'    = 'was non-zero through rev-14: asserted "lib/client.js contains no fetch(" -- true before rev-4; rev-4 added the audio fetch and rev-10 the sessions read'\n  'probe-3-card-and-scope.mjs'        = 'was non-zero through rev-14: pinned the rev-6 settings.plugin.item card; rev-7 moved it to settings.section'\n  'probe-4-host-half.mjs'             = 'was non-zero through rev-14: pinned DEFAULTS without \`custom\` and the pre-rev-4 import list'\n  'probe-5-contract.mjs'              = 'was non-zero through rev-14: pinned the settings.plugin.item registration'\n  'probe-6-autoplay-replay.mjs'       = 'was non-zero through rev-14: rev-1/rev-2 era probe (see the quoted failing assertion)'\n  'probe-7-host-audio-http.mjs'       = 'was non-zero through rev-14: pinned the pre-rev-5 upload-name / 415 rules'\n  'probe-8-client-roster-render.mjs'  = 'was non-zero through rev-14: pinned the pre-rev-4 picker CSS, the uppercase-uuid roster and the unbounded name'\n  'probe-9-client-playback.mjs'       = 'was non-zero through rev-14: counted every request; rev-10 adds one boot read of the sessions table'\n  'probe-10-startup-resilience.mjs'   = 'was non-zero through rev-14: counted registered routes; rev-10 registers one more (the sessions prefix)'\n}`,
    1,
  ],
  [
    'legacy-section-text',
    `Write-Host '=== 5. legacy probes from rev-1 ... rev-3 (recorded, classified) ==='`,
    `Write-Host '=== 5. legacy probes from rev-1 ... rev-3 (green since r15-t3; a non-zero exit is a FAILURE) ==='`,
    1,
  ],
  [
    'legacy-section-logic',
    `  if ($code -ne 0) {\n    if ($expectedLegacyNonZero.ContainsKey($probe)) {\n      Write-Host ("    TOLERATED: {0}" -f $expectedLegacyNonZero[$probe])\n      if ($failing) {\n        $cut = [Math]::Min(300, $failing.Length)\n        Write-Host ("    failing assertion(s): {0}" -f $failing.Substring(0, $cut))\n      }\n    } else {\n      Write-Host ("    UNEXPECTED non-zero - see {0}" -f $log) -ForegroundColor Red\n      $failed += "legacy/$probe (exit $code)"\n    }\n  }`,
    `  if ($code -ne 0) {\n    Write-Host ("    REGRESSION: this probe has been green since r15-t3 and may no longer exit non-zero - see {0}" -f $log) -ForegroundColor Red\n    if ($legacyHistory.ContainsKey($probe)) { Write-Host ("    history: {0}" -f $legacyHistory[$probe]) }\n    if ($failing) {\n      $cut = [Math]::Min(300, $failing.Length)\n      Write-Host ("    failing assertion(s): {0}" -f $failing.Substring(0, $cut))\n    }\n    $failed += "legacy/$probe (exit $code)"\n  } elseif ($legacyHistory.ContainsKey($probe)) {\n    Write-Host ("    GREEN (retired from the exception table in r15/t6) -- history: {0}" -f $legacyHistory[$probe])\n  }`,
    1,
  ],
  /* ---------------------------------------------------------------- 5. new section 2f */
  [
    'section-2f',
    `Write-Host ''\nWrite-Host '=== 3. probe-18 falsifiability: every declared mutation must redden exactly its declared checks ==='`,
    `Write-Host ''\nWrite-Host '=== 2f. r15t2 failure-path probe: the rev-15 OBS-A fix must be able to go RED (t2) ==='\nWrite-Host 'This probe is the independent half of the rev-15 fix: it drives the real bundle in a vm and'\nWrite-Host 'observes the real render tree, the diagnostics object and the recording WebAudio stub while a'\nWrite-Host 'convergence re-read FAILS. Its --mutant mode reverts sessionsReadFailed() to the rev-14 body'\nWrite-Host 'IN MEMORY ONLY and requires the red set to be non-empty and EXACTLY the ten declared checks.'\nPush-Location $here\n$r15t2MutantLog = Join-Path $raw 'r15-ind-r15t2-independent-probe-mutant.txt'\n$r15t2MutantCode = Invoke-Logged -Body { & node 'r15t2-independent-probe.mjs' '--mutant' } -LogPath $r15t2MutantLog\n$r15t2M1 = (Select-String -Path $r15t2MutantLog -Pattern '^M1: ' -Encoding UTF8 | Select-Object -Last 1).Line\n$r15t2M2 = (Select-String -Path $r15t2MutantLog -Pattern '^M2: ' -Encoding UTF8 | Select-Object -Last 1).Line\n$r15t2Summary = (Select-String -Path $r15t2MutantLog -Pattern '^=== mutant run: ' -Encoding UTF8 | Select-Object -Last 1).Line\n$r15t2Anchor = (Select-String -Path $r15t2MutantLog -Pattern 'A2: the mutation anchor matches exactly one site' -Encoding UTF8 | Select-Object -Last 1).Line\nWrite-Host ("r15t2 --mutant exit={0} :: {1}" -f $r15t2MutantCode, $r15t2Summary)\nWrite-Host ("    {0}" -f $r15t2Anchor)\nWrite-Host ("    {0}" -f $r15t2M1)\nWrite-Host ("    {0}" -f $r15t2M2)\n$rows += [pscustomobject]@{ kind = 'mutation'; name = 'r15t2 --mutant'; exit = $r15t2MutantCode; summary = $r15t2Summary }\nif ($r15t2MutantCode -ne 0) { $failed += "r15t2-independent-probe --mutant (exit $r15t2MutantCode)" }\nPop-Location\n\nWrite-Host ''\nWrite-Host '=== 3. probe-18 falsifiability: every declared mutation must redden exactly its declared checks ==='`,
    1,
  ],
  /* ---------------------------------------------------------------- 6. section 0 / 0c texts */
  [
    'section-0-text',
    `Write-Host '=== 0. frozen manifest: 9 recorded files byte-identical to the rev-14 baseline ==='`,
    `Write-Host '=== 0. frozen manifest: 9 recorded files byte-identical to the rev-15 baseline ==='`,
    1,
  ],
  [
    'section-0c-text',
    `Write-Host 'rev-13 and rev-14 are client-only appearance changes: lib/index.js must still be the rev-11 bytes.'`,
    `Write-Host 'rev-15 changed lib/client.js and verify/: lib/index.js must still be the rev-11 bytes.'`,
    1,
  ],
  [
    'section-0c-anchor',
    `    @{ path = (Join-Path $plugin 'lib\\client.js'); bytes = 147062; sha = '${REV14_SHA}' },`,
    `    @{ path = (Join-Path $plugin 'lib\\client.js'); bytes = 149196; sha = '${REV15_SHA}' },`,
    1,
  ],
  /* ---------------------------------------------------------------- 7. mutation table (7b) */
  [
    'section-7b',
    `Write-Host ''\nWrite-Host '=== 7. frozen-manifest diff (before vs after the run) ==='`,
    `Write-Host ''\nWrite-Host '=== 7b. rev-15 mutation table: every declared mutation re-measured on THESE bytes ==='\nWrite-Host 'verify-independent/r15t6-mutation-table.mjs refuses to run unless lib/client.js is the rev-15'\nWrite-Host 'bytes, re-runs all 29 declared probe-11/17/18/19/20 mutations plus the r15 failure-path mutant'\nWrite-Host '(one run, ten declared red checks) and writes _raw/r15-t6-mutation-table.json/.md. Any row that'\nWrite-Host 'did not rewrite the source, whose anchor is not unique, whose red set is not exactly the one it'\nWrite-Host 'declared, or that exited non-zero makes this section fail.'\nPush-Location $plugin\n$mutationTableLog = Join-Path $raw 'r15-t6-mutation-table-console.txt'\n$mutationTableCode = Invoke-Logged -Body { & node 'verify-independent/r15t6-mutation-table.mjs' } -LogPath $mutationTableLog\n$mutationTableLine = (Select-String -Path $mutationTableLog -Pattern '^r15 mutation table: ' -Encoding UTF8 | Select-Object -Last 1).Line\n$mutationTableResult = (Select-String -Path $mutationTableLog -Pattern '^RESULT: ' -Encoding UTF8 | Select-Object -Last 1).Line\nWrite-Host ("mutation table exit={0} :: {1}" -f $mutationTableCode, $mutationTableLine)\nWrite-Host ("    {0}" -f $mutationTableResult)\n$rows += [pscustomobject]@{ kind = 'mutation-table'; name = 'r15t6-mutation-table'; exit = $mutationTableCode; summary = $mutationTableLine }\nif ($mutationTableCode -ne 0) { $failed += "r15t6-mutation-table (exit $mutationTableCode)" }\nPop-Location\n\nWrite-Host ''\nWrite-Host '=== 7. frozen-manifest diff (before vs after the run) ==='`,
    1,
  ],
  /* ------------------------------------------- 9. reviewer registration: state-derived count */
  [
    'reviewer-extra-set',
    `$failed = @()\n$rows = @()`,
    `# r15/t6: the red set of probe-r7-reqcheck is a FUNCTION OF TWO FILES. Its group E asserts that\n# CHANGELOG.md anchors the LIVE lib/client.js byte count and sha256, and CHANGELOG.md is owned by a\n# different task in this round. While CHANGELOG still carries the rev-14 anchors those two checks are\n# red as well (9 red for the probe); once CHANGELOG is re-anchored to rev-15 they turn green and the\n# recorded 7-red set is exact again. BOTH states are checked as an EXACT set -- the two names are\n# required to be RED in one state and GREEN in the other, nothing is tolerated and nothing is\n# softened. The state is measured from CHANGELOG.md itself and printed in section 6.\n$clientHashForChangelog = (Get-FileHash (Join-Path $plugin 'lib\\client.js') -Algorithm SHA256).Hash\n$changelogText = ''\ntry { $changelogText = Get-Content (Join-Path $plugin 'CHANGELOG.md') -Raw -Encoding UTF8 } catch { }\n$changelogAnchorsClientHash = $changelogText.ToUpper().Contains($clientHashForChangelog.ToUpper())\n$reviewerRedSetExtra = @{\n  'probe-r7-reqcheck.mjs' = @{\n    requires = 'CHANGELOG.md does NOT yet anchor the live lib/client.js sha256'\n    names = @(\n      'lib/client.js byte count is anchored in CHANGELOG.md',\n      'lib/client.js sha256 is anchored in CHANGELOG.md'\n    )\n  }\n}\n\n$failed = @()\n$rows = @()`,
    1,
  ],
  [
    'reviewer-marker-state',
    `  if ($probe.marker -and -not ((Get-Content $log -Raw -Encoding UTF8).Contains($probe.marker))) {\n    Write-Host ("    REGISTERED MARKER MISSING: '{0}' is not in the log" -f $probe.marker) -ForegroundColor Red`,
    `  # r15/t6: probe-r7-reqcheck's marker carries its red COUNT, which legitimately has the two states\n  # described at $reviewerRedSetExtra. The count is still an exact requirement -- it is compared\n  # against the count implied by the measured state of CHANGELOG.md, not against one frozen literal.\n  $markerExpected = $probe.marker\n  if ($probe.name -eq 'probe-r7-reqcheck.mjs' -and -not $changelogAnchorsClientHash) { $markerExpected = '9 failed' }\n  if ($probe.marker -and -not ((Get-Content $log -Raw -Encoding UTF8).Contains($markerExpected))) {\n    Write-Host ("    REGISTERED MARKER MISSING: '{0}' is not in the log" -f $markerExpected) -ForegroundColor Red`,
    1,
  ],
  [
    'reviewer-red-set-state',
    `    $observedRed = Get-FailedAssertions -LogPath $log\n    $registeredRed = $reviewerRedSet[$probe.name]`,
    `    $observedRed = Get-FailedAssertions -LogPath $log\n    $registeredRed = $reviewerRedSet[$probe.name]\n    if ($reviewerRedSetExtra.ContainsKey($probe.name) -and -not $changelogAnchorsClientHash) {\n      $extraSet = $reviewerRedSetExtra[$probe.name]\n      Write-Host ("    CHANGELOG STATE: {0} -- {1} extra registered check(s) must be red in this run" -f $extraSet.requires, $extraSet.names.Count) -ForegroundColor Yellow\n      $registeredRed = @($registeredRed + $extraSet.names)\n    } elseif ($reviewerRedSetExtra.ContainsKey($probe.name)) {\n      Write-Host '    CHANGELOG STATE: CHANGELOG.md already anchors the live lib/client.js sha256 -- the recorded set is exact as-is'\n    }`,
    1,
  ],
  [
    'section-2-summary-fallback',
    `  $summary = (Select-String -Path $log -Pattern '^### ' -Encoding UTF8 | Select-Object -Last 1).Line\n  Write-Host ("{0,-32} exit={1} :: {2}" -f $probe, $code, $summary)`,
    `  $summary = (Select-String -Path $log -Pattern '^### ' -Encoding UTF8 | Select-Object -Last 1).Line\n  # r15/t6: the r15t2 failure-path probe does not print a '### ' banner (it prints\n  # '=== shipped rev-15 run: 42/42 checks passed ==='), so fall back to the last non-empty line\n  # rather than reporting an empty summary for a probe that passed.\n  if (-not $summary) {\n    $summary = (Get-Content $log -Encoding UTF8 | Where-Object { $_.Trim().Length -gt 0 } | Select-Object -Last 1)\n  }\n  Write-Host ("{0,-32} exit={1} :: {2}" -f $probe, $code, $summary)`,
    1,
  ],
  [
    'summary-text',
    `  Write-Host 'every harness suite exited 0 (124 / 336 / 22 / 75 = 557 checks); every probe of the run-r4 ... run-r12 set'\n  Write-Host 'plus probe-20 (t6) exited 0 except probe-13 (declared, no browser engine); ALL TWENTY-NINE declared'\n  Write-Host 'mutants (probe-11 x1, probe-17 x5 in section 2d, probe-20 x11 in section 2e, probe-18 x9, probe-19 x3)'\n  Write-Host 'rewrite the source, redden EXACTLY their declared checks and exit 0; probe-18 race measurements ran;'\n  Write-Host 'the 9 frozen files are byte-identical'\n  Write-Host 'to the rev-14 manifest before and after; the four .scratch reviewer probes still match their'\n  Write-Host 'registered exit codes and red sets (three are registered non-zero for the reasons printed in section 6).'`,
    `  Write-Host 'every harness suite exited 0 (124 / 371 / 22 / 75 = 592 checks); every probe of the run-r4 ... run-r12 set'\n  Write-Host 'plus probe-20 (r13/t6) and the r15t2 failure-path probe exited 0 except probe-13 (declared, no'\n  Write-Host 'browser engine); ALL TWENTY-NINE declared probe-11/17/18/19/20 mutants (section 2b x1, 2c x1,'\n  Write-Host '2d x5, 2e x11, 3 x9 -- re-run row by row in section 7b) plus the r15t2 rev-14 regression mutant'\n  Write-Host '(section 2f, exactly its ten declared red checks) rewrite the source, redden EXACTLY their'\n  Write-Host 'declared checks and exit 0; the ten rev-1 ... rev-3 legacy probes are GREEN since r15/t3 and a'\n  Write-Host 'non-zero exit from any of them now FAILS the run; probe-18 race measurements ran; the 9 frozen files'\n  Write-Host 'are byte-identical to the rev-15 manifest before and after; the four .scratch reviewer probes still'\n  Write-Host 'match their registered exit codes and red sets (three are registered non-zero, see section 6).'`,
    1,
  ],
  [
    'checker-note',
    `Write-Host '         the legacy (rev-1 ... rev-3) probes are recorded in section 5 with a proven reason for each non-zero exit.'`,
    `Write-Host '         the legacy (rev-1 ... rev-3) probes are GREEN since r15/t3; history of their old non-zero exits is printed in section 5.'`,
    1,
  ],
];

/* ------------------------------------------------------------------ apply */

mkdirSync(ARCHIVE, { recursive: true });
const before = readFileSync(RUNNER, 'utf8');
const beforeSha = sha(before);
if (beforeSha !== RECORDED) {
  console.error(`REFUSING: run-r13.ps1 is ${beforeSha}, not the recorded pre-edit artifact ${RECORDED}`);
  process.exit(1);
}
const archiveName = `run-r13.ps1.${beforeSha}.txt`;
writeFileSync(join(ARCHIVE, archiveName), before, 'utf8');

let after = before;
const log = [];
const problems = [];
log.push('r15 / t6 -- canonical runner re-anchoring (run-r13.ps1, edited in place)');
log.push(`when            ${new Date().toISOString()}`);
log.push(`recorded        ${beforeSha}  ${Buffer.byteLength(before, 'utf8')} B`);
log.push(`archived        _raw/r15-t6-archive/${archiveName}`);
log.push('');

// the log-prefix move first: quoted log-path literals only
const prefixEdits = [['"r13w-', '"r15-'], ["'r13w-", "'r15-"]];
let prefixTotal = 0;
for (const [from, to] of prefixEdits) {
  const occurrences = after.split(from).length - 1;
  prefixTotal += occurrences;
  log.push(`edit  log-prefix   ${from} -> ${to}   x${occurrences}`);
  if (occurrences === 0) problems.push(`log-prefix literal ${from} not found`);
  after = after.split(from).join(to);
}
log.push(`edit  log-prefix   total quoted log paths moved: ${prefixTotal} (the 4 historical prose mentions of r13w- stay true)`);
log.push('');

for (const [id, from, to, expected] of EDITS) {
  const occurrences = after.split(from).length - 1;
  const ok = occurrences === expected;
  log.push(`edit  ${id}   x${occurrences} (expected ${expected})  ${ok ? 'OK' : 'FAIL'}`);
  if (!ok) {
    problems.push(`${id}: found ${occurrences} occurrence(s), expected ${expected}`);
    continue;
  }
  if (from === to) continue;
  after = after.split(from).join(to);
}

if (problems.length === 0) {
  if (after === before) problems.push('no edit changed anything');
  if (/[^\x00-\x7F]/.test(after)) problems.push('the runner must stay ASCII-only');
  writeFileSync(RUNNER, after, 'utf8');
}

const afterSha = sha(after);
log.push('');
log.push(`new bytes       ${afterSha}  ${Buffer.byteLength(after, 'utf8')} B`);
log.push(`lines           ${before.split('\n').length} -> ${after.split('\n').length}`);
log.push('');
log.push(problems.length === 0
  ? `RESULT: runner re-anchored; every one of the ${EDITS.length} enumerated edits applied with the expected occurrence count.`
  : `RESULT: ${problems.length} problem(s), NOTHING was written: ${problems.join(' ; ')}`);

const report = `${log.join('\n')}\n`;
console.log(report);
writeFileSync(join(RAW, 'r15-t6-runner-reanchor.txt'), report, 'utf8');
process.exit(problems.length === 0 ? 0 : 1);
