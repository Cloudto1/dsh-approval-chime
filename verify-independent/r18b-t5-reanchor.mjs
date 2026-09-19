/**
 * r18b / t5 -- re-anchor every LIVE fingerprint after the repair that changed lib/client.js's BYTES
 * without changing its behaviour.
 *
 * WHY THIS FILE EXISTS
 * The r18/t1 product stamp said the caret turn was `slow enough to see` -- a claim about perception
 * rendered on the settings page and quoted by README/验收 docs -- and its constant comment stated two
 * more perceptual claims as fact. The repair round (r18b/t5) replaces the stamp with a testable fact
 * (`rev-18 · the caret turn takes 300 ms`) and demotes the two comment sentences to an explicit
 * JUDGMENT. Nothing else in the product moves: the angle, the curve, the reduced-motion semantics and
 * the diagnostic are untouched.
 *
 * Touching lib/client.js at all expires every assertion that pins the shipped artifact, which is
 * exactly what those assertions are for. rev-15, rev-16, rev-17 and rev-18/t1 met the same situation;
 * this is the same instrument one SUB-ROUND later (r18b/t5), with the discipline of r18/t1 kept:
 *
 *   1. every row carries the EXACT number of occurrences it must replace, and a row whose count is
 *      wrong aborts the whole run BEFORE anything is written -- a re-anchor that silently replaces
 *      nothing (or one occurrence too many) is the failure mode this file exists to prevent;
 *   2. the frozen-manifest rows of run-r13.ps1 are not typed by hand: the new byte count and sha256
 *      are MEASURED from lib/client.js on disk in this run and substituted, so the manifest cannot
 *      disagree with the worktree it was recorded from;
 *   3. the pre-edit bytes of every file this run rewrites must ALREADY exist in
 *      `_raw/r18b-t5-archive/` under a name carrying their own sha256 -- checked here, so "we archived
 *      it first" is a precondition of writing, not a promise;
 *   4. the canonical runner's OWN LOG PREFIX moves in THIS batch (`r18-` -> `r18b-`): the r16/t1
 *      mistake was a forgotten prefix row, which overwrote the previous round's logs. The r18/t1
 *      logs, archives and mutation table are EVIDENCE a quality gate has already reviewed and this
 *      round must not touch a byte of them.
 *
 * SECOND MODE, ON PURPOSE: this file is also the sub-round's POST-STATE verifier. Run it before the
 * write and it reports every row's exact occurrence count and exits 0 as a dry run; run it after the
 * write and it detects that every `from` is gone AND every `to` is present exactly the declared
 * number of times, reports "already applied (post-state verified)" and exits 0 as well. Any third
 * state -- a half-applied worktree -- is refused with the offending rows named.
 *
 * WHAT IT DOES NOT TOUCH
 * Historical records stay exactly as they are: CHANGELOG.md, the rev-17/rev-18 sections of
 * docs/变异覆盖与残留红.md, the earlier re-anchor instruments, every `_raw/r18-*` and earlier archive,
 * and `lib/index.js` (zero bytes changed since rev-11).
 *
 *     node verify-independent/r18b-t5-reanchor.mjs            # dry-run: report only
 *     node verify-independent/r18b-t5-reanchor.mjs --write    # apply, after archiving old bytes
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, '..');
const RAW = join(HERE, '_raw');
const ARCHIVE = join(RAW, 'r18b-t5-archive');
const WRITE = process.argv.includes('--write');

const OLD = {
  bytes: 156937,
  sha: '1C8DB24CA492CE2A27B6BEC10A3366612F2F5AD7294D39E8B9D4D78C2FC8B54D',
  stamp: 'rev-18 · the caret turn is slow enough to see',
};
const NEW = {
  bytes: 157296,
  sha: '7FE150A0C1A89D6797ED3491F8CC74251CD7FD64DD8FA708621BA33FB9F49C45',
  stamp: 'rev-18 · the caret turn takes 300 ms',
};
const SUBROUND = 'r18b/t5';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase();
const CLIENT = join(PLUGIN, 'lib', 'client.js');
const shipped = readFileSync(CLIENT);
const clientNow = { bytes: shipped.length, sha: sha256(shipped) };
const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');
const withEol = (text, eol) => text.split('\n').join(eol);

/* --------------------------------------------------------------- preconditions */

