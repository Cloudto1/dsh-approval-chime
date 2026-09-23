/**
 * r21 / t1 -- the SECTION BADGE prints the version id alone (user request: "这里只显示版本号就行了"),
 * and every LIVE fingerprint that pinned the old stamp moves with it.
 *
 * WHAT THE PRODUCT CHANGE IS (and what it is NOT)
 *   - the badge used to render `snapshot.bundleRevision`, i.e. the whole stamp
 *     'rev-20 · the caret turn takes 160 ms'. It now renders `snapshot.bundleRevisionId`, which is
 *     DERIVED from `REVISION` (`REVISION.split(' · ')[0]`), so the two can never disagree;
 *   - the console surface keeps BOTH: `diagnostics.revision` stays the descriptive stamp (the
 *     "which build did this page load?" answer that names the behaviour) and `diagnostics.revisionId`
 *     is the badge's text. Nothing else in the bundle changed: no behaviour, no stylesheet, no
 *     geometry, no host half.
 *
 * THE DISCIPLINE (inherited from r15/t6, r16/t1, r17/t1, r18/t1, r18b/t5, r18c/t7, r19/t2, r20/t1)
 *   1. every row declares the EXACT number of sites it must rewrite. ONE wrong count aborts the whole
 *      run BEFORE anything is written (`--write` included); the table is checked for duplicate ids at
 *      start-up;
 *   2. no fingerprint is typed by hand. The OLD byte counts / sha256 / stamp are MEASURED from the
 *      files on disk (this tool runs BEFORE the edit), the NEW ones are computed from the rows applied
 *      IN MEMORY, and the row table is printed site by site for review before any write;
 *   3. the pre-edit bytes of every file a phase rewrites are archived under
 *      `_raw/r21-evidence/archive/<path with / -> __>.<pre-edit sha16>.txt` BEFORE the first write,
 *      and the run REFUSES to write if a copy does not hash back to the pre-edit bytes;
 *   4. every artifact this round writes lands under `_raw/r21-evidence/`, never at the root of `_raw/`
 *      and never over the r20 generation's evidence (`_raw/r20-*`, `_raw/r20-evidence/*` stay as that
 *      round's record);
 *   5. after a write every touched file is re-read from disk and must equal the predicted bytes+sha,
 *      and every row's anchor must be gone (or present exactly `expectAfter` times, for the two rows
 *      that insert text next to the anchor they keep).
 *
 *     node verify-independent/r21-reanchor.mjs --phase=a            # dry run: report + JSON, no writes
 *     node verify-independent/r21-reanchor.mjs --phase=a --quiet    # only the refusals + summary
 *     node verify-independent/r21-reanchor.mjs --phase=a --write    # archive, apply, self-check
 *
 * PHASE a: lib/client.js, verify/client-half.test.mjs, verify/custom-audio.test.mjs (product + the two
 *          files in the frozen manifest that pin the product).
 * PHASE b: verify-independent/** (the probes, the r15t2 failure-path probe, the mutation table) and
 *          verify-independent/run-r13.ps1 (the frozen manifest, the anchors, the log prefix). It
 *          MEASURES phase a's results from disk, so phase a must have been written first.
 */
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
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
const EVIDENCE = join(RAW, 'r21-evidence');
const ARCHIVE = join(EVIDENCE, 'archive');
const WRITE = process.argv.includes('--write');
const QUIET = process.argv.includes('--quiet');
const PHASE = (process.argv.find((value) => value.startsWith('--phase=')) ?? '--phase=a').slice('--phase='.length).toLowerCase();
if (PHASE !== 'a' && PHASE !== 'b') {
  console.error(`REFUSING: unknown phase '${PHASE}' (use --phase=a or --phase=b).`);
  process.exit(1);
}
const SUBROUND = 'r21/t1';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase();
const occ = (text, needle) => (needle.length === 0 ? 0 : text.split(needle).length - 1);
const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');
const withEol = (text, eol) => text.split('\n').join(eol);

/* ------------------------------------------------------------ measured inputs (never typed) */

const files = new Map();
const load = (rel) => {
  if (files.has(rel)) return files.get(rel);
  const buffer = readFileSync(join(PLUGIN, rel));
  const text = buffer.toString('utf8');
  const entry = { rel, before: buffer, text, eol: eolOf(text), rows: [] };
  files.set(rel, entry);
  return entry;
};

const CLIENT = 'lib/client.js';
const HALF = 'verify/client-half.test.mjs';
const AUDIO = 'verify/custom-audio.test.mjs';
const RUNNER = 'verify-independent/run-r13.ps1';

const clientEntry = load(CLIENT);
const pick = (text, regex, what) => {
  const match = regex.exec(text);
  if (match === null) {
    console.error(`REFUSING: ${what} not found.`);
    process.exit(1);
  }
  return match[1];
};
const OLD_STAMP_LIVE = pick(clientEntry.text, /var REVISION = '([^']*)';/, 'the shipped revision stamp in lib/client.js');
/* phase b measures the stamp this round STARTED from out of phase a's archive; phase a measures it
 * from the disk it is about to rewrite. Nothing here is typed. */
let OLD_STAMP = OLD_STAMP_LIVE;
let OLD_REV = OLD_STAMP.slice(0, 6);
const OLD_ROUND = OLD_REV.replace('rev-', 'r');
/* The round this edit belongs to. The stamp is the ONE string a reader sees in the console, so it
 * names what changed; the badge prints only its head. */
const STAMP = 'rev-21 · the section badge prints the version id alone';
const NEW_REV = STAMP.slice(0, 6);
const NEW_ROUND = NEW_REV.replace('rev-', 'r');

if (OLD_REV === NEW_REV && PHASE === 'a') {
  console.error('REFUSING: the product already carries this round\'s stamp.');
  process.exit(1);
}
if (!existsSync(join(ARCHIVE)) && WRITE) mkdirSync(ARCHIVE, { recursive: true });
if (!existsSync(EVIDENCE) && WRITE) mkdirSync(EVIDENCE, { recursive: true });
/* Refuse to re-run a phase's edit a second time: its anchors are gone once it has been written. */
if (PHASE === 'a') {
  if (occ(clientEntry.text, `var REVISION = '${OLD_STAMP}';`) !== 1) {
    console.error(`REFUSING: lib/client.js does not carry exactly one ${OLD_REV} stamp (phase a already applied?).`);
    process.exit(1);
  }
} else if (occ(clientEntry.text, `var REVISION = '${STAMP}';`) !== 1) {
  console.error(`REFUSING: lib/client.js does not carry the ${NEW_REV} stamp; phase a --write must run first.`);
  process.exit(1);
}

