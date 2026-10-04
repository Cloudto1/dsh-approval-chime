#!/usr/bin/env node
/**
 * probe-25 · the notification TEST button (r30 tail, user-approved feature).
 *
 * WHAT IT PINS. The button raises ONE real notification through the SAME frozen route, so the whole
 * chain (raise → toast → button → answer → revoke) can be exercised without waiting for an approval.
 * Everything that makes that safe is asserted here, in source order, because the dangerous failure
 * is silent: a test notification whose decision could reach an approval, or a second route/body that
 * drifts away from the frozen contract.
 *
 *   1. exactly ONE call site and ONE definition of `nativeRaiseTest`
 *   2. the call is made with `{ test: true }`
 *   3. the raise's test flag skips the two foreground gates, and skips the two approval re-checks
 *      (which would otherwise revoke a test toast the instant it appeared)
 *   4. `nativeDeliver` refuses a test record BEFORE it can reach `nativeAnswerPending`
 *   5. `nativeSettleRevoked` does the same for a click that lands during a revoke
 *   6. `nativeSweep` never sweeps a test record away (no approval will ever leave the snapshot)
 *   7. the test key is synthetic (`test:`) — no snapshot can carry it
 *   8. the frozen route and body shape gained NOTHING: one route constant, the same five body fields
 *   9. the button sits INSIDE the switch row and uses its own class — the author suite pins the
 *      group's children as exactly [heading, row, hint, hint], and `dacRow` as exactly three
 *  10. both locale blocks carry the same seven new keys (the key-set equality assertion depends on it)
 *  11. the button is disabled unless the switch is ON and the namespace is writable
 *  12. r30 fix-14 · THE 3 s COOLDOWN IS THE ONLY RATE CONTROL. `NATIVE_TEST_COOLDOWN_MS` is 3000 and
 *      the rolling-window quota that used to sit on top of it is GONE (user ruling 2026-10-03:
 *      「3秒点一次，把30秒冷却删了吧」): no constant, no state field, no prune function, no gate, no
 *      readiness half, no dead message key. What is left is pinned below — the cooldown is armed FROM
 *      its constant, its gate RETURNS, nothing refuses a click between that arm and the counter, it
 *      runs before anything is minted/posted/counted, and its message still names the seconds it
 *      counted. `nativeTeardown()` still clears the cooldown timer (the state is per-SWITCH), so a
 *      switch OFF/ON hands the button back ready: with the quota gone there is no page-level rate
 *      state left to survive the toggle, and the bound on what that costs is the screen — the
 *      supersede in item 15 keeps exactly ONE test toast up whatever the toggle rate.
 *  13. THE WRITE-COUNT GUARD (verify12's P1), re-aimed at the surviving rate control: exactly THREE
 *      non-comment writes of `native.testCooldownUntil` exist, and every one of them sits inside
 *      `nativeRaiseTest` (the arm and its own timer's reset) or `nativeTeardown` (the per-switch
 *      reset). A refill hidden in the switch row's OWN `onChange` — the shape verify12 hid, invisible
 *      here AND in probe-26 then, because probe-26 drove the settings scope instead of the control —
 *      is a fourth write outside those regions and reddens this file (probe-26 drives the real
 *      `role="switch"` checkbox now, so the two sides meet)
 *  14. r30 fix-11 · THE REPAINT LOOP, kept by fix-14. The user's real-machine report was a test
 *      button that stayed grey for good: a painted `nativeTestReady` that nothing ever rebuilt. Two
 *      facts are pinned: the loop is armed ONLY while the switch is on and the painted flag says a
 *      gate refuses (and a second publish must not re-arm it either), and `nativeTeardown` clears it —
 *      no timer outlives the page, and no page carries a permanent 1 Hz timer. What fix-14 changed is
 *      WHY it is still here: the loop used to be the only thing that could un-grey the button (a
 *      rolling slot freed when a stamp aged out, and nothing published at that moment), while now the
 *      cooldown's own timer publishes at the instant it lifts, so the loop is a second, cheap
 *      guarantee. The behavioural half is probe-26's section C: it reads the RENDERED tree with the
 *      probe's own React and event loop and with ZERO probe renders.
 *
 *  15. r30 fix-12 · THE SUPERSEDE. A click now takes the PREVIOUS test toast down through the same
 *      revoke path (user request 2026-10-03: five clicks left five 10-minute toasts on the desktop,
 *      because the flood control only REFUSES a click). The dangerous half is silent, and it is the half
 *      pinned here: the collection must filter `record.test === true`, so a REAL approval's notification
 *      is never handed to `nativeRevoke`. The checks pin the collection's own body, the revoke's
 *      argument (the filtered list, never `nativeLiveTokens()`) and the ordering (before the new raise
 *      is minted, so the new token cannot be in its own revoke).
 *
 *  16. r30 fix-13 · THE FILTER'S OWN PREDICATE (the verify13 round's Q7 gap). That round built one
 *      mutant this file could not name and probe-26 could not see: `record.test === true` replaced by
 *      `String(record.sessionId) === 'test'` (its "m4"). probe-26 measured 36/36 GREEN on those bytes,
 *      because the test channel itself stamps `sessionId: 'test'` (lib/client.js:2371) -- so the
 *      look-alike selects the intended records until a REAL approval carries that session id, and then
 *      the test button revokes a real notification. The predicate is therefore pinned as its OWN check
 *      on the collection's body: the record's own flag, and no `sessionId` / `key` comparison and no
 *      `'test'` literal anywhere in that collection. Five declared mutants now: the filter removed, the
 *      filter re-keyed on a look-alike sessionId (m4) and on a look-alike key, the unfiltered list
 *      substituted in, and the call deleted.
 *
 *      MEASURED, from disk (.scratch/audit-r30/q7/), with the THEN-CURRENT builds — this file carried 31
 *      checks before r30 fix-14 deleted the rolling-quota checks, and the record is kept as it was taken: on
 *      a copy of the shipped bytes with exactly that one edit (tree-m4/, 264522 B /
 *      E7624370F30D225BE13D42BFAA5BD0B5A0E1FD996A4F4AB90A7EC4CB91BC3FD8) this file read 30/31 with the
 *      predicate check as the ONLY red, and the then-current probe-26 read 38/39 with D5 as the only red; on
 *      the SAME copy the PRE-Q7 probe-26 read 36/36, exit 0 (the gap, reproduced). The PRE-Q7 probe-25 read
 *      29/30 there: its old combined assertion happened to pin the filter LINE as text, which is a byte-level
 *      accident, not coverage of the shape — it models no real approval. All five of its mutants are
 *      re-declared below and re-measured by `--mutant=all` on today's bytes.
 *
 *  17. r30 fix-15 · TEARDOWN MUST REVOKE, NOT MERELY FORGET (R1, the user-approved product defect).
 *      `nativeTeardown()` — the path the 通知 switch OFF takes, and the plugin disposer — used to drop
 *      the live records locally and tell the Host NOTHING, so the toast stayed on the desktop for its
 *      frozen TTL while this page no longer knew the token: after that even the supersede (item 15)
 *      could not reach it, which is why a switch OFF/ON + click left TWO test notifications and five
 *      cycles stacked five. The fixed body revokes the LIVE TEST tokens through the same public revoke
 *      path before forgetting them, and the collection is `nativeTestLiveTokens()` — so a real
 *      approval's notification is never named. Pinned here: the call, the reason literal, the try/catch
 *      (a teardown that can throw can leave the page half torn down) and the ORDER (the revoke names
 *      the tokens before `nativeForget` drops them). Two mutants, both declared. The behavioural half
 *      is probe-26's D8/D9, which flips the REAL role="switch" control.
 *
 *  18. r30 fix-15 (R3) · THE REPAINT PERIOD, PINNED BY VALUE. Item 14 pinned the loop's SHAPE and left
 *      its period unpinned: a mutant 1000 → 100 left BOTH probes green, because every behavioural
 *      reading (how many repeating timers are alive, how many requests they make, whether the button
 *      recovers) is independent of the period. The declaration is now read and required to be 1000 AND
 *      to be the constant the interval is armed with, so a moved or missing declaration fails the check
 *      instead of skipping it. Its own mutant reddens exactly that one check.
 *
 * FALSIFIABILITY: `--mutant=<name>` applies one byte-exact edit to an in-memory copy of the source
 * and requires exactly the declared assertions to go red. `--mutant=all` runs them all. The
 * behavioural half of this feature is probe-26's section D, which EXECUTES the module: it models the
 * desktop screen and measures how many test notifications are left on it.
 *
 * FALSIFIABILITY ON THE PRE-CHANGE BYTES (r30 fix-14, measured, not asserted). This file was also run
 * against the bytes that still carried the rolling quota — the pre-edit copy kept as
 * .scratch/audit-r30/fix-14/tree-before/lib/client.js (264507 B / 43ACF146…) — and reddened exactly the
 * checks that pin the deletion: 26/30, with the 3 s constant, the quota-gone check, the teardown region
 * (which still carried window state) and the readiness flag (which still read two gates) as the ONLY
 * four red. The run is in .scratch/audit-r30/fix-14/new-probe-25-on-prechange-bytes.txt, not inferred.
 *
 * FALSIFIABILITY ON THE PRE-CHANGE BYTES (r30 fix-15, measured, not asserted). This file was run
 * against the pre-change rev-30 bytes — reconstructed by inverting ONLY this round's four edits
 * (.scratch/audit-r30/fix-15/, `invert-to-prechange.mjs`). The reconstruction is byte-exact: it came out
 * at the byte count and sha256 this round's working tree carried before the edits, 264039 B and
 * EACF70F730392717125141517FCDD50BCE2A5D7160BBEF9E62758BD3E96BEE37 — and read 31/32 with the new
 * teardown-revoke check as the ONLY red:
 * ".scratch/audit-r30/fix-15/p25-prefix.txt". The period check stays green there, correctly: those
 * bytes also declare 1000.
 *
 * Run:  node verify-independent/probe-25-toast-test-button.mjs
 *       node verify-independent/probe-25-toast-test-button.mjs --mutant=all
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = resolve(HERE, '..');
const CLIENT_RELATIVE = 'lib/client.js';
const SOURCE = readFileSync(join(PLUGIN, CLIENT_RELATIVE), 'utf8');

const INDEX_KEYS = [
  'nativeToastTest',
  'nativeToastTestReason',
  'nativeToastTestSent',
  'nativeToastTestFailed',
  'nativeToastTestAnswered',
  'nativeToastTestAccept',
  'nativeToastTestReject',
  'nativeToastTestCooldown',
  'nativeToastTestCooldownUnit',
];

/** Where one string sits relative to another (`-1` when absent). */
const at = (source, needle) => source.indexOf(needle);
const before = (source, first, second) => {
  const a = at(source, first);
  const b = at(source, second);
  return a >= 0 && b >= 0 && a < b;
};

