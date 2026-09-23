#!/usr/bin/env node
/**
 * r22 / t1 -- re-anchor every LIVE fingerprint after the rev-22 product change (the bell rings).
 *
 * WHAT THIS IS FOR
 *   The product on disk is rev-22. Every file that PINS the product -- its byte count, its sha256,
 *   its build-stamp literal, the assertion counts the runner tallies -- was written against the
 *   rev-21 artifact and is therefore WRONG the moment lib/client.js changed. This tool is the single
 *   instrument that moves all of them at once, so the transition is one recorded act instead of a
 *   dozen hand edits with no common receipt.
 *
 * WHAT IT IS NOT FOR
 *   It does not decide what the new values SHOULD be, and it does not touch the product. The product
 *   edit (the ring) and the two author suites were done and measured first; the numbers below are
 *   the MEASURED outcome of that work, transcribed from `tools/whats-on-disk`, not chosen here.
 *
 * DISCIPLINE (the r19/t2, r20/t1 and r21/t1 instruments' shape, kept deliberately)
 *   1. Every row DECLARES how many times its anchor must occur, and the count is measured AT THAT
 *      ROW'S TURN -- so two rows that touch overlapping text are ordered, not independent, and the
 *      second one's declaration is what proves the first one landed.
 *   2. ANY mismatch refuses the WHOLE run before a single byte is written. A tool that half-applies
 *      a re-anchor is worse than one that does nothing.
 *   3. Before the first write, the PRE-EDIT bytes of every touched file are archived under
 *      `_raw/r22-evidence/archive/` as `<path with / -> __>.<sha16>.txt`, so the archive's own name
 *      carries the digest of its contents and can be verified without trusting this script.
 *   4. The post-edit bytes and sha256 of every file are PREDICTED in memory, then the file is
 *      written, then the disk is re-read and compared against the prediction. A write that does not
 *      land exactly as predicted is a failure, not a rounding error.
 *   5. `--dry-run` (the default) changes nothing and prints the table.
 *
 * USAGE
 *   node r22-reanchor.mjs              # dry run: measure every row, write nothing
 *   node r22-reanchor.mjs --write      # apply, archive, verify, and record the JSON
 *   node r22-reanchor.mjs --quiet      # dry run, table only (no sample lines)
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = dirname(HERE);
const RAW = join(HERE, '_raw');
const EVIDENCE = join(RAW, 'r22-evidence');
const ARCHIVE = join(EVIDENCE, 'archive');

const ARGV = process.argv.slice(2);
const WRITE = ARGV.includes('--write');
const QUIET = ARGV.includes('--quiet');

/* ------------------------------------------------------------------ the values this round measured */

const NEW_ROUND = 'r22';
const NEW_REV = 'rev-22';
const STAMP = 'rev-22 · the bell rings when you toggle it';
const OLD_STAMP = 'rev-21 · the section badge prints the version id alone';

/** lib/client.js, measured on disk after the ring landed. */
const CLIENT = { bytes: 166986, sha256: '04376143BDD0EBC5AAB9F67910DFFC10997C8CC3D55D08A7FE6383152CB8207E' };
const CLIENT_SHORT = '04376143...';
const OLD_CLIENT = { bytes: 159172, sha256: 'AE3919098CCC11C9E5016AC0B72A12C8A97C0D13DA6009318D4801FCBA37A2D4' };
const OLD_CLIENT_SHORT = 'AE391909...';

/** verify/client-half.test.mjs: 404 -> 421 checks (seventeen new ring checks). */
const HALF = { bytes: 111255, sha256: '75218CE8462FFDABC5590E735FC9BAAB5D096DDFF5CF74105F32B25CBCD026E5' };
const HALF_SHORT = '75218CE8...';
const OLD_HALF = { bytes: 104904, sha256: '5FAA8FEF5C6259875F981F23376BBE282F8E82B9A3F3D2839B0B453165CE50DA' };
const OLD_HALF_SHORT = '5FAA8FEF...';

/** verify/custom-audio.test.mjs: still ONE byte class (the version literal at :267), still 75 checks. */
const AUDIO = { bytes: 20263, sha256: '11DAF28B703C43DCC2F3845A05ECCF278772AD48F6E06F2764705058ED8D6F05' };
const AUDIO_SHORT = '11DAF28B...';
const OLD_AUDIO_SHORT = '49B0493E...';

