/**
 * r16 / t1 -- re-anchor every LIVE fingerprint of `lib/client.js` from rev-15 to rev-16.
 *
 * WHY THIS FILE EXISTS
 * rev-16 is a one-request appearance change (`这个铃铛和箭头分开点` -- the session-header bell and
 * its caret sat flush and read as one control). Touching `lib/client.js` at all expires every
 * probe assertion that pins the shipped artifact, which is exactly what those assertions are for.
 * The rev-15 round met the same situation (r15t6-reanchor-fingerprints.mjs); this is the same
 * instrument one revision later, with two differences that matter:
 *
 *   1. every row carries the EXACT number of occurrences it must replace, and a row whose count is
 *      wrong aborts the whole run BEFORE anything is written -- a re-anchor that silently replaces
 *      nothing (or one occurrence too many) is the failure mode this file exists to prevent;
 *   2. the frozen-manifest rows of run-r13.ps1 are not typed by hand: the new byte count and sha256
 *      are MEASURED from the files on disk in this run and substituted, so the manifest cannot
 *      disagree with the worktree it was recorded from.
 *
 * WHAT IT DOES NOT TOUCH
 * Historical records stay exactly as they are: the rev-14/rev-15 anchors inside CHANGELOG.md,
 * docs/变异覆盖与残留红.md, r15t6-reanchor-fingerprints.mjs, r15t2-assertion-inventory.mjs and every
 * `_raw/` artifact. Those are the record of what earlier rounds measured; rewriting them would
 * destroy the only evidence that the fingerprints were ever different.
 *
 *     node verify-independent/r16-t1-reanchor.mjs            # dry-run: report only
 *     node verify-independent/r16-t1-reanchor.mjs --write    # apply, after archiving old bytes
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, '..');
const WORKSPACE = join(PLUGIN, '..');
const RAW = join(HERE, '_raw');
const ARCHIVE = join(RAW, 'r16-t1-archive');
const WRITE = process.argv.includes('--write');

const SHA15 = '32F0E31FB5ABE1BE7B5C14746213C29EA75896CD54A88401FD70925D6D67BD55';
const SHA16 = '76B4D4E73FFAE5CA47838B2798EE74AE39AB60ADEF2699CF4562D4A89AAAD6FE';
const BYTES15 = 149196;
const BYTES16 = 150663;
const STAMP15 = 'rev-15 · a failed re-read keeps the mutes';
const STAMP16 = 'rev-16 · the bell and the caret stand apart';

const CLIENT = join(PLUGIN, 'lib', 'client.js');
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase();

/* --------------------------------------------------------------- preconditions */

const shipped = readFileSync(CLIENT);
if (shipped.length !== BYTES16 || sha256(shipped) !== SHA16) {
  console.error(`REFUSING: lib/client.js is ${shipped.length} B / ${sha256(shipped)}, not the rev-16 artifact ${BYTES16} B / ${SHA16}`);
  process.exit(1);
}

/** The frozen-manifest files whose bytes rev-16 really moved, measured here -- never typed. */
const measured = (relPath) => {
  const buffer = readFileSync(join(PLUGIN, relPath));
  return { bytes: buffer.length, sha: sha256(buffer) };
};
const clientNow = measured('lib/client.js');
const clientHalfNow = measured('verify/client-half.test.mjs');
const customAudioNow = measured('verify/custom-audio.test.mjs');
if (clientNow.bytes !== BYTES16 || clientNow.sha !== SHA16) {
  console.error('REFUSING: the measured lib/client.js does not match the declared rev-16 fingerprint');
  process.exit(1);
}

/* ---------------------------------------------------------------------- rows */

/**
 * Every row: { file, from, to, count, what }. `count` is the number of occurrences the shipped
 * bytes must contain -- checked, not assumed. Multi-line `to` values are joined with the target
 * file's own end-of-line convention.
 */
