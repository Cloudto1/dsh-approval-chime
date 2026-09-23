/**
 * Independent probe 20 (task t6, verifier) -- the rev-13 / rev-14 session-bell APPEARANCE.
 * Extended in r16/t1 (the rev-16 bell-caret gap), in r17/t2 (the rev-17 caret quarter turn), in
 * r18/t2 (the rev-18 duration change 160 ms -> 300 ms, plus the new reduceMotion() diagnostic),
 * in r19/t2 (the rev-19 duration change 300 ms -> 400 ms) and in r20/t1 (the rev-20 flip
 * back to 160 ms and the DELETION of both reduced-motion media blocks; the mutant
 * `caret-turn-reduced-motion-dropped` became `caret-turn-reduced-motion-restored`, whose anchor is
 * now the caret transition rule it re-inserts the deleted block after), then in r22/t1 (user request
 * "这个铃铛也要有动画": group 7 pinned a damped RING), rewritten in r23/t1 (user request "再换一个
 * 要有高级感": the rattle became ONE lean past rest and a settle) and rewritten AGAIN in r24/t1
 * (user request "不要晃动，静音时把斜杠重左上拉到右下的动画": the bell body stops moving and the MUTE
 * is drawn instead). Group 7 now SIMULATES THE CASCADE for the four states the control can be in
 * (audible/muted x clicked/not-yet-clicked) and pins, in each of them, whether the slash animates,
 * which curve it uses, and how much ink it leaves -- plus the ABSENCE of every tilt rule, because
 * "the bell does not move" is the claim a later edit breaks by re-adding one. No mutant was added or
 * renamed by any of these rounds: every declared red set is unchanged, which is asserted by
 * `--mutate=all` rather than assumed here.
 *
 * WHY THIS PROBE EXISTS
 *   t3 (the independent review round) ran four UNDECLARED appearance mutations of the session
 *   bell against every existing independent probe and measured an EMPTY red set: the bell's
 *   look had no mutation coverage outside the author suite. probe-18's 131 assertions are about
 *   behaviour (attributes, requests, audio), and probe-11/17/19 read lib/client.js from disk and
 *   never name `.dacBell`. This probe closes that hole.
 *
 * WHY A NEW PROBE INSTEAD OF EXTENDING probe-11
 *   probe-11 is anchored on the card's `::picker(select)` box arithmetic and its shipped hash is
 *   quoted in three rounds of evidence (r13, r13v, r13-final). A separate probe keeps that
 *   artifact untouched, makes this round's addition a pure ADDITION in the assertion inventory,
 *   and lets the mutations be SOURCE-level (geometry constants and the rendered SVG), which
 *   probe-11's "mutate the injected stylesheet string" shape cannot express.
 *
 * WHAT IT READS (no author-harness assertion text is reused)
 *   - the REAL lib/client.js, evaluated as a classic script in this probe's own vm sandbox;
 *   - the stylesheet the bundle itself appended (`<style id="dsh-approval-chime/styles">`);
 *   - the console surface `window.__DSH_APPROVAL_CHIME__.sessionIcon`;
 *   - the rendered bell/caret, via this probe's own minimal function-component driver.
 *   Rules are resolved with this probe's own cascade model (specificity, then written order),
 *   not with a first-match lookup -- a first-match lookup is what let the "fill the muted state
 *   as well" class of defect through in an earlier round.
 *
 * DISCIPLINE (same as probe-11/17/18/19 since the t2 audit)
 *   `--mutate=<name>` rewrites an IN-MEMORY copy of the source (the file on disk is never
 *   touched), and the mutant is caught exactly when: every declared check went red, NOTHING else
 *   did, the mutant source digest differs from the shipped one, and the anchor occurred exactly
 *   once in the shipped bytes. A caught mutant exits 0; a dead mutation, an anchor that is not
 *   unique, a declaration that is too narrow ("UNDECLARED red") or too wide ("NOT DETECTED")
 *   exits non-zero.
 *
 * WHAT r17/t2 ADDED, AND WHY IT NEEDED A PARSER CHANGE (group 5, seven checks, seven mutants)
 *   The rev-17 turn is three separate claims that a single "does the CSS contain rotate(90deg)"
 *   grep cannot separate: the OPEN state turns, the CLOSED state does not, the turn is ANIMATED
 *   with a duration the console surface reports, the caret is damped by NOTHING (r20/t1 deleted
 *   the `prefers-reduced-motion` override rev-17 had added: it, not the duration, is why no turn was
 *   ever played on the reporting device), and the node that turns is the `<svg>`
 *   glyph rather than the `.dacCaret` button box. The last bullet is why this probe had to learn
 *   at-rule conditions: the override was a `@media` block, and until `collectRules` recorded which
 *   conditions a rule sits under, such an override and the transition it damps were indistinguishable
 *   members of one flattened cascade — the same machinery now proves that no such rule exists. The
 *   flattening itself is unchanged, so no pre-existing check moved; the red sets are pairwise
 *   different and each new check is the sole red of at least one mutant, which `--mutate=all`
 *   re-proves on every run.
 *
 * WHAT r18/t2 MOVED, AND WHAT IT ADDED (group 6, seven checks, six mutants)
 *   The device report that produced rev-18 -- an arrow that still read as an instant cut on real
 *   hardware -- moved ONE assertion this probe already had: group 5 pinned the turn's duration at
 *   160 ms, and that literal, its check NAME and the anchor of the `caret-turn-ms-250` mutant now
 *   read 300. The two-layer structure is untouched: the duration parsed out of the injected CSS must
 *   equal `sessionIcon.caretRotateMs`, and that value must equal the 160 the round declared.
 *   `caret-turn-ms-250` still drifts the constant to 250 ms; only its `what` changed, because 250 is
 *   now simply the wrong duration rather than a value outside a 120-200 ms band this project no
 *   longer claims -- the band was the judgment the device overturned, and rev-18 retired its
 *   reasoning (see the constant's note in lib/client.js).
 *
 *   The ADDITION is group 6: `__DSH_APPROVAL_CHIME__.reduceMotion()`, the diagnostic that exists so
 *   "the animation is too fast to see" and "this environment asks for no motion at all" stop being
 *   indistinguishable on a device. Its three environments cannot be borrowed from the author suite,
 *   so this probe builds them itself -- the sandbox below is the only `window` the bundle ever sees:
 *   a platform with NO `matchMedia` key at all, one whose query reports the preference, one that
 *   reports no preference, and a stub whose answer is flipped between two calls on the SAME loaded
 *   instance (a boolean captured at install cannot pass that one). Six mutants falsify the seven
 *   checks; the red sets are {1,2,3,4,5}, {2,5,6}, {3,4,5,6}, {5}, {6} and {7} in check order below,
 *   so no two of them are the same, three checks have a mutant whose ONLY red they are, and every new
 *   check has at least one declared mutant that turns it red.
 *
 *       node verify-independent/probe-20-r14-bell-appearance.mjs
 *       node verify-independent/probe-20-r14-bell-appearance.mjs --mutate=all
 *       node verify-independent/probe-20-r14-bell-appearance.mjs --mutate=muted-bell-filled
 *       node verify-independent/probe-20-r14-bell-appearance.mjs --list-mutations
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT_PATH = join(here, '..', 'lib', 'client.js');
const SHIPPED = readFileSync(CLIENT_PATH, 'utf8');
const sha256 = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').toUpperCase();

const BELL_FILL_RULE = "'.dacBell[data-muted=\"false\"]{background:' + BELL_ON_BG + ';color:' + BELL_ON_FG + ';}'";
const BELL_HOVER_RULE = "'.dacBell[data-muted=\"false\"]:hover{background:' + BELL_ON_BG_HOVER + ';}',";
const MUTED_COLOUR_RULE = "'.dacBell[data-muted=\"true\"]{color:var(--dsw-alias-label-caption,#71717a);}',";

/* rev-17 · the caret's quarter turn. The anchor strings are the shipped source text of the caret
 * rules, spelled from the same constants the bundle spells them from, so an anchor here and a rule
 * there name one value each and a rename cannot leave this probe testing a ghost.
 *
 * r20/t1 · the last one is the exception: `CARET_REDUCED_MOTION_OVERRIDE` is NOT shipped any
 * more (the block it spells was deleted this round, and group 5 asserts its absence). It is kept here
 * as the text the `caret-turn-reduced-motion-restored` mutant re-inserts, which is what keeps "the
 * override is gone" a claim this probe can falsify instead of a sentence in a comment. */
const CARET_TRANSITION_RULE = "'.dacCaret svg{transition:transform ' + String(CARET_ROTATE_MS) + 'ms ease;}',";
const CARET_OPEN_RULE = "'.dacCaret[data-open=\"true\"] svg{transform:rotate(' + String(CARET_OPEN_ROTATE_DEG) + 'deg);}',";
const CARET_ORIGIN_RULE = "'.dacCaret svg{transform-origin:center;}',";
const CARET_REDUCED_MOTION_OVERRIDE = "'@media (prefers-reduced-motion:reduce){.dacCaret svg{transition:none;}}',";

/* rev-18 · the `reduceMotion()` diagnostic. Same rule as above -- every anchor is the shipped
 * source text, so a rename in the bundle cannot leave this probe testing a ghost -- with one
 * addition: THE BUNDLE IS A CRLF FILE (measured: all 3208 of its newlines are CRLF), so the single
 * multi-line anchor here is JOINED WITH CRLF on purpose. Written with bare LF it would match zero
 * occurrences, and `--mutate=all` prints that measured count as "anchor occurrences in the shipped
 * bytes: 0" / DEAD MUTATION rather than passing quietly. */
const REDUCE_MOTION_GUARD = "            if (typeof window.matchMedia !== 'function') return false;";
const REDUCE_MOTION_QUERY = "            var query = window.matchMedia('(prefers-reduced-motion: reduce)');";
const REDUCE_MOTION_RETURN = '            return Boolean(query && query.matches);';
const SESSION_ICON_HOVER_KEY = 'onBackgroundHover: BELL_ON_BG_HOVER,';
const REDUCE_MOTION_PROPERTY = [
  '        reduceMotion: function () {',
  '          try {',
  "            if (typeof window.matchMedia !== 'function') return false;",
  "            var query = window.matchMedia('(prefers-reduced-motion: reduce)');",
  '            return Boolean(query && query.matches);',
  '          } catch (error) {',
  '            // A `matchMedia` that throws is "no preference", never a crash.',
  '            return false;',
  '          }',
  '        },',
].join('\r\n');
/* What that property becomes in the "boolean snapshot" mutant: a value read once at install time,
 * which is exactly the shape the property's own note in lib/client.js calls out as wrong. */
