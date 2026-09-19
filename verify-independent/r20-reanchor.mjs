/**
 * r20 / t1 -- re-anchor every LIVE fingerprint after the rev-20 product change (the caret duration
 * back to 160 ms, the DELETE of both `prefers-reduced-motion: reduce` media blocks, and the
 * re-scoping of `reduceMotion()` to a pure environment report).
 *
 * WHY THIS FILE EXISTS
 * The product on disk is rev-20. Every file that PINS the product (its byte count, its sha256, its
 * build stamp, the caret's absolute duration, the anchor of the `caret-turn-ms-250` mutant, the
 * reduced-motion checks that asserted an override the product no longer carries) or that names the
 * CURRENT round's log files is therefore stale, and the runner's frozen manifest declares three of
 * those files by bytes+sha. This instrument moves exactly those literals and nothing else: the r19
 * round's own records (its consoles, archives, mutation tables, the r19 narrative in probe-20 and in
 * client-half) stay as that round's history.
 *
 * THE DISCIPLINE (inherited from r15/t6, r16/t1, r17/t1, r18/t1, r18b/t5, r18c/t7 and r19/t2)
 *   1. every row carries the EXACT number of occurrences it must replace; ONE wrong count aborts the
 *      whole run BEFORE anything is written (`--write` included), and the row table is checked for
 *      overlapping rows at start-up;
 *   2. no fingerprint is typed by hand. The OLD values (bytes, sha256, stamp, duration) are MEASURED
 *      from `_raw/r20-t1-archive/` -- the archived pre-rev-20 product -- the NEW values are MEASURED
 *      from `lib/client.js`, the frozen-manifest lines of the runner are READ OUT of the runner, and
 *      the two harness files' post-edit bytes+sha are computed from their predicted post-edit text;
 *   3. the pre-edit bytes of every file this run rewrites are archived under
 *      `_raw/r20-evidence/archive/<path with / -> __>.<pre-edit sha16>.txt` BEFORE the first write,
 *      and a copy that does not hash back to the pre-edit bytes refuses the write;
 *   4. the log-prefix rows move in the SAME batch (`r19-` -> `r20-`), because the forgotten prefix
 *      row is what overwrote a previous round's logs in r16/t1; the r18c and r19 evidence on disk may
 *      not lose a byte;
 *   5. every artifact THIS round writes (its JSON, its archives, the mutation table and its per-row
 *      logs) lands under `_raw/r20-evidence/`, never at the root of `_raw/`.
 *
 *     node verify-independent/r20-reanchor.mjs            # dry run: report + JSON, writes NOTHING
 *     node verify-independent/r20-reanchor.mjs --quiet    # same, only the refuses and the summary
 *     node verify-independent/r20-reanchor.mjs --write    # archive, then apply, then self-check
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/* the plugin root is FOUND, not assumed from this file's own depth: this instrument is copied into
 * a scratch copy of the tree for its drill and falsification runs, and a copy must behave like the
 * original. */
const findRoot = (start) => {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'lib', 'client.js')) && existsSync(join(dir, 'verify-independent'))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
};
const PLUGIN = findRoot(HERE);
if (PLUGIN === null) {
  console.error('REFUSING: no plugin root (lib/client.js + verify-independent/) above this file.');
  process.exit(1);
}
const RAW = join(PLUGIN, 'verify-independent', '_raw');
const EVIDENCE = join(RAW, 'r20-evidence');
const ARCHIVE = join(EVIDENCE, 'archive');
const WRITE = process.argv.includes('--write');
const QUIET = process.argv.includes('--quiet');
const SUBROUND = 'r20/t1';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase();
const read = (relPath) => readFileSync(join(PLUGIN, relPath));
const occ = (text, needle) => text.split(needle).length - 1;
const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');
const withEol = (text, eol) => text.split('\n').join(eol);
const line = (...parts) => parts.join('\n');

/* ------------------------------------------------------------ measured inputs (never typed) */

const T1_ARCHIVE = join(RAW, 'r20-t1-archive');
const t1Copy = existsSync(T1_ARCHIVE)
  ? readdirSync(T1_ARCHIVE).find((name) => name.startsWith('lib__client.js.') && name.endsWith('.txt'))
  : undefined;
if (t1Copy === undefined) {
  console.error(`REFUSING: no pre-rev-20 product archive under ${T1_ARCHIVE}.`);
  process.exit(1);
}
const prevBuffer = readFileSync(join(T1_ARCHIVE, t1Copy));
const prevText = prevBuffer.toString('utf8');
const PREV = { source: `_raw/r20-t1-archive/${t1Copy}`, bytes: prevBuffer.length, sha: sha256(prevBuffer), text: prevText };

const productBuffer = read('lib/client.js');
const PRODUCT = { bytes: productBuffer.length, sha: sha256(productBuffer), text: productBuffer.toString('utf8') };

const pick = (text, regex, what) => {
  const match = regex.exec(text);
  if (match === null) {
    console.error(`REFUSING: ${what} not found.`);
    process.exit(1);
  }
  return match[1];
};
const OLD_STAMP = pick(prevText, /var REVISION = '([^']*)';/, 'the pre-rev-20 revision stamp');
const STAMP = pick(PRODUCT.text, /var REVISION = '([^']*)';/, 'the shipped revision stamp in lib/client.js');
const OLD_DURATION = Number(pick(prevText, /var CARET_ROTATE_MS = (\d+);/, 'the pre-rev-20 CARET_ROTATE_MS'));
const DURATION = Number(pick(PRODUCT.text, /var CARET_ROTATE_MS = (\d+);/, 'the shipped CARET_ROTATE_MS'));
const OLD_REV = OLD_STAMP.slice(0, 6);
const NEW_REV = STAMP.slice(0, 6);
const OLD_ROUND = OLD_REV.replace('rev-', 'r');
const NEW_ROUND = NEW_REV.replace('rev-', 'r');
/* the CRLF newline count of the shipped bundle: probe-20's note about its CRLF-joined anchors states
 * this number as a measurement, so it is measured here rather than typed. */
const PRODUCT_CRLF = occ(PRODUCT.text, '\r\n');

