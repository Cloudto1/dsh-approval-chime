/**
 * r18 / t1 -- re-anchor every LIVE fingerprint of `lib/client.js` from rev-17 to rev-18.
 *
 * WHY THIS FILE EXISTS
 * rev-18 is the answer to a device report (`要有过渡动画能看到在转动的箭头` -- the rev-17 turn could not
 * be seen on a real phone). It changes two things in `lib/client.js`: the transition duration
 * constant `CARET_ROTATE_MS` (160 -> 300 ms) and a NEW top-level diagnostic
 * `__DSH_APPROVAL_CHIME__.reduceMotion()`, which says live whether THIS page is under
 * `(prefers-reduced-motion: reduce)`. Touching `lib/client.js` at all expires every assertion that
 * pins the shipped artifact, which is exactly what those assertions are for. rev-15, rev-16 and
 * rev-17 met the same situation (r15t6-reanchor-fingerprints.mjs, r16-t1-reanchor.mjs,
 * r17-t1-reanchor.mjs); this is the same instrument one revision later, with the same three
 * differences that matter:
 *
 *   1. every row carries the EXACT number of occurrences it must replace, and a row whose count is
 *      wrong aborts the whole run BEFORE anything is written -- a re-anchor that silently replaces
 *      nothing (or one occurrence too many) is the failure mode this file exists to prevent;
 *   2. the frozen-manifest rows of run-r13.ps1 are not typed by hand: the new byte count and sha256
 *      are MEASURED from the files on disk in this run and substituted, so the manifest cannot
 *      disagree with the worktree it was recorded from;
 *   3. the canonical runner's OWN LOG PREFIX rows are in THIS batch, not in a follow-up. That is the
 *      r16/t1 mistake (see _raw/r16-t1-mislabelled-r15-logs/README.md): a forgotten prefix row made
 *      the first rev-16 canonical run overwrite the rev-15 logs. `r17-` -> `r18-` is row 41 below,
 *      in the same atomic write.
 *
 * ARCHIVING DISCIPLINE (made stricter this round)
 * The r17/t1 round lost the rev-17 intermediate bytes of `verify/client-half.test.mjs` and
 * `verify/custom-audio.test.mjs`, because those two files are edited BY HAND by t1 while this
 * instrument only archives the files IT rewrites. rev-18 therefore archives three groups, and
 * `PROVENANCE.md` names which group each copy belongs to:
 *   - "live snapshot": read from the worktree by this run, immediately before it writes;
 *   - "hand-edit snapshot": read from the worktree by this run, for the files this run does not
 *     rewrite (the docs, the doc-counts checker) -- their edits happen afterwards;
 *   - "hash-verified copy": a rev-17 baseline that already exists elsewhere in the workspace, copied
 *     in ONLY if its sha256 still equals the value the rev-17 record declares (`PRESERVED` below);
 *     the source path is printed so the claim can be re-derived.
 *
 * SECOND MODE, ON PURPOSE: this file is also the round's POST-STATE verifier. Run it before the
 * write and it reports every row's exact occurrence count and exits 0 as a dry run; run it after
 * the write and it detects that every `from` is gone AND every `to` is present exactly the declared
 * number of times, reports "already applied (post-state verified)" and exits 0 as well. Any third
 * state -- a half-applied worktree -- is refused with the offending rows named. `--write` is
 * impossible in the post-state: there is nothing left to replace.
 *
 * WHAT IT DOES NOT TOUCH
 * Historical records stay exactly as they are: the rev-15/rev-16/rev-17 anchors inside CHANGELOG.md,
 * docs/变异覆盖与残留红.md, r15t6-reanchor-fingerprints.mjs, r16-t1-reanchor.mjs, r17-t1-reanchor.mjs,
 * r15t2-assertion-inventory.mjs and every `_raw/` archive. Those are the record of what earlier
 * rounds measured; rewriting them would destroy the only evidence that the fingerprints were ever
 * different.
 *
 *     node verify-independent/r18-t1-reanchor.mjs            # dry-run: report only
 *     node verify-independent/r18-t1-reanchor.mjs --write    # apply, after archiving old bytes
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, '..');
const WORKSPACE = join(PLUGIN, '..');
const RAW = join(HERE, '_raw');
const ARCHIVE = join(RAW, 'r18-t1-archive');
const WRITE = process.argv.includes('--write');

const SHA17 = 'B4A0A1B323A9BC9A99803EDBE28E770DE1097162165B16000995DD8E84A4A2F4';
const SHA18 = '1C8DB24CA492CE2A27B6BEC10A3366612F2F5AD7294D39E8B9D4D78C2FC8B54D';
const BYTES17 = 154457;
const BYTES18 = 156937;
const HALF17 = '97EEB2D05C5277C6AF6DB1B015E9A0C6AEF3CB717945E58D25823E77BF7588F1';
const HALF18 = 'AB6F7E4833EBD15488BB3214007462540186A2893DE7553922ABCD232FBD8731';
const AUDIO17 = '523572EA2ADC896FD1BD38B450600D7E2F021FD8C55DB1CF523DF0C03B9FF8EE';
const AUDIO18 = '6EF2F162F0E92CC5904297219DF98D7FF6113ED97138C6A9AF47480C3F89D87F';
const STAMP17 = 'rev-17 · the caret turns to point down';
const STAMP18 = 'rev-18 · the caret turn is slow enough to see';

const CLIENT = join(PLUGIN, 'lib', 'client.js');
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase();

/* --------------------------------------------------------------- preconditions */

const shipped = readFileSync(CLIENT);
if (shipped.length !== BYTES18 || sha256(shipped) !== SHA18) {
  console.error(`REFUSING: lib/client.js is ${shipped.length} B / ${sha256(shipped)}, not the rev-18 artifact ${BYTES18} B / ${SHA18}`);
  console.error('(this instrument belongs to the r18/t1 round; a later revision needs its own)');
  process.exit(1);
}
const shippedText = shipped.toString('utf8');
if (!shippedText.includes(`var REVISION = '${STAMP18}';`)) {
  console.error(`REFUSING: the rev-18 artifact does not carry the rev-18 stamp '${STAMP18}'`);
  process.exit(1);
}

