#!/usr/bin/env node
/**
 * r23 / t1 -- re-anchor every LIVE fingerprint after the rev-23 product change (the bell TILTS).
 *
 * Same instrument as r22/t1, with one addition that this round earned the hard way: a `span` row kind
 * that replaces everything between two unique anchors. `probe-20`'s independent group 7 is a block of
 * checks rather than a set of scattered literals, and reproducing a hundred lines of it verbatim as an
 * `old_string` would have been a transcription exercise with no verification value. A span row declares
 * BOTH anchors (each must occur exactly once) instead, and the post-edit self-check still runs.
 *
 * The other lesson is in the row list itself. r22/t1 relocated the REVISION tokens and missed the
 * ROUND tokens, so `r15t6` kept writing into `_raw/r21-evidence/` and one of its runs overwrote the r21
 * canonical mutation logs. The rows below therefore carry `rev-22 -> rev-23` AND `r22 -> r23` for every
 * file that has both, and a file is not finished until a grep for the old round token comes back empty.
 *
 * DISCIPLINE (unchanged from r19/t2, r20/t1, r21/t1 and r22/t1)
 *   1. every row declares its occurrence count, measured AT THAT ROW'S TURN;
 *   2. any mismatch refuses the whole run before a byte is written;
 *   3. pre-edit bytes are archived as `<path with / -> __>.<sha16>.txt` under `_raw/r23-evidence/archive/`;
 *   4. post-edit bytes+sha256 are predicted, then the disk is re-read and compared;
 *   5. `--dry-run` is the default.
 *
 * USAGE
 *   node r23-reanchor.mjs [--quiet]            # dry run
 *   node r23-reanchor.mjs --write              # apply, archive, verify, record
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = dirname(HERE);
const EVIDENCE = join(HERE, '_raw', 'r23-evidence');
const ARCHIVE = join(EVIDENCE, 'archive');
const WRITE = process.argv.includes('--write');
const QUIET = process.argv.includes('--quiet');

const NEW_ROUND = 'r23';
const NEW_REV = 'rev-23';
const STAMP = 'rev-23 · the bell tilts once and settles instead of rattling';
const OLD_REV = 'rev-22';
const OLD_STAMP = 'rev-22 · the bell rings when you toggle it';

const CLIENT = { bytes: 168920, sha256: 'DA25EB01F21156A294DDAA5DD098BE97129101434A6E03EE106AC442F6B8263E' };
const OLD_CLIENT = { bytes: 166986, sha256: '04376143BDD0EBC5AAB9F67910DFFC10997C8CC3D55D08A7FE6383152CB8207E', short: '04376143...' };
const CLIENT_SHORT = 'DA25EB01...';
const HALF = { bytes: 112635, sha256: '9BA8B5776B968D0C3346A97F12AB2796C36DD0C00BA61FA8DE84C01FD2C1C78C' };
const OLD_HALF = { bytes: 111255, sha256: '75218CE8462FFDABC5590E735FC9BAAB5D096DDFF5CF74105F32B25CBCD026E5', short: '75218CE8...' };
const HALF_SHORT = '9BA8B577...';
const AUDIO = { bytes: 20263, sha256: '2D712A6DE50DAA755D5C70A656BD42CAEB35CA48E36D4FBA744B63F6FA8268CF' };
const OLD_AUDIO_SHORT = '11DAF28B...';
const AUDIO_SHORT = '2D712A6D...';
const TALLY = '124 / 424 / 22 / 75 = 645';
const OLD_TALLY = '124 / 421 / 22 / 75 = 642';
const PROBE20 = '48/48';
const OLD_PROBE20 = '47/47';

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

/** probe-20's independent group 7, rewritten for the tilt. Replaces the span between the two anchors. */
const PROBE20_GROUP7 = `  group('7 - rev-23: the bell tilts once about its crown and settles');
  const bellTiltMs = sessionIcon.bellTiltMs;
  const bellTiltDeg = sessionIcon.bellTiltDeg;
  const tiltArmed = resolveProperty(rules, ['.dacBell[data-tilt="true"] svg'], 'animation');
  const bellGlyphOriginRev23 = resolveProperty(rules, ['.dacBell svg'], 'transform-origin');
  const caretGlyphOriginRev23 = resolveProperty(rules, ['.dacCaret svg'], 'transform-origin');
  const bellButtonTransformRev23 = resolveProperty(rules, ['.dacBell'], 'transform');
  const bellButtonAnimationRev23 = resolveProperty(rules, ['.dacBell'], 'animation');
  const tiltSteps = rules.filter((rule) => rule.conditions.some((condition) => condition.startsWith('@keyframes dacBellTilt')));
  const tiltTransforms = tiltSteps.map((rule) => String(rule.declarations.get('transform') ?? ''));
  const tiltAngles = tiltTransforms.map((value) => {
    const hit = value.match(/rotate\\((-?[\\d.]+)deg\\)/);
    return hit === null ? NaN : Number(hit[1]);
  });
  const tiltScales = tiltTransforms.map((value) => {
    const hit = value.match(/scale\\((-?[\\d.]+)\\)/);
    return hit === null ? NaN : Number(hit[1]);
  });
  const bellRulesUnderReducedMotionRev23 = reduceMotionRules.filter((rule) => rule.selectors.some((selector) => selector.includes('.dacBell')));
  const bellButtonOfRev23 = (tree) => {
    let found = null;
    walk(tree, (node) => {
      if (found === null && node.props && node.props.className === 'dacBell') found = node;
    });
    return found;
  };
  const glyphKeyOfRev23 = (tree) => {
    const button = bellButtonOfRev23(tree);
    return button === null ? '' : String((button.children ?? [])[0]?.props?.key ?? '');
  };
  check(
    'the console surface reports the tilt duration and the peak angle it animates to',
    bellTiltMs === 560 && bellTiltDeg === 9,
    \`sessionIcon.bellTiltMs=\${bellTiltMs} sessionIcon.bellTiltDeg=\${bellTiltDeg}\`,
  );
  check(
    'the armed rule animates the glyph for that duration with the long-tail easing',
    tiltArmed.value === \`dacBellTilt \${bellTiltMs}ms cubic-bezier(0.22,1,0.36,1)\`,
    \`resolved animation=\${String(tiltArmed.value)} via \${String(tiltArmed.selector)}\`,
  );
  check(
    'the @keyframes it names exists, starts and ends at rest, and every step carries a scale',
    tiltAngles.length === 4 && tiltAngles[0] === 0 && tiltAngles[3] === 0
      && tiltScales.length === 4 && tiltScales.every((value) => Number.isFinite(value)),
    \`steps=\${tiltAngles.length} angles=\${JSON.stringify(tiltAngles)} scales=\${JSON.stringify(tiltScales)}\`,
  );
  check(
    'the widest excursion of those keyframes IS the reported peak angle',
    tiltAngles.length > 0 && Math.max(...tiltAngles.map((angle) => Math.abs(angle))) === bellTiltDeg,
    \`max|angle|=\${Math.max(...tiltAngles.map((angle) => Math.abs(angle)))} sessionIcon.bellTiltDeg=\${bellTiltDeg}\`,
  );
  /* The count that separates rev-23 from rev-22: the table crosses zero ONCE. rev-22's damped ring
   * crossed it three times inside the same span, and "four swings read as a rattle" is exactly what the
   * user rejected -- so this number, not the amplitude, is the claim under test. */
  check(
    'the glyph crosses zero exactly ONCE, so it leans and settles rather than rattling',
    tiltAngles.slice(1, -1).filter((angle) => angle < 0).length === 1,
    \`negative interior steps=\${tiltAngles.slice(1, -1).filter((angle) => angle < 0).length} angles=\${JSON.stringify(tiltAngles)}\`,
  );
  check(
    'the swell is bounded and returns to rest instead of staying grown',
    tiltScales[0] === 1 && tiltScales[tiltScales.length - 1] === 1
      && Math.max(...tiltScales) > 1 && Math.max(...tiltScales) <= 1.06,
    \`scales=\${JSON.stringify(tiltScales)}\`,
  );
  check(
    'the easing is an ease-out with a long tail, and NOT rev-22 symmetric ease-in-out',
    typeof tiltArmed.value === 'string' && tiltArmed.value.includes('cubic-bezier(0.22,1,0.36,1)')
      && !tiltArmed.value.includes('ease-in-out'),
    \`animation=\${String(tiltArmed.value)}\`,
  );
  check(
    'the bell leans about its TOP edge -- where a bell hangs from -- and not about the caret pivot',
    bellGlyphOriginRev23.value === '50% 0' && caretGlyphOriginRev23.value === 'center',
    \`.dacBell svg{transform-origin:\${String(bellGlyphOriginRev23.value)}} .dacCaret svg{transform-origin:\${String(caretGlyphOriginRev23.value)}}\`,
  );
  check(
    'the 28px bell button itself is never animated or transformed',
    bellButtonTransformRev23.value === null && bellButtonAnimationRev23.value === null,
    \`resolved on .dacBell: transform=\${String(bellButtonTransformRev23.value)} animation=\${String(bellButtonAnimationRev23.value)}\`,
  );
  check(
    'no reduced-motion rule names the bell either, so the tilt plays in every environment',
    bellRulesUnderReducedMotionRev23.length === 0,
    \`reduced-motion rules naming .dacBell=\${bellRulesUnderReducedMotionRev23.length} (all reduced-motion rules in the sheet=\${reduceMotionRules.length})\`,
  );
  check(
    'the rendered bell starts UN-MOVED: the tilt is armed by a click, never by the load',
    bellButtonOfRev23(bell) !== null && bellButtonOfRev23(bell).props['data-tilt'] === 'false' && glyphKeyOfRev23(bell) === 'glyph0',
    bellButtonOfRev23(bell) === null ? 'no .dacBell rendered' : \`data-tilt=\${JSON.stringify(bellButtonOfRev23(bell).props['data-tilt'])} glyph key=\${JSON.stringify(glyphKeyOfRev23(bell))}\`,
  );
  const bellButtonRev23 = bellButtonOfRev23(bell);
  if (bellButtonRev23 === null || typeof bellButtonRev23.props.onClick !== 'function') {
    check(
      'clicking the bell arms the tilt and re-keys the glyph that replays it',
      false,
      \`no clickable .dacBell rendered (button=\${bellButtonRev23 === null ? 'null' : typeof bellButtonRev23.props.onClick})\`,
    );
  } else {
    bellButtonRev23.props.onClick({});
    const afterClick = renderComponent(loaded.runtime, loaded.sessionEntry.component, { sessionId: 'session-a' });
    const clickedButton = bellButtonOfRev23(afterClick.tree);
    check(
      'clicking the bell arms the tilt and re-keys the glyph that replays it',
      clickedButton !== null && clickedButton.props['data-tilt'] === 'true' && glyphKeyOfRev23(afterClick.tree) === 'glyph1',
      clickedButton === null
        ? \`nothing rendered after the click (\${afterClick.errors.length} effect error(s))\`
        : \`after one click: data-tilt=\${JSON.stringify(clickedButton.props['data-tilt'])} glyph key=\${JSON.stringify(glyphKeyOfRev23(afterClick.tree))}\`,
    );
  }
`;