if (clientNow.bytes !== NEW.bytes || clientNow.sha !== NEW.sha) {
  console.error(`REFUSING: lib/client.js is ${clientNow.bytes} B / ${clientNow.sha}, not the repaired artifact ${NEW.bytes} B / ${NEW.sha}`);
  process.exit(1);
}
const shippedText = shipped.toString('utf8');
if (!shippedText.includes(`var REVISION = '${NEW.stamp}';`)) {
  console.error(`REFUSING: the repaired artifact does not carry the repaired stamp '${NEW.stamp}'`);
  process.exit(1);
}
if (shippedText.includes(OLD.stamp)) {
  console.error(`REFUSING: the repaired artifact still carries the retired stamp '${OLD.stamp}'`);
  process.exit(1);
}

/**
 * Every row: { file, from, to, count, what }. `count` is the number of occurrences the file on disk
 * must contain -- checked, not assumed. A `to` may span lines (joined with the file's own EOL).
 */
const rows = [
  /* ---- probe-17: the frozen artifact fingerprint ---- */
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: `CLIENT_BYTES, ${OLD.bytes}`,
    to: `CLIENT_BYTES, ${clientNow.bytes}`,
    count: 1,
    what: 'frozen byte count (the assertion NAME still says rev-18 -- that is the round, not the size)',
  },
  {
    file: 'verify-independent/probe-17-r7-section.mjs',
    from: `'${OLD.sha}'`,
    to: `'${clientNow.sha}'`,
    count: 1,
    what: 'frozen client sha256',
  },
  /* ---- probe-18: the stamp the probe expects from the console surface ---- */
  {
    file: 'verify-independent/probe-18-r10-sessions.mjs',
    from: `const EXPECTED_REVISION = '${OLD.stamp}';`,
    to: `const EXPECTED_REVISION = '${NEW.stamp}';`,
    count: 1,
    what: 'EXPECTED_REVISION',
  },
  /* ---- probe-19: the FROZEN block ---- */
  {
    file: 'verify-independent/probe-19-r12-select-parity.mjs',
    from: `    bytes: ${OLD.bytes},`,
    to: `    bytes: ${clientNow.bytes},`,
    count: 1,
    what: 'FROZEN.client.bytes',
  },
  {
    file: 'verify-independent/probe-19-r12-select-parity.mjs',
    from: `    sha256: '${OLD.sha}',`,
    to: `    sha256: '${clientNow.sha}',`,
    count: 1,
    what: 'FROZEN.client.sha256',
  },
  {
    file: 'verify-independent/probe-19-r12-select-parity.mjs',
    from: `  revision: '${OLD.stamp}',`,
    to: `  revision: '${NEW.stamp}',`,
    count: 1,
    what: 'FROZEN.revision',
  },
  /* ---- r15t2: the failure-path probe's frozen anchor ---- */
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: `  sha256: '${OLD.sha}',`,
    to: `  sha256: '${clientNow.sha}',`,
    count: 1,
    what: 'FROZEN.sha256',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: `  bytes: ${OLD.bytes},`,
    to: `  bytes: ${clientNow.bytes},`,
    count: 1,
    what: 'FROZEN.bytes',
  },
  {
    file: 'verify-independent/r15t2-independent-probe.mjs',
    from: `  revision: '${OLD.stamp}',`,
    to: `  revision: '${NEW.stamp}',`,
    count: 1,
    what: 'FROZEN.revision',
  },
  /* ---- the mutation table: fingerprint, log prefix and table paths ---- */
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: `const FROZEN = { sha256: '${OLD.sha}', bytes: ${OLD.bytes} };`,
    to: `const FROZEN = { sha256: '${clientNow.sha}', bytes: ${clientNow.bytes} };`,
    count: 1,
    what: 'the refused-unless fingerprint',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: '`r18-mut-${probe}-${mutation}.txt`',
    to: '`r18b-mut-${probe}-${mutation}.txt`',
    count: 1,
    what: 'per-mutant log name (the r18/t1 logs stay untouched)',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'r18-mut-r15t2-independent-probe-sessionsreadfailed-reverted.txt'",
    to: "'r18b-mut-r15t2-independent-probe-sessionsreadfailed-reverted.txt'",
    count: 1,
    what: 'the failure-path mutant log name',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'r18-t1-mutation-table.json'",
    to: "'r18b-t1-mutation-table.json'",
    count: 1,
    what: 'the machine-readable table (the r18/t1 one stays on disk as evidence)',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'r18-t1-mutation-table.md'",
    to: "'r18b-t1-mutation-table.md'",
    count: 1,
    what: 'the human-readable table',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: '(raw logs: _raw/r18-mut-*.txt)',
    to: '(raw logs: _raw/r18b-mut-*.txt)',
    count: 1,
    what: 'the log directory note in the markdown',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: ' *   - its logs are `_raw/r18-mut-*.txt`, so the r13c, r15, r16 AND r17 logs stay untouched;',
    to: ' *   - its logs are `_raw/r18b-mut-*.txt`, so the r13c, r15, r16, r17 AND r18 logs stay untouched;',
    count: 1,
    what: 'header log note',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: ' * r15 / t6, re-anchored by r16 / t1, by r17 / t1 and then by r18 / t1 -- the MUTATION TABLE:',
    to: ' * r15 / t6, re-anchored by r16 / t1, by r17 / t1, by r18 / t1 and now by r18b / t5 -- the MUTATION TABLE:',
    count: 1,
    what: 'header line 1',
  },
  /* ---- the canonical runner: the frozen manifest (MEASURED, never typed) ---- */
  {
    file: 'verify-independent/run-r13.ps1',
    from: `  @{ path = 'lib\\client.js';               bytes = ${OLD.bytes}; sha = '${OLD.sha}' },`,
    to: `  @{ path = 'lib\\client.js';               bytes = ${clientNow.bytes}; sha = '${clientNow.sha}' },`,
    count: 1,
    what: 'frozen manifest row (MEASURED from disk in this run)',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: `    @{ path = (Join-Path $plugin 'lib\\client.js'); bytes = ${OLD.bytes}; sha = '${OLD.sha}' },`,
    to: `    @{ path = (Join-Path $plugin 'lib\\client.js'); bytes = ${clientNow.bytes}; sha = '${clientNow.sha}' },`,
    count: 1,
    what: 'section 0c anchor row (MEASURED from disk in this run)',
  },
  /* ---- the canonical runner: the log prefix, row by row (the r16/t1 lesson) ---- */
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18-baseline-before.txt', quote: "'" },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18-dev-$suite.txt', quote: '"' },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18-ind-$name.txt', quote: '"' },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18-ind-probe-19-mutations.txt', quote: "'" },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18-ind-probe-11-mutations.txt', quote: "'" },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18-ind-probe-17-mut-$mutation.txt', quote: '"' },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18-ind-probe-20-mutations.txt', quote: "'" },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18-ind-probe-20-mut-$mutation.txt', quote: '"' },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18-ind-r15t2-independent-probe-mutant.txt', quote: "'" },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18-ind-probe-18-mutations.txt', quote: "'" },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18-ind-probe-18-race-', quote: '"' },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18-legacy-$name.txt', quote: '"' },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18-reviewer-', quote: '"' },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18-t1-mutation-table-console.txt', quote: "'" },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18-baseline-after.txt', quote: "'" },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18-frozen-diff.txt', quote: "'" },
  /* ---- the canonical runner: prose that names the prefix, the round and the stamp ---- */
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# Independent rev-18 full regression run (r18/t1, the caret turn is slower and a new live diagnostic separates the two causes).',
    to: `# Independent rev-18 full regression run (${SUBROUND}, the same rev-18 product with its stamp and one comment repaired; the r18/t1 logs are preserved).`,
    count: 1,
    what: 'title line',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# logging. Every log this script writes carries the `r18-` prefix; the r4 ... r12b archives, the',
    to: '# logging. Every log this script writes carries the `r18b-` prefix; the r4 ... r12b archives, the',
    count: 1,
    what: 'log-prefix note',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# evidence of the r15/r16/r17 rounds under verify-independent/_raw/ are NEVER overwritten',
    to: '# evidence of the r15/r16/r17/r18 rounds under verify-independent/_raw/ are NEVER overwritten',
    count: 1,
    what: 'the never-overwritten list grows by the r18 round',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# _raw/r16-t1-mislabelled-r15-logs/README.md. r17/t1 AND r18/t1 moved every prefix row in the',
    to: '# _raw/r16-t1-mislabelled-r15-logs/README.md. r17/t1, r18/t1 AND r18b/t5 moved every prefix row in the',
    count: 1,
    what: 'the prefix lesson names this sub-round too',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '#   - lib/client.js 154457 B / B4A0A1B3... -> 156937 B / 1C8DB24C...; diagnostics.revision is now',
    to: `#   - lib/client.js 154457 B / B4A0A1B3... -> 156937 B / 1C8DB24C... (r18/t1) -> ${clientNow.bytes} B /`
      + ` ${clientNow.sha.slice(0, 8)}... (${SUBROUND}, stamp + one comment repaired); diagnostics.revision`
      + ' is now',
    count: 1,
    what: 'the artifact delta line',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: `#     '${OLD.stamp}'.`,
    to: `#     '${NEW.stamp}'.`,
    count: 1,
    what: 'the console read-back literal quoted in the header',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '#     three branches of the diagnostic -- nothing about perception.',
    to: `#     three branches of the diagnostic -- nothing about perception.\n`
      + `#   - ${SUBROUND} (this sub-round) moved NO behaviour: the stamp and one comment were repaired so\n`
      + '#     the product states only what is testable, and every live fingerprint was re-anchored. The\n'
      + `#     ${SUBROUND} run writes its own \`r18b-\` logs; the r18/t1 canonical logs, archives and mutation\n`
      + '#     table stay on disk untouched as the record a quality gate already reviewed.',
    count: 1,
    what: 'the sub-round note (inserted after the perception paragraph)',
  },
  /* ---- the two documents that quote the stamp as a promise ---- */
  {
    file: 'README.md',
    from: OLD.stamp,
    to: NEW.stamp,
    count: 2,
    what: 'the build stamp quoted in the README checklist and the console read-back',
  },
  {
    file: 'docs/挂载与验收.md',
    from: OLD.stamp,
    to: NEW.stamp,
    count: 2,
    what: 'the acceptance checklist asserts this exact stamp string',
  },
];
for (const row of rows) {
  if (row.prefix === true) {
    row.from = `${row.quote}${row.lit}${row.quote}`;
    row.to = `${row.quote}${row.lit.replace('r18-', 'r18b-')}${row.quote}`;
    row.count = 1;
    row.what = `log-prefix row: ${row.lit}`;
  }
}