/** The author-suite tally in the runner: 124 + 421 + 22 + 75. */
const TALLY = '124 / 421 / 22 / 75 = 642';
const OLD_TALLY = '124 / 404 / 22 / 75 = 625';

/** probe-20 grew by group 7 (ten ring checks); its mutant inventory is UNCHANGED at 26. */
const PROBE20_CHECKS = '47/47';
const OLD_PROBE20_CHECKS = '37/37';

/* ------------------------------------------------------------------------------------ the files */

const F = {
  p17: join(HERE, 'probe-17-r7-section.mjs'),
  p18: join(HERE, 'probe-18-r10-sessions.mjs'),
  p19: join(HERE, 'probe-19-r12-select-parity.mjs'),
  p2: join(HERE, 'probe-2-gain-and-resources.mjs'),
  p8: join(HERE, 'probe-8-client-roster-render.mjs'),
  t2: join(HERE, 'r15t2-independent-probe.mjs'),
  t6: join(HERE, 'r15t6-mutation-table.mjs'),
  runner: join(HERE, 'run-r13.ps1'),
};

/** `kind` is 'lit' (literal, all occurrences) or 'rx' (a /g regex over the same text). */
function row(file, kind, find, replace, count, note) {
  return { file, kind, find, replace, count, note: note === undefined ? '' : note };
}

/* ------------------------------------------------------------------------------------- the rows
 * ORDER IS PART OF THE SPECIFICATION: each row's declared count is measured AFTER every earlier row
 * has been applied. Where two rows touch the same text, the narrower one comes first.
 */
