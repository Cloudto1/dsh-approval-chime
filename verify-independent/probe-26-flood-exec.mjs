#!/usr/bin/env node
/**
 * ADOPTED FROM THE verify10 INDEPENDENT ROUND (r30 tail),
 * whose authored instrument ran as probe-26-flood-exec.mjs inside that round’s execution copy
 * (recorded under the workspace audit directory outside this repo; its `_harness.mjs` is byte-identical to this repo's
 *  verify/_harness.mjs — sha256 EC74EBB6A326389A8CE29752C6B1F7DDD36E5B833EFECB164FC8E6C26DE9D439).
 *
 * WHAT IT PROVES — and why it is different from every other probe here. probe-25 reads lib/client.js
 * as TEXT and pins the source-order invariants of the 测试通知 button. THIS probe EXECUTES the real
 * lib/client.js inside the author suite's vm sandbox (fake DOM, fake React, fake fetch) under a FAKE
 * CLOCK and FAKE TIMERS installed by the probe itself, renders the real settings section and drives
 * the real `dacTest` button. Nothing below is grepped: every number is measured from a run.
 *
 *   A. the shipped behaviour — two rapid clicks produce ONE POST; the button self-restores from the
 *      cooldown timer with no click needed; a click 1 ms inside the 3 s cooldown is refused and posts
 *      NOTHING (and the button is painted DISABLED while it refuses, so the limit is visible instead
 *      of a button that keeps accepting refused clicks); and, the r30 fix-14 half, clicking every 3 s
 *      raises EVERY time — the rolling quota that used to refuse the fourth such click is gone, so
 *      "one raise per 3 s" is the whole bound on the wire.
 *   B. the bypass attempts — switch OFF/ON (through the REAL rendered role="switch" control and
 *      through a settings-scope write), effect teardown + re-apply, and a fresh bundle. r30 fix-14
 *      changed what OFF/ON means, and this probe MEASURES it rather than assuming: the cooldown is
 *      per-SWITCH state, so the toggle hands the button back READY and the next click raises at once.
 *      (The deleted quota used to survive the toggle, and keeping it alive was the whole r30-tail fix:
 *      a fast OFF/ON storm through it measured 51 notifications / 30 s. What bounds that now is the
 *      screen, measured in D — every accepted raise supersedes the previous toast.)
 *      r30 fix-10 · the OFF/ON below is driven through the REAL rendered role="switch" checkbox
 *      of the pinned nativeToast row (its own onChange), not by writing the settings scope: the
 *      verify12 round proved a scope write never runs the component handler body, so a rate-control
 *      refill hidden there (its mutant c) was invisible to this probe. The scope-write route is
 *      kept as B1c, because the settings can also change from outside this page.
 *   It also pins that exactly ONE cooldown timer is live after a raise (the previous one was
 *   cleared) and that teardown leaves ZERO — the timer-leak failure that no text pin can see.
 *
 *   C. r30 fix-11 · THE SELF-REPAINT (the user's real-machine defect). Sections A and B call
 *      view.render() before every reading, i.e. they repaint the page on the probe's behalf, so a
 *      product whose grey button is never rebuilt again measures green there. Section C runs the same
 *      real bundle with the probe's own React (autoRender: a state set re-renders, as React does) and
 *      its own event loop (tick(): repeating timers fire, in due order, one period apart), and asserts
 *      audit.manual never moves after setup — so the tree each reading sees was painted by the
 *      PRODUCT. It measures the cooldown recovery (C1), the grey stretch (C2a-C2e: the repaint loop is
 *      the only repeating timer alive while the button is grey, it makes NO request, it stops the
 *      moment the button is ready and does not come back), the switch guard (C3/C3b) and teardown
 *      (C4). Falsifiability is measured, not asserted: on the pre-fix bytes C2a is the only green one
 *      of those — the rest go red (recorded under .scratch/audit-r30/fix11/). r30 fix-14 deleted the
 *      ROLLING-QUOTA recovery this section used to measure as its C2 (a slot that freed on the clock
 *      with nothing publishing at that moment): that state no longer exists, because the cooldown is
 *      the only gate and its own timer publishes at the instant it lifts. The loop itself is still
 *      measured here, on the grey stretch that does exist.
 *
 *   D. r30 fix-12 · ONE TEST NOTIFICATION AT A TIME (the user's second real-machine report). Five
 *      clicks over ~53 s raised five real toasts and all five stayed on screen (each has the frozen
 *      10-minute TTL), because the flood control only REFUSES a click — it never takes the previous
 *      toast down. This section therefore models the DESKTOP, not the wire: the fetch stub keeps the
 *      Host's own screen (a raise puts a toast on it; a revoke the Host accepts dismisses it and
 *      answers `state:"pending"`, the shape lib/native-bridge.js really answers), so "how many toasts
 *      are on screen" is MEASURED. A/B/C count REQUESTS and therefore cannot see this defect at all:
 *      there, two accepted raises are two raises whether or not the first toast is still up.
 *      D1 is the core (click, wait past the cooldown, click again → ONE toast left and a revoke that
 *      really named the earlier token), D2 replays the user's own five-click sequence, D3 constructs a
 *      REAL (non-test) approval raise through the same route and proves it survives two test clicks and
 *      is named in no revoke, D4 pins that a click the flood control REFUSES leaves the on-screen toast
 *      alone. This section consumes `opts.host`, so A/B/C are untouched.
 *
 *      D5/D6/D7 (r30 fix-13, the verify13 round's Q7 gap). D3's real approval carried `session-1` and
 *      `appr-key-1`, so the whole section stayed green for a supersede filter that reads a LOOK-ALIKE
 *      field instead of the record's own flag: that round's m4 mutant (`record.test === true` ->
 *      `String(record.sessionId) === 'test'`, ONE edit at lib/client.js:2482) left this probe 36/36 GREEN.
 *      D5 therefore raises a REAL approval whose sessionId is literally `test`, D6 one whose key is
 *      literally `test`, and D7 one whose key is `test:1000000:1` — the very key the first test raise
 *      mints on the probe clock, so the real raise and a test raise carry the SAME key with only the
 *      flag to tell them apart. Each must survive two test clicks and be named in no revoke.
 *      MEASURED on a copy of the shipped bytes with exactly that one edit (.scratch/audit-r30/q7/tree-m4/),
 *      with the THEN-CURRENT builds (this file carried 39 checks before r30 fix-14 rewrote its rolling
 *      quota sections; the record is kept as it was taken): D5 was the ONLY red check there (38/39,
 *      exit 1) — the real toast is GONE and its token is in the revoke list — while D6 and D7 stayed
 *      green; the then-current probe-25 read 30/31 there, its predicate check the only red. On the SAME
 *      m4 copy the PRE-Q7 probe-26 read 36/36, exit 0: the blind spot.
 *
 * FALSIFIABILITY (measured, not asserted): run this probe against a copy of the PRE-FIX `lib/client.js`
 * (the bytes before r30 fix-12, kept as .scratch/audit-r30/fix12/baseline-client.js) and D1, D2 and D3 go
 * red — measured there: 33/36, with TWO test notifications live after two accepted clicks, FIVE after the
 * five-click sequence, ZERO revokes ever sent, and D3 red because its "the earlier test toast was
 * replaced" clause cannot hold when nothing is ever revoked — while D4 stays green and the 32 checks of
 * A/B/C are untouched. The run is recorded under .scratch/audit-r30/fix12/prefix-run/.
 * (That 33/36 is the THIRTY-SIX-check build of that time; the Q7 additions came after it and are green on
 * those bytes too, because bytes that never revoke anything cannot take a real approval down.)
 *
 * FALSIFIABILITY ON THE PRE-CHANGE BYTES (r30 fix-14, measured, not asserted). This file was also run
 * against the bytes that still carried the rolling quota — the pre-edit copy kept as
 * .scratch/audit-r30/fix-14/tree-before/lib/client.js (264507 B / 43ACF146…) — and reddened every check
 * that pins the deletion: 18/35, exit 1 — A4a, A5, A5b, A6,
 * B1, B1c, B2, B3, C1, C2c, C2d, C2e, D1, D3, D5, D6 and D7 (17 red). Every red is one of two things:
 * a 3 s timing the old 5 s cooldown refuses (A4a saw "4秒再试", A5/A5b/C1/C2c/C2d/C2e never lifted at
 * 3 s, B1/B1c/B2/B3 could not raise again, and D1/D3/D5-D7's second click at +3 s was swallowed — the
 * raise list of D3 shows two bodies, not three), or the deleted ceiling itself (A6: the same five clicks
 * post THREE notifications on those bytes). Everything that pins the cooldown as DESIGN — the refusal,
 * the disable painting, A2/A3/A7/A7c, C2a/C2b/C3/C3b/C4, D2, D4 and the three safety guards — stays
 * green there, which is what makes these 17 a red set about the DELETION rather than about noise. Log:
 * .scratch/audit-r30/fix-14/new-probe-26-on-prechange-bytes.txt.. The runs are in .scratch/audit-r30/fix-14/.
 *
 *   E. r30 fix-15 (R1) · THE SWITCH, NOT THE BUTTON. `nativeTeardown()` (the 通知 switch OFF path, and
 *      the plugin disposer) used to forget the live records and tell the Host NOTHING, so the toast
 *      stayed on the desktop while the page no longer knew its token — after which even the supersede
 *      could not reach it. The user measured: switch OFF→ON, click the test button, TWO test
 *      notifications; five cycles stacked five (1→2→3→4→5, zero revokes), while a run that never
 *      toggles stays at one. Sections A-D cannot see it — they never toggle the switch — and probe-25
 *      can only pin the source shape. D8/D9 therefore flip the REAL rendered role="switch" checkbox of
 *      the nativeToast row OFF and ON (its own onChange), click the test button, and read the SCREEN:
 *      exactly ONE test notification live, the pre-teardown token gone from the screen and named in a
 *      revoke request, the timer count taken to zero by the teardown, and — the saturation half — no
 *      token ever issued for a REAL approval (session-1 / appr-key-stays-up, raised through the same
 *      route before the first click) appearing in any revoke. Measured note, not an assumption: the
 *      approval toast itself is NOT expected to stay up, because teardown forgets the approval's
 *      record too and the next snapshot sync re-raises it (pre-existing behaviour on this path, "already
 *      notified" was never tracked) — so a section that counted APPROVAL toasts by screen position was
 *      wrong when it was first written and was corrected to attribute tokens by their raise bodies.
 *
 *   FALSIFIABILITY ON THE PRE-CHANGE BYTES (r30 fix-15, measured, not asserted). Run against the
 *   pre-change rev-30 bytes, reconstructed by inverting ONLY this round's four edits
 *   (.scratch/audit-r30/fix-15/invert-to-prechange.mjs; byte-exact: 264039 B /
 *   EACF70F730392717125141517FCDD50BCE2A5D7160BBEF9E62758BD3E96BEE37 — the PRE-change artifact the
 *   inversion really produced, and the one the verify15 round re-measured independently): 37/41,
 *   RESTORED BY r30 fix-16: the fix-15 re-anchor had rewritten these two lines to that round's SHIPPED
 *   values (265849 B / BB972363…), which made this sentence claim the shipped bytes were the pre-change
 *   ones. The record is put back so the measurement it names is the measurement it took.
 *   exit 1 — D8a, D8b, D8e and D9 red, with the exact defect reproduced in the readings
 *   (test tokens live after the cycles = 2, then 3, 4, 5; ZERO revoke requests added by any cycle),
 *   while D8c and D8d stay green (teardown's timer clearing and the approval's safety were never the
 *   broken half). Log: .scratch/audit-r30/fix-15/p26-prefix.txt.
 *
 *   G. r30 fix-16 · CLICK, THEN OFF IN THE SAME TICK (the verify15 round's S2/m13 coverage gap), and the
 *      teardown revoke's VISIBILITY in the diagnostics snapshot (that round's S3). The gap was measured,
 *      not guessed: m13 — the teardown revoke filtered to skip records still `raising` — left this probe
 *      41/41 GREEN, because D8/D9 await the raise's answer before they flip the switch, and only
 *      probe-25's source-text pin caught it. F1/F2 close it behaviourally: they click the test button and
 *      flip the REAL role="switch" OFF with NOTHING awaited in between, then read the screen (F1) and the
 *      plugin's own diagnostics snapshot (F2).
 *      MEASURED on a copy of these bytes with the m13 edit applied
 *      (.scratch/audit-r30/fix-16/mut/m13-skip-records-still-raising/): 41/43, with F1 and F2 as the ONLY
 *      two red checks — F1 reads zero revoke requests and one test toast still on the screen, F2 reads
 *      counters.revoked = 0 with lastRevokeReason = "" across all eight turns. The S3 half has its own
 *      mutant (.scratch/audit-r30/fix-16/mut/s3-recording-removed/): with the fix-16 recording deleted the
 *      revoke still goes out, so F1 stays GREEN and F2 is the ONLY red check (42/43) — which is also what
 *      proves the settle path contributes nothing for a teardown token, so F2's "counted exactly once"
 *      reading cannot be a double count. Logs: .scratch/audit-r30/fix-16/p26-mut-m13-skip-records-still-raising.txt,
 *      .scratch/audit-r30/fix-16/p26-mut-s3-recording-removed.txt.
 *
 * It resolves the plugin directory from its own location, so it runs from any cwd, and it reads
 * NOTHING under the workspace audit/scratch tree. Exit 0 = every measured check green; non-zero = red.
 *
 * Run:  node verify-independent/probe-26-flood-exec.mjs
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInContext } from 'node:vm';
import { createClientSandbox, createClientCtx, createRenderer, collect, flattenText, settle, approvalInteraction } from '../verify/_harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = resolve(HERE, '..');
const ROUTE = '/api/approval-chime/native-toast';
const SESSIONS = '/api/approval-chime/sessions';

const rows = [];
const say = (name, ok, detail) => {
  rows.push({ name, ok: ok === true, detail: String(detail) });
  console.log(`${ok === true ? '[PASS]' : '[FAIL]'} ${name} — ${detail}`);
};

function build(options) {
  const opts = options === undefined || options === null ? {} : options;
  const calls = [];
  /**
   * r30 fix-12 · section D only (`opts.host === true`): the DESKTOP, not just the wire. A raise puts a
   * toast on the screen, a revoke the Host accepts dismisses it and answers `state:"pending"` — the shape
   * `lib/native-bridge.js` really answers — and a token the Host does not know answers `state:"unknown"`.
   * `host.revokes` keeps every revoke request with the tokens it named, so "which token was taken down"
   * is evidence rather than an inference. A/B/C never pass `host`, so their readings — and the pre-fix
   * comparison recorded for them — are untouched. (r30 fix-14: with the rolling quota gone this section
   * is the ONLY bound left on a fast clicker's screen; it therefore reads the screen, not the wire.)
   */
  const host = { screen: new Map(), revokes: [] };
  const fetchStub = (url, options) => {
    const target = String(url);
    const init = options === undefined || options === null ? {} : options;
    const method = typeof init.method === 'string' ? init.method : 'GET';
    const body = typeof init.body === 'string' ? init.body : null;
    calls.push({ target, method, body });
    if (target.indexOf(SESSIONS) === 0 || target.indexOf(SESSIONS) >= 0) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, revision: 1, sessions: {} }) });
    }
    if (opts.host === true && method === 'POST' && target.endsWith('/revoke')) {
      const tokens = body === null ? [] : JSON.parse(body).tokens;
      const results = tokens.map((token) => {
        if (host.screen.has(token)) {
          host.screen.delete(token);
          return { token, state: 'pending' };
        }
        return { token, state: 'unknown' };
      });
      host.revokes.push({ tokens: tokens.slice(), results });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, results }) });
    }
    if (opts.host === true && method === 'POST') {
      const raised = JSON.parse(body);
      host.screen.set(raised.token, { key: raised.key, sessionId: raised.sessionId });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, state: 'raised', token: raised.token }) });
    }
    if (method === 'POST') {
      const token = body === null ? '' : JSON.parse(body).token;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, state: 'raised', token }) });
    }
    if (opts.answer404 === true) {
      // r30 fix-11 · section C only. The notification poll is ITSELF a 1 Hz setInterval, so on a grey
      // button there are normally TWO repeating timers. Answering the poll 404 makes the record drop
      // on its first tick (which clears that interval), leaving the repaint loop as the only repeating
      // timer — the one condition under which "no request came out of a repeating timer" is a
      // statement about the repaint loop.
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ ok: false, error: 'no such token' }) });
    }
    // every poll
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, state: 'pending' }) });
  };
  const sandbox = createClientSandbox({ fetch: fetchStub });
  const context = sandbox.context;
  // ---- fake clock + fake timers + a deterministic crypto, installed BEFORE apply() ----
  context.__CLOCK__ = { now: 1000000, timers: [], nextId: 1, intervalFires: 0, intervalCalls: 0 };
  context.__MINT__ = { n: 0 };
  context.window.crypto = {
    getRandomValues(bytes) {
      for (let i = 0; i < bytes.length; i += 1) {
        context.__MINT__.n += 1;
        bytes[i] = context.__MINT__.n & 0xff;
      }
      return bytes;
    },
  };
  const install = `globalThis.Date.now = function () { return __CLOCK__.now; };
globalThis.setTimeout = function (fn, ms) { var id = __CLOCK__.nextId; __CLOCK__.nextId += 1; var list = __CLOCK__.timers.slice(); list.push({ id: id, fn: fn, due: __CLOCK__.now + (Number(ms) || 0), ms: Number(ms) || 0, every: false }); __CLOCK__.timers = list; return id; };
globalThis.clearTimeout = function (id) { __CLOCK__.timers = __CLOCK__.timers.filter(function (t) { return t.id !== id; }); };
globalThis.setInterval = function (fn, ms) { var id = __CLOCK__.nextId; __CLOCK__.nextId += 1; var list = __CLOCK__.timers.slice(); list.push({ id: id, fn: fn, due: __CLOCK__.now + (Number(ms) || 0), ms: Number(ms) || 0, every: true }); __CLOCK__.timers = list; return id; };
globalThis.clearInterval = function (id) { __CLOCK__.timers = __CLOCK__.timers.filter(function (t) { return t.id !== id; }); };`;
  // patch the globals from INSIDE the vm context (a host-side assignment cannot rebind them)
  runInContext(install, context);

  const registration = sandbox.loader.registrations[0] ?? null;
  const contract = registration === null || sandbox.error !== null ? null : registration.factory(sandbox.requireFn);
  const harness = createClientCtx({
    scopeSnapshot: {
      status: 'ready',
      writable: true,
      value: { enabled: true, volume: 70, tone: 'chime', nativeToast: true },
      base: {},
      user: {},
      revision: 1,
      mode: 'host',
    },
  });
  if (contract !== null) contract.apply(harness.ctx);
  const entry = harness.state.slotRegistrations.find((item) => item.options?.name === 'settings.section');
  const view = createRenderer(sandbox.react, entry.component, {});
  /**
   * r30 fix-11 · THE PROBE'S OWN REACT, and why it exists. advance() below is the historic one-shot
   * driver: it moves the clock, fires due TIMEOUTS, and a reading is then taken after view.render().
   * That combination repaints the page on the probe's behalf, so a product that never rebuilds its
   * own snapshot looked exactly like one that does — which is why the user's real-machine report
   * ("就不亮了点不了了") was invisible here.
   *
   * With autoRender the bundle's React.useState becomes an accessor: createRenderer still installs a
   * fresh slot reader on every render (through the setter below), and the getter hands the component
   * a reader whose setter writes the slot and THEN re-renders — which is what React does when the
   * store's subscriber calls setSnapshot, and the reason section C needs no probe render at all.
   * audit.manual counts the renders THIS PROBE asked for, audit.auto the ones a state change asked
   * for: section C asserts manual never moves after setup, so the tree it reads can only have been
   * painted by the product.
   */
  const audit = { manual: 0, auto: 0 };
  const rawRender = view.render.bind(view);
  view.render = () => {
    audit.manual += 1;
    return rawRender();
  };
  let rendering = false;
  const autoRender = () => {
    if (rendering === true) return undefined;
    rendering = true;
    try {
      audit.auto += 1;
      return rawRender();
    } finally {
      rendering = false;
    }
  };
  if (opts.autoRender === true) {
    let slotUseState = sandbox.react.useState;
    const wrappedUseState = (initial) => {
      const pair = slotUseState(initial);
      const set = pair[1];
      return [pair[0], (value) => {
        set(value);
        autoRender();
      }];
    };
    Object.defineProperty(sandbox.react, 'useState', {
      configurable: true,
      get: () => wrappedUseState,
      set: (value) => {
        slotUseState = value;
      },
    });
  }
  view.render();
  view.runEffects();
  const clock = context.__CLOCK__;
  const advance = (ms) => {
    clock.now += ms;
    const due = clock.timers.filter((timer) => timer.due <= clock.now && timer.every !== true);
    clock.timers = clock.timers.filter((timer) => timer.every === true || timer.due > clock.now);
    for (const timer of due) timer.fn();
  };
  /**
   * r30 fix-11 · THE FAITHFUL EVENT LOOP, for section C only (A and B keep advance(), so their
   * measured details stay comparable with the pre-fix record). The earliest due timer runs first
   * with Date.now() set to ITS OWN due time, a repeating timer is re-armed one period later, and a
   * callback that arms a new timer is honoured inside the same call — a browser's loop, not a
   * "jump the clock and fire everything once" shortcut. A repeating timer is exactly what the fix
   * adds, so nothing weaker can see it.
   *
   * clock.intervalFires counts the repeating timers that ran and clock.intervalCalls counts the
   * requests THOSE callbacks made (the fetch stub records synchronously, so the count is exact):
   * "the repaint loop costs the Host no request" is therefore measured, not assumed.
   */
  const tick = (ms) => {
    const target = clock.now + ms;
    for (let step = 0; step < 200000; step += 1) {
      let next = null;
      for (const timer of clock.timers) {
        if (timer.due > target) continue;
        if (next === null || timer.due < next.due || (timer.due === next.due && timer.id < next.id)) next = timer;
      }
      if (next === null) break;
      clock.now = next.due;
      if (next.every === true) next.due = clock.now + next.ms;
      else clock.timers = clock.timers.filter((timer) => timer.id !== next.id);
      if (next.every === true) {
        clock.intervalFires += 1;
        const callsBefore = calls.length;
        next.fn();
        clock.intervalCalls += calls.length - callsBefore;
      } else {
        next.fn();
      }
    }
    clock.now = target;
  };
  const button = () => collect(view.tree, (node) => node.type === 'button' && node.props && node.props.className === 'dacTest')[0];
  // The control a USER clicks. The scope write (B1c) never runs the component handler; this node
  // does, and that handler is exactly where the verify12 round hid its quota refill (mutant c).
  const switchBox = () => {
    const row = collect(view.tree, (node) => node.props && node.props.className === 'dacRow' && node.props.key === 'nativeToast')[0];
    if (row === undefined) return undefined;
    const found = collect(row, (node) => node.type === 'input' && node.props && node.props.role === 'switch');
    return found.length === 1 ? found[0] : undefined;
  };
  const flipSwitch = async (on) => {
    const box = switchBox();
    if (box === undefined) return false;
    box.props.onChange({ target: { checked: on } });
    await settle(4);
    view.render();
    return true;
  };
  const hint = () => {
    const node = collect(view.tree, (item) => item.props && item.props.className === 'dacTestHint')[0];
    return node === undefined ? '(none)' : flattenText(node);
  };
  const posts = () => calls.filter((call) => call.method === 'POST' && call.target.endsWith(ROUTE)).length;
  const state = () => {
    const text = hint();
    return {
      disabled: button().props.disabled,
      hint: text,
      timers: clock.timers.filter((timer) => timer.every !== true).length,
      intervals: clock.timers.filter((timer) => timer.every === true).length,
      allTimers: clock.timers.length,
    };
  };
  return { calls, context, harness, sandbox, view, clock, advance, tick, audit, button, hint, posts, state, contract, switchBox, flipSwitch, host };
}