const REDUCE_MOTION_BOOLEAN_SNAPSHOT = [
  '        reduceMotion: (function () {',
  '          var snapshot = false;',
  '          try {',
  "            if (typeof window.matchMedia === 'function') snapshot = Boolean(window.matchMedia('(prefers-reduced-motion: reduce)').matches);",
  '          } catch (error) {',
  '            snapshot = false;',
  '          }',
  '          return snapshot;',
  '        })(),',
].join('\r\n');
/* The anchor and the insertion that go INSIDE `sessionIcon`, the geometry object the note says the
 * answer must never be smuggled into. The insertion is CRLF-joined for the same reason as the
 * property above: it is new text inside a CRLF file. */
const SESSION_ICON_SNAPSHOT_INSERTION = [
  '          onBackgroundHover: BELL_ON_BG_HOVER,',
  "          reduceMotion: typeof window.matchMedia === 'function' && Boolean(window.matchMedia('(prefers-reduced-motion: reduce)').matches),",
].join('\r\n');
/* The sessionIcon keys rev-17 shipped: the geometry snapshot, and nothing else. */
const SESSION_ICON_KEYS = ['bellBoxPx', 'bellGapPx', 'bellGlyphPx', 'bellMuteMs', 'bellSlashLen', 'caretBoxPx', 'caretGlyph', 'caretOpenRotateDeg', 'caretRotateMs', 'onBackground', 'onBackgroundHover', 'onForeground'];

/* ============================================================ the mutations */

/**
 * One textual rewrite of the shipped source, kept in memory. `anchor` is the exact shipped text
 * (its occurrence count is measured at run time, never assumed) and `expectFail` is the COMPLETE
 * set of check names that must go red -- an incomplete declaration is a bug in this probe, not a
 * detail.
 */
const MUTATIONS = {
  'muted-bell-filled': {
    what: 'rev-14 regression: move the blue fill onto the bare .dacBell class, so a MUTED session is filled too',
    anchor: BELL_FILL_RULE,
    to: "'.dacBell{background:' + BELL_ON_BG + ';color:' + BELL_ON_FG + ';}'",
    expectFail: [
      'the resolved fill of the audible state is declared by the audible selector',
      'a muted bell resolves to no fill (transparent)',
      'the bare .dacBell class resolves to no fill (transparent)',
    ],
  },
  'audible-hover-dropped': {
    what: 'rev-14 regression: delete the audible bell\'s own :hover rule (the generic grey hover then wins under the pointer)',
    anchor: BELL_HOVER_RULE,
    to: '',
    expectFail: [
      'the audible state declares its own :hover paint',
      'the resolved audible hover is exactly sessionIcon.onBackgroundHover',
      'the audible hover paint is derived from the same token',
      'the audible hover is not the generic grey hover',
    ],
  },
  'fill-hardcoded-hex': {
    what: 'rev-14 regression: copy the hex value into the fill instead of using the design token the switch and slider share',
    anchor: BELL_FILL_RULE,
    to: "'.dacBell[data-muted=\"false\"]{background:#2563eb;color:#fff;}'",
    expectFail: [
      'the resolved fill of the audible state is exactly sessionIcon.onBackground',
      'that fill is a design token, never a literal colour',
    ],
  },
  'muted-icon-recolored': {
    what: 'rev-14 regression: the muted bell stops using the caption-grey token',
    anchor: MUTED_COLOUR_RULE,
    to: "'.dacBell[data-muted=\"true\"]{color:#000;}',",
    expectFail: [
      'the muted glyph keeps a caption-grey token, not the paint',
    ],
  },
  'bell-glyph-shrunk-to-14': {
    what: 'rev-13 regression: the bell glyph constant falls back to the pre-rev-13 14px',
    anchor: 'var BELL_GLYPH_PX = 22;',
    to: 'var BELL_GLYPH_PX = 14;',
    expectFail: [
      'sessionIcon reports the bell geometry 28/16/22/11x16 and the rev-16 gap',
    ],
  },
  'bell-svg-hardcoded-14': {
    what: 'rev-13 regression: the rendered bell glyph is hard-coded to 14px instead of the constant the console surface reports',
    anchor: 'width: BELL_GLYPH_PX,',
    to: 'width: 14,',
    expectFail: [
      'the rendered bell glyph is bellGlyphPx x bellGlyphPx',
    ],
  },
  'caret-css-hardcoded-12': {
    what: 'rev-13 regression: the caret box in the CSS is hard-coded to 12px while the console surface still reports caretBoxPx',
    anchor: "'.dacCaret{width:' + String(CARET_BOX_PX) + 'px;height:' + String(BELL_BOX_PX) + 'px;}',",
    to: "'.dacCaret{width:12px;height:' + String(BELL_BOX_PX) + 'px;}',",
    // r17/t2 widened this declaration from ONE name to TWO, and the widening was measured, not
    // assumed. The new glyph-vs-button check also pins the caret box (it must stay
    // caretBoxPx x bellBoxPx while the glyph turns), so this pre-existing mutant now reddens two
    // checks; left at one name, --mutate=all printed "UNDECLARED red (the declaration is too
    // narrow)" and exited 1, which this probe treats as a bug in the probe. The mutant is still
    // caught exactly (declared 2 == observed 2) and its red set is still unique among all twenty.
    //
    // This note sits OUTSIDE the expectFail brackets on purpose: the tools that read a
    // declaration (r13w-assertion-count.mjs and any parser of the same shape) pull single-quoted
    // names out of the bracket span, so an apostrophe in a comment inside it corrupts the list.
    expectFail: [
      'the caret box in the CSS is caretBoxPx wide and bellBoxPx tall',
      'the quarter turn is put on the <svg> glyph and the caret button box is left alone',
    ],
  },
  'bell-css-hardcoded-20': {
    what: 'rev-13 regression: the bell box in the CSS falls back to the pre-rev-13 20px while the console surface still reports bellBoxPx',
    anchor: "'.dacBell{width:' + String(BELL_BOX_PX) + 'px;height:' + String(BELL_BOX_PX) + 'px;}',",
    to: "'.dacBell{width:20px;height:20px;}',",
    expectFail: [
      'the bell box in the CSS is bellBoxPx square',
    ],
  },
  'audible-foreground-recoloured': {
    what: 'rev-14 regression: the glyph on the blue fill is no longer the white the console surface reports',
    anchor: BELL_FILL_RULE,
    to: "'.dacBell[data-muted=\"false\"]{background:' + BELL_ON_BG + ';color:#000;}'",
    expectFail: [
      'the glyph on that fill is exactly sessionIcon.onForeground',
    ],
  },
  'muted-rule-declares-fill': {
    what: 'rev-14 regression: the muted rule itself carries a background (the "muted stays unfilled" claim fails at the rule, not just in the cascade)',
    anchor: MUTED_COLOUR_RULE,
    to: "'.dacBell[data-muted=\"true\"]{color:var(--dsw-alias-label-caption,#71717a);background:var(--dsw-alias-state-business-primary,#2563eb);}',",
    expectFail: [
      'a muted bell resolves to no fill (transparent)',
      'no rule naming the muted state declares a background',
    ],
  },
  'caret-svg-hardcoded-9': {
    what: 'rev-13 regression: the rendered caret glyph is hard-coded to 9px wide instead of the constant the console surface reports',
    anchor: 'width: CARET_GLYPH_W,',
    to: 'width: 9,',
    expectFail: [
      'the rendered caret glyph is caretGlyph',
    ],
  },
  'bell-caret-gap-removed': {
    what: 'rev-16 regression: the wrapper goes back to the flush cluster, so the bell and the caret touch each other again while the console surface still reports bellGapPx',
    anchor: "'.dacBellWrap{position:relative;display:inline-flex;align-items:center;gap:' + String(BELL_GAP_PX) + 'px;}',",
    to: "'.dacBellWrap{position:relative;display:inline-flex;align-items:center;}',",
    expectFail: [
      'the wrapper separates the bell from its caret by sessionIcon.bellGapPx',
    ],
  },
  'bell-caret-gap-constant-zeroed': {
    what: 'rev-16 regression: the gap constant falls back to 0, so the CSS and the console surface AGREE on a flush cluster -- this is the mutant that proves the absolute pin is load-bearing, not decoration',
    anchor: 'var BELL_GAP_PX = 6;',
    to: 'var BELL_GAP_PX = 0;',
    expectFail: [
      'sessionIcon reports the bell geometry 28/16/22/11x16 and the rev-16 gap',
      'the wrapper separates the bell from its caret by sessionIcon.bellGapPx',
    ],
  },

  /* ---- rev-17 (r17/t1): the caret's quarter turn ---------------------------------------------
   * Seven mutants, one per new check, so that no new check is decorative: each one is the ONLY
   * red of at least one mutant, and the seven red sets are pairwise different (which probe-20's
   * --mutate=all enforces against the thirteen mutations above as well).
   * ------------------------------------------------------------------------------------------- */
  'caret-turn-transition-dropped': {
    what: 'rev-17 regression: the quarter turn is still there, but the transition that animates it is deleted -- the arrow now CUTS to down instead of turning (the exact defect the user asked to be fixed)',
    anchor: CARET_TRANSITION_RULE,
    to: '',
    expectFail: [
      'the caret glyph transitions on transform for sessionIcon.caretRotateMs',
    ],
  },
  'caret-turn-rule-dropped': {
    what: 'rev-17 regression: the `[data-open="true"]` quarter-turn rule is deleted, so the arrow keeps pointing right while its popover is open',
    anchor: CARET_OPEN_RULE,
    to: '',
    expectFail: [
      'the open caret glyph resolves to a quarter turn of sessionIcon.caretOpenRotateDeg',
    ],
  },
  'caret-turn-angle-45-deg': {
    what: 'rev-17 regression: the turn constant drifts to 45 degrees -- the CSS and the console surface still AGREE with each other, so only the absolute right-angle pin can catch it',
    anchor: 'var CARET_OPEN_ROTATE_DEG = 90;',
    to: 'var CARET_OPEN_ROTATE_DEG = 45;',
    expectFail: [
      'sessionIcon reports that quarter turn as exactly 90 degrees',
    ],
  },
  'caret-turn-ms-250': {
    what: 'rev-18 regression: the duration constant drifts to 250 ms -- simply the WRONG duration now, with the CSS and the console surface still agreeing with each other, so only the absolute 160 ms pin below can catch it (rev-18 retired the old 120-200 ms band: that band was the judgment the device report overturned, so the mutant is no longer "past a band" but "a different number from the one the round declared")',
    anchor: 'var CARET_ROTATE_MS = 160;',
    to: 'var CARET_ROTATE_MS = 250;',
    expectFail: [
      'sessionIcon reports that transition duration as exactly 160 milliseconds',
    ],
  },
  'caret-turn-reduced-motion-restored': {
    what: 'rev-20 regression: the deleted prefers-reduced-motion override is put BACK on the caret, so a reader whose system asks for reduced motion is handed the 90 degree end state with no turn at all -- the exact defect the user reported against rev-17 through rev-19',
    anchor: CARET_TRANSITION_RULE,
    to: CARET_TRANSITION_RULE + '\r\n' + '            ' + CARET_REDUCED_MOTION_OVERRIDE,
    expectFail: [
      'the caret turn is NOT damped in any environment: no prefers-reduced-motion rule names it (rev-20)',
    ],
  },
  'caret-turn-moved-to-button': {
    what: 'rev-17 regression: the turn is hung on the .dacCaret BUTTON instead of the <svg> glyph -- 16x28 becomes a 28x16 hover pill under the pointer, the layout bug the constant note warns about',
    anchor: CARET_OPEN_RULE,
    to: "'.dacCaret[data-open=\"true\"]{transform:rotate(' + String(CARET_OPEN_ROTATE_DEG) + 'deg);}',",
    expectFail: [
      'the open caret glyph resolves to a quarter turn of sessionIcon.caretOpenRotateDeg',
      'the quarter turn is put on the <svg> glyph and the caret button box is left alone',
    ],
  },
  'caret-turn-also-when-closed': {
    what: 'rev-17 regression: the quarter turn is written into the ALWAYS-matching `.dacCaret svg` rule, so the arrow points down with the popover closed too and the open state says nothing',
    anchor: CARET_ORIGIN_RULE,
    to: "'.dacCaret svg{transform-origin:center;transform:rotate(' + String(CARET_OPEN_ROTATE_DEG) + 'deg);}',",
    expectFail: [
      'the closed caret glyph carries no rotation, bare and with the closed attribute spelled out',
    ],
  },

  /* ---- rev-18 (r18/t2): the reduceMotion() diagnostic -----------------------------------------
   * Six mutants for the seven checks of group 6. The red sets below are the MEASURED ones
   * (`--mutate=all` prints each observed set as JSON next to the declaration):
   *   reduce-motion-boolean-snapshot             -> checks 1 2 3 4 5
   *   reduce-motion-always-false                 -> checks 2 5 6
   *   reduce-motion-always-true                  -> checks 3 4 5 6
   *   reduce-motion-cached-after-first-call      -> check 5, its ONLY red
   *   reduce-motion-asks-the-wrong-query         -> check 6, its ONLY red
   *   reduce-motion-snapshotted-into-sessionIcon -> check 7, its ONLY red
   * Check 1 ("the surface still exposes a FUNCTION") is red in every mutant that replaces the
   * function itself; the first mutant is the one that makes that explicit, and it is also the
   * mutant that pins the "a boolean captured at install is not an answer to a live question"
   * claim the property's own note makes.
   * ------------------------------------------------------------------------------------------- */
  'reduce-motion-boolean-snapshot': {
    what: 'rev-18 regression: the diagnostic becomes the BOOLEAN its own note warns against -- the query is read once, while the surface is being installed, and `.reduceMotion` is that frozen answer instead of a function, so a reader who flips reduced motion while the popover is open is answered from install time (and a caller gets a TypeError)',
    anchor: REDUCE_MOTION_PROPERTY,
    to: REDUCE_MOTION_BOOLEAN_SNAPSHOT,
    // Measured, not assumed: this mutant still ASKS the right question, it just does it once at
    // install time, so the query check stays green (declaring it red is what `--mutate=all` printed
    // as "NOT DETECTED (declared but still green)" on the first run). The five names below are the
    // observed set.
    expectFail: [
      'the console surface exposes reduceMotion() as a function, not a boolean snapshot',
      'reduceMotion() answers true when the page asks for reduced motion',
      'reduceMotion() answers false when the page asks for no preference',
      'reduceMotion() answers false and does not throw on a platform with no matchMedia at all',
      'reduceMotion() re-reads the media query on every call, so a flipped preference is answered live',
    ],
  },
  'reduce-motion-always-false': {
    what: 'rev-18 regression: the live guard is replaced by an unconditional `return false`, so a page that really does ask for reduced motion is told it does not -- the two causes an arrow that jumps can have are merged again, which is the very thing this diagnostic exists to separate',
    anchor: REDUCE_MOTION_GUARD,
    to: '            return false;',
    expectFail: [
      'reduceMotion() answers true when the page asks for reduced motion',
      'reduceMotion() re-reads the media query on every call, so a flipped preference is answered live',
      'reduceMotion() asks the platform for exactly (prefers-reduced-motion: reduce)',
    ],
  },
  'reduce-motion-always-true': {
    what: 'rev-18 regression: the live guard is replaced by an unconditional `return true`, so EVERY page is reported as a reduced-motion environment -- a reader with a perfectly good animated turn is told the environment asked for no motion',
    anchor: REDUCE_MOTION_GUARD,
    to: '            return true;',
    expectFail: [
      'reduceMotion() answers false when the page asks for no preference',
      'reduceMotion() answers false and does not throw on a platform with no matchMedia at all',
      'reduceMotion() re-reads the media query on every call, so a flipped preference is answered live',
      'reduceMotion() asks the platform for exactly (prefers-reduced-motion: reduce)',
    ],
  },
  'reduce-motion-cached-after-first-call': {
    what: 'rev-18 regression: the first answer is cached on the sandbox and returned forever, so the diagnostic is live only until it is first called -- a preference flipped while the page is open is answered from the stale cache, which is the snapshot defect with extra steps',
    anchor: REDUCE_MOTION_RETURN,
    to: '            return window.__probeReduceMotionFrozen === undefined ? (window.__probeReduceMotionFrozen = Boolean(query && query.matches)) : window.__probeReduceMotionFrozen;',
    expectFail: [
      'reduceMotion() re-reads the media query on every call, so a flipped preference is answered live',
    ],
  },
  'reduce-motion-asks-the-wrong-query': {
    what: 'rev-18 regression: the diagnostic asks the platform the wrong question -- `(prefers-reduced-motion: no-preference)`, which is the opposite environment, so the answer is inverted on a real browser even though every other part of the function is intact',
    anchor: REDUCE_MOTION_QUERY,
    to: "            var query = window.matchMedia('(prefers-reduced-motion: no-preference)');",
    expectFail: [
      'reduceMotion() asks the platform for exactly (prefers-reduced-motion: reduce)',
    ],
  },
  'reduce-motion-snapshotted-into-sessionIcon': {
    what: 'rev-18 regression: the answer is smuggled into `sessionIcon` as a boolean read at install time -- the header-geometry snapshot stops being geometry, and a test that reads the snapshot is measuring a different thing from the live function a reader is told to call',
    anchor: SESSION_ICON_HOVER_KEY,
    to: SESSION_ICON_SNAPSHOT_INSERTION,
    expectFail: [
      'reduceMotion is not smuggled into the sessionIcon geometry snapshot',
    ],
  },
};

