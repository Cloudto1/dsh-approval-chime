#!/usr/bin/env node
/**
 * r24 / t1 -- re-anchor every LIVE fingerprint after the rev-24 product change (the bell stops moving
 * and the MUTE is drawn).
 *
 * Same instrument as r19/t2, r20/t1, r21/t1, r22/t1 and r23/t1: every row declares the number of
 * occurrences it expects, a single mismatch refuses the WHOLE run before a byte is written, the
 * pre-edit bytes are archived by content hash, and the post-edit bytes+sha256 are predicted and then
 * verified against the disk.
 *
 * WHAT THIS ROUND CHANGED IN THE INSTRUMENT
 *   The r23 tool carried a `span` row holding a verbatim copy of probe-20's group 7, because that
 *   group was a block rather than a set of scattered literals. That copy is GONE here, and its absence
 *   is the point: group 7 was rewritten by hand this round (a four-state cascade simulation instead of
 *   the tilt's rule-by-rule reads), so a second verbatim copy inside a re-anchor tool would be a
 *   THIRD place for the same text to live -- and the tool would then be re-writing a file that had
 *   already been written, which is how a "re-anchor" quietly reverts an edit. This tool now touches
 *   ONLY fingerprints: bytes, sha256, revision stamps, round tokens, check counts and prose that names
 *   them. If a row here ever needs to carry behavior, the behavior belongs in the file instead.
 *
 * THE ONE ROW THAT IS NOT A FINGERPRINT, and why it is here anyway: the runner's WHY block is prose
 * that STATES the round, and every previous round replaced it in place while keeping the retired block
 * as history. A stale WHY block is not a stale hash -- it is a false claim printed by the canonical run
 * -- so it moves in the same atomic batch as the hashes it describes.
 *
 * DISCIPLINE
 *   1. every row declares its occurrence count, measured AT THAT ROW'S TURN;
 *   2. any mismatch refuses the whole run before a byte is written;
 *   3. pre-edit bytes are archived as `<path with / -> __>.<sha16>.txt` under `_raw/r24-evidence/archive/`;
 *   4. post-edit bytes+sha256 are predicted, then the disk is re-read and compared;
 *   5. `--dry-run` is the default.
 *
 * USAGE
 *   node r24-reanchor.mjs [--quiet]            # dry run
 *   node r24-reanchor.mjs --write              # apply, archive, verify, record
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = dirname(HERE);
const EVIDENCE = join(HERE, '_raw', 'r24-evidence');
const ARCHIVE = join(EVIDENCE, 'archive');
const WRITE = process.argv.includes('--write');
const QUIET = process.argv.includes('--quiet');

const NEW_ROUND = 'r24';
const NEW_REV = 'rev-24';
const STAMP = 'rev-24 · muting draws the slash instead of moving the bell';
const OLD_REV = 'rev-23';
const OLD_STAMP = 'rev-23 · the bell tilts once and settles instead of rattling';
const ROUND_NOTE = 'the tilt is DELETED and the bell stops moving; the MUTE is drawn instead';

const CLIENT = { bytes: 179451, sha256: '0BDAC98C5F9AB06F687A9856238EA7C7302A5E7F6CDEDD9CBBA6CDEBCEA49958' };
const OLD_CLIENT = { bytes: 168920, sha256: 'DA25EB01F21156A294DDAA5DD098BE97129101434A6E03EE106AC442F6B8263E', short: 'DA25EB01...' };
const CLIENT_SHORT = '0BDAC98C...';
const HALF = { bytes: 121975, sha256: '1BCC6FAF5C40E64D9023E7EF19B97A548EA422CB9ADD4C943068400706916895' };
const OLD_HALF = { bytes: 112635, sha256: '9BA8B5776B968D0C3346A97F12AB2796C36DD0C00BA61FA8DE84C01FD2C1C78C', short: '9BA8B577...' };
const HALF_SHORT = '1BCC6FAF...';
const AUDIO = { bytes: 20263, sha256: 'D2DE24C11CA2699738E975476C9659976FC44C201C9F0174567BCE1551F4CD8C' };
const OLD_AUDIO = { sha256: '2D712A6DE50DAA755D5C70A656BD42CAEB35CA48E36D4FBA744B63F6FA8268CF', short: '2D712A6D...' };
const OLD_AUDIO_SHORT = OLD_AUDIO.short;
const AUDIO_SHORT = 'D2DE24C1...';
const TALLY = '124 / 442 / 22 / 75 = 663';
const OLD_TALLY = '124 / 424 / 22 / 75 = 645';
const PROBE20 = '58/58';
const OLD_PROBE20 = '49/49';

const F = {
  p17: join(HERE, 'probe-17-r7-section.mjs'),
  p18: join(HERE, 'probe-18-r10-sessions.mjs'),
  p19: join(HERE, 'probe-19-r12-select-parity.mjs'),
  p2: join(HERE, 'probe-2-gain-and-resources.mjs'),
  p8: join(HERE, 'probe-8-client-roster-render.mjs'),
  p20: join(HERE, 'probe-20-r14-bell-appearance.mjs'),
  t2: join(HERE, 'r15t2-independent-probe.mjs'),
  t6: join(HERE, 'r15t6-mutation-table.mjs'),
  runner: join(HERE, 'run-r13.ps1'),
};

const row = (file, kind, find, replace, count, note) => ({ file, kind, find, replace, count, note: note === undefined ? '' : note });
/** A `span` row: replace everything between two unique anchors (each must occur exactly once, in order). */
const spanRow = (file, find, spanEnd, replace, count, note) => ({ file, kind: 'span', find, spanEnd, replace, count, note: note === undefined ? '' : note });