/** The frozen-manifest files whose bytes rev-18 really moved, measured here -- never typed. */
const measured = (relPath) => {
  const buffer = readFileSync(join(PLUGIN, relPath));
  return { bytes: buffer.length, sha: sha256(buffer) };
};
const clientNow = measured('lib/client.js');
const clientHalfNow = measured('verify/client-half.test.mjs');
const customAudioNow = measured('verify/custom-audio.test.mjs');
if (clientNow.bytes !== BYTES18 || clientNow.sha !== SHA18) {
  console.error('REFUSING: the measured lib/client.js does not match the declared rev-18 fingerprint');
  process.exit(1);
}
if (clientHalfNow.bytes === 0 || customAudioNow.bytes === 0) {
  console.error('REFUSING: a harness suite measured as 0 bytes');
  process.exit(1);
}
for (const [name, row, sha] of [
  ['verify/client-half.test.mjs', clientHalfNow, HALF18],
  ['verify/custom-audio.test.mjs', customAudioNow, AUDIO18],
]) {
  if (row.sha !== sha) {
    console.error(`REFUSING: ${name} hashes to ${row.sha}, not the rev-18 fingerprint ${sha} the round recorded`);
    process.exit(1);
  }
}

/** The human-readable tag used in the runner prose. */
const ROUND = 'r18/t1';

/**
 * Every row: { file, from, to, count, what }. `count` is the number of occurrences the shipped
 * bytes must contain -- checked, not assumed. Multi-line `to` values are joined with the target
 * file's own end-of-line convention.
 */