/* -------------------------------------------- state classification + dry report */

const archiveName = (relPath, shaHex) => `${relPath.replace(/\//g, '__')}.${shaHex.slice(0, 8)}.txt`;
const files = [...new Set(rows.map((row) => row.file))];

const report = [];
const say = (line) => { report.push(line); console.log(line); };

const texts = {};
const before = {};
for (const relPath of files) {
  const buffer = readFileSync(join(PLUGIN, relPath));
  texts[relPath] = buffer.toString('utf8');
  before[relPath] = { bytes: buffer.length, sha: sha256(buffer) };
}

/**
 * THE ROW TABLE'S OWN ARITHMETIC. r18c/t7 added this because the document had to quote three numbers
 * and hand-counting got two of them wrong: the rows were counted as "substitutions" (44 instead of
 * 46) and 8 files were written as 7. A static parse of this file got a THIRD answer (27 rows / 29
 * substitutions) -- so neither the hand nor the parser is the authority; THIS run is. The figures are
 * a pure function of the row table below and are therefore written on every run, including the
 * refused ones, to a file of their own that the document checker reads and compares against the
 * document's claims.
 */
const substitutions = rows.reduce((total, row) => total + row.count, 0);
const fileCount = files.length;
writeFileSync(join(RAW, 'r18b-t5-reanchor-figures.json'), `${JSON.stringify({
  generatedBy: 'verify-independent/r18b-t5-reanchor.mjs',
  subRound: SUBROUND,
  what: "the row table's own arithmetic (rows / substitutions / files) -- the authority the document must quote",
  rowTable: { rows: rows.length, substitutions, fileCount, files },
}, null, 2)}\n`, 'utf8');