/* ------------------------------------------------------------------------- the row table */

const row = (file, id, what, from, to, count = 1, expectAfter = 0) => ({ kind: 'lit', file, id, what, from, to, count, expectAfter });
const lineRow = (file, id, what, match, to, count = 1, expectAfter = 0) => ({ kind: 'line', file, id, what, match, to, count, expectAfter });

/* The badge's text is the id alone; the console keeps the descriptive half for diagnosis. The two
 * assertions that used to compare the badge against `diagnostics.revision` now compare it against
 * `diagnostics.revisionId`, and three new ones make the user's request falsifiable: the badge must be
 * exactly `rev-<n>` (no separator, no prose) and the full stamp must NOT be on the page any more. */
const BADGE_CHECKS = [
  '/* rev-21 · the badge prints the ID alone (user request: "这里只显示版本号就行了"). These assertions are',
  '   the tripwire: the badge must be exactly the version id, it must carry no separator, and the full',
  '   stamp must be absent from the page. Any of them goes red if the badge is pointed back at',
  '   `bundleRevision`. `diagnostics.revision` keeps the descriptive half for the console. */',
  "report.check('the badge is the version id and nothing else (rev-21)', /^rev-\\d+$/.test(flattenText(revBadges[0])), flattenText(revBadges[0]));",
  "report.equal('the badge carries no descriptive half (rev-21)', flattenText(revBadges[0]).includes(' · '), false);",
  "report.equal('the badge is exactly diagnostics.revisionId (rev-21)', flattenText(revBadges[0]), bundle.diagnostics.revisionId);",
  "report.equal('the console keeps the descriptive half for diagnosis (rev-21)', String(bundle.diagnostics.revision).indexOf(String(bundle.diagnostics.revisionId) + ' · ') === 0, true);",
].join('\n');

const phaseA = [
  /* ---------------------------------------------------------------- lib/client.js */
  row(CLIENT, 'product-stamp', 'the stamp names this round and the badge id is DERIVED from it',
    `      var REVISION = '${OLD_STAMP}';`,
    [
      `      var REVISION = '${STAMP}';`,
      '      /**',
      '       * What the SECTION BADGE prints (rev-21): the version id alone. The descriptive half of',
      '       * REVISION answers "which behaviour changed" and stays on the console surface, where the',
      '       * room for it exists; the badge is a stamp a reader lines up against the changelog. One is',
      '       * derived from the other, so the two cannot drift apart.',
      '       */',
      "      var REVISION_ID = REVISION.split(' · ')[0];",
    ].join('\n')),
  row(CLIENT, 'product-snapshot', 'the section snapshot carries the id next to the full stamp',
    '          bundleRevision: REVISION,',
    '          bundleRevision: REVISION,\n          bundleRevisionId: REVISION_ID,', 1, 1),
  row(CLIENT, 'product-badge', 'the badge renders the ID, not the full stamp (THE user request)',
    "React.createElement('span', { className: 'dacRev' }, snapshot.bundleRevision),",
    "React.createElement('span', { className: 'dacRev' }, snapshot.bundleRevisionId),"),
  row(CLIENT, 'product-diagnostics', 'the console surface exposes both halves',
    '        revision: REVISION,',
    '        revision: REVISION,\n        /** The badge\'s text (rev-21): the id alone, i.e. REVISION minus its descriptive half. */\n        revisionId: REVISION_ID,', 1, 1),

  /* ------------------------------------------------------- verify/client-half.test.mjs */
  row(HALF, 'half-bullet', 'the changelog bullet of this revision, after the rev-20 one',
    [
      ' *     recorded as one next to the constant: this micro-interaction no longer distinguishes',
      ' *     environments, so it must not be quoted as an accessibility policy;',
    ].join('\n'),
    [
      ' *     recorded as one next to the constant: this micro-interaction no longer distinguishes',
      ' *     environments, so it must not be quoted as an accessibility policy;',
      ' *   - rev-21: the SECTION BADGE prints the version id alone ("rev-21"), not the whole stamp',
      ' *     (user request: "这里只显示版本号就行了"). `diagnostics.revision` keeps the descriptive',
      ' *     half for the console, `diagnostics.revisionId` is the badge\'s text, and the badge derives',
      ' *     it from the same string, so the two cannot drift;',
    ].join('\n'), 1, 1),
  lineRow(HALF, 'half-badge-eq', 'the badge is compared against the ID, not the stamp',
    /^report\.equal\('the badge names the build the page loaded', flattenText\(revBadges\[0\]\), bundle\.diagnostics\.revision\);$/,
    "report.equal('the badge names the build the page loaded (the version id, not the prose)', flattenText(revBadges[0]), bundle.diagnostics.revisionId);"),
  lineRow(HALF, 'half-stamp-rev', 'the stamp assertion moves to the shipped revision',
    /^report\.equal\('the revision stamp is rev-20', String\(bundle\.diagnostics\.revision\)\.startsWith\('rev-20'\), true\);$/,
    `report.equal('the revision stamp is ${NEW_REV}', String(bundle.diagnostics.revision).startsWith('${NEW_REV}'), true);`),
  row(HALF, 'half-badge-checks', "the user's request turned into assertions (5 new checks)",
    'const statsText = flattenText(view.tree);',
    `const statsText = flattenText(view.tree);\n${BADGE_CHECKS}`, 1, 1),
  lineRow(HALF, 'half-page-stamp', 'the page-text assertion looks for the ID and for the prose ABSENCE',
    /^report\.check\('the section shows the bundle revision stamp', statsText\.includes\(bundle\.diagnostics\.revision\)\);$/,
    "report.check('the section shows the bundle revision stamp (the version id, rev-21)', statsText.includes(bundle.diagnostics.revisionId) && !statsText.includes(bundle.diagnostics.revision));"),

  /* ----------------------------------------------------- verify/custom-audio.test.mjs */
  lineRow(AUDIO, 'audio-stamp', 'the version literal at :267',
    /^report\.ok\('the revision names this build', String\(diagnostics\.revision\)\.includes\('rev-20'\), String\(diagnostics\.revision\)\);$/,
    `report.ok('the revision names this build', String(diagnostics.revision).includes('${NEW_REV}'), String(diagnostics.revision));`),
];

