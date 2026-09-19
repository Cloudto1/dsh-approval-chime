/**
 * r17 / t1 -- re-anchor every LIVE fingerprint of `lib/client.js` from rev-16 to rev-17.
 *
 * WHY THIS FILE EXISTS
 * rev-17 is a one-request appearance change (`打开的时候箭头向下转一下` -- the caret beside the
 * session-header bell now turns 90 degrees while its popover is open). Touching `lib/client.js` at
 * all expires every probe assertion that pins the shipped artifact, which is exactly what those
 * assertions are for. rev-15 and rev-16 met the same situation (r15t6-reanchor-fingerprints.mjs,
 * r16-t1-reanchor.mjs); this is the same instrument one revision later, with three differences that
 * matter and one that was PAID FOR:
 *
 *   1. every row carries the EXACT number of occurrences it must replace, and a row whose count is
 *      wrong aborts the whole run BEFORE anything is written -- a re-anchor that silently replaces
 *      nothing (or one occurrence too many) is the failure mode this file exists to prevent;
 *   2. the frozen-manifest rows of run-r13.ps1 are not typed by hand: the new byte count and sha256
 *      are MEASURED from the files on disk in this run and substituted, so the manifest cannot
 *      disagree with the worktree it was recorded from;
 *   3. the canonical runner's OWN LOG PREFIX rows are in THIS batch, not in a follow-up. That is the
 *      r16/t1 mistake (see _raw/r16-t1-mislabelled-r15-logs/README.md): the first rev-16 canonical
 *      run wrote its logs over the rev-15 ones because the prefix rows had been forgotten, so the
 *      one thing this file must not do is let `run-r13.ps1` keep writing `r16-` logs while every
 *      other row moves. `r16-` -> `r17-` is row 39 below, in the same atomic write.
 *
 * SECOND MODE, ON PURPOSE: this file is also the round's POST-STATE verifier. Run it before the
 * write and it reports every row's exact occurrence count and exits 0 as a dry run; run it after
 * the write and it detects that every `from` is gone AND every `to` is present exactly the declared
 * number of times, reports "already applied (post-state verified)" and exits 0 as well. Any third
 * state -- a half-applied worktree -- is refused with the offending rows named. `--write` is
 * impossible in the post-state: there is nothing left to replace.
 *
 * WHAT IT DOES NOT TOUCH
 * Historical records stay exactly as they are: the rev-14/rev-15/rev-16 anchors inside CHANGELOG.md,
 * docs/变异覆盖与残留红.md, r15t6-reanchor-fingerprints.mjs, r16-t1-reanchor.mjs, r15t2-assertion-
 * inventory.mjs and every `_raw/` archive. Those are the record of what earlier rounds measured;
 * rewriting them would destroy the only evidence that the fingerprints were ever different.
 *
 * ONE DELIBERATE EDIT, REGISTERED IN docs/变异覆盖与残留红.md §14.4: `run-r13.ps1` used to carry the
 * previous round's narrative (its byte counts, its sha256 values and its stamp) inside a comment
 * block. That narrative moved out of the live runner and into the places a previous-round record
 * belongs -- CHANGELOG.md `## rev-16`, docs §13, `_raw/r16-run-console.txt` and `_raw/r16-t1-archive/`
 * -- so that no rev-16 fingerprint is left in an assertion-carrying file. Nothing was deleted: the
 * runner now POINTS at the record instead of duplicating it.
 *
 *     node verify-independent/r17-t1-reanchor.mjs            # dry-run: report only
 *     node verify-independent/r17-t1-reanchor.mjs --write    # apply, after archiving old bytes
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, '..');
const WORKSPACE = join(PLUGIN, '..');
const RAW = join(HERE, '_raw');
const ARCHIVE = join(RAW, 'r17-t1-archive');
const WRITE = process.argv.includes('--write');

const SHA16 = '76B4D4E73FFAE5CA47838B2798EE74AE39AB60ADEF2699CF4562D4A89AAAD6FE';
const SHA17 = 'B4A0A1B323A9BC9A99803EDBE28E770DE1097162165B16000995DD8E84A4A2F4';
const BYTES16 = 150663;
const BYTES17 = 154457;
const STAMP16 = 'rev-16 · the bell and the caret stand apart';
const STAMP17 = 'rev-17 · the caret turns to point down';

const CLIENT = join(PLUGIN, 'lib', 'client.js');
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase();

/* --------------------------------------------------------------- preconditions */