const ROWS = [
  /* --- probe-17: the rev-13..rev-21 section probe. It pins the artifact it is anchored to by
   * BYTES and SHA, and asserts the live build stamp's major id, so both move; the `(rev-21)` labels
   * that name the ROUND the badge behaviour shipped in stay exactly as they are. */
  row(F.p17, 'rx', 'what rev-21 claims', 'what rev-22 claims', 2, 'the two anchors that say which artifact they pin'),
  row(F.p17, 'lit', 'CLIENT_BYTES, 159172);', 'CLIENT_BYTES, ' + String(CLIENT.bytes) + ');', 1, 'the pinned byte count'),
  row(F.p17, 'lit', "'" + OLD_CLIENT.sha256 + "'", "'" + CLIENT.sha256 + "'", 1, 'the pinned sha256'),
  row(F.p17, 'lit', '/rev-21/.test(diagnostics.revision)', '/' + NEW_REV + '/.test(diagnostics.revision)', 1, 'the live stamp assertion'),

  /* --- probe-18 / probe-19: each holds the exact stamp literal of the artifact under test. */
  row(F.p18, 'lit', "const EXPECTED_REVISION = '" + OLD_STAMP + "';", "const EXPECTED_REVISION = '" + STAMP + "';", 1, 'the expected stamp'),
  row(F.p19, 'lit', 'bytes: ' + String(OLD_CLIENT.bytes) + ',', 'bytes: ' + String(CLIENT.bytes) + ',', 1, 'the pinned byte count'),
  row(F.p19, 'lit', "sha256: '" + OLD_CLIENT.sha256 + "',", "sha256: '" + CLIENT.sha256 + "',", 1, 'the pinned sha256'),
  row(F.p19, 'lit', "revision: '" + OLD_STAMP + "',", "revision: '" + STAMP + "',", 1, 'the expected stamp'),

  /* --- probe-2 / probe-8: labels and literals that name the CURRENT artifact. */
  row(F.p2, 'lit', 'the five the rev-21 source has', 'the five the rev-22 source has', 1, 'the source the count is claimed of'),
  row(F.p8, 'lit', "'revision stamp names the revision under test (rev-21)', String(diagnostics.revision).includes('rev-21')", "'revision stamp names the revision under test (rev-22)', String(diagnostics.revision).includes('rev-22')", 1, 'the label and the literal together'),

  /* --- r15t2: the failure-path probe. FROZEN bytes/sha/stamp plus five labels. */
  row(F.t2, 'lit', 'The frozen rev-21 bytes this probe is anchored to', 'The frozen rev-22 bytes this probe is anchored to', 1, 'the FROZEN note'),
  row(F.t2, 'lit', "sha256: '" + OLD_CLIENT.sha256 + "',", "sha256: '" + CLIENT.sha256 + "',", 1, 'the pinned sha256'),
  row(F.t2, 'lit', 'bytes: ' + String(OLD_CLIENT.bytes) + ',', 'bytes: ' + String(CLIENT.bytes) + ',', 1, 'the pinned byte count'),
  row(F.t2, 'lit', "revision: '" + OLD_STAMP + "',", "revision: '" + STAMP + "',", 1, 'the expected stamp'),
  row(F.t2, 'lit', 'ships as rev-21"', 'ships as rev-22"', 1, 'the AUTHOR label'),
  row(F.t2, 'lit', 'A1: lib/client.js is the frozen rev-21 byte sequence', 'A1: lib/client.js is the frozen rev-22 byte sequence', 1, 'the A1 assertion name'),
  row(F.t2, 'lit', "'shipped rev-21 bytes'", "'shipped rev-22 bytes'", 1, 'the label the vm is handed'),
  row(F.t2, 'lit', 'shipped rev-21 run:', 'shipped rev-22 run:', 1, 'the banner the runner greps past'),

  /* --- r15t6: the mutation table. Its banner names BOTH the round and the artifact, so that line is
   * rewritten first; the blanket artifact rename then has a smaller, measurable remainder. */
  row(F.t6, 'lit', "'# r21 · the rev-21 mutation table (every declared mutation re-measured on the rev-21 bytes)'", "'# r22 · the rev-22 mutation table (every declared mutation re-measured on the rev-22 bytes)'", 1, 'the markdown banner (round + artifact)'),
  row(F.t6, 'lit', 'const FROZEN = { sha256: \'' + OLD_CLIENT.sha256 + '\', bytes: ' + String(OLD_CLIENT.bytes) + ' };', 'const FROZEN = { sha256: \'' + CLIENT.sha256 + '\', bytes: ' + String(CLIENT.bytes) + ' };', 1, 'the artifact it refuses to run against'),
  row(F.t6, 'rx', 'rev-21', NEW_REV, 7, 'every other artifact reference in this file'),

  /* --- the runner. The WHY block, the history chains, the frozen manifest, section 0/0c, section 7b
   * and the log prefix all carry the previous round's values. */
  row(F.runner, 'lit',
    '# Independent rev-21 full regression run (r21/t1, the SECTION BADGE prints the version id alone and every live fingerprint re-anchored; the r18/t1, r18b/t5, r18c/t7, r19/t2 and r20/t1 logs are preserved).',
    '# Independent rev-22 full regression run (r22/t1, the BELL RINGS when it is toggled and every live fingerprint re-anchored; the r18/t1, r18b/t5, r18c/t7, r19/t2, r20/t1 and r21/t1 logs are preserved).',
    1, 'the file header'),
  row(F.runner, 'lit', 'carries the `r21-` prefix', 'carries the `r22-` prefix', 1, 'the log-prefix note in the header'),
  row(F.runner, 'lit',
    '# WHY THIS RUN EXISTS AT rev-21 -- the SECTION BADGE prints the version ID ALONE. User request:',
    '# WHY THIS RUN EXISTS AT rev-22 -- the BELL RINGS when it is toggled. User request: "这个铃铛也要有动画"\n'
    + '# (the bell beside the caret must animate too, the way the arrow already does). The glyph swings about\n'
    + '# its TOP edge in a damped ring; the @keyframes text is generated from ONE declared frame table, so the\n'
    + '# stylesheet and the console surface cannot disagree about the peak angle; the animation is armed only\n'
    + '# after the first click (`data-ring="true"`), so the first paint is silent; and the node that moves is\n'
    + '# the <svg> glyph, never the 28px button that carries the hover pill. Geometry, paint, the audio path\n'
    + '# and the host half are UNTOUCHED.\n'
    + '#   - BELL_RING_MS is 420 and BELL_RING_DEG is 14, both on the console surface as\n'
    + '#     `sessionIcon.bellRingMs` / `sessionIcon.bellRingDeg`. The ring is deliberately LONGER than the\n'
    + '#     caret\'s 160 ms and is a separate knob: the caret reports one discrete state with a quarter turn,\n'
    + '#     the bell imitates a decaying oscillation, and neither number is derived from the other.\n'
    + '#   - NO reduced-motion override is added for the ring either. That is r20/t1\'s standing decision for\n'
    + '#     the caret (one rule, every environment) applied to the new motion, not a new policy: this\n'
    + '#     micro-interaction still does not distinguish environments, and the trade-off is recorded next to\n'
    + '#     the constant rather than dressed up. `prefers-reduced-motion` still appears ZERO times in the\n'
    + '#     stylesheet, which probe-20 measures rather than assumes.\n'
    + '#   - WHETHER THE RING IS WHAT THE USER WANTED -- and whether it reads as a ring rather than a twitch on\n'
    + '#     their hardware -- IS NOT SOMETHING THIS RUN CAN PROVE. Only the user, looking at the page, can.\n'
    + '#     This run pins the duration, the peak angle, the generated keyframes, the pivot, the untouched\n'
    + '#     button and the arming hook; nothing about perception. probe-13 (the browser probe) still cannot run\n'
    + '#     here -- there is no browser engine in this environment -- so the FRAMES stay unobserved by anything\n'
    + '#     in this repo.\n'
    + '# WHY THE r21 ROUND EXISTED (history, kept verbatim) -- the SECTION BADGE prints the version ID ALONE. User request:',
    1, 'a new WHY block for this round, and the rev-21 block becomes history'),
  row(F.runner, 'lit',
    "#     159172 B / " + OLD_CLIENT_SHORT + " (r21/t1: the badge prints the version id alone; diagnostics.revision\n"
    + "#     is now 'rev-21 · the section badge prints the version id alone' and diagnostics.revisionId is\n"
    + '#     the badge\'s text).',
    "#     159172 B / " + OLD_CLIENT_SHORT + " (r21/t1: the badge prints the version id alone; diagnostics.revision\n"
    + "#     is now 'rev-21 · the section badge prints the version id alone' and diagnostics.revisionId is\n"
    + '#     the badge\'s text) ->\n'
    + '#     ' + String(CLIENT.bytes) + ' B / ' + CLIENT_SHORT + ' (r22/t1: the bell rings when it is toggled -- the ring\n'
    + "#     constants, the generated @keyframes, the arming hook and the re-keyed glyph; diagnostics.revision\n"
    + "#     is now '" + STAMP + "').",
    1, 'the lib/client.js history chain'),
  row(F.runner, 'lit',
    "#     104904 B / " + OLD_HALF_SHORT + " (r21/t1: the badge/id assertions and the version literal --\n"
    + '#     FOUR new checks; the assertion count is 404 now (400 before it)).',
    "#     104904 B / " + OLD_HALF_SHORT + " (r21/t1: the badge/id assertions and the version literal --\n"
    + '#     FOUR new checks; the assertion count is 404 now (400 before it)) ->\n'
    + '#     ' + String(HALF.bytes) + ' B / ' + HALF_SHORT + ' (r22/t1: SEVENTEEN ring checks -- the reported\n'
    + '#     constants, the generated keyframes and their decay, the crown pivot, the untouched button, the\n'
    + '#     silent first paint and the click that arms it; the assertion count is 421 now (404 before it)).',
    1, 'the client-half history chain'),
  row(F.runner, 'lit',
    '#     20263 B / ' + OLD_AUDIO_SHORT + ' (r21/t1: the same literal; the count is still 75).',
    '#     20263 B / ' + OLD_AUDIO_SHORT + ' (r21/t1: the same literal; the count is still 75) ->\n'
    + '#     20263 B / ' + AUDIO_SHORT + ' (r22/t1: the same literal; the count is still 75).',
    1, 'the custom-audio history chain'),
  row(F.runner, 'lit',
    '#   - probe-20-r14-bell-appearance.mjs is ' + OLD_PROBE20_CHECKS + ' checks (was 30) with 26 declared mutants (was 20).',
    '#   - probe-20-r14-bell-appearance.mjs is ' + PROBE20_CHECKS + ' checks (was 37) with 26 declared mutants\n'
    + '#     (was 20). r22/t1 added group 7 (ten ring checks); NO mutant was added or renamed, and --mutate=all\n'
    + '#     re-measures that claim: all twenty-six declared red sets are unchanged.',
    1, 'the probe-20 check count'),
  row(F.runner, 'lit', 'author suites (124 / 404 / 22 / 75 = 625 checks)', 'author suites (' + TALLY + ' checks)', 1, 'the author-suite tally'),
  row(F.runner, 'lit', 're-anchored to the rev-21 baseline', 're-anchored to the rev-22 baseline', 1, 'the frozen-manifest note'),
  row(F.runner, 'lit', 'bytes = ' + String(OLD_CLIENT.bytes) + "; sha = '" + OLD_CLIENT.sha256 + "'", 'bytes = ' + String(CLIENT.bytes) + "; sha = '" + CLIENT.sha256 + "'", 2, 'the manifest row AND the before/after baseline row'),
  row(F.runner, 'lit', 'bytes = ' + String(OLD_HALF.bytes) + ";  sha = '" + OLD_HALF.sha256 + "'", 'bytes = ' + String(HALF.bytes) + ";  sha = '" + HALF.sha256 + "'", 1, 'the client-half manifest row'),
  row(F.runner, 'lit', "bytes = 20263; sha = '" + '49B0493EB031D576BC4AD02D0559B31357A8ADD5D74DD4BC08FBDBEF119DA0CE' + "'", "bytes = 20263; sha = '" + AUDIO.sha256 + "'", 1, 'the custom-audio manifest row'),
  row(F.runner, 'lit', '9 recorded files byte-identical to the rev-21 baseline', '9 recorded files byte-identical to the rev-22 baseline', 1, 'the section-0 heading'),
  row(F.runner, 'lit', 'rev-21 changed lib/client.js and verify/:', 'rev-22 changed lib/client.js and verify/:', 1, 'the section-0c note'),
  row(F.runner, 'lit', '=== 7b. rev-21 mutation table:', '=== 7b. rev-22 mutation table:', 1, 'the section-7b heading'),
  row(F.runner, 'lit', "refuses to run unless lib/client.js is the rev-21'", "refuses to run unless lib/client.js is the rev-22'", 1, 'the 7b explanation'),
  row(F.runner, 'lit', 'byte-identical to the rev-21 manifest', 'byte-identical to the rev-22 manifest', 1, 'the closing summary'),
  row(F.runner, 'lit', 'the rev-20 deletion of both reduced-motion overrides)', 'the rev-20 deletion of both reduced-motion overrides, the rev-22 ring)', 1, 'the section-2e heading'),
  row(F.runner, 'lit', "=== shipped rev-20 run:", "=== shipped rev-22 run:", 1, 'the r15t2 banner quoted in the probes loop'),
  /* The log prefix is the LAST prefix row on purpose: it is a blanket rename over the whole file, so
   * every narrower row above has already been applied and cannot be re-touched by it. */
  row(F.runner, 'rx', "'r21-", "'r22-", 9, 'single-quoted log paths'),
  row(F.runner, 'rx', '"r21-', '"r22-', 7, 'double-quoted log paths'),
];