say(`r18b / t5 re-anchor ${WRITE ? '(WRITE MODE)' : '(dry run)'}`);
say(`lib/client.js under test : ${clientNow.bytes} B / ${clientNow.sha}`);
say(`archive                  : ${ARCHIVE}`);
say(`rows                     : ${rows.length} across ${files.length} file(s)`);
say('');

let missing = 0;
let applied = 0;
const pending = [];
for (const row of rows) {
  const text = texts[row.file];
  const eol = eolOf(text);
  const from = withEol(row.from, eol);
  const to = withEol(row.to, eol);
  const fromCount = text.split(from).length - 1;
  const toCount = text.split(to).length - 1;
  /**
   * An INSERTION row keeps its anchor line as the head of the inserted block, so the old text is
   * still present once the row has been applied. Without this flag the post-state run would read an
   * applied insertion as "pending" forever and refuse a worktree that is in fact complete.
   */
  const insertion = to.includes(from);
  const isPending = fromCount === row.count && toCount === 0;
  const isApplied = !isPending && toCount === row.count && (insertion || fromCount === 0);
  const verdict = isPending
    ? `${fromCount}/${row.count} occurrences present`
    : (isApplied
      ? `already applied (${toCount}/${row.count} replacement(s) present)`
      : `MISMATCH: from=${fromCount} (declared ${row.count}), to=${toCount}${insertion ? ' (insertion row)' : ''}`);
  if (isPending) pending.push({ row, from, to });
  else if (isApplied) applied += 1;
  else missing += 1;
  say(`  [${isPending ? 'DRY-OK' : isApplied ? 'APPLIED' : 'REFUSED'}] ${row.file}`);
  say(`      ${row.what}`);
  say(`      ${verdict}`);
}
say('');

