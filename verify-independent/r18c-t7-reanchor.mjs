/**
 * r18c / t7 -- re-anchor every LIVE fingerprint after the repair that changed
 * `verify/client-half.test.mjs` (one ASSERTION NAME), and move the canonical runner's log prefix to
 * `r18c-`.
 *
 * WHY THIS FILE EXISTS
 * `verify/client-half.test.mjs` carried an assertion whose NAME asserted device visibility
 * ("long enough for the turn to be SEEN on a device") while its condition only pinned the shipped
 * value. r18c/t7 replaces that name with the measurable fact and keeps the expectation in the
 * comment above it. The file is on the canonical runner's FROZEN MANIFEST (section 0) and its bytes
 * are declared in the document, so touching it expires every fingerprint that pins it -- which is
 * exactly what those fingerprints are for. Same instrument as r18b/t5, one sub-round later, with the
 * same discipline:
 *
 *   1. every row carries the EXACT number of occurrences it must replace; a wrong count aborts the
 *      whole run BEFORE anything is written;
 *   2. the frozen-manifest row is MEASURED from disk in this run, never typed;
 *   3. the pre-edit bytes of every file this run rewrites must ALREADY exist in
 *      `_raw/r18c-t7-archive/` under a name carrying their own sha256 -- checked, not promised;
 *   4. the runner's OWN LOG PREFIX moves in THIS batch (`r18b-` -> `r18c-`), because that forgotten
 *      row is what overwrote a previous round's logs in r16/t1. The `r18-*`, `r18b-*` and older
 *      evidence (canonical consoles, runner logs, mutation tables, archives) must not lose a byte.
 *
 * THE FIGURES THIS ROUND EXISTS FOR
 * r18b/t5's row table is the authority for "44 rows / 46 substitutions / 8 files"; the document now
 * quotes those three numbers and the checker compares them against
 * `_raw/r18b-t5-reanchor-figures.json`, which the r18b instrument writes on every run. This file's
 * own table is published the same way, in `_raw/r18c-t7-reanchor-figures.json`.
 *
 *     node verify-independent/r18c-t7-reanchor.mjs            # dry-run: report only
 *     node verify-independent/r18c-t7-reanchor.mjs --write    # apply, after archiving old bytes
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, '..');
const RAW = join(HERE, '_raw');
const ARCHIVE = join(RAW, 'r18c-t7-archive');
const WRITE = process.argv.includes('--write');

const OLD = {
  bytes: 100983,
  sha: 'AB6F7E4833EBD15488BB3214007462540186A2893DE7553922ABCD232FBD8731',
  checkName: 'the duration is the rev-18 one, long enough for the turn to be SEEN on a device (rev-18)',
};
const NEW = {
  bytes: 101496,
  sha: 'B24E22E85813FBD31D670AFCF8C2431F182CB6523AC375EC9EC99F3054883149',
  checkName: 'the duration is the rev-18 one: 300 ms, the value this round shipped (rev-18)',
};
const SUBROUND = 'r18c/t7';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase();
const HALF = join(PLUGIN, 'verify', 'client-half.test.mjs');
const halfNow = (() => {
  const buffer = readFileSync(HALF);
  return { bytes: buffer.length, sha: sha256(buffer), text: buffer.toString('utf8') };
})();
const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');
const withEol = (text, eol) => text.split('\n').join(eol);

/* --------------------------------------------------------------- preconditions */

if (halfNow.bytes !== NEW.bytes || halfNow.sha !== NEW.sha) {
  console.error(`REFUSING: verify/client-half.test.mjs is ${halfNow.bytes} B / ${halfNow.sha}, not the repaired artifact ${NEW.bytes} B / ${NEW.sha}`);
  process.exit(1);
}
if (!halfNow.text.includes(`'${NEW.checkName}'`)) {
  console.error(`REFUSING: the repaired suite does not carry the renamed assertion '${NEW.checkName}'`);
  process.exit(1);
}
if (halfNow.text.includes(OLD.checkName.slice(0, 40))) {
  console.error('REFUSING: the repaired suite still carries the visibility-asserting name');
  process.exit(1);
}

/**
 * Every row: { file, from, to, count, what }. `count` is the number of occurrences the file on disk
 * must contain -- checked, not assumed. `to` may span lines (joined with the file's own EOL).
 */
