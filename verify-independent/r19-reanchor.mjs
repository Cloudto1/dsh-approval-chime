/**
 * r19 / t2 -- re-anchor every LIVE fingerprint after the rev-19 product change
 * (`CARET_ROTATE_MS` 300 -> 400, stamp `rev-19 · the caret turn takes 400 ms`) and move the
 * canonical runner's log prefix from `r18c-` to `r19-`.
 *
 * WHY THIS FILE EXISTS
 * The product on disk is rev-19. Every file that PINS the product (its byte count, its sha256, its
 * build stamp, the caret's absolute duration, the anchor of the `caret-turn-ms-250` mutant) or that
 * names the CURRENT round's log files is therefore stale, and the runner's frozen manifest declares
 * three of those files by bytes+sha. This instrument moves exactly those literals and nothing else:
 * the r18 round's own records (its consoles, archives, mutation tables, the r18/t2 narrative in
 * probe-20, the reduce-motion section in client-half) stay byte-identical.
 *
 * THE DISCIPLINE (inherited from r15/t6, r16/t1, r17/t1, r18/t1, r18b/t5 and r18c/t7)
 *   1. every row carries the EXACT number of occurrences it must replace; ONE wrong count aborts the
 *      whole run BEFORE anything is written (`--write` included), and the row table is checked for
 *      overlapping rows at start-up;
 *   2. no fingerprint is typed by hand. The OLD values (bytes, sha256, stamp, duration) are MEASURED
 *      from `_raw/r19-t1-archive/` -- the archived pre-rev-19 product -- the NEW values are MEASURED
 *      from `lib/client.js`, the frozen-manifest lines of the runner are READ OUT of the runner, and
 *      the two harness files' post-edit bytes+sha are computed from their predicted post-edit text;
 *   3. the pre-edit bytes of every file this run rewrites are archived under
 *      `_raw/r19-evidence/archive/<path with / -> __>.<pre-edit sha16>.txt` BEFORE the first write,
 *      and a copy that does not hash back to the pre-edit bytes refuses the write;
 *   4. the log-prefix rows move in the SAME batch (`r18c-` -> `r19-`), because the forgotten prefix
 *      row is what overwrote a previous round's logs in r16/t1; the r18c evidence on disk may not
 *      lose a byte, and running the mutation table (which this run's acceptance requires) would
 *      otherwise overwrite `_raw/r18c-mut-*.txt`.
 *
 *     node verify-independent/r19-reanchor.mjs            # dry run: report + JSON, writes NOTHING
 *     node verify-independent/r19-reanchor.mjs --write    # archive, then apply, then self-check
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/* the plugin root is FOUND, not assumed from this file's own depth: this instrument is copied to
 * `_raw/r19-evidence/` for its falsification run, and a copy must behave like the original. */