const ROWS = [
  /* --- probe-20: the independent appearance probe. Its group 7 is a SPAN; the three literals around it
   * are ordinary rows. The key list is pinned as a whole by one of its own checks, so it moves here. */
  row(F.p20, 'lit',
    "const SESSION_ICON_KEYS = ['bellBoxPx', 'bellGapPx', 'bellGlyphPx', 'bellRingDeg', 'bellRingMs', 'caretBoxPx', 'caretGlyph', 'caretOpenRotateDeg', 'caretRotateMs', 'onBackground', 'onBackgroundHover', 'onForeground'];",
    "const SESSION_ICON_KEYS = ['bellBoxPx', 'bellGapPx', 'bellGlyphPx', 'bellTiltDeg', 'bellTiltMs', 'caretBoxPx', 'caretGlyph', 'caretOpenRotateDeg', 'caretRotateMs', 'onBackground', 'onBackgroundHover', 'onForeground'];",
    1, 'the sessionIcon key inventory'),
  row(F.p20, 'lit',
    ' * now the caret transition rule it re-inserts the deleted block after). Extended again in r22/t1\n'
    + ' * (user request "这个铃铛也要有动画"): group 7 pins the bell\'s RING -- the armed animation rule, the\n'
    + ' * generated @keyframes, the crown pivot the glyph swings about, the untouched 28px button, the\n'
    + ' * absence of any reduced-motion rule naming the bell, and the click that arms it. No mutant was\n'
    + ' * added or renamed by that round: every declared red set is unchanged, which is asserted by\n'
    + ' * `--mutate=all` rather than assumed here.',
    ' * now the caret transition rule it re-inserts the deleted block after), then in r22/t1 (user request\n'
    + ' * "这个铃铛也要有动画": group 7 pinned a damped RING) and rewritten in r23/t1 (user request "再换一个\n'
    + ' * 要有高级感": the rattle became ONE lean past rest and a settle). Group 7 pins the armed animation\n'
    + ' * rule, its easing, the generated @keyframes, the count of zero crossings, the crown pivot, the\n'
    + ' * untouched 28px button, the absence of any reduced-motion rule naming the bell, and the click that\n'
    + ' * arms it. No mutant was added or renamed by either round: every declared red set is unchanged,\n'
    + ' * which is asserted by `--mutate=all` rather than assumed here.',
    1, 'the header history of group 7'),
  spanRow(F.p20, "  group('7 - rev-", '\n  const failed = results.filter(', PROBE20_GROUP7 + '\n', 1, 'group 7 replaced between its two anchors'),
  row(F.p20, 'lit', 'rev-20/rev-21/rev-22 session-bell appearance', 'rev-20/rev-21/rev-22/rev-23 session-bell appearance', 1, 'the run banner'),

  /* --- probe-17 / probe-18 / probe-19: the artifact they pin, and the stamp they expect. */
  row(F.p17, 'rx', 'what rev-22 claims', 'what rev-23 claims', 2, 'the two anchors that name the artifact'),
  row(F.p17, 'lit', 'CLIENT_BYTES, ' + String(OLD_CLIENT.bytes) + ');', 'CLIENT_BYTES, ' + String(CLIENT.bytes) + ');', 1, 'the pinned byte count'),
  row(F.p17, 'lit', "'" + OLD_CLIENT.sha256 + "'", "'" + CLIENT.sha256 + "'", 1, 'the pinned sha256'),
  row(F.p17, 'lit', '/rev-22/.test(diagnostics.revision)', '/' + NEW_REV + '/.test(diagnostics.revision)', 1, 'the live stamp assertion'),
  row(F.p18, 'lit', "const EXPECTED_REVISION = '" + OLD_STAMP + "';", "const EXPECTED_REVISION = '" + STAMP + "';", 1, 'the expected stamp'),
  row(F.p19, 'lit', 'bytes: ' + String(OLD_CLIENT.bytes) + ',', 'bytes: ' + String(CLIENT.bytes) + ',', 1, 'the pinned byte count'),
  row(F.p19, 'lit', "sha256: '" + OLD_CLIENT.sha256 + "',", "sha256: '" + CLIENT.sha256 + "',", 1, 'the pinned sha256'),
  row(F.p19, 'lit', "revision: '" + OLD_STAMP + "',", "revision: '" + STAMP + "',", 1, 'the expected stamp'),

  /* --- probe-2 / probe-8: labels that name the current artifact. */
  row(F.p2, 'lit', 'the five the rev-22 source has', 'the five the rev-23 source has', 1, 'the source the count is claimed of'),
  row(F.p8, 'lit', "'revision stamp names the revision under test (rev-22)', String(diagnostics.revision).includes('rev-22')", "'revision stamp names the revision under test (rev-23)', String(diagnostics.revision).includes('rev-23')", 1, 'the label and the literal together'),

  /* --- r15t2 / r15t6: the failure-path probe and the mutation table. */
  row(F.t2, 'lit', 'The frozen rev-22 bytes this probe is anchored to', 'The frozen rev-23 bytes this probe is anchored to', 1, 'the FROZEN note'),
  row(F.t2, 'lit', "sha256: '" + OLD_CLIENT.sha256 + "',", "sha256: '" + CLIENT.sha256 + "',", 1, 'the pinned sha256'),
  row(F.t2, 'lit', 'bytes: ' + String(OLD_CLIENT.bytes) + ',', 'bytes: ' + String(CLIENT.bytes) + ',', 1, 'the pinned byte count'),
  row(F.t2, 'lit', "revision: '" + OLD_STAMP + "',", "revision: '" + STAMP + "',", 1, 'the expected stamp'),
  row(F.t2, 'lit', 'ships as rev-22"', 'ships as rev-23"', 1, 'the AUTHOR label'),
  row(F.t2, 'lit', 'A1: lib/client.js is the frozen rev-22 byte sequence', 'A1: lib/client.js is the frozen rev-23 byte sequence', 1, 'the A1 assertion name'),
  row(F.t2, 'lit', "'shipped rev-22 bytes'", "'shipped rev-23 bytes'", 1, 'the label the vm is handed'),
  row(F.t2, 'lit', 'shipped rev-22 run:', 'shipped rev-23 run:', 1, 'the banner the runner greps past'),
  row(F.t6, 'lit', "'# r22 · the rev-22 mutation table (every declared mutation re-measured on the rev-22 bytes)'", "'# r23 · the rev-23 mutation table (every declared mutation re-measured on the rev-23 bytes)'", 1, 'the markdown banner (round + artifact)'),
  row(F.t6, 'lit', "const FROZEN = { sha256: '" + OLD_CLIENT.sha256 + "', bytes: " + String(OLD_CLIENT.bytes) + ' };', "const FROZEN = { sha256: '" + CLIENT.sha256 + "', bytes: " + String(CLIENT.bytes) + ' };', 1, 'the artifact it refuses to run against'),
  row(F.t6, 'rx', 'rev-22', NEW_REV, 7, 'every other artifact reference in this file'),
  /* THE LESSON FROM r22/t1: the ROUND token moves too, or this probe writes its evidence into the
   * previous round's directory -- which is exactly how the r21 canonical mutation logs were lost. */
  row(F.t6, 'rx', 'r22-evidence', 'r23-evidence', 7, 'the evidence DIRECTORY (round token, not revision token)'),
  row(F.t6, 'rx', 'r22-mut-', 'r23-mut-', 4, 'the per-mutation log names'),
  row(F.t6, 'rx', 'r22-t1-mutation-table', 'r23-t1-mutation-table', 2, 'the JSON and Markdown table names'),
  row(F.t6, 'lit', 'r22 mutation table: rows=', 'r23 mutation table: rows=', 1, 'the console summary line'),
  row(F.t6, 'lit', 'by r21 / t1 and now by r22 / t1 --', 'by r21 / t1, by r22 / t1 and now by r23 / t1 --', 1, 'the header re-anchor history'),

  /* --- the runner: header, WHY block, history chains, manifest, section 0/0c, 7b, tally, log prefix. */
  row(F.runner, 'lit',
    '# Independent rev-22 full regression run (r22/t1, the BELL RINGS when it is toggled and every live fingerprint re-anchored; the r18/t1, r18b/t5, r18c/t7, r19/t2, r20/t1 and r21/t1 logs are preserved).',
    '# Independent rev-23 full regression run (r23/t1, the BELL TILTS ONCE instead of rattling and every live fingerprint re-anchored; the r18/t1, r18b/t5, r18c/t7, r19/t2, r20/t1, r21/t1 and r22/t1 logs are preserved).',
    1, 'the file header'),
  row(F.runner, 'lit', 'carries the `r22-` prefix', 'carries the `r23-` prefix', 1, 'the log-prefix note in the header'),
  row(F.runner, 'lit',
    '# WHY THIS RUN EXISTS AT rev-22 -- the BELL RINGS when it is toggled. User request: "这个铃铛也要有动画"',
    '# WHY THIS RUN EXISTS AT rev-23 -- the BELL TILTS ONCE AND SETTLES. User request: "再换一个要有高级感"\n'
    + '# (rev-22 had shipped a four-oscillation rattle of the same glyph and the user rejected it). The change\n'
    + '# is the SHAPE of one declared frame table, not its amplitude: ONE excursion past rest instead of\n'
    + '# three (0 -> +9 deg at 30%, -1.98 deg at 66%, 0 at 100%), a scale track rev-22 had none of\n'
    + '# (1 -> 1.055 -> 1.012 -> 1), a 9 deg peak instead of 14, and an ease-out with a long tail\n'
    + '# (`cubic-bezier(0.22,1,0.36,1)`) instead of rev-22 symmetric `ease-in-out`. The @keyframes text is\n'
    + '# still GENERATED from the table, so the stylesheet and the console surface cannot disagree.\n'
    + '#   - the console surface reports `sessionIcon.bellTiltMs` (560) and `sessionIcon.bellTiltDeg` (9);\n'
    + '#     the attribute that arms the animation is `data-tilt`, the glyph key is unchanged ("glyph<N>"),\n'
    + '#     and the arming rule is still "not before the first click", so the first paint is silent.\n'
    + '#   - GEOMETRY, PAINT, THE AUDIO PATH AND THE HOST HALF ARE UNTOUCHED. The pivot (glyph top, 50% 0)\n'
    + '#     and the "glyph moves, the 28px button never does" split are unchanged from rev-22.\n'
    + '#   - NO reduced-motion override was added for the tilt either, and `prefers-reduced-motion` still\n'
    + '#     appears ZERO times in the stylesheet -- measured by probe-20, not assumed.\n'
    + '#   - WHETHER THIS READS AS "高级感" IS NOT SOMETHING THIS RUN CAN PROVE. Only the user, looking at\n'
    + '#     the page, can. This run pins the duration, the easing, the generated keyframes, the ONE zero\n'
    + '#     crossing, the scale bound, the pivot and the arming hook -- nothing about taste. probe-13 (the\n'
    + '#     browser probe) still cannot run here, so the FRAMES stay unobserved by anything in this repo.\n'
    + '# WHY THE r22 ROUND EXISTED (history, kept verbatim) -- the BELL RINGS when it is toggled. User request: "这个铃铛也要有动画"',
    1, 'a new WHY block for this round, and the rev-22 block becomes history'),
  row(F.runner, 'lit',
    '#     ' + String(OLD_CLIENT.bytes) + ' B / ' + OLD_CLIENT.short + ' (r22/t1: the bell rings when it is toggled -- the ring\n'
    + "#     constants, the generated @keyframes, the arming hook and the re-keyed glyph; diagnostics.revision\n"
    + "#     is now '" + OLD_STAMP + "').",
    '#     ' + String(OLD_CLIENT.bytes) + ' B / ' + OLD_CLIENT.short + ' (r22/t1: the bell rings when it is toggled -- the ring\n'
    + "#     constants, the generated @keyframes, the arming hook and the re-keyed glyph) ->\n"
    + '#     ' + String(CLIENT.bytes) + ' B / ' + CLIENT_SHORT + ' (r23/t1: that rattle is replaced by ONE lean past rest and a\n'
    + '#     settle -- a 9 deg peak, a scale track and a long-tail ease-out; diagnostics.revision is now\n'
    + "#     '" + STAMP + "').",
    1, 'the lib/client.js history chain'),
  row(F.runner, 'lit',
    '#     ' + String(OLD_HALF.bytes) + ' B / ' + OLD_HALF.short + ' (r22/t1: SEVENTEEN ring checks -- the reported\n'
    + '#     constants, the generated keyframes and their decay, the crown pivot, the untouched button, the\n'
    + '#     silent first paint and the click that arms it; the assertion count is 421 now (404 before it)).',
    '#     ' + String(OLD_HALF.bytes) + ' B / ' + OLD_HALF.short + ' (r22/t1: SEVENTEEN ring checks -- the reported\n'
    + '#     constants, the generated keyframes and their decay, the crown pivot, the untouched button, the\n'
    + '#     silent first paint and the click that arms it; the assertion count was 421 then) ->\n'
    + '#     ' + String(HALF.bytes) + ' B / ' + HALF_SHORT + ' (r23/t1: the section is rewritten for the tilt -- twenty\n'
    + '#     checks, two of which measure the SHAPE the user asked for: the ONE zero crossing and the bound on\n'
    + '#     the swell, plus a refusal of `ease-in-out` by name; the assertion count is 424 now).',
    1, 'the client-half history chain'),
  row(F.runner, 'lit',
    '#     20263 B / ' + OLD_AUDIO_SHORT + ' (r22/t1: the same literal; the count is still 75).',
    '#     20263 B / ' + OLD_AUDIO_SHORT + ' (r22/t1: the same literal; the count is still 75) ->\n'
    + '#     20263 B / ' + AUDIO_SHORT + ' (r23/t1: the same literal; the count is still 75).',
    1, 'the custom-audio history chain'),
  row(F.runner, 'lit',
    '#   - probe-20-r14-bell-appearance.mjs is ' + OLD_PROBE20 + ' checks (was 37) with 26 declared mutants\n'
    + '#     (was 20). r22/t1 added group 7 (ten ring checks); NO mutant was added or renamed, and --mutate=all\n'
    + '#     re-measures that claim: all twenty-six declared red sets are unchanged.',
    '#   - probe-20-r14-bell-appearance.mjs is ' + PROBE20 + ' checks (was 47) with 26 declared mutants (was 20).\n'
    + '#     r22/t1 added group 7 (ten ring checks) and r23/t1 rewrote it for the tilt (eleven checks, two of\n'
    + '#     them the shape of the motion); NO mutant was added or renamed by either round, and --mutate=all\n'
    + '#     re-measures that claim: all twenty-six declared red sets are unchanged.',
    1, 'the probe-20 check count'),
  row(F.runner, 'lit', 'author suites (' + OLD_TALLY + ' checks)', 'author suites (' + TALLY + ' checks)', 1, 'the author-suite tally'),
  row(F.runner, 'lit', 're-anchored to the rev-22 baseline', 're-anchored to the rev-23 baseline', 1, 'the frozen-manifest note'),
  row(F.runner, 'lit', 'bytes = ' + String(OLD_CLIENT.bytes) + "; sha = '" + OLD_CLIENT.sha256 + "'", 'bytes = ' + String(CLIENT.bytes) + "; sha = '" + CLIENT.sha256 + "'", 2, 'the manifest row AND the before/after baseline row'),
  row(F.runner, 'lit', 'bytes = ' + String(OLD_HALF.bytes) + ";  sha = '" + OLD_HALF.sha256 + "'", 'bytes = ' + String(HALF.bytes) + ";  sha = '" + HALF.sha256 + "'", 1, 'the client-half manifest row'),
  row(F.runner, 'lit', "bytes = 20263; sha = '11DAF28B703C43DCC2F3845A05ECCF278772AD48F6E06F2764705058ED8D6F05'", "bytes = 20263; sha = '" + AUDIO.sha256 + "'", 1, 'the custom-audio manifest row'),
  row(F.runner, 'lit', '9 recorded files byte-identical to the rev-22 baseline', '9 recorded files byte-identical to the rev-23 baseline', 1, 'the section-0 heading'),
  row(F.runner, 'lit', 'rev-22 changed lib/client.js and verify/:', 'rev-23 changed lib/client.js and verify/:', 1, 'the section-0c note'),
  row(F.runner, 'lit', '=== 7b. rev-22 mutation table:', '=== 7b. rev-23 mutation table:', 1, 'the section-7b heading'),
  row(F.runner, 'lit', "refuses to run unless lib/client.js is the rev-22'", "refuses to run unless lib/client.js is the rev-23'", 1, 'the 7b explanation'),
  /* r22/t1's blanket prefix rows only matched `'r22-` (a quote immediately before the token), so this
   * prose line -- whose token sits mid-string -- was MISSED by that round and still names r21. */
  row(F.runner, 'lit', 'writes _raw/r21-evidence/r21-t1-mutation-table.json/.md', 'writes _raw/r23-evidence/r23-t1-mutation-table.json/.md', 1, 'the 7b output path prose (missed by r22/t1)'),
  row(F.runner, 'lit', 'byte-identical to the rev-22 manifest', 'byte-identical to the rev-23 manifest', 1, 'the closing summary'),
  row(F.runner, 'lit', 'the rev-20 deletion of both reduced-motion overrides, the rev-22 ring)', 'the rev-20 deletion of both reduced-motion overrides, the rev-22 ring, the rev-23 tilt)', 1, 'the section-2e heading'),
  row(F.runner, 'lit', '=== shipped rev-22 run:', '=== shipped rev-23 run:', 1, 'the r15t2 banner quoted in the probes loop'),
  row(F.runner, 'rx', "'r22-", "'r23-", 9, 'single-quoted log paths'),
  row(F.runner, 'rx', '"r22-', '"r23-', 7, 'double-quoted log paths'),
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
  return text.slice(0, start) + entry.replace + text.slice(end);}

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
const record = { tool: 'r23-reanchor.mjs', round: NEW_ROUND, revision: NEW_REV, files: [], archives: [] };
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
writeFileSync(join(EVIDENCE, 'r23-t1-reanchor.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
console.log(`\n############ ${ROWS.length} rows / ${totalSites} sites applied across ${plan.length} files`);