/** Replace exactly ONE occurrence, with the occurrence count measured (never assumed). */
function applyMutation(source, mutation) {
  const from = mutation.anchor;
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`anchor not found (0 occurrences): ${from}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`anchor is not unique (2+ occurrences): ${from}`);
  const mutated = source.slice(0, first) + mutation.to + source.slice(first + from.length);
  if (mutated === source) throw new Error(`substitution was a no-op: ${from}`);
  return mutated;
}

/* ============================================================ stylesheet model */

/**
 * Split `a,b{c:d;e:f}` text into rules, descending into at-rules such as @supports.
 *
 * rev-17 addition: every rule also records the `conditions` it was found under -- the enclosing
 * at-rule preludes, outermost first. The FLATTENED list is unchanged (same rules, same order,
 * same `order` numbers), so every check written before this round reads exactly what it read
 * before; what changes is that the media condition is no longer discarded. Without it a check
 * could not tell "the stylesheet says `transition:160ms`" from "the reduced-motion block says
 * `transition:none`", because both would land in the same cascade with the override last. (The
 * example named 160ms when rev-17 wrote this note; rev-18 moved that one duration to 400ms,
 * rev-19 kept it there and r20/t1 moved it to 160ms; the reasoning is about the SPLIT, not
 * about the number, and the split is what proves the override is gone.)
 */
function collectRules(text, rules, conditions = []) {
  let buffer = '';
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char !== '{') {
      buffer += char;
      index += 1;
      continue;
    }
    const prelude = buffer.trim();
    buffer = '';
    const close = matchingBrace(text, index);
    const body = text.slice(index + 1, close);
    if (prelude.startsWith('@')) {
      collectRules(body, rules, [...conditions, prelude]);
    } else if (prelude.length > 0) {
      rules.push({
        order: rules.length,
        prelude,
        conditions: [...conditions],
        selectors: prelude.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0),
        declarations: parseDeclarations(body),
      });
    }
    index = close + 1;
  }
}

function matchingBrace(text, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return text.length;
}

function parseDeclarations(body) {
  const declarations = new Map();
  for (const part of body.split(';')) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const name = part.slice(0, colon).trim();
    const value = part.slice(colon + 1).trim();
    if (name.length > 0 && value.length > 0) declarations.set(name, value);
  }
  return declarations;
}

/** (attributes + classes + pseudo-classes, element names) -- enough for a documented cascade. */
function specificity(selector) {
  const attributes = (selector.match(/\[[^\]]*\]/g) ?? []).length;
  const classes = (selector.match(/\.[A-Za-z0-9_-]+/g) ?? []).length;
  const pseudoClasses = (selector.match(/:(?!:)[A-Za-z-]+/g) ?? []).length;
  const elements = (selector.match(/(?:^|[\s>+~])[A-Za-z][A-Za-z0-9-]*/g) ?? []).length;
  return { b: attributes + classes + pseudoClasses, c: elements };
}

/**
 * Resolve one property for an element described by the selectors that MATCH it: the winning
 * declaration is the one with the highest specificity, and among equal specificity the last one
 * written -- what a browser does for a single origin.
 */
function resolveProperty(rules, matchingSelectors, property) {
  const candidates = [];
  for (const rule of rules) {
    const selector = rule.selectors.find((entry) => matchingSelectors.includes(entry));
    if (selector === undefined) continue;
    if (!rule.declarations.has(property)) continue;
    candidates.push({ selector, spec: specificity(selector), order: rule.order, value: rule.declarations.get(property) });
  }
  if (candidates.length === 0) return { value: null, selector: null, contributors: [] };
  candidates.sort((left, right) => (left.spec.b - right.spec.b) || (left.spec.c - right.spec.c) || (left.order - right.order));
  const winner = candidates[candidates.length - 1];
  return { value: winner.value, selector: winner.selector, contributors: candidates.map((entry) => entry.selector) };
}

/** The first `<number><unit>` duration in a `transition` value, in milliseconds (null if none). */
function transitionDurationMs(value) {
  const match = /(\d+(?:\.\d+)?)(ms|s)(?![\w])/.exec(String(value ?? ''));
  if (match === null) return null;
  return match[2] === 'ms' ? Number(match[1]) : Number(match[1]) * 1000;
}

/** True for every way CSS spells "this element carries no transform": no rule at all, `none`, blank. */
function isUnrotated(value) {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  return text === '' || text === 'none';
}

/* ============================================================ vm sandbox */

/** A recording document: it keeps every element, so the injected <style> can be read back. */
function makeDocument() {
  const elements = [];
  const listeners = new Map();
  return {
    elements,
    head: { appendChild: (node) => node },
    body: { appendChild: (node) => node },
    getElementById: (id) => elements.find((element) => element.id === id) ?? null,
    createElement(tag) {
      const element = {
        tag,
        id: '',
        textContent: '',
        attributes: {},
        children: [],
        style: {},
        setAttribute(name, value) { element.attributes[name] = value; },
        removeAttribute(name) { delete element.attributes[name]; },
        appendChild(node) { element.children.push(node); return node; },
        addEventListener() {},
        removeEventListener() {},
        getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
      };
      elements.push(element);
      return element;
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      const set = listeners.get(type);
      if (set) set.delete(handler);
    },
    querySelectorAll: () => [],
    querySelector: () => null,
  };
}

function makeAudioContext() {
  function AudioContext() {
    this.state = 'running';
    this.currentTime = 1;
    this.destination = { kind: 'destination' };
    this.resume = () => Promise.resolve();
    this.createGain = () => ({ gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect: (target) => target, disconnect() {} });
    this.createOscillator = () => ({ type: 'sine', frequency: { value: 0 }, connect: (target) => target, disconnect() {}, start() {}, stop() {} });
    this.createBufferSource = () => ({ buffer: null, connect: (target) => target, disconnect() {}, start() {}, stop() {} });
    this.decodeAudioData = () => Promise.resolve({ duration: 1 });
  }
  return AudioContext;
}

/* ---- the smallest function-component driver this bundle needs (useState/useRef/useEffect) */

function makeRuntime() {
  const state = { hooks: [], cursor: 0, effects: [], renders: 0 };
  return {
    state,
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false) };
    },
    useState(initial) {
      const index = state.cursor;
      state.cursor += 1;
      if (state.hooks[index] === undefined) state.hooks[index] = { value: initial };
      const set = (next) => { state.hooks[index].value = typeof next === 'function' ? next(state.hooks[index].value) : next; };
      return [state.hooks[index].value, set];
    },
    useRef(initial) {
      const index = state.cursor;
      state.cursor += 1;
      if (state.hooks[index] === undefined) state.hooks[index] = { ref: { current: initial } };
      return state.hooks[index].ref;
    },
    useEffect(run, deps) {
      const index = state.cursor;
      state.cursor += 1;
      const previous = state.hooks[index];
      const changed = previous === undefined || deps === undefined || previous.deps === undefined
        || previous.deps.length !== deps.length
        || deps.some((entry, position) => entry !== previous.deps[position]);
      if (changed) {
        state.hooks[index] = { deps };
        state.effects.push(run);
      }
    },
    useMemo(factory) { return factory(); },
    useCallback(fn) { return fn; },
  };
}

/** Render one function component, then run the effects it scheduled. */
function renderComponent(runtime, Component, props) {
  runtime.state.cursor = 0;
  runtime.state.effects = [];
  runtime.state.renders += 1;
  const tree = Component(props);
  const errors = [];
  for (const effect of runtime.state.effects) {
    try {
      const cleanup = effect();
      if (typeof cleanup === 'function') cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  return { tree, errors };
}

function walk(node, visit) {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) { for (const child of node) walk(child, visit); return; }
  if (typeof node !== 'object') return;
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function svgOf(tree, className) {
  let container = null;
  walk(tree, (node) => { if (container === null && node.props && node.props.className === className) container = node; });
  let svg = null;
  walk(container, (node) => { if (svg === null && node.type === 'svg') svg = node; });
  return svg;
}

/**
 * Evaluate one client source: the module contract is applied to a stub context, the injected
 * stylesheet and the console surface are read back, and the session bell is rendered.
 *
 * rev-18: `options.matchMedia` installs the platform function the new `reduceMotion()` diagnostic
 * asks. Omitting the option is NOT the same as passing a stub that says "no preference": it leaves
 * `window.matchMedia` undeclared, so `typeof window.matchMedia === 'undefined'`, which is the third
 * environment a check has to be able to build (the diagnostic is supposed to answer `false` there
 * without throwing). The sandbox itself is returned so a check can assert that the environment it
 * meant to build is the one it got -- an environment that is merely assumed is how a test ends up
 * measuring nothing.
 */
function loadClient(source, options = {}) {
  const ledger = { registrations: [], loadError: null, factoryError: null, applyErrors: [], renderErrors: [], entries: [], warnings: [] };
  const document = makeDocument();
  const sandbox = {
    console: { log() {}, info() {}, warn: (...args) => ledger.warnings.push(args.join(' ')), error() {}, debug() {} },
    setTimeout,
    clearTimeout,
    queueMicrotask,
    document,
    AudioContext: makeAudioContext(),
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener() {},
    removeEventListener() {},
  };
  sandbox.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, revision: 1, sessions: {} }) });
  for (const label of ['XMLHttpRequest', 'WebSocket', 'EventSource', 'Audio', 'Image', 'Worker']) {
    sandbox[label] = () => { throw new Error(`probe-20: ${label} is not available to this bundle`); };
  }
  sandbox.__ModuleLoader__ = { load: (registration) => ledger.registrations.push(registration) };
  if (options.matchMedia !== undefined) sandbox.matchMedia = options.matchMedia;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  try {
    vm.runInContext(source, context, { filename: CLIENT_PATH });
  } catch (error) {
    ledger.loadError = error;
  }

  const runtime = makeRuntime();
  let contract = null;
  if (ledger.loadError === null && ledger.registrations.length > 0) {
    try {
      contract = ledger.registrations[0].factory((specifier) => {
        if (specifier === 'react') return runtime;
        throw new Error(`probe-20: unexpected require(${JSON.stringify(specifier)})`);
      });
    } catch (error) {
      ledger.factoryError = error;
    }
  }

  if (contract !== null) {
    let currentSlot = null;
    const ctx = {
      slots: {
        inject(slot, factory) {
          const previous = currentSlot;
          currentSlot = slot;
          try { factory(); } catch (error) { ledger.applyErrors.push(error); } finally { currentSlot = previous; }
          return () => {};
        },
        register(entry, component) {
          ledger.entries.push({ slot: currentSlot, entry, component });
          return () => {};
        },
      },
      settingsScope: { bind() { throw new Error('probe-20: no settings scope in this sandbox'); } },
      locale: { register: () => ({ dispose() {} }) },
      effect(run) {
        try {
          const cleanup = run();
          return typeof cleanup === 'function' ? cleanup : () => {};
        } catch (error) {
          ledger.applyErrors.push(error);
          return () => {};
        }
      },
      logger: { warn() {}, info() {}, error() {}, debug() {} },
    };
    try {
      contract.apply(ctx);
    } catch (error) {
      ledger.applyErrors.push(error);
    }
  }

  const style = document.elements.find((element) => element.tag === 'style' && element.id === 'dsh-approval-chime/styles') ?? null;
  const diagnostics = sandbox.__DSH_APPROVAL_CHIME__ ?? null;

  let bell = null;
  const sessionEntry = ledger.entries.find((entry) => entry.slot === 'conversation.session.header.actions') ?? null;
  if (sessionEntry !== null) {
    try {
      const rendered = renderComponent(runtime, sessionEntry.component, { sessionId: 'session-a' });
      ledger.renderErrors.push(...rendered.errors);
      bell = rendered.tree;
    } catch (error) {
      ledger.renderErrors.push(error);
    }
  }

  return { ledger, styleText: style === null ? null : style.textContent, diagnostics, bell, styleCount: style === null ? 0 : 1, sandbox, runtime, sessionEntry };
}

/**
 * rev-18: the platform function `reduceMotion()` calls, built by this probe so the three
 * environments are three facts rather than three assumptions.
 *
 * `matches` is mutable on purpose: the check that pins "read live, not snapshotted" flips it
 * BETWEEN two calls on ONE loaded instance, which no install-time value can survive. `queries`
 * records every query string the bundle actually asked, so "asked the right question" is measured
 * and not inferred from the answer. (The stub answers `matches` whatever it was asked, exactly as a
 * stub should: the REAL query string is pinned separately, by `queries`.)
 */
function makeMatchMediaStub(matches) {
  const queries = [];
  const stub = (query) => {
    queries.push(String(query));
    return {
      media: String(query),
      matches: stub.matches,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    };
  };
  stub.matches = matches;
  stub.queries = queries;
  return stub;
}

/**
 * Call one diagnostic and describe what happened, so that a surface which lost the function (or one
 * that throws) becomes a RED CHECK instead of an exception escaping the whole probe. This is not
 * defensive decoration: in mutation mode a mutant is expected to break the diagnostic, and a probe
 * that crashed on the first broken mutant could not report which checks went red -- which is the
 * entire measurement.
 */
function callDiagnostic(fn) {
  if (typeof fn !== 'function') return { kind: typeof fn, value: undefined, threw: false, error: 'not a function' };
  try {
    return { kind: 'function', value: fn(), threw: false, error: null };
  } catch (error) {
    return { kind: 'function', value: undefined, threw: true, error: String(error) };
  }
}

/* ============================================================ the checks */

/**
 * Evaluate every claim against one source. Returns the check names that went red.
 * `verbose` prints the passing lines too (shipped run and single-mutation runs).
 */
function inspect(source, options = {}) {
  const verbose = options.verbose !== false;
  const results = [];
  const check = (name, ok, detail) => {
    const entry = { name, ok: ok === true, detail: detail === undefined ? '' : String(detail) };
    results.push(entry);
    if (verbose) console.log(`[${entry.ok ? 'PASS' : 'FAIL'}] ${name}${entry.detail.length > 0 ? ` -- ${entry.detail}` : ''}`);
  };
  const note = (label, value) => {
    if (!verbose) return;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    console.log(`    . ${label} = ${text === undefined ? 'undefined' : text}`);
  };
  const group = (title) => { if (verbose) console.log(`\n--- ${title} ---`); };

  const loaded = loadClient(source);
  const { styleText, diagnostics, bell, ledger } = loaded;

  group('0 - controls: the bundle really is the one that produced this stylesheet');
  check('the bundle evaluated without a load error', ledger.loadError === null, ledger.loadError === null ? 'ok' : String(ledger.loadError));
  check('the bundle produced a module contract and registered both slots', ledger.factoryError === null && ledger.entries.length === 2, `factoryError=${ledger.factoryError === null ? 'none' : String(ledger.factoryError)}, slot entries=${ledger.entries.length}`);
  check('the bundle injected exactly one stylesheet element', loaded.styleCount === 1, `style elements=${loaded.styleCount}`);
  check('the injected stylesheet carries the bell rules', styleText !== null && styleText.includes('.dacBell') && styleText.includes('.dacCaret'), `length=${styleText === null ? 'null' : styleText.length}`);
  check('the console surface exposes sessionIcon', diagnostics !== null && typeof diagnostics.sessionIcon === 'object' && diagnostics.sessionIcon !== null, diagnostics === null ? 'no __DSH_APPROVAL_CHIME__' : Object.keys(diagnostics.sessionIcon ?? {}).join(','));
  note('stylesheet sha256', styleText === null ? 'null' : sha256(styleText).slice(0, 16));
  note('sessionIcon', diagnostics === null ? null : diagnostics.sessionIcon);

  const rules = styleText === null ? [] : (() => { const collected = []; collectRules(styleText, collected); return collected; })();
  const sessionIcon = (diagnostics === null ? {} : diagnostics.sessionIcon) ?? {};
  const onBackground = sessionIcon.onBackground;
  const onForeground = sessionIcon.onForeground;
  const onBackgroundHover = sessionIcon.onBackgroundHover;

  const audible = resolveProperty(rules, ['.dacBell', '.dacBell[data-muted="false"]'], 'background');
  const audibleForeground = resolveProperty(rules, ['.dacBell', '.dacBell[data-muted="false"]'], 'color');
  const audibleHover = resolveProperty(rules, ['.dacBell:hover', '.dacBell[data-muted="false"]:hover'], 'background');
  const muted = resolveProperty(rules, ['.dacBell', '.dacBell[data-muted="true"]'], 'background');
  const mutedForeground = resolveProperty(rules, ['.dacBell', '.dacBell[data-muted="true"]'], 'color');
  const bare = resolveProperty(rules, ['.dacBell'], 'background');
  const bellBoxWidth = resolveProperty(rules, ['.dacBell'], 'width');
  const bellBoxHeight = resolveProperty(rules, ['.dacBell'], 'height');
  const caretBoxWidth = resolveProperty(rules, ['.dacCaret'], 'width');
  const caretBoxHeight = resolveProperty(rules, ['.dacCaret'], 'height');
  const wrapGap = resolveProperty(rules, ['.dacBellWrap'], 'gap');

  group('1 - rev-13 geometry: the console surface and the CSS and the rendered glyph agree');
  check(
    'sessionIcon reports the bell geometry 28/16/22/11x16 and the rev-16 gap',
    sessionIcon.bellBoxPx === 28 && sessionIcon.caretBoxPx === 16 && sessionIcon.bellGlyphPx === 22 && sessionIcon.caretGlyph === '11x16' && sessionIcon.bellGapPx === 6,
    `bellBoxPx=${sessionIcon.bellBoxPx} caretBoxPx=${sessionIcon.caretBoxPx} bellGlyphPx=${sessionIcon.bellGlyphPx} caretGlyph=${sessionIcon.caretGlyph} bellGapPx=${sessionIcon.bellGapPx}`,
  );
  check(
    'the bell box in the CSS is bellBoxPx square',
    bellBoxWidth.value === `${sessionIcon.bellBoxPx}px` && bellBoxHeight.value === `${sessionIcon.bellBoxPx}px`,
    `css=${bellBoxWidth.value}x${bellBoxHeight.value} diagnostics=${sessionIcon.bellBoxPx}px`,
  );
  check(
    'the caret box in the CSS is caretBoxPx wide and bellBoxPx tall',
    caretBoxWidth.value === `${sessionIcon.caretBoxPx}px` && caretBoxHeight.value === `${sessionIcon.bellBoxPx}px`,
    `css=${caretBoxWidth.value}x${caretBoxHeight.value} diagnostics=${sessionIcon.caretBoxPx}x${sessionIcon.bellBoxPx}`,
  );
  // rev-16 user request ("这个铃铛和箭头分开点"): the two halves must not sit flush. The check is a
  // conjunction on purpose -- the CSS must carry the reported gap AND the reported gap must be the
  // requested 6px -- so that neither a CSS-only edit nor a constant-only edit can satisfy it. The
  // two declared mutants in this file falsify each half separately.
  check(
    'the wrapper separates the bell from its caret by sessionIcon.bellGapPx',
    wrapGap.value === `${sessionIcon.bellGapPx}px` && sessionIcon.bellGapPx === 6,
    `css=${wrapGap.value} diagnostics=${sessionIcon.bellGapPx}px`,
  );
  const bellSvg = svgOf(bell, 'dacBell');
  const caretSvg = svgOf(bell, 'dacCaret');
  const [caretGlyphWidth, caretGlyphHeight] = String(sessionIcon.caretGlyph ?? '').split('x');
  check(
    'the rendered bell glyph is bellGlyphPx x bellGlyphPx',
    bellSvg !== null && bellSvg.props.width === sessionIcon.bellGlyphPx && bellSvg.props.height === sessionIcon.bellGlyphPx,
    bellSvg === null ? `no bell svg rendered (${ledger.renderErrors.length} render error(s): ${String(ledger.renderErrors[0] ?? '')})` : `rendered=${bellSvg.props.width}x${bellSvg.props.height} diagnostics=${sessionIcon.bellGlyphPx}`,
  );
  check(
    'the rendered caret glyph is caretGlyph',
    caretSvg !== null && String(caretSvg.props.width) === caretGlyphWidth && String(caretSvg.props.height) === caretGlyphHeight,
    caretSvg === null ? 'no caret svg rendered' : `rendered=${caretSvg.props.width}x${caretSvg.props.height} diagnostics=${sessionIcon.caretGlyph}`,
  );

  group('2 - the audible fill is the shared design token, declared on the audible state');
  check(
    'the resolved fill of the audible state is exactly sessionIcon.onBackground',
    audible.value === onBackground && onBackground !== undefined,
    `resolved=${audible.value} sessionIcon.onBackground=${onBackground}`,
  );
  check(
    'that fill is a design token, never a literal colour',
    typeof audible.value === 'string' && /^var\(--./.test(audible.value),
    `resolved=${audible.value}`,
  );
  check(
    'the resolved fill of the audible state is declared by the audible selector',
    audible.selector === '.dacBell[data-muted="false"]',
    `winning selector=${audible.selector} contributors=${JSON.stringify(audible.contributors)}`,
  );
  check(
    'the glyph on that fill is exactly sessionIcon.onForeground',
    audibleForeground.value === onForeground,
    `resolved=${audibleForeground.value} sessionIcon.onForeground=${onForeground}`,
  );

  group('3 - the muted state keeps no fill and a caption-grey glyph');
  check(
    'a muted bell resolves to no fill (transparent)',
    muted.value === 'transparent',
    `resolved=${muted.value} (contributors ${JSON.stringify(muted.contributors)})`,
  );
  check(
    'the bare .dacBell class resolves to no fill (transparent)',
    bare.value === 'transparent',
    `resolved=${bare.value} (winner ${bare.selector})`,
  );
  const mutedBackgroundRules = rules.filter((rule) => rule.selectors.includes('.dacBell[data-muted="true"]') && rule.declarations.has('background'));
  check(
    'no rule naming the muted state declares a background',
    mutedBackgroundRules.length === 0,
    `${mutedBackgroundRules.length} rule(s): ${JSON.stringify(mutedBackgroundRules.map((rule) => rule.prelude))}`,
  );
  check(
    'the muted glyph keeps a caption-grey token, not the paint',
    typeof mutedForeground.value === 'string'
      && /var\(--dsw-alias-label-caption/.test(mutedForeground.value)
      && mutedForeground.value !== onBackground
      && mutedForeground.value !== onForeground,
    `resolved=${mutedForeground.value}`,
  );

  group('4 - the audible hover survives the generic .dacBell:hover');
  const audibleHoverRule = rules.find((rule) => rule.selectors.includes('.dacBell[data-muted="false"]:hover') && rule.declarations.has('background')) ?? null;
  check(
    'the audible state declares its own :hover paint',
    audibleHoverRule !== null,
    audibleHoverRule === null ? 'no rule names .dacBell[data-muted="false"]:hover with a background' : `${audibleHoverRule.prelude}{background:${audibleHoverRule.declarations.get('background')}}`,
  );
  check(
    'the resolved audible hover is exactly sessionIcon.onBackgroundHover',
    audibleHover.value === onBackgroundHover && onBackgroundHover !== undefined,
    `resolved=${audibleHover.value} sessionIcon.onBackgroundHover=${onBackgroundHover}`,
  );
  check(
    'the audible hover paint is derived from the same token',
    typeof audibleHover.value === 'string' && typeof onBackground === 'string'
      && audibleHover.value !== onBackground && audibleHover.value.includes(onBackground),
    `resolved hover=${audibleHover.value} token=${onBackground}`,
  );
  check(
    'the audible hover is not the generic grey hover',
    audibleHover.value !== 'var(--dsw-alias-interactive-bg-hover,rgba(120,120,128,.16))',
    `resolved=${audibleHover.value}`,
  );

  /* -----------------------------------------------------------------------------------------
   * rev-17 (user request: the arrow beside the bell turns down while its popover is open).
   *
   * Same three sources as every check above and nothing else: the stylesheet the bundle really
   * appended, the console surface, and the rendered tree. The stylesheet is resolved TWICE,
   * though: `noMotionRules` is the cascade a reader WITHOUT the preference sees, and
   * `reduceMotionRules` is what the `prefers-reduced-motion` blocks say — since r20/t1 that is the
   * EMPTY set, and the split is what lets this group assert that positively instead of grepping the
   * sheet for the absence of a string. The field was added to `collectRules` for the opposite
   * reading (with one flattened list an override would simply be the last `transition`
   * declaration); the flattening itself is unchanged.
   * --------------------------------------------------------------------------------------- */
  const underReducedMotion = (condition) => /prefers-reduced-motion/i.test(condition);
  const noMotionRules = rules.filter((rule) => !rule.conditions.some(underReducedMotion));
  const reduceMotionRules = rules.filter((rule) => rule.conditions.some(underReducedMotion));
  const caretRotate = resolveProperty(noMotionRules, ['.dacCaret svg', '.dacCaret[data-open="true"] svg'], 'transform');
  const caretIdleBare = resolveProperty(noMotionRules, ['.dacCaret svg'], 'transform');
  const caretIdleSpelled = resolveProperty(noMotionRules, ['.dacCaret svg', '.dacCaret[data-open="false"] svg'], 'transform');
  const caretButtonOpen = resolveProperty(noMotionRules, ['.dacCaret', '.dacCaret[data-open="true"]'], 'transform');
  const caretButtonIdle = resolveProperty(noMotionRules, ['.dacCaret', '.dacCaret[data-open="false"]'], 'transform');
  const caretTransition = resolveProperty(noMotionRules, ['.dacCaret svg'], 'transition');

  group('5 - rev-17: the caret glyph turns a quarter turn and the button box is left alone');
  // The turn itself. Both halves are load-bearing and they are pinned separately on purpose:
  // "the CSS agrees with the console surface" is satisfied by any self-consistent angle, and
  // only the absolute 90 below pins the right angle, so the two live in two checks and the two
  // mutations next to them prove each half can fail alone.
  check(
    'the open caret glyph resolves to a quarter turn of sessionIcon.caretOpenRotateDeg',
    typeof sessionIcon.caretOpenRotateDeg === 'number'
      && caretRotate.value === `rotate(${sessionIcon.caretOpenRotateDeg}deg)`,
    `resolved=${caretRotate.value} sessionIcon.caretOpenRotateDeg=${sessionIcon.caretOpenRotateDeg} winner=${caretRotate.selector}`,
  );
  check(
    'sessionIcon reports that quarter turn as exactly 90 degrees',
    sessionIcon.caretOpenRotateDeg === 90,
    `caretOpenRotateDeg=${sessionIcon.caretOpenRotateDeg}`,
  );
  check(
    'the closed caret glyph carries no rotation, bare and with the closed attribute spelled out',
    isUnrotated(caretIdleBare.value) && isUnrotated(caretIdleSpelled.value),
    `bare=${caretIdleBare.value} data-open="false"=${caretIdleSpelled.value}`,
  );
  // The animation, not the end state: the property must be named (a bare `160ms` on `all` is not
  // the claim) and the duration must be the one the console surface reports.
  check(
    'the caret glyph transitions on transform for sessionIcon.caretRotateMs',
    typeof sessionIcon.caretRotateMs === 'number'
      && caretTransition.value !== null
      && /(?:^|[\s,])transform(?:[\s,]|$)/.test(caretTransition.value)
      && transitionDurationMs(caretTransition.value) === sessionIcon.caretRotateMs,
    `resolved=${caretTransition.value} parsed=${transitionDurationMs(caretTransition.value)}ms sessionIcon.caretRotateMs=${sessionIcon.caretRotateMs}`,
  );
  // r18/t2 moved the absolute pin 160 -> 300 and the check NAME with it; r19/t2 moved the pin
  // 300 -> 400 the same way and moved that NAME with it again; r20/t1 moved it 400 ->
  // 160 (the user asked for the round trip's starting value back, and the reason no duration was
  // ever played at all was the override the check below now asserts the absence of, not the number).
  // The layer is unchanged -- this is still "the value the CSS and the console surface agree on is
  // THE declared value", which is the only thing the self-consistency check above cannot see -- and
  // `caret-turn-ms-250` is still the mutant that falsifies it.
  check(
    'sessionIcon reports that transition duration as exactly 160 milliseconds',
    sessionIcon.caretRotateMs === 160,
    `caretRotateMs=${sessionIcon.caretRotateMs}`,
  );
  // r20/t1 · the override is GONE, and this is where the round's central claim is measured:
  // the caret turn must not be damped in ANY environment. `reduceMotionRules` is every rule that sits
  // under a reduced-motion condition, and the shipped stylesheet must contribute none -- the reporting
  // user's system is in that environment, and the deleted override is why no duration was ever played
  // there. `caret-turn-reduced-motion-restored` is the mutant that puts it back and reddens exactly
  // this check.
  const caretMotionRules = reduceMotionRules.filter((rule) => rule.selectors.includes('.dacCaret svg'));
  check(
    'the caret turn is NOT damped in any environment: no prefers-reduced-motion rule names it (rev-20)',
    reduceMotionRules.length === 0 && caretMotionRules.length === 0,
    `reduced-motion rules in the shipped stylesheet=${reduceMotionRules.length}, naming .dacCaret svg=${caretMotionRules.length}`,
  );
  // rev-17's second half: the rotated node. The turn is resolved through the GLYPH selectors
  // above; here the button must stay untransformed in both states and keep its 16x28 box, so a
  // turn hung on `.dacCaret` (a 28x16 hover pill) cannot pass as "the arrow turned".
  check(
    'the quarter turn is put on the <svg> glyph and the caret button box is left alone',
    isUnrotated(caretButtonOpen.value) && isUnrotated(caretButtonIdle.value)
      && caretBoxWidth.value === `${sessionIcon.caretBoxPx}px` && caretBoxHeight.value === `${sessionIcon.bellBoxPx}px`,
    `button open=${caretButtonOpen.value} closed=${caretButtonIdle.value} box=${caretBoxWidth.value}x${caretBoxHeight.value} diagnostics=${sessionIcon.caretBoxPx}x${sessionIcon.bellBoxPx}`,
  );

  /* -----------------------------------------------------------------------------------------
   * rev-18 (the device report behind this round) -- the OTHER half of the same turn.
   *
   * Group 5 pins the turn itself: its angle, its CSS transition, its duration, and the fact that
   * NOTHING damps it. Since r20/t1 the diagnostic is an environment report rather than the second
   * half of a two-cause story: the old story was that an observer looking at a jumping arrow could not
   * tell "160 ms is still too fast on this device" from "this environment asked for no motion,
   * and the stylesheet correctly turned the transition off" -- and the device that reported the jump
   * was in the second case, which is why the override is gone.
   * That is a question only the page can answer, which is why rev-18 added
   * `__DSH_APPROVAL_CHIME__.reduceMotion()`. This group measures that answer in the three
   * environments it has to be right in, and it builds all three itself: the sandbox below is the
   * only `window` the bundle ever sees.
   *
   *   `absent`  -- the load every check above already uses: NO `matchMedia` declared at all;
   *   `reduced` -- a stub whose query reports the preference;
   *   `live`    -- a stub that reports no preference, then is FLIPPED to the preference between two
   *                calls on the SAME loaded instance. That flip is the only way to tell a live read
   *                from a value captured when the surface was installed, and it is why the stub's
   *                answer is mutable while the query it was asked is recorded separately.
   * Every answer is read from what the sandbox was TOLD to say; nothing here trusts a number in the
   * bundle's own text, and nothing calls the diagnostic without catching -- a mutant that replaces
   * the function has to produce a red check, not a crashed probe.
   * --------------------------------------------------------------------------------------- */
  const prefersReducedMotionQuery = '(prefers-reduced-motion: reduce)';
  const liveStub = makeMatchMediaStub(false);
  const reducedStub = makeMatchMediaStub(true);
  const reduced = loadClient(source, { matchMedia: reducedStub });
  const live = loadClient(source, { matchMedia: liveStub });
  const diagnosticOf = (loadedSource) => (loadedSource.diagnostics === null ? undefined : loadedSource.diagnostics.reduceMotion);
  const absentAnswer = callDiagnostic(diagnosticOf(loaded));
  const reducedAnswer = callDiagnostic(diagnosticOf(reduced));
  const liveAnswer = callDiagnostic(diagnosticOf(live));
  liveStub.matches = true;
  const liveAnswerAfterFlip = callDiagnostic(diagnosticOf(live));
  const liveQueries = liveStub.queries.slice();

  group('6 - rev-18: reduceMotion() answers the live media query, in every environment');
  check(
    'the console surface exposes reduceMotion() as a function, not a boolean snapshot',
    absentAnswer.kind === 'function' && reducedAnswer.kind === 'function' && liveAnswer.kind === 'function',
    `typeof __DSH_APPROVAL_CHIME__.reduceMotion: without matchMedia=${absentAnswer.kind}, preference reported=${reducedAnswer.kind}, no preference=${liveAnswer.kind}`,
  );
  check(
    'reduceMotion() answers true when the page asks for reduced motion',
    reducedAnswer.threw === false && reducedAnswer.value === true && reducedStub.matches === true,
    `stub.matchMedia('${prefersReducedMotionQuery}').matches=true -> threw=${reducedAnswer.threw} value=${JSON.stringify(reducedAnswer.value)}`,
  );
  check(
    'reduceMotion() answers false when the page asks for no preference',
    liveAnswer.threw === false && liveAnswer.value === false,
    `same stub with matches=false -> threw=${liveAnswer.threw} value=${JSON.stringify(liveAnswer.value)}`,
  );
  // The environment is asserted, not assumed: if a later edit hands this sandbox a `matchMedia`, the
  // check says so instead of quietly measuring the wrong case. And a throw here is a hard failure --
  // "answer false" is the claim, not "survive by accident".
  check(
    'reduceMotion() answers false and does not throw on a platform with no matchMedia at all',
    typeof loaded.sandbox.matchMedia === 'undefined' && absentAnswer.threw === false && absentAnswer.value === false,
    `typeof window.matchMedia=${typeof loaded.sandbox.matchMedia} threw=${absentAnswer.threw}${absentAnswer.threw ? ` (${absentAnswer.error})` : ''} value=${JSON.stringify(absentAnswer.value)}`,
  );
  // The falsifier of "live, not snapshotted": ONE instance, two different environments, in that
  // order. A value captured at install time can satisfy any single call above; it cannot follow this.
  check(
    'reduceMotion() re-reads the media query on every call, so a flipped preference is answered live',
    liveAnswer.threw === false && liveAnswer.value === false && liveAnswerAfterFlip.threw === false && liveAnswerAfterFlip.value === true,
    `one instance, no reload: matches=false -> ${JSON.stringify(liveAnswer.value)}, then matches flipped to true -> ${JSON.stringify(liveAnswerAfterFlip.value)}`,
  );
  check(
    'reduceMotion() asks the platform for exactly (prefers-reduced-motion: reduce)',
    liveQueries.length > 0 && liveQueries.every((query) => query === prefersReducedMotionQuery),
    `queries the stub recorded on the live instance=${JSON.stringify(liveQueries)}`,
  );
  // The note on the property says two things about its SHAPE, and this is the second one: the answer
  // is not geometry, so it must not live in the geometry snapshot. The key list is pinned as a whole,
  // because "reduceMotion is absent" is trivially true of a sessionIcon that lost everything else.
  check(
    'reduceMotion is not smuggled into the sessionIcon geometry snapshot',
    !('reduceMotion' in sessionIcon) && JSON.stringify(Object.keys(sessionIcon).sort()) === JSON.stringify(SESSION_ICON_KEYS),
    `sessionIcon keys=${JSON.stringify(Object.keys(sessionIcon).sort())} (expected ${JSON.stringify(SESSION_ICON_KEYS)}), 'reduceMotion' in sessionIcon=${'reduceMotion' in sessionIcon}`,
  );

  /* -----------------------------------------------------------------------------------------
   * rev-24 (user request: "不要晃动，静音时把斜杠重左上拉到右下的动画") -- the MUTE is DRAWN.
   *
   * Group 1 pins what the bell LOOKS like; this group pins what it DOES when it is toggled, and it
   * reads all of it through this file's OWN model (`collectRules` / `resolveProperty`) against the
   * stylesheet the bundle really appended -- not through the author suite's reading of it.
   *
   * Where the author suite compares one rule at a time, this group SIMULATES THE CASCADE for the
   * four states the control can be in (audible/muted x clicked/not-yet-clicked) and asks what the
   * browser would compute in each. That is the difference worth having: "the armed slash animates"
   * is a claim about the WINNER among rules of different specificity, and a per-rule equality cannot
   * see a later rule quietly out-ranking it.
   *
   * Three things must agree:
   *   - the DURATION and the DRAWN LENGTH are reported by the console surface;
   *   - the four armed rules carry exactly those numbers, while every UNARMED state resolves to NO
   *     animation at all -- a bell that was never clicked must not move, and neither must one that
   *     merely LOADED muted (that one already shows the stroke, which is why the ink is `opacity`,
   *     and not a dash offset that would leave a round cap on one end and drag the next repetition
   *     of the dash in at the other);
   *   - the @keyframes those rules name are generated from the same length, carry `opacity` in BOTH
   *     frames, and neither fill direction uses `forwards` (a held fill would out-rank `:hover`).
   *
   * THE BELL DOES NOT MOVE is asserted as an ABSENCE on the resolved cascade and on the raw source,
   * because that is the property a later edit breaks by re-adding a keyframe nobody asked for.
   *
   * The reduced-motion assertion is scoped to the BELL on purpose. `caret-turn-reduced-motion-restored`
   * is declared to redden the CARET check in group 5; a bell-scoped check here must stay GREEN for that
   * mutant, or the mutant's red set would grow and this file's falsifiability contract would break.
   * (The whole-sheet "no reduced-motion rule at all" assertion already lives in group 5.)
   *
   * The click half is driven through this file's OWN renderer: `renderComponent` re-invokes the
   * component against the hook state the previous render left behind, which is what makes "click, then
   * look again" measurable without a browser. What it cannot show is React's reconciliation -- the
   * replacement that replays the animation is inferred from the changed key, and only a real browser
   * can watch the frames.
   * --------------------------------------------------------------------------------------- */
  group('7 - rev-24: muting draws the slash and the bell never moves');
  const bellMuteMs = sessionIcon.bellMuteMs;
  const bellSlashLen = sessionIcon.bellSlashLen;
  const DRAW_EASE_REV24 = 'cubic-bezier(0.22,1,0.36,1)';
  const SWEEP_EASE_REV24 = 'cubic-bezier(0.42,0,0.58,1)';

  /* The set of rules that MATCH one element in one state, handed to `resolveProperty` so the winning
   * declaration is chosen by specificity and written order the way a browser chooses it, instead of by
   * this file picking the rule it hopes wins. */
  const slashState = (muted, armed) => {
    const state = ['.dacSlash'];
    if (muted) state.push('.dacBell[data-muted="true"] .dacSlash');
    if (armed) state.push('.dacBell[data-draw="true"][data-muted="' + String(muted) + '"] .dacSlash');
    return state;
  };
  const buttonState = (muted, armed) => {
    const state = ['.dacBell', '.dacBell[data-muted="' + String(muted) + '"]'];
    if (armed) state.push('.dacBell[data-draw="true"][data-muted="' + String(muted) + '"]');
    return state;
  };
  const slashResolved = (muted, armed, property) => resolveProperty(rules, slashState(muted, armed), property).value;
  const buttonResolved = (muted, armed, property) => resolveProperty(rules, buttonState(muted, armed), property).value;
  const slashMutedArmed = slashResolved(true, true, 'animation');
  const slashAudibleArmed = slashResolved(false, true, 'animation');
  const buttonMutedArmed = buttonResolved(true, true, 'animation');
  const buttonAudibleArmed = buttonResolved(false, true, 'animation');
  const durationOfRev24 = (value) => {
    const hit = /(\d+(?:\.\d+)?)ms/.exec(String(value ?? ''));
    return hit === null ? null : Number(hit[1]);
  };

  check(
    'the console surface reports the mute gesture duration and the drawn length of the diagonal',
    bellMuteMs === 240 && bellSlashLen === 15.27,
    `sessionIcon.bellMuteMs=${String(bellMuteMs)} sessionIcon.bellSlashLen=${String(bellSlashLen)}`,
  );

  /* 1 -- THE BELL DOES NOT MOVE: no rule, in any state, gives the glyph or the button a transform or
   * an animation, and no keyframe or attribute of the two rejected motions survives in the source. */
  check(
    'the glyph resolves to NO animation and NO transform at all',
    isUnrotated(resolveProperty(rules, ['.dacBell svg'], 'transform').value)
      && resolveProperty(rules, ['.dacBell svg'], 'animation').value === null,
    `transform=${String(resolveProperty(rules, ['.dacBell svg'], 'transform').value)} animation=${String(resolveProperty(rules, ['.dacBell svg'], 'animation').value)}`,
  );
  check(
    'and the 28px button that carries the hover pill resolves to no transform either',
    isUnrotated(resolveProperty(rules, ['.dacBell'], 'transform').value),
    `transform=${String(resolveProperty(rules, ['.dacBell'], 'transform').value)}`,
  );
  check(
    'no tilt keyframes, no tilt attribute and no dead tilt or dash constant survive in the source',
    ['dacBellTilt', 'data-tilt', 'BELL_TILT', 'bellTilt', 'BELL_SLASH_MS'].every((token) => !SHIPPED.includes(token)),
    `survivors=${JSON.stringify(['dacBellTilt', 'data-tilt', 'BELL_TILT', 'bellTilt', 'BELL_SLASH_MS'].filter((token) => SHIPPED.includes(token)))}`,
  );

  /* 2 -- the four armed rules, each carrying the duration and the curve the console surface reports. */
  check(
    'going MUTED draws the slash for the reported duration with the draw curve',
    slashMutedArmed === `dacSlashDraw ${bellMuteMs}ms ${DRAW_EASE_REV24}`,
    `resolved animation=${String(slashMutedArmed)}`,
  );
  check(
    'going AUDIBLE sweeps it away for the SAME duration, filling forwards so the end state sticks',
    slashAudibleArmed === `dacSlashSweep ${bellMuteMs}ms ${SWEEP_EASE_REV24} forwards`,
    `resolved animation=${String(slashAudibleArmed)}`,
  );
  check(
    'the two directions really are one duration -- "两个动画时长一样", measured from the sheet',
    durationOfRev24(slashMutedArmed) === bellMuteMs && durationOfRev24(slashAudibleArmed) === bellMuteMs,
    `muted=${String(durationOfRev24(slashMutedArmed))}ms audible=${String(durationOfRev24(slashAudibleArmed))}ms surface=${String(bellMuteMs)}ms`,
  );
  check(
    'the blue fill dims and returns on that same duration, on the BUTTON rather than on the glyph',
    buttonMutedArmed === `dacBellDim ${bellMuteMs}ms ${SWEEP_EASE_REV24}`
      && buttonAudibleArmed === `dacBellGlow ${bellMuteMs}ms ${DRAW_EASE_REV24}`,
    `dim=${String(buttonMutedArmed)} glow=${String(buttonAudibleArmed)}`,
  );
  check(
    'the slash and the fill SWAP curves between the two directions, so one eases out while the other eases in and out',
    String(slashMutedArmed).includes(DRAW_EASE_REV24) && String(buttonMutedArmed).includes(SWEEP_EASE_REV24)
      && String(slashAudibleArmed).includes(SWEEP_EASE_REV24) && String(buttonAudibleArmed).includes(DRAW_EASE_REV24),
    `muted: slash=${String(slashMutedArmed)} fill=${String(buttonMutedArmed)} / audible: slash=${String(slashAudibleArmed)} fill=${String(buttonAudibleArmed)}`,
  );
  check(
    'neither fill direction holds its end state with forwards, while the sweep does',
    !String(buttonMutedArmed).includes('forwards') && !String(buttonAudibleArmed).includes('forwards')
      && String(slashAudibleArmed).includes('forwards'),
    `dim=${String(buttonMutedArmed)} glow=${String(buttonAudibleArmed)} sweep=${String(slashAudibleArmed)}`,
  );

  /* 3 -- NOTHING MOVES BEFORE THE FIRST CLICK, in either direction. */
  check(
    'an audible bell that was never clicked resolves to NO animation on the slash or on the button',
    slashResolved(false, false, 'animation') === null && buttonResolved(false, false, 'animation') === null,
    `slash=${String(slashResolved(false, false, 'animation'))} button=${String(buttonResolved(false, false, 'animation'))}`,
  );
  check(
    'a bell that LOADED muted shows the stroke with no animation either',
    slashResolved(true, false, 'animation') === null && slashResolved(true, false, 'opacity') === '1',
    `animation=${String(slashResolved(true, false, 'animation'))} opacity=${String(slashResolved(true, false, 'opacity'))}`,
  );
  /* THE ZERO-INK CLAIM, and why it is `opacity` rather than a dash offset: a single-value
   * `stroke-dasharray` repeats every 2*LEN, so LEN lands a round cap on the far end (the DOT the user
   * reported) and LEN+margin drags the next repetition in at the near end (the STUB LINE they reported
   * next). Both were seen; hiding by opacity cannot be defeated by any dash geometry. */
  check(
    'while AUDIBLE the slash resolves to zero opacity with the dash still fully drawn',
    slashResolved(false, true, 'opacity') === '0' && slashResolved(false, true, 'stroke-dashoffset') === '0'
      && slashResolved(false, true, 'stroke-dasharray') === String(bellSlashLen),
    `opacity=${String(slashResolved(false, true, 'opacity'))} dashoffset=${String(slashResolved(false, true, 'stroke-dashoffset'))} dasharray=${String(slashResolved(false, true, 'stroke-dasharray'))}`,
  );
  check(
    'and no audible-state rule overrides it -- hiding lives in the base rule',
    !styleText.includes('.dacBell[data-muted="false"] .dacSlash'),
    `override present=${String(styleText.includes('.dacBell[data-muted="false"] .dacSlash'))}`,
  );

  /* 4 -- the generated keyframes, read out of the sheet this probe parsed itself. */
  const slashSteps = (name) => rules.filter((rule) => rule.conditions.some((condition) => condition.startsWith('@keyframes ' + name)));
  /* A step's own name is its PRELUDE, not a condition: `collectRules` records the enclosing at-rules
   * in `conditions` and the step itself in `prelude` (read off the parser, not assumed). */
  const stepOf = (steps, at) => steps.find((rule) => rule.prelude === at);
  const drawSteps = slashSteps('dacSlashDraw');
  const sweepSteps = slashSteps('dacSlashSweep');
  const drawFrom = stepOf(drawSteps, 'from');
  const drawTo = stepOf(drawSteps, 'to');
  const sweepFrom = stepOf(sweepSteps, 'from');
  const sweepTo = stepOf(sweepSteps, 'to');
  check(
    'the draw runs from the full dash length to zero, and the sweep from zero to the negative length',
    drawFrom?.declarations.get('stroke-dashoffset') === String(bellSlashLen)
      && drawTo?.declarations.get('stroke-dashoffset') === '0'
      && sweepFrom?.declarations.get('stroke-dashoffset') === '0'
      && sweepTo?.declarations.get('stroke-dashoffset') === '-' + String(bellSlashLen),
    `draw ${String(drawFrom?.declarations.get('stroke-dashoffset'))}->${String(drawTo?.declarations.get('stroke-dashoffset'))} sweep ${String(sweepFrom?.declarations.get('stroke-dashoffset'))}->${String(sweepTo?.declarations.get('stroke-dashoffset'))} length=${String(bellSlashLen)}`,
  );
  check(
    'and all four of those steps animate opacity, which is what leaves no dot and no stub behind',
    [drawFrom, drawTo, sweepFrom, sweepTo].every((rule) => rule !== undefined && rule.declarations.has('opacity')),
    `opacity tracks=${JSON.stringify([drawFrom, drawTo, sweepFrom, sweepTo].map((rule) => String(rule?.declarations.get('opacity'))))}`,
  );
  check(
    'the fill has its two generated directions as well',
    slashSteps('dacBellDim').length > 0 && slashSteps('dacBellGlow').length > 0,
    `dim steps=${slashSteps('dacBellDim').length} glow steps=${slashSteps('dacBellGlow').length}`,
  );

  /* 5 -- the reduced-motion stance, scoped to the bell on purpose (see the note above). */
  const bellRulesUnderReducedMotionRev24 = reduceMotionRules.filter((rule) => rule.selectors.some((selector) => selector.includes('.dacBell')));
  check(
    'no reduced-motion rule names the bell, so the draw plays in every environment',
    bellRulesUnderReducedMotionRev24.length === 0,
    `reduced-motion rules naming .dacBell=${bellRulesUnderReducedMotionRev24.length} (all reduced-motion rules in the sheet=${reduceMotionRules.length})`,
  );

  /* 6 -- the rendered control: silently painted first, armed by the click, and the stroke pushed BEFORE
   * the bell so the silhouette paints over it (SVG has no z-index, and the user reported the slash
   * sitting on top of the bell). */
  const bellButtonOfRev24 = (tree) => {
    let found = null;
    walk(tree, (node) => {
      if (found === null && node.props && node.props.className === 'dacBell') found = node;
    });
    return found;
  };
  const glyphOfRev24 = (tree) => {
    const button = bellButtonOfRev24(tree);
    return button === null ? null : (button.children ?? [])[0] ?? null;
  };
  const glyphKeyOfRev24 = (tree) => String(glyphOfRev24(tree)?.props?.key ?? '');
  const pathKeysOfRev24 = (tree) => ((glyphOfRev24(tree)?.children) ?? []).map((node) => String(node?.props?.key ?? ''));
  check(
    'the rendered bell starts UN-ARMED: the draw is armed by a click, never by the load',
    bellButtonOfRev24(bell) !== null && bellButtonOfRev24(bell).props['data-draw'] === 'false' && glyphKeyOfRev24(bell) === 'glyph0',
    bellButtonOfRev24(bell) === null ? 'no .dacBell rendered' : `data-draw=${JSON.stringify(bellButtonOfRev24(bell).props['data-draw'])} glyph key=${JSON.stringify(glyphKeyOfRev24(bell))}`,
  );
  check(
    'and it carries no slash node at all before it is ever clicked -- still the two paths of rev-10',
    JSON.stringify(pathKeysOfRev24(bell)) === JSON.stringify(['bell', 'clapper']),
    `path keys=${JSON.stringify(pathKeysOfRev24(bell))}`,
  );
  const bellButtonRev24 = bellButtonOfRev24(bell);
  if (bellButtonRev24 === null || typeof bellButtonRev24.props.onClick !== 'function') {
    check(
      'clicking the bell arms the draw, re-keys the glyph and puts the stroke BEHIND the bell',
      false,
      `no clickable .dacBell rendered (button=${bellButtonRev24 === null ? 'null' : typeof bellButtonRev24.props.onClick})`,
    );
  } else {
    bellButtonRev24.props.onClick({});
    const afterClick = renderComponent(loaded.runtime, loaded.sessionEntry.component, { sessionId: 'session-a' });
    const clickedButton = bellButtonOfRev24(afterClick.tree);
    check(
      'clicking the bell arms the draw, re-keys the glyph and puts the stroke BEHIND the bell',
      clickedButton !== null && clickedButton.props['data-draw'] === 'true' && glyphKeyOfRev24(afterClick.tree) === 'glyph1'
        && JSON.stringify(pathKeysOfRev24(afterClick.tree)) === JSON.stringify(['slash', 'bell', 'clapper']),
      clickedButton === null
        ? `nothing rendered after the click (${afterClick.errors.length} effect error(s))`
        : `after one click: data-draw=${JSON.stringify(clickedButton.props['data-draw'])} glyph key=${JSON.stringify(glyphKeyOfRev24(afterClick.tree))} path keys=${JSON.stringify(pathKeysOfRev24(afterClick.tree))}`,
    );
  }


  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n### ${options.title ?? 'probe-20-r14-bell-appearance.mjs'}: ${results.length - failed.length}/${results.length} independent checks passed`);
  for (const entry of failed) console.log(`    FAILED: ${entry.name}${entry.detail.length > 0 ? ` -- ${entry.detail}` : ''}`);
  return failed.map((entry) => entry.name);
}

