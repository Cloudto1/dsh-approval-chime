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
 *  12. `nativeTeardown()` (switch OFF) drops the 5 s cooldown timer but NEVER the rolling window:
 *      the quota is per-PAGE, so a fast OFF/ON toggle storm may not refill it (r30 tail)
 *  13. exactly ONE non-comment `native.testWindow =` statement exists in the whole file, so
 *      `nativeRaiseTest` is the only function allowed to rewrite the window — the source-level half
 *      of the guard the verify12 round asked for (P1): a refill hidden in the switch row's OWN
 *      `onChange` was invisible here AND in probe-26, which drove the settings scope instead of the
 *      control (probe-26 drives the real `role="switch"` checkbox now, so the two sides meet)
 *
 * FALSIFIABILITY: `--mutant=<name>` applies one byte-exact edit to an in-memory copy of the source
 * and requires exactly the declared assertions to go red. `--mutant=all` runs them all.
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
  'nativeToastTestTooMany',
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
  // r30 tail · the flood control the user asked for ("怕有人一直连点"). Both gates must run BEFORE
  // anything is minted/posted/counted, and the cooldown flag must reach the page — otherwise the
  // limit would either cost the Host a request or leave the button clickable while it refuses.
  report.check(
    'the flood-control constants are the approved values (5 s cooldown, 30 s window, 3 per window)',
    source.includes('var NATIVE_TEST_COOLDOWN_MS = 5000;')
      && source.includes('var NATIVE_TEST_WINDOW_MS = 30000;')
      && source.includes('var NATIVE_TEST_MAX_PER_WINDOW = 3;'),
    'constants',
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
  report.check(
    'and the rolling-window gate returns too',
    gateBody('if (native.testWindow.length >= NATIVE_TEST_MAX_PER_WINDOW) {', 300).includes('return;'),
    'flood control',
  );
  report.check(
    'the window is compared against its CONSTANT, never a literal that drifts',
    source.includes('native.testWindow.length >= NATIVE_TEST_MAX_PER_WINDOW'),
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
  report.check(
    'and the rolling-window gate runs before it too (a refused click costs the Host nothing)',
    before(source, 'if (native.testWindow.length >= NATIVE_TEST_MAX_PER_WINDOW) {', 'native.counters.tests += 1;'),
    'flood control',
  );
  // The teardown claim is checked on a SLICE of the teardown function, and this slice is bounded by
  // the function's OWN closing brace (`source.indexOf('\n      }', teardownAt)`), never by a fixed
  // length. The fixed length is the defect verify12 measured in the first version of this line
  // (`source.slice(teardownAt, teardownAt + 500)`): a 500-byte window has nothing to do with where
  // the function ends, so it is wrong in BOTH directions. On the PRE-FIX bytes (441-byte body, the
  // closing brace at +441) it overran the brace by 59 B and read into the NEXT function's doc
  // comment (`startNativeToast`'s "Wire the three DOM signals …") — its three needles still sat
  // inside the body, so it passed by luck, not by construction. On the CURRENT bytes (989-byte
  // body, brace at +984) the same window stops 484 B BEFORE the brace and finds none of its own
  // three needles, i.e. on today's bytes that formulation is a false RED. Both figures are verify12
  // measurements of that one expression, one per byte set.
  // r30 tail (flood control + the switch-reset fix): the WINDOW half of this pin is deliberately
  // INVERTED. Keeping `native.testWindow` alive across the switch is the whole fix — the verify11 round
  // measured 51 notifications / 30 s through a fast OFF/ON toggle storm where the design allows 3. A
  // statement that empties the window inside `nativeTeardown` is therefore the DEFECT, not the
  // requirement, and `!includes` is what catches it coming back. The timer half is unchanged.
  const teardownAt = at(source, 'function nativeTeardown() {');
  const teardownEnd = teardownAt < 0 ? -1 : source.indexOf('\n      }', teardownAt);
  const teardownRegion = teardownAt < 0 || teardownEnd < 0 ? '' : source.slice(teardownAt, teardownEnd);
  report.check(
    'teardown clears the cooldown timer but KEEPS the window (no timer outlives the page, and no switch OFF/ON refills the quota)',
    teardownRegion.includes('clearTimeout(native.testTimer)')
      && teardownRegion.includes('native.testTimer = null;')
      && teardownRegion.includes('native.testCooldownUntil = 0;')
      && !teardownRegion.includes('\n        native.testWindow = [];'),
    'teardown',
  );
  // The write-count guard (verify12's P1, source side). A quota refill does NOT have to live in
  // `nativeTeardown`: written into the rendered switch's own `onChange`, the same statement made a
  // switch OFF/ON refill the window again while BOTH probes stayed green — this one because its
  // only window assertion reads the teardown slice above, and probe-26 because its B section drove
  // the settings scope instead of the control. `nativeRaiseTest` is the ONE function allowed to
  // rewrite the window (it prunes, then pushes); every other assignment is a way to hand the quota
  // back, wherever it hides. Comments are excluded by EMPTYING whole `//` lines before counting (a
  // line whose first non-space characters are `//`), keeping the newlines so the reported line
  // numbers stay true; the `(?!=)` lookahead keeps a `===` comparison out. A `native.testWindow =`
  // written inside a `/* */` note would still be counted: a false red, chosen over a blind spot.
  // Measured: shipped 1 (`lib/client.js:2282`); the pre-fix bytes and the sweep / teardown /
  // switch-handler / publish mutants all measure 2.
  const commentStripped = source.replace(/^[ \t]*\/\/.*$/gm, '');
  const windowWrites = commentStripped.match(/native\.testWindow\s*=(?!=)/g) ?? [];
  const windowWriteLines = [...commentStripped.matchAll(/native\.testWindow\s*=(?!=)/g)].map(
    (match) => commentStripped.slice(0, match.index).split('\n').length,
  );
  report.check(
    'only nativeRaiseTest rewrites the rolling window (exactly ONE non-comment `native.testWindow =`)',
    windowWrites.length === 1,
    `comments excluded by emptying every whole \`//\` line before counting (newlines kept, so these line numbers are the real ones); measured ${windowWrites.length} at line(s) ${windowWriteLines.join(', ') || '(none)'} — the shipped bytes carry 1 (line 2282) and every quota hand-back mutant carries 2`,
  );
  report.check(
    'the page is told whether the button may fire (BOTH gates feed the disabled flag)',
    source.includes('draft.nativeTestReady = native.testCooldownUntil <= Date.now()')
      && source.includes('&& native.testWindow.length < NATIVE_TEST_MAX_PER_WINDOW;'),
    'snapshot',
  );
  const zhBlock = source.slice(at(source, "preview: '试听',"), at(source, "preview: 'Preview',"));
  const enBlock = source.slice(at(source, "preview: 'Preview',"));
  const missing = [];
  for (const key of INDEX_KEYS) {
    const zhOk = new RegExp(`\\b${key}:`).test(zhBlock);
    const enOk = new RegExp(`\\b${key}:`).test(enBlock.slice(0, 4000));
    if (!zhOk || !enOk) missing.push(`${key}${zhOk ? '' : ' zh'}${enOk ? '' : ' en'}`);
  }
  report.check('both locale blocks carry all seven new keys (key-set equality holds)', missing.length === 0, missing.join(', '));
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
    what: 'the 5 s cooldown is gone: a click every second would raise a notification every second',
    find: 'if (native.testCooldownUntil > now) {',
    replace: 'if (false) {',
    expectedRed: [
      // Both readings are legitimate: the gate's marker is gone (so the "returns" reading cannot
      // find its body) AND the ordering reading no longer sees the gate before the counter.
      'the cooldown gate RETURNS (it cannot fall through into a raise)',
      'the cooldown gate runs BEFORE anything is minted, posted or counted',
    ],
  },
  'window-limit-widened': {
    what: 'the rolling window allows 99 instead of 3',
    find: 'var NATIVE_TEST_MAX_PER_WINDOW = 3;',
    replace: 'var NATIVE_TEST_MAX_PER_WINDOW = 99;',
    expectedRed: ['the flood-control constants are the approved values (5 s cooldown, 30 s window, 3 per window)'],
  },
  'cooldown-armed-with-zero': {
    what: 'the cooldown is armed with a literal 0 — the 5 s limit is silently dead while the constants still look right',
    find: 'native.testCooldownUntil = now + NATIVE_TEST_COOLDOWN_MS;',
    replace: 'native.testCooldownUntil = now + 0;',
    expectedRed: ['the cooldown is armed FROM the constant (a hard-coded zero would disable the limit silently)'],
  },
  'cooldown-gate-falls-through': {
    what: "the cooldown gate's return is deleted, so a refused click falls through into a raise",
    find: '          publish();\r\n          return;\r\n        }\r\n        var kept = [];',
    replace: '          publish();\r\n        }\r\n        var kept = [];',
    expectedRed: ['the cooldown gate RETURNS (it cannot fall through into a raise)'],
  },
  'window-gate-falls-through': {
    what: "the rolling-window gate's return is deleted (the 4th click would raise)",
    find: '          publish();\r\n          return;\r\n        }\r\n        native.testWindow.push(now);',
    replace: '          publish();\r\n        }\r\n        native.testWindow.push(now);',
    expectedRed: ['and the rolling-window gate returns too'],
  },
  'window-compares-a-literal': {
    what: 'the window comparison loses its constant (a literal that can drift from the constant)',
    find: 'native.testWindow.length >= NATIVE_TEST_MAX_PER_WINDOW',
    replace: 'native.testWindow.length >= 99',
    expectedRed: [
      'and the rolling-window gate returns too',
      'and the rolling-window gate runs before it too (a refused click costs the Host nothing)',
      'the window is compared against its CONSTANT, never a literal that drifts',
    ],
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
    find: 'draft.nativeTestReady = native.testCooldownUntil <= Date.now()\r\n            && native.testWindow.length < NATIVE_TEST_MAX_PER_WINDOW;',
    replace: 'draft.nativeTestReady = true;',
    expectedRed: ['the page is told whether the button may fire (BOTH gates feed the disabled flag)'],
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
  // verify12's P1 and P2. The first row is the exact edit that was invisible to BOTH probes before
  // r30 fix-10 (this probe read only the teardown slice; probe-26 wrote the settings scope instead
  // of the control): the quota is emptied inside the rendered switch's own `onChange`. The second
  // row puts the pre-fix statement back where it used to live, which is the one row that reddens
  // the new teardown assertion itself (it ALSO reddens the write count — declared, not a surprise).
  'switch-handler-refills-the-quota': {
    what: "the rendered switch's onChange empties the rolling window when it is turned on — an OFF/ON toggle storm refills the quota (verify12's mutant c)",
    find: 'if (next) refreshNativeStatus();',
    replace: 'if (next) { native.testWindow = []; refreshNativeStatus(); }',
    expectedRed: ['only nativeRaiseTest rewrites the rolling window (exactly ONE non-comment `native.testWindow =`)'],
  },
  'teardown-clears-the-window-again': {
    what: 'the teardown note is replaced by the very statement it warns against, so a switch OFF/ON refills the quota again (the pre-fix bytes)',
    find: '// Deliberately NOT `native.testWindow = [];` — see the measurement above.',
    replace: 'native.testWindow = [];',
    expectedRed: [
      'teardown clears the cooldown timer but KEEPS the window (no timer outlives the page, and no switch OFF/ON refills the quota)',
      'only nativeRaiseTest rewrites the rolling window (exactly ONE non-comment `native.testWindow =`)',
    ],
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