/* ==================================================================== PHASE B ============ */
/* Everything below pins the product from the OUTSIDE: the probes, the failure-path probe, the
 * mutation table and the canonical runner. Their old values are MEASURED either from the file being
 * edited (the literal it currently carries) or from this round's own archive of the pre-edit product
 * (`_raw/r21-evidence/archive/`, written by phase a), never typed. */

const pickMatch = (text, regex, what) => {
  const match = regex.exec(text);
  if (match === null) {
    console.error(`REFUSING: ${what} not found.`);
    process.exit(1);
  }
  return match;
};
const flat = (rel) => load(rel).text.split('\r\n').join('\n');

const P2 = 'verify-independent/probe-2-gain-and-resources.mjs';
const P3 = 'verify-independent/probe-3-card-and-scope.mjs';
const P8 = 'verify-independent/probe-8-client-roster-render.mjs';
const P17 = 'verify-independent/probe-17-r7-section.mjs';
const P18 = 'verify-independent/probe-18-r10-sessions.mjs';
const P19 = 'verify-independent/probe-19-r12-select-parity.mjs';
const P20 = 'verify-independent/probe-20-r14-bell-appearance.mjs';
const T2 = 'verify-independent/r15t2-independent-probe.mjs';
const T6 = 'verify-independent/r15t6-mutation-table.mjs';

/* the baseline this round started from: the bytes phase a archived (the user's terminology commit). */
const archiveOf = (needle) => {
  const names = existsSync(ARCHIVE) ? readdirSync(ARCHIVE).filter((name) => name.startsWith(needle) && name.endsWith('.txt')) : [];
  if (names.length !== 1) {
    console.error(`REFUSING: expected exactly one archive copy for ${needle} under ${ARCHIVE}, found ${names.length}. Run phase a --write first.`);
    process.exit(1);
  }
  const buffer = readFileSync(join(ARCHIVE, names[0]));
  return { source: `_raw/r21-evidence/archive/${names[0]}`, bytes: buffer.length, sha: sha256(buffer), text: buffer.toString('utf8') };
};
const PREV_CLIENT = archiveOf('lib__client.js.');
const PREV_HALF = archiveOf('verify__client-half.test.mjs.');
const PREV_AUDIO = archiveOf('verify__custom-audio.test.mjs.');
/* the stamp this round started from: measured out of phase a's archived product, never typed */
OLD_STAMP = pick(PREV_CLIENT.text, /var REVISION = '([^']*)';/, 'the pre-edit revision stamp in the archived product');
OLD_REV = OLD_STAMP.slice(0, 6);

const now = (rel) => {
  const buffer = readFileSync(join(PLUGIN, rel));
  return { bytes: buffer.length, sha: sha256(buffer), text: buffer.toString('utf8') };
};
const NEW_CLIENT = now(CLIENT);
const NEW_HALF = now(HALF);
const NEW_AUDIO = now(AUDIO);
const NEW_PKG = now('package.json');
const NEW_CRLF = occ(NEW_CLIENT.text, '\r\n');
if (NEW_CLIENT.sha === PREV_CLIENT.sha) {
  console.error('REFUSING: lib/client.js is still the pre-edit product; run phase a --write first.');
  process.exit(1);
}

/* the four harness counts, read out of the logs phase a's operator wrote next to this run's evidence */
const harnessCounts = ['host-half', 'client-half', 'waterfall', 'custom-audio'].map((suite) => {
  const log = join(EVIDENCE, `r21-harness-${suite}.log`);
  if (!existsSync(log)) {
    console.error(`REFUSING: _raw/r21-evidence/r21-harness-${suite}.log is missing; run the four suites first.`);
    process.exit(1);
  }
  const match = /(\d+)\/(\d+) checks passed/.exec(readFileSync(log, 'utf8'));
  if (match === null) {
    console.error(`REFUSING: no 'N/N checks passed' line in the ${suite} log.`);
    process.exit(1);
  }
  if (match[1] !== match[2]) {
    console.error(`REFUSING: the ${suite} log reports ${match[1]}/${match[2]} -- a failing suite cannot anchor a count.`);
    process.exit(1);
  }
  return Number(match[1]);
});
const HARNESS_TOTAL = harnessCounts.reduce((sum, count) => sum + count, 0);

/* what the files being edited currently pin (measured, so a stale literal cannot be mistaken for a
 * moved one), and what they must pin after this round. */
const mP17Bytes = pickMatch(flat(P17), /report\.same\('lib\/client\.js byte count is what (rev-\d+) claims', CLIENT_BYTES, (\d+)\);/, 'probe-17 byte pin');
const mP17Sha = pickMatch(flat(P17), /'lib\/client\.js sha256 is what (rev-\d+) claims',\n  CLIENT_SHA256,\n  '([0-9A-F]{64})',/, 'probe-17 sha pin');
const mP17Badge = pickMatch(flat(P17), /report\.same\('the bundleRevision badge shows the (rev-\d+) stamp', textOf\(byType\(tree, 'span'\)\.find\(\(node\) => node\.props\.className === 'dacRev'\)\), diagnostics\.revision\);/, 'probe-17 badge assertion');
const mP17Rev = pickMatch(flat(P17), /report\.check\('the revision stamp is the (rev-\d+) one', \/(rev-\d+)\/\.test\(diagnostics\.revision\), diagnostics\.revision\);/, 'probe-17 stamp regex check');
const mP19 = pickMatch(flat(P19), /client: \{\n    bytes: (\d+),\n    sha256: '([0-9A-F]{64})',\n  \},/, 'probe-19 client FROZEN block');
const mP19Rev = pickMatch(flat(P19), /\n  revision: '([^']*)',/, 'probe-19 revision');
const mT2 = pickMatch(flat(T2), /sha256: '([0-9A-F]{64})',\n  bytes: (\d+),\n  revision: '([^']*)',/, 'r15t2 FROZEN block');
const mT6 = pickMatch(flat(T6), /const FROZEN = \{ sha256: '([0-9A-F]{64})', bytes: (\d+) \};/, 'the mutation table FROZEN constant');
const mRunnerHalf = pickMatch(flat(RUNNER), /@\{ path = 'verify\\client-half\.test\.mjs'; bytes = (\d+);  sha = '([0-9A-F]{64})' \},/, 'runner manifest: client-half');
const mRunnerAudio = pickMatch(flat(RUNNER), /@\{ path = 'verify\\custom-audio\.test\.mjs'; bytes = (\d+); sha = '([0-9A-F]{64})' \},/, 'runner manifest: custom-audio');
const mRunnerPkg = pickMatch(flat(RUNNER), /@\{ path = 'package\.json';                bytes = (\d+);    sha = '([0-9A-F]{64})' \},/, 'runner manifest: package.json');
const mRunnerClient = pickMatch(flat(RUNNER), /@\{ path = 'lib\\client\.js';               bytes = (\d+); sha = '([0-9A-F]{64})' \},/, 'runner manifest: lib/client.js');
const mRunnerAnchor = pickMatch(flat(RUNNER), /@\{ path = \(Join-Path \$plugin 'lib\\client\.js'\); bytes = (\d+); sha = '([0-9A-F]{64})' \},/, 'runner section 0c anchor: lib/client.js');
const mP20Crlf = pickMatch(flat(P20), /THE BUNDLE IS A CRLF FILE \(measured: all (\d+) of its newlines are CRLF\)/, 'probe-20 CRLF measurement');