/** The runner's rev-24 WHY block, which replaces the rev-23 one in place (that block becomes history). */
const RUNNER_WHY = `# WHY THIS RUN EXISTS AT rev-24 -- THE BELL DOES NOT MOVE; THE MUTE IS DRAWN. User request:
# "不要晃动，静音时把斜杠重左上拉到右下的动画", extended over four reader rounds ("关闭静音的时候斜杠从左上
# 到右下动画两个动画时长一样" / "斜杠的图层是在铃铛上面的" / "蓝色的部分也弄个逐渐变暗到消失的动画", plus the
# duration tuning recorded at the constant). rev-23's tilt is DELETED, not toned down: the glyph and the
# 28px button carry no transform and no animation in ANY state. What moves is the slash's STROKE -- drawn
# from its top-left end to its bottom-right end by animating \`stroke-dashoffset\` from the diagonal's own
# length (15.27) to 0 -- and the blue fill, on the SAME 240 ms clock in both directions.
#   - the console surface reports \`sessionIcon.bellMuteMs\` (240) and \`sessionIcon.bellSlashLen\` (15.27);
#     the attribute that arms the animation is \`data-draw\`, the glyph key is unchanged ("glyph<N>"), and
#     the arming rule is still "not before the first click", so the first paint is silent.
#   - THE RESTING AUDIBLE STATE DRAWS NOTHING, and it does so with \`opacity\` rather than a dash offset.
#     That is not a preference: a single-value \`stroke-dasharray\` repeats every 2*LEN, so LEN parks a
#     round cap on the far end (the DOT the user reported) and LEN+margin drags the next repetition in at
#     the near end (the STUB LINE they reported next). Both were shipped, and both were seen.
#   - PAINT ORDER IS THE PATHS ARRAY. SVG has no z-index, so the slash is pushed BEFORE the bell and its
#     clapper; the user had reported the stroke sitting ON TOP of the bell.
#   - NO reduced-motion override was added for the draw either, and \`prefers-reduced-motion\` still appears
#     ZERO times in the stylesheet -- measured by probe-20, not assumed.
#   - THE DURATION IS A READER TUNING, NOT A MEASUREMENT: 240 -> 420 -> 420+the fill -> 300 -> (360 for
#     one round, set from a misread typo) -> 240. The whole history sits next to the constant, including
#     the 360 that was never really on trial. WHETHER 240 READS RIGHT IS NOT SOMETHING THIS RUN CAN
#     PROVE -- only the user, looking at the page, can. probe-13 (the browser probe) still cannot run
#     here, so the FRAMES stay unobserved by anything in this repo.
`;