const rows = [
  /* ---- probe-17: the frozen artifact fingerprints and the revision stamp ---- */
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: "'lib/client.js byte count is what rev-15 claims'",
    to: "'lib/client.js byte count is what rev-16 claims'",
    count: 1,
    what: 'assertion name (rev-15 -> rev-16)',
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: `CLIENT_BYTES, ${BYTES15}`,
    to: `CLIENT_BYTES, ${BYTES16}`,
    count: 1,
    what: `frozen client byte count ${BYTES15} -> ${BYTES16}`,
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: "'lib/client.js sha256 is what rev-14 claims'",
    to: "'lib/client.js sha256 is what rev-16 claims'",
    count: 1,
    what: 'assertion name -- it still said rev-14 while holding the rev-15 bytes (a t6 miss, fixed here)',
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: `'${SHA15}'`,
    to: `'${SHA16}'`,
    count: 1,
    what: 'frozen client sha256',
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: "'the bundleRevision badge shows the rev-15 stamp'",
    to: "'the bundleRevision badge shows the rev-16 stamp'",
    count: 1,
    what: 'assertion name (rev-15 -> rev-16)',
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: "'the revision stamp is the rev-15 one'",
    to: "'the revision stamp is the rev-16 one'",
    count: 1,
    what: 'assertion name (rev-15 -> rev-16)',
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: '/rev-15/.test(diagnostics.revision)',
    to: '/rev-16/.test(diagnostics.revision)',
    count: 1,
    what: 'stamp regex',
  },

  /* ---- probe-18 / probe-19: the stamp and the frozen factory fingerprint ---- */
  {
    file: 'verify-independent/probe-18-r10-sessions.mjs',
    from: `'${STAMP15}'`,
    to: `'${STAMP16}'`,
    count: 1,
    what: 'EXPECTED_REVISION',
  },
  {
    file: 'verify-independent/probe-19-r12-select-parity.mjs',
    from: `bytes: ${BYTES15},`,
    to: `bytes: ${BYTES16},`,
    count: 1,
    what: 'FROZEN.bytes',
  },
  {
    file: 'verify-independent/probe-19-r12-select-parity.mjs',
    from: `sha256: '${SHA15}',`,
    to: `sha256: '${SHA16}',`,
    count: 1,
    what: 'FROZEN.sha256',
  },
  {
    file: 'verify-independent/probe-19-r12-select-parity.mjs',
    from: `revision: '${STAMP15}',`,
    to: `revision: '${STAMP16}',`,
    count: 1,
    what: 'FROZEN.revision',
  },

  /* ---- the two legacy probes that name the revision under test ---- */
  {
    file: 'verify-independent/probe-8-client-roster-render.mjs',
    from: "under test (rev-15)', String(diagnostics.revision).includes('rev-15')",
    to: "under test (rev-16)', String(diagnostics.revision).includes('rev-16')",
    count: 1,
    what: 'legacy probe-8: the check name and the literal it guards',
  },
  {
    file: 'verify-independent/probe-2-gain-and-resources.mjs',
    from: 'the five the rev-15 source has',
    to: 'the five the rev-16 source has',
    count: 1,
    what: 'legacy probe-2: assertion NAME only -- the measured value (five fetch call sites) is unchanged by rev-16',
  },

  /* ---- the r15t2 failure-path probe: frozen bytes + its own labels ---- */
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: `sha256: '${SHA15}',`,
    to: `sha256: '${SHA16}',`,
    count: 1,
    what: 'FROZEN.sha256',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: `bytes: ${BYTES15},`,
    to: `bytes: ${BYTES16},`,
    count: 1,
    what: 'FROZEN.bytes',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: `revision: '${STAMP15}',`,
    to: `revision: '${STAMP16}',`,
    count: 1,
    what: 'FROZEN.revision',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: 'The frozen rev-15 bytes this probe is anchored to',
    to: 'The frozen rev-16 bytes this probe is anchored to',
    count: 1,
    what: 'FROZEN doc comment',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: 'A1: lib/client.js is the frozen rev-15 byte sequence',
    to: 'A1: lib/client.js is the frozen rev-16 byte sequence',
    count: 1,
    what: 'check name A1',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: 'the version of the bundle this repo ships as rev-15',
    to: 'the version of the bundle this repo ships as rev-16',
    count: 1,
    what: 'the AUTHOR string',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: "let sourceLabel = 'shipped rev-15 bytes';",
    to: "let sourceLabel = 'shipped rev-16 bytes';",
    count: 1,
    what: 'the source label printed in the run header',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: '=== shipped rev-15 run: ',
    to: '=== shipped rev-16 run: ',
    count: 1,
    what: 'the summary banner run-r13.ps1 falls back to when a probe prints no ### line',
  },

  /* ---- the mutation table instrument ---- */
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: `const REV15 = { sha256: '${SHA15}', bytes: ${BYTES15} };`,
    to: `const FROZEN = { sha256: '${SHA16}', bytes: ${BYTES16} };`,
    count: 1,
    what: 'the refused-unless fingerprint (and its name: REV15 would be a lie at rev-16)',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: 'REV15.',
    to: 'FROZEN.',
    count: 4,
    what: 'the four uses of the renamed constant (2 comparisons, 2 message fields)',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: 'const EXPECTED_ROWS = 30;',
    to: 'const EXPECTED_ROWS = 32;',
    count: 1,
    what: 'row count: 29 shared mutations + 2 new rev-16 gap mutants + 1 r15t2 failure-path mutant',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "  ['probe-20-r14-bell-appearance', 'caret-svg-hardcoded-9'],\n];",
    to: "  ['probe-20-r14-bell-appearance', 'caret-svg-hardcoded-9'],\n  ['probe-20-r14-bell-appearance', 'bell-caret-gap-removed'],\n  ['probe-20-r14-bell-appearance', 'bell-caret-gap-constant-zeroed'],\n];",
    count: 1,
    what: 'the two declared rev-16 gap mutants join the table',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: '`r15-mut-${probe}-${mutation}.txt`',
    to: '`r16-mut-${probe}-${mutation}.txt`',
    count: 1,
    what: 'per-mutant log name',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'r15-mut-r15t2-independent-probe-sessionsreadfailed-reverted.txt'",
    to: "'r16-mut-r15t2-independent-probe-sessionsreadfailed-reverted.txt'",
    count: 1,
    what: 'the failure-path mutant log name',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'r15-t6-mutation-table.json'",
    to: "'r16-t1-mutation-table.json'",
    count: 1,
    what: 'the machine-readable table (the rev-15 one stays on disk as history)',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'r15-t6-mutation-table.md'",
    to: "'r16-t1-mutation-table.md'",
    count: 1,
    what: 'the human-readable table',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "  revision: 'rev-15',",
    to: "  revision: 'rev-16',",
    count: 1,
    what: 'the revision field of the emitted table',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'# r15 · the rev-15 mutation table (every declared mutation re-measured on the rev-15 bytes)'",
    to: "'# r16 · the rev-16 mutation table (every declared mutation re-measured on the rev-16 bytes)'",
    count: 1,
    what: 'the markdown heading',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: '(raw logs: _raw/r15-mut-*.txt)',
    to: '(raw logs: _raw/r16-mut-*.txt)',
    count: 1,
    what: 'the log directory note',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: 'declared mutations on the rev-15 bytes rewrite the evaluated source',
    to: 'declared mutations on the rev-16 bytes rewrite the evaluated source',
    count: 1,
    what: 'the RESULT line of the markdown',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: '`r15 mutation table: rows=',
    to: '`r16 mutation table: rows=',
    count: 1,
    what: 'the console banner run-r13.ps1 greps for (both sides move together)',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: 'declared mutations is ok on the rev-15 bytes.',
    to: 'declared mutations is ok on the rev-16 bytes.',
    count: 1,
    what: 'the final console RESULT',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: ' * r15 / t6 -- the rev-15 MUTATION TABLE: every declared mutation re-measured on the rev-15 bytes.',
    to: ' * r15 / t6, re-anchored by r16 / t1 -- the MUTATION TABLE: every declared mutation re-measured\n * on the rev-16 bytes. The instrument is the r15 round\'s; only its fingerprints and its row list move.',
    count: 1,
    what: 'header line 1',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: ' *   - it REFUSES to run unless lib/client.js is the rev-15 bytes (sha256 + size asserted), so a\n *     rev-14 table can never be mislabelled as a rev-15 one;',
    to: ' *   - it REFUSES to run unless lib/client.js is the rev-16 bytes (sha256 + size asserted), so a\n *     table for another revision can never be mislabelled as this one;',
    count: 1,
    what: 'header refusal note',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: ' *   - its logs are `_raw/r15-mut-*.txt`, so the r13c logs stay untouched;',
    to: ' *   - its logs are `_raw/r16-mut-*.txt`, so the r13c AND r15 logs stay untouched;',
    count: 1,
    what: 'header log note',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: ' * exits 0 only when every row is ok and the row count is the declared 30.',
    to: ' * exits 0 only when every row is ok and the row count is the declared 32.',
    count: 1,
    what: 'header row-count note',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: '/** The 29 mutations the r13c table declared, re-run unchanged on the rev-15 bytes. */',
    to: '/** The 29 mutations the r13c table declared plus the 2 rev-16 gap mutants, re-run on the rev-16 bytes. */',
    count: 1,
    what: 'MUTATIONS doc comment',
  },

  /* ---- the canonical runner: manifest rows, counts, prose, log prefix ---- */
  {
    file: 'verify-independent/run-r13.ps1',
    from: `  @{ path = 'lib\\client.js';               bytes = ${BYTES15}; sha = '${SHA15}' },`,
    to: `  @{ path = 'lib\\client.js';               bytes = ${clientNow.bytes}; sha = '${clientNow.sha}' },`,
    count: 1,
    what: 'frozen manifest row (MEASURED from disk in this run)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: `  @{ path = 'verify\\client-half.test.mjs'; bytes = 88005;  sha = 'BB2C1A34049C9F24FAF2D147043C465083A39B403A183D997041FFC3DC54943C' },`,
    to: `  @{ path = 'verify\\client-half.test.mjs'; bytes = ${clientHalfNow.bytes};  sha = '${clientHalfNow.sha}' },`,
    count: 1,
    what: '+2 assertions (373 checks) -- MEASURED from disk in this run',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: `  @{ path = 'verify\\custom-audio.test.mjs'; bytes = 20263; sha = 'D13A8D63F073FA1748070996839F09DBD9E760F2448F555ABD865AC45218E822' },`,
    to: `  @{ path = 'verify\\custom-audio.test.mjs'; bytes = ${customAudioNow.bytes}; sha = '${customAudioNow.sha}' },`,
    count: 1,
    what: 'the :267 version literal again -- MEASURED from disk in this run',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: `    @{ path = (Join-Path $plugin 'lib\\client.js'); bytes = ${BYTES15}; sha = '${SHA15}' },`,
    to: `    @{ path = (Join-Path $plugin 'lib\\client.js'); bytes = ${clientNow.bytes}; sha = '${clientNow.sha}' },`,
    count: 1,
    what: 'section 0c anchor row (MEASURED from disk in this run)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# Independent rev-15 full regression run (task t6, integration close-out round).',
    to: '# Independent rev-16 full regression run (r16 / t1, captain-direct appearance change).',
    count: 1,
    what: 'title line',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: 'Every log this script writes carries the `r15-` prefix;',
    to: 'Every log this script writes carries the `r16-` prefix;',
    count: 1,
    what: 'log-prefix note',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# WHY THIS RUN EXISTS AT rev-15 -- rev-15 is the first BEHAVIOURAL change since rev-11, and the',
    to: [
      '# WHY THIS RUN EXISTS AT rev-16 -- rev-16 is a PURELY APPEARANCE change, the first of its kind',
      '# since rev-14. The session-header bell and its caret sit in one inline-flex wrapper, and the',
      '# chevron fills only 11px of its own 16px box, so with no gap the blue square and the drawn arrow',
      '# were 2.5px apart and read as ONE control (user report: "这个铃铛和箭头分开点"). The wrapper now',
      '# carries `gap:BELL_GAP_PX` = 6px (the host\'s own inter-chip rhythm), the constant is on the',
      '# console surface as sessionIcon.bellGapPx, and probe-20 declares TWO mutants for it -- one for',
      '# each half of the conjunction -- so neither the CSS nor the constant can drift alone.',
      '#   - lib/client.js 149196 B / 32F0E31F... -> 150663 B / 76B4D4E7...; diagnostics.revision is now',
      '#     \'rev-16 ... the bell and the caret stand apart\'.',
      '#   - verify/client-half.test.mjs 88005 B / BB2C1A34... -> 88441 B / B5FC3935... (two new geometry',
      '#     assertions: the wrapper rule carries the reported gap, and the reported gap is 6px).',
      '#   - verify/custom-audio.test.mjs 20263 B / D13A8D63... -> 20263 B / the new sha -- ONE byte',
      '#     (the version literal at :267; the assertion count is unchanged at 83 call sites).',
      '#   - probe-20-r14-bell-appearance.mjs is 23/23 checks (was 22) with 13 declared mutants (was 11).',
      '#   - lib/index.js (the HOST half), verify/host-half.test.mjs, verify/waterfall.test.mjs,',
      '#     verify/_harness.mjs, package.json and cordis.patch.yml are UNCHANGED.',
      '# THE rev-15 NARRATIVE BELOW IS HISTORY: rev-15 was the first BEHAVIOURAL change since rev-11, and the',
    ].join('\n'),
    count: 1,
    what: 'the rev-16 WHY block, with the rev-15 narrative demoted to history',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "; diagnostics.revision is now\n#     'rev-15 ... a failed re-read keeps the mutes'.",
    to: "; diagnostics.revision BECAME\n#     'rev-15 ... a failed re-read keeps the mutes' (and is 'rev-16 ... the bell and the caret stand\n#     apart' since r16/t1).",
    count: 1,
    what: 'the rev-15 delta bullet must not claim to describe the CURRENT stamp',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'=== 0. frozen manifest: 9 recorded files byte-identical to the rev-15 baseline ==='",
    to: "'=== 0. frozen manifest: 9 recorded files byte-identical to the rev-16 baseline ==='",
    count: 1,
    what: 'section 0 title',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'rev-15 changed lib/client.js and verify/: lib/index.js must still be the rev-11 bytes.'",
    to: "'rev-16 changed lib/client.js and verify/: lib/index.js must still be the rev-11 bytes.'",
    count: 1,
    what: 'section 0c note',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "  # '=== shipped rev-15 run: 42/42 checks passed ==='), so fall back to the last non-empty line",
    to: "  # '=== shipped rev-16 run: 42/42 checks passed ==='), so fall back to the last non-empty line",
    count: 1,
    what: 'the fallback-summary comment must quote the banner the probe now prints',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'=== 2e. probe-20 falsifiability: the rev-13/rev-14 SESSION-BELL APPEARANCE (t6) ==='",
    to: "'=== 2e. probe-20 falsifiability: the rev-13/rev-14/rev-16 SESSION-BELL APPEARANCE (t6, extended r16/t1) ==='",
    count: 1,
    what: 'section 2e title',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: 'declares ELEVEN appearance mutants; each must rewrite the source, redden EXACTLY its declared',
    to: 'declares THIRTEEN appearance mutants; each must rewrite the source, redden EXACTLY its declared',
    count: 1,
    what: 'section 2e prose count',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: 'checks and exit 0, and all eleven red sets must be pairwise different.',
    to: 'checks and exit 0, and all thirteen red sets must be pairwise different.',
    count: 1,
    what: 'section 2e pairwise-distinctness prose',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'fill-hardcoded-hex', 'muted-icon-recolored', 'audible-foreground-recoloured', 'muted-rule-declares-fill', 'bell-glyph-shrunk-to-14', 'bell-svg-hardcoded-14', 'caret-css-hardcoded-12', 'caret-svg-hardcoded-9', 'bell-css-hardcoded-20')",
    to: "'fill-hardcoded-hex', 'muted-icon-recolored', 'audible-foreground-recoloured', 'muted-rule-declares-fill', 'bell-glyph-shrunk-to-14', 'bell-svg-hardcoded-14', 'caret-css-hardcoded-12', 'caret-svg-hardcoded-9', 'bell-css-hardcoded-20', 'bell-caret-gap-removed', 'bell-caret-gap-constant-zeroed')",
    count: 1,
    what: 'the per-mutant loop must cover the two new rev-16 mutants',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '"probe-20 mutants caught exactly as declared: {0}/11"',
    to: '"probe-20 mutants caught exactly as declared: {0}/13"',
    count: 1,
    what: 'the section 2e counter',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'=== 5. legacy probes from rev-1 ... rev-3 (green since r15-t3; a non-zero exit is a FAILURE) ==='",
    to: "'=== 5. legacy probes from rev-1 ... rev-3 (green since r15-t3, re-anchored at rev-16; a non-zero exit is a FAILURE) ==='",
    count: 1,
    what: 'section 5 title: they were green since r15/t3, went red for exactly one fingerprint round, and are green again',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'=== 7b. rev-15 mutation table: every declared mutation re-measured on THESE bytes ==='",
    to: "'=== 7b. rev-16 mutation table: every declared mutation re-measured on THESE bytes ==='",
    count: 1,
    what: 'section 7b title',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'verify-independent/r15t6-mutation-table.mjs refuses to run unless lib/client.js is the rev-15'",
    to: "'verify-independent/r15t6-mutation-table.mjs refuses to run unless lib/client.js is the rev-16'",
    count: 1,
    what: 'section 7b prose',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'bytes, re-runs all 29 declared probe-11/17/18/19/20 mutations plus the r15 failure-path mutant'",
    to: "'bytes, re-runs all 31 declared probe-11/17/18/19/20 mutations plus the r15 failure-path mutant'",
    count: 1,
    what: 'section 7b row count (29 + the 2 rev-16 gap mutants)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'(one run, ten declared red checks) and writes _raw/r15-t6-mutation-table.json/.md. Any row that'",
    to: "'(one run, ten declared red checks) and writes _raw/r16-t1-mutation-table.json/.md. Any row that'",
    count: 1,
    what: 'section 7b output paths',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "(Select-String -Path $mutationTableLog -Pattern '^r15 mutation table: ' -Encoding UTF8 | Select-Object -Last 1).Line",
    to: "(Select-String -Path $mutationTableLog -Pattern '^r16 mutation table: ' -Encoding UTF8 | Select-Object -Last 1).Line",
    count: 1,
    what: 'the banner pattern must match what the table script now prints',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'every harness suite exited 0 (124 / 371 / 22 / 75 = 592 checks); every probe of the run-r4 ... run-r12 set'",
    to: "'every harness suite exited 0 (124 / 373 / 22 / 75 = 594 checks); every probe of the run-r4 ... run-r12 set'",
    count: 1,
    what: 'the green summary: +2 client-half assertions (the same string the r13y doc-counts checker greps for)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'browser engine); ALL TWENTY-NINE declared probe-11/17/18/19/20 mutants (section 2b x1, 2c x1,'",
    to: "'browser engine); ALL THIRTY-ONE declared probe-11/17/18/19/20 mutants (section 2b x1, 2c x1,'",
    count: 1,
    what: 'summary mutation count',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'2d x5, 2e x11, 3 x9 -- re-run row by row in section 7b) plus the r15t2 rev-14 regression mutant'",
    to: "'2d x5, 2e x13, 3 x9 -- re-run row by row in section 7b) plus the r15t2 rev-14 regression mutant'",
    count: 1,
    what: 'summary section-2e breakdown',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'are byte-identical to the rev-15 manifest before and after; the four .scratch reviewer probes still'",
    to: "'are byte-identical to the rev-16 manifest before and after; the four .scratch reviewer probes still'",
    count: 1,
    what: 'summary frozen-manifest line',
  },
];