/* ------------------------------------------------------- archive precondition */
/* Only the files that still have something to replace must be archived first: in the post-state
   there is nothing to write, and demanding a pre-edit copy of an already-repaired file would make
   the post-state verification impossible (the exact failure this branch was written for). */

const filesToWrite = [...new Set(pending.map(({ row }) => row.file))];
const archiveProblems = [];
for (const relPath of filesToWrite) {
  const { bytes, sha } = before[relPath];
  const copy = join(ARCHIVE, archiveName(relPath, sha));
  if (!existsSync(copy) || sha256(readFileSync(copy)) !== sha) {
    archiveProblems.push(`${relPath} (${bytes} B / ${sha.slice(0, 8)}) has no hash-verified copy at _raw/r18b-t5-archive/${archiveName(relPath, sha)}`);
  }
}
if (archiveProblems.length > 0) {
  console.error('REFUSING: the pre-edit bytes are not archived -- archive first, then write:');
  for (const problem of archiveProblems) console.error(`  - ${problem}`);
  process.exit(1);
}

const postState = applied === rows.length;
const clean = missing === 0;
if (WRITE && !clean) {
  say(`REFUSING TO WRITE: ${missing} row(s) are in neither the pre-state nor the post-state -- a half-applied worktree must not be written over.`);
  writeFileSync(join(RAW, 'r18b-t5-reanchor.json'), `${JSON.stringify({ subRound: SUBROUND, mode: 'refused', client: clientNow, missing, rows: rows.length }, null, 2)}\n`, 'utf8');
  process.exit(1);
}
if (WRITE) {
  if (postState) {
    say('nothing to do: every row is already applied (post-state).');
  } else {
    for (const relPath of files) {
      let text = texts[relPath];
      const eol = eolOf(text);
      for (const { row, from, to } of pending) {
        if (row.file !== relPath) continue;
        text = text.split(from).join(to);
      }
      writeFileSync(join(PLUGIN, relPath), text, 'utf8');
      say(`wrote ${relPath}`);
    }
    say('');
  }
}