const rows = [
  /* ---- probe-17: the frozen artifact fingerprints and the revision stamp ---- */
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: "'lib/client.js byte count is what rev-17 claims'",
    to: "'lib/client.js byte count is what rev-18 claims'",
    count: 1,
    what: 'assertion name (rev-17 -> rev-18)',
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: `CLIENT_BYTES, ${BYTES17}`,
    to: `CLIENT_BYTES, ${BYTES18}`,
    count: 1,
    what: `frozen client byte count ${BYTES17} -> ${BYTES18}`,
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: "'lib/client.js sha256 is what rev-17 claims'",
    to: "'lib/client.js sha256 is what rev-18 claims'",
    count: 1,
    what: 'assertion name (the sha256 one)',
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: `'${SHA17}'`,
    to: `'${SHA18}'`,
    count: 1,
    what: 'frozen client sha256',
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: "'the bundleRevision badge shows the rev-17 stamp'",
    to: "'the bundleRevision badge shows the rev-18 stamp'",
    count: 1,
    what: 'assertion name (rev-17 -> rev-18)',
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: "'the revision stamp is the rev-17 one'",
    to: "'the revision stamp is the rev-18 one'",
    count: 1,
    what: 'assertion name (rev-17 -> rev-18)',
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: '/rev-17/.test(diagnostics.revision)',
    to: '/rev-18/.test(diagnostics.revision)',
    count: 1,
    what: 'stamp regex',
  },

  /* ---- probe-18 / probe-19: the stamp and the frozen factory fingerprint ---- */
  {
    file: 'verify-independent/probe-18-r10-sessions.mjs',
    from: `const EXPECTED_REVISION = '${STAMP17}';`,
    to: `const EXPECTED_REVISION = '${STAMP18}';`,
    count: 1,
    what: 'EXPECTED_REVISION',
  },
  {
    file: 'verify-independent/probe-19-r12-select-parity.mjs',
    from: `    bytes: ${BYTES17},`,
    to: `    bytes: ${BYTES18},`,
    count: 1,
    what: 'FROZEN.client.bytes',
  },
  {
    file: 'verify-independent/probe-19-r12-select-parity.mjs',
    from: `    sha256: '${SHA17}',`,
    to: `    sha256: '${SHA18}',`,
    count: 1,
    what: 'FROZEN.client.sha256',
  },
  {
    file: 'verify-independent/probe-19-r12-select-parity.mjs',
    from: `  revision: '${STAMP17}',`,
    to: `  revision: '${STAMP18}',`,
    count: 1,
    what: 'FROZEN.revision',
  },

  /* ---- the two legacy probes that name the revision under test ---- */
  {
    file: 'verify-independent/probe-8-client-roster-render.mjs',
    from: "under test (rev-17)', String(diagnostics.revision).includes('rev-17')",
    to: "under test (rev-18)', String(diagnostics.revision).includes('rev-18')",
    count: 1,
    what: 'legacy probe-8: the check name and the literal it guards (one row, two tokens)',
  },
  {
    file: 'verify-independent/probe-2-gain-and-resources.mjs',
    from: 'the five the rev-17 source has',
    to: 'the five the rev-18 source has',
    count: 1,
    what: 'legacy probe-2: assertion NAME only -- the measured value (five fetch call sites) is unchanged by rev-18',
  },

  /* ---- the r15t2 failure-path probe: frozen bytes + its own labels ---- */
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: `  sha256: '${SHA17}',`,
    to: `  sha256: '${SHA18}',`,
    count: 1,
    what: 'FROZEN.sha256',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: `  bytes: ${BYTES17},`,
    to: `  bytes: ${BYTES18},`,
    count: 1,
    what: 'FROZEN.bytes',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: `  revision: '${STAMP17}',`,
    to: `  revision: '${STAMP18}',`,
    count: 1,
    what: 'FROZEN.revision',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: '/** The frozen rev-17 bytes this probe is anchored to (t7 close-out). */',
    to: '/** The frozen rev-18 bytes this probe is anchored to (t7 close-out). */',
    count: 1,
    what: 'FROZEN doc comment',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: "'A1: lib/client.js is the frozen rev-17 byte sequence'",
    to: "'A1: lib/client.js is the frozen rev-18 byte sequence'",
    count: 1,
    what: 'check name A1',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: 'the version of the bundle this repo ships as rev-17',
    to: 'the version of the bundle this repo ships as rev-18',
    count: 1,
    what: 'the AUTHOR string',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: "let sourceLabel = 'shipped rev-17 bytes';",
    to: "let sourceLabel = 'shipped rev-18 bytes';",
    count: 1,
    what: 'the source label printed in the run header',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: '=== shipped rev-17 run: ',
    to: '=== shipped rev-18 run: ',
    count: 1,
    what: 'the summary banner run-r13.ps1 falls back to when a probe prints no ### line',
  },

  /* ---- the mutation table instrument ---- */
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: `const FROZEN = { sha256: '${SHA17}', bytes: ${BYTES17} };`,
    to: `const FROZEN = { sha256: '${SHA18}', bytes: ${BYTES18} };`,
    count: 1,
    what: 'the refused-unless fingerprint',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: 'const EXPECTED_ROWS = 39;',
    to: 'const EXPECTED_ROWS = 45;',
    count: 1,
    what: 'row count: 44 shared mutations (29 + 2 rev-16 gap + 7 rev-17 caret-turn + 6 rev-18 reduce-motion) + 1 r15t2 failure-path row',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "  ['probe-20-r14-bell-appearance', 'caret-turn-also-when-closed'],\n];",
    to: "  ['probe-20-r14-bell-appearance', 'caret-turn-also-when-closed'],\n"
      + "  ['probe-20-r14-bell-appearance', 'reduce-motion-boolean-snapshot'],\n"
      + "  ['probe-20-r14-bell-appearance', 'reduce-motion-always-false'],\n"
      + "  ['probe-20-r14-bell-appearance', 'reduce-motion-always-true'],\n"
      + "  ['probe-20-r14-bell-appearance', 'reduce-motion-cached-after-first-call'],\n"
      + "  ['probe-20-r14-bell-appearance', 'reduce-motion-asks-the-wrong-query'],\n"
      + "  ['probe-20-r14-bell-appearance', 'reduce-motion-snapshotted-into-sessionIcon'],\n];",
    count: 1,
    what: 'the six r18/t2 reduce-motion mutants join the table, names verbatim from the probe',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: '`r17-mut-${probe}-${mutation}.txt`',
    to: '`r18-mut-${probe}-${mutation}.txt`',
    count: 1,
    what: 'per-mutant log name',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'r17-mut-r15t2-independent-probe-sessionsreadfailed-reverted.txt'",
    to: "'r18-mut-r15t2-independent-probe-sessionsreadfailed-reverted.txt'",
    count: 1,
    what: 'the failure-path mutant log name',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'r17-t1-mutation-table.json'",
    to: "'r18-t1-mutation-table.json'",
    count: 1,
    what: 'the machine-readable table (the rev-17 one stays on disk as history)',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'r17-t1-mutation-table.md'",
    to: "'r18-t1-mutation-table.md'",
    count: 1,
    what: 'the human-readable table',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "  revision: 'rev-17',",
    to: "  revision: 'rev-18',",
    count: 1,
    what: 'the revision field of the emitted table',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'# r17 · the rev-17 mutation table (every declared mutation re-measured on the rev-17 bytes)'",
    to: "'# r18 · the rev-18 mutation table (every declared mutation re-measured on the rev-18 bytes)'",
    count: 1,
    what: 'the markdown heading',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: '(raw logs: _raw/r17-mut-*.txt)',
    to: '(raw logs: _raw/r18-mut-*.txt)',
    count: 1,
    what: 'the log directory note',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: 'declared mutations on the rev-17 bytes rewrite the evaluated source',
    to: 'declared mutations on the rev-18 bytes rewrite the evaluated source',
    count: 1,
    what: 'the RESULT line of the markdown',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: '`r17 mutation table: rows=',
    to: '`r18 mutation table: rows=',
    count: 1,
    what: 'the console banner run-r13.ps1 greps for (both sides move together)',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: 'declared mutations is ok on the rev-17 bytes.',
    to: 'declared mutations is ok on the rev-18 bytes.',
    count: 1,
    what: 'the final console RESULT',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: ' * r15 / t6, re-anchored by r16 / t1 and then by r17 / t1 -- the MUTATION TABLE: every declared\n'
      + ' * mutation re-measured on the rev-17 bytes. The instrument is the r15 round\'s; only its\n'
      + ' * fingerprints and its row list move, round after round.',
    to: ' * r15 / t6, re-anchored by r16 / t1, by r17 / t1 and then by r18 / t1 -- the MUTATION TABLE:\n'
      + ' * every declared mutation re-measured on the rev-18 bytes. The instrument is the r15 round\'s;\n'
      + ' * only its fingerprints and its row list move, round after round.',
    count: 1,
    what: 'header line 1-3',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: ' *   - it REFUSES to run unless lib/client.js is the rev-17 bytes (sha256 + size asserted), so a',
    to: ' *   - it REFUSES to run unless lib/client.js is the rev-18 bytes (sha256 + size asserted), so a',
    count: 1,
    what: 'header refusal note',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: ' *   - its logs are `_raw/r17-mut-*.txt`, so the r13c, r15 AND r16 logs stay untouched;',
    to: ' *   - its logs are `_raw/r18-mut-*.txt`, so the r13c, r15, r16 AND r17 logs stay untouched;',
    count: 1,
    what: 'header log note',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: ' * exits 0 only when every row is ok and the row count is the declared 39.',
    to: ' * exits 0 only when every row is ok and the row count is the declared 45.',
    count: 1,
    what: 'header row-count note',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: '/** The 29 mutations the r13c table declared + the 2 r16/t1 gap mutants + the 7 r17/t2 caret-turn\n * mutants, re-run on the rev-17 bytes. */',
    to: '/** The 29 mutations the r13c table declared + the 2 r16/t1 gap mutants + the 7 r17/t2 caret-turn\n * mutants + the 6 r18/t2 reduce-motion mutants, re-run on the rev-18 bytes. */',
    count: 1,
    what: 'MUTATIONS doc comment',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: 'not the rev-17 artifact',
    to: 'not the rev-18 artifact',
    count: 1,
    what: 'the refusal message',
  },

  /* ---- the canonical runner: manifest rows, counts, prose, log prefix ---- */
  {
    file: 'verify-independent/run-r13.ps1',
    from: `  @{ path = 'lib\\client.js';               bytes = ${BYTES17}; sha = '${SHA17}' },`,
    to: `  @{ path = 'lib\\client.js';               bytes = ${clientNow.bytes}; sha = '${clientNow.sha}' },`,
    count: 1,
    what: 'frozen manifest row (MEASURED from disk in this run)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: `  @{ path = 'verify\\client-half.test.mjs'; bytes = 95803;  sha = '${HALF17}' },`,
    to: `  @{ path = 'verify\\client-half.test.mjs'; bytes = ${clientHalfNow.bytes};  sha = '${clientHalfNow.sha}' },`,
    count: 1,
    what: '+11 assertions (399 checks) -- MEASURED from disk in this run',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: `  @{ path = 'verify\\custom-audio.test.mjs'; bytes = 20263; sha = '${AUDIO17}' },`,
    to: `  @{ path = 'verify\\custom-audio.test.mjs'; bytes = ${customAudioNow.bytes}; sha = '${customAudioNow.sha}' },`,
    count: 1,
    what: 'the :267 version literal again -- MEASURED from disk in this run',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: `    @{ path = (Join-Path $plugin 'lib\\client.js'); bytes = ${BYTES17}; sha = '${SHA17}' },`,
    to: `    @{ path = (Join-Path $plugin 'lib\\client.js'); bytes = ${clientNow.bytes}; sha = '${clientNow.sha}' },`,
    count: 1,
    what: 'section 0c anchor row (MEASURED from disk in this run)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# Independent rev-17 full regression run (r17/t1, the caret turns down while the popover is open).',
    to: `# Independent rev-18 full regression run (${ROUND}, the caret turn is slower and a new live diagnostic separates the two causes).`,
    count: 1,
    what: 'title line',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# logging. Every log this script writes carries the `r17-` prefix; the r4 ... r12b archives, the\n'
      + '# r13-*/r13b-*/r13c-*/r13-final-*/r13w-* evidence of the r12/r13 rounds AND the r15-*/r16-*\n'
      + '# evidence of the r15/r16 rounds under verify-independent/_raw/ are NEVER overwritten\n'
      + '# (run-r12.ps1 is left exactly as it was). The r16/t1 round learned why this note exists: a\n'
      + '# forgotten prefix row made the first r16/t1 run overwrite the rev-15 logs; see\n'
      + '# _raw/r16-t1-mislabelled-r15-logs/README.md. r17/t1 changed the prefix in the SAME batch.',
    to: '# logging. Every log this script writes carries the `r18-` prefix; the r4 ... r12b archives, the\n'
      + '# r13-*/r13b-*/r13c-*/r13-final-*/r13w-* evidence of the r12/r13 rounds, the r15-*/r16-*/r17-*\n'
      + '# evidence of the r15/r16/r17 rounds under verify-independent/_raw/ are NEVER overwritten\n'
      + '# (run-r12.ps1 is left exactly as it was). The r16/t1 round learned why this note exists: a\n'
      + '# forgotten prefix row made the first r16/t1 run overwrite the rev-15 logs; see\n'
      + '# _raw/r16-t1-mislabelled-r15-logs/README.md. r17/t1 AND r18/t1 moved every prefix row in the\n'
      + '# SAME batch as the rest of the re-anchor.',
    count: 1,
    what: 'log-prefix note: the prefix rule AND the reason it is a rule',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# THE FROZEN MANIFEST -- 9 files, re-anchored to the rev-17 baseline. Re-anchoring this table',
    to: '# THE FROZEN MANIFEST -- 9 files, re-anchored to the rev-18 baseline. Re-anchoring this table',
    count: 1,
    what: 'manifest note',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '#   appearance mutants when it was written (seven rev-14 semantics + four rev-13 geometry ones);\n'
      + '#   the LIVE count is TWENTY after r17/t2 added the seven caret-turn mutants. They run in section 2e',
    to: '#   appearance mutants when it was written (seven rev-14 semantics + four rev-13 geometry ones);\n'
      + '#   the LIVE count is TWENTY-SIX after r17/t2 added the seven caret-turn mutants and r18/t2 the\n'
      + '#   six reduce-motion ones. They run in section 2e',
    count: 1,
    what: 'the t6 paragraph claim: the LIVE mutant count',
  },

  /* ---- the run-r13.ps1 narrative: rev-18 in, the previous round's record pointed at ---- */
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# WHY THIS RUN EXISTS AT rev-17 -- rev-17 is a PURELY APPEARANCE change: the caret beside the\n'
      + '# session-header bell now turns to point down while its popover is open and turns back when it\n'
      + '# closes (user request: "打开的时候箭头向下转一下"). The turn is a TRANSITION on the GLYPH, never\n'
      + '# on the button box: `.dacCaret svg` carries `transition:transform <CARET_ROTATE_MS>ms ease` and\n'
      + '# `transform-origin:center`, the open state reuses the EXISTING `[data-open="true"]` hook, so no\n'
      + '# state was added and no JavaScript computes an angle. `prefers-reduced-motion:reduce` turns the\n'
      + '# transition OFF and never the quarter turn itself -- the rotate rule sits outside the media\n'
      + '# block on purpose, because "less motion" must not mean "no affordance".\n'
      + '#   - lib/client.js 150663 B / 76B4D4E7... -> 154457 B / B4A0A1B3...; diagnostics.revision is now\n'
      + '#     \'rev-17 · the caret turns to point down\'.\n'
      + '#   - verify/client-half.test.mjs 88441 B / B5FC3935... -> 95803 B / 97EEB2D0... (fifteen new\n'
      + '#     assertions: the open turn, the closed state, the transition, the reduced-motion override,\n'
      + '#     the glyph-not-button rule, and the turned glyph still fitting inside the 16x28 button).\n'
      + '#   - verify/custom-audio.test.mjs 20263 B / 5AD07459... -> 20263 B / 523572EA... -- ONE byte\n'
      + '#     (the version literal at :267; the assertion count is unchanged at 83 call sites).\n'
      + '#   - probe-20-r14-bell-appearance.mjs is 30/30 checks (was 23) with 20 declared mutants (was 13).\n'
      + '#   - lib/index.js (the HOST half), verify/host-half.test.mjs, verify/waterfall.test.mjs,\n'
      + '#     verify/_harness.mjs, package.json and cordis.patch.yml are UNCHANGED.\n'
      + '# THE PREVIOUS APPEARANCE ROUND IS RECORDED ELSEWHERE: the narrative that used to sit here (the\n'
      + '# bell/caret gap, its byte counts and its sha256 values) now lives where a previous round\'s\n'
      + '# record belongs -- CHANGELOG.md (the r16/t1 section), docs/变异覆盖与残留红.md section 13,\n'
      + '# _raw/r16-run-console.txt, _raw/r16-t1-mutation-table.json/.md and the archived bytes under\n'
      + '# _raw/r16-t1-archive/. This file POINTS at that record instead of duplicating it, so the only\n'
      + '# revision fingerprints left here are the current round\'s and the rev-15 narrative that was\n'
      + '# already history when r16/t1 ran (see docs §14.4 for the disclosed edit).',
    to: '# WHY THIS RUN EXISTS AT rev-18 -- the user reported on a real device that the caret turn could\n'
      + '# not be SEEN ("要有过渡动画能看到在转动的箭头"). rev-18 answers the half of that a constant can\n'
      + '# answer and refuses to claim the other half:\n'
      + '#   - CARET_ROTATE_MS 160 -> 300. The CSS transition duration is STILL built from that constant\n'
      + '#     (`.dacCaret svg{transition:transform <CARET_ROTATE_MS>ms ease}`), so the stylesheet and the\n'
      + '#     console surface move together and no number is transcribed by hand;\n'
      + '#   - a NEW TOP-LEVEL diagnostic `__DSH_APPROVAL_CHIME__.reduceMotion()` answers LIVE whether\n'
      + '#     THIS page is under `(prefers-reduced-motion: reduce)`. It exists because an arrow that\n'
      + '#     jumps has two causes that look identical on a device: "too fast to see" (the thing the\n'
      + '#     duration change addresses) and "this environment asks for no motion" (in which case the\n'
      + '#     existing media block drops the transition ON PURPOSE and the 90deg terminal state arrives\n'
      + '#     instantly). Without the diagnostic the reader has to guess which one they are looking at.\n'
      + '#   - WHETHER THE TURN IS NOW VISIBLE IS NOT SOMETHING THIS RUN CAN PROVE. Only the user, on the\n'
      + '#     device, can. This run pins the duration constant, the CSS/diagnostic agreement and the\n'
      + '#     three branches of the diagnostic -- nothing about perception.\n'
      + '#   - lib/client.js 154457 B / B4A0A1B3... -> 156937 B / 1C8DB24C...; diagnostics.revision is now\n'
      + '#     \'rev-18 · the caret turn is slow enough to see\'.\n'
      + '#   - verify/client-half.test.mjs 95803 B / 97EEB2D0... -> 100983 B / AB6F7E48... (ELEVEN new\n'
      + '#     assertions, and ONE existing assertion REPLACED by stronger ones: the retired 120-200ms\n'
      + '#     band -- "in which a rotation reads as a turn, not a cut" -- is exactly the judgment the\n'
      + '#     device report overturned, and in its place stand an exact 300ms pin, a "the stylesheet is\n'
      + '#     built from the constant" check and a "there is exactly ONE caret transition rule" check.\n'
      + '#     Net DELETIONS: zero.)\n'
      + '#   - verify/custom-audio.test.mjs 20263 B / 523572EA... -> 20263 B / 6EF2F162... -- ONE byte\n'
      + '#     (the version literal at :267; the assertion count is unchanged at 83 call sites).\n'
      + '#   - probe-20-r14-bell-appearance.mjs is 37/37 checks (was 30) with 26 declared mutants (was 20).\n'
      + '#   - lib/index.js (the HOST half), verify/host-half.test.mjs, verify/waterfall.test.mjs,\n'
      + '#     verify/_harness.mjs, package.json and cordis.patch.yml are UNCHANGED.\n'
      + '# THE PREVIOUS ROUND IS RECORDED ELSEWHERE: the rev-17 narrative that used to sit here (its byte\n'
      + '# counts, its sha256 values and its stamp) now lives where a previous round\'s record belongs --\n'
      + '# CHANGELOG.md (the rev-17 section), docs/变异覆盖与残留红.md section 14, _raw/r17-run-console.txt,\n'
      + '# _raw/r17-t1-mutation-table.json/.md, and the rev-17 baselines archived under _raw/r17-t1-archive/\n'
      + '# and _raw/r18-t1-archive/. This file POINTS at that record instead of duplicating it, so the only\n'
      + '# revision fingerprints left here are the current round\'s and the rev-15 narrative that was\n'
      + '# already history before r16/t1 ran (see docs §14.4 for the disclosed edit).',
    count: 1,
    what: 'the rev-18 WHY block; the rev-17 narrative is replaced by a pointer to its own record',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'=== 0. frozen manifest: 9 recorded files byte-identical to the rev-17 baseline ==='",
    to: "'=== 0. frozen manifest: 9 recorded files byte-identical to the rev-18 baseline ==='",
    count: 1,
    what: 'section 0 title',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'rev-17 changed lib/client.js and verify/: lib/index.js must still be the rev-11 bytes.'",
    to: "'rev-18 changed lib/client.js and verify/: lib/index.js must still be the rev-11 bytes.'",
    count: 1,
    what: 'section 0c note',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "  # '=== shipped rev-17 run: 42/42 checks passed ==='), so fall back to the last non-empty line",
    to: "  # '=== shipped rev-18 run: 42/42 checks passed ==='), so fall back to the last non-empty line",
    count: 1,
    what: 'the fallback-summary comment must quote the banner the probe now prints',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'=== 2e. probe-20 falsifiability: the SESSION-BELL + CARET APPEARANCE (rev-13, rev-14, the r16/t1 gap and the r17/t1 turn) ==='",
    to: "'=== 2e. probe-20 falsifiability: the SESSION-BELL + CARET APPEARANCE and the rev-18 REDUCED-MOTION DIAGNOSTIC (rev-13, rev-14, the r16/t1 gap, the r17/t1 turn) ==='",
    count: 1,
    what: 'section 2e title',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "#   archive stay untouched (each later round moved the prefix again: r15-, r16-, now r17-).",
    to: "#   archive stay untouched (each later round moved the prefix again: r15-, r16-, r17-, now r18-).",
    count: 1,
    what: 'the log-prefix history line, extended by one round',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "declares TWENTY appearance mutants; each must rewrite the source, redden EXACTLY its declared",
    to: "declares TWENTY-SIX appearance mutants; each must rewrite the source, redden EXACTLY its declared",
    count: 1,
    what: 'section 2e prose count',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "checks and exit 0, and all twenty red sets must be pairwise different.",
    to: "checks and exit 0, and all twenty-six red sets must be pairwise different.",
    count: 1,
    what: 'section 2e pairwise-distinctness prose',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'caret-turn-transition-dropped', 'caret-turn-rule-dropped', 'caret-turn-angle-45-deg', 'caret-turn-ms-250', 'caret-turn-reduced-motion-dropped', 'caret-turn-moved-to-button', 'caret-turn-also-when-closed')) {",
    to: "'caret-turn-transition-dropped', 'caret-turn-rule-dropped', 'caret-turn-angle-45-deg', 'caret-turn-ms-250', 'caret-turn-reduced-motion-dropped', 'caret-turn-moved-to-button', 'caret-turn-also-when-closed', 'reduce-motion-boolean-snapshot', 'reduce-motion-always-false', 'reduce-motion-always-true', 'reduce-motion-cached-after-first-call', 'reduce-motion-asks-the-wrong-query', 'reduce-motion-snapshotted-into-sessionIcon')) {",
    count: 1,
    what: 'the per-mutant loop must cover all twenty-six declared appearance mutants',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '"probe-20 mutants caught exactly as declared: {0}/20"',
    to: '"probe-20 mutants caught exactly as declared: {0}/26"',
    count: 1,
    what: 'the section 2e counter',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'=== 5. legacy probes from rev-1 ... rev-3 (green since r15-t3, re-anchored at rev-17; a non-zero exit is a FAILURE) ==='",
    to: "'=== 5. legacy probes from rev-1 ... rev-3 (green since r15-t3, re-anchored at rev-18; a non-zero exit is a FAILURE) ==='",
    count: 1,
    what: 'section 5 title',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'=== 7b. rev-17 mutation table: every declared mutation re-measured on THESE bytes ==='",
    to: "'=== 7b. rev-18 mutation table: every declared mutation re-measured on THESE bytes ==='",
    count: 1,
    what: 'section 7b title',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'verify-independent/r15t6-mutation-table.mjs refuses to run unless lib/client.js is the rev-17'",
    to: "'verify-independent/r15t6-mutation-table.mjs refuses to run unless lib/client.js is the rev-18'",
    count: 1,
    what: 'section 7b prose',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'bytes, re-runs all 38 declared probe-11/17/18/19/20 mutations plus the r15 failure-path mutant'",
    to: "'bytes, re-runs all 44 declared probe-11/17/18/19/20 mutations plus the r15 failure-path mutant'",
    count: 1,
    what: 'section 7b row count (44 + the r15t2 row = the 45-row table)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'(one run, ten declared red checks) and writes _raw/r17-t1-mutation-table.json/.md. Any row that'",
    to: "'(one run, ten declared red checks) and writes _raw/r18-t1-mutation-table.json/.md. Any row that'",
    count: 1,
    what: 'section 7b output paths',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'every harness suite exited 0 (124 / 388 / 22 / 75 = 609 checks); every probe of the run-r4 ... run-r12 set'",
    to: "'every harness suite exited 0 (124 / 399 / 22 / 75 = 620 checks); every probe of the run-r4 ... run-r12 set'",
    count: 1,
    what: 'the green summary: +11 client-half assertions (the same string the r13y doc-counts checker greps for)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'browser engine); ALL THIRTY-EIGHT declared probe-11/17/18/19/20 mutants (section 2b x1, 2c x1,'",
    to: "'browser engine); ALL FORTY-FOUR declared probe-11/17/18/19/20 mutants (section 2b x1, 2c x1,'",
    count: 1,
    what: 'summary mutation count',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'2d x5, 2e x20, 3 x9 -- re-run row by row in section 7b) plus the r15t2 rev-14 regression mutant'",
    to: "'2d x5, 2e x26, 3 x9 -- re-run row by row in section 7b) plus the r15t2 rev-14 regression mutant'",
    count: 1,
    what: 'summary section-2e breakdown',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'are byte-identical to the rev-17 manifest before and after; the four .scratch reviewer probes still'",
    to: "'are byte-identical to the rev-18 manifest before and after; the four .scratch reviewer probes still'",
    count: 1,
    what: 'summary frozen-manifest line',
  },

  /* ---- the canonical runner's own log prefix: r17- -> r18- (the r16/t1 mistake, paid for) ---- */
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'r17-baseline-before.txt'",
    to: "'r18-baseline-before.txt'",
    count: 1,
    what: 'frozen manifest, before (log prefix)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'r17-baseline-after.txt'",
    to: "'r18-baseline-after.txt'",
    count: 1,
    what: 'frozen manifest, after (log prefix)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'r17-frozen-diff.txt'",
    to: "'r18-frozen-diff.txt'",
    count: 1,
    what: 'frozen manifest diff (log prefix)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '"r17-dev-',
    to: '"r18-dev-',
    count: 1,
    what: 'the four harness suite logs (log prefix)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: 'r17-ind-',
    to: 'r18-ind-',
    count: 9,
    what: 'every independent-probe log, incl. the mutation and race logs (log prefix)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '"r17-legacy-',
    to: '"r18-legacy-',
    count: 1,
    what: 'the ten legacy probe logs (log prefix)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '"r17-reviewer-',
    to: '"r18-reviewer-',
    count: 1,
    what: 'the four .scratch reviewer logs (log prefix)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'r17-t1-mutation-table-console.txt'",
    to: "'r18-t1-mutation-table-console.txt'",
    count: 1,
    what: 'section 7b console log (log prefix)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "$mutationTableLog -Pattern '^r17 mutation table: ' -Encoding UTF8",
    to: "$mutationTableLog -Pattern '^r18 mutation table: ' -Encoding UTF8",
    count: 1,
    what: 'the grep that reads the banner back (print side and read side move together -- the r17/t1 failure)',
  },
];