const shipped = readFileSync(CLIENT);
if (shipped.length !== BYTES17 || sha256(shipped) !== SHA17) {
  console.error(`REFUSING: lib/client.js is ${shipped.length} B / ${sha256(shipped)}, not the rev-17 artifact ${BYTES17} B / ${SHA17}`);
  console.error('(this instrument belongs to the r17/t1 round; a later revision needs its own)');
  process.exit(1);
}

/** The frozen-manifest files whose bytes rev-17 really moved, measured here -- never typed. */
const measured = (relPath) => {
  const buffer = readFileSync(join(PLUGIN, relPath));
  return { bytes: buffer.length, sha: sha256(buffer) };
};
const clientNow = measured('lib/client.js');
const clientHalfNow = measured('verify/client-half.test.mjs');
const customAudioNow = measured('verify/custom-audio.test.mjs');
if (clientNow.bytes !== BYTES17 || clientNow.sha !== SHA17) {
  console.error('REFUSING: the measured lib/client.js does not match the declared rev-17 fingerprint');
  process.exit(1);
}
for (const [name, row] of [['verify/client-half.test.mjs', clientHalfNow], ['verify/custom-audio.test.mjs', customAudioNow]]) {
  if (row.bytes === 0) {
    console.error(`REFUSING: ${name} measured as 0 bytes`);
    process.exit(1);
  }
}

/* ---------------------------------------------------------------------- rows */

/** The human-readable tag used in the runner prose now that the stamp token is gone from it. */
const ROUND = 'r17/t1';

/**
 * Every row: { file, from, to, count, what }. `count` is the number of occurrences the shipped
 * bytes must contain -- checked, not assumed. Multi-line `to` values are joined with the target
 * file's own end-of-line convention.
 */