const ROWS = [
  /* --- probe-17 / probe-18 / probe-19: the artifact they pin, and the stamp they expect. */
  row(F.p17, 'lit', 'lib/client.js byte count is what rev-23 claims', 'lib/client.js byte count is what rev-24 claims', 1, 'probe-17 anchor that names the artifact'),
  row(F.p17, 'lit', 'CLIENT_BYTES, ' + String(OLD_CLIENT.bytes) + ');', 'CLIENT_BYTES, ' + String(CLIENT.bytes) + ');', 1, 'probe-17 pinned byte count'),
  row(F.p17, 'lit', 'lib/client.js sha256 is what rev-23 claims', 'lib/client.js sha256 is what rev-24 claims', 1, 'probe-17 anchor that names the artifact'),
  row(F.p17, 'lit', "'" + OLD_CLIENT.sha256 + "'", "'" + CLIENT.sha256 + "'", 1, 'probe-17 pinned sha256'),
  row(F.p17, 'lit', "'the revision stamp is the rev-21 one', /rev-23/.test(diagnostics.revision)", "'the revision stamp is the rev-24 one', /rev-24/.test(diagnostics.revision)", 1, 'probe-17 live stamp assertion (its NAME had been stale since rev-22)'),
  row(F.p18, 'lit', "const EXPECTED_REVISION = '" + OLD_STAMP + "';", "const EXPECTED_REVISION = '" + STAMP + "';", 1, 'probe-18 expected stamp'),
  row(F.p19, 'lit', 'bytes: ' + String(OLD_CLIENT.bytes) + ',', 'bytes: ' + String(CLIENT.bytes) + ',', 1, 'probe-19 pinned byte count'),
  row(F.p19, 'lit', "sha256: '" + OLD_CLIENT.sha256 + "',", "sha256: '" + CLIENT.sha256 + "',", 1, 'probe-19 pinned sha256'),
  row(F.p19, 'lit', "revision: '" + OLD_STAMP + "',", "revision: '" + STAMP + "',", 1, 'probe-19 expected stamp'),

  /* --- probe-2 / probe-8: labels that name the current artifact. */
  row(F.p2, 'lit', 'the five the rev-23 source has', 'the five the rev-24 source has', 1, 'the source the fetch count is claimed of'),
  row(F.p8, 'lit', "'revision stamp names the revision under test (rev-23)', String(diagnostics.revision).includes('rev-23')", "'revision stamp names the revision under test (rev-24)', String(diagnostics.revision).includes('rev-24')", 1, 'the label and the literal together'),

  /* --- r15t2 / r15t6: the failure-path probe and the mutation table. */
  row(F.t2, 'lit', 'The frozen rev-23 bytes this probe is anchored to', 'The frozen rev-24 bytes this probe is anchored to', 1, 'the FROZEN note'),
  row(F.t2, 'lit', "sha256: '" + OLD_CLIENT.sha256 + "',", "sha256: '" + CLIENT.sha256 + "',", 1, 'the pinned sha256'),
  row(F.t2, 'lit', 'bytes: ' + String(OLD_CLIENT.bytes) + ',', 'bytes: ' + String(CLIENT.bytes) + ',', 1, 'the pinned byte count'),
  row(F.t2, 'lit', "revision: '" + OLD_STAMP + "',", "revision: '" + STAMP + "',", 1, 'the expected stamp'),
  row(F.t2, 'lit', 'ships as rev-23"', 'ships as rev-24"', 1, 'the AUTHOR label'),
  row(F.t2, 'lit', 'A1: lib/client.js is the frozen rev-23 byte sequence', 'A1: lib/client.js is the frozen rev-24 byte sequence', 1, 'the A1 assertion name'),
  row(F.t2, 'lit', "'shipped rev-23 bytes'", "'shipped rev-24 bytes'", 1, 'the label the vm is handed'),
  row(F.t2, 'lit', 'shipped rev-23 run:', 'shipped rev-24 run:', 1, 'the banner the runner greps past'),
  row(F.t6, 'lit', "'# r23 · the rev-23 mutation table (every declared mutation re-measured on the rev-23 bytes)'", "'# r24 · the rev-24 mutation table (every declared mutation re-measured on the rev-24 bytes)'", 1, 'the markdown banner (round + artifact)'),
  row(F.t6, 'lit', "const FROZEN = { sha256: '" + OLD_CLIENT.sha256 + "', bytes: " + String(OLD_CLIENT.bytes) + ' };', "const FROZEN = { sha256: '" + CLIENT.sha256 + "', bytes: " + String(CLIENT.bytes) + ' };', 1, 'the artifact it refuses to run against'),
  row(F.t6, 'rx', 'rev-23', NEW_REV, 7, 'every other artifact reference in this file'),
  row(F.t6, 'rx', 'r23-evidence', 'r24-evidence', 7, 'the evidence DIRECTORY (round token, not revision token)'),
  row(F.t6, 'rx', 'r23-mut-', 'r24-mut-', 4, 'the per-mutation log names'),
  row(F.t6, 'rx', 'r23-t1-mutation-table', 'r24-t1-mutation-table', 2, 'the JSON and Markdown table names'),
  row(F.t6, 'lit', 'r23 mutation table: rows=', 'r24 mutation table: rows=', 1, 'the console summary line'),
  row(F.t6, 'lit', 'by r21 / t1, by r22 / t1 and now by r23 / t1 --', 'by r21 / t1, by r22 / t1, by r23 / t1 and now by r24 / t1 --', 1, 'the header re-anchor history'),

  /* --- the runner: header, WHY block, history chains, manifest, section 0/0c, 7b, tally, log prefix. */
  row(F.runner, 'lit',
    '# Independent rev-23 full regression run (r23/t1, the BELL TILTS ONCE instead of rattling and every live fingerprint re-anchored; the r18/t1, r18b/t5, r18c/t7, r19/t2, r20/t1, r21/t1 and r22/t1 logs are preserved).',
    '# Independent rev-24 full regression run (r24/t1, ' + ROUND_NOTE + ' and every live fingerprint re-anchored; the r18/t1, r18b/t5, r18c/t7, r19/t2, r20/t1, r21/t1 and r23/t1 logs are preserved).',
    1, 'the file header'),
  row(F.runner, 'lit', 'carries the `r23-` prefix', 'carries the `r24-` prefix', 1, 'the log-prefix note in the header'),
  spanRow(F.runner, '# WHY THIS RUN EXISTS AT rev-23 -- the BELL TILTS ONCE AND SETTLES. User request: "再换一个要有高级感"',
    '# WHY THE r22 ROUND EXISTED (history, kept verbatim)', RUNNER_WHY, 1, 'a new WHY block for this round, and the rev-23 block becomes history'),
  row(F.runner, 'lit',
    '#     168920 B / ' + OLD_CLIENT.short + ' (r23/t1: that rattle is replaced by ONE lean past rest and a\n'
    + '#     settle -- a 9 deg peak, a scale track and a long-tail ease-out; diagnostics.revision is now\n'
    + "#     '" + OLD_STAMP + "').",
    '#     168920 B / ' + OLD_CLIENT.short + ' (r23/t1: that rattle is replaced by ONE lean past rest and a\n'
    + '#     settle -- a 9 deg peak, a scale track and a long-tail ease-out) ->\n'
    + '#     ' + String(CLIENT.bytes) + ' B / ' + CLIENT_SHORT + ' (r24/t1: the tilt is deleted outright and the bell stops moving;\n'
    + '#     the MUTE is drawn instead -- the slash\'s stroke travels the diagonal while the blue fill dims on\n'
    + '#     the same 240 ms clock, and the stroke is pushed BEFORE the bell so the silhouette paints over it;\n'
    + "#     diagnostics.revision is now '" + STAMP + "').",
    1, 'the lib/client.js history chain'),
  row(F.runner, 'lit',
    '#     112635 B / ' + OLD_HALF.short + ' (r23/t1: the section is rewritten for the tilt -- twenty\n'
    + '#     checks, two of which measure the SHAPE the user asked for: the ONE zero crossing and the bound on\n'
    + '#     the swell, plus a refusal of `ease-in-out` by name; the assertion count is 424 now).',
    '#     112635 B / ' + OLD_HALF.short + ' (r23/t1: the section is rewritten for the tilt -- twenty\n'
    + '#     checks, two of which measure the SHAPE the user asked for: the ONE zero crossing and the bound on\n'
    + '#     the swell, plus a refusal of `ease-in-out` by name; the assertion count was 424 then) ->\n'
    + '#     ' + String(HALF.bytes) + ' B / ' + HALF_SHORT + ' (r24/t1: the section is rewritten AGAIN -- twenty-two checks about the\n'
    + '#     draw, the sweep, the blue fill, the paint order and the ABSENCE of every tilt rule, because "the\n'
    + '#     bell does not move" is what a later edit breaks by re-adding a keyframe nobody asked for; the\n'
    + '#     assertion count is 442 now).',
    1, 'the client-half history chain'),
  row(F.runner, 'lit',
    '#     20263 B / ' + OLD_AUDIO_SHORT + ' (r23/t1: the same literal; the count is still 75).',
    '#     20263 B / ' + OLD_AUDIO_SHORT + ' (r23/t1: the same literal; the count is still 75) ->\n'
    + '#     20263 B / ' + AUDIO_SHORT + ' (r24/t1: the same literal; the count is still 75).',
    1, 'the custom-audio history chain'),
  row(F.runner, 'lit',
    '#   - probe-20-r14-bell-appearance.mjs is ' + OLD_PROBE20 + ' checks (was 47) with 26 declared mutants (was 20).\n'
    + '#     r22/t1 added group 7 (ten ring checks) and r23/t1 rewrote it for the tilt (twelve checks, two of\n'
    + '#     them the shape of the motion); NO mutant was added or renamed by either round, and --mutate=all\n'
    + '#     re-measures that claim: all twenty-six declared red sets are unchanged.',
    '#   - probe-20-r14-bell-appearance.mjs is ' + PROBE20 + ' checks (was ' + OLD_PROBE20.slice(0, 2) + ') with 26 declared mutants (was 20).\n'
    + '#     r22/t1 added group 7 (ten ring checks), r23/t1 rewrote it for the tilt (twelve checks) and r24/t1\n'
    + '#     rewrote it AGAIN as a four-state CASCADE SIMULATION (twenty checks: the winner among competing\n'
    + '#     rules in each of audible/muted x clicked/not-yet-clicked, the opacity that leaves no dot, the\n'
    + '#     paint order of the rendered glyph, and the absence of every tilt rule); NO mutant was added or\n'
    + '#     renamed by any round, and --mutate=all re-measures that claim: all twenty-six declared red sets\n'
    + '#     are unchanged.',
    1, 'the probe-20 check count'),
  row(F.runner, 'lit', 'author suites (' + OLD_TALLY + ' checks)', 'author suites (' + TALLY + ' checks)', 1, 'the author-suite tally'),
  row(F.runner, 'lit', 're-anchored to the rev-23 baseline', 're-anchored to the rev-24 baseline', 1, 'the frozen-manifest note'),
  row(F.runner, 'lit', 'bytes = ' + String(OLD_CLIENT.bytes) + "; sha = '" + OLD_CLIENT.sha256 + "'", 'bytes = ' + String(CLIENT.bytes) + "; sha = '" + CLIENT.sha256 + "'", 2, 'the manifest row AND the section-0c baseline row'),
  row(F.runner, 'lit', 'bytes = ' + String(OLD_HALF.bytes) + ";  sha = '" + OLD_HALF.sha256 + "'", 'bytes = ' + String(HALF.bytes) + ";  sha = '" + HALF.sha256 + "'", 1, 'the client-half manifest row'),
  row(F.runner, 'lit', "bytes = 20263; sha = '" + OLD_AUDIO.sha256 + "'", "bytes = 20263; sha = '" + AUDIO.sha256 + "'", 1, 'the custom-audio manifest row'),
  row(F.runner, 'lit', '9 recorded files byte-identical to the rev-23 baseline', '9 recorded files byte-identical to the rev-24 baseline', 1, 'the section-0 heading'),
  row(F.runner, 'lit', 'rev-23 changed lib/client.js and verify/:', 'rev-24 changed lib/client.js and verify/:', 1, 'the section-0c note'),
  row(F.runner, 'lit', '=== 7b. rev-23 mutation table:', '=== 7b. rev-24 mutation table:', 1, 'the section-7b heading'),
  row(F.runner, 'lit', "refuses to run unless lib/client.js is the rev-23'", "refuses to run unless lib/client.js is the rev-24'", 1, 'the 7b explanation'),
  row(F.runner, 'lit', 'writes _raw/r23-evidence/r23-t1-mutation-table.json/.md', 'writes _raw/r24-evidence/r24-t1-mutation-table.json/.md', 1, 'the 7b output path prose'),
  row(F.runner, 'lit', 'byte-identical to the rev-23 manifest', 'byte-identical to the rev-24 manifest', 1, 'the closing summary'),
  row(F.runner, 'lit', 'the rev-20 deletion of both reduced-motion overrides, the rev-22 ring, the rev-23 tilt)', 'the rev-20 deletion of both reduced-motion overrides, the rev-22 ring, the rev-23 tilt, the rev-24 draw)', 1, 'the section-2e heading'),
  row(F.runner, 'lit', '=== shipped rev-23 run:', '=== shipped rev-24 run:', 1, 'the r15t2 banner quoted in the probes loop'),
  row(F.runner, 'rx', "'r23-", "'r24-", 9, 'single-quoted log paths'),
  row(F.runner, 'rx', '"r23-', '"r24-', 7, 'double-quoted log paths'),
];