/**
 * Files this round edits BY HAND, so the re-anchor cannot archive them itself. They are copied
 * verbatim into the same archive directory, before the first edit, with the old sha256 in the name.
 * r18/t1 registers this list explicitly because the rev-17 round lost two such snapshots.
 */
const ARCHIVE_ONLY = [
  'CHANGELOG.md',
  'README.md',
  'docs/变异覆盖与残留红.md',
  'docs/挂载与验收.md',
  'verify-independent/_raw/r13y-doc-counts.mjs',
];

/**
 * rev-17 baselines that already exist elsewhere in the workspace. Each is copied into this round's
 * archive ONLY after its sha256 is re-measured and found equal to the value the rev-17 record
 * declares -- so the archive holds every intermediate state this round's diff crosses, and
 * `PROVENANCE.md` can say for each copy whether it is a live snapshot or a hash-verified copy of a
 * baseline that was preserved by another task.
 */
const PRESERVED = [
  {
    source: 'verify-independent/_raw/r18-t1-preserved/verify__client-half.test.mjs.97EEB2D05C5277C6.txt',
    name: 'verify__client-half.test.mjs',
    sha: HALF17,
    bytes: 95803,
    note: 'rev-17 factory bytes of the author suite (kept by r18/t1 from the r17/t4 review shadow); sha-verified before copying',
  },
  {
    source: 'verify-independent/_raw/r18-t1-preserved/verify__custom-audio.test.mjs.523572EA.txt',
    name: 'verify__custom-audio.test.mjs',
    sha: AUDIO17,
    bytes: 20263,
    note: 'rev-17 factory bytes of the audio suite; r18/t1 rebuilt it by reverting the single version literal, and this copy re-hashes to the rev-17 record value',
  },
  {
    source: 'verify-independent/_raw/r18-t1-before-lib-client.js.txt',
    name: 'lib__client.js',
    sha: SHA17,
    bytes: BYTES17,
    note: 'rev-17 factory bytes of the product file, snapshotted by r18/t1 before the r18 implementation touched it (the copy is the one r18-t1 archived)',
  },
  {
    source: 'verify-independent/_raw/r17-t4-review/falsify/verify-independent/probe-20-shadow.mjs',
    name: 'verify-independent__probe-20-r14-bell-appearance.mjs',
    sha: '203C039013F77B482D737BFA8D1F6F2E63C1B98C89C9FC61A92101BC4B5C12CC',
    bytes: 50689,
    note: 'rev-17 bytes of probe-20 (30 checks / 20 mutants), kept by r17/t4 as a falsification shadow and re-hashed here -- so the rev-17 probe declaration is machine-checkable against a copy instead of staying unchecked',
  },
];