const rows = [
  /* ---- probe-17: the frozen artifact fingerprints and the revision stamp ---- */
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: "'lib/client.js byte count is what rev-16 claims'",
    to: "'lib/client.js byte count is what rev-17 claims'",
    count: 1,
    what: 'assertion name (rev-16 -> rev-17)',
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: `CLIENT_BYTES, ${BYTES16}`,
    to: `CLIENT_BYTES, ${BYTES17}`,
    count: 1,
    what: `frozen client byte count ${BYTES16} -> ${BYTES17}`,
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: "'lib/client.js sha256 is what rev-16 claims'",
    to: "'lib/client.js sha256 is what rev-17 claims'",
    count: 1,
    what: 'assertion name (the sha256 one, which the rev-15 round left stale and r16/t1 fixed)',
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: `'${SHA16}'`,
    to: `'${SHA17}'`,
    count: 1,
    what: 'frozen client sha256',
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: "'the bundleRevision badge shows the rev-16 stamp'",
    to: "'the bundleRevision badge shows the rev-17 stamp'",
    count: 1,
    what: 'assertion name (rev-16 -> rev-17)',
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: "'the revision stamp is the rev-16 one'",
    to: "'the revision stamp is the rev-17 one'",
    count: 1,
    what: 'assertion name (rev-16 -> rev-17)',
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: '/rev-16/.test(diagnostics.revision)',
    to: '/rev-17/.test(diagnostics.revision)',
    count: 1,
    what: 'stamp regex',
  },

  /* ---- probe-18 / probe-19: the stamp and the frozen factory fingerprint ---- */
  {
    file: 'verify-independent/probe-18-r10-sessions.mjs',
    from: `'${STAMP16}'`,
    to: `'${STAMP17}'`,
    count: 1,
    what: 'EXPECTED_REVISION',
  },
  {
    file: 'verify-independent/probe-19-r12-select-parity.mjs',
    from: `bytes: ${BYTES16},`,
    to: `bytes: ${BYTES17},`,
    count: 1,
    what: 'FROZEN.bytes',
  },
  {
    file: 'verify-independent/probe-19-r12-select-parity.mjs',
    from: `sha256: '${SHA16}',`,
    to: `sha256: '${SHA17}',`,
    count: 1,
    what: 'FROZEN.sha256',
  },
  {
    file: 'verify-independent/probe-19-r12-select-parity.mjs',
    from: `revision: '${STAMP16}',`,
    to: `revision: '${STAMP17}',`,
    count: 1,
    what: 'FROZEN.revision',
  },

  /* ---- the two legacy probes that name the revision under test ---- */
  {
    file: 'verify-independent/probe-8-client-roster-render.mjs',
    from: "under test (rev-16)', String(diagnostics.revision).includes('rev-16')",
    to: "under test (rev-17)', String(diagnostics.revision).includes('rev-17')",
    count: 1,
    what: 'legacy probe-8: the check name and the literal it guards (one row, two tokens)',
  },
  {
    file: 'verify-independent/probe-2-gain-and-resources.mjs',
    from: 'the five the rev-16 source has',
    to: 'the five the rev-17 source has',
    count: 1,
    what: 'legacy probe-2: assertion NAME only -- the measured value (five fetch call sites) is unchanged by rev-17',
  },

  /* ---- the r15t2 failure-path probe: frozen bytes + its own labels ---- */
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: `sha256: '${SHA16}',`,
    to: `sha256: '${SHA17}',`,
    count: 1,
    what: 'FROZEN.sha256',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: `bytes: ${BYTES16},`,
    to: `bytes: ${BYTES17},`,
    count: 1,
    what: 'FROZEN.bytes',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: `revision: '${STAMP16}',`,
    to: `revision: '${STAMP17}',`,
    count: 1,
    what: 'FROZEN.revision',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: 'The frozen rev-16 bytes this probe is anchored to',
    to: 'The frozen rev-17 bytes this probe is anchored to',
    count: 1,
    what: 'FROZEN doc comment',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: 'A1: lib/client.js is the frozen rev-16 byte sequence',
    to: 'A1: lib/client.js is the frozen rev-17 byte sequence',
    count: 1,
    what: 'check name A1',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: 'the version of the bundle this repo ships as rev-16',
    to: 'the version of the bundle this repo ships as rev-17',
    count: 1,
    what: 'the AUTHOR string',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: "let sourceLabel = 'shipped rev-16 bytes';",
    to: "let sourceLabel = 'shipped rev-17 bytes';",
    count: 1,
    what: 'the source label printed in the run header',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: '=== shipped rev-16 run: ',
    to: '=== shipped rev-17 run: ',
    count: 1,
    what: 'the summary banner run-r13.ps1 falls back to when a probe prints no ### line',
  },

  /* ---- the mutation table instrument ---- */
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: `const FROZEN = { sha256: '${SHA16}', bytes: ${BYTES16} };`,
    to: `const FROZEN = { sha256: '${SHA17}', bytes: ${BYTES17} };`,
    count: 1,
    what: 'the refused-unless fingerprint',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: 'const EXPECTED_ROWS = 32;',
    to: 'const EXPECTED_ROWS = 39;',
    count: 1,
    what: 'row count: 38 shared mutations (29 + 2 rev-16 gap + 7 rev-17 caret-turn) + 1 r15t2 failure-path row',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "  ['probe-20-r14-bell-appearance', 'bell-caret-gap-constant-zeroed'],\n];",
    to: "  ['probe-20-r14-bell-appearance', 'bell-caret-gap-constant-zeroed'],\n"
      + "  ['probe-20-r14-bell-appearance', 'caret-turn-transition-dropped'],\n"
      + "  ['probe-20-r14-bell-appearance', 'caret-turn-rule-dropped'],\n"
      + "  ['probe-20-r14-bell-appearance', 'caret-turn-angle-45-deg'],\n"
      + "  ['probe-20-r14-bell-appearance', 'caret-turn-ms-250'],\n"
      + "  ['probe-20-r14-bell-appearance', 'caret-turn-reduced-motion-dropped'],\n"
      + "  ['probe-20-r14-bell-appearance', 'caret-turn-moved-to-button'],\n"
      + "  ['probe-20-r14-bell-appearance', 'caret-turn-also-when-closed'],\n];",
    count: 1,
    what: 'the seven r17/t2 caret-turn mutants join the table, names verbatim from the probe',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: '`r16-mut-${probe}-${mutation}.txt`',
    to: '`r17-mut-${probe}-${mutation}.txt`',
    count: 1,
    what: 'per-mutant log name',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'r16-mut-r15t2-independent-probe-sessionsreadfailed-reverted.txt'",
    to: "'r17-mut-r15t2-independent-probe-sessionsreadfailed-reverted.txt'",
    count: 1,
    what: 'the failure-path mutant log name',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'r16-t1-mutation-table.json'",
    to: "'r17-t1-mutation-table.json'",
    count: 1,
    what: 'the machine-readable table (the rev-16 one stays on disk as history)',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'r16-t1-mutation-table.md'",
    to: "'r17-t1-mutation-table.md'",
    count: 1,
    what: 'the human-readable table',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "  revision: 'rev-16',",
    to: "  revision: 'rev-17',",
    count: 1,
    what: 'the revision field of the emitted table',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'# r16 · the rev-16 mutation table (every declared mutation re-measured on the rev-16 bytes)'",
    to: "'# r17 · the rev-17 mutation table (every declared mutation re-measured on the rev-17 bytes)'",
    count: 1,
    what: 'the markdown heading',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: '(raw logs: _raw/r16-mut-*.txt)',
    to: '(raw logs: _raw/r17-mut-*.txt)',
    count: 1,
    what: 'the log directory note',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: 'declared mutations on the rev-16 bytes rewrite the evaluated source',
    to: 'declared mutations on the rev-17 bytes rewrite the evaluated source',
    count: 1,
    what: 'the RESULT line of the markdown',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: '`r16 mutation table: rows=',
    to: '`r17 mutation table: rows=',
    count: 1,
    what: 'the console banner run-r13.ps1 greps for (both sides move together)',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: 'declared mutations is ok on the rev-16 bytes.',
    to: 'declared mutations is ok on the rev-17 bytes.',
    count: 1,
    what: 'the final console RESULT',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: ' * r15 / t6, re-anchored by r16 / t1 -- the MUTATION TABLE: every declared mutation re-measured\n'
      + ' * on the rev-16 bytes. The instrument is the r15 round\'s; only its fingerprints and its row list move.',
    to: ' * r15 / t6, re-anchored by r16 / t1 and then by r17 / t1 -- the MUTATION TABLE: every declared\n'
      + ' * mutation re-measured on the rev-17 bytes. The instrument is the r15 round\'s; only its\n'
      + ' * fingerprints and its row list move, round after round.',
    count: 1,
    what: 'header line 1-3',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: ' *   - it REFUSES to run unless lib/client.js is the rev-16 bytes (sha256 + size asserted), so a\n'
      + ' *     table for another revision can never be mislabelled as this one;',
    to: ' *   - it REFUSES to run unless lib/client.js is the rev-17 bytes (sha256 + size asserted), so a\n'
      + ' *     table for another revision can never be mislabelled as this one;',
    count: 1,
    what: 'header refusal note',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: ' *   - its logs are `_raw/r16-mut-*.txt`, so the r13c AND r15 logs stay untouched;',
    to: ' *   - its logs are `_raw/r17-mut-*.txt`, so the r13c, r15 AND r16 logs stay untouched;',
    count: 1,
    what: 'header log note',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: ' * exits 0 only when every row is ok and the row count is the declared 32.',
    to: ' * exits 0 only when every row is ok and the row count is the declared 39.',
    count: 1,
    what: 'header row-count note',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: '/** The 29 mutations the r13c table declared plus the 2 rev-16 gap mutants, re-run on the rev-16 bytes. */',
    to: '/** The 29 mutations the r13c table declared + the 2 r16/t1 gap mutants + the 7 r17/t2 caret-turn\n * mutants, re-run on the rev-17 bytes. */',
    count: 1,
    what: 'MUTATIONS doc comment',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: 'not the rev-15 artifact',
    to: 'not the rev-17 artifact',
    count: 1,
    what: 'the refusal message still named rev-15 two rounds late -- corrected to the round it guards',
  },

  /* ---- the canonical runner: manifest rows, counts, prose, log prefix ---- */
  {
    file: 'verify-independent/run-r13.ps1',
    from: `  @{ path = 'lib\\client.js';               bytes = ${BYTES16}; sha = '${SHA16}' },`,
    to: `  @{ path = 'lib\\client.js';               bytes = ${clientNow.bytes}; sha = '${clientNow.sha}' },`,
    count: 1,
    what: 'frozen manifest row (MEASURED from disk in this run)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: `  @{ path = 'verify\\client-half.test.mjs'; bytes = 88441;  sha = 'B5FC3935EA5CB81814C2501C811B15C5C2EF5EB88624808AA3B03A618BCC0D9D' },`,
    to: `  @{ path = 'verify\\client-half.test.mjs'; bytes = ${clientHalfNow.bytes};  sha = '${clientHalfNow.sha}' },`,
    count: 1,
    what: '+15 assertions (388 checks) -- MEASURED from disk in this run',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: `  @{ path = 'verify\\custom-audio.test.mjs'; bytes = 20263; sha = '5AD07459C62401FB8DFC16079AD59A9FA2D5BBAD04591DF48FF12623ECBC387C' },`,
    to: `  @{ path = 'verify\\custom-audio.test.mjs'; bytes = ${customAudioNow.bytes}; sha = '${customAudioNow.sha}' },`,
    count: 1,
    what: 'the :267 version literal again -- MEASURED from disk in this run',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: `    @{ path = (Join-Path $plugin 'lib\\client.js'); bytes = ${BYTES16}; sha = '${SHA16}' },`,
    to: `    @{ path = (Join-Path $plugin 'lib\\client.js'); bytes = ${clientNow.bytes}; sha = '${clientNow.sha}' },`,
    count: 1,
    what: 'section 0c anchor row (MEASURED from disk in this run)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# Independent rev-16 full regression run (r16 / t1, captain-direct appearance change).',
    to: `# Independent rev-17 full regression run (${ROUND}, the caret turns down while the popover is open).`,
    count: 1,
    what: 'title line',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# logging. Every log this script writes carries the `r16-` prefix; the r4 ... r12b archives AND\n'
      + '# the r13-*/r13b-*/r13c-*/r13-final-*/r13w-* evidence of the r12/r13 rounds under\n'
      + '# verify-independent/_raw/ are NEVER overwritten (run-r12.ps1 is left exactly as it was).',
    to: '# logging. Every log this script writes carries the `r17-` prefix; the r4 ... r12b archives, the\n'
      + '# r13-*/r13b-*/r13c-*/r13-final-*/r13w-* evidence of the r12/r13 rounds AND the r15-*/r16-*\n'
      + '# evidence of the r15/r16 rounds under verify-independent/_raw/ are NEVER overwritten\n'
      + '# (run-r12.ps1 is left exactly as it was). The r16/t1 round learned why this note exists: a\n'
      + '# forgotten prefix row made the first r16/t1 run overwrite the rev-15 logs; see\n'
      + '# _raw/r16-t1-mislabelled-r15-logs/README.md. r17/t1 changed the prefix in the SAME batch.',
    count: 1,
    what: 'log-prefix note: the prefix rule AND the reason it is a rule',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# THE FROZEN MANIFEST -- 9 files, recorded from the rev-15 worktree. Re-anchoring this table\n'
      + '# is the ONLY edit a future revision should need here (plus the two anchors in section 0c).',
    to: '# THE FROZEN MANIFEST -- 9 files, re-anchored to the rev-17 baseline. Re-anchoring this table\n'
      + '# is the ONLY edit a future revision should need here (plus the two anchors in section 0c).',
    count: 1,
    what: 'manifest note: it claimed to be "recorded from the rev-15 worktree" two rounds later',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '#   surface `__DSH_APPROVAL_CHIME__.sessionIcon` and the rendered bell/caret, and declares ELEVEN\n'
      + '#   appearance mutants (seven rev-14 semantics + four rev-13 geometry ones). They run in section 2e',
    to: '#   surface `__DSH_APPROVAL_CHIME__.sessionIcon` and the rendered bell/caret, and declared ELEVEN\n'
      + '#   appearance mutants when it was written (seven rev-14 semantics + four rev-13 geometry ones);\n'
      + '#   the LIVE count is TWENTY after r17/t2 added the seven caret-turn mutants. They run in section 2e',
    count: 1,
    what: 'the t6 paragraph claim that went stale at r16/t1 and is fixed here',
  },

  /* ---- the run-r13.ps1 narrative: rev-17 in, the previous round's record pointed at ---- */
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# WHY THIS RUN EXISTS AT rev-16 -- rev-16 is a PURELY APPEARANCE change, the first of its kind\n'
      + '# since rev-14. The session-header bell and its caret sit in one inline-flex wrapper, and the\n'
      + '# chevron fills only 11px of its own 16px box, so with no gap the blue square and the drawn arrow\n'
      + '# were 2.5px apart and read as ONE control (user report: "这个铃铛和箭头分开点"). The wrapper now\n'
      + '# carries `gap:BELL_GAP_PX` = 6px (the host\'s own inter-chip rhythm), the constant is on the\n'
      + '# console surface as sessionIcon.bellGapPx, and probe-20 declares TWO mutants for it -- one for\n'
      + '# each half of the conjunction -- so neither the CSS nor the constant can drift alone.\n'
      + '#   - lib/client.js 149196 B / 32F0E31F... -> 150663 B / 76B4D4E7...; diagnostics.revision is now\n'
      + '#     \'rev-16 ... the bell and the caret stand apart\'.\n'
      + '#   - verify/client-half.test.mjs 88005 B / BB2C1A34... -> 88441 B / B5FC3935... (two new geometry\n'
      + '#     assertions: the wrapper rule carries the reported gap, and the reported gap is 6px).\n'
      + '#   - verify/custom-audio.test.mjs 20263 B / D13A8D63... -> 20263 B / the new sha -- ONE byte\n'
      + '#     (the version literal at :267; the assertion count is unchanged at 83 call sites).\n'
      + '#   - probe-20-r14-bell-appearance.mjs is 23/23 checks (was 22) with 13 declared mutants (was 11).\n'
      + '#   - lib/index.js (the HOST half), verify/host-half.test.mjs, verify/waterfall.test.mjs,\n'
      + '#     verify/_harness.mjs, package.json and cordis.patch.yml are UNCHANGED.\n',
    to: '# WHY THIS RUN EXISTS AT rev-17 -- rev-17 is a PURELY APPEARANCE change: the caret beside the\n'
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
      + '# already history when r16/t1 ran (see docs §14.4 for the disclosed edit).\n',
    count: 1,
    what: 'the rev-17 WHY block; the rev-16 narrative is replaced by a pointer to its own record',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "#     'rev-15 ... a failed re-read keeps the mutes' (and is 'rev-16 ... the bell and the caret stand\n"
      + "#     apart' since r16/t1).",
    to: "#     'rev-15 ... a failed re-read keeps the mutes' (the stamp that superseded it belongs to the\n"
      + '#     r16/t1 round and is quoted in that round\'s record, not in this file).',
    count: 1,
    what: 'the rev-15 delta bullet must not quote the following round\'s stamp either',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'=== 0. frozen manifest: 9 recorded files byte-identical to the rev-16 baseline ==='",
    to: "'=== 0. frozen manifest: 9 recorded files byte-identical to the rev-17 baseline ==='",
    count: 1,
    what: 'section 0 title',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'rev-16 changed lib/client.js and verify/: lib/index.js must still be the rev-11 bytes.'",
    to: "'rev-17 changed lib/client.js and verify/: lib/index.js must still be the rev-11 bytes.'",
    count: 1,
    what: 'section 0c note',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "  # '=== shipped rev-16 run: 42/42 checks passed ==='), so fall back to the last non-empty line",
    to: "  # '=== shipped rev-17 run: 42/42 checks passed ==='), so fall back to the last non-empty line",
    count: 1,
    what: 'the fallback-summary comment must quote the banner the probe now prints',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'=== 2e. probe-20 falsifiability: the rev-13/rev-14/rev-16 SESSION-BELL APPEARANCE (t6, extended r16/t1) ==='",
    to: "'=== 2e. probe-20 falsifiability: the SESSION-BELL + CARET APPEARANCE (rev-13, rev-14, the r16/t1 gap and the r17/t1 turn) ==='",
    count: 1,
    what: 'section 2e title',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '#   relaxed; the runner\'s log prefix moved to `r13w-` so the r12/r13 logs and t5\'s r13-final-*\n'
      + '#   archive stay untouched. Evidence for this round: _raw/r13w-*, plus the report',
    to: '#   relaxed; the runner\'s log prefix moved to `r13w-` so the r12/r13 logs and t5\'s r13-final-*\n'
      + '#   archive stay untouched (each later round moved the prefix again: r15-, r16-, now r17-).\n'
      + '#   Evidence for this round: _raw/r13w-*, plus the report',
    count: 1,
    what: 'the log-prefix history line, extended by one round',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: 'declares THIRTEEN appearance mutants; each must rewrite the source, redden EXACTLY its declared',
    to: 'declares TWENTY appearance mutants; each must rewrite the source, redden EXACTLY its declared',
    count: 1,
    what: 'section 2e prose count',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: 'checks and exit 0, and all thirteen red sets must be pairwise different.',
    to: 'checks and exit 0, and all twenty red sets must be pairwise different.',
    count: 1,
    what: 'section 2e pairwise-distinctness prose',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'fill-hardcoded-hex', 'muted-icon-recolored', 'audible-foreground-recoloured', 'muted-rule-declares-fill', 'bell-glyph-shrunk-to-14', 'bell-svg-hardcoded-14', 'caret-css-hardcoded-12', 'caret-svg-hardcoded-9', 'bell-css-hardcoded-20', 'bell-caret-gap-removed', 'bell-caret-gap-constant-zeroed')",
    to: "'fill-hardcoded-hex', 'muted-icon-recolored', 'audible-foreground-recoloured', 'muted-rule-declares-fill', 'bell-glyph-shrunk-to-14', 'bell-svg-hardcoded-14', 'caret-css-hardcoded-12', 'caret-svg-hardcoded-9', 'bell-css-hardcoded-20', 'bell-caret-gap-removed', 'bell-caret-gap-constant-zeroed', 'caret-turn-transition-dropped', 'caret-turn-rule-dropped', 'caret-turn-angle-45-deg', 'caret-turn-ms-250', 'caret-turn-reduced-motion-dropped', 'caret-turn-moved-to-button', 'caret-turn-also-when-closed')",
    count: 1,
    what: 'the per-mutant loop must cover all twenty declared appearance mutants',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '"probe-20 mutants caught exactly as declared: {0}/13"',
    to: '"probe-20 mutants caught exactly as declared: {0}/20"',
    count: 1,
    what: 'the section 2e counter',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'=== 5. legacy probes from rev-1 ... rev-3 (green since r15-t3, re-anchored at rev-16; a non-zero exit is a FAILURE) ==='",
    to: "'=== 5. legacy probes from rev-1 ... rev-3 (green since r15-t3, re-anchored at rev-17; a non-zero exit is a FAILURE) ==='",
    count: 1,
    what: 'section 5 title',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'=== 7b. rev-16 mutation table: every declared mutation re-measured on THESE bytes ==='",
    to: "'=== 7b. rev-17 mutation table: every declared mutation re-measured on THESE bytes ==='",
    count: 1,
    what: 'section 7b title',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "$mutationTableLog -Pattern '^r16 mutation table: ' -Encoding UTF8",
    to: "$mutationTableLog -Pattern '^r17 mutation table: ' -Encoding UTF8",
    count: 1,
    what: 'the grep that reads the banner back. r17/t1 FORGOT this row at first: the print side moved to r17, the read side stayed r16, and section 7b printed an empty summary while still exiting 0. Caught by reading the canonical console, fixed here, and the fix is verified by re-running the whole canonical round (docs §14.9)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'verify-independent/r15t6-mutation-table.mjs refuses to run unless lib/client.js is the rev-16'",
    to: "'verify-independent/r15t6-mutation-table.mjs refuses to run unless lib/client.js is the rev-17'",
    count: 1,
    what: 'section 7b prose',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'bytes, re-runs all 31 declared probe-11/17/18/19/20 mutations plus the r15 failure-path mutant'",
    to: "'bytes, re-runs all 38 declared probe-11/17/18/19/20 mutations plus the r15 failure-path mutant'",
    count: 1,
    what: 'section 7b row count (38 + the r15t2 row = the 39-row table)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'(one run, ten declared red checks) and writes _raw/r16-t1-mutation-table.json/.md. Any row that'",
    to: "'(one run, ten declared red checks) and writes _raw/r17-t1-mutation-table.json/.md. Any row that'",
    count: 1,
    what: 'section 7b output paths',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'every harness suite exited 0 (124 / 373 / 22 / 75 = 594 checks); every probe of the run-r4 ... run-r12 set'",
    to: "'every harness suite exited 0 (124 / 388 / 22 / 75 = 609 checks); every probe of the run-r4 ... run-r12 set'",
    count: 1,
    what: 'the green summary: +15 client-half assertions (the same string the r13y doc-counts checker greps for)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'browser engine); ALL THIRTY-ONE declared probe-11/17/18/19/20 mutants (section 2b x1, 2c x1,'",
    to: "'browser engine); ALL THIRTY-EIGHT declared probe-11/17/18/19/20 mutants (section 2b x1, 2c x1,'",
    count: 1,
    what: 'summary mutation count',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'2d x5, 2e x13, 3 x9 -- re-run row by row in section 7b) plus the r15t2 rev-14 regression mutant'",
    to: "'2d x5, 2e x20, 3 x9 -- re-run row by row in section 7b) plus the r15t2 rev-14 regression mutant'",
    count: 1,
    what: 'summary section-2e breakdown',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'are byte-identical to the rev-16 manifest before and after; the four .scratch reviewer probes still'",
    to: "'are byte-identical to the rev-17 manifest before and after; the four .scratch reviewer probes still'",
    count: 1,
    what: 'summary frozen-manifest line',
  },

  /* ---- the canonical runner's own log prefix: r16- -> r17- (the r16/t1 mistake, paid for) ---- */
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'r16-baseline-before.txt'",
    to: "'r17-baseline-before.txt'",
    count: 1,
    what: 'frozen manifest, before (log prefix)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'r16-baseline-after.txt'",
    to: "'r17-baseline-after.txt'",
    count: 1,
    what: 'frozen manifest, after (log prefix)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'r16-frozen-diff.txt'",
    to: "'r17-frozen-diff.txt'",
    count: 1,
    what: 'frozen manifest diff (log prefix)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '"r16-dev-',
    to: '"r17-dev-',
    count: 1,
    what: 'the four harness suite logs (log prefix)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: 'r16-ind-',
    to: 'r17-ind-',
    count: 9,
    what: 'every independent-probe log, incl. the mutation and race logs (log prefix)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '"r16-legacy-',
    to: '"r17-legacy-',
    count: 1,
    what: 'the ten legacy probe logs (log prefix)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '"r16-reviewer-',
    to: '"r17-reviewer-',
    count: 1,
    what: 'the four .scratch reviewer logs (log prefix)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "'r16-t1-mutation-table-console.txt'",
    to: "'r17-t1-mutation-table-console.txt'",
    count: 1,
    what: 'section 7b console log (log prefix)',
  },
];