/* --------------------------------------------------------------------------------- the machinery */

const sha256 = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
const bytesOf = (text) => Buffer.byteLength(text, 'utf8');

function matchesOf(text, entry) {
  if (entry.kind === 'lit') {
    const found = [];
    let from = 0;
    for (;;) {
      const at = text.indexOf(entry.find, from);
      if (at < 0) break;
      found.push(at);
      from = at + entry.find.length;
    }
    return found;
  }
  if (entry.kind === 'rx') {
    const found = [];
    const re = new RegExp(entry.find, 'g');
    for (;;) {
      const hit = re.exec(text);
      if (hit === null) break;
      found.push(hit.index);
      if (hit[0].length === 0) re.lastIndex += 1;
    }
    return found;
  }
  // span: the two anchors must each occur exactly once, and in order.
  const starts = matchesOf(text, { kind: 'lit', find: entry.find });
  const ends = matchesOf(text, { kind: 'lit', find: entry.spanEnd });
  if (starts.length === 1 && ends.length === 1 && ends[0] > starts[0]) return [starts[0]];
  return [];
}

function applyRow(text, entry) {
  if (entry.kind === 'lit') return text.split(entry.find).join(entry.replace);
  if (entry.kind === 'rx') return text.replace(new RegExp(entry.find, 'g'), entry.replace);
  const start = text.indexOf(entry.find);
  const end = text.indexOf(entry.spanEnd, start + entry.find.length);
  return text.slice(0, start) + entry.replace + text.slice(end);
}