/* --------------------------------------------------------------------------------- the machinery */

const sha256 = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
const bytesOf = (text) => Buffer.byteLength(text, 'utf8');

function matchesOf(text, row_) {
  if (row_.kind === 'lit') {
    const found = [];
    let from = 0;
    for (;;) {
      const at = text.indexOf(row_.find, from);
      if (at < 0) break;
      found.push(at);
      from = at + row_.find.length;
    }
    return found;
  }
  const found = [];
  const re = new RegExp(row_.find, 'g');
  for (;;) {
    const hit = re.exec(text);
    if (hit === null) break;
    found.push(hit.index);
    if (hit[0].length === 0) re.lastIndex += 1;
  }
  return found;
}

function applyRow(text, row_) {
  if (row_.kind === 'lit') return text.split(row_.find).join(row_.replace);
  return text.replace(new RegExp(row_.find, 'g'), row_.replace);
}

function lineAt(text, index) {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index);
  return text.slice(start, end < 0 ? text.length : end).replace(/\r$/, '').trim();
}

function archiveName(absPath, text) {
  const rel = absPath.slice(PLUGIN.length + 1).split('\\').join('/');
  return rel.split('/').join('__') + '.' + sha256(text).slice(0, 16) + '.txt';
}

/* ------------------------------------------------------------------------------- phase 1: measure */