/* ============================================================ entry point */

if (process.argv.includes('--list-mutations')) {
  for (const [name, entry] of Object.entries(MUTATIONS)) {
    console.log(`${name}: ${entry.what}`);
    console.log(`    declared red set (${entry.expectFail.length}): ${JSON.stringify(entry.expectFail)}`);
  }
  process.exit(0);
}

const mutateArg = process.argv.find((value) => value.startsWith('--mutate='));
const shippedDigest = sha256(SHIPPED);

if (mutateArg === undefined) {
  console.log('dsh-approval-chime · independent probe 20 · rev-13/rev-14/rev-16/rev-17/rev-18/rev-19/rev-20/rev-21/rev-22/rev-23/rev-24 session-bell appearance + reduceMotion');
  console.log(`lib/client.js ${Buffer.byteLength(SHIPPED, 'utf8')} B sha256 ${shippedDigest}`);
  const failed = inspect(SHIPPED, { verbose: true });
  process.exit(failed.length === 0 ? 0 : 1);
}

const requested = mutateArg.slice('--mutate='.length);
const chosen = requested === 'all' ? Object.keys(MUTATIONS) : [requested];
for (const name of chosen) {
  if (MUTATIONS[name] === undefined) {
    console.error(`unknown mutation '${name}'; available: ${Object.keys(MUTATIONS).join(', ')}, all`);
    process.exit(2);
  }
}