const phaseB = [
  /* ------------------------------------------------------------- legacy probes (still live) */
  row(P2, 'p2-name', 'the assertion name stops naming the previous revision as the source',
    'the five the rev-20 source has', `the five the ${NEW_REV} source has`),
  lineRow(P3, 'p3-page-stamp', 'the page assertion asks for the ID and for the prose ABSENCE',
    /^report\.check\('the card displays the bundle revision stamp'/,
    `report.check('the card displays the bundle revision id (rev-21: the badge prints the version id alone)', allText(view.tree).includes(diagnostics.revisionId) && !allText(view.tree).includes(diagnostics.revision), String(diagnostics.revisionId));`),
  row(P8, 'p8-name', 'the assertion name', "(rev-20)'", `(${NEW_REV})'`),
  row(P8, 'p8-literal', 'the literal it greps for', "String(diagnostics.revision).includes('rev-20')", `String(diagnostics.revision).includes('${NEW_REV}')`),

  /* --------------------------------------------------------------------------- probe-17 */
  lineRow(P17, 'p17-bytes', 'the byte-count pin and its assertion name (the byte count MOVED)',
    /^report\.same\('lib\/client\.js byte count is what rev-\d+ claims', CLIENT_BYTES, \d+\);$/,
    `report.same('lib/client.js byte count is what ${NEW_REV} claims', CLIENT_BYTES, ${NEW_CLIENT.bytes});`, 1, 1),
  row(P17, 'p17-sha-name', 'the sha256 assertion name',
    `'lib/client.js sha256 is what ${mP17Sha[1]} claims',`, `'lib/client.js sha256 is what ${NEW_REV} claims',`),
  row(P17, 'p17-sha', 'the pinned sha256 (the MEASURED shipped one)',
    `  '${mP17Sha[2]}',`, `  '${NEW_CLIENT.sha}',`),
  row(P17, 'p17-badge', 'the badge assertion: it now asks the console surface for the ID',
    `report.same('the bundleRevision badge shows the ${mP17Badge[1]} stamp', textOf(byType(tree, 'span').find((node) => node.props.className === 'dacRev')), diagnostics.revision);`,
    "report.same('the bundleRevision badge shows the version id alone (rev-21)', textOf(byType(tree, 'span').find((node) => node.props.className === 'dacRev')), diagnostics.revisionId);"),
  row(P17, 'p17-stamp-regex', 'the stamp regex check grows the prose-absence half (one new check)',
    `report.check('the revision stamp is the ${mP17Rev[1]} one', /${mP17Rev[2]}/.test(diagnostics.revision), diagnostics.revision);`,
    [
      `report.check('the revision stamp is the ${NEW_REV} one', /${NEW_REV}/.test(diagnostics.revision), diagnostics.revision);`,
      "report.check('the badge carries the version id and no prose (rev-21)', /^rev-\\d+$/.test(String(textOf(byType(tree, 'span').find((node) => node.props.className === 'dacRev')))), String(textOf(byType(tree, 'span').find((node) => node.props.className === 'dacRev'))));",
    ].join('\n')),

  /* --------------------------------------------------------------------------- probe-18 */
  row(P18, 'p18-expected-revision', 'the expected revision constant',
    "'rev-20 · the caret turn takes 160 ms'", `'${STAMP}'`),
  row(P18, 'p18-h6-rendered', 'H6 asks the page for the ID and for the ABSENCE of the prose half',
    "labels.includes('已触发') && labels.includes(bundle.diagnostics.revision) && bundle.diagnostics.revision === EXPECTED_REVISION, `revision=${show(bundle.diagnostics.revision)} rendered=${labels.includes(bundle.diagnostics.revision)} expected=${show(EXPECTED_REVISION)}`",
    "labels.includes('已触发') && labels.includes(bundle.diagnostics.revisionId) && !labels.includes(bundle.diagnostics.revision) && bundle.diagnostics.revision === EXPECTED_REVISION, `revision=${show(bundle.diagnostics.revision)} id=${show(bundle.diagnostics.revisionId)} rendered=${labels.includes(bundle.diagnostics.revisionId)} prose-on-page=${labels.includes(bundle.diagnostics.revision)} expected=${show(EXPECTED_REVISION)}`"),

  /* --------------------------------------------------------------------------- probe-19 */
  row(P19, 'p19-bytes', 'the pinned client byte count (it MOVED)',
    `    bytes: ${mP19[1]},`, `    bytes: ${NEW_CLIENT.bytes},`),
  row(P19, 'p19-sha', 'the pinned client sha256', `    sha256: '${mP19[2]}',`, `    sha256: '${NEW_CLIENT.sha}',`),
  row(P19, 'p19-revision', 'the expected revision', `  revision: '${mP19Rev[1]}',`, `  revision: '${STAMP}',`),

  /* ------------------------------------------- probe-20: the CRLF measurement and the banner */
  row(P20, 'p20-crlf-count', 'the measured CRLF newline count of the bundle under test',
    `measured: all ${mP20Crlf[1]} of its newlines are CRLF`, `measured: all ${NEW_CRLF} of its newlines are CRLF`),
  row(P20, 'p20-banner', 'the console banner of the shipped run lists the round it is anchored to',
    'rev-19/rev-20 session-bell appearance', `rev-19/rev-20/${NEW_REV} session-bell appearance`),

  /* ------------------------------------------------- the r15t2 independent failure-path probe */
  row(T2, 't2-frozen-sha', 'the pinned sha256', `sha256: '${mT2[1]}',`, `sha256: '${NEW_CLIENT.sha}',`),
  row(T2, 't2-frozen-bytes', 'the pinned byte count (it MOVED)', `  bytes: ${mT2[2]},`, `  bytes: ${NEW_CLIENT.bytes},`),
  row(T2, 't2-frozen-revision', 'the pinned revision', `  revision: '${mT2[3]}',`, `  revision: '${STAMP}',`),
  row(T2, 't2-comment', 'the header comment that names the frozen bytes',
    '/** The frozen rev-20 bytes this probe is anchored to', `/** The frozen ${NEW_REV} bytes this probe is anchored to`),
  row(T2, 't2-author', 'the AUTHOR label', 'ships as rev-20"', `ships as ${NEW_REV}"`),
  row(T2, 't2-a1-name', 'the A1 assertion name', 'A1: lib/client.js is the frozen rev-20 byte sequence', `A1: lib/client.js is the frozen ${NEW_REV} byte sequence`),
  row(T2, 't2-source-label', 'the source label the vm is handed', "'shipped rev-20 bytes'", `'shipped ${NEW_REV} bytes'`),
  row(T2, 't2-run-banner', 'the shipped-run banner the runner greps past', '=== shipped rev-20 run:', `=== shipped ${NEW_REV} run:`),

  /* ------------------------------------------------------------------ the mutation table */
  row(T6, 't6-header-chain', 'header line 1: the re-anchor chain grows by this round',
    'by r19 / t2 and now by r20 / t1 -- the MUTATION TABLE:', `by r19 / t2, by r20 / t1 and now by ${NEW_ROUND} / t1 -- the MUTATION TABLE:`),
  row(T6, 't6-header-bytes', 'header line 3 AND the md title: the bytes the table re-measures (2 sites)',
    'every declared mutation re-measured on the rev-20 bytes', `every declared mutation re-measured on the ${NEW_REV} bytes`, 2),
  row(T6, 't6-header-refusal', 'the refusal note: which artifact the table insists on',
    'it REFUSES to run unless lib/client.js is the rev-20 bytes', `it REFUSES to run unless lib/client.js is the ${NEW_REV} bytes`),
  row(T6, 't6-header-log-list', "the note that lists which rounds' logs survive",
    'so the r13c, r15, r16, r17, r18, r18b, r18c AND r19 logs stay untouched', 'so the r13c, r15, r16, r17, r18, r18b, r18c, r19 AND r20 logs stay untouched'),
  row(T6, 't6-frozen', 'the FROZEN constant (MEASURED bytes + sha256 of the shipped lib/client.js)',
    `const FROZEN = { sha256: '${mT6[1]}', bytes: ${mT6[2]} };`, `const FROZEN = { sha256: '${NEW_CLIENT.sha}', bytes: ${NEW_CLIENT.bytes} };`),
  row(T6, 't6-rowlist-note', 'the row-list note under the mutations array',
    'mutants + the 6 r18/t2 reduce-motion mutants, re-run on the rev-20 bytes. */', `mutants + the 6 r18/t2 reduce-motion mutants, re-run on the ${NEW_REV} bytes. */`),
  row(T6, 't6-refusal-text', 'the refusal message: which artifact the table insists on',
    'not the rev-20 artifact', `not the ${NEW_REV} artifact`),
  row(T6, 't6-revision', 'the revision recorded in the machine-readable table', "revision: 'rev-20',", `revision: '${NEW_REV}',`),
  lineRow(T6, 't6-md-title', 'the markdown table title',
    /^  '# r20 · the .* mutation table \(every declared mutation re-measured on the .* bytes\)',$/,
    `  '# ${NEW_ROUND} · the ${NEW_REV} mutation table (every declared mutation re-measured on the ${NEW_REV} bytes)',`),
  row(T6, 't6-result-md', 'the RESULT line written into the markdown table',
    'declared mutations on the rev-20 bytes rewrite the evaluated source', `declared mutations on the ${NEW_REV} bytes rewrite the evaluated source`),
  row(T6, 't6-result-console', 'the RESULT line printed to the console',
    'declared mutations is ok on the rev-20 bytes.', `declared mutations is ok on the ${NEW_REV} bytes.`),
  row(T6, 't6-console-label', 'the console label the runner greps (its pattern moves in the same batch)',
    'console.log(`r20 mutation table:', 'console.log(`r21 mutation table:'),
  row(T6, 't6-evidence-dir', "the per-round evidence directory this round's logs live in",
    "const EVIDENCE = join(RAW, 'r20-evidence');", "const EVIDENCE = join(RAW, 'r21-evidence');"),
  row(T6, 't6-log-prefix-evidence', 'log-prefix row: the evidence directory inside the log paths and notes (6 sites)',
    'r20-evidence', 'r21-evidence', 6),
  row(T6, 't6-log-prefix-mut', 'log-prefix row: the per-mutant log basename in the log paths and notes (4 sites)',
    'r20-mut-', 'r21-mut-', 4),
  row(T6, 't6-table-file', 'log-prefix row: the table it writes (json + md, 2 sites)',
    'r20-t1-mutation-table', 'r21-t1-mutation-table', 2),

  /* ------------------------------------------------------------------------ the runner */
  lineRow(RUNNER, 'runner-title', 'title line',
    /^# Independent rev-20 full regression run/,
    `# Independent ${NEW_REV} full regression run (${SUBROUND}, the SECTION BADGE prints the version id alone and every live fingerprint re-anchored; the r18/t1, r18b/t5, r18c/t7, r19/t2 and r20/t1 logs are preserved).`),
  row(RUNNER, 'runner-prefix-note', 'the log-prefix note',
    'Every log this script writes carries the `r20-` prefix', 'Every log this script writes carries the `r21-` prefix'),
  row(RUNNER, 'runner-never-overwritten', 'the "never overwritten" list grows by the r20 round',
    'evidence of the r15/r16/r17/r18/r18b/r18c/r19 rounds under verify-independent/_raw/ are NEVER overwritten',
    'evidence of the r15/r16/r17/r18/r18b/r18c/r19/r20 rounds under verify-independent/_raw/ are NEVER overwritten'),
  row(RUNNER, 'runner-prefix-history', 'the sentence that names the round writing the prefix now',
    'r19/t2 AND r20/t1 moved every prefix row in the', `r19/t2, r20/t1 AND ${SUBROUND} moved every prefix row in the`),
  row(RUNNER, 'runner-prefix-this-round', 'the r20/t1 bullet stops claiming the prefix',
    'this r20/t1 re-anchor writes `r20-`, and the rule is stated at the top of this',
    'this r20/t1 re-anchor wrote `r20-`, and the rule is stated at the top of this'),
  row(RUNNER, 'runner-why-lead', 'a new WHY block for this round, and the rev-20 block becomes history',
    '# WHY THIS RUN EXISTS AT rev-20 -- the caret turn is 160 ms again and BOTH reduced-motion media',
    [
      `# WHY THIS RUN EXISTS AT ${NEW_REV} -- the SECTION BADGE prints the version ID ALONE. User request:`,
      '# "这里只显示版本号就行了" (the badge used to render the whole stamp, e.g.',
      "# 'rev-20 · the caret turn takes 160 ms'). The badge now renders `snapshot.bundleRevisionId`, which",
      '# is DERIVED from `REVISION` when the bundle is built, so the id and the descriptive half cannot',
      '# drift apart; the descriptive half stays on the console surface (`diagnostics.revision`), where',
      '# there is room for it, and `diagnostics.revisionId` is the badge\'s text. Behaviour, stylesheet,',
      '# geometry, the audio path and the host half are UNTOUCHED -- this is a rendering change and it is',
      '# the whole change.',
      '#   - the round also found that the tree had already moved under the r20 evidence: commit b0ad1eb',
      '#     ("rev-12..rev-20 refinements, DSH terminology, user-facing README", 2026-09-20 00:38) landed',
      '#     AFTER the r20 canonical run (23:06) and rewrote 556 strings across 25 files, two of them in',
      '#     the strings this bundle shows. The product bytes therefore went 158549 B / 4B6C8B91... (the',
      '#     bytes every r20 fingerprint pinned) to ' + PREV_CLIENT.bytes + ' B / ' + PREV_CLIENT.sha.slice(0, 8) + '... BEFORE this round started, so section 0 of this',
      '#     script was RED on the committed tree until this re-anchor. The deltas below name that hop',
      '#     explicitly instead of presenting the r20 numbers as current.',
      '#   - WHETHER AN ID-ONLY BADGE IS WHAT THE USER WANTED IS NOT SOMETHING THIS RUN CAN PROVE. Only',
      '#     the user, looking at the page, can. This run pins the badge\'s text, the absence of the prose',
      '#     half on the page and the console surface that keeps both -- nothing about taste.',
      '# WHY THE r20 ROUND EXISTED (history, kept verbatim) -- the caret turn is 160 ms again and BOTH reduced-motion media',
    ].join('\n')),
  row(RUNNER, 'runner-product-delta', 'the lib/client.js delta line (old and new values both MEASURED)',
    [
      '#     byte count GROWS this time); diagnostics.revision is now \'rev-20 · the caret turn takes 160 ms\'.',
    ].join('\n'),
    [
      '#     byte count GREW that time); diagnostics.revision BECAME \'rev-20 · the caret turn takes 160 ms\' ->',
      `#     ${PREV_CLIENT.bytes} B / ${PREV_CLIENT.sha.slice(0, 8)}... (commit b0ad1eb, the user's own terminology pass, which landed AFTER the`,
      '#     r20 canonical run -- see the WHY block above) ->',
      `#     ${NEW_CLIENT.bytes} B / ${NEW_CLIENT.sha.slice(0, 8)}... (${SUBROUND}: the badge prints the version id alone; diagnostics.revision is`,
      `#     now '${STAMP}' and diagnostics.revisionId is the badge's text).`,
    ].join('\n')),
  row(RUNNER, 'runner-half-delta', 'the client-half delta line (the new bytes+sha MEASURED from disk)',
    '#     transition in every environment). The assertion count is 400 now (was 399).',
    [
      '#     transition in every environment). The assertion count was 400 then (399 before it) ->',
      `#     ${PREV_HALF.bytes} B / ${PREV_HALF.sha.slice(0, 8)}... (commit b0ad1eb, same terminology pass) ->`,
      `#     ${NEW_HALF.bytes} B / ${NEW_HALF.sha.slice(0, 8)}... (${SUBROUND}: the badge/id assertions and the version literal --`,
      `#     FOUR new checks; the assertion count is ${harnessCounts[1]} now (400 before it)).`,
    ].join('\n')),
  row(RUNNER, 'runner-audio-delta', 'the custom-audio delta line (the new sha MEASURED from disk)',
    '#     literal at :267; the assertion count is unchanged at 75 checks).',
    [
      '#     literal at :267; the assertion count is unchanged at 75 checks) ->',
      `#     20263 B / ${NEW_AUDIO.sha.slice(0, 8)}... (${SUBROUND}: the same literal; the count is still ${harnessCounts[3]}).`,
    ].join('\n')),
  row(RUNNER, 'runner-summary-counts', 'the author-suite tally in the expected-red note (it was stale already)',
    '#     author suites (124 / 399 / 22 / 75 = 620 checks). The ten rev-1 ... rev-3 legacy probes',
    `#     author suites (${harnessCounts.join(' / ')} = ${HARNESS_TOTAL} checks). The ten rev-1 ... rev-3 legacy probes`),
  row(RUNNER, 'runner-manifest-note', 'the frozen-manifest note',
    '# THE FROZEN MANIFEST -- 9 files, re-anchored to the rev-20 baseline. Re-anchoring this table',
    `# THE FROZEN MANIFEST -- 9 files, re-anchored to the ${NEW_REV} baseline. Re-anchoring this table`),
  row(RUNNER, 'runner-manifest-client', 'frozen manifest row: lib/client.js (MEASURED, from the runner\'s own line)',
    `@{ path = 'lib\\client.js';               bytes = ${mRunnerClient[1]}; sha = '${mRunnerClient[2]}' },`,
    `@{ path = 'lib\\client.js';               bytes = ${NEW_CLIENT.bytes}; sha = '${NEW_CLIENT.sha}' },`),
  row(RUNNER, 'runner-manifest-half', 'frozen manifest row: verify/client-half.test.mjs (MEASURED from disk)',
    `@{ path = 'verify\\client-half.test.mjs'; bytes = ${mRunnerHalf[1]};  sha = '${mRunnerHalf[2]}' },`,
    `@{ path = 'verify\\client-half.test.mjs'; bytes = ${NEW_HALF.bytes};  sha = '${NEW_HALF.sha}' },`),
  row(RUNNER, 'runner-manifest-audio', 'frozen manifest row: verify/custom-audio.test.mjs (MEASURED from disk)',
    `@{ path = 'verify\\custom-audio.test.mjs'; bytes = ${mRunnerAudio[1]}; sha = '${mRunnerAudio[2]}' },`,
    `@{ path = 'verify\\custom-audio.test.mjs'; bytes = ${NEW_AUDIO.bytes}; sha = '${NEW_AUDIO.sha}' },`),
  row(RUNNER, 'runner-manifest-package', 'frozen manifest row: package.json (the term pass rewrote it)',
    `@{ path = 'package.json';                bytes = ${mRunnerPkg[1]};    sha = '${mRunnerPkg[2]}' },`,
    `@{ path = 'package.json';                bytes = ${NEW_PKG.bytes};    sha = '${NEW_PKG.sha}' },`),
  row(RUNNER, 'runner-section0-heading', 'section 0 heading',
    '=== 0. frozen manifest: 9 recorded files byte-identical to the rev-20 baseline ===',
    `=== 0. frozen manifest: 9 recorded files byte-identical to the ${NEW_REV} baseline ===`),
  row(RUNNER, 'runner-section0c-round', 'section 0c: which round changed what',
    'rev-20 changed lib/client.js and verify/: lib/index.js must still be the rev-11 bytes.',
    `${NEW_REV} changed lib/client.js and verify/: lib/index.js must still be the rev-11 bytes.`),
  row(RUNNER, 'runner-anchor-client', 'section 0c anchor row: lib/client.js (MEASURED)',
    `@{ path = (Join-Path $plugin 'lib\\client.js'); bytes = ${mRunnerAnchor[1]}; sha = '${mRunnerAnchor[2]}' },`,
    `@{ path = (Join-Path $plugin 'lib\\client.js'); bytes = ${NEW_CLIENT.bytes}; sha = '${NEW_CLIENT.sha}' },`),
  row(RUNNER, 'runner-section7b-heading', 'section 7b heading',
    '=== 7b. rev-20 mutation table: every declared mutation re-measured on THESE bytes ===',
    `=== 7b. ${NEW_REV} mutation table: every declared mutation re-measured on THESE bytes ===`),
  row(RUNNER, 'runner-section7b-note1', 'section 7b: the artifact the table insists on',
    'refuses to run unless lib/client.js is the rev-20', `refuses to run unless lib/client.js is the ${NEW_REV}`),
  row(RUNNER, 'runner-section7b-note2', "section 7b: the round whose table this is, and where it lands",
    'writes _raw/r20-evidence/r20-t1-mutation-table.json/.md.', `writes _raw/r21-evidence/r21-t1-mutation-table.json/.md.`),
  row(RUNNER, 'runner-table-grep', "section 7b: the pattern that reads the table's console label",
    "'^r20 mutation table: '", "'^r21 mutation table: '"),
  row(RUNNER, 'runner-summary-manifest', 'the summary line: which manifest the run was byte-identical to',
    'are byte-identical to the rev-20 manifest before and after', `are byte-identical to the ${NEW_REV} manifest before and after`),
  row(RUNNER, 'runner-log-prefix-single', "log-prefix row: every single-quoted path this round writes (9 sites)",
    "'r20-", "'r21-", 9),
  row(RUNNER, 'runner-log-prefix-double', "log-prefix row: every double-quoted path this round writes (7 sites)",
    '"r20-', '"r21-', 7),
];

const table = PHASE === 'a' ? phaseA : phaseB;
if (table.length === 0) {
  console.error(`REFUSING: phase ${PHASE} has no rows yet.`);
  process.exit(1);
}
const seen = new Set();
for (const entry of table) {
  if (seen.has(entry.id)) {
    console.error(`REFUSING: duplicate row id '${entry.id}'.`);
    process.exit(1);
  }
  seen.add(entry.id);
}

/* ------------------------------------------------------------------------ apply + report */

const applied = [];
const failures = [];
for (const entry of table) {
  const file = load(entry.file);
  const before = file.text;
  let hits = [];
  if (entry.kind === 'lit') {
    const from = withEol(entry.from, file.eol);
    const to = withEol(entry.to, file.eol);
    const observed = occ(before, from);
    /* The MEASURED occurrence count is what gets recorded (the r21/t1 phase-b JSON of the first run
     * stored `1` here for the six multi-site rows -- a reporting defect of this instrument, fixed
     * after that run; the edit itself was never affected, because the guard below compares the
     * measured count and the post-check proves the anchors are gone). */
    hits = new Array(observed).fill(from);
    if (observed !== entry.count) {
      failures.push(`${entry.id}: ${entry.file} -- declared ${entry.count} occurrence(s), measured ${observed}`);
    } else {
      file.text = before.split(from).join(to);
    }
  } else {
    const lines = before.split(file.eol);
    const kept = [];
    for (const text of lines) {
      if (entry.match.test(text)) {
        hits.push(text);
        kept.push(withEol(entry.to, file.eol));
      } else {
        kept.push(text);
      }
    }
    if (hits.length !== entry.count) {
      failures.push(`${entry.id}: ${entry.file} -- declared ${entry.count} line(s), measured ${hits.length}`);
    } else {
      file.text = kept.join(file.eol);
    }
  }
  if (hits.length === entry.count) {
    const after = file.text;
    const stillThere = entry.kind === 'lit'
      ? occ(after, withEol(entry.from, file.eol))
      : after.split(file.eol).filter((text) => entry.match.test(text)).length;
    if (stillThere !== entry.expectAfter) {
      failures.push(`${entry.id}: ${entry.file} -- ${stillThere} anchor line(s) left after the edit, expected ${entry.expectAfter}`);
    }
  }
  applied.push({ ...entry, match: entry.match === undefined ? undefined : String(entry.match), hits: hits.length, sample: hits.slice(0, 3) });
}

const predictions = [...files.values()].map((entry) => {
  const buffer = Buffer.from(entry.text, 'utf8');
  return { file: entry.rel, beforeBytes: entry.before.length, beforeSha: sha256(entry.before), afterBytes: buffer.length, afterSha: sha256(buffer), changed: entry.text !== entry.before.toString('utf8') };
});

const report = {
  subround: SUBROUND,
  phase: PHASE,
  write: WRITE,
  oldStamp: OLD_STAMP,
  stamp: STAMP,
  oldRevision: OLD_REV,
  newRevision: NEW_REV,
  rows: applied.map((entry) => ({ id: entry.id, file: entry.file, kind: entry.kind, what: entry.what, declared: entry.count, observed: entry.hits, expectAfter: entry.expectAfter, sample: entry.sample })),
  files: predictions,
  failures,
};

if (!QUIET) {
  console.log(`=== ${SUBROUND} re-anchor, phase ${PHASE} (${WRITE ? 'WRITE' : 'dry run'}) ===`);
  console.log(`stamp: '${OLD_STAMP}'  ->  '${STAMP}'   (badge id ${OLD_REV} -> ${NEW_REV})`);
  for (const entry of applied) {
    const mark = failures.some((text) => text.startsWith(`${entry.id}:`)) ? 'REFUSE' : 'ok';
    console.log(`  [${mark}] ${entry.id.padEnd(22)} ${entry.file.padEnd(38)} ${entry.hits}/${entry.count} site(s) -- ${entry.what}`);
    for (const text of entry.sample) console.log(`        | ${text.length > 150 ? `${text.slice(0, 150)}...` : text}`);
  }
  console.log('--- predicted post-edit bytes');
  for (const entry of predictions) {
    if (!entry.changed) continue;
    console.log(`  ${entry.file.padEnd(38)} ${entry.beforeBytes} B / ${entry.beforeSha.slice(0, 16)}...  ->  ${entry.afterBytes} B / ${entry.afterSha.slice(0, 16)}...`);
  }
}
if (failures.length > 0) {
  console.error('REFUSING: no file was written.');
  for (const text of failures) console.error(`  ${text}`);
  process.exit(1);
}

if (!WRITE) {
  if (!QUIET) console.log(`\ndry run only: ${table.length} row(s) would rewrite ${[...files.values()].filter((entry) => entry.text !== entry.before.toString('utf8')).length} file(s).`);
} else {
  mkdirSync(ARCHIVE, { recursive: true });
  mkdirSync(EVIDENCE, { recursive: true });
  const archives = [];
  for (const entry of files.values()) {
    if (entry.text === entry.before.toString('utf8')) continue;
    const name = `${entry.rel.split('/').join('__')}.${sha256(entry.before).slice(0, 16)}.txt`;
    const copy = join(ARCHIVE, name);
    writeFileSync(copy, entry.before);
    if (sha256(readFileSync(copy)) !== sha256(entry.before)) {
      console.error(`REFUSING: the archive copy ${name} does not hash back to the pre-edit bytes.`);
      process.exit(1);
    }
    archives.push({ file: entry.rel, copy: `_raw/r21-evidence/archive/${name}`, bytes: entry.before.length, sha: sha256(entry.before) });
  }
  for (const entry of files.values()) {
    if (entry.text === entry.before.toString('utf8')) continue;
    writeFileSync(join(PLUGIN, entry.rel), Buffer.from(entry.text, 'utf8'));
  }
  /* self-check: the disk must now equal the prediction, byte for byte */
  const selfCheck = [];
  for (const prediction of predictions) {
    if (!prediction.changed) continue;
    const buffer = readFileSync(join(PLUGIN, prediction.file));
    const ok = buffer.length === prediction.afterBytes && sha256(buffer) === prediction.afterSha;
    selfCheck.push({ ...prediction, diskBytes: buffer.length, diskSha: sha256(buffer), ok });
  }
  report.archives = archives;
  report.selfCheck = selfCheck;
  if (!QUIET) {
    console.log('--- self-check after the write');
    for (const entry of selfCheck) console.log(`  [${entry.ok ? 'ok' : 'MISMATCH'}] ${entry.file.padEnd(38)} ${entry.diskBytes} B / ${entry.diskSha.slice(0, 16)}...`);
  }
  if (selfCheck.some((entry) => !entry.ok)) {
    console.error('FAILED: a written file does not match the prediction.');
    process.exit(1);
  }
  writeFileSync(join(EVIDENCE, `${SUBROUND.replace('/', '-')}-reanchor-phase${PHASE}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (!QUIET) console.log(`\nwrote ${selfCheck.length} file(s); json -> _raw/r21-evidence/${SUBROUND.replace('/', '-')}-reanchor-phase${PHASE}.json`);
}

/* ---------------------------------------------------- phase a is done: measure the harness */

if (PHASE === 'a' && WRITE) {
  /* The four suites are run by the OPERATOR (a shell), not from here: under this host's file
   * sandbox a child process cannot write to a pipe, so `spawnSync(..., {stdio:'pipe'})` returns
   * EPERM and a captured count would be a lie. The logs must already sit next to this run's
   * evidence, because the counts they contain are what phase b's prose rows restate. */
  const missing = [];
  for (const suite of ['host-half', 'client-half', 'waterfall', 'custom-audio']) {
    const log = join(EVIDENCE, `r21-harness-${suite}.log`);
    if (!existsSync(log)) {
      missing.push(`_raw/r21-evidence/r21-harness-${suite}.log`);
      continue;
    }
    const match = /(\d+)\/(\d+) checks passed/.exec(readFileSync(log, 'utf8'));
    if (match === null) {
      missing.push(`${suite} (no 'N/N checks passed' line in its log)`);
      continue;
    }
    console.log(`  harness ${suite.padEnd(14)} ${match[1]}/${match[2]} checks`);
  }
  if (missing.length > 0) {
    console.error(`NOTE: phase b needs the harness logs; not readable yet: ${missing.join(', ')}`);
  }
}