function makeReport(title) {
  const rows = [];
  return {
    rows,
    check(name, ok, detail) {
      const passed = ok === true;
      rows.push({ name, passed, detail });
      console.log(`${passed ? '[PASS]' : '[FAIL]'} ${name}${detail === undefined || detail === '' ? '' : ` — ${detail}`}`);
      return passed;
    },
    same(name, actual, expected) {
      return this.check(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    deepEqual(name, actual, expected) {
      const left = JSON.stringify(actual);
      const right = JSON.stringify(expected);
      return this.check(name, left === right, `expected ${right}, got ${left}`);
    },
    done() {
      const bad = rows.filter((row) => !row.passed);
      console.log(`\n### ${title}: ${rows.length - bad.length}/${rows.length} independent checks passed`);
      for (const row of bad) console.log(`    FAILED: ${row.name}`);
      return { total: rows.length, failed: bad.length, failedNames: bad.map((row) => row.name) };
    },
  };
}

/** Every assertion, in one place, so the shipped run and the mutants run the SAME code. */
function runChecks(report, source) {
  const count = (needle) => source.split(needle).length - 1;

  report.same('exactly ONE definition of nativeRaiseTest', count('function nativeRaiseTest('), 1);
  report.same('exactly ONE call site of nativeRaiseTest', count('nativeRaiseTest({'), 1);
  report.check('the call passes { test: true } (no second raise mode)', source.includes('}, { test: true });'), 'nativeRaiseTest');
  report.check(
    'the test flag skips the foreground gate on the way in',
    source.includes('if (test !== true && pageInForeground() === true) return;'),
    'nativeRaise',
  );
  report.check(
    'the test flag skips the two approval re-checks on the way out (they would revoke the toast at once)',
    before(source, 'if (test === true) {', 'if (pendingApproval(record.key) === null) {'),
    'nativeRaise',
  );
  report.check(
    'nativeDeliver refuses a test record BEFORE it can reach the approval path',
    before(source, 'if (record.test === true) {', 'var delivered = nativeAnswerPending(record.key, decision);'),
    'nativeDeliver',
  );
  report.check(
    'nativeSettleRevoked refuses a test record too (a click during a revoke)',
    before(source, "record.test === true && state === 'answered'", 'if (nativeAnswerPending(record.key, result.answer) === true)'),
    'nativeSettleRevoked',
  );
  report.check(
    'nativeSweep never sweeps a test record away',
    before(source, "if (record.test === true) continue;", 'if (live[record.key] === true) continue;'),
    'nativeSweep',
  );
  report.check('the test key is synthetic and carries the test: prefix', source.includes("key: 'test:' + String(now)"), 'nativeRaiseTest');
  // The verify9 round found this line was a TAUTOLOGY (`count(x) === count(x)`) — a free pass that no
  // edit could ever fail. These three assertions replace it and each one can go red (mutants M7/M8).
  report.same(
    'the frozen route literal appears exactly ONCE (no second endpoint was added)',
    count("'/api/approval-chime/native-toast'"),
    1,
  );
  const postPaths = [...source.matchAll(/nativePost\('([^']*)'/g)].map((match) => match[1]).sort();
  report.deepEqual('the client POSTs to exactly the two frozen sub-paths, and no third one', postPaths, ['', '/revoke']);
  report.check(
    'nothing is appended to the raise body beyond the frozen five fields',
    // A real assignment to the raise body, and only it: `body.reason =` is the one allowed write.
    // The lookbehind keeps `result.body.x` / `answer.body.x` out, and `(?!=)` keeps `===` out —
    // the first version of this line matched every `body.error === …` comparison (measured).
    !/(?<![\w.$])body\.(?!reason\b)\w+\s*=(?!=)/.test(source),
    'the raise body',
  );
  report.check(
    'the raise body still carries exactly the five frozen fields',
    source.includes('var body = { token: token, key: entry.key, sessionId: entry.sessionId, toolName: entry.toolName };'),
    'nativeRaise',
  );
  report.check(
    'the button rides INSIDE the switch row (not a new child of the group, whose list the author suite pins as exactly four)',
    before(source, "className: 'dacRow', key: 'nativeToast'", "className: 'dacTest'")
      && before(source, "className: 'dacTest'", "key: 'nativeToastStatus'"),
    'group layout',
  );
  report.check('and it does not reuse the dacRow class', !source.includes("className: 'dacRow', key: 'nativeToastTest'"), 'group layout');
  report.check(
    'the button is disabled unless the switch is ON, the namespace is writable, and the cooldown has lifted',
    source.includes('disabled: view.nativeToast !== true || writable !== true || snapshot.nativeTestReady === false,'),
    'button',
  );
  // r30 fix-14 · the flood control the user asked for ("怕有人一直连点"), re-ruled 2026-10-03:
  // 「3秒点一次，把30秒冷却删了吧」. The 3 s cooldown is the ONLY rate control, and BOTH halves are pinned:
  // the value that bounds the button, and the ABSENCE of the rolling quota that used to sit on top of
  // it. The absence check names every part the deleted design had — constant, state field, prune
  // function, message key — because leaving any one of them behind is how a deleted gate comes back: a
  // constant with no gate still reads as "limited", and a key with no message prints a raw key.
  report.check(
    'the cooldown is the approved 3 s (the ONLY rate control; 5 s or 30 s is the deleted design)',
    source.includes('var NATIVE_TEST_COOLDOWN_MS = 3000;'),
    'constants',
  );
  report.check(
    'the rolling quota is GONE: no constant, no state field, no prune, no gate, no dead message key',
    source.includes('NATIVE_TEST_WINDOW_MS') === false
      && source.includes('NATIVE_TEST_MAX_PER_WINDOW') === false
      && source.includes('native.testWindow') === false
      && source.includes('function nativeTestFresh(') === false
      && source.includes('nativeToastTestTooMany') === false
      && source.includes("nativeTestSaid('tooMany'") === false,
    'the deleted design',
  );
  // The verify10 round proved the TEXT assertions above are not enough: seven of its ten mutants
  // left this probe at 22/22 — e.g. arming the cooldown with a literal zero, or deleting a gate's
  // `return;` so it falls through into a raise. These five control-flow assertions close that gap,
  // and each has its own mutant below.
  const gateBody = (marker, length) => {
    const at0 = at(source, marker);
    return at0 < 0 ? '' : source.slice(at0, at0 + length);
  };
  report.check(
    'the cooldown is armed FROM the constant (a hard-coded zero would disable the limit silently)',
    source.includes('native.testCooldownUntil = now + NATIVE_TEST_COOLDOWN_MS;'),
    'flood control',
  );
  report.check(
    'the cooldown gate RETURNS (it cannot fall through into a raise)',
    gateBody('if (native.testCooldownUntil > now) {', 520).includes('return;'),
    'flood control',
  );
  // r30 fix-14 · with the quota gone, what must be pinned about the single gate is that NOTHING
  // refuses a click after it. This assertion replaces the window gate's: the stretch between the arm
  // and the counter may not contain a second refusal, so any hand-back of the old shape (a full-quota
  // test, a counter cap, anything with a `return;`) reddens it. The slice also has to contain the
  // timer that lifts the cooldown, so an empty slice cannot pass by accident.
  const armAt = at(source, 'native.testCooldownUntil = now + NATIVE_TEST_COOLDOWN_MS;');
  const counterAt = at(source, 'native.counters.tests += 1;');
  const betweenArmAndCounter = armAt < 0 || counterAt < 0 || counterAt < armAt ? '' : source.slice(armAt, counterAt);
  report.check(
    'the cooldown is the ONLY gate: once it has passed, nothing refuses the click before the counter',
    armAt >= 0 && counterAt > armAt
      && betweenArmAndCounter.includes('return;') === false
      && betweenArmAndCounter.includes('native.testTimer = setTimeout('),
    'flood control',
  );
  report.check(
    'the cooldown message still carries the seconds it counted and the unit word',
    source.includes("+ ' ' + waitSeconds") && source.includes('strings.cooldownUnit'),
    'flood control',
  );
  report.check(
    'the cooldown gate runs BEFORE anything is minted, posted or counted',
    before(source, 'if (native.testCooldownUntil > now) {', 'native.counters.tests += 1;'),
    'flood control',
  );
  // r30 fix-14 · THE TEARDOWN CLAIM. Both of the test button's timers must be cleared — "no timer
  // outlives the page" — and with the rolling quota deleted there is no window state left for a
  // teardown to hand back either. This slice is bounded by the function's OWN closing brace
  // (`source.indexOf('\n      }', teardownAt)`), never by a fixed length: the fixed length is the
  // defect verify12 measured in the first version of this line
  // (`source.slice(teardownAt, teardownAt + 500)`), which has nothing to do with where the function
  // ends and is therefore wrong in BOTH directions — on the pre-fix bytes it overran the brace and
  // read into the NEXT function's doc comment (`startNativeToast`'s "Wire the three DOM signals …"),
  // passing by luck; on longer bytes it stopped short of its own needles, a false RED. The region is
  // also asserted to name no window identifier, so window state handed back inside this function
  // cannot hide behind the two timers being cleared.
  const teardownAt = at(source, 'function nativeTeardown() {');
  const teardownEnd = teardownAt < 0 ? -1 : source.indexOf('\n      }', teardownAt);
  const teardownRegion = teardownAt < 0 || teardownEnd < 0 ? '' : source.slice(teardownAt, teardownEnd);
  report.check(
    'teardown clears BOTH test timers (the cooldown and the repaint loop) and leaves no rate state in the region',
    teardownRegion.includes('clearTimeout(native.testTimer)')
      && teardownRegion.includes('native.testTimer = null;')
      && teardownRegion.includes('native.testCooldownUntil = 0;')
      // r30 fix-11: the repaint loop is a timer too, and it is the one a teardown could forget.
      && teardownRegion.includes('clearInterval(native.testRepaintTimer)')
      && teardownRegion.includes('native.testRepaintTimer = null;')
      && teardownRegion.includes('testWindow') === false
      && teardownRegion.includes('NATIVE_TEST_WINDOW') === false,
    'teardown',
  );
  // r30 fix-15 · TEARDOWN MUST REVOKE, NOT MERELY FORGET. Forgetting the record locally is exactly
  // what left the user's toast on the desktop (switch OFF/ON, click the test button → TWO test
  // notifications; measured on the pre-change bytes: 1→2→3→4→5 over five cycles, zero revokes),
  // because the supersede can only reach tokens the page still remembers. Each clause below is the
  // failure it forbids: the revoke CALL missing (the defect itself), the strict `!== true` filter
  // widened to a falsy test (a REAL approval's notification handed to the revoke), the collection
  // swapped for `nativeLiveTokens()` ("every token this page is still waiting on", approvals
  // included), and the try/catch gone (a teardown that can throw is a teardown that can leave the
  // page half torn down). The whole point is that the request GOES OUT: `nativeForget` sends
  // nothing, so a body that only forgets can satisfy every other check in this file.
  report.check(
    'nativeTeardown REVOKES the live test tokens through the shared revoke path before forgetting them, and names ONLY test records',
    teardownRegion.includes("nativeRevoke(nativeTestLiveTokens(), 'teardown');")
      && teardownRegion.includes('try {')
      && teardownRegion.includes('} catch (error) {')
      && before(teardownRegion, 'nativeRevoke(nativeTestLiveTokens()', 'nativeForget(tokens[index])'),
    'teardown · the revoke is the FIRST thing this function does, so no token can be dropped before it is named: ' + JSON.stringify(teardownRegion.replace(/\s+/g, ' ').slice(0, 320)),
  );
  // r30 fix-14 · THE WRITE-COUNT GUARD (verify12's P1), re-aimed at the surviving rate control. That
  // round proved a rate-control refill does NOT have to live in `nativeTeardown`: written into the
  // rendered switch's own `onChange`, a `native.testWindow = [];` made a switch OFF/ON hand the quota
  // back while BOTH probes stayed green (this one read only the teardown slice; probe-26 drove the
  // settings scope instead of the control). The window is gone; the guard is not. Exactly three
  // non-comment writes of the cooldown are legitimate — the arm and its timer's reset, both inside
  // `nativeRaiseTest`, and the per-switch reset inside `nativeTeardown` — and a fourth write anywhere
  // else (the switch handler, the sweep, a publish) is a bypass, wherever it hides. Comments are
  // excluded by EMPTYING whole `//` lines before counting (a line whose first non-space characters are
  // `//`), keeping the newlines so the reported line numbers stay true; the `(?!=)` lookahead keeps a
  // `===` comparison out. A write inside a `/* */` note would still be counted: a false red, chosen
  // over a blind spot. Measured: shipped 3 (the arm, the timer's reset, the teardown reset).
  const commentStripped = source.replace(/^[ \t]*\/\/.*$/gm, '');
  const regionOf = (marker) => {
    const start = at(commentStripped, marker);
    if (start < 0) return null;
    const end = commentStripped.indexOf('\n      }', start);
    return end < 0 ? null : [start, end];
  };
  const allowedRegions = [regionOf('function nativeRaiseTest(options) {'), regionOf('function nativeTeardown() {')].filter((region) => region !== null);
  const cooldownWrites = [...commentStripped.matchAll(/native\.testCooldownUntil\s*=(?!=)/g)];
  const strayWrites = cooldownWrites.filter((match) => allowedRegions.every((region) => match.index < region[0] || match.index > region[1]));
  report.check(
    'every non-comment write of the cooldown lives in nativeRaiseTest (arm + timer reset) or nativeTeardown',
    allowedRegions.length === 2 && cooldownWrites.length === 3 && strayWrites.length === 0,
    `comments excluded by emptying every whole \`//\` line before counting (newlines kept, so these are the real lines); measured ${cooldownWrites.length} write(s), ${strayWrites.length} of them outside the three legitimate sites` +
      (strayWrites.length === 0 ? '' : ': ' + strayWrites.map((match) => commentStripped.slice(0, match.index).split('\n').length + ' ' + commentStripped.slice(match.index, match.index + 32).replace(/\s+/g, ' ')).join(' | ')),
  );
  // r30 fix-14 · THE READINESS FLAG is the cooldown alone, read LIVE at publish time, and ONE statement
  // writes it. The deleted design read two gates there, and its window half had to be pruned through
  // `nativeTestFresh` so the flag described the live quota rather than the array's historic length;
  // with the quota gone there is nothing to prune, and a second half reappearing (an `&&` clause, a
  // second gate, a constant `true`) reddens this check and probe-26's A/C sections.
  report.check(
    'the readiness flag is the cooldown alone, read live (ONE statement, no second gate)',
    source.includes('draft.nativeTestReady = native.testCooldownUntil <= Date.now();') && count('draft.nativeTestReady =') === 1,
    'snapshot',
  );
  // r30 fix-11 · THE REPAINT LOOP (source half). The loop is the only thing that rebuilds the page
  // while a gate refuses, so both halves of its guard are pinned on the FUNCTION's own body, sliced
  // to its closing brace the same way the teardown region below is (a fixed-length window is the
  // defect verify12 measured on that other slice): a disarmed publish clears the timer, an armed one
  // cannot re-arm it (or a page publishing more often than the period would never tick at all), and
  // the callback repaints through `publish()` alone — the word `fetch` must not appear in it.
   const repaintAt = at(source, 'function nativeTestRepaint(blocked) {');
  const repaintEnd = repaintAt < 0 ? -1 : source.indexOf('\n      }', repaintAt);
  const repaintRegion = repaintAt < 0 || repaintEnd < 0 ? '' : source.slice(repaintAt, repaintEnd);
  report.check(
    'the repaint loop is armed ONLY while the switch is ON and the cooldown refuses (a disarmed publish clears it, a second one cannot re-arm it) and it repaints with publish() alone',
    source.includes('nativeTestRepaint(published.nativeTestReady !== true && settings.nativeToast === true);')
      && repaintRegion.includes('if (blocked !== true) {')
      && repaintRegion.includes('clearInterval(native.testRepaintTimer)')
      && repaintRegion.includes('native.testRepaintTimer = null;')
      && repaintRegion.includes('if (native.testRepaintTimer !== null) return;')
      && repaintRegion.includes('setInterval(function () {')
      && repaintRegion.includes('publish();')
      && repaintRegion.includes('}, NATIVE_TEST_REPAINT_MS);')
      && repaintRegion.includes('fetch') === false,
    'repaint loop',
  );
  // r30 fix-15 (R3) · THE REPAINT PERIOD IS PINNED BY VALUE. The loop's SHAPE was pinned and its
  // period was not: a mutant that changed `NATIVE_TEST_REPAINT_MS` from 1000 to 100 left BOTH
  // probes green (measured — probe-26 reads how many repeating timers are alive and how many
  // requests they make, and neither number depends on the period; probe-25 named the constant but
  // never read what it equals). The declared value is therefore read out of the DECLARATION and
  // required to be the same number the interval is armed with, which also catches a declaration
  // that moved or went missing: an unparsable constant fails this check instead of skipping it.
  const repaintMsMatch = /var NATIVE_TEST_REPAINT_MS = ([^;]+);/.exec(source);
  const repaintMsValue = repaintMsMatch === null ? null : Number(repaintMsMatch[1].trim());
  report.check(
    'the repaint period is declared ONCE and is exactly 1000 ms, and the interval is armed with that same constant',
    count('NATIVE_TEST_REPAINT_MS') === 2 && repaintMsValue === 1000 && repaintRegion.includes('}, NATIVE_TEST_REPAINT_MS);'),
    'the declared value is ' + String(repaintMsValue) + ' (source text ' + JSON.stringify(repaintMsMatch === null ? null : repaintMsMatch[1].trim()) + '); `NATIVE_TEST_REPAINT_MS` occurs ' + String(count('NATIVE_TEST_REPAINT_MS')) + 'x in the file (declaration + arm). The loop is a second, cheap guarantee, not the only one (the cooldown timer publishes when it lifts), so a shortened period cannot be caught by any behaviour: it repaints faster and both probes stay green, exactly as the 1000->100 mutant measured.',
  );
  // r30 fix-12 · THE SUPERSEDE (source half). A click takes the previous TEST toast down before the new
  // one is minted. The two halves are pinned on the collection's own body, because either half alone can
  // hand a REAL approval's notification to the test button: a missing filter, or the right filter whose
  // result is thrown away in favour of `nativeLiveTokens()` -- "every token this page is still waiting on",
  // approvals included. The ordering half is the other silent failure: a supersede that ran AFTER the
  // raise would put the new token in its own revoke list. (The collection itself is declared after
  // `nativeRaiseTest` -- function declarations hoist, so that says nothing; what is pinned instead is that
  // the CALL sits inside `nativeRaiseTest` and before the raise.)
  //
  // r30 fix-13 · Q7: THE FILTER'S OWN PREDICATE IS ITS OWN CHECK. The verify13 round's m4 mutant
  // (`record.test === true` -> `String(record.sessionId) === 'test'`, one edit at lib/client.js:2482)
  // left probe-26's then-current thirty-six measured checks green while handing a REAL approval's
  // notification to the test button: it is behaviourally equivalent on those bytes only because the
  // test channel stamps itself `sessionId: 'test'`, so the look-alike selects exactly the intended
  // records -- until a real approval carries that session id. The predicate is pinned as its OWN
  // assertion below, and the shapes it may not key on are named in it: no `sessionId` / `key`
  // comparison, no `'test'` literal inside that collection. Two mutants redden exactly this check (a
  // sessionId look-alike and a key look-alike), and the call/ordering half keeps its own check and its
  // own three mutants.
  const supersedeAt = at(source, 'function nativeTestLiveTokens() {');
  const supersedeEnd = supersedeAt < 0 ? -1 : source.indexOf('\n      }', supersedeAt);
  const supersedeRegion = supersedeAt < 0 || supersedeEnd < 0 ? '' : source.slice(supersedeAt, supersedeEnd);
  report.check(
    'the supersede filter is the record OWN flag -- the exact `record.test === true` predicate, never a comparison against a look-alike sessionId or key',
    supersedeRegion.includes('if (record.test === true) tokens.push(record.token);')
      && /sessionId|\.key\b/.test(supersedeRegion) === false
      && /['"]test['"]/.test(supersedeRegion) === false,
    'the collection body is ' + JSON.stringify(supersedeRegion.replace(/\s+/g, ' ').slice(0, 200)) + ' -- the filter may read `record.test`, the ONE flag `nativeRaise` writes (lib/client.js:2096, from `options.test === true` at :2078), because the test channel stamps ITSELF with a look-alike `sessionId: \'test\'` (:2371) and a `test:<ms>:<n>` key (:2372) that a real approval can carry too',
  );
  report.check(
    'the supersede revokes the collection list alone (`nativeTestLiveTokens()`, never `nativeLiveTokens()`) and before the new raise is minted',
    source.includes("nativeRevoke(nativeTestLiveTokens(), 'superseded');")
      && before(source, 'function nativeRaiseTest(options) {', "nativeRevoke(nativeTestLiveTokens(), 'superseded');")
      && before(source, "nativeRevoke(nativeTestLiveTokens(), 'superseded');", 'nativeRaise({')
      && !source.includes("nativeRevoke(nativeLiveTokens(), 'superseded');"),
    'r30 fix-12 supersede',
  );

  const zhBlock = source.slice(at(source, "preview: '试听',"), at(source, "preview: 'Preview',"));
  const enBlock = source.slice(at(source, "preview: 'Preview',"));
  const missing = [];
  for (const key of INDEX_KEYS) {
    const zhOk = new RegExp(`\\b${key}:`).test(zhBlock);
    const enOk = new RegExp(`\\b${key}:`).test(enBlock.slice(0, 4000));
    if (!zhOk || !enOk) missing.push(`${key}${zhOk ? '' : ' zh'}${enOk ? '' : ' en'}`);
  }
  report.check('both locale blocks carry all nine test keys (key-set equality holds)', missing.length === 0, missing.join(', '));
}

const MUTANTS = {
  'raise-keeps-the-approval-recheck': {
    what: 'the test early-return is deleted, so a test toast is revoked the moment it appears',
    find: 'if (test === true) {',
    replace: 'if (false) {',
    expectedRed: ['the test flag skips the two approval re-checks on the way out (they would revoke the toast at once)'],
  },
  'deliver-lets-a-test-decision-through': {
    what: 'nativeDeliver no longer refuses a test record',
    find: 'if (record.test === true) {',
    replace: 'if (false) {',
    expectedRed: ['nativeDeliver refuses a test record BEFORE it can reach the approval path'],
  },
  'sweep-forgets-test-records': {
    what: 'the sweep skip is deleted, so a test toast disappears on the next snapshot sync',
    find: 'if (record.test === true) continue;',
    replace: '/* sweep skip deleted by the mutant */',
    expectedRed: ['nativeSweep never sweeps a test record away'],
  },
  'key-pretends-to-be-an-approval': {
    what: 'the synthetic key prefix becomes appr:, i.e. it could collide with a real approval key',
    find: "key: 'test:' + String(now)",
    replace: "key: 'appr:' + String(now)",
    expectedRed: ['the test key is synthetic and carries the test: prefix'],
  },
  'button-ignores-the-switch': {
    what: 'the button is clickable while the switch is off',
    find: 'disabled: view.nativeToast !== true || writable !== true || snapshot.nativeTestReady === false,',
    replace: 'disabled: writable !== true || snapshot.nativeTestReady === false,',
    expectedRed: ['the button is disabled unless the switch is ON, the namespace is writable, and the cooldown has lifted'],
  },
  'cooldown-gate-removed': {
    what: 'the 3 s cooldown gate is gone: a click every second would raise a notification every second',
    find: 'if (native.testCooldownUntil > now) {',
    replace: 'if (false) {',
    expectedRed: [
      // Both readings are legitimate: the gate's marker is gone (so the "returns" reading cannot
      // find its body) AND the ordering reading no longer sees the gate before the counter.
      'the cooldown gate RETURNS (it cannot fall through into a raise)',
      'the cooldown gate runs BEFORE anything is minted, posted or counted',
    ],
  },
  'cooldown-widened-to-five-seconds': {
    what: 'the cooldown is widened back to 5000 ms — the deleted design returning one constant at a time',
    find: 'var NATIVE_TEST_COOLDOWN_MS = 3000;',
    replace: 'var NATIVE_TEST_COOLDOWN_MS = 5000;',
    expectedRed: ['the cooldown is the approved 3 s (the ONLY rate control; 5 s or 30 s is the deleted design)'],
  },
  'cooldown-armed-with-zero': {
    what: 'the cooldown is armed with a literal 0 — the 3 s limit is silently dead while the constant still looks right',
    find: 'native.testCooldownUntil = now + NATIVE_TEST_COOLDOWN_MS;',
    replace: 'native.testCooldownUntil = now + 0;',
    expectedRed: [
      // The arm marker is what the "only gate" slice is measured from, so destroying it reddens both
      // readings: the constant is no longer what arms the cooldown, and the stretch that must contain
      // nothing but the timer can no longer be located at all (an empty slice may not pass).
      'the cooldown is armed FROM the constant (a hard-coded zero would disable the limit silently)',
      'the cooldown is the ONLY gate: once it has passed, nothing refuses the click before the counter',
    ],
  },
  'cooldown-gate-falls-through': {
    what: "the cooldown gate's return is deleted, so a refused click falls through into a raise",
    find: '          publish();\r\n          return;\r\n        }\r\n        native.testCooldownUntil = now + NATIVE_TEST_COOLDOWN_MS;',
    replace: '          publish();\r\n        }\r\n        native.testCooldownUntil = now + NATIVE_TEST_COOLDOWN_MS;',
    expectedRed: ['the cooldown gate RETURNS (it cannot fall through into a raise)'],
  },
  'a-second-gate-appears-before-the-raise': {
    what: 'a second refusal is put back between the cooldown and the raise — the shape the deleted window gate had (it never fires here, so ONLY the source-shape check can see it)',
    find: '        native.counters.tests += 1;',
    replace: '        if (native.counters.tests > 99) { publish(); return; }\r\n        native.counters.tests += 1;',
    expectedRed: ['the cooldown is the ONLY gate: once it has passed, nothing refuses the click before the counter'],
  },
  'window-constant-returns': {
    what: 'the deleted rolling-window constant comes back on the line under the cooldown (the gate itself is not written yet, which is exactly how a "still limited" lie starts)',
    find: '      var NATIVE_TEST_COOLDOWN_MS = 3000;',
    replace: '      var NATIVE_TEST_COOLDOWN_MS = 3000;\r\n      var NATIVE_TEST_WINDOW_MS = 30000;',
    expectedRed: ['the rolling quota is GONE: no constant, no state field, no prune, no gate, no dead message key'],
  },
  'quota-message-returns': {
    what: 'the dead quota-full message is put back into the zh block only — the key-set equality between the two blocks still holds (a string is added to one side, not a key removed from one), so this file is the only instrument that can see it',
    find: "          nativeToastTestCooldownUnit: '秒再试',",
    replace: "          nativeToastTestCooldownUnit: '秒再试',\r\n          nativeToastTestTooMany: '点得太频繁了，请稍等一会儿再试',",
    expectedRed: ['the rolling quota is GONE: no constant, no state field, no prune, no gate, no dead message key'],
  },
  'cooldown-message-loses-the-seconds': {
    what: 'the cooldown message stops saying how long is left',
    find: "+ ' ' + waitSeconds",
    replace: "+ ''",
    expectedRed: ['the cooldown message still carries the seconds it counted and the unit word'],
  },
  'button-ignores-the-cooldown': {
    what: 'the button stays clickable while the cooldown refuses the click',
    find: '|| snapshot.nativeTestReady === false,',
    replace: ',',
    expectedRed: ['the button is disabled unless the switch is ON, the namespace is writable, and the cooldown has lifted'],
  },
  'snapshot-drops-the-ready-flag': {
    what: 'the page is never told whether the button may fire',
    find: 'draft.nativeTestReady = native.testCooldownUntil <= Date.now();',
    replace: 'draft.nativeTestReady = true;',
    expectedRed: ['the readiness flag is the cooldown alone, read live (ONE statement, no second gate)'],
  },
  'button-leaves-the-switch-row': {
    what: 'the button is moved out of the switch row (the shared page row is being restructured)',
    find: "React.createElement('span', { className: 'dacSwitchText' }, t('nativeToast')),",
    replace: "React.createElement('span', { key: 'nativeToastStatus' }), React.createElement('span', { className: 'dacSwitchText' }, t('nativeToast')),",
    expectedRed: ['the button rides INSIDE the switch row (not a new child of the group, whose list the author suite pins as exactly four)'],
  },
  'body-gains-a-sixth-field': {
    what: 'the raise body is extended past the frozen five fields (verify9 measured that nothing caught this)',
    find: 'if (typeof entry.reason === \'string\' && entry.reason.length > 0) body.reason = entry.reason;',
    replace: 'if (typeof entry.reason === \'string\' && entry.reason.length > 0) body.reason = entry.reason; body.extra = 1;',
    expectedRed: ['nothing is appended to the raise body beyond the frozen five fields'],
  },
  'a-third-sub-path-appears': {
    what: 'the raise is posted to a NEW sub-path instead of the frozen prefix itself',
    find: "nativePost('', body)",
    replace: "nativePost('/test', body)",
    expectedRed: ['the client POSTs to exactly the two frozen sub-paths, and no third one'],
  },
  // verify12's P1 and P2, re-aimed at the surviving rate control. The first row is the exact edit that
  // was invisible to BOTH probes before r30 fix-10 (this probe read only the teardown slice; probe-26
  // wrote the settings scope instead of the control): a rate-control refill inside the rendered
  // switch's own `onChange`. With the window gone the refill can only mean the cooldown, and the
  // write-count guard above is what names it. The second row deletes both of teardown's clears, which
  // is the "no timer outlives the page" half of the same rule.
  'switch-handler-refills-the-cooldown': {
    what: "the rendered switch's onChange zeroes the cooldown when it is turned on — an OFF/ON bypass hidden in the control (verify12's mutant c, re-aimed)",
    find: 'if (next) refreshNativeStatus();',
    replace: 'if (next) { native.testCooldownUntil = 0; refreshNativeStatus(); }',
    expectedRed: ['every non-comment write of the cooldown lives in nativeRaiseTest (arm + timer reset) or nativeTeardown'],
  },
  // r30 fix-11 · the three mutants of the repaint loop. The first is the permanent-timer failure (the
  // loop can never disarm, so a grey button leaves a 1 Hz timer on the page for good), the second is
  // the leaked timer (teardown forgets it — the rule "no timer outlives the page"), and the third is
  // the cooldown timer a teardown could forget just as easily.
  'repaint-loop-is-permanent': {
    what: 'the repaint loop can never disarm: the disarmed path is dead, so a grey button leaves a 1 Hz timer running for the life of the page',
    find: 'if (blocked !== true) {',
    replace: 'if (false) {',
    expectedRed: ['the repaint loop is armed ONLY while the switch is ON and the cooldown refuses (a disarmed publish clears it, a second one cannot re-arm it) and it repaints with publish() alone'],
  },
  'repaint-arms-while-the-switch-is-off': {
    what: 'the repaint loop is armed without asking the switch: a page whose notification switch is OFF carries a 1 Hz timer for a button that cannot be clicked anyway',
    find: 'nativeTestRepaint(published.nativeTestReady !== true && settings.nativeToast === true);',
    replace: 'nativeTestRepaint(published.nativeTestReady !== true);',
    expectedRed: ['the repaint loop is armed ONLY while the switch is ON and the cooldown refuses (a disarmed publish clears it, a second one cannot re-arm it) and it repaints with publish() alone'],
  },
  'teardown-forgets-the-repaint-loop': {
    what: 'teardown drops the cooldown timer but not the repaint loop (a timer that outlives the page)',
    find: '        // r30 fix-11 · the repaint loop may not outlive the page either.\r\n        if (native.testRepaintTimer !== null) clearInterval(native.testRepaintTimer);\r\n        native.testRepaintTimer = null;\r\n',
    replace: '',
    expectedRed: ['teardown clears BOTH test timers (the cooldown and the repaint loop) and leaves no rate state in the region'],
  },
  'teardown-forgets-the-cooldown-timer': {
    what: 'teardown forgets the cooldown timer (and its reset) instead of the repaint loop: a 3 s timer outlives the page',
    find: '        if (native.testTimer !== null) clearTimeout(native.testTimer);\r\n        native.testTimer = null;\r\n        native.testCooldownUntil = 0;\r\n',
    replace: '',
    expectedRed: [
      // Two readings, both legitimate and both measured: the region no longer clears the cooldown, and
      // one of the THREE legitimate writes of the cooldown is gone (so the count is 3 no longer holds).
      'teardown clears BOTH test timers (the cooldown and the repaint loop) and leaves no rate state in the region',
      'every non-comment write of the cooldown lives in nativeRaiseTest (arm + timer reset) or nativeTeardown',
    ],
  },
  // r30 fix-12 · the three mutants of the supersede. The first two are the two halves the check above
  // pins together; the third deletes the call, i.e. the user's defect ("five clicks, five toasts on
  // screen") comes straight back. All three redden exactly that one check.
  'supersede-filter-removed': {
    what: "the supersede collection loses its test filter, so a real approval's notification is revoked by the test button",
    find: 'if (record.test === true) tokens.push(record.token);',
    replace: 'tokens.push(record.token);',
    expectedRed: ['the supersede filter is the record OWN flag -- the exact `record.test === true` predicate, never a comparison against a look-alike sessionId or key'],
  },
  'supersede-revokes-every-live-token': {
    what: 'the supersede revokes EVERY live token instead of the test ones (the real approval toast goes down with the test toast)',
    find: "nativeRevoke(nativeTestLiveTokens(), 'superseded');",
    replace: "nativeRevoke(nativeLiveTokens(), 'superseded');",
    expectedRed: ['the supersede revokes the collection list alone (`nativeTestLiveTokens()`, never `nativeLiveTokens()`) and before the new raise is minted'],
  },
  'supersede-deleted': {
    what: "the supersede call is deleted: five clicks stack five 10-minute toasts again (the user's defect)",
    find: "        nativeRevoke(nativeTestLiveTokens(), 'superseded');\r\n",
    replace: '',
    expectedRed: ['the supersede revokes the collection list alone (`nativeTestLiveTokens()`, never `nativeLiveTokens()`) and before the new raise is minted'],
  },
  // r30 fix-13 · Q7. The first row is VERBATIM the verify13 round's m4 mutant (its one edit at
  // lib/client.js:2482): the round measured it INVISIBLE to probe-26 (36/36 green on the then-current
  // build) and red only to its own instrument. It reddens EXACTLY the predicate check above -- nothing
  // else in this file moves. The second row is the "or a key" half of the same assertion: a filter
  // keyed on the key shape.
  'supersede-filter-reads-a-look-alike-sessionid': {
    what: "the supersede filter is re-keyed on a LOOK-ALIKE field (the verify13 round's m4): `String(record.sessionId) === 'test'` instead of `record.test === true`. The test channel stamps itself `sessionId: 'test'`, so today's behaviour is identical -- until a REAL approval's session id is `test`, and then the test button revokes a real notification. Measured blind spot: the then-current probe-26 read 36/36 on those bytes.",
    find: 'if (record.test === true) tokens.push(record.token);',
    replace: "if (String(record.sessionId) === 'test') tokens.push(record.token);",
    expectedRed: ['the supersede filter is the record OWN flag -- the exact `record.test === true` predicate, never a comparison against a look-alike sessionId or key'],
  },
  'supersede-filter-reads-a-look-alike-key': {
    what: "the supersede filter is re-keyed on the KEY instead of the record's own flag (`record.key === 'test'`): a real approval can carry a key that looks like the test channel's (`test`, or `test:<ms>:<n>`) and would then be revoked by the test button. probe-26 D6/D7 measure that real-approval side.",
    find: 'if (record.test === true) tokens.push(record.token);',
    replace: "if (record.key === 'test') tokens.push(record.token);",
    expectedRed: ['the supersede filter is the record OWN flag -- the exact `record.test === true` predicate, never a comparison against a look-alike sessionId or key'],
  },
  // r30 fix-15 · the two edits this round's R1 fix must be falsifiable against. The first deletes the
  // teardown revoke (the pre-change bytes), the second keeps the call but widens the filter to a falsy
  // test, which hands a REAL approval's notification to the revoke exactly as the supersede's m4 did.
  'teardown-never-revokes-the-test-tokens': {
    what: 'the r30 fix-15 revoke inside nativeTeardown is deleted, so a switch OFF/ON forgets the live test record and leaves its notification on the desktop: click, toggle, click → TWO test notifications (the user-measured 1→2→3→4→5 stack)',
    find: "          nativeRevoke(nativeTestLiveTokens(), 'teardown');\r\n",
    replace: '',
    expectedRed: ['nativeTeardown REVOKES the live test tokens through the shared revoke path before forgetting them, and names ONLY test records'],
  },
  'teardown-revokes-every-test-look-alike': {
    what: "the SHARED collection's strict `record.test === true` test is widened to a falsy one, so a record whose flag is merely truthy is named by BOTH callers — the supersede and the teardown revoke. One edit, two readers: which is why this mutant is declared against both readings (measured — the supersede predicate check is the one that goes red, because the widened body is that collection's body; the teardown check is its own assertion and stays green).",
    find: 'if (record.test === true) tokens.push(record.token);',
    replace: 'if (record.test) tokens.push(record.token);',
    expectedRed: [
      'the supersede filter is the record OWN flag -- the exact `record.test === true` predicate, never a comparison against a look-alike sessionId or key',
    ],
  },
  // r30 fix-15 (R3) · the period pin's own mutant. Measured before the pin existed: 1000 -> 100 left
  // BOTH probes green (the loop still stops when the button is ready; it just repaints ten times
  // faster), so a declared mutant is the only thing that can show the new check is not decoration.
  'repaint-period-shortened-to-100': {
    what: 'the repaint period is shortened to 100 ms — a 10 Hz publish loop on a grey button, invisible to every behavioural reading because the button still recovers and the loop still disarms',
    find: 'var NATIVE_TEST_REPAINT_MS = 1000;',
    replace: 'var NATIVE_TEST_REPAINT_MS = 100;',
    expectedRed: ['the repaint period is declared ONCE and is exactly 1000 ms, and the interval is armed with that same constant'],
  },
};

const requested = process.argv.slice(2).filter((arg) => arg.startsWith('--mutant=')).map((arg) => arg.slice('--mutant='.length));
let exitCode = 0;

if (requested.length === 0 || requested.includes('all')) {
  console.log('### probe-25 · the notification test button (shipped bytes)');
  const report = makeReport('probe-25 test-button (shipped)');
  runChecks(report, SOURCE);
  const verdict = report.done();
  if (verdict.failed > 0) exitCode = 1;
}

for (const name of (requested.includes('all') ? Object.keys(MUTANTS) : requested)) {
  const spec = MUTANTS[name];
  if (spec === undefined) throw new Error(`unknown mutant: ${name}`);
  const sites = SOURCE.split(spec.find).length - 1;
  if (sites !== 1) throw new Error(`mutant ${name}: the anchor matches ${sites} site(s), expected exactly 1`);
  console.log(`\n### probe-25 · MUTANT ${name}`);
  console.log(`    · ${spec.what}`);
  const report = makeReport(`probe-25 test-button (mutant ${name})`);
  runChecks(report, SOURCE.replace(spec.find, spec.replace));
  const verdict = report.done();
  const declared = [...spec.expectedRed].sort();
  const observed = [...verdict.failedNames].sort();
  const exact = declared.length === observed.length && declared.every((item, index) => item === observed[index]);
  if (verdict.failed === 0) {
    console.log('    MUTANT NOT CAUGHT: the edit reddened nothing — that assertion is decoration.');
    exitCode = 1;
  } else if (exact) {
    console.log(`    MUTANT CAUGHT exactly as declared (${observed.length} red, nothing else).`);
  } else {
    console.log('    MUTANT CAUGHT, but the red set is NOT the declared one.');
    console.log(`      declared: ${declared.join(' | ') || '(none)'}`);
    console.log(`      observed: ${observed.join(' | ') || '(none)'}`);
    exitCode = 1;
  }
}

console.log(`\nprobe-25 verdict: exit ${exitCode}`);
process.exit(exitCode);