const byFile = new Map();
for (const row_ of ROWS) {
  if (!byFile.has(row_.file)) byFile.set(row_.file, []);
  byFile.get(row_.file).push(row_);
}
for (const file of byFile.keys()) {
  if (!existsSync(file)) {
    console.error(`REFUSING: ${file} does not exist.`);
    process.exit(1);
  }
}

const mismatches = [];
const plan = [];
for (const [file, rows] of byFile) {
  let text = readFileSync(file, 'utf8');
  const before = { bytes: bytesOf(text), sha256: sha256(text) };
  const applied = [];
  for (const row_ of rows) {
    const found = matchesOf(text, row_);
    if (found.length !== row_.count) {
      mismatches.push({ file, note: row_.note, declared: row_.count, observed: found.length, find: row_.find, samples: found.slice(0, 2).map((at) => lineAt(text, at)) });
      continue;
    }
    const sample = found.length > 0 ? lineAt(text, found[0]) : '';
    text = applyRow(text, row_);
    applied.push({ note: row_.note, declared: row_.count, observed: found.length, sample });
  }
  plan.push({ file, before, after: { bytes: bytesOf(text), sha256: sha256(text) }, text, applied });
}

const norm = (value) => (value.length > 118 ? value.slice(0, 115) + '...' : value);