async function main() {
  const t = build();
  say('the section renders and the test button exists', t.button() !== undefined, String(t.button() !== undefined));
  // Preflight for the B section below: if this node is gone or doubled, the gesture there would
  // silently test nothing, so it is asserted on its own before anything is measured through it.
  const gesture = t.switchBox();
  say('the gesture target exists: the pinned nativeToast row renders exactly ONE role="switch" checkbox',
    gesture !== undefined && gesture.props.checked === true,
    gesture === undefined ? 'no single role="switch" input inside the dacRow/nativeToast row' : `checked=${String(gesture.props.checked)}`);

  // ---------- A. the shipped behaviour, measured ----------
  say('A1 the button is enabled while the switch is on and the cooldown has not run', t.button().props.disabled === false, `disabled=${String(t.button().props.disabled)}`);
  const preDisable = t.button().props.disabled;
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  const after1 = t.state();
  say('A2 click #1 raises exactly ONE request and paints the button disabled', t.posts() === 1 && after1.disabled === true, `posts=${t.posts()} disabled=${String(after1.disabled)} hint="${after1.hint}"`);

  // A3 · two clicks in the SAME synchronous turn (no timer, no re-render in between)
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  say('A3 a second click in the same turn is refused (state is written before the raise)', t.posts() === 1, `posts=${t.posts()} hint="${t.hint()}"`);

  // A4 · 1 s and 2.999 s later. The ONLY rate control is the 3 s cooldown (r30 fix-14), so both sides of
  // that bound are measured: refused while inside it, accepted the moment it lifts.
  t.advance(1000);
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  const hint1s = t.hint();
  say('A4a after 1 s the click is still refused and the message names the seconds left', t.posts() === 1 && /2/.test(hint1s), `posts=${t.posts()} hint="${hint1s}"`);
  t.advance(1999);
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  say('A4b after 2.999 s still refused (the 3 s bound is exact)', t.posts() === 1, `posts=${t.posts()} hint="${t.hint()}"`);

  // A5 · the timer lifts it at 3 s
  t.advance(1);
  t.view.render();
  const after3 = t.state();
  say('A5 the cooldown timer lifts the flag at 3 s (button enabled, no click needed)', after3.disabled === false, `disabled=${String(after3.disabled)} timers=${after3.timers}`);
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  say('A5b the next click at +3.000 s is accepted (second request)', t.posts() === 2, `posts=${t.posts()} hint="${t.hint()}"`);

  // A6 · THERE IS NO ROLLING CEILING ANY MORE (r30 fix-14). Clicking every 3 s — the slowest rate the
  // flood control allows — must raise EVERY time: the design hands the button back after each cooldown.
  // This is also the behavioural half of the deletion, and it is MEASURED on the pre-change bytes:
  // there the same five clicks post THREE notifications, because the 5 s cooldown swallows a click every
  // 3 s and the rolling quota refuses what is left of the burst — so this check is red on those bytes.
  for (let index = 0; index < 3; index += 1) {
    t.advance(3000);
    t.view.render();
    t.button().props.onClick();
    await settle(6);
    t.view.render();
  }
  say('A6 no rolling ceiling: three more clicks at exactly the 3 s cooldown are ALL accepted (five raises in all)',
    t.posts() === 5, `posts=${t.posts()} hint="${t.hint()}"`);
  say('A6b after five accepted raises exactly one cooldown timer is alive (the old one was cleared)',
    t.state().timers === 1, `live cooldown timers=${t.state().timers} (all timers=${t.state().allTimers})`);

  // A7 · a click 1 ms inside the cooldown is refused, posts NOTHING, and the refusal is VISIBLE: the
  // button paints itself disabled (user ruling 2026-10-03 — the limit must be seen, not just enforced).
  t.advance(2999);
  t.view.render();
  const beforeRefused = t.posts();
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  const refused = t.state();
  say('A7 a click 1 ms before the cooldown lifts is refused, posts NOTHING, and paints the button DISABLED',
    t.posts() === beforeRefused && refused.disabled === true && refused.hint.indexOf('刚发过') >= 0,
    `posts=${t.posts()} (was ${beforeRefused}) hint="${refused.hint}" disabled=${String(refused.disabled)}`);

  // A7c · the verify11 L2 gap, re-aimed at the surviving rate control. That round's
  // M4-sweep-resets-the-quota mutant emptied the rolling window inside `nativeSweep`, and BOTH probes
  // stayed green because nothing here ever drove a second snapshot sync. The page syncs on every pending-interaction republish, so
  // this is a route the product really takes — and an empty selection (pushPending([])) is enough to
  // reach the sweep. With the window gone the same route can only mean the cooldown: a sweep that reset
  // it would hand the button back inside its own cooldown.
  const beforeSync = t.posts();
  t.harness.pushPending([]);
  await settle(6);
  t.view.render();
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  const afterSync = t.state();
  say('A7c a snapshot sync inside the cooldown does not lift it',
    t.posts() === beforeSync && afterSync.disabled === true && afterSync.hint.indexOf('刚发过') >= 0,
    `posts ${beforeSync} -> ${t.posts()} after pushPending([]); hint="${afterSync.hint}" disabled=${String(afterSync.disabled)}`);

  // ---------- B. bypass attempts, measured ----------
  // r30 fix-14 · WHAT THIS SECTION CAN SAY NOW. Before the change, B1 and B1c both started by FILLING
  // the rolling quota on purpose, because the interesting claim was "an OFF/ON toggle may not hand the
  // quota back". That quota is gone, so the claim is the opposite one, and it is MEASURED here rather
  // than assumed: the 3 s cooldown is per-SWITCH state (`nativeTeardown` clears it), so turning the
  // feature off and on again hands the button back READY and the next click raises at once — through
  // the REAL rendered role="switch" control (B1) and through a settings-scope write from outside this
  // page (B1c). What bounds what that costs is section D: every accepted raise supersedes the toast on
  // screen, so the desktop carries ONE test notification whatever the toggle rate.

  // B1 · the REAL gesture: the rendered role="switch" checkbox of the pinned nativeToast row, driven
  // through its own onChange. A rate-control refill hidden in that handler runs HERE and nowhere else;
  // probe-25's write-count guard is the source-side half of the same rule.
  t.advance(3000); // the cooldown armed at the end of section A has lifted, so "ready" below is not it
  t.view.render();
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  const armedAtSwitch = t.state();
  const postsBeforeToggle = t.posts();
  const offFlipped = await t.flipSwitch(false);
  const offState = t.state();
  const onFlipped = await t.flipSwitch(true);
  const onState = t.state();
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  const afterToggle = t.posts();
  say('B1 switch OFF then ON through the REAL role="switch" control clears the per-switch cooldown: the button is READY and the click raises at once',
    offFlipped === true && onFlipped === true && armedAtSwitch.disabled === true && offState.disabled === true
      && onState.disabled === false && afterToggle === postsBeforeToggle + 1,
    `posts ${postsBeforeToggle} -> ${afterToggle} (exactly one new request required); before the toggle disabled=${String(armedAtSwitch.disabled)}; while off disabled=${String(offState.disabled)} (the switch itself); back on disabled=${String(onState.disabled)} — the real control's own onChange ran, and the cooldown went with the switch`);
  // B1c · the SAME OFF/ON written straight to the settings scope — the route another window takes, and
  // the route that never runs the component handler body (which is where verify12 hid its refill). It is
  // also the control of the comparison above: the reading is not an artefact of the gesture.
  const postsBeforeScope = t.posts();
  await t.harness.scope.set('nativeToast', false);
  await settle(4);
  t.view.render();
  await t.harness.scope.set('nativeToast', true);
  await settle(4);
  t.view.render();
  const scopeState = t.state();
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  say('B1c the same OFF/ON written directly to the settings scope behaves the same way (the cooldown is per-switch state, whichever route flips it)',
    t.posts() === postsBeforeScope + 1 && scopeState.disabled === false,
    `posts ${postsBeforeScope} -> ${t.posts()} (exactly one new request required); back on disabled=${String(scopeState.disabled)} hint="${t.hint()}"`);

  // B2 · teardown (the plugin effect disposer) with a live cooldown, then re-apply. The cooldown is the
  // per-switch half, so this is the state teardown is allowed to drop; "no timer outlives the page" is
  // measured on the TIMER COUNT, not inferred from the painted flag (teardown does not publish).
  t.advance(3000); // the cooldown armed by B1c's raise has lifted
  t.view.render();
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  const armed = t.state();
  const nativeEffect = t.harness.state.effects.find((effect) => String(effect.label).includes('native toast'));
  nativeEffect.dispose();
  t.view.render();
  const afterTeardown = {
    disabled: t.button().props.disabled,
    timers: t.clock.timers.filter((timer) => timer.every !== true).length,
  };
  say('B2 teardown drops the cooldown timer and the painted flag becomes STALE (no publish)',
    armed.timers >= 1 && afterTeardown.timers === 0,
    `armed timers=${armed.timers}; after teardown timers=${afterTeardown.timers}, painted disabled=${String(afterTeardown.disabled)} (stale: teardown does not publish)`);
  t.contract.apply(t.harness.ctx);
  t.view.render();
  const postsBeforeReapply = t.posts();
  const btn2 = collect(t.view.tree, (node) => node.type === 'button' && node.props && node.props.className === 'dacTest')[0];
  if (btn2 !== undefined) {
    btn2.props.onClick();
    await settle(6);
  }
  t.view.render();
  say('B3 after teardown + re-apply the button raises again immediately (the cooldown went with the disposer)',
    t.posts() === postsBeforeReapply + 1,
    `posts ${postsBeforeReapply} -> ${t.posts()}`);

  // B4 · a fresh bundle (what a page reload gives) starts ready: no cooldown timer, no live record.
  const second = build();
  say('B4 a fresh bundle starts with no cooldown and an enabled button',
    second.button().props.disabled === false && second.posts() === 0 && second.state().timers === 0,
    `disabled=${String(second.button().props.disabled)} posts=${second.posts()} cooldown timers=${second.state().timers}`);

  // ---------- C. r30 fix-11 · the page repaints ITSELF while the button is grey ----------
  // WHY THIS SECTION EXISTS (and why A/B could not see the defect). Every reading in A and B is taken
  // after view.render(), so the PROBE repainted the page before each one — the single thing a real
  // machine never does. A product that only mutates module state when the cooldown changes therefore
  // measured green here while the user's button stayed grey for good ("就不亮了点不了了"). Section C
  // closes that blind spot:
  //   · autoRender — a state set re-renders the component, the way React does when the store's
  //     subscriber calls setSnapshot;
  //   · tick() — a browser-like event loop, repeating timers included;
  //   · every reading below asserts audit.manual did NOT move since setup, so the tree it reads can
  //     only have been painted by the product itself.
  // r30 fix-14 · the state this section used to measure as C2 (a rolling-window slot freeing on the
  // clock, with nothing publishing at that moment) no longer exists: the cooldown is the only gate, so
  // the grey stretch IS the cooldown and the cooldown's own timer publishes the instant it lifts. What
  // is still measured here is the LOOP: armed while grey, exactly one repeating timer at a time, no
  // request out of it, disarmed the moment the button is ready, and cleared by teardown.

  // C0/C1 · the COOLDOWN half.
  const C1 = build({ autoRender: true, answer404: true });
  const c1Renders = C1.audit.manual;
  say('C0 the auto-render instance mounts with the button enabled on ONE probe render, and the wiring is provably live: a store publish already repainted the page by itself',
    C1.button().props.disabled === false && c1Renders === 1 && C1.audit.auto >= 1,
    'disabled=' + String(C1.button().props.disabled) + '; probe renders=' + String(c1Renders) + '; automatic renders=' + String(C1.audit.auto) + ' (the mount status refresh published, and the page repainted with no probe render — the wiring this section depends on)');
  C1.button().props.onClick();
  await settle(6);
  const c1AfterClick = C1.button().props.disabled;
  C1.tick(3000);
  say('C1 the 3 s cooldown lifts the button with ZERO probe renders (the product repainted its own page)',
    c1AfterClick === true && C1.button().props.disabled === false && C1.audit.manual === c1Renders && C1.posts() === 1,
    'after the click disabled=' + String(c1AfterClick) + '; after tick(3000) disabled=' + String(C1.button().props.disabled) + '; probe renders ' + String(c1Renders) + ' -> ' + String(C1.audit.manual) + '; posts=' + String(C1.posts()));

  // C2 · THE GREY STRETCH. One click, then the clock: the button is painted disabled for 3 s, and that
  // is the only grey state the product has left. The answer poll is answered 404 here (see answer404),
  // so the repaint loop is the ONLY repeating timer alive during the stretch — the one condition under
  // which "no request came out of a repeating timer" is a statement about the repaint loop.
  const C2 = build({ autoRender: true, answer404: true });
  const c2Renders = C2.audit.manual;
  C2.button().props.onClick();
  await settle(6);
  C2.tick(1000); // the first answer poll fires inside this tick and is answered 404 ...
  await settle(6); // ... and its microtask must be flushed before the interval count below means anything
  const c2Grey = C2.state();
  say('C2a while the cooldown refuses, the painted button is disabled and no probe render has happened',
    C2.posts() === 1 && c2Grey.disabled === true && C2.audit.manual === c2Renders,
    'posts=' + String(C2.posts()) + '; disabled=' + String(c2Grey.disabled) + '; hint="' + c2Grey.hint + '"; probe renders=' + String(C2.audit.manual) + ' (setup only)');
  say('C2b while the button is grey exactly ONE repeating timer is alive, and it is the repaint loop',
    c2Grey.intervals === 1,
    'repeating timers while grey=' + String(c2Grey.intervals) + ' (each test raise starts a 1 Hz answer poll, but this instance answers that poll 404, so the poll interval dies on its first tick; the one left is the repaint loop)');
  const c2Fires = C2.clock.intervalFires;
  const c2IntervalCalls = C2.clock.intervalCalls;
  C2.tick(2000); // +3 s: the cooldown timer lifts the flag
  const c2Opened = C2.button().props.disabled === false;
  say('C2c when the cooldown lifts, the button comes back with ZERO probe renders',
    c2Opened === true && C2.audit.manual === c2Renders && C2.posts() === 1,
    'disabled=' + String(C2.button().props.disabled) + ' at +3 s; probe renders ' + String(c2Renders) + ' -> ' + String(C2.audit.manual) + '; posts=' + String(C2.posts()) + ' (unchanged from 1 — the repaint loop cost the Host nothing)');
  say('C2d the repaint loop stops the moment the button is ready again, and no tick of it made a request',
    C2.state().intervals === 0 && C2.clock.intervalCalls === c2IntervalCalls && C2.clock.intervalFires - c2Fires >= 1,
    'repeating timers after recovery=' + String(C2.state().intervals) + '; repaint ticks while grey, measured from the moment the answer poll died=' + String(C2.clock.intervalFires - c2Fires) + ' (a 3 s grey stretch allows exactly two ticks, at +1 s and +2 s — the one that would fall due at +3 s never runs, because the cooldown timer has the smaller id and clears the loop first at that instant); requests made inside repeating timers during that stretch=' + String(C2.clock.intervalCalls - c2IntervalCalls) + ' (measured: the fetch stub records synchronously inside the callback)');
  const c2FiresAfter = C2.clock.intervalFires;
  C2.tick(10000);
  say('C2e and it does not come back: ten more seconds of clock change fire no repeating timer at all',
    C2.clock.intervalFires === c2FiresAfter,
    'repeating fires during the last 10 s=' + String(C2.clock.intervalFires - c2FiresAfter));

  // C3 · the switch half of the same guard. While the switch is OFF the button is disabled by the
  // SWITCH, not by the cooldown, so the loop must not be armed; and because the cooldown is per-switch
  // state, turning it back ON leaves the button READY — so the loop must not be armed then either.
  // (r30 fix-14: it used to be re-armed here, to wait for a rolling-window slot to free.)
  const C3 = build({ autoRender: true, answer404: true });
  C3.button().props.onClick();
  await settle(6);
  C3.tick(1000);
  await settle(6); // flush the answer poll's 404, see C2
  const c3Armed = C3.state();
  const c3Box = C3.switchBox();
  c3Box.props.onChange({ target: { checked: false } });
  await settle(4);
  const c3Off = C3.state();
  C3.tick(10000);
  const c3OffAfter = C3.state();
  say('C3 while the switch is OFF the repaint loop is disarmed (the button is disabled by the switch, not by the cooldown)',
    c3Armed.intervals === 1 && c3Off.intervals === 0 && c3OffAfter.intervals === 0,
    'repeating timers: while grey=' + String(c3Armed.intervals) + ', right after OFF=' + String(c3Off.intervals) + ', 10 s of clock later=' + String(c3OffAfter.intervals));
  const c3BoxOn = C3.switchBox();
  c3BoxOn.props.onChange({ target: { checked: true } });
  await settle(4);
  const c3On = C3.state();
  const c3PostsOn = C3.posts();
  C3.tick(10000);
  say('C3b turning it back ON leaves the loop DISARMED and the button ready: the per-switch cooldown went with the switch, so there is nothing grey to repaint',
    c3On.intervals === 0 && c3PostsOn === 1 && C3.button().props.disabled === false && C3.posts() === 1,
    'repeating timers after ON=' + String(c3On.intervals) + '; posts=' + String(C3.posts()) + ' (unchanged: the toggle raised nothing); painted disabled=' + String(C3.button().props.disabled));

  // C4 · teardown with the button grey: the loop goes with the page, like the cooldown timer and the
  // polls. (B2 proves the same for the cooldown timer; a repeating timer needs its own proof.)
  const C4 = build({ autoRender: true, answer404: true });
  C4.button().props.onClick();
  await settle(6);
  C4.tick(1000);
  await settle(6); // flush the answer poll's 404, see C2
  const c4Armed = C4.state();
  const c4Effect = C4.harness.state.effects.find((effect) => String(effect.label).includes('native toast'));
  c4Effect.dispose();
  const c4After = C4.state();
  const c4Fires = C4.clock.intervalFires;
  C4.tick(20000);
  say('C4 teardown drops the repaint loop as well — no timer outlives the page',
    c4Armed.intervals === 1 && c4After.intervals === 0 && C4.clock.intervalFires === c4Fires && C4.button().props.disabled === true,
    'repeating timers: while grey=' + String(c4Armed.intervals) + ', after teardown=' + String(c4After.intervals) + '; repeating fires during the next 20 s=' + String(C4.clock.intervalFires - c4Fires) + '; painted disabled=' + String(C4.button().props.disabled) + ' (nothing repaints after teardown, so the flag stays where teardown left it)');

  // ---------- D. r30 fix-12 · ONE test notification on screen at a time ----------
  // WHY THIS SECTION EXISTS. The user's own second report: five clicks over ~53 s raised five REAL
  // toasts, and because they were never answered or dismissed ALL FIVE stayed on screen for their
  // frozen 10-minute TTL. Nothing above can see it — A/B/C count REQUESTS, and "two accepted raises
  // are two raises" is true whether or not the first toast is still up. This section reads the SCREEN
  // (`host.screen`, see build()): a raise puts a toast there, a revoke the Host accepts takes it down.

  // D1 · the core: two clicks, 3 s apart (exactly the cooldown, so the second one is ACCEPTED).
  const D1 = build({ host: true });
  D1.button().props.onClick();
  await settle(6);
  D1.view.render();
  const d1First = [...D1.host.screen.keys()];
  D1.advance(3000); // exactly the cooldown: the button is ready again
  D1.view.render();
  const d1Ready = D1.button().props.disabled === false;
  D1.button().props.onClick();
  await settle(6);
  D1.view.render();
  const d1OnScreen = [...D1.host.screen.keys()];
  const d1Revoked = D1.host.revokes.reduce((all, call) => all.concat(call.tokens), []);
  say('D1 click, wait past the cooldown, click again: exactly ONE test notification is left on screen and a revoke really named the earlier token',
    d1Ready === true && D1.posts() === 2 && d1First.length === 1 && D1.host.screen.size === 1
      && d1OnScreen.length === 1 && d1OnScreen[0] !== d1First[0]
      && D1.host.revokes.length === 1 && d1Revoked.length === 1 && d1Revoked[0] === d1First[0],
    'on screen after the second click=' + String(D1.host.screen.size) + ' (the earlier token is ' + (D1.host.screen.has(d1First[0]) === true ? 'STILL UP' : 'gone') + '); raise POSTs=' + String(D1.posts()) + ' (both clicks accepted, so the flood control is unchanged); revoke requests=' + String(D1.host.revokes.length) + ' naming ' + JSON.stringify(D1.host.revokes.map((call) => call.tokens)) + '; earlier token=' + String(d1First[0]) + '; surviving token=' + String(d1OnScreen[0]));

  // D2 · the user's own sequence: five clicks 10 s apart. The flood control must accept all five — with
  // a 3 s cooldown and no rolling quota there is nothing left that could refuse one — and the screen must
  // carry ONE toast at the end: five clicks, one toast. This sequence is NOT a falsifier for the deleted
  // quota: at 10 s spacing only two stamps are ever inside a rolling 30 s, and the pre-change run measured
  // exactly that (all five accepted). The quota falsifiers are A6's 3 s spacing and the D-section checks
  // whose second click now lands at +3 s, inside the old 5 s cooldown.
  const D2 = build({ host: true });
  for (let index = 0; index < 5; index += 1) {
    D2.button().props.onClick();
    await settle(6);
    D2.view.render();
    if (index < 4) {
      D2.advance(10000);
      D2.view.render();
    }
  }
  say("D2 the user's own sequence — five clicks 10 s apart — raises all five notifications and leaves exactly ONE toast on screen",
    D2.posts() === 5 && D2.host.screen.size === 1 && D2.host.revokes.length === 4,
    'raise POSTs=' + String(D2.posts()) + ' (the flood control accepted every click, unchanged); on screen=' + String(D2.host.screen.size) + '; revoke requests=' + String(D2.host.revokes.length) + ' naming ' + JSON.stringify(D2.host.revokes.map((call) => call.tokens.length)) + ' token(s) each');

  // D3 · the safety half: a REAL approval's notification goes through the SAME route and must survive
  // the test button untouched. This is the one thing the supersede could break silently, and no
  // source-text pin can see it: the filter, the reason string and the call all LOOK right while the list
  // handed over is every live token (`nativeLiveTokens`).
  const D3 = build({ host: true });
  D3.harness.pushPending([['session-1', approvalInteraction('appr-key-1')]]);
  await settle(6);
  D3.view.render();
  const d3Raised = [...D3.host.screen.entries()];
  const d3RealToken = d3Raised.length === 1 ? d3Raised[0][0] : null;
  const d3RealKey = d3Raised.length === 1 ? d3Raised[0][1].key : null;
  D3.button().props.onClick();
  await settle(6);
  D3.view.render();
  const d3AfterFirst = D3.host.screen.has(d3RealToken);
  D3.advance(3000);
  D3.view.render();
  D3.button().props.onClick();
  await settle(6);
  D3.view.render();
  const d3Revoked = D3.host.revokes.reduce((all, call) => all.concat(call.tokens), []);
  const d3RaiseBodies = D3.calls
    .filter((call) => call.method === 'POST' && call.target.endsWith(ROUTE))
    .map((call) => JSON.parse(call.body));
  say("D3 a REAL approval's notification survives two test clicks and is named in no revoke (only the previous TEST toast is superseded)",
    d3RealToken !== null && d3RealKey === 'appr-key-1'
      && d3RaiseBodies.length === 3 && d3RaiseBodies.filter((body) => body.key === 'appr-key-1').length === 1
      && d3AfterFirst === true && D3.host.screen.has(d3RealToken) === true
      && D3.host.screen.size === 2 && d3Revoked.length === 1 && d3Revoked.indexOf(d3RealToken) < 0,
    'the real raise went out through the same route (raise bodies: ' + JSON.stringify(d3RaiseBodies.map((body) => body.key)) + '); after test click #1 the real toast is ' + (d3AfterFirst === true ? 'still up' : 'GONE')
      + '; after test click #2 the screen holds ' + String(D3.host.screen.size) + ' (the real one + the newest test one — the earlier test toast was replaced); tokens named in a revoke: ' + JSON.stringify(d3Revoked));

  // D4 · placement matters as much as the filter: the supersede runs AFTER both gates, so a click the
  // flood control REFUSES may not take the toast that is on screen down with it. (A supersede moved
  // above the gates is the plausible wrong implementation, and it is invisible to every check above.)
  const D4 = build({ host: true });
  D4.button().props.onClick();
  await settle(6);
  D4.view.render();
  const d4First = [...D4.host.screen.keys()][0];
  D4.button().props.onClick(); // inside the 3 s cooldown: REFUSED
  await settle(6);
  D4.view.render();
  say('D4 a click the flood control REFUSES leaves the toast that is on screen alone (the supersede runs only after both gates pass)',
    D4.posts() === 1 && D4.host.screen.size === 1 && D4.host.screen.has(d4First) === true && D4.host.revokes.length === 0,
    'raise POSTs=' + String(D4.posts()) + ' (the second click was refused, so it raised nothing); on screen=' + String(D4.host.screen.size) + ' (the first toast is ' + (D4.host.screen.has(d4First) === true ? 'still up' : 'GONE') + '); revoke requests=' + String(D4.host.revokes.length) + '; hint="' + D4.hint() + '"');

  // D5/D6/D7 · r30 fix-13 (Q7) · THE LOOK-ALIKE SHAPES, MEASURED. D3's real approval carried `session-1`
  // and `appr-key-1`, so every check above stays green for a supersede filter that reads a LOOK-ALIKE
  // field instead of the record's own `test` flag. The verify13 round measured exactly that: its m4
  // mutant (`record.test === true` -> `String(record.sessionId) === 'test'`, ONE edit at
  // lib/client.js:2482) left this probe 36/36 GREEN. It passes because the TEST CHANNEL stamps itself
  // `sessionId: 'test'` (:2371) and a key of the shape `test:<ms>:<n>` (:2372) -- which is precisely why
  // a REAL approval carrying those same shapes has to be MEASURED rather than assumed. A real
  // approval's sessionId is its SNAPSHOT KEY (eachPending, :1820 -> the batch entry at :2773), so the
  // map key below is what lands in the raise body and in the record the filter reads.
  const realApprovalSurvivesTestClicks = async (snapshotSessionId, approvalKey) => {
    const run = build({ host: true });
    run.harness.pushPending([[snapshotSessionId, approvalInteraction(approvalKey, { sessionId: snapshotSessionId })]]);
    await settle(6);
    run.view.render();
    const raised = [...run.host.screen.entries()];
    const realToken = raised.length === 1 ? raised[0][0] : null;
    run.button().props.onClick();
    await settle(6);
    run.view.render();
    const afterFirstClick = realToken !== null && run.host.screen.has(realToken) === true;
    run.advance(3000); // exactly the cooldown, so the second click is ACCEPTED and supersedes the first test toast
    run.view.render();
    run.button().props.onClick();
    await settle(6);
    run.view.render();
    const revoked = run.host.revokes.reduce((all, call) => all.concat(call.tokens), []);
    const bodies = run.calls
      .filter((call) => call.method === 'POST' && call.target.endsWith(ROUTE))
      .map((call) => JSON.parse(call.body));
    return { run, realToken, afterFirstClick, revoked, bodies };
  };
  const raiseBodiesOf = (result, sessionId, key) => result.bodies.filter((body) => body.sessionId === sessionId && body.key === key).length;
  const shapes = (result) => JSON.stringify(result.bodies.map((body) => body.sessionId + '/' + body.key));
  const d5 = await realApprovalSurvivesTestClicks('test', 'appr-key-look-alike');
  say("D5 the m4 case, measured: a REAL approval whose sessionId is literally 'test' survives two test clicks, and no revoke names its token",
    d5.realToken !== null && d5.afterFirstClick === true && raiseBodiesOf(d5, 'test', 'appr-key-look-alike') === 1
      && d5.run.host.screen.has(d5.realToken) === true && d5.run.host.screen.size === 2
      && d5.revoked.length === 1 && d5.revoked.indexOf(d5.realToken) < 0,
    'raise bodies (sessionId/key): ' + shapes(d5) + ' (one real raise; the test channel sends sessionId \'test\' too, so ONLY the record flag tells them apart)'
      + '; after test click #1 the real toast is ' + (d5.afterFirstClick === true ? 'still up' : 'GONE')
      + '; after test click #2 the screen holds ' + String(d5.run.host.screen.size) + ' (expected: the real one + the newest test one, so the earlier test toast WAS superseded)'
      + '; tokens named in a revoke: ' + JSON.stringify(d5.revoked) + ' (expected: the earlier TEST token only)');
  const d6 = await realApprovalSurvivesTestClicks('session-1', 'test');
  say("D6 a REAL approval whose key is literally 'test' (the value the test channel uses as its sessionId) survives the same two clicks",
    d6.realToken !== null && d6.afterFirstClick === true && raiseBodiesOf(d6, 'session-1', 'test') === 1
      && d6.run.host.screen.has(d6.realToken) === true && d6.run.host.screen.size === 2
      && d6.revoked.length === 1 && d6.revoked.indexOf(d6.realToken) < 0,
    'raise bodies (sessionId/key): ' + shapes(d6)
      + '; after test click #1 the real toast is ' + (d6.afterFirstClick === true ? 'still up' : 'GONE')
      + '; after test click #2 the screen holds ' + String(d6.run.host.screen.size)
      + '; tokens named in a revoke: ' + JSON.stringify(d6.revoked) + ' (expected: the earlier TEST token only)');
  const d7 = await realApprovalSurvivesTestClicks('session-1', 'test:1000000:1');
  say("D7 a REAL approval whose key IS the test channel's own first key (test:1000000:1 on this probe clock) survives too, test toast and all",
    d7.realToken !== null && d7.afterFirstClick === true && raiseBodiesOf(d7, 'session-1', 'test:1000000:1') === 1
      && raiseBodiesOf(d7, 'test', 'test:1000000:1') === 1
      && d7.run.host.screen.has(d7.realToken) === true && d7.run.host.screen.size === 2
      && d7.revoked.length === 1 && d7.revoked.indexOf(d7.realToken) < 0,
    'raise bodies (sessionId/key): ' + shapes(d7) + ' -- the SAME key, test:1000000:1, is carried by the real raise (sessionId session-1) and by the first test raise (sessionId test)'
      + '; after test click #1 the real toast is ' + (d7.afterFirstClick === true ? 'still up' : 'GONE')
      + '; after test click #2 the screen holds ' + String(d7.run.host.screen.size)
      + '; tokens named in a revoke: ' + JSON.stringify(d7.revoked) + ' (expected: the earlier TEST token only, never the real key-colliding one)');

  // D8/D9 · r30 fix-15 · THE SWITCH ITSELF MUST TAKE THE TEST NOTIFICATION DOWN. Every check above
  // drives the BUTTON; the user's defect is on the SWITCH. `nativeTeardown()` — the path the 通知
  // switch OFF takes, and the plugin disposer — used to forget the live records WITHOUT telling the
  // Host anything, so the toast stayed on the desktop for its frozen TTL while the page no longer knew
  // the token; after that even the supersede could not reach it. The user measured the result: switch
  // OFF→ON, click the test button, and TWO test notifications are on screen; five cycles stacked five
  // (1→2→3→4→5, zero revokes), while a control run that never toggles stays at one.
  //
  // WHY ONLY AN EXECUTED CHECK CAN SEE IT. probe-25 pins the source shape; what has to be MEASURED is
  // that the request really leaves the page on the toggle and that exactly one test toast survives the
  // cycle. Both readings are taken through the REAL rendered role="switch" control of the nativeToast
  // row (its own onChange), the same gesture B1 uses.
  //
  // THE SATURATION HALF, KEPT. A REAL approval (session-1 / appr-key-stays-up) is raised through the
  // same route before the first click, and NO token ever issued for it may appear in any revoke — that
  // is what "the teardown collection is test-only" means behaviourally, and a teardown that revoked
  // every live token would be named here.
  // NOTE, measured rather than assumed: the approval toast is NOT expected to stay up. Teardown forgets
  // the approval's record too, so the next snapshot sync raises it again (the Host keeps the first toast
  // for its TTL — "already notified" was never tracked). That is pre-existing behaviour on this path and
  // is NOT what this section is about, so the section counts TEST toasts on the screen (one at a time,
  // whatever the toggle rate) and attributes APPROVAL tokens by their raise bodies, never by position.
  const D8 = build({ host: true });
  D8.harness.pushPending([['session-1', approvalInteraction('appr-key-stays-up')]]);
  await settle(6);
  D8.view.render();
  /** Every raise this instance ever sent to the frozen route, with the body that identifies it. */
  const raiseBodies = () => D8.calls
    .filter((call) => call.method === 'POST' && call.target.endsWith(ROUTE))
    .map((call) => JSON.parse(call.body));
  const approvalTokens = () => raiseBodies().filter((body) => body.key === 'appr-key-stays-up').map((body) => body.token);
  const testTokens = () => raiseBodies().filter((body) => body.sessionId === 'test').map((body) => body.token);
  const revokedTokens = () => D8.host.revokes.reduce((all, call) => all.concat(call.tokens), []);
  const testToastsLive = () => testTokens().filter((token) => D8.host.screen.has(token) === true);
  const toggle = async (on) => {
    const box = D8.switchBox();
    if (box === undefined) return false;
    box.props.onChange({ target: { checked: on } });
    await settle(6);
    D8.view.render();
    return true;
  };
  /** One OFF→ON cycle through the rendered control, with the readings the assertions need. */
  const cycle = async () => {
    const before = revokedTokens().length;
    // Measured BEFORE the flip, so "teardown disarmed what was armed" is a comparison and not an
    // assumption. This instance carries an approval poll and a status-refresh timer as well, which
    // is why the absolute number is not pinned: the property is that teardown takes the count to
    // ZERO (it clears the cooldown timer itself and forgets every record, which clears the polls).
    const timersBeforeOff = D8.clock.timers.length;
    const offFlipped = await toggle(false);
    const revokesAtOff = revokedTokens().length;
    const timersWhileOff = D8.clock.timers.length;
    const repeatingWhileOff = D8.clock.timers.filter((timer) => timer.every === true).length;
    const onFlipped = await toggle(true);
    D8.button().props.onClick();
    await settle(6);
    D8.view.render();
    return {
      offFlipped,
      onFlipped,
      revokes: revokedTokens().length - before,
      namedAtOff: revokedTokens().slice(before, revokesAtOff),
      timersBeforeOff,
      timersWhileOff,
      repeatingWhileOff,
      liveTestTokens: testToastsLive(),
      approvalToasts: approvalTokens().filter((token) => D8.host.screen.has(token) === true).length,
    };
  };
  const d8ClicksBefore = D8.posts();
  D8.button().props.onClick();
  await settle(6);
  D8.view.render();
  const d8FirstTest = testToastsLive();
  const d8ApprovalRaised = approvalTokens();
  const d8First = await cycle();
  say('D8a the switch OFF->ON cycle at the REAL role="switch" control with a live test notification: the pre-teardown test token is GONE from the screen and a revoke request NAMED it',
    d8FirstTest.length === 1 && d8First.offFlipped === true && d8First.onFlipped === true
      && D8.host.screen.has(d8FirstTest[0]) === false
      && d8First.revokes === 1 && d8First.namedAtOff.length === 1 && d8First.namedAtOff[0] === d8FirstTest[0],
    'test tokens raised before the toggle=' + JSON.stringify(d8FirstTest) + '; the pre-teardown token after the cycle: ' + (D8.host.screen.has(d8FirstTest[0]) === true ? 'STILL UP (no revoke ever reached it)' : 'gone') + '; revoke requests the OFF added=' + String(d8First.revokes) + ' naming ' + JSON.stringify(d8First.namedAtOff) + ' (expected exactly the live TEST token above)');
  say('D8b each cycle leaves EXACTLY ONE test notification live (the raise at the end of the cycle), and that raise really went out',
    d8First.liveTestTokens.length === 1 && D8.posts() === d8ClicksBefore + 2,
    'test tokens live after the cycle=' + String(d8First.liveTestTokens.length) + ' ' + JSON.stringify(d8First.liveTestTokens) + '; raise POSTs=' + String(D8.posts()) + ' (was ' + String(d8ClicksBefore) + ' before the click + cycle: exactly 2, one per click)');
  say('D8c the toggle leaves NO timer behind: teardown takes the live timer count to ZERO (the cooldown timer and the answer polls) and arms no repeating timer of its own',
    d8First.timersBeforeOff >= 1 && d8First.timersWhileOff === 0 && d8First.repeatingWhileOff === 0,
    'timers armed before the OFF flip=' + String(d8First.timersBeforeOff) + ' (this instance carries the cooldown timer, an approval answer poll and a status-refresh timer); while the switch was OFF=' + String(d8First.timersWhileOff) + ' of which repeating=' + String(d8First.repeatingWhileOff) + ' — teardown cleared the cooldown timer itself and forgot every record, which clears each poll with it');
  say('D8d SATURATION: NO token ever issued for the real approval appears in any revoke request, before or after the toggle',
    d8ApprovalRaised.length >= 1
      && revokedTokens().filter((token) => d8ApprovalRaised.indexOf(token) >= 0).length === 0
      && d8First.approvalToasts >= 1,
    'approval tokens issued through the route=' + JSON.stringify(d8ApprovalRaised) + ' (the approval is re-raised after the ON flip, so more than one is expected); revoked tokens=' + JSON.stringify(revokedTokens()) + '; approval tokens among them=' + JSON.stringify(revokedTokens().filter((token) => d8ApprovalRaised.indexOf(token) >= 0)) + ' (must be empty — a teardown that revoked every live token would name them here)');
  say('D8e the OFF->ON cycle added exactly ONE revoke, for exactly ONE test token: the two test notifications the user measured need ZERO revokes, and leave TWO test toasts',
    d8First.revokes === 1 && d8First.liveTestTokens.length === 1 && d8First.namedAtOff.every((token) => d8ApprovalRaised.indexOf(token) < 0),
    'test toasts live after the cycle=' + String(d8First.liveTestTokens.length) + ' (the pre-change bytes read 2, then 3, 4, 5 as the cycles repeat, with no revoke at all); revokes added by the cycle=' + String(d8First.revokes) + ' naming ' + JSON.stringify(d8First.namedAtOff));
  // D9 · THE USER'S OWN SEQUENCE: repeat the cycle three more times. Each repetition must revoke exactly
  // the one test token that was live, raise exactly one new one, and never name an approval token.
  const d9RevokesBefore = revokedTokens().length;
  const d9Cycles = [];
  for (let index = 0; index < 3; index += 1) {
    D8.advance(3000); // exactly the cooldown, so the next click is ACCEPTED
    D8.view.render();
    d9Cycles.push(await cycle());
  }
  const d9Revokes = revokedTokens();
  const d9ApprovalRevokes = d9Revokes.filter((token) => d8ApprovalRaised.indexOf(token) >= 0);
  say('D9 three more OFF->ON cycles: the live test count NEVER moves off 1, every cycle revokes exactly the token that was up, and no approval token is ever named',
    d9Cycles.length === 3
      && d9Cycles.every((item) => item.liveTestTokens.length === 1)
      && d9Cycles.every((item) => item.revokes === 1)
      && d9Cycles.every((item) => item.namedAtOff.length === 1)
      && d9Revokes.length === d9RevokesBefore + 3
      && d9ApprovalRevokes.length === 0,
    'test tokens live after each of the three cycles=' + JSON.stringify(d9Cycles.map((item) => item.liveTestTokens.length)) + ' (must be 1,1,1; the pre-change bytes read 2,3,4); revoke requests added per cycle=' + JSON.stringify(d9Cycles.map((item) => item.revokes)) + '; revoked tokens in total=' + String(d9Revokes.length) + ' (was ' + String(d9RevokesBefore) + '), naming ' + JSON.stringify(d9Revokes) + '; approval tokens among them=' + JSON.stringify(d9ApprovalRevokes) + ' (must be empty); test tokens issued in all=' + String(testTokens().length));
  // F1/F2 · r30 fix-16 · CLICK, THEN OFF IN THE SAME TICK, plus the diagnostics that must show the
  // revoke it sends. The verify15 round built a mutant (its m13) that filters records still `raising`
  // out of the teardown revoke, and this probe stayed 41/41 GREEN on those bytes: D8/D9 await the
  // raise answer before they flip the switch, and by then the record is `raised`, not `raising`. Only
  // probe-25's TEXT pin caught it. The race is real and reachable: the click puts its raise on the
  // wire with the record in `raising`, and a user who turns the switch off in that same tick has no
  // reason to wait. The scene below therefore awaits NOTHING between the click and the flip, and it
  // reads both the SCREEN and the plugin's own diagnostics snapshot.
  //
  // WHAT MUST HOLD (the invariant, not the implementation): the token the click minted is NAMED by
  // the revoke the teardown sends, so nothing is left raising forever and no orphan toast is left
  // behind. F2 is the verify15 round's S3 reading: the snapshot must name the reason and move
  // `counters.revoked` — and it must move it exactly ONCE, because teardown forgets its records in
  // the same tick, so the settle path cannot count them at all.
  //
  // MEASURED, not asserted (.scratch/audit-r30/fix-16/p26-mut-m13.txt, a COPY of these bytes with
  // the m13 edit applied): F1 and F2 are the ONLY two red checks, 41/43, with every other check of
  // this probe still green — which is also the proof that the teardown really does build its list
  // from a still-`raising` record here (a filter on that state removes the revoke entirely).
  const emptySnapshot = { tokens: [], counters: { revoked: 0 }, lastRevokeReason: '' };
  const snapshotOf = (run) => {
    const surface = run.context.window.__DSH_APPROVAL_CHIME__ ?? null;
    return surface === null || typeof surface.nativeToast?.state !== 'function' ? emptySnapshot : surface.nativeToast.state();
  };
  /** Click the test button and flip the REAL role="switch" OFF, with NOTHING awaited in between. */
  const clickThenOff = (run) => {
    run.button().props.onClick();
    const beforeOff = snapshotOf(run);
    const box = run.switchBox();
    if (box === undefined) return { beforeOff, flipped: false };
    box.props.onChange({ target: { checked: false } });
    return { beforeOff, flipped: true };
  };
  const F = build({ host: true });
  const fRaiseBodies = () => F.calls
    .filter((call) => call.method === 'POST' && call.target.endsWith(ROUTE))
    .map((call) => JSON.parse(call.body));
  const fTestTokens = () => fRaiseBodies().filter((body) => body.sessionId === 'test').map((body) => body.token);
  const fClicked = clickThenOff(F);
  const fTokensAtOff = fTestTokens();
  await settle(8);
  F.view.render();
  const fAfter = snapshotOf(F);
  const fRevokeNames = F.host.revokes.reduce((all, call) => all.concat(call.tokens), []);
  const fLive = fTokensAtOff.filter((token) => F.host.screen.has(token) === true);
  say('F1 a click and the switch OFF in the SAME tick (the raise still unanswered, the record still `raising`): the teardown revoke NAMES that token, the screen keeps NO orphan toast and no record is left half-registered',
    fClicked.flipped === true
      && fClicked.beforeOff.tokens.length === 1 && fClicked.beforeOff.tokens[0].state === 'raising'
      && fTokensAtOff.length === 1
      && F.host.revokes.length === 1 && fRevokeNames.length === 1 && fRevokeNames[0] === fTokensAtOff[0]
      && fLive.length === 0 && F.host.screen.size === 0
      && fAfter.tokens.length === 0,
    'the records the page held at the OFF flip=' + JSON.stringify(fClicked.beforeOff.tokens.map((token) => ({ token: token.token, state: token.state })))
      + ' (one record, still `raising`: nothing was awaited between the click and the flip, and the teardown that follows builds its list from exactly this state)'
      + '; the test token that click minted=' + JSON.stringify(fTokensAtOff)
      + '; revoke requests after everything settled=' + String(F.host.revokes.length) + ' naming ' + JSON.stringify(fRevokeNames)
      + '; test toasts still on the screen=' + String(fLive.length) + ' (the whole screen holds ' + String(F.host.screen.size) + ')'
      + '; records the page still holds=' + String(fAfter.tokens.length) + ' (a record left `raising` forever would be listed here)');
  const F2 = build({ host: true });
  const f2Clicked = clickThenOff(F2);
  const f2Timeline = [];
  for (let tick = 1; tick <= 8; tick += 1) {
    await settle(1);
    const snap = snapshotOf(F2);
    f2Timeline.push({ tick, revoked: snap.counters.revoked, reason: snap.lastRevokeReason, revokeRequests: F2.host.revokes.length });
  }
  const f2After = snapshotOf(F2);
  const f2Last = f2Timeline[f2Timeline.length - 1];
  const f2Growth = f2Timeline.map((row, index) => row.revoked - (index === 0 ? 0 : f2Timeline[index - 1].revoked));
  say('F2 the teardown revoke is VISIBLE in the diagnostics snapshot of the plugin itself (lastRevokeReason names it, counters.revoked moves) and it is counted exactly ONCE, never again when the Host answers',
    f2Clicked.flipped === true
      && f2Clicked.beforeOff.tokens.length === 1 && f2Clicked.beforeOff.tokens[0].state === 'raising'
      && F2.host.revokes.length === 1
      && f2Growth.filter((step) => step !== 0).length === 1 && f2Growth.reduce((sum, step) => sum + step, 0) === 1
      && f2Last.revoked === 1 && f2Last.reason === 'teardown' && f2Last.revokeRequests === 1
      && f2After.counters.revoked === 1 && f2After.lastRevokeReason === 'teardown',
    'the snapshot on each of the eight turns after the OFF flip (one flushed microtask queue per turn)=' + JSON.stringify(f2Timeline)
      + '; the Host answered that one revoke with ' + JSON.stringify(F2.host.revokes.map((call) => call.results.map((result) => result.state)))
      + ', so counters.revoked moved ' + String(f2Growth.filter((step) => step !== 0).length) + ' time(s) and by ' + String(f2Growth.reduce((sum, step) => sum + step, 0))
      + ' in total, settling at ' + String(f2After.counters.revoked) + ' with lastRevokeReason=' + JSON.stringify(f2After.lastRevokeReason) + ' (a second count would settle at 2)');
  const failed = rows.filter((row) => row.ok !== true);
  console.log(`\n### probe-26 (executed) : ${rows.length - failed.length}/${rows.length} measured checks passed`);
  for (const row of failed) console.log(`    FAILED: ${row.name}`);
  console.log(`\nMEASUREMENTS ${JSON.stringify(rows.map((row) => ({ n: row.name.slice(0, 3), ok: row.ok, d: row.detail })), null, 0)}`);
  console.log(`\nprobe-26 verdict: exit ${failed.length > 0 ? 1 : 0}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