/* ------------------------------------------------------------------ the apply */

/** The target file's own end-of-line convention, so a multi-line `to` never rewrites the file's EOLs. */
const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

const report = [];
const problems = [];
const touched = new Map();

for (const row of rows) {
  const path = join(PLUGIN, row.file);
  if (!touched.has(path)) touched.set(path, readFileSync(path, 'utf8'));
  const text = touched.get(path);
  const eol = eolOf(text);
  const from = row.from.split('\n').join(eol);
  const to = row.to.split('\n').join(eol);
  const occurrences = text.split(from).length - 1;
  const ok = occurrences === row.count;
  report.push({ file: row.file, count: occurrences, want: row.count, ok, what: row.what });
  if (!ok) {
    problems.push(`${row.file}: expected ${row.count} occurrence(s), found ${occurrences} -- ${row.what}`);
    continue;
  }
  touched.set(path, text.split(from).join(to));
}

if (problems.length > 0) {
  console.error('REFUSING TO WRITE -- the worktree is not the one these rows were written against:');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\n${report.filter((r) => !r.ok).length} of ${report.length} rows did not match. Nothing was written.`);
  process.exit(1);
}

const total = report.reduce((sum, row) => sum + row.count, 0);
console.log(`r16 / t1 re-anchor -- ${report.length} rows, ${total} exact substitutions, all counts matched.`);
for (const row of report) console.log(`  ${String(row.count).padStart(2)}x  ${row.file}  ::  ${row.what}`);

if (!WRITE) {
  console.log('\ndry run: nothing written. Re-run with --write to apply (old bytes are archived first).');
  process.exit(0);
}

mkdirSync(ARCHIVE, { recursive: true });
const manifest = [];
for (const [path, next] of touched) {
  const before = readFileSync(path);
  const relPath = path.slice(PLUGIN.length + 1).replace(/\\/g, '/');
  const name = relPath.replace(/[\\/]/g, '__');
  const archivePath = join(ARCHIVE, `${name}.${sha256(before).slice(0, 8)}.txt`);
  copyFileSync(path, archivePath);
  writeFileSync(path, next, 'utf8');
  const after = readFileSync(path);
  manifest.push({
    file: relPath,
    beforeBytes: before.length,
    beforeSha: sha256(before),
    afterBytes: after.length,
    afterSha: sha256(after),
    archivedAt: `verify-independent/_raw/r16-t1-archive/${name}.${sha256(before).slice(0, 8)}.txt`,
  });
}
writeFileSync(join(RAW, 'r16-t1-reanchor.json'), `${JSON.stringify({ rows: report, files: manifest }, null, 2)}\n`, 'utf8');

console.log('\nwritten (old bytes archived under verify-independent/_raw/r16-t1-archive/):');
for (const entry of manifest) {
  console.log(`  ${entry.file}`);
  console.log(`    before ${String(entry.beforeBytes).padStart(7)} B  ${entry.beforeSha}`);
  console.log(`    after  ${String(entry.afterBytes).padStart(7)} B  ${entry.afterSha}`);
}

/* ------------------------------------------------- the numbers the docs must carry */

const fingerprint = (relPath) => {
  const buffer = readFileSync(join(WORKSPACE, relPath));
  return { bytes: buffer.length, sha: sha256(buffer) };
};
console.log('\nthe fingerprint table for the docs (measured after the re-anchor):');
for (const relPath of [
  'dsh-approval-chime/lib/client.js',
  'dsh-approval-chime/lib/index.js',
  'dsh-approval-chime/verify/client-half.test.mjs',
  'dsh-approval-chime/verify/custom-audio.test.mjs',
  'dsh-approval-chime/verify-independent/probe-17-r7-section.mjs',
  'dsh-approval-chime/verify-independent/probe-18-r10-sessions.mjs',
  'dsh-approval-chime/verify-independent/probe-19-r12-select-parity.mjs',
  'dsh-approval-chime/verify-independent/probe-20-r14-bell-appearance.mjs',
  'dsh-approval-chime/verify-independent/r15t2-independent-probe.mjs',
  'dsh-approval-chime/verify-independent/r15t6-mutation-table.mjs',
  'dsh-approval-chime/verify-independent/run-r13.ps1',
  'dsh-approval-chime/verify-independent/probe-8-client-roster-render.mjs',
  'dsh-approval-chime/verify-independent/probe-2-gain-and-resources.mjs',
]) {
  const row = fingerprint(relPath);
  console.log(`  ${relPath}  ${row.bytes} B  ${row.sha}`);
}
const archiveCount = statSync(ARCHIVE).isDirectory() && existsSync(ARCHIVE) ? manifest.length : 0;
console.log(`\n${archiveCount} file(s) archived; ${manifest.length} file(s) rewritten.`);