for (const entry of plan) {
  console.log(`\n${entry.file.slice(PLUGIN.length + 1)}`);
  console.log(`  before ${String(entry.before.bytes).padStart(7)} B  ${entry.before.sha256.slice(0, 16)}`);
  console.log(`  after  ${String(entry.after.bytes).padStart(7)} B  ${entry.after.sha256.slice(0, 16)}  (${entry.applied.length} row(s))`);
  for (const applied of entry.applied) {
    console.log(`    [${String(applied.observed).padStart(2)}/${String(applied.declared).padStart(2)}] ${applied.note}`);
    if (!QUIET && applied.sample.length > 0) console.log(`          ${norm(applied.sample)}`);
  }
}

if (mismatches.length > 0) {
  console.log('\n############ REFUSING: declared and observed counts disagree. Nothing was written.');
  for (const bad of mismatches) {
    console.log(`  ${bad.file.slice(PLUGIN.length + 1)}: declared ${bad.declared}, observed ${bad.observed} -- ${bad.note}`);
    console.log(`    find: ${norm(String(bad.find))}`);
    for (const sample of bad.samples) console.log(`    here: ${norm(sample)}`);
  }
  process.exit(1);
}

const totalRows = ROWS.length;
const totalSites = plan.reduce((sum, entry) => sum + entry.applied.reduce((inner, applied) => inner + applied.observed, 0), 0);
console.log(`\n############ all ${totalRows} declared rows match the disk exactly (${totalSites} sites, ${plan.length} files).`);

if (!WRITE) {
  console.log('############ dry run -- nothing was written. Re-run with --write to apply.');
  process.exit(0);
}

/* ------------------------------------------------------------------------------- phase 2: write */

mkdirSync(ARCHIVE, { recursive: true });
const record = { tool: 'r22-reanchor.mjs', round: NEW_ROUND, revision: NEW_REV, files: [], archives: [] };

for (const entry of plan) {
  const original = readFileSync(entry.file, 'utf8');
  const name = archiveName(entry.file, original);
  const target = join(ARCHIVE, name);
  if (!existsSync(target)) copyFileSync(entry.file, target);
  const archived = readFileSync(target, 'utf8');
  const archiveOk = sha256(archived) === sha256(original) && name.includes(sha256(original).slice(0, 16));
  if (!archiveOk) {
    console.error(`REFUSING: the archive copy of ${entry.file} does not verify (${name}).`);
    process.exit(1);
  }
  writeFileSync(entry.file, entry.text, 'utf8');
  const onDisk = readFileSync(entry.file, 'utf8');
  const landed = { bytes: bytesOf(onDisk), sha256: sha256(onDisk) };
  if (landed.bytes !== entry.after.bytes || landed.sha256 !== entry.after.sha256) {
    console.error(`FAILED: ${entry.file} did not land as predicted (${landed.bytes} B / ${landed.sha256}).`);
    process.exit(1);
  }
  record.files.push({ path: entry.file.slice(PLUGIN.length + 1), before: entry.before, after: entry.after, rows: entry.applied.length, sites: entry.applied.reduce((sum, applied) => sum + applied.observed, 0) });
  record.archives.push({ path: entry.file.slice(PLUGIN.length + 1), archive: name, preEdit: entry.before });
  console.log(`wrote ${entry.file.slice(PLUGIN.length + 1)} -- ${landed.bytes} B / ${landed.sha256.slice(0, 16)} (archive ${name})`);
}

record.rows = totalRows;
record.sites = totalSites;
const recordPath = join(EVIDENCE, 'r22-t1-reanchor.json');
writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n', 'utf8');
console.log(`\n############ ${totalRows} rows / ${totalSites} sites applied across ${plan.length} files; record at ${recordPath.slice(PLUGIN.length + 1)}`);