/* ------------------------------------------------------------------ the apply */

/** The target file's own end-of-line convention, so a multi-line `to` never rewrites the file's EOLs. */
const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

const report = [];
const problems = [];
const touched = new Map();
let applied = 0;
let alreadyApplied = 0;

for (const row of rows) {
  const path = join(PLUGIN, row.file);
  if (!touched.has(path)) touched.set(path, readFileSync(path, 'utf8'));
  const text = touched.get(path);
  const eol = eolOf(text);
  const from = row.from.split('\n').join(eol);
  const to = row.to.split('\n').join(eol);
  const occurrences = text.split(from).length - 1;
  if (occurrences === row.count) {
    applied += 1;
    report.push({ file: row.file, count: occurrences, want: row.count, ok: true, mode: 'pre', what: row.what });
    touched.set(path, text.split(from).join(to));
    continue;
  }
  const postOccurrences = text.split(to).length - 1;
  if (occurrences === 0 && postOccurrences === row.count) {
    alreadyApplied += 1;
    report.push({ file: row.file, count: occurrences, want: row.count, ok: true, mode: 'post', what: row.what });
    continue;
  }
  report.push({ file: row.file, count: occurrences, want: row.count, ok: false, mode: 'none', what: row.what });
  problems.push(
    `${row.file}: expected ${row.count} occurrence(s) of the PRE-edit literal, found ${occurrences}`
    + ` (and ${postOccurrences} of the post-edit literal) -- ${row.what}`,
  );
}