const findRoot = (start) => {
  let dir = start;
  for (let levels = 0; levels < 8; levels += 1) {
    if (existsSync(join(dir, 'lib', 'client.js')) && existsSync(join(dir, 'verify-independent', 'run-r13.ps1'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
};
const PLUGIN = findRoot(HERE);
if (PLUGIN === null) {
  console.error(`REFUSING: no plugin root (a directory holding lib/client.js and verify-independent/run-r13.ps1) found at or above ${HERE}.`);
  process.exit(1);
}
const RAW = join(PLUGIN, 'verify-independent', '_raw');
const EVIDENCE = join(RAW, 'r19-evidence');
const ARCHIVE = join(EVIDENCE, 'archive');
const WRITE = process.argv.includes('--write');
const SUBROUND = 'r19/t2';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase();
const read = (relPath) => readFileSync(join(PLUGIN, relPath));
const occ = (text, needle) => text.split(needle).length - 1;
const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');
const withEol = (text, eol) => text.split('\n').join(eol);
const line = (...parts) => parts.join('\n');

/* ------------------------------------------------------------ measured inputs (never typed) */

/* the pre-rev-19 product, measured out of r19/t1's own pre-write archive (the copy is located by
 * prefix, so not even the sha16 in the archive's name is typed here) */
const T1_ARCHIVE = join(RAW, 'r19-t1-archive');
const t1Copy = existsSync(T1_ARCHIVE)
  ? readdirSync(T1_ARCHIVE).find((name) => name.startsWith('lib__client.js.') && name.endsWith('.txt'))
  : undefined;
if (t1Copy === undefined) {
  console.error('REFUSING: _raw/r19-t1-archive/ holds no lib__client.js.*.txt copy, so the pre-rev-19 values this table replaces cannot be measured.');
  process.exit(1);
}
const prevBuffer = readFileSync(join(T1_ARCHIVE, t1Copy));
const prevText = prevBuffer.toString('utf8');
const PREV = { source: `_raw/r19-t1-archive/${t1Copy}`, bytes: prevBuffer.length, sha: sha256(prevBuffer), text: prevText };

const productBuffer = read('lib/client.js');
const PRODUCT = { bytes: productBuffer.length, sha: sha256(productBuffer), text: productBuffer.toString('utf8') };

const pick = (text, regex, what) => {
  const match = regex.exec(text);
  if (match === null) {
    console.error(`REFUSING: ${what} not found (regex ${regex}).`);
    process.exit(1);
  }
  return match[1];
};
const OLD_STAMP = pick(prevText, /var REVISION = '([^']*)';/, 'the pre-rev-19 revision stamp');
const STAMP = pick(PRODUCT.text, /var REVISION = '([^']*)';/, 'the shipped revision stamp in lib/client.js');
const OLD_DURATION = Number(pick(prevText, /var CARET_ROTATE_MS = (\d+);/, 'the pre-rev-19 CARET_ROTATE_MS'));
const DURATION = Number(pick(PRODUCT.text, /var CARET_ROTATE_MS = (\d+);/, 'the shipped CARET_ROTATE_MS'));
const OLD_REV = OLD_STAMP.slice(0, 6);
const NEW_REV = STAMP.slice(0, 6);
const OLD_ROUND = OLD_REV.replace('rev-', 'r');
const NEW_ROUND = NEW_REV.replace('rev-', 'r');

if (PREV.sha === PRODUCT.sha || OLD_DURATION === DURATION || OLD_REV === NEW_REV) {
  console.error(`REFUSING: ${PREV.source} and lib/client.js do not describe two different revisions (${PREV.sha === PRODUCT.sha ? 'same sha256' : `${OLD_DURATION} -> ${DURATION} ms`}).`);
  process.exit(1);
}

const HALF = 'verify/client-half.test.mjs';
const AUDIO = 'verify/custom-audio.test.mjs';
const RUNNER = 'verify-independent/run-r13.ps1';
const P2 = 'verify-independent/probe-2-gain-and-resources.mjs';
const P8 = 'verify-independent/probe-8-client-roster-render.mjs';
const P17 = 'verify-independent/probe-17-r7-section.mjs';
const P18 = 'verify-independent/probe-18-r10-sessions.mjs';
const P19 = 'verify-independent/probe-19-r12-select-parity.mjs';
const P20 = 'verify-independent/probe-20-r14-bell-appearance.mjs';
const T2 = 'verify-independent/r15t2-independent-probe.mjs';
const T6 = 'verify-independent/r15t6-mutation-table.mjs';

const row = (file, id, what, from, to, count = 1) => ({ file, id, what, from, to, count });

/* --------------------------------------- verify/client-half.test.mjs (the stamp, duration + names) */

const halfRows = [
  row(HALF, 'half-header-bullet', 'the rev-18 bullet stops claiming the shipped number as "now"',
    line(
      ' *   - rev-18: the caret\'s turn is now 300 ms — rev-17\'s 160 ms stayed justified only by',
      ' *     this file\'s own `.18s` transitions, and the user\'s device read that as an instant',
      ' *     cut ("要有过渡动画能看到在转动的箭头"). The console surface also answers'),
    line(
      ' *   - rev-18: the caret\'s turn moved 160 ms → ' + OLD_DURATION + ' ms — rev-17\'s 160 ms justified only',
      ' *     this file\'s own `.18s` transitions, and the user\'s device read that as an instant',
      ' *     cut ("要有过渡动画能看到在转动的箭头"). The console surface also answers')),
  row(HALF, 'half-header-bullet-add', 'the rev-19 bullet: the shipped duration, as history next to rev-18\'s',
    line(' *     be told apart from "this environment deliberately asks for no motion at all";'),
    line(
      ' *     be told apart from "this environment deliberately asks for no motion at all";',
      ' *   - ' + NEW_REV + ': the caret\'s turn is now ' + DURATION + ' ms — the same device reading that',
      ' *     produced ' + OLD_REV + ' said the ' + OLD_DURATION + ' ms turn was still an instant cut, so the constant',
      ' *     moved again. The stylesheet still CONCATENATES that number from the constant instead of',
      ' *     copying it, and exactly ONE caret transition rule exists;')),
  row(HALF, 'half-stamp-assertion', 'the stamp assertion moves to the shipped revision',
    'report.equal(\'the revision stamp is rev-18\', String(bundle.diagnostics.revision).startsWith(\'rev-18\'), true);',
    'report.equal(\'the revision stamp is ' + NEW_REV + '\', String(bundle.diagnostics.revision).startsWith(\'' + NEW_REV + '\'), true);'),
  row(HALF, 'half-duration-comment', 'the duration section header describes rev-19 and keeps rev-18 as its own record',
    line(
      '/* rev-18 · the duration moved 160 ms → 300 ms on a DEVICE reading, so the old 120–200 ms',
      ' * band assertion is gone: it encoded rev-17\'s reasoning ("a turn reads as a turn between',
      ' * roughly 120 ms and 200 ms"), which is the very judgment the user\'s device overturned',
      ' * (they could not see the arrow turn). What is pinned now is the shipped number, and that',
      ' * the stylesheet still CONCATENATES that number from the constant — a hand-copied `300ms`',
      ' * would satisfy "the value is 300" while quietly re-introducing the second copy the',
      ' * constant exists to prevent.'),
    line(
      '/* ' + NEW_REV + ' · the duration moved ' + OLD_DURATION + ' ms → ' + DURATION + ' ms, one round after rev-18 had moved it',
      ' * 160 ms → ' + OLD_DURATION + ' ms on the same DEVICE reading. The old 120–200 ms band assertion rev-17 wrote',
      ' * is gone: it encoded rev-17\'s reasoning ("a turn reads as a turn between roughly 120 ms',
      ' * and 200 ms"), which is the very judgment the user\'s device overturned (they could not see',
      ' * the arrow turn). What is pinned now is the shipped number, and that the stylesheet still',
      ' * CONCATENATES that number from the constant — a hand-copied `' + DURATION + 'ms` would satisfy "the',
      ' * value is ' + DURATION + '" while quietly re-introducing the second copy the constant exists to',
      ' * prevent.')),
  row(HALF, 'half-duration-pin', 'the absolute duration pin and its assertion name',
    line(
      '  \'the duration is the ' + OLD_REV + ' one: ' + OLD_DURATION + ' ms, the value this round shipped (' + OLD_REV + ')\',',
      '  sessionIcon.caretRotateMs,',
      '  ' + OLD_DURATION + ','),
    line(
      '  \'the duration is the ' + NEW_REV + ' one: ' + DURATION + ' ms, the value this round shipped (' + NEW_REV + ')\',',
      '  sessionIcon.caretRotateMs,',
      '  ' + DURATION + ',')),
  row(HALF, 'half-constant-check-name', 'the "stylesheet builds the duration" assertion name',
    '  \'and the stylesheet builds that duration from the constant instead of copying a number (' + OLD_REV + ')\',',
    '  \'and the stylesheet builds that duration from the constant instead of copying a number (' + NEW_REV + ')\','),
  row(HALF, 'half-single-rule-name', 'the "exactly ONE caret transition rule" assertion name (its stale number too)',
    '  \'so exactly ONE caret transition rule exists, with no stale 160 ms copy beside it (' + OLD_REV + ')\',',
    '  \'so exactly ONE caret transition rule exists, with no stale ' + OLD_DURATION + ' ms copy beside it (' + NEW_REV + ')\','),
];

/* ------------------------------------------------------ verify/custom-audio.test.mjs (one literal) */

const audioRows = [
  row(AUDIO, 'audio-stamp', 'the version literal at :267',
    'report.ok(\'the revision names this build\', String(diagnostics.revision).includes(\'' + OLD_REV + '\'), String(diagnostics.revision));',
    'report.ok(\'the revision names this build\', String(diagnostics.revision).includes(\'' + NEW_REV + '\'), String(diagnostics.revision));'),
];

/* ------------------------------------------------- predicted post-state of the two harness files */

const rowsFor = (relPath, table) => table.filter((entry) => entry.file === relPath);
/* Apply a row ONLY when it is pending (its old text is present exactly `count` times and its new
 * text is absent). Re-applying an INSERTION row would otherwise grow the text again: its `from` is
 * contained in its own `to`, so "apply everything" is not idempotent and the predicted post-edit
 * bytes of an already-applied file would be wrong. */
const applyPending = (text, table) => {
  const eol = eolOf(text);
  let out = text;
  for (const entry of table) {
    const from = withEol(entry.from, eol);
    const to = withEol(entry.to, eol);
    if (occ(out, from) === entry.count && occ(out, to) === 0) out = out.split(from).join(to);
  }
  return out;
};
const HALF_NEW = (() => {
  const buffer = Buffer.from(applyPending(read(HALF).toString('utf8'), halfRows), 'utf8');
  return { bytes: buffer.length, sha: sha256(buffer) };
})();
const AUDIO_NEW = (() => {
  const buffer = Buffer.from(applyPending(read(AUDIO).toString('utf8'), audioRows), 'utf8');
  return { bytes: buffer.length, sha: sha256(buffer) };
})();

/* ------------------------------------------ the other probes that pin bytes / sha / stamp / value */

const probeRows = [
  row(P2, 'p2-fetch-count-name', 'assertion name only (the five fetch( call sites are unchanged)',
    '  \'the fetch( call sites still number the five the ' + OLD_REV + ' source has (audio×3, sessions×2)\',',
    '  \'the fetch( call sites still number the five the ' + NEW_REV + ' source has (audio×3, sessions×2)\','),

  row(P8, 'p8-stamp', 'assertion name and the stamp literal',
    'log.check(\'revision stamp names the revision under test (' + OLD_REV + ')\', String(diagnostics.revision).includes(\'' + OLD_REV + '\'), String(diagnostics.revision));',
    'log.check(\'revision stamp names the revision under test (' + NEW_REV + ')\', String(diagnostics.revision).includes(\'' + NEW_REV + '\'), String(diagnostics.revision));'),

  row(P17, 'p17-bytes-name', 'the byte-count assertion name (the MEASURED byte count itself did NOT move)',
    'report.same(\'lib/client.js byte count is what ' + OLD_REV + ' claims\', CLIENT_BYTES, ' + PRODUCT.bytes + ');',
    'report.same(\'lib/client.js byte count is what ' + NEW_REV + ' claims\', CLIENT_BYTES, ' + PRODUCT.bytes + ');'),
  row(P17, 'p17-sha-name', 'the sha256 assertion name',
    '  \'lib/client.js sha256 is what ' + OLD_REV + ' claims\',',
    '  \'lib/client.js sha256 is what ' + NEW_REV + ' claims\','),
  row(P17, 'p17-sha', 'the pinned sha256 (the MEASURED shipped one)',
    '  \'' + PREV.sha + '\',',
    '  \'' + PRODUCT.sha + '\','),
  row(P17, 'p17-badge', 'the bundleRevision badge assertion name',
    'report.same(\'the bundleRevision badge shows the ' + OLD_REV + ' stamp\', textOf(byType(tree, \'span\').find((node) => node.props.className === \'dacRev\')), diagnostics.revision);',
    'report.same(\'the bundleRevision badge shows the ' + NEW_REV + ' stamp\', textOf(byType(tree, \'span\').find((node) => node.props.className === \'dacRev\')), diagnostics.revision);'),
  row(P17, 'p17-stamp-regex', 'the stamp regex',
    'report.check(\'the revision stamp is the ' + OLD_REV + ' one\', /' + OLD_REV + '/.test(diagnostics.revision), diagnostics.revision);',
    'report.check(\'the revision stamp is the ' + NEW_REV + ' one\', /' + NEW_REV + '/.test(diagnostics.revision), diagnostics.revision);'),

  row(P18, 'p18-expected-revision', 'the expected revision constant',
    '    const EXPECTED_REVISION = \'' + OLD_STAMP + '\';',
    '    const EXPECTED_REVISION = \'' + STAMP + '\';'),

  row(P19, 'p19-sha', 'the pinned sha256 (the MEASURED byte count did NOT move)',
    '    sha256: \'' + PREV.sha + '\',',
    '    sha256: \'' + PRODUCT.sha + '\','),
  row(P19, 'p19-revision', 'the expected revision',
    '  revision: \'' + OLD_STAMP + '\',',
    '  revision: \'' + STAMP + '\','),

  row(P20, 'p20-header', 'the header line naming which round extended this probe',
    line(
      ' * Extended in r16/t1 (the rev-16 bell-caret gap), in r17/t2 (the rev-17 caret quarter turn) and in',
      ' * r18/t2 (the rev-18 duration change 160 ms -> 300 ms, plus the new reduceMotion() diagnostic).'),
    line(
      ' * Extended in r16/t1 (the rev-16 bell-caret gap), in r17/t2 (the rev-17 caret quarter turn), in',
      ' * r18/t2 (the rev-18 duration change 160 ms -> ' + OLD_DURATION + ' ms, plus the new reduceMotion() diagnostic)',
      ' * and in r19/t2 (the rev-19 duration change ' + OLD_DURATION + ' ms -> ' + DURATION + ' ms; everything r18/t2 recorded above is history).')),
  row(P20, 'p20-layer-claim', 'the live half of the two-layer claim',
    ' *   equal `sessionIcon.caretRotateMs`, and that value must equal the ' + OLD_DURATION + ' the round declared.',
    ' *   equal `sessionIcon.caretRotateMs`, and that value must equal the ' + DURATION + ' the round declared.'),
  row(P20, 'p20-mutant-what', 'the mutant\'s what text: the pin that catches it',
    'so only the absolute ' + OLD_DURATION + ' ms pin below can catch it',
    'so only the absolute ' + DURATION + ' ms pin below can catch it'),
  row(P20, 'p20-mutant-anchor', 'the caret-turn-ms-250 anchor string (mutant name and its `to` stay UNCHANGED)',
    '    anchor: \'var CARET_ROTATE_MS = ' + OLD_DURATION + ';\',',
    '    anchor: \'var CARET_ROTATE_MS = ' + DURATION + ';\','),
  row(P20, 'p20-check-name', 'the duration assertion name, in the check AND in the mutant\'s expectFail list',
    '\'sessionIcon reports that transition duration as exactly ' + OLD_DURATION + ' milliseconds\',',
    '\'sessionIcon reports that transition duration as exactly ' + DURATION + ' milliseconds\',',
    2),
  row(P20, 'p20-reduced-motion-what', 'the reduced-motion mutant\'s what text: the duration it hands back',
    'is handed the full ' + OLD_DURATION + ' ms turn',
    'is handed the full ' + DURATION + ' ms turn'),
  row(P20, 'p20-cascade-example', 'the cascade example: the stylesheet line it names',
    ' * could not tell "the stylesheet says `transition:' + OLD_DURATION + 'ms`" from "the reduced-motion block says',
    ' * could not tell "the stylesheet says `transition:' + DURATION + 'ms`" from "the reduced-motion block says'),
  row(P20, 'p20-cascade-note', 'the note that tracks which round the example follows',
    line(
      ' * example named 160ms when rev-17 wrote this note; rev-18 moved that one duration to ' + OLD_DURATION + 'ms, and the',
      ' * reasoning is about the SPLIT, not about the number.)'),
    line(
      ' * example named 160ms when rev-17 wrote this note; rev-18 moved that one duration to ' + OLD_DURATION + 'ms and',
      ' * rev-19 moved it to ' + DURATION + 'ms; the reasoning is about the SPLIT, not about the number.)')),
  row(P20, 'p20-bare-number-comment', 'the "bare number on `all`" example in the check\'s comment',
    '  // The animation, not the end state: the property must be named (a bare `' + OLD_DURATION + 'ms` on `all` is not',
    '  // The animation, not the end state: the property must be named (a bare `' + DURATION + 'ms` on `all` is not'),
  row(P20, 'p20-pin-comment', 'the comment that records which round moved the pin',
    '  // r18/t2: the absolute pin moved 160 -> ' + OLD_DURATION + ', and the check NAME moved with it. The device report',
    line(
      '  // r18/t2 moved the absolute pin 160 -> ' + OLD_DURATION + ' and the check NAME with it; r19/t2 moved the pin',
      '  // ' + OLD_DURATION + ' -> ' + DURATION + ' the same way and moved that NAME with it again. The device report')),
  row(P20, 'p20-absolute-pin', 'the absolute duration pin itself',
    '    sessionIcon.caretRotateMs === ' + OLD_DURATION + ',',
    '    sessionIcon.caretRotateMs === ' + DURATION + ','),
  row(P20, 'p20-observer-example', 'the observer example in the group-6 note',
    '   * observer is looking at when the arrow jumps -- "' + OLD_DURATION + ' ms is still too fast on this device" or',
    '   * observer is looking at when the arrow jumps -- "' + DURATION + ' ms is still too fast on this device" or'),
  row(P20, 'p20-banner', 'the console banner of the shipped run',
    '  console.log(\'dsh-approval-chime · independent probe 20 · rev-13/rev-14/rev-16/rev-17/' + OLD_REV + ' session-bell appearance + reduceMotion\');',
    '  console.log(\'dsh-approval-chime · independent probe 20 · rev-13/rev-14/rev-16/rev-17/' + OLD_REV + '/' + NEW_REV + ' session-bell appearance + reduceMotion\');'),

  row(T2, 't2-frozen-comment', 'the "frozen bytes" comment',
    '/** The frozen ' + OLD_REV + ' bytes this probe is anchored to (t7 close-out). */',
    '/** The frozen ' + NEW_REV + ' bytes this probe is anchored to (t7 close-out). */'),
  row(T2, 't2-frozen-sha', 'the pinned sha256 (the MEASURED byte count did NOT move)',
    '  sha256: \'' + PREV.sha + '\',',
    '  sha256: \'' + PRODUCT.sha + '\','),
  row(T2, 't2-frozen-revision', 'the pinned revision',
    '  revision: \'' + OLD_STAMP + '\',',
    '  revision: \'' + STAMP + '\','),
  row(T2, 't2-author', 'the AUTHOR label',
    'const AUTHOR = "the version of the bundle this repo ships as ' + OLD_REV + '";',
    'const AUTHOR = "the version of the bundle this repo ships as ' + NEW_REV + '";'),
  row(T2, 't2-a1-name', 'the A1 assertion name',
    '    \'A1: lib/client.js is the frozen ' + OLD_REV + ' byte sequence\',',
    '    \'A1: lib/client.js is the frozen ' + NEW_REV + ' byte sequence\','),
  row(T2, 't2-source-label', 'the source label the vm is handed',
    '  let sourceLabel = \'shipped ' + OLD_REV + ' bytes\';',
    '  let sourceLabel = \'shipped ' + NEW_REV + ' bytes\';'),
  row(T2, 't2-run-banner', 'the shipped-run banner the runner greps past',
    '=== shipped ' + OLD_REV + ' run: ',
    '=== shipped ' + NEW_REV + ' run: '),

  row(T6, 't6-header-chain', 'header line 1: the re-anchor chain grows by this sub-round',
    ' * r15 / t6, re-anchored by r16 / t1, by r17 / t1, by r18 / t1, by r18b / t5 and now by r18c / t7 -- the MUTATION TABLE:',
    ' * r15 / t6, re-anchored by r16 / t1, by r17 / t1, by r18 / t1, by r18b / t5, by r18c / t7 and now by r19 / t2 -- the MUTATION TABLE:'),
  row(T6, 't6-header-bytes', 'header line 3: the bytes the table re-measures',
    ' * every declared mutation re-measured on the ' + OLD_REV + ' bytes. The instrument is the r15 round\'s;',
    ' * every declared mutation re-measured on the ' + NEW_REV + ' bytes. The instrument is the r15 round\'s;'),
  row(T6, 't6-header-refusal', 'the refusal note: which artifact the table insists on',
    ' *   - it REFUSES to run unless lib/client.js is the ' + OLD_REV + ' bytes (sha256 + size asserted), so a',
    ' *   - it REFUSES to run unless lib/client.js is the ' + NEW_REV + ' bytes (sha256 + size asserted), so a'),
  row(T6, 't6-header-log-list', 'the note that lists which rounds\' logs survive (the prefix literal itself is the prefix row\'s job)',
    'so the r13c, r15, r16, r17, r18 AND r18b logs stay untouched;',
    'so the r13c, r15, r16, r17, r18, r18b AND r18c logs stay untouched;'),
  row(T6, 't6-frozen', 'the FROZEN constant (MEASURED bytes + sha256 of the shipped lib/client.js)',
    'const FROZEN = { sha256: \'' + PREV.sha + '\', bytes: ' + PREV.bytes + ' };',
    'const FROZEN = { sha256: \'' + PRODUCT.sha + '\', bytes: ' + PRODUCT.bytes + ' };'),
  row(T6, 't6-rowlist-note', 'the row-list note under the mutations array',
    ' * mutants + the 6 r18/t2 reduce-motion mutants, re-run on the ' + OLD_REV + ' bytes. */',
    ' * mutants + the 6 r18/t2 reduce-motion mutants, re-run on the ' + NEW_REV + ' bytes. */'),
  row(T6, 't6-refusal-text', 'the refusal message: which artifact the table insists on',
    'not the ' + OLD_REV + ' artifact ',
    'not the ' + NEW_REV + ' artifact '),
  row(T6, 't6-table-revision', 'the revision recorded in the machine-readable table',
    '  revision: \'' + OLD_REV + '\',',
    '  revision: \'' + NEW_REV + '\','),
  row(T6, 't6-md-title', 'the markdown table title',
    '  \'# ' + OLD_ROUND + ' · the ' + OLD_REV + ' mutation table (every declared mutation re-measured on the ' + OLD_REV + ' bytes)\',',
    '  \'# ' + NEW_ROUND + ' · the ' + NEW_REV + ' mutation table (every declared mutation re-measured on the ' + NEW_REV + ' bytes)\','),
  row(T6, 't6-result-md', 'the RESULT line written into the markdown table',
    'declared mutations on the ' + OLD_REV + ' bytes rewrite',
    'declared mutations on the ' + NEW_REV + ' bytes rewrite'),
  row(T6, 't6-result-console', 'the RESULT line printed to the console',
    'is ok on the ' + OLD_REV + ' bytes.',
    'is ok on the ' + NEW_REV + ' bytes.'),
  row(T6, 't6-console-label', 'the console label the runner greps (its pattern moves in the same batch)',
    'console.log(`' + OLD_ROUND + ' mutation table: rows=',
    'console.log(`' + NEW_ROUND + ' mutation table: rows='),
  row(T6, 't6-log-prefix-mut', 'log-prefix row: the per-mutant, failure-path and note occurrences (4 total)',
    OLD_ROUND + 'c-mut-',
    NEW_ROUND + '-mut-',
    4),
  row(T6, 't6-log-prefix-table', 'log-prefix row: the table this run writes (json + md, 2 total)',
    OLD_ROUND + 'c-t1-mutation-table',
    NEW_ROUND + '-t1-mutation-table',
    2),
];

/* --------------------------------------- verify-independent/run-r13.ps1 (the canonical runner) */

const runnerBefore = read(RUNNER).toString('utf8');
const runnerLineOf = (needle, what) => {
  const found = runnerBefore.split('\n').filter((text) => text.includes(needle));
  if (found.length !== 1) {
    console.error(`REFUSING: ${found.length} line(s) of ${RUNNER} contain ${JSON.stringify(needle)} (${what}); expected exactly 1.`);
    process.exit(1);
  }
  return found[0];
};
const swapManifest = (from, newBytes, newSha, what) => {
  const oldBytes = Number(/bytes = (\d+);/.exec(from)[1]);
  const oldSha = /sha = '([0-9A-F]+)'/.exec(from)[1];
  if (String(oldBytes).length !== String(newBytes).length || oldSha.length !== newSha.length) {
    console.error(`REFUSING: the ${what} manifest row's field widths would change (${oldBytes} -> ${newBytes} B, ${oldSha.length} -> ${newSha.length} hex); re-align the row by hand first.`);
    process.exit(1);
  }
  return from.replace(oldSha, newSha).replace(String(oldBytes), String(newBytes));
};

const manifestClientFrom = runnerLineOf("@{ path = 'lib\\client.js';", 'frozen manifest row for lib/client.js');
const manifestHalfFrom = runnerLineOf("@{ path = 'verify\\client-half.test.mjs';", 'frozen manifest row for verify/client-half.test.mjs');
const manifestAudioFrom = runnerLineOf("@{ path = 'verify\\custom-audio.test.mjs';", 'frozen manifest row for verify/custom-audio.test.mjs');
const anchorClientFrom = runnerLineOf("@{ path = (Join-Path $plugin 'lib\\client.js')", 'section 0c anchor for lib/client.js');

const RUNNER_PREFIX_LITERALS = [
  "'r18c-baseline-before.txt'",
  '"r18c-dev-$suite.txt"',
  '"r18c-ind-$name.txt"',
  "'r18c-ind-probe-19-mutations.txt'",
  "'r18c-ind-probe-11-mutations.txt'",
  '"r18c-ind-probe-17-mut-$mutation.txt"',
  "'r18c-ind-probe-20-mutations.txt'",
  '"r18c-ind-probe-20-mut-$mutation.txt"',
  "'r18c-ind-r15t2-independent-probe-mutant.txt'",
  "'r18c-ind-probe-18-mutations.txt'",
  '"r18c-ind-probe-18-race-"',
  '"r18c-legacy-$name.txt"',
  '"r18c-reviewer-"',
  "'r18c-t1-mutation-table-console.txt'",
  "'r18c-baseline-after.txt'",
  "'r18c-frozen-diff.txt'",
];

const runnerRows = [
  row(RUNNER, 'runner-title', 'title line',
    '# Independent rev-18 full regression run (r18c/t7, one assertion name repaired so it states only the measurable fact; the r18/t1 and r18b/t5 logs are preserved).',
    '# Independent rev-19 full regression run (r19/t2, the caret duration moved ' + OLD_DURATION + ' ms -> ' + DURATION + ' ms and every live fingerprint re-anchored; the r18/t1, r18b/t5 and r18c/t7 logs are preserved).'),
  row(RUNNER, 'runner-prefix-note', 'the log-prefix note',
    '# logging. Every log this script writes carries the `r18c-` prefix; the r4 ... r12b archives, the',
    '# logging. Every log this script writes carries the `r19-` prefix; the r4 ... r12b archives, the'),
  row(RUNNER, 'runner-never-overwritten', 'the "never overwritten" list grows by the r18c round',
    '# evidence of the r15/r16/r17/r18/r18b rounds under verify-independent/_raw/ are NEVER overwritten',
    '# evidence of the r15/r16/r17/r18/r18b/r18c rounds under verify-independent/_raw/ are NEVER overwritten'),
  row(RUNNER, 'runner-prefix-lesson', 'the prefix lesson names this sub-round too',
    '# _raw/r16-t1-mislabelled-r15-logs/README.md. r17/t1, r18/t1, r18b/t5 AND r18c/t7 moved every prefix row in the',
    '# _raw/r16-t1-mislabelled-r15-logs/README.md. r17/t1, r18/t1, r18b/t5, r18c/t7 AND r19/t2 moved every prefix row in the'),
  row(RUNNER, 'runner-prefix-history', 'the r13w-era prefix sentence (historical literals keep their dash, this round\'s does not collide)',
    line(
      '#   archive stay untouched (each later round moved the prefix again: r15-, r16-, r17-, r18-, and the',
      '#   r18b/t5 repair sub-round writes `r18b-`; the rule itself is stated at the top of this header).'),
    line(
      '#   archive stay untouched (the prefix moved round after round: r15-, r16-, r17-, r18-, r18b- and the',
      '#   r18c repair sub-round; this r19/t2 re-anchor writes `r19-`, and the rule is stated at the top of',
      '#   this header).')),
  row(RUNNER, 'runner-why-lead', 'the WHY block: WHY THIS RUN EXISTS AT rev-19',
    line(
      '# WHY THIS RUN EXISTS AT rev-18 -- the user reported on a real device that the caret turn could',
      '# not be SEEN ("要有过渡动画能看到在转动的箭头"). rev-18 answers the half of that a constant can',
      '# answer and refuses to claim the other half:'),
    line(
      '# WHY THIS RUN EXISTS AT ' + NEW_REV + ' -- the caret turn moved ' + OLD_DURATION + ' ms -> ' + DURATION + ' ms, one round after',
      '# rev-18 had moved it 160 ms -> ' + OLD_DURATION + ' ms on the same device report ("要有过渡动画能看到在转动的',
      '# 箭头"). We answer the same half of it that a constant can answer and refuse to claim the other',
      '# half (the rev-18 reasoning recorded below is that round\'s own record, see the "PREVIOUS ROUND"',
      '# pointer further down):')),
  row(RUNNER, 'runner-why-constant', 'the WHY block: the constant this round moved',
    '#   - CARET_ROTATE_MS 160 -> 300. The CSS transition duration is STILL built from that constant',
    line(
      '#   - CARET_ROTATE_MS ' + DURATION + ' (160 -> ' + OLD_DURATION + ' in rev-18, which is now history). The CSS transition duration is',
      '#     STILL built from that constant')),
  row(RUNNER, 'runner-subround-note', 'the sub-round note: r18c/t7 becomes history, r19/t2 takes over',
    line(
      '#   - r18c/t7 (this sub-round) repairs ONE ASSERTION NAME that asserted device visibility, and',
      '#     re-anchors `verify/client-half.test.mjs` again. Its logs are `r18c-`; the r18/t1 and r18b/t5',
      '#     canonical logs, archives and mutation tables stay on disk untouched as the records a quality',
      '#     gate already reviewed.'),
    line(
      '#   - r18c/t7 repaired ONE ASSERTION NAME that asserted device visibility, and re-anchored',
      '#     `verify/client-half.test.mjs` again. Its logs carry the r18c prefix; the r18/t1 and r18b/t5',
      '#     canonical logs, archives and mutation tables stay on disk untouched as the records a quality',
      '#     gate already reviewed.',
      '#   - r19/t2 (this sub-round) moves the caret duration constant and re-anchors every live',
      '#     fingerprint that pinned it: byte counts, sha256 values, the build-stamp literals, the caret\'s',
      '#     absolute duration pin, the `caret-turn-ms-250` mutant anchor and this script\'s log prefix. Its',
      '#     logs are `r19-`; the r18/t1, r18b/t5 and r18c/t7 canonical logs, archives and mutation tables',
      '#     stay on disk untouched as the records a quality gate already reviewed.')),
  row(RUNNER, 'runner-product-delta', 'the lib/client.js delta line (old and new values both MEASURED)',
    line(
      '#   - lib/client.js 154457 B / B4A0A1B3... -> 156937 B / 1C8DB24C... (r18/t1) -> ' + PREV.bytes + ' B / ' + PREV.sha.slice(0, 8) + '... (r18b/t5, stamp + one comment repaired); diagnostics.revision is now',
      '#     \'' + OLD_STAMP + '\'.'),
    line(
      '#   - lib/client.js 154457 B / B4A0A1B3... -> 156937 B / 1C8DB24C... (r18/t1) -> ' + PREV.bytes + ' B / ' + PREV.sha.slice(0, 8) + '... (r18b/t5, stamp + one comment repaired) ->',
      '#     ' + PRODUCT.bytes + ' B / ' + PRODUCT.sha.slice(0, 8) + '... (r19/t1: SIX equal-length in-line substitutions -- the stamp, the',
      '#     duration constant and the comments that read it -- so the byte count is unchanged and the',
      '#     sha256 is not); diagnostics.revision is now \'' + STAMP + '\'.')),
  row(RUNNER, 'runner-half-delta', 'the client-half delta line (the new bytes+sha are MEASURED from the predicted post-edit text)',
    line(
      '#   - verify/client-half.test.mjs 95803 B / 97EEB2D0... -> 100983 B / AB6F7E48... -> 101496 B /',
      '#     B24E22E8... (r18c/t7: ONE assertion RENAMED -- its name used to assert device',
      '#     visibility; the expectation now lives in the comment above it). (ELEVEN new'),
    line(
      '#   - verify/client-half.test.mjs 95803 B / 97EEB2D0... -> 100983 B / AB6F7E48... -> 101496 B /',
      '#     B24E22E8... (r18c/t7: ONE assertion RENAMED -- its name used to assert device visibility; the',
      '#     expectation now lives in the comment above it) -> ' + HALF_NEW.bytes + ' B /',
      '#     ' + HALF_NEW.sha.slice(0, 8) + '... (r19/t2: FIVE assertion names and the stamp/duration literals moved',
      '#     to ' + NEW_REV + '; the assertion count is unchanged at 399). (ELEVEN new')),
  row(RUNNER, 'runner-audio-delta', 'the custom-audio delta line (the new sha is MEASURED from the predicted post-edit text)',
    line(
      '#   - verify/custom-audio.test.mjs 20263 B / 523572EA... -> 20263 B / 6EF2F162... -- ONE byte',
      '#     (the version literal at :267; the assertion count is unchanged at 83 call sites).'),
    line(
      '#   - verify/custom-audio.test.mjs 20263 B / 523572EA... -> 20263 B / 6EF2F162... -> ' + AUDIO_NEW.bytes + ' B /',
      '#     ' + AUDIO_NEW.sha.slice(0, 8) + '... -- ONE byte each time (the version literal at :267; the',
      '#     assertion count is unchanged at 75 checks).')),
  row(RUNNER, 'runner-previous-round', 'THE PREVIOUS ROUND IS RECORDED ELSEWHERE -> the rev-18 record (and the older rev-17 pointer)',
    line(
      '# THE PREVIOUS ROUND IS RECORDED ELSEWHERE: the rev-17 narrative that used to sit here (its byte',
      '# counts, its sha256 values and its stamp) now lives where a previous round\'s record belongs --',
      '# CHANGELOG.md (the rev-17 section), docs/变异覆盖与残留红.md section 14, _raw/r17-run-console.txt,',
      '# _raw/r17-t1-mutation-table.json/.md, and the rev-17 baselines archived under _raw/r17-t1-archive/',
      '# and _raw/r18-t1-archive/. This file POINTS at that record instead of duplicating it, so the only',
      '# revision fingerprints left here are the current round\'s and the rev-15 narrative that was',
      '# already history before r16/t1 ran (see docs §14.4 for the disclosed edit).'),
    line(
      '# THE PREVIOUS ROUND IS RECORDED ELSEWHERE: the rev-18 narrative that used to sit here (the 160 ms',
      '# -> ' + OLD_DURATION + ' ms reasoning, the reduceMotion() addition, its byte counts, its sha256 values and its',
      '# stamp) now lives where a previous round\'s record belongs -- CHANGELOG.md (the rev-18 section),',
      '# _raw/r18-run-console.txt, _raw/r18-t1-mutation-table.json/.md, and the rev-18 baselines archived',
      '# under _raw/r18-t1-archive/, _raw/r18b-t5-archive/ and the r18c/t7 archive. The even older rev-17',
      '# narrative that used to sit here is pointed at the same way -- CHANGELOG.md (the rev-17 section),',
      '# docs/变异覆盖与残留红.md section 14, _raw/r17-run-console.txt, _raw/r17-t1-mutation-table.json/.md',
      '# and _raw/r17-t1-archive/. This file POINTS at those records instead of duplicating them, so the',
      '# only revision fingerprints left here are the current round\'s and the rev-15 narrative that was',
      '# already history before r16/t1 ran (see docs §14.4 for the disclosed edit).')),
  row(RUNNER, 'runner-manifest-note', 'the frozen-manifest note',
    '# THE FROZEN MANIFEST -- 9 files, re-anchored to the rev-18 baseline. Re-anchoring this table',
    '# THE FROZEN MANIFEST -- 9 files, re-anchored to the rev-19 baseline. Re-anchoring this table'),
  row(RUNNER, 'runner-manifest-client', 'frozen manifest row: lib/client.js (MEASURED, from the runner\'s own line)',
    manifestClientFrom, swapManifest(manifestClientFrom, PRODUCT.bytes, PRODUCT.sha, 'lib/client.js')),
  row(RUNNER, 'runner-manifest-half', 'frozen manifest row: verify/client-half.test.mjs (MEASURED post-edit)',
    manifestHalfFrom, swapManifest(manifestHalfFrom, HALF_NEW.bytes, HALF_NEW.sha, 'client-half')),
  row(RUNNER, 'runner-manifest-audio', 'frozen manifest row: verify/custom-audio.test.mjs (MEASURED post-edit)',
    manifestAudioFrom, swapManifest(manifestAudioFrom, AUDIO_NEW.bytes, AUDIO_NEW.sha, 'custom-audio')),
  row(RUNNER, 'runner-section0-heading', 'section 0 heading',
    'Write-Host \'=== 0. frozen manifest: 9 recorded files byte-identical to the rev-18 baseline ===\'',
    'Write-Host \'=== 0. frozen manifest: 9 recorded files byte-identical to the rev-19 baseline ===\''),
  row(RUNNER, 'runner-section0c', 'section 0c: which round changed what',
    'Write-Host \'rev-18 changed lib/client.js and verify/: lib/index.js must still be the rev-11 bytes.\'',
    'Write-Host \'rev-19 changed lib/client.js and verify/: lib/index.js must still be the rev-11 bytes.\''),
  row(RUNNER, 'runner-anchor-client', 'section 0c anchor row: lib/client.js (MEASURED, from the runner\'s own line)',
    anchorClientFrom, swapManifest(anchorClientFrom, PRODUCT.bytes, PRODUCT.sha, 'lib/client.js (0c)')),
  row(RUNNER, 'runner-probe-fallback-comment', 'the fallback comment quoting the r15t2 banner',
    '  # \'=== shipped rev-18 run: 42/42 checks passed ===\'), so fall back to the last non-empty line',
    '  # \'=== shipped ' + NEW_REV + ' run: 42/42 checks passed ===\'), so fall back to the last non-empty line'),
  row(RUNNER, 'runner-section2e-heading', 'section 2e heading: this round\'s duration is covered there too',
    'Write-Host \'=== 2e. probe-20 falsifiability: the SESSION-BELL + CARET APPEARANCE and the rev-18 REDUCED-MOTION DIAGNOSTIC (rev-13, rev-14, the r16/t1 gap, the r17/t1 turn) ===\'',
    'Write-Host \'=== 2e. probe-20 falsifiability: the SESSION-BELL + CARET APPEARANCE and the rev-18 REDUCED-MOTION DIAGNOSTIC (rev-13, rev-14, the r16/t1 gap, the r17/t1 turn, the rev-19 duration) ===\''),
  row(RUNNER, 'runner-section5-heading', 'section 5 heading: the legacy probes were re-anchored again',
    'Write-Host \'=== 5. legacy probes from rev-1 ... rev-3 (green since r15-t3, re-anchored at rev-18; a non-zero exit is a FAILURE) ===\'',
    'Write-Host \'=== 5. legacy probes from rev-1 ... rev-3 (green since r15-t3, re-anchored at rev-18 and again at rev-19; a non-zero exit is a FAILURE) ===\''),
  row(RUNNER, 'runner-section7b-heading', 'section 7b heading',
    'Write-Host \'=== 7b. rev-18 mutation table: every declared mutation re-measured on THESE bytes ===\'',
    'Write-Host \'=== 7b. rev-19 mutation table: every declared mutation re-measured on THESE bytes ===\''),
  row(RUNNER, 'runner-section7b-note1', 'section 7b: the artifact the table insists on',
    'Write-Host \'verify-independent/r15t6-mutation-table.mjs refuses to run unless lib/client.js is the rev-18\'',
    'Write-Host \'verify-independent/r15t6-mutation-table.mjs refuses to run unless lib/client.js is the rev-19\''),
  row(RUNNER, 'runner-section7b-note2', 'section 7b: where the table lands (stale even before this round)',
    'Write-Host \'(one run, ten declared red checks) and writes _raw/r18-t1-mutation-table.json/.md. Any row that\'',
    'Write-Host \'(one run, ten declared red checks) and writes _raw/r19-t1-mutation-table.json/.md. Any row that\''),
  row(RUNNER, 'runner-table-grep', 'section 7b: the pattern that reads the table\'s console label',
    'Pattern \'^r18 mutation table: \'', 'Pattern \'^r19 mutation table: \''),
  row(RUNNER, 'runner-summary-manifest', 'the summary line: which manifest the run was byte-identical to',
    '  Write-Host \'are byte-identical to the rev-18 manifest before and after; the four .scratch reviewer probes still\'',
    '  Write-Host \'are byte-identical to the rev-19 manifest before and after; the four .scratch reviewer probes still\''),
  ...RUNNER_PREFIX_LITERALS.map((literal, index) => row(RUNNER, `runner-log-prefix-${index + 1}`,
    `log-prefix row ${index + 1}/${RUNNER_PREFIX_LITERALS.length}: ${literal}`,
    literal,
    literal.replace(OLD_ROUND + 'c-', NEW_ROUND + '-'))),
];

/* the two manifest rows and the two delta lines carry the MEASURED post-edit values */

const rows = [...halfRows, ...audioRows, ...probeRows, ...runnerRows];
const files = [...new Set(rows.map((entry) => entry.file))];
const substitutions = rows.reduce((total, entry) => total + entry.count, 0);

/* -------------------------------------------------------------- overlapping-row self-check */

const overlapProblems = [];
for (let i = 0; i < rows.length; i += 1) {
  for (let j = i + 1; j < rows.length; j += 1) {
    const a = rows[i];
    const b = rows[j];
    if (a.file !== b.file) continue;
    const aNames = [a.from, a.to];
    for (const needle of [b.from, b.to]) {
      for (const candidate of aNames) {
        if (needle.includes(candidate) || candidate.includes(needle)) {
          overlapProblems.push(`${a.file}: <${a.id}> and <${b.id}> overlap; their counts cannot both be met by one pass`);
        }
      }
    }
  }
}
/* the acceptance requires the OLD prefix to be gone from the runner entirely -- a row's own new
 * text may not smuggle it back in (an archive path spelling it out, for instance). */
for (const entry of rows.filter((item) => item.file === RUNNER)) {
  if (entry.to.includes(OLD_ROUND + 'c-')) {
    overlapProblems.push(`${RUNNER}: row <${entry.id}> writes the old prefix ${OLD_ROUND}c- back into the runner`);
  }
}

/* ------------------------------------------------------------------------------- dry report */

const say = (text) => console.log(text);

const texts = {};
const before = {};
for (const relPath of files) {
  const buffer = read(relPath);
  texts[relPath] = buffer.toString('utf8');
  before[relPath] = { bytes: buffer.length, sha: sha256(buffer) };
}

say(`${SUBROUND} re-anchor ${WRITE ? '(WRITE MODE)' : '(dry run)'}`);
say(`lib/client.js                : ${PRODUCT.bytes} B / ${PRODUCT.sha}  revision="${STAMP}"  CARET_ROTATE_MS=${DURATION}`);
say(`pre-rev-19 product (archive): ${PREV.bytes} B / ${PREV.sha}  from ${PREV.source}`);
say(`predicted post-edit         : ${HALF} ${HALF_NEW.bytes} B / ${HALF_NEW.sha}`);
say(`                              ${AUDIO} ${AUDIO_NEW.bytes} B / ${AUDIO_NEW.sha}`);
say(`archive                      : ${ARCHIVE.replace(PLUGIN, '').replace(/^[\\/]/, '').replace(/\\/g, '/')}`);
say(`rows / substitutions / files : ${rows.length} / ${substitutions} / ${files.length}`);
say('');

if (overlapProblems.length > 0) {
  for (const problem of overlapProblems) console.error(`OVERLAP: ${problem}`);
  console.error('REFUSING: the row table overlaps itself; nothing was written.');
}

let missing = 0;
let applied = 0;
const pending = [];
for (const entry of rows) {
  const text = texts[entry.file];
  const eol = eolOf(text);
  const from = withEol(entry.from, eol);
  const to = withEol(entry.to, eol);
  const fromCount = occ(text, from);
  const toCount = occ(text, to);
  const insertion = to.includes(from);
  const isPending = fromCount === entry.count && toCount === 0;
  const isApplied = !isPending && toCount === entry.count && (insertion || fromCount === 0);
  const verdict = isPending
    ? `${fromCount}/${entry.count} occurrences present`
    : (isApplied
      ? `already applied (${toCount}/${entry.count} replacement(s) present)`
      : `MISMATCH: from=${fromCount} (declared ${entry.count}), to=${toCount}${insertion ? ' (insertion row)' : ''}`);
  if (isPending) pending.push({ entry, from, to });
  else if (isApplied) applied += 1;
  else missing += 1;
  say(`  [${isPending ? 'DRY-OK' : isApplied ? 'APPLIED' : 'REFUSED'}] ${entry.file}  <${entry.id}>`);
  say(`      ${entry.what}`);
  say(`      ${verdict}`);
}
say('');

const postState = applied === rows.length;
const clean = missing === 0 && overlapProblems.length === 0;
const filesToWrite = [...new Set(pending.map(({ entry }) => entry.file))];

const written = [];
if (WRITE && !clean) {
  console.error(`REFUSING TO WRITE: ${missing} row(s) are in neither the pre-state nor the post-state. Nothing was written.`);
} else if (WRITE && postState) {
  say('nothing to do: every row is already applied (post-state).');
} else if (WRITE) {
  /* ---- archive first: the pre-edit bytes of every file this run rewrites, before the first write ---- */
  mkdirSync(ARCHIVE, { recursive: true });
  const archiveProblems = [];
  for (const relPath of filesToWrite) {
    const { bytes, sha } = before[relPath];
    const target = join(ARCHIVE, `${relPath.replace(/\//g, '__')}.${sha.slice(0, 16)}.txt`);
    writeFileSync(target, read(relPath));
    const archivedSha = sha256(readFileSync(target));
    if (archivedSha !== sha) archiveProblems.push(`${relPath}: the archive copy hashes to ${archivedSha}, not the pre-edit ${sha}`);
    say(`archived ${relPath} (${bytes} B / ${sha}) -> ${target.replace(PLUGIN, '').replace(/\\/g, '/')}`);
  }
  if (archiveProblems.length > 0) {
    console.error('REFUSING TO WRITE: an archive copy does not hash back to the pre-edit bytes:');
    for (const problem of archiveProblems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  say('');
  for (const relPath of filesToWrite) {
    const text = applyPending(texts[relPath], pending.filter(({ entry }) => entry.file === relPath).map(({ entry }) => entry));
    writeFileSync(join(PLUGIN, relPath), text, 'utf8');
    written.push(relPath);
    say(`wrote ${relPath}`);
  }
  say('');
}

/* ------------------------------------------------------------------ post-state self-check */

let stillOld = 0;
for (const entry of rows) {
  const text = read(entry.file).toString('utf8');
  const eol = eolOf(text);
  if (occ(text, withEol(entry.from, eol)) === entry.count && occ(text, withEol(entry.to, eol)) === 0) stillOld += 1;
}

/* the manifest rows and the delta lines must equal what is on disk NOW, measured again. These
 * comparisons only mean anything once every row is applied: in the pre-state the runner still
 * carries its old rows by definition. */
const manifestProblems = [];
const runnerNow = read(RUNNER).toString('utf8');
if (postState) {
  for (const [relPath, pspath] of [[HALF, 'verify\\client-half.test.mjs'], [AUDIO, 'verify\\custom-audio.test.mjs'], ['lib/client.js', 'lib\\client.js']]) {
    const buffer = read(relPath);
    const index = runnerNow.indexOf(`@{ path = '${pspath}';`);
    const segment = index === -1 ? '' : runnerNow.slice(index, runnerNow.indexOf('\n', index));
    if (!segment.includes(`bytes = ${buffer.length};`) || !segment.includes(`sha = '${sha256(buffer)}'`)) {
      manifestProblems.push(`${pspath}: the runner's manifest row is "${segment.trim()}" but disk measures ${buffer.length} B / ${sha256(buffer)}`);
    }
  }
  for (const [relPath, predicted] of [[HALF, HALF_NEW], [AUDIO, AUDIO_NEW]]) {
    const buffer = read(relPath);
    if (buffer.length !== predicted.bytes || sha256(buffer) !== predicted.sha) {
      manifestProblems.push(`${relPath}: the bytes on disk do not match the predicted post-edit text (${buffer.length} B / ${sha256(buffer)} vs ${predicted.bytes} B / ${predicted.sha})`);
    }
  }
  if (occ(runnerNow, OLD_ROUND + 'c-') !== 0) manifestProblems.push(`${RUNNER}: ${occ(runnerNow, OLD_ROUND + 'c-')} occurrence(s) of the old log prefix survive`);
  if (occ(runnerNow, NEW_ROUND + '-') === 0) manifestProblems.push(`${RUNNER}: no ${NEW_ROUND}- log prefix found after the write`);
  for (const entry of RUNNER_PREFIX_LITERALS) {
    const wanted = entry.replace(OLD_ROUND + 'c-', NEW_ROUND + '-');
    if (occ(runnerNow, `Join-Path $raw ${wanted}`) === 0 && occ(runnerNow, `Join-Path $raw (${wanted}`) === 0) {
      manifestProblems.push(`${RUNNER}: the log path ${wanted} is not written by any Join-Path row`);
    }
  }
}

const figures = {
  tool: 'verify-independent/r19-reanchor.mjs',
  subRound: SUBROUND,
  what: "the row table's own arithmetic (rows / substitutions / fileCount), computed by the program",
  mode: WRITE ? (postState ? 'post-state' : 'write') : (postState ? 'post-state' : 'dry-run'),
  product: { path: 'lib/client.js', bytes: PRODUCT.bytes, sha256: PRODUCT.sha, revision: STAMP, caretRotateMs: DURATION },
  previousProduct: { source: PREV.source, bytes: PREV.bytes, sha256: PREV.sha, revision: OLD_STAMP, caretRotateMs: OLD_DURATION },
  predictedPostEdit: {
    [HALF]: { bytes: HALF_NEW.bytes, sha256: HALF_NEW.sha },
    [AUDIO]: { bytes: AUDIO_NEW.bytes, sha256: AUDIO_NEW.sha },
  },
  rowTable: { rows: rows.length, substitutions, fileCount: files.length, files },
  rowsById: rows.map((entry) => ({ id: entry.id, file: entry.file, count: entry.count })),
  archive: ARCHIVE.replace(PLUGIN, '').replace(/^[\\/]/, '').replace(/\\/g, '/'),
  manifestChecked: postState,
  filesWritten: written,
  oldPrefixOccurrencesInRunner: occ(runnerNow, OLD_ROUND + 'c-'),
  newPrefixOccurrencesInRunner: occ(runnerNow, NEW_ROUND + '-'),
  postState,
  stillOld,
  missing,
  overlapProblems,
  manifestProblems,
};

say(`post-state: ${rows.length - stillOld}/${rows.length} rows no longer contain their old text; ${missing} row(s) were refused; ${overlapProblems.length} overlap(s).`);
say(clean === false
  ? `RESULT: REFUSED -- ${missing} row(s) match neither state; nothing was written.`
  : postState
    ? 'RESULT: already applied (post-state verified) -- every declared replacement is present exactly its declared number of times.'
    : WRITE
      ? `RESULT: written -- all ${rows.length} rows replaced exactly as declared, after archiving the pre-edit bytes.`
      : "RESULT: dry run clean -- every row's old text is present exactly the declared number of times; nothing was written.");

/* The record is written only when the whole batch is applied and self-checked: a dry run on the
 * pre-state writes NOTHING (so "the tool writes nothing when it refuses" stays literally true), and a
 * refused batch writes nothing either. */
if (clean && manifestProblems.length === 0 && (WRITE || postState)) {
  writeFileSync(join(RAW, 'r19-t2-reanchor.json'), `${JSON.stringify(figures, null, 2)}\n`, 'utf8');
}

console.log("\n--- tool JSON (rows / substitutions / fileCount are the program's own arithmetic) ---");
console.log(JSON.stringify(figures, null, 2));

if (manifestProblems.length > 0) {
  console.error('post-state self-check problems:');
  for (const problem of manifestProblems) console.error(`  - ${problem}`);
  process.exit(1);
}
process.exit(clean ? 0 : 1);