if (PREV.sha === PRODUCT.sha || OLD_DURATION === DURATION || OLD_REV === NEW_REV) {
  console.error(`REFUSING: ${PREV.source} and lib/client.js do not describe two different revisions (${PREV.sha === PRODUCT.sha ? 'same sha256' : `${OLD_DURATION} -> ${DURATION} ms`}).`);
  process.exit(1);
}
if (occ(PRODUCT.text, '@media (prefers-reduced-motion') !== 0) {
  console.error('REFUSING: the shipped product still carries a reduced-motion media block; this round deletes them.');
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

/* the check name the rewritten client-half reduce-motion section and probe-20 agree on */
const NO_OVERRIDE_CHECK = 'the caret turn is NOT damped in any environment: no prefers-reduced-motion rule names it (rev-20)';
/* measured by the harness after this batch (the runner's own delta line quotes it); asserted in the
 * post-state self-check below, so a wrong number cannot survive the run. */
const HALF_CHECKS = 400;

const row = (file, id, what, from, to, count = 1) => ({ file, id, what, from, to, count });

/* --------------------------------------- verify/client-half.test.mjs (stamp, duration, semantics) */

const halfRows = [
  row(HALF, 'half-header-bullet', 'the rev-19 bullet stops claiming the shipped number as "now"; the rev-20 bullet records the flip',
    line(
      ' *   - rev-19: the caret\'s turn is now ' + OLD_DURATION + ' ms — the same device reading that',
      ' *     produced rev-18 said the 300 ms turn was still an instant cut, so the constant',
      ' *     moved again. The stylesheet still CONCATENATES that number from the constant instead of',
      ' *     copying it, and exactly ONE caret transition rule exists;'),
    line(
      ' *   - rev-19: the caret\'s turn moved 300 ms → ' + OLD_DURATION + ' ms — the same device reading that',
      ' *     produced rev-18 said the 300 ms turn was still an instant cut, so the constant',
      ' *     moved again. The stylesheet still CONCATENATES that number from the constant instead of',
      ' *     copying it, and exactly ONE caret transition rule existed;',
      ' *   - rev-20: the turn is ' + DURATION + ' ms again (user request: "动画效果打开有效果，不过我要的是开不开都',
      ' *     是能有动画的，把动画时长改回 160ms。") and BOTH reduced-motion media blocks are DELETED —',
      ' *     the caret\'s own override was the real reason no duration was ever played on the reporting',
      ' *     device, whose system asks for reduced motion. It is a deliberate trade-off and it is',
      ' *     recorded as one next to the constant: this micro-interaction no longer distinguishes',
      ' *     environments, so it must not be quoted as an accessibility policy;')),
  row(HALF, 'half-stamp-assertion', 'the stamp assertion moves to the shipped revision',
    'report.equal(\'the revision stamp is ' + OLD_REV + '\', String(bundle.diagnostics.revision).startsWith(\'' + OLD_REV + '\'), true);',
    'report.equal(\'the revision stamp is ' + NEW_REV + '\', String(bundle.diagnostics.revision).startsWith(\'' + NEW_REV + '\'), true);'),
  row(HALF, 'half-duration-comment', 'the duration section header records rev-20 and drops the claim that a duration is what was missing',
    line(
      '/* ' + OLD_REV + ' · the duration moved 300 ms → ' + OLD_DURATION + ' ms, one round after rev-18 had moved it',
      ' * 160 ms → 300 ms on the same DEVICE reading. The old 120–200 ms band assertion rev-17 wrote',
      ' * is gone: it encoded rev-17\'s reasoning ("a turn reads as a turn between roughly 120 ms',
      ' * and 200 ms"), which is the very judgment the user\'s device overturned (they could not see',
      ' * the arrow turn). What is pinned now is the shipped number, and that the stylesheet still',
      ' * CONCATENATES that number from the constant — a hand-copied `' + OLD_DURATION + 'ms` would satisfy "the',
      ' * value is ' + OLD_DURATION + '" while quietly re-introducing the second copy the constant exists to',
      ' * prevent.'),
    line(
      '/* ' + NEW_REV + ' · the duration moved ' + OLD_DURATION + ' ms → ' + DURATION + ' ms, and this round also records WHY no',
      ' * duration was ever played: the caret\'s own reduced-motion override deleted the transition on the',
      ' * reporting device, so rev-18\'s 300 ms and rev-19\'s ' + OLD_DURATION + ' ms both arrived as the same instant',
      ' * cut. What is pinned below is the SHIPPED number, and that the stylesheet still CONCATENATES',
      ' * it from the constant — a hand-copied `' + DURATION + 'ms` would satisfy "the value is ' + DURATION + '" while',
      ' * quietly re-introducing the second copy the constant exists to prevent.')),
  row(HALF, 'half-duration-comment-claim', 'the "what these assertions cannot claim" note for rev-20',
    line(
      ' * WHAT THESE ASSERTIONS CANNOT CLAIM: that the change made the turn perceivable. That is an',
      ' * EXPECTATION — a judgment, not a device measurement — so every check name below states',
      ' * only a measurable fact (the shipped value, the curve, the angle, the box), and this',
      ' * comment is the only place the expectation is written down. Whether the turn is perceivable',
      ' * is settled by the user on their own hardware and by nothing in this file; r18c/t7 renamed',
      ' * the assertion whose name used to assert otherwise. */'),
    line(
      ' * WHAT THESE ASSERTIONS CANNOT CLAIM: that any duration makes the turn perceivable. That is an',
      ' * EXPECTATION — a judgment, not a device measurement — so every check name below states only a',
      ' * measurable fact (the shipped value, the curve, the angle, the box), and the note beside the',
      ' * constant is the only place the expectation is written down. Whether the turn is perceivable is',
      ' * settled by the user on their own hardware and by nothing in this file; r18c/t7 renamed the',
      ' * assertion whose name used to assert otherwise, and r20/t1 changed no assertion into a claim',
      ' * about perception. */')),
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
    '  \'so exactly ONE caret transition rule exists, with no stale 300 ms copy beside it (' + OLD_REV + ')\',',
    '  \'so exactly ONE caret transition rule exists, with no stale ' + OLD_DURATION + ' ms copy beside it (' + NEW_REV + ')\','),
  row(HALF, 'half-switch-motion', 'the switch\'s reduced-motion assertion states the new semantics: no override is emitted at all',
    line(
      'report.ok(',
      '  \'the switch honours prefers-reduced-motion\',',
      '  styleText.includes(\'@media (prefers-reduced-motion:reduce){.dacSwitch,.dacKnob{transition:none;}}\'),',
      ');'),
    line(
      'report.equal(',
      '  \'the switch keeps its transitions in every environment: the stylesheet carries no reduced-motion rule (' + NEW_REV + ')\',',
      '  styleText.includes(\'prefers-reduced-motion\'),',
      '  false,',
      ');')),
  row(HALF, 'half-caret-motion-section', 'the two "the caret has its own override" checks are replaced by three that assert the opposite',
    line(
      'const caretMotionBlock = mediaBlocks(\'@media (prefers-reduced-motion:reduce)\').find((block) => block.includes(\'.dacCaret svg\')) ?? \'\';',
      'report.equal(',
      '  \'the caret turn has its own prefers-reduced-motion override (rev-17)\',',
      '  caretMotionBlock,',
      '  \'@media (prefers-reduced-motion:reduce){.dacCaret svg{transition:none;}}\',',
      ');',
      'report.ok(',
      '  \'it removes ONLY the motion — no transform in the block, so reduced motion still points down (rev-17)\',',
      '  caretMotionBlock.includes(\'transition:none\') && !caretMotionBlock.includes(\'transform\'),',
      '  caretMotionBlock,',
      ');'),
    line(
      '/* ' + NEW_REV + ' · the override is GONE. rev-17 shipped a reduced-motion block that removed the caret\'s',
      ' * transition for readers who ask for no motion, and rev-18 and rev-19 raised the duration twice while',
      ' * that block silently deleted it on the reporting user\'s machine — which is why no duration ever',
      ' * showed up there. Both it and the switch\'s sibling block are deleted, so the caret turn takes',
      ' * `sessionIcon.caretRotateMs` in EVERY environment. These three checks state that as a measurable',
      ' * fact instead of pinning a block that no longer exists. */',
      'report.equal(',
      '  \'no reduced-motion rule is emitted for the caret any more (' + NEW_REV + ')\',',
      '  mediaBlocks(\'@media (prefers-reduced-motion\').length,',
      '  0,',
      ');',
      'report.ok(',
      '  \'and the product itself carries no `@media (prefers-reduced-motion` block at all, so nothing can damp the turn (' + NEW_REV + ')\',',
      '  (String(source).match(/@media \\(prefers-reduced-motion/g) ?? []).length === 0,',
      '  \'occurrences in lib/client.js=\' + String((String(source).match(/@media \\(prefers-reduced-motion/g) ?? []).length),',
      ');',
      'report.ok(',
      '  \'so the caret keeps its ONE transition in every environment, whatever the platform prefers (' + NEW_REV + ')\',',
      '  styleText.includes(\'.dacCaret svg{transition:transform \' + sessionIcon.caretRotateMs + \'ms ease;}\')',
      '    && !styleText.includes(\'prefers-reduced-motion\'),',
      '  \'transition=\' + String(sessionIcon.caretRotateMs) + \'ms, reduced-motion text in the sheet=\' + styleText.includes(\'prefers-reduced-motion\'),',
      ');')),
  row(HALF, 'half-reduce-motion-comment', 'the reduce-motion section header describes an environment report, not a second cause',
    line(
      '/* rev-18 · the reduce-motion diagnostic. An arrow that jumps has TWO causes that look',
      ' * identical on a device — the turn is too fast to see, or the environment asks for reduced',
      ' * motion (and the media block above then removes the transition BY DESIGN, so the 90°',
      ' * terminal state lands instantly). Only the page can say which one is in play, so the',
      ' * diagnostic is a FUNCTION that reads the live media query on every call: never a boolean',
      ' * frozen when the bundle applied, and never a key of the `sessionIcon` geometry snapshot.',
      ' * The three stubs below are the three answers a real page can give — reduce, no preference,',
      ' * and no `matchMedia` at all (which is what this repo\'s own headless platform looks like,',
      ' * so it is the branch most likely to be hit accidentally and must not throw). */'),
    line(
      '/* rev-18 · the reduce-motion diagnostic, re-scoped by ' + NEW_REV + '. It used to be the second half of',
      ' * the "an arrow that jumps has TWO causes" story: the turn was too fast to see, or the environment',
      ' * asked for reduced motion and the media block then removed the transition BY DESIGN. ' + NEW_REV + ' deleted',
      ' * that block — the environment had been deleting the turn on the reporting device all along — so the',
      ' * diagnostic is now an ENVIRONMENT REPORT: it still answers the live media query on every call, and',
      ' * nothing in the bundle branches on the answer any more. The three stubs below are the three answers a',
      ' * real page can give — reduce, no preference, and no `matchMedia` at all (which is what this repo\'s own',
      ' * headless platform looks like, so it is the branch most likely to be hit accidentally and must not',
      ' * throw). */')),
  row(HALF, 'half-reduce-motion-section', 'the section title stops promising a behavioural difference',
    'report.section(\'rev-18 · reduceMotion() separates "too fast to see" from "no motion wanted"\');',
    'report.section(\'rev-18 · reduceMotion() reports the environment (re-scoped by ' + NEW_REV + ': nothing branches on it)\');'),
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
 * text is absent). Re-applying an INSERTION row would otherwise grow the text again. */
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

  row(P17, 'p17-bytes', 'the byte-count pin and its assertion name (the byte count MOVED this round)',
    'report.same(\'lib/client.js byte count is what ' + OLD_REV + ' claims\', CLIENT_BYTES, ' + PREV.bytes + ');',
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

  row(P19, 'p19-bytes', 'the pinned byte count (it MOVED this round)',
    '    bytes: ' + PREV.bytes + ',',
    '    bytes: ' + PRODUCT.bytes + ','),
  row(P19, 'p19-sha', 'the pinned sha256',
    '    sha256: \'' + PREV.sha + '\',',
    '    sha256: \'' + PRODUCT.sha + '\','),
  row(P19, 'p19-revision', 'the expected revision',
    '  revision: \'' + OLD_STAMP + '\',',
    '  revision: \'' + STAMP + '\','),

  row(P20, 'p20-header', 'the header line naming which round extended this probe',
    line(
      ' * Extended in r16/t1 (the rev-16 bell-caret gap), in r17/t2 (the rev-17 caret quarter turn), in',
      ' * r18/t2 (the rev-18 duration change 160 ms -> 300 ms, plus the new reduceMotion() diagnostic)',
      ' * and in r19/t2 (the rev-19 duration change 300 ms -> ' + OLD_DURATION + ' ms; everything r18/t2 recorded above is history).'),
    line(
      ' * Extended in r16/t1 (the rev-16 bell-caret gap), in r17/t2 (the rev-17 caret quarter turn), in',
      ' * r18/t2 (the rev-18 duration change 160 ms -> 300 ms, plus the new reduceMotion() diagnostic),',
      ' * in r19/t2 (the rev-19 duration change 300 ms -> ' + OLD_DURATION + ' ms) and in ' + NEW_ROUND + '/t1 (the rev-20 flip',
      ' * back to ' + DURATION + ' ms and the DELETION of both reduced-motion media blocks; the mutant',
      ' * `caret-turn-reduced-motion-dropped` became `caret-turn-reduced-motion-restored`, whose anchor is',
      ' * now the caret transition rule it re-inserts the deleted block after).')),
  row(P20, 'p20-r17-added', 'the rev-17 bullet list: the override it describes is no longer shipped',
    line(
      ' *   with a duration the console surface reports, a `prefers-reduced-motion` block removes that',
      ' *   animation WITHOUT removing the turned end state, and the node that turns is the `<svg>`',
      ' *   glyph rather than the `.dacCaret` button box. The last bullet is why this probe had to learn',
      ' *   at-rule conditions: the override is a `@media` block, and until `collectRules` recorded which',
      ' *   conditions a rule sits under, the override and the transition it damps were indistinguishable',
      ' *   members of one flattened cascade. The flattening itself is unchanged, so no pre-existing',
      ' *   check moved; the seven new red sets are pairwise different and each new check is the sole red',
      ' *   of at least one mutant, which `--mutate=all` re-proves on every run.'),
    line(
      ' *   with a duration the console surface reports, the caret is damped by NOTHING (' + NEW_ROUND + '/t1 deleted',
      ' *   the `prefers-reduced-motion` override rev-17 had added: it, not the duration, is why no turn was',
      ' *   ever played on the reporting device), and the node that turns is the `<svg>`',
      ' *   glyph rather than the `.dacCaret` button box. The last bullet is why this probe had to learn',
      ' *   at-rule conditions: the override was a `@media` block, and until `collectRules` recorded which',
      ' *   conditions a rule sits under, such an override and the transition it damps were indistinguishable',
      ' *   members of one flattened cascade — the same machinery now proves that no such rule exists. The',
      ' *   flattening itself is unchanged, so no pre-existing check moved; the red sets are pairwise',
      ' *   different and each new check is the sole red of at least one mutant, which `--mutate=all`',
      ' *   re-proves on every run.')),
  row(P20, 'p20-layer-claim', 'the live half of the two-layer claim',
    ' *   equal `sessionIcon.caretRotateMs`, and that value must equal the ' + OLD_DURATION + ' the round declared.',
    ' *   equal `sessionIcon.caretRotateMs`, and that value must equal the ' + DURATION + ' the round declared.'),
  row(P20, 'p20-anchor-comment', 'the "anchor strings are the shipped source text" note: the override is no longer shipped',
    line(
      '/* rev-17 · the caret\'s quarter turn. The anchor strings are the shipped source text of the four',
      ' * caret rules, spelled from the same constants the bundle spells them from, so an anchor here and',
      ' * a rule there name one value each and a rename cannot leave this probe testing a ghost. */'),
    line(
      '/* rev-17 · the caret\'s quarter turn. The anchor strings are the shipped source text of the caret',
      ' * rules, spelled from the same constants the bundle spells them from, so an anchor here and a rule',
      ' * there name one value each and a rename cannot leave this probe testing a ghost.',
      ' *',
      ' * ' + NEW_ROUND + '/t1 · the last one is the exception: `CARET_REDUCED_MOTION_OVERRIDE` is NOT shipped any',
      ' * more (the block it spells was deleted this round, and group 5 asserts its absence). It is kept here',
      ' * as the text the `caret-turn-reduced-motion-restored` mutant re-inserts, which is what keeps "the',
      ' * override is gone" a claim this probe can falsify instead of a sentence in a comment. */')),
  row(P20, 'p20-override-const', 'the override text is renamed to say it is NOT shipped',
    'const CARET_REDUCED_MOTION_RULE = "\'@media (prefers-reduced-motion:reduce){.dacCaret svg{transition:none;}}\',";',
    'const CARET_REDUCED_MOTION_OVERRIDE = "\'@media (prefers-reduced-motion:reduce){.dacCaret svg{transition:none;}}\',";'),
  row(P20, 'p20-crlf-count', 'the measured CRLF newline count of the bundle under test',
    ' * addition: THE BUNDLE IS A CRLF FILE (measured: all 3181 of its newlines are CRLF), so the single',
    ' * addition: THE BUNDLE IS A CRLF FILE (measured: all ' + PRODUCT_CRLF + ' of its newlines are CRLF), so the single'),
  row(P20, 'p20-mutant-what', 'the 250-mutant\'s what text: the pin that catches it',
    'so only the absolute ' + OLD_DURATION + ' ms pin below can catch it',
    'so only the absolute ' + DURATION + ' ms pin below can catch it'),
  row(P20, 'p20-mutant-anchor', 'the caret-turn-ms-250 anchor string (mutant name and its `to` stay UNCHANGED)',
    '    anchor: \'var CARET_ROTATE_MS = ' + OLD_DURATION + ';\',',
    '    anchor: \'var CARET_ROTATE_MS = ' + DURATION + ';\','),
  row(P20, 'p20-expectfail-name', 'the duration assertion name in the ms-250 mutant\'s expectFail list',
    '      \'sessionIcon reports that transition duration as exactly ' + OLD_DURATION + ' milliseconds\',',
    '      \'sessionIcon reports that transition duration as exactly ' + DURATION + ' milliseconds\','),
  row(P20, 'p20-reduced-motion-mutant', 'the reduced-motion mutant INVERTS: it re-adds the deleted override',
    line(
      '  \'caret-turn-reduced-motion-dropped\': {',
      '    what: \'rev-17 regression: the prefers-reduced-motion override is deleted, so a reader who asked for reduced motion is handed the full ' + OLD_DURATION + ' ms turn\',',
      '    anchor: CARET_REDUCED_MOTION_RULE,',
      '    to: \'\',',
      '    expectFail: [',
      '      \'prefers-reduced-motion turns the caret transition off and never the quarter turn itself\',',
      '    ],',
      '  },'),
    line(
      '  \'caret-turn-reduced-motion-restored\': {',
      '    what: \'rev-20 regression: the deleted prefers-reduced-motion override is put BACK on the caret, so a reader whose system asks for reduced motion is handed the 90 degree end state with no turn at all -- the exact defect the user reported against rev-17 through rev-19\',',
      '    anchor: CARET_TRANSITION_RULE,',
      '    to: CARET_TRANSITION_RULE + \'\\r\\n\' + \'            \' + CARET_REDUCED_MOTION_OVERRIDE,',
      '    expectFail: [',
      '      \'' + NO_OVERRIDE_CHECK + '\',',
      '    ],',
      '  },')),
  row(P20, 'p20-cascade-example', 'the cascade example: the stylesheet line it names',
    ' * could not tell "the stylesheet says `transition:' + OLD_DURATION + 'ms`" from "the reduced-motion block says',
    ' * could not tell "the stylesheet says `transition:' + DURATION + 'ms`" from "the reduced-motion block says'),
  row(P20, 'p20-cascade-note', 'the note that tracks which round the example follows',
    line(
      ' * example named 160ms when rev-17 wrote this note; rev-18 moved that one duration to 300ms and',
      ' * rev-19 moved it to ' + OLD_DURATION + 'ms; the reasoning is about the SPLIT, not about the number.)'),
    line(
      ' * example named 160ms when rev-17 wrote this note; rev-18 moved that one duration to ' + OLD_DURATION + 'ms,',
      ' * rev-19 kept it there and ' + NEW_ROUND + '/t1 moved it to ' + DURATION + 'ms; the reasoning is about the SPLIT, not',
      ' * about the number, and the split is what proves the override is gone.)')),
  row(P20, 'p20-group5-comment', 'the group-5 preamble: the split now proves an ABSENCE',
    line(
      '   * though: `noMotionRules` is the cascade a reader WITHOUT the preference sees, and',
      '   * `reduceMotionRules` is only what the `prefers-reduced-motion` blocks say. The split is the',
      '   * whole point of the `conditions` field added to collectRules -- with one flattened list the',
      '   * override would simply be the last `transition` declaration and "the glyph has a transition"',
      '   * could never be measured at the same time as "a reduced-motion reader has none".'),
    line(
      '   * though: `noMotionRules` is the cascade a reader WITHOUT the preference sees, and',
      '   * `reduceMotionRules` is what the `prefers-reduced-motion` blocks say — since ' + NEW_ROUND + '/t1 that is the',
      '   * EMPTY set, and the split is what lets this group assert that positively instead of grepping the',
      '   * sheet for the absence of a string. The field was added to `collectRules` for the opposite',
      '   * reading (with one flattened list an override would simply be the last `transition`',
      '   * declaration); the flattening itself is unchanged.')),
  row(P20, 'p20-bare-number-comment', 'the "bare number on `all`" example in the check\'s comment',
    '  // The animation, not the end state: the property must be named (a bare `' + OLD_DURATION + 'ms` on `all` is not',
    '  // The animation, not the end state: the property must be named (a bare `' + DURATION + 'ms` on `all` is not'),
  row(P20, 'p20-pin-comment', 'the comment that records which round moved the pin',
    line(
      '  // r18/t2 moved the absolute pin 160 -> 300 and the check NAME with it; r19/t2 moved the pin',
      '  // 300 -> ' + OLD_DURATION + ' the same way and moved that NAME with it again. The device report',
      '  // ("要有过渡动画能看到在转动的箭头") is what moved it: rev-17 sized the turn for a 120-200 ms band,',
      '  // that size was a judgment rather than a measurement, and the judgment was overturned. The layer',
      '  // is unchanged -- this is still "the value the CSS and the console surface agree on is THE',
      '  // declared value", which is the only thing the self-consistency check above cannot see -- and',
      '  // `caret-turn-ms-250` is still the mutant that falsifies it.'),
    line(
      '  // r18/t2 moved the absolute pin 160 -> 300 and the check NAME with it; r19/t2 moved the pin',
      '  // 300 -> ' + OLD_DURATION + ' the same way and moved that NAME with it again; ' + NEW_ROUND + '/t1 moved it ' + OLD_DURATION + ' ->',
      '  // ' + DURATION + ' (the user asked for the round trip\'s starting value back, and the reason no duration was',
      '  // ever played at all was the override the check below now asserts the absence of, not the number).',
      '  // The layer is unchanged -- this is still "the value the CSS and the console surface agree on is',
      '  // THE declared value", which is the only thing the self-consistency check above cannot see -- and',
      '  // `caret-turn-ms-250` is still the mutant that falsifies it.')),
  row(P20, 'p20-absolute-pin', 'the absolute duration pin itself and its name',
    line(
      '  check(',
      '    \'sessionIcon reports that transition duration as exactly ' + OLD_DURATION + ' milliseconds\',',
      '    sessionIcon.caretRotateMs === ' + OLD_DURATION + ','),
    line(
      '  check(',
      '    \'sessionIcon reports that transition duration as exactly ' + DURATION + ' milliseconds\',',
      '    sessionIcon.caretRotateMs === ' + DURATION + ',')),
  row(P20, 'p20-no-override-check', 'the damping check becomes the round\'s central claim: no reduced-motion rule names the caret',
    line(
      '  // The reduced-motion block must damp the MOTION and must not move the terminal STATE into the',
      '  // block: a `transform` declared inside it would be dropped for exactly the readers it names.',
      '  const caretMotionRules = reduceMotionRules.filter((rule) => rule.selectors.includes(\'.dacCaret svg\'));',
      '  const caretMotionKills = caretMotionRules.filter((rule) => rule.declarations.get(\'transition\') === \'none\');',
      '  const caretMotionRotates = caretMotionRules.filter((rule) => rule.declarations.has(\'transform\'));',
      '  check(',
      '    \'prefers-reduced-motion turns the caret transition off and never the quarter turn itself\',',
      '    caretMotionKills.length > 0 && caretMotionRotates.length === 0,',
      '    `reduced-motion rules naming .dacCaret svg=${caretMotionRules.length}, transition:none=${caretMotionKills.length}, transform declared inside=${caretMotionRotates.length}`,',
      '  );'),
    line(
      '  // ' + NEW_ROUND + '/t1 · the override is GONE, and this is where the round\'s central claim is measured:',
      '  // the caret turn must not be damped in ANY environment. `reduceMotionRules` is every rule that sits',
      '  // under a reduced-motion condition, and the shipped stylesheet must contribute none -- the reporting',
      '  // user\'s system is in that environment, and the deleted override is why no duration was ever played',
      '  // there. `caret-turn-reduced-motion-restored` is the mutant that puts it back and reddens exactly',
      '  // this check.',
      '  const caretMotionRules = reduceMotionRules.filter((rule) => rule.selectors.includes(\'.dacCaret svg\'));',
      '  check(',
      '    \'' + NO_OVERRIDE_CHECK + '\',',
      '    reduceMotionRules.length === 0 && caretMotionRules.length === 0,',
      '    `reduced-motion rules in the shipped stylesheet=${reduceMotionRules.length}, naming .dacCaret svg=${caretMotionRules.length}`,',
      '  );')),
  row(P20, 'p20-group6-comment', 'the group-6 preamble: an environment report, not the second half of a two-cause story',
    line(
      '   * Group 5 pins the turn itself: its angle, its CSS transition, its duration, and the reduced-motion',
      '   * block that damps the motion on purpose. What no check above can say is which of the two causes an',
      '   * observer is looking at when the arrow jumps -- "' + OLD_DURATION + ' ms is still too fast on this device" or',
      '   * "this environment asked for no motion, and the stylesheet correctly turned the transition off".'),
    line(
      '   * Group 5 pins the turn itself: its angle, its CSS transition, its duration, and the fact that',
      '   * NOTHING damps it. Since ' + NEW_ROUND + '/t1 the diagnostic is an environment report rather than the second',
      '   * half of a two-cause story: the old story was that an observer looking at a jumping arrow could not',
      '   * tell "' + DURATION + ' ms is still too fast on this device" from "this environment asked for no motion,',
      '   * and the stylesheet correctly turned the transition off" -- and the device that reported the jump',
      '   * was in the second case, which is why the override is gone.')),
  row(P20, 'p20-banner', 'the console banner of the shipped run',
    '  console.log(\'dsh-approval-chime · independent probe 20 · rev-13/rev-14/rev-16/rev-17/rev-18/' + OLD_REV + ' session-bell appearance + reduceMotion\');',
    '  console.log(\'dsh-approval-chime · independent probe 20 · rev-13/rev-14/rev-16/rev-17/rev-18/' + OLD_REV + '/' + NEW_REV + ' session-bell appearance + reduceMotion\');'),

  row(T2, 't2-frozen-comment', 'the "frozen bytes" comment',
    '/** The frozen ' + OLD_REV + ' bytes this probe is anchored to (t7 close-out). */',
    '/** The frozen ' + NEW_REV + ' bytes this probe is anchored to (t7 close-out). */'),
  row(T2, 't2-frozen-sha', 'the pinned sha256',
    '  sha256: \'' + PREV.sha + '\',',
    '  sha256: \'' + PRODUCT.sha + '\','),
  row(T2, 't2-frozen-bytes', 'the pinned byte count (it MOVED this round)',
    '  bytes: ' + PREV.bytes + ',',
    '  bytes: ' + PRODUCT.bytes + ','),
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

  row(T6, 't6-header-chain', 'header line 1: the re-anchor chain grows by this round',
    ' * r15 / t6, re-anchored by r16 / t1, by r17 / t1, by r18 / t1, by r18b / t5, by r18c / t7 and now by r19 / t2 -- the MUTATION TABLE:',
    ' * r15 / t6, re-anchored by r16 / t1, by r17 / t1, by r18 / t1, by r18b / t5, by r18c / t7, by r19 / t2 and now by ' + NEW_ROUND + ' / t1 -- the MUTATION TABLE:'),
  row(T6, 't6-header-bytes', 'header line 3: the bytes the table re-measures',
    ' * every declared mutation re-measured on the ' + OLD_REV + ' bytes. The instrument is the r15 round\'s;',
    ' * every declared mutation re-measured on the ' + NEW_REV + ' bytes. The instrument is the r15 round\'s;'),
  row(T6, 't6-header-refusal', 'the refusal note: which artifact the table insists on',
    ' *   - it REFUSES to run unless lib/client.js is the ' + OLD_REV + ' bytes (sha256 + size asserted), so a',
    ' *   - it REFUSES to run unless lib/client.js is the ' + NEW_REV + ' bytes (sha256 + size asserted), so a'),
  row(T6, 't6-header-log-list', 'the note that lists which rounds\' logs survive (the prefix literal itself is the prefix row\'s job)',
    'so the r13c, r15, r16, r17, r18, r18b AND r18c logs stay untouched;',
    'so the r13c, r15, r16, r17, r18, r18b, r18c AND r19 logs stay untouched;'),
  row(T6, 't6-import-mkdir', 'the table now writes its logs under _raw/r20-evidence/ and must create that directory',
    'import { closeSync, openSync, readFileSync, writeFileSync } from \'node:fs\';',
    line(
      'import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from \'node:fs\';')),
  row(T6, 't6-evidence-dir', 'the per-round evidence directory this round\'s logs live in (never the root of _raw/)',
    'const RAW = join(HERE, \'_raw\');',
    line(
      'const RAW = join(HERE, \'_raw\');',
      '/* ' + NEW_ROUND + '/t1: this round\'s logs and its table live in their own directory under _raw/, so a later',
      ' * round\'s prefix row cannot overwrite them and this round\'s scope stays one directory deep. */',
      'const EVIDENCE = join(RAW, \'' + NEW_ROUND + '-evidence\');',
      'mkdirSync(EVIDENCE, { recursive: true });')),
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
  row(T6, 't6-mutant-rename', 'the renamed mutant in the declared mutation list',
    '  [\'probe-20-r14-bell-appearance\', \'caret-turn-reduced-motion-dropped\'],',
    '  [\'probe-20-r14-bell-appearance\', \'caret-turn-reduced-motion-restored\'],'),
  row(T6, 't6-log-prefix-mut', 'log-prefix row: the per-mutant, failure-path and note occurrences (4 total), moved into this round\'s evidence directory',
    'r19-mut-',
    NEW_ROUND + '-evidence/' + NEW_ROUND + '-mut-',
    4),
  row(T6, 't6-log-prefix-table', 'log-prefix row: the table this run writes (json + md, 2 total), moved into this round\'s evidence directory',
    'r19-t1-mutation-table',
    NEW_ROUND + '-evidence/' + NEW_ROUND + '-t1-mutation-table',
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
  "'r19-baseline-before.txt'",
  '"r19-dev-$suite.txt"',
  '"r19-ind-$name.txt"',
  "'r19-ind-probe-19-mutations.txt'",
  "'r19-ind-probe-11-mutations.txt'",
  '"r19-ind-probe-17-mut-$mutation.txt"',
  "'r19-ind-probe-20-mutations.txt'",
  '"r19-ind-probe-20-mut-$mutation.txt"',
  "'r19-ind-r15t2-independent-probe-mutant.txt'",
  "'r19-ind-probe-18-mutations.txt'",
  '"r19-ind-probe-18-race-"',
  '"r19-legacy-$name.txt"',
  '"r19-reviewer-"',
  "'r19-t1-mutation-table-console.txt'",
  "'r19-baseline-after.txt'",
  "'r19-frozen-diff.txt'",
];

const runnerRows = [
  row(RUNNER, 'runner-title', 'title line',
    '# Independent rev-19 full regression run (r19/t2, the caret duration moved 300 ms -> 400 ms and every live fingerprint re-anchored; the r18/t1, r18b/t5 and r18c/t7 logs are preserved).',
    '# Independent rev-20 full regression run (r20/t1, the caret duration moved 400 ms -> 160 ms, BOTH reduced-motion media blocks deleted and every live fingerprint re-anchored; the r18/t1, r18b/t5, r18c/t7 and r19/t2 logs are preserved).'),
  row(RUNNER, 'runner-prefix-note', 'the log-prefix note',
    '# logging. Every log this script writes carries the `r19-` prefix; the r4 ... r12b archives, the',
    '# logging. Every log this script writes carries the `r20-` prefix; the r4 ... r12b archives, the'),
  row(RUNNER, 'runner-never-overwritten', 'the "never overwritten" list grows by the r19 round',
    '# evidence of the r15/r16/r17/r18/r18b/r18c rounds under verify-independent/_raw/ are NEVER overwritten',
    '# evidence of the r15/r16/r17/r18/r18b/r18c/r19 rounds under verify-independent/_raw/ are NEVER overwritten'),
  row(RUNNER, 'runner-prefix-lesson', 'the prefix lesson names this round too',
    '# _raw/r16-t1-mislabelled-r15-logs/README.md. r17/t1, r18/t1, r18b/t5, r18c/t7 AND r19/t2 moved every prefix row in the',
    '# _raw/r16-t1-mislabelled-r15-logs/README.md. r17/t1, r18/t1, r18b/t5, r18c/t7, r19/t2 AND r20/t1 moved every prefix row in the'),
  row(RUNNER, 'runner-prefix-history', 'the prefix sentence: the round that writes the prefix now is r20',
    line(
      '#   archive stay untouched (the prefix moved round after round: r15-, r16-, r17-, r18-, r18b- and the',
      '#   r18c repair sub-round; this r19/t2 re-anchor writes `r19-`, and the rule is stated at the top of',
      '#   this header).'),
    line(
      '#   archive stay untouched (the prefix moved round after round: r15-, r16-, r17-, r18-, r18b-, r18c- and',
      '#   the r19/t2 re-anchor; this r20/t1 re-anchor writes `r20-`, and the rule is stated at the top of this',
      '#   header).')),
  row(RUNNER, 'runner-why-lead', 'the WHY block: WHY THIS RUN EXISTS AT rev-20',
    line(
      '# WHY THIS RUN EXISTS AT ' + OLD_REV + ' -- the caret turn moved 300 ms -> 400 ms, one round after',
      '# rev-18 had moved it 160 ms -> 300 ms on the same device report ("要有过渡动画能看到在转动的',
      '# 箭头"). We answer the same half of it that a constant can answer and refuse to claim the other',
      '# half (the rev-18 reasoning recorded below is that round\'s own record, see the "PREVIOUS ROUND"',
      '# pointer further down):'),
    line(
      '# WHY THIS RUN EXISTS AT ' + NEW_REV + ' -- the caret turn is ' + DURATION + ' ms again and BOTH reduced-motion media',
      '# blocks are deleted. This is a reversal, and the finding that forced it is the point of the round:',
      '# the caret\'s own override removed the transition ENTIRELY on the reporting user\'s device (their',
      '# system asks for reduced motion), so rev-18\'s 300 ms and rev-19\'s ' + OLD_DURATION + ' ms were never played there',
      '# at all -- the duration was never the cause. User request: "动画效果打开有效果，不过我要的是开不开都是',
      '# 能有动画的，把动画时长改回 160ms。" We answer the half of that a constant can answer and refuse to',
      '# claim the other half (the rev-18 and rev-19 reasoning recorded below is those rounds\' own record,',
      '# see the "PREVIOUS ROUND" pointer further down):')),
  row(RUNNER, 'runner-why-constant', 'the WHY block: the constant this round moved',
    line(
      '#   - CARET_ROTATE_MS ' + OLD_DURATION + ' (160 -> 300 in rev-18, which is now history). The CSS transition duration is',
      '#     STILL built from that constant'),
    line(
      '#   - CARET_ROTATE_MS ' + DURATION + ' (400 in rev-19, 300 in rev-18, 160 in rev-17; the round trip is over and this',
      '#     is the value the user asked for). The CSS transition duration is STILL built from that constant')),
  row(RUNNER, 'runner-why-override', 'the WHY block: the second bullet claimed an override the product no longer has',
    line(
      '#   - a NEW TOP-LEVEL diagnostic `__DSH_APPROVAL_CHIME__.reduceMotion()` answers LIVE whether',
      '#     THIS page is under `(prefers-reduced-motion: reduce)`. It exists because an arrow that',
      '#     jumps has two causes that look identical on a device: "too fast to see" (the thing the',
      '#     duration change addresses) and "this environment asks for no motion" (in which case the',
      '#     existing media block drops the transition ON PURPOSE and the 90deg terminal state arrives',
      '#     instantly). Without the diagnostic the reader has to guess which one they are looking at.'),
    line(
      '#   - the TOP-LEVEL diagnostic `__DSH_APPROVAL_CHIME__.reduceMotion()` answers LIVE whether THIS page',
      '#     is under `(prefers-reduced-motion: reduce)`. It added that answer because an arrow that jumps',
      '#     had two causes that look identical on a device: "too fast to see" and "this environment asks',
      '#     for no motion" -- and the reporting device turned out to be the second one, which is why the',
      '#     override it used to describe is DELETED. Since rev-20 nothing in the bundle branches on the',
      '#     answer: it is an environment report, kept because "which environment is this tab in?" is the',
      '#     first question to ask when a device report will not reproduce.')),
  row(RUNNER, 'runner-subround-note', 'the sub-round note: r19/t2 becomes history, r20/t1 takes over',
    line(
      '#   - r19/t2 (this sub-round) moves the caret duration constant and re-anchors every live',
      '#     fingerprint that pinned it: byte counts, sha256 values, the build-stamp literals, the caret\'s',
      '#     absolute duration pin, the `caret-turn-ms-250` mutant anchor and this script\'s log prefix. Its',
      '#     logs are `r19-`; the r18/t1, r18b/t5 and r18c/t7 canonical logs, archives and mutation tables',
      '#     stay on disk untouched as the records a quality gate already reviewed.'),
    line(
      '#   - r19/t2 moved the caret duration constant to ' + OLD_DURATION + ' ms and re-anchored every live',
      '#     fingerprint that pinned it. Its logs carry the r19 prefix; the r18/t1, r18b/t5 and r18c/t7',
      '#     canonical logs, archives and mutation tables stay on disk untouched as the records a quality',
      '#     gate already reviewed.',
      '#   - r20/t1 (this sub-round) puts the constant back to ' + DURATION + ' ms, DELETES both reduced-motion',
      '#     media blocks (so no environment is singled out any more) and re-anchors every live fingerprint:',
      '#     byte counts, sha256 values, the build-stamp literals, the caret\'s absolute duration pin, the',
      '#     `caret-turn-ms-250` mutant anchor, the renamed `caret-turn-reduced-motion-restored` mutant --',
      '#     whose red set is the new no-override check -- the two rewritten sections of client-half and',
      '#     this script\'s log prefix. Its logs are `r20-`; the r18/t1, r18b/t5, r18c/t7 and r19/t2',
      '#     canonical logs, archives and mutation tables stay on disk untouched as the records a quality',
      '#     gate already reviewed.')),
  row(RUNNER, 'runner-product-delta', 'the lib/client.js delta line (old and new values both MEASURED)',
    line(
      '#   - lib/client.js 154457 B / B4A0A1B3... -> 156937 B / 1C8DB24C... (r18/t1) -> ' + PREV.bytes + ' B / 7FE150A0... (r18b/t5, stamp + one comment repaired) ->',
      '#     ' + PREV.bytes + ' B / 1C75C8B5... (r19/t1: SIX equal-length in-line substitutions -- the stamp, the',
      '#     duration constant and the comments that read it -- so the byte count is unchanged and the',
      '#     sha256 is not); diagnostics.revision is now \'' + OLD_STAMP + '\'.'),
    line(
      '#   - lib/client.js 154457 B / B4A0A1B3... -> 156937 B / 1C8DB24C... (r18/t1) -> ' + PREV.bytes + ' B / 7FE150A0... (r18b/t5, stamp + one comment repaired) ->',
      '#     ' + PREV.bytes + ' B / 1C75C8B5... (r19/t1: SIX equal-length in-line substitutions) ->',
      '#     ' + PRODUCT.bytes + ' B / ' + PRODUCT.sha.slice(0, 8) + '... (r20/t1: the caret duration back to ' + DURATION + ' ms, the switch\'s and the',
      '#     caret\'s reduced-motion media blocks DELETED, and the notes that read them rewritten, so the',
      '#     byte count GROWS this time); diagnostics.revision is now \'' + STAMP + '\'.')),
  row(RUNNER, 'runner-half-delta', 'the client-half delta line (the new bytes+sha are MEASURED from the predicted post-edit text)',
    line(
      '#   - verify/client-half.test.mjs 95803 B / 97EEB2D0... -> 100983 B / AB6F7E48... -> 101496 B /',
      '#     B24E22E8... (r18c/t7: ONE assertion RENAMED -- its name used to assert device visibility; the',
      '#     expectation now lives in the comment above it) -> 101901 B /',
      '#     6DBDF454... (r19/t2: FIVE assertion names and the stamp/duration literals moved',
      '#     to rev-19; the assertion count is unchanged at 399). (ELEVEN new',
      '#     assertions, and ONE existing assertion REPLACED by stronger ones: the retired 120-200ms',
      '#     band -- "in which a rotation reads as a turn, not a cut" -- is exactly the judgment the',
      '#     device report overturned, and in its place stand an exact 300ms pin, a "the stylesheet is',
      '#     built from the constant" check and a "there is exactly ONE caret transition rule" check.',
      '#     Net DELETIONS: zero.)'),
    line(
      '#   - verify/client-half.test.mjs 95803 B / 97EEB2D0... -> 100983 B / AB6F7E48... -> 101496 B /',
      '#     B24E22E8... -> 101901 B /',
      '#     6DBDF454... -> ' + HALF_NEW.bytes + ' B / ' + HALF_NEW.sha.slice(0, 8) + '... (r20/t1: the stamp, the duration pin',
      '#     400 -> ' + DURATION + ' and the assertion names that read them; the reduce-motion section is REWRITTEN --',
      '#     the two "the caret has its own override" checks are replaced by three that assert the opposite',
      '#     (no reduced-motion block is emitted, the product carries none at all, the caret keeps its ONE',
      '#     transition in every environment). The assertion count is ' + HALF_CHECKS + ' now (was 399).')),
  row(RUNNER, 'runner-audio-delta', 'the custom-audio delta line (the new sha is MEASURED from the predicted post-edit text)',
    line(
      '#   - verify/custom-audio.test.mjs 20263 B / 523572EA... -> 20263 B / 6EF2F162... -> 20263 B /',
      '#     B2C82501... -- ONE byte each time (the version literal at :267; the',
      '#     assertion count is unchanged at 75 checks).'),
    line(
      '#   - verify/custom-audio.test.mjs 20263 B / 523572EA... -> 20263 B / 6EF2F162... -> 20263 B /',
      '#     B2C82501... -> ' + AUDIO_NEW.bytes + ' B / ' + AUDIO_NEW.sha.slice(0, 8) + '... -- ONE byte each time (the version',
      '#     literal at :267; the assertion count is unchanged at 75 checks).')),
  row(RUNNER, 'runner-previous-round', 'THE PREVIOUS ROUND IS RECORDED ELSEWHERE -> the rev-19 record (and the older rev-18/rev-17 pointers)',
    line(
      '# THE PREVIOUS ROUND IS RECORDED ELSEWHERE: the rev-18 narrative that used to sit here (the 160 ms',
      '# -> 300 ms reasoning, the reduceMotion() addition, its byte counts, its sha256 values and its',
      '# stamp) now lives where a previous round\'s record belongs -- CHANGELOG.md (the rev-18 section),',
      '# _raw/r18-run-console.txt, _raw/r18-t1-mutation-table.json/.md, and the rev-18 baselines archived',
      '# under _raw/r18-t1-archive/, _raw/r18b-t5-archive/ and the r18c/t7 archive. The even older rev-17',
      '# narrative that used to sit here is pointed at the same way -- CHANGELOG.md (the rev-17 section),',
      '# docs/变异覆盖与残留红.md section 14, _raw/r17-run-console.txt, _raw/r17-t1-mutation-table.json/.md',
      '# and _raw/r17-t1-archive/. This file POINTS at those records instead of duplicating them, so the',
      '# only revision fingerprints left here are the current round\'s and the rev-15 narrative that was',
      '# already history before r16/t1 ran (see docs §14.4 for the disclosed edit).'),
    line(
      '# THE PREVIOUS ROUND IS RECORDED ELSEWHERE: the rev-19 narrative that used to sit here (the 300 ms',
      '# -> ' + OLD_DURATION + ' ms reasoning, its byte counts, its sha256 values and its stamp) now lives where a',
      '# previous round\'s record belongs -- CHANGELOG.md (the rev-19 section), the r19/t2 round\'s own',
      '# console log and mutation table under _raw/, and its baselines archived under _raw/r18-t1-archive/,',
      '# _raw/r18b-t5-archive/, the r18c/t7 archive and the r19/t2 archive. The even older rev-18 and rev-17',
      '# narratives that used to sit here are pointed at the same way -- CHANGELOG.md (their sections),',
      '# the r18/t2 and r17/t2 console logs and tables, and their archives under _raw/. This file POINTS at',
      '# those records instead of duplicating them, so the only revision fingerprints left here are the',
      '# current round\'s and the rev-15 narrative that was already history before r16/t1 ran (see docs',
      '# §14.4 for the disclosed edit).')),
  row(RUNNER, 'runner-manifest-note', 'the frozen-manifest note',
    '# THE FROZEN MANIFEST -- 9 files, re-anchored to the ' + OLD_REV + ' baseline. Re-anchoring this table',
    '# THE FROZEN MANIFEST -- 9 files, re-anchored to the ' + NEW_REV + ' baseline. Re-anchoring this table'),
  row(RUNNER, 'runner-manifest-client', 'frozen manifest row: lib/client.js (MEASURED, from the runner\'s own line)',
    manifestClientFrom, swapManifest(manifestClientFrom, PRODUCT.bytes, PRODUCT.sha, 'lib/client.js')),
  row(RUNNER, 'runner-manifest-half', 'frozen manifest row: verify/client-half.test.mjs (MEASURED post-edit)',
    manifestHalfFrom, swapManifest(manifestHalfFrom, HALF_NEW.bytes, HALF_NEW.sha, 'client-half')),
  row(RUNNER, 'runner-manifest-audio', 'frozen manifest row: verify/custom-audio.test.mjs (MEASURED post-edit)',
    manifestAudioFrom, swapManifest(manifestAudioFrom, AUDIO_NEW.bytes, AUDIO_NEW.sha, 'custom-audio')),
  row(RUNNER, 'runner-section0-heading', 'section 0 heading',
    'Write-Host \'=== 0. frozen manifest: 9 recorded files byte-identical to the ' + OLD_REV + ' baseline ===\'',
    'Write-Host \'=== 0. frozen manifest: 9 recorded files byte-identical to the ' + NEW_REV + ' baseline ===\''),
  row(RUNNER, 'runner-section0c', 'section 0c: which round changed what',
    'Write-Host \'' + OLD_REV + ' changed lib/client.js and verify/: lib/index.js must still be the rev-11 bytes.\'',
    'Write-Host \'' + NEW_REV + ' changed lib/client.js and verify/: lib/index.js must still be the rev-11 bytes.\''),
  row(RUNNER, 'runner-anchor-client', 'section 0c anchor row: lib/client.js (MEASURED, from the runner\'s own line)',
    anchorClientFrom, swapManifest(anchorClientFrom, PRODUCT.bytes, PRODUCT.sha, 'lib/client.js (0c)')),
  row(RUNNER, 'runner-probe-fallback-comment', 'the fallback comment quoting the r15t2 banner',
    '  # \'=== shipped ' + OLD_REV + ' run: 42/42 checks passed ===\'), so fall back to the last non-empty line',
    '  # \'=== shipped ' + NEW_REV + ' run: 42/42 checks passed ===\'), so fall back to the last non-empty line'),
  row(RUNNER, 'runner-section2e-heading', 'section 2e heading: this round\'s deletion is covered there too',
    'Write-Host \'=== 2e. probe-20 falsifiability: the SESSION-BELL + CARET APPEARANCE and the rev-18 REDUCED-MOTION DIAGNOSTIC (rev-13, rev-14, the r16/t1 gap, the r17/t1 turn, the rev-19 duration) ===\'',
    'Write-Host \'=== 2e. probe-20 falsifiability: the SESSION-BELL + CARET APPEARANCE and the rev-18 REDUCED-MOTION DIAGNOSTIC (rev-13, rev-14, the r16/t1 gap, the r17/t1 turn, the rev-19 duration, the rev-20 deletion of both reduced-motion overrides) ===\''),
  row(RUNNER, 'runner-section5-heading', 'section 5 heading: the legacy probes were re-anchored again',
    'Write-Host \'=== 5. legacy probes from rev-1 ... rev-3 (green since r15-t3, re-anchored at rev-18 and again at rev-19; a non-zero exit is a FAILURE) ===\'',
    'Write-Host \'=== 5. legacy probes from rev-1 ... rev-3 (green since r15-t3, re-anchored at rev-18, again at rev-19 and again at rev-20; a non-zero exit is a FAILURE) ===\''),
  row(RUNNER, 'runner-section7b-heading', 'section 7b heading',
    'Write-Host \'=== 7b. ' + OLD_REV + ' mutation table: every declared mutation re-measured on THESE bytes ===\'',
    'Write-Host \'=== 7b. ' + NEW_REV + ' mutation table: every declared mutation re-measured on THESE bytes ===\''),
  row(RUNNER, 'runner-section7b-note1', 'section 7b: the artifact the table insists on',
    'Write-Host \'verify-independent/r15t6-mutation-table.mjs refuses to run unless lib/client.js is the ' + OLD_REV + '\'',
    'Write-Host \'verify-independent/r15t6-mutation-table.mjs refuses to run unless lib/client.js is the ' + NEW_REV + '\''),
  row(RUNNER, 'runner-section7b-note2', 'section 7b: where the table lands (this round\'s evidence directory)',
    'Write-Host \'(one run, ten declared red checks) and writes _raw/' + OLD_ROUND + '-t1-mutation-table.json/.md. Any row that\'',
    'Write-Host \'(one run, ten declared red checks) and writes _raw/' + NEW_ROUND + '-evidence/' + NEW_ROUND + '-t1-mutation-table.json/.md. Any row that\''),
  row(RUNNER, 'runner-table-grep', 'section 7b: the pattern that reads the table\'s console label',
    'Pattern \'^' + OLD_ROUND + ' mutation table: \'', 'Pattern \'^' + NEW_ROUND + ' mutation table: \''),
  row(RUNNER, 'runner-summary-manifest', 'the summary line: which manifest the run was byte-identical to',
    '  Write-Host \'are byte-identical to the ' + OLD_REV + ' manifest before and after; the four .scratch reviewer probes still\'',
    '  Write-Host \'are byte-identical to the ' + NEW_REV + ' manifest before and after; the four .scratch reviewer probes still\''),
  ...RUNNER_PREFIX_LITERALS.map((literal, index) => row(RUNNER, `runner-log-prefix-${index + 1}`,
    `log-prefix row ${index + 1}/${RUNNER_PREFIX_LITERALS.length}: ${literal}`,
    literal,
    literal.replace(OLD_ROUND + '-', NEW_ROUND + '-'))),
];

/* the three manifest rows and the delta lines carry the MEASURED post-edit values */

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
/* the acceptance requires the OLD prefix `r19-` to be gone from the runner entirely -- a row's own new
 * text may not smuggle it back in (a prose mention of a path, for instance). */
for (const entry of rows.filter((item) => item.file === RUNNER)) {
  if (entry.to.includes(OLD_ROUND + '-')) {
    overlapProblems.push(`${RUNNER}: row <${entry.id}> writes the old prefix ${OLD_ROUND}- back into the runner`);
  }
}
/* the same rule for the product: no row may re-introduce a reduced-motion media block or the string
 * the acceptance counts (the runner and the harnesses may, of course). */
for (const entry of rows.filter((item) => item.file !== RUNNER)) {
  if (entry.to.includes('@media (prefers-reduced-motion') && entry.file !== HALF && entry.file !== P20 && entry.file !== T2 && entry.file !== T6) {
    overlapProblems.push(`${entry.file}: row <${entry.id}> writes a reduced-motion media block into a file that must not carry one`);
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
say(`pre-rev-20 product (archive): ${PREV.bytes} B / ${PREV.sha}  from ${PREV.source}`);
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
  if (!QUIET || !isPending) {
    say(`  [${isPending ? 'DRY-OK' : isApplied ? 'APPLIED' : 'REFUSED'}] ${entry.file} <${entry.id}> ${entry.what}`);
    say(`      ${verdict}`);
  }
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
  if (occ(runnerNow, OLD_ROUND + '-') !== 0) manifestProblems.push(`${RUNNER}: ${occ(runnerNow, OLD_ROUND + '-')} occurrence(s) of the old log prefix survive`);
  if (occ(runnerNow, NEW_ROUND + '-') === 0) manifestProblems.push(`${RUNNER}: no ${NEW_ROUND}- log prefix found after the write`);
  for (const entry of RUNNER_PREFIX_LITERALS) {
    const wanted = entry.replace(OLD_ROUND + '-', NEW_ROUND + '-');
    if (occ(runnerNow, `Join-Path $raw ${wanted}`) === 0 && occ(runnerNow, `Join-Path $raw (${wanted}`) === 0) {
      manifestProblems.push(`${RUNNER}: the log path ${wanted} is not written by any Join-Path row`);
    }
  }
  if (occ(read('lib/client.js').toString('utf8'), '@media (prefers-reduced-motion') !== 0) {
    manifestProblems.push('lib/client.js carries a reduced-motion media block after the write');
  }
  /* the runner's own delta line quotes the assertion count; measure it instead of trusting the
   * constant above. The harness is run only in WRITE mode (a dry run may be done on a scratch copy
   * whose harness is deliberately stale). */
  if (WRITE) {
    /* the harness is run with its output on a FILE DESCRIPTOR, never a pipe: a confined shell cannot
     * open named pipes, so `spawnSync(..., {encoding:'utf8'})` (the default `stdio:'pipe'`) fails with
     * EPERM here and would report an empty summary. This mirrors r15t6's own child runs. */
    mkdirSync(EVIDENCE, { recursive: true });
    const harnessLog = join(EVIDENCE, `${NEW_ROUND}-t1-reanchor-client-half.log`);
    const fd = openSync(harnessLog, 'w');
    let status = null;
    try {
      const result = spawnSync(process.execPath, [join('verify', 'client-half.test.mjs')], { cwd: PLUGIN, stdio: ['ignore', fd, fd] });
      status = result.error === undefined && result.signal === null ? result.status : null;
    } finally {
      closeSync(fd);
    }
    const harnessText = readFileSync(harnessLog, 'utf8');
    const summary = harnessText.trim().split(/\r?\n/).filter((text) => /checks passed/.test(text)).pop() ?? '';
    const measured = Number((/(\d+)\s*\/\s*(\d+)\s+checks passed/.exec(summary) ?? [0, 0, 0])[2]);
    if (status !== 0) manifestProblems.push(`verify/client-half.test.mjs exits ${status} after the write`);
    if (measured !== HALF_CHECKS) manifestProblems.push(`the runner's half-delta line says the assertion count is ${HALF_CHECKS} but the harness measured ${measured} ("${summary}")`);
    say(`harness re-run: ${summary}`);
  }
}

const figures = {
  tool: 'verify-independent/r20-reanchor.mjs',
  subRound: SUBROUND,
  what: "the row table's own arithmetic (rows / substitutions / fileCount), computed by the program",
  mode: WRITE ? (postState ? 'post-state' : 'write') : (postState ? 'post-state' : 'dry-run'),
  product: { path: 'lib/client.js', bytes: PRODUCT.bytes, sha256: PRODUCT.sha, revision: STAMP, caretRotateMs: DURATION, reducedMotionMediaBlocks: 0 },
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
  oldPrefixOccurrencesInRunner: occ(runnerNow, OLD_ROUND + '-'),
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
 * refused batch writes nothing either. Every artifact of this round lands under `_raw/r20-evidence/`. */
if (clean && manifestProblems.length === 0 && (WRITE || postState)) {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, `${NEW_ROUND}-t1-reanchor.json`), `${JSON.stringify(figures, null, 2)}\n`, 'utf8');
}

console.log("\n--- tool JSON (rows / substitutions / fileCount are the program's own arithmetic) ---");
console.log(JSON.stringify(figures, null, 2));

if (manifestProblems.length > 0) {
  console.error('post-state self-check problems:');
  for (const problem of manifestProblems) console.error(`  - ${problem}`);
  process.exit(1);
}
process.exit(clean ? 0 : 1);