const lineAt = (text, index) => {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index);
  return text.slice(start, end < 0 ? text.length : end).replace(/\r$/, '').trim();
};
const norm = (value) => (value.length > 118 ? value.slice(0, 115) + '...' : value);

const byFile = new Map();
for (const entry of ROWS) {
  if (!byFile.has(entry.file)) byFile.set(entry.file, []);
  byFile.get(entry.file).push(entry);
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
  for (const entry of rows) {
    const found = matchesOf(text, entry);
    if (found.length !== entry.count) {
      mismatches.push({ file, note: entry.note, declared: entry.count, observed: found.length, find: String(entry.find), samples: found.slice(0, 2).map((at) => lineAt(text, at)) });
      continue;
    }
    const sample = found.length > 0 ? lineAt(text, found[0]) : '';
    text = applyRow(text, entry);
    applied.push({ note: entry.note, declared: entry.count, observed: found.length, sample });
  }
  plan.push({ file, before, after: { bytes: bytesOf(text), sha256: sha256(text) }, text, applied });
}

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
    console.log(`    find: ${norm(bad.find)}`);
    for (const sample of bad.samples) console.log(`    here: ${norm(sample)}`);
  }
  process.exit(1);
}

const totalSites = plan.reduce((sum, entry) => sum + entry.applied.reduce((inner, applied) => inner + applied.observed, 0), 0);
console.log(`\n############ all ${ROWS.length} declared rows match the disk exactly (${totalSites} sites, ${plan.length} files).`);
if (!WRITE) {
  console.log('############ dry run -- nothing was written. Re-run with --write to apply.');
  process.exit(0);
}