if (problems.length > 0) {
  console.error('REFUSING TO WRITE -- the worktree is not the one these rows were written against:');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\n${report.filter((r) => !r.ok).length} of ${report.length} rows did not match. Nothing was written.`);
  if (alreadyApplied > 0) console.error(`(note: ${alreadyApplied} row(s) already held the POST-edit literal)`);
  process.exit(1);
}

const total = report.reduce((sum, row) => sum + row.count, 0);
const mode = applied === report.length ? 'pre-state' : 'post-state';
console.log(`r18 / t1 re-anchor -- ${report.length} rows, ${total} exact substitutions, all counts matched (${mode}).`);
for (const row of report) console.log(`  ${String(row.count).padStart(2)}x  ${row.mode}  ${row.file}  ::  ${row.what}`);

if (mode === 'post-state') {
  console.log('\nALREADY APPLIED: every pre-edit literal is gone and every post-edit literal is present the');
  console.log('declared number of times. Nothing to write -- this run verifies the post-state.');
  process.exit(0);
}

if (!WRITE) {
  console.log('\ndry run: nothing written. Re-run with --write to apply (old bytes are archived first).');
  console.log(`also archived by the SAME run (hand-edited after it): ${ARCHIVE_ONLY.length} file(s)`);
  for (const relPath of ARCHIVE_ONLY) console.log(`  ${relPath}`);
  console.log(`plus ${PRESERVED.length} hash-verified rev-17 baseline copy/copies.`);
  process.exit(0);
}

if (mode === 'pre-state') {
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
      group: 'live snapshot (rewritten by this run)',
      beforeBytes: before.length,
      beforeSha: sha256(before),
      afterBytes: after.length,
      afterSha: sha256(after),
      archivedAt: `verify-independent/_raw/r18-t1-archive/${name}.${sha256(before).slice(0, 8)}.txt`,
    });
  }
  /* hand-edited files: archived, not rewritten -- their edits happen after this run */
  const handEdited = [];
  for (const relPath of ARCHIVE_ONLY) {
    const path = join(PLUGIN, relPath);
    if (!existsSync(path)) {
      handEdited.push({ file: relPath, missing: true });
      continue;
    }
    const before = readFileSync(path);
    const name = relPath.replace(/[\\/]/g, '__');
    const archivePath = join(ARCHIVE, `${name}.${sha256(before).slice(0, 8)}.txt`);
    copyFileSync(path, archivePath);
    handEdited.push({
      file: relPath,
      group: 'hand-edit snapshot (edited after this run)',
      beforeBytes: before.length,
      beforeSha: sha256(before),
      archivedAt: `verify-independent/_raw/r18-t1-archive/${name}.${sha256(before).slice(0, 8)}.txt`,
    });
  }
  /* rev-17 baselines preserved elsewhere: copied in only if the hash still matches the record */
  const preserved = [];
  for (const entry of PRESERVED) {
    const source = join(PLUGIN, entry.source);
    const buffer = readFileSync(source);
    const sha = sha256(buffer);
    if (sha !== entry.sha || buffer.length !== entry.bytes) {
      console.error(`REFUSING: preserved baseline ${entry.source} is ${buffer.length} B / ${sha}, not the recorded ${entry.bytes} B / ${entry.sha}`);
      process.exit(1);
    }
    const archivePath = join(ARCHIVE, `${entry.name}.${entry.sha.slice(0, 8)}.txt`);
    copyFileSync(source, archivePath);
    preserved.push({
      file: entry.name.replace(/__/g, '/'),
      group: 'hash-verified copy of a rev-17 baseline preserved by another task',
      source: entry.source,
      bytes: buffer.length,
      sha,
      archivedAt: `verify-independent/_raw/r18-t1-archive/${entry.name}.${entry.sha.slice(0, 8)}.txt`,
      note: entry.note,
    });
  }
  writeFileSync(
    join(RAW, 'r18-t1-reanchor.json'),
    `${JSON.stringify({ rows: report, files: manifest, handEdited, preserved }, null, 2)}\n`,
    'utf8',
  );

  console.log('\nwritten (old bytes archived under verify-independent/_raw/r18-t1-archive/):');
  for (const entry of manifest) {
    console.log(`  ${entry.file}`);
    console.log(`    before ${String(entry.beforeBytes).padStart(7)} B  ${entry.beforeSha}`);
    console.log(`    after  ${String(entry.afterBytes).padStart(7)} B  ${entry.afterSha}`);
  }
  console.log('\narchived for the hand edits that follow (NOT rewritten by this run):');
  for (const entry of handEdited) {
    console.log(`  ${entry.file}${entry.missing ? '  MISSING' : ''}`);
    if (!entry.missing) console.log(`    before ${String(entry.beforeBytes).padStart(7)} B  ${entry.beforeSha}`);
  }
  console.log('\nrev-17 baselines copied in after re-hashing them against the rev-17 record:');
  for (const entry of preserved) {
    console.log(`  ${entry.file}  <- ${entry.source}`);
    console.log(`    ${String(entry.bytes).padStart(7)} B  ${entry.sha}`);
  }

  /* --------------------------------------------- the numbers the docs must carry */
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
    'dsh-approval-chime/verify-independent/probe-11-r4-css-rows.mjs',
    'dsh-approval-chime/verify-independent/probe-17-r7-section.mjs',
    'dsh-approval-chime/verify-independent/probe-18-r10-sessions.mjs',
    'dsh-approval-chime/verify-independent/probe-19-r12-select-parity.mjs',
    'dsh-approval-chime/verify-independent/probe-20-r14-bell-appearance.mjs',
    'dsh-approval-chime/verify-independent/r15t2-independent-probe.mjs',
    'dsh-approval-chime/verify-independent/r15t6-mutation-table.mjs',
    'dsh-approval-chime/verify-independent/run-r13.ps1',
    'dsh-approval-chime/verify-independent/probe-8-client-roster-render.mjs',
    'dsh-approval-chime/verify-independent/probe-2-gain-and-resources.mjs',
    'dsh-approval-chime/verify-independent/r18-t1-reanchor.mjs',
  ]) {
    const row = fingerprint(relPath);
    console.log(`  ${relPath}  ${row.bytes} B  ${row.sha}`);
  }
  const archiveCount = existsSync(ARCHIVE) && statSync(ARCHIVE).isDirectory()
    ? manifest.length + handEdited.filter((entry) => !entry.missing).length + preserved.length
    : 0;
  console.log(`\n${archiveCount} file(s) archived; ${manifest.length} file(s) rewritten by this run.`);
}