const rows = [
  /* ---- the canonical runner: the frozen manifest row (MEASURED, never typed) ---- */
  {
    file: 'verify-independent/run-r13.ps1',
    from: `  @{ path = 'verify\\client-half.test.mjs'; bytes = ${OLD.bytes};  sha = '${OLD.sha}' },`,
    to: `  @{ path = 'verify\\client-half.test.mjs'; bytes = ${halfNow.bytes};  sha = '${halfNow.sha}' },`,
    count: 1,
    what: 'frozen manifest row (MEASURED from disk in this run)',
  },
  /* ---- the canonical runner: the artifact delta line for this file ---- */
  {
    file: 'verify-independent/run-r13.ps1',
    from: '#   - verify/client-half.test.mjs 95803 B / 97EEB2D0... -> 100983 B / AB6F7E48... (ELEVEN new',
    to: `#   - verify/client-half.test.mjs 95803 B / 97EEB2D0... -> 100983 B / AB6F7E48... -> ${halfNow.bytes} B /\n`
      + `#     ${halfNow.sha.slice(0, 8)}... (r18c/t7: ONE assertion RENAMED -- its name used to assert device\n`
      + '#     visibility; the expectation now lives in the comment above it). (ELEVEN new',
    count: 1,
    what: 'the client-half delta line: the rename is recorded, not hidden',
  },
  /* ---- the canonical runner: the log prefix, row by row (the r16/t1 lesson) ---- */
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18b-baseline-before.txt', quote: "'" },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18b-dev-$suite.txt', quote: '"' },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18b-ind-$name.txt', quote: '"' },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18b-ind-probe-19-mutations.txt', quote: "'" },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18b-ind-probe-11-mutations.txt', quote: "'" },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18b-ind-probe-17-mut-$mutation.txt', quote: '"' },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18b-ind-probe-20-mutations.txt', quote: "'" },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18b-ind-probe-20-mut-$mutation.txt', quote: '"' },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18b-ind-r15t2-independent-probe-mutant.txt', quote: "'" },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18b-ind-probe-18-mutations.txt', quote: "'" },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18b-ind-probe-18-race-', quote: '"' },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18b-legacy-$name.txt', quote: '"' },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18b-reviewer-', quote: '"' },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18b-t1-mutation-table-console.txt', quote: "'" },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18b-baseline-after.txt', quote: "'" },
  { file: 'verify-independent/run-r13.ps1', prefix: true, lit: 'r18b-frozen-diff.txt', quote: "'" },
  /* ---- the canonical runner: prose that names the round, the prefix and the survivors ---- */
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# Independent rev-18 full regression run (r18b/t5, the same rev-18 product with its stamp and one comment repaired; the r18/t1 logs are preserved).',
    to: '# Independent rev-18 full regression run (r18c/t7, one assertion name repaired so it states only the measurable fact; the r18/t1 and r18b/t5 logs are preserved).',
    count: 1,
    what: 'title line',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# logging. Every log this script writes carries the `r18b-` prefix; the r4 ... r12b archives, the',
    to: '# logging. Every log this script writes carries the `r18c-` prefix; the r4 ... r12b archives, the',
    count: 1,
    what: 'log-prefix note',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# evidence of the r15/r16/r17/r18 rounds under verify-independent/_raw/ are NEVER overwritten',
    to: '# evidence of the r15/r16/r17/r18/r18b rounds under verify-independent/_raw/ are NEVER overwritten',
    count: 1,
    what: 'the never-overwritten list grows by the r18b round',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: '# _raw/r16-t1-mislabelled-r15-logs/README.md. r17/t1, r18/t1 AND r18b/t5 moved every prefix row in the',
    to: '# _raw/r16-t1-mislabelled-r15-logs/README.md. r17/t1, r18/t1, r18b/t5 AND r18c/t7 moved every prefix row in the',
    count: 1,
    what: 'the prefix lesson names this sub-round too',
  },
  {
    file: 'verify-independent/run-r13.ps1',
    from: "#   - r18b/t5 (this sub-round) moved NO behaviour: the stamp and one comment were repaired so\n"
      + '#     the product states only what is testable, and every live fingerprint was re-anchored. The\n'
      + '#     r18b/t5 run writes its own `r18b-` logs; the r18/t1 canonical logs, archives and mutation\n'
      + '#     table stay on disk untouched as the record a quality gate already reviewed.',
    to: "#   - r18b/t5 moved NO behaviour: the stamp and one comment were repaired so the product states\n"
      + '#     only what is testable, and every live fingerprint was re-anchored.\n'
      + "#   - r18c/t7 (this sub-round) repairs ONE ASSERTION NAME that asserted device visibility, and\n"
      + '#     re-anchors `verify/client-half.test.mjs` again. Its logs are `r18c-`; the r18/t1 and r18b/t5\n'
      + '#     canonical logs, archives and mutation tables stay on disk untouched as the records a quality\n'
      + '#     gate already reviewed.',
    count: 1,
    what: 'the sub-round note: r18b/t5 becomes history, r18c/t7 takes over',
  },
  /* ---- the mutation table: its logs and its output files move to r18c- ---- */
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: '`r18b-mut-${probe}-${mutation}.txt`',
    to: '`r18c-mut-${probe}-${mutation}.txt`',
    count: 1,
    what: 'per-mutant log name',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'r18b-mut-r15t2-independent-probe-sessionsreadfailed-reverted.txt'",
    to: "'r18c-mut-r15t2-independent-probe-sessionsreadfailed-reverted.txt'",
    count: 1,
    what: 'the failure-path mutant log name',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'r18b-t1-mutation-table.json'",
    to: "'r18c-t1-mutation-table.json'",
    count: 1,
    what: 'the machine-readable table (the r18b/t5 one stays as evidence)',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: "'r18b-t1-mutation-table.md'",
    to: "'r18c-t1-mutation-table.md'",
    count: 1,
    what: 'the human-readable table',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: '(raw logs: _raw/r18b-mut-*.txt)',
    to: '(raw logs: _raw/r18c-mut-*.txt)',
    count: 1,
    what: 'the log directory note in the markdown',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: ' *   - its logs are `_raw/r18b-mut-*.txt`, so the r13c, r15, r16, r17 AND r18 logs stay untouched;',
    to: ' *   - its logs are `_raw/r18c-mut-*.txt`, so the r13c, r15, r16, r17, r18 AND r18b logs stay untouched;',
    count: 1,
    what: 'header log note',
  },
  {
    file: 'verify-independent/r15t6-mutation-table.mjs',
    from: ' * r15 / t6, re-anchored by r16 / t1, by r17 / t1, by r18 / t1 and now by r18b / t5 -- the MUTATION TABLE:',
    to: ' * r15 / t6, re-anchored by r16 / t1, by r17 / t1, by r18 / t1, by r18b / t5 and now by r18c / t7 -- the MUTATION TABLE:',
    count: 1,
    what: 'header line 1',
  },
];
for (const row of rows) {
  if (row.prefix === true) {
    row.from = `${row.quote}${row.lit}${row.quote}`;
    row.to = `${row.quote}${row.lit.replace('r18b-', 'r18c-')}${row.quote}`;
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

const substitutions = rows.reduce((total, row) => total + row.count, 0);
const fileCount = files.length;
writeFileSync(join(RAW, 'r18c-t7-reanchor-figures.json'), `${JSON.stringify({
  generatedBy: 'verify-independent/r18c-t7-reanchor.mjs',
  subRound: SUBROUND,
  what: "the row table's own arithmetic (rows / substitutions / files)",
  rowTable: { rows: rows.length, substitutions, fileCount, files },
}, null, 2)}\n`, 'utf8');

say(`r18c / t7 re-anchor ${WRITE ? '(WRITE MODE)' : '(dry run)'}`);
say(`verify/client-half.test.mjs : ${halfNow.bytes} B / ${halfNow.sha}`);
say(`archive                      : ${ARCHIVE}`);
say(`rows / substitutions / files : ${rows.length} / ${substitutions} / ${fileCount}`);
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

const filesToWrite = [...new Set(pending.map(({ row }) => row.file))];
const archiveProblems = [];
for (const relPath of filesToWrite) {
  const { bytes, sha } = before[relPath];
  const copy = join(ARCHIVE, archiveName(relPath, sha));
  if (!existsSync(copy) || sha256(readFileSync(copy)) !== sha) {
    archiveProblems.push(`${relPath} (${bytes} B / ${sha.slice(0, 8)}) has no hash-verified copy at _raw/r18c-t7-archive/${archiveName(relPath, sha)}`);
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
  say(`REFUSING TO WRITE: ${missing} row(s) are in neither the pre-state nor the post-state.`);
  process.exit(1);
}
if (WRITE && !postState) {
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
} else if (WRITE) {
  say('nothing to do: every row is already applied (post-state).');
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
    ? 'RESULT: already applied (post-state verified) -- every declared replacement is present exactly its declared number of times.'
    : WRITE
      ? `RESULT: written -- all ${rows.length} rows replaced exactly as declared.`
      : "RESULT: dry run clean -- every row's old text is present exactly the declared number of times; nothing was written.");

const previousRecord = existsSync(join(RAW, 'r18c-t7-reanchor.json'))
  ? JSON.parse(readFileSync(join(RAW, 'r18c-t7-reanchor.json'), 'utf8'))
  : null;
const recordedBefore = postState && previousRecord !== null && previousRecord.before !== undefined
  ? previousRecord.before
  : before;
writeFileSync(join(RAW, 'r18c-t7-reanchor.json'), `${JSON.stringify({
  subRound: SUBROUND,
  generatedBy: 'verify-independent/r18c-t7-reanchor.mjs',
  mode: WRITE ? 'write' : (postState ? 'post-state' : 'dry-run'),
  clientHalf: halfNow,
  previousArtifact: OLD,
  repairedCheckName: NEW.checkName,
  rows: rows.length,
  substitutions,
  fileCount,
  files,
  before: recordedBefore,
  beforeRecordedBy: recordedBefore === before ? (WRITE ? 'write' : 'dry-run') : 'the earlier write run',
  postState,
  stillOld,
  missing,
}, null, 2)}\n`, 'utf8');
console.log('\nwritten -> verify-independent/_raw/r18c-t7-reanchor.json');
console.log(`files on disk now: ${files.map((rel) => `${rel} ${statSync(join(PLUGIN, rel)).size} B`).join(', ')}`);
process.exit(clean ? 0 : 1);