mkdirSync(ARCHIVE, { recursive: true });
const record = { tool: 'r24-reanchor.mjs', round: NEW_ROUND, revision: NEW_REV, files: [], archives: [] };
for (const entry of plan) {
  const original = readFileSync(entry.file, 'utf8');
  const name = entry.file.slice(PLUGIN.length + 1).split('\\').join('/').split('/').join('__') + '.' + sha256(original).slice(0, 16) + '.txt';
  const target = join(ARCHIVE, name);
  if (!existsSync(target)) copyFileSync(entry.file, target);
  const archived = readFileSync(target, 'utf8');
  if (sha256(archived) !== sha256(original) || !name.includes(sha256(original).slice(0, 16))) {
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
  record.files.push({ path: entry.file.slice(PLUGIN.length + 1), before: entry.before, after: entry.after, rows: entry.applied.length });
  record.archives.push({ path: entry.file.slice(PLUGIN.length + 1), archive: name, preEdit: entry.before });
  console.log(`wrote ${entry.file.slice(PLUGIN.length + 1)} -- ${landed.bytes} B / ${landed.sha256.slice(0, 16)} (archive ${name})`);
}
record.rows = ROWS.length;
record.sites = totalSites;
writeFileSync(join(EVIDENCE, 'r24-t1-reanchor.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
console.log(`\n############ ${ROWS.length} rows / ${totalSites} sites applied across ${plan.length} files`);