/**
 * Files this round edits BY HAND, so the re-anchor cannot archive them itself. They are copied
 * verbatim into the same archive directory, before the first edit, with the old sha256 in the name.
 */
const ARCHIVE_ONLY = [
  'CHANGELOG.md',
  'README.md',
  'docs/变异覆盖与残留红.md',
  'docs/挂载与验收.md',
  'verify-independent/_raw/r13y-doc-counts.mjs',
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
console.log(`r17 / t1 re-anchor -- ${report.length} rows, ${total} exact substitutions, all counts matched (${mode}).`);
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
      beforeBytes: before.length,
      beforeSha: sha256(before),
      afterBytes: after.length,
      afterSha: sha256(after),
      archivedAt: `verify-independent/_raw/r17-t1-archive/${name}.${sha256(before).slice(0, 8)}.txt`,
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
      beforeBytes: before.length,
      beforeSha: sha256(before),
      archivedAt: `verify-independent/_raw/r17-t1-archive/${name}.${sha256(before).slice(0, 8)}.txt`,
    });
  }
  writeFileSync(join(RAW, 'r17-t1-reanchor.json'), `${JSON.stringify({ rows: report, files: manifest, handEdited }, null, 2)}\n`, 'utf8');

  console.log('\nwritten (old bytes archived under verify-independent/_raw/r17-t1-archive/):');
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
    'dsh-approval-chime/verify-independent/probe-17-r7-section.mjs',
    'dsh-approval-chime/verify-independent/probe-18-r10-sessions.mjs',
    'dsh-approval-chime/verify-independent/probe-19-r12-select-parity.mjs',
    'dsh-approval-chime/verify-independent/probe-20-r14-bell-appearance.mjs',
    'dsh-approval-chime/verify-independent/r15t2-independent-probe.mjs',
    'dsh-approval-chime/verify-independent/r15t6-mutation-table.mjs',
    'dsh-approval-chime/verify-independent/run-r13.ps1',
    'dsh-approval-chime/verify-independent/probe-8-client-roster-render.mjs',
    'dsh-approval-chime/verify-independent/probe-2-gain-and-resources.mjs',
    'dsh-approval-chime/verify-independent/r17-t1-reanchor.mjs',
  ]) {
    const row = fingerprint(relPath);
    console.log(`  ${relPath}  ${row.bytes} B  ${row.sha}`);
  }
  const archiveCount = existsSync(ARCHIVE) && statSync(ARCHIVE).isDirectory() ? manifest.length + handEdited.filter((e) => !e.missing).length : 0;
  console.log(`\n${archiveCount} file(s) archived; ${manifest.length} file(s) rewritten by this run.`);
}