/* --------------------------------------------------- post-state verification */

let stillOld = 0;
for (const row of rows) {
  const text = readFileSync(join(PLUGIN, row.file), 'utf8');
  const eol = eolOf(text);
  if (text.split(withEol(row.from, eol)).length - 1 === row.count
    && text.split(withEol(row.to, eol)).length - 1 === 0) stillOld += 1;
}
say(`post-state: ${rows.length - stillOld}/${rows.length} rows no longer contain their old text; ${missing} row(s) were refused.`);
say(clean === false
  ? `RESULT: REFUSED -- ${missing} row(s) match neither state.`
  : postState
    ? `RESULT: already applied (post-state verified) -- every declared replacement is present exactly ${'its declared'} number of times.`
    : WRITE
      ? `RESULT: written -- all ${rows.length} rows replaced exactly as declared.`
      : `RESULT: dry run clean -- every row's old text is present exactly the declared number of times; nothing was written.`);

/**
 * The recorded pre-edit bytes are EVIDENCE and a post-state run must not overwrite them with the
 * hashes of the already-repaired files (r18c/t7: the first post-state re-run did exactly that, which
 * would have turned "these are the bytes we archived" into a tautology). So a post-state run keeps
 * the earlier record's `before` map and says so in `mode`.
 */
const previousRecord = existsSync(join(RAW, 'r18b-t5-reanchor.json'))
  ? JSON.parse(readFileSync(join(RAW, 'r18b-t5-reanchor.json'), 'utf8'))
  : null;
const recordedBefore = postState && previousRecord !== null && previousRecord.before !== undefined
  ? previousRecord.before
  : before;
const mode = WRITE ? 'write' : (postState ? 'post-state' : 'dry-run');

writeFileSync(join(RAW, 'r18b-t5-reanchor.json'), `${JSON.stringify({
  subRound: SUBROUND,
  generatedBy: 'verify-independent/r18b-t5-reanchor.mjs',
  mode,
  client: clientNow,
  previousArtifact: OLD,
  repairedStamp: NEW.stamp,
  rows: rows.length,
  substitutions,
  fileCount,
  files,
  before: recordedBefore,
  beforeRecordedBy: recordedBefore === before ? mode : 'the earlier write run',
  postState,
  stillOld,
  missing,
}, null, 2)}\n`, 'utf8');
console.log(`\nwritten -> verify-independent/_raw/r18b-t5-reanchor.json`);
console.log(`files on disk now: ${files.map((rel) => `${rel} ${statSync(join(PLUGIN, rel)).size} B`).join(', ')}`);
process.exit(clean ? 0 : 1);