console.log('dsh-approval-chime · independent probe 20 · mutation mode');
console.log(`lib/client.js ${Buffer.byteLength(SHIPPED, 'utf8')} B sha256 ${shippedDigest}`);

let bad = 0;
const observedSets = new Map();
for (const name of chosen) {
  const mutation = MUTATIONS[name];
  console.log(`\n############ mutation '${name}'`);
  console.log(`############ ${mutation.what}`);
  const anchorOccurrences = SHIPPED.split(mutation.anchor).length - 1;
  console.log(`############ anchor occurrences in the shipped bytes: ${anchorOccurrences} (must be exactly 1)`);
  let mutated = null;
  try {
    mutated = applyMutation(SHIPPED, mutation);
  } catch (error) {
    console.log('############ observed red set (n/a): the mutant could not be built');
    console.log('############ NOT DETECTED as declared');
    console.log(`############   DEAD MUTATION / broken anchor: ${error.message}`);
    bad += 1;
    continue;
  }
  const changed = mutated !== SHIPPED && sha256(mutated) !== shippedDigest;
  console.log(`############ mutant source sha256 ${sha256(mutated)} vs shipped ${shippedDigest} changed=${changed}`);
  console.log(`############ declared red set (${mutation.expectFail.length}): ${mutation.expectFail.join(', ') || '(measurement run)'}`);
  // Machine-readable twin of the line above (t8, t7 observation 1): assertion names may contain
  // ", " themselves, so a downstream consumer that splits the human-readable line can over-count.
  // The human line above is UNCHANGED; these JSON lines are ADDED next to it.
  console.log(`############ declared red set (json): ${JSON.stringify(mutation.expectFail)}`);
  const failed = inspect(mutated, { verbose: chosen.length === 1, title: `probe-20 mutation:${name}` });
  const failing = new Set(failed);
  observedSets.set(name, failing);
  console.log(`############ observed red set (${failing.size}): ${failed.join(', ') || '(none)'}`);
  console.log(`############ observed red set (json): ${JSON.stringify(failed)}`);
  const missing = mutation.expectFail.filter((entry) => !failing.has(entry));
  const extra = failed.filter((entry) => !mutation.expectFail.includes(entry));
  console.log(`############ extra reds beyond the declaration: ${extra.join(', ') || '(none)'}`);
  console.log(`############ extra reds beyond the declaration (json): ${JSON.stringify(extra)}`);
  if (missing.length > 0) console.log(`############ NOT DETECTED (declared but still green): ${JSON.stringify(missing)}`);
  if (extra.length > 0) console.log(`############ UNDECLARED red (the declaration is too narrow): ${JSON.stringify(extra)}`);
  if (!changed) console.log('############   reason: the mutant source is byte-identical to the shipped source (DEAD MUTATION)');
  if (anchorOccurrences !== 1) console.log(`############   reason: the anchor occurs ${anchorOccurrences} times in the shipped bytes`);
  if (failing.size === 0) console.log('############   reason: no check went red (DEAD MUTATION)');
  const caught = missing.length === 0 && extra.length === 0 && failing.size > 0 && changed && anchorOccurrences === 1;
  console.log(caught ? '############ DETECTED (exactly the declared red set, and the mutant source provably changed)' : '############ NOT DETECTED as declared');
  // One machine-readable verdict per mutant, so a downstream log parser never has to split a
  // comma-joined list (t7 observation 1 / t8).
  console.log(`############ mutation verdict (json): ${JSON.stringify({ name, declared: mutation.expectFail.length, observed: failing.size, extra: extra.length, missing: missing.length, anchorOccurrences, changed, caught })}`);
  if (!caught) bad += 1;
}

if (chosen.length > 1) {
  console.log('\n### mutation summary -- every mutant must redden a DIFFERENT non-empty subset');
  const entries = [...observedSets.entries()];
  let exactCount = 0;
  for (const [name, failing] of entries) {
    const declared = MUTATIONS[name].expectFail;
    const exact = failing.size === declared.length && declared.every((entry) => failing.has(entry));
    console.log(`${exact ? '[PASS]' : '[FAIL]'} ${name}: reddens EXACTLY its ${declared.length} declared check(s) (measured ${failing.size})`);
    if (exact) exactCount += 1;
    else bad += 1;
  }
  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      const [nameA, setA] = entries[left];
      const [nameB, setB] = entries[right];
      const same = setA.size === setB.size && [...setA].every((entry) => setB.has(entry));
      console.log(`${same ? '[FAIL]' : '[PASS]'} ${nameA} and ${nameB} redden ${same ? 'the SAME' : 'different'} check sets`);
      if (same) bad += 1;
    }
  }
  console.log(`\n### mutation summary: ${exactCount}/${entries.length} mutations detected exactly as declared`);
}

process.exit(bad === 0 ? 0 : 1);
