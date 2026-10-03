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
 *      cooldown timer with no click needed; the 4th click inside the rolling window is refused and
 *      posts NOTHING (and the button is painted DISABLED while the window is full, so the limit is
 *      visible instead of a button that keeps accepting refused clicks); after the window rolls, a
 *      slot frees again and the button comes back.
 *   B. the bypass attempts — switch OFF/ON, effect teardown + re-apply, and a fresh bundle.
 *      OFF/ON is DELIBERATELY NOT a bypass any more: the rolling quota belongs to the PAGE, so the
 *      toggle may not refill it (user ruling 2026-10-03; the verify11 round measured 51 notifications
 *      in 30 s with the old behaviour, where this design allows 3). Only the 5 s cooldown is
 *      per-switch state, and only the effect teardown + re-apply refills the quota.
 *      r30 fix-10 · the OFF/ON below is driven through the REAL rendered role="switch" checkbox
 *      of the pinned nativeToast row (its own onChange), not by writing the settings scope: the
 *      verify12 round proved a scope write never runs the component handler body, so a quota
 *      refill hidden there (its mutant c) was invisible to this probe. The scope-write route is
 *      kept as B1c, because the settings can also change from outside this page. Falsifiability:
 *      run this probe against a copy of lib/client.js with native.testWindow = []; added to that
 *      onChange — B1 goes red (tree + output recorded under .scratch/audit-r30/fix10/).
 *   It also pins that exactly ONE cooldown timer is live after the third raise (the previous one was
 *   cleared) and that teardown leaves ZERO — the timer-leak failure that no text pin can see.
 *
 * It resolves the plugin directory from its own location, so it runs from any cwd, and it reads
 * NOTHING under the workspace audit/scratch tree. Exit 0 = every measured check green; non-zero = red.
 *
 * Run:  node verify-independent/probe-26-flood-exec.mjs
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInContext } from 'node:vm';
import { createClientSandbox, createClientCtx, createRenderer, collect, flattenText, settle } from '../verify/_harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = resolve(HERE, '..');
const ROUTE = '/api/approval-chime/native-toast';
const SESSIONS = '/api/approval-chime/sessions';

const rows = [];
const say = (name, ok, detail) => {
  rows.push({ name, ok: ok === true, detail: String(detail) });
  console.log(`${ok === true ? '[PASS]' : '[FAIL]'} ${name} — ${detail}`);
};

function build() {
  const calls = [];
  const fetchStub = (url, options) => {
    const target = String(url);
    const init = options === undefined || options === null ? {} : options;
    const method = typeof init.method === 'string' ? init.method : 'GET';
    const body = typeof init.body === 'string' ? init.body : null;
    calls.push({ target, method, body });
    if (target.indexOf(SESSIONS) === 0 || target.indexOf(SESSIONS) >= 0) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, revision: 1, sessions: {} }) });
    }
    if (method === 'POST') {
      const token = body === null ? '' : JSON.parse(body).token;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, state: 'raised', token }) });
    }
    // every poll
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, state: 'pending' }) });
  };
  const sandbox = createClientSandbox({ fetch: fetchStub });
  const context = sandbox.context;
  // ---- fake clock + fake timers + a deterministic crypto, installed BEFORE apply() ----
  context.__CLOCK__ = { now: 1000000, timers: [], nextId: 1 };
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
globalThis.setTimeout = function (fn, ms) { var id = __CLOCK__.nextId; __CLOCK__.nextId += 1; var list = __CLOCK__.timers.slice(); list.push({ id: id, fn: fn, due: __CLOCK__.now + (Number(ms) || 0), every: false }); __CLOCK__.timers = list; return id; };
globalThis.clearTimeout = function (id) { __CLOCK__.timers = __CLOCK__.timers.filter(function (t) { return t.id !== id; }); };
globalThis.setInterval = function (fn, ms) { var id = __CLOCK__.nextId; __CLOCK__.nextId += 1; var list = __CLOCK__.timers.slice(); list.push({ id: id, fn: fn, due: __CLOCK__.now + (Number(ms) || 0), every: true }); __CLOCK__.timers = list; return id; };
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
  view.render();
  view.runEffects();
  const clock = context.__CLOCK__;
  const advance = (ms) => {
    clock.now += ms;
    const due = clock.timers.filter((timer) => timer.due <= clock.now && timer.every !== true);
    clock.timers = clock.timers.filter((timer) => timer.every === true || timer.due > clock.now);
    for (const timer of due) timer.fn();
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
      allTimers: clock.timers.length,
    };
  };
  return { calls, context, harness, sandbox, view, clock, advance, button, hint, posts, state, contract, switchBox, flipSwitch };
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

  // A4 · 1 s and 4.999 s later
  t.advance(1000);
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  const hint1s = t.hint();
  say('A4a after 1 s the click is still refused and the message names the seconds left', t.posts() === 1 && /4/.test(hint1s), `posts=${t.posts()} hint="${hint1s}"`);
  t.advance(3999);
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  say('A4b after 4.999 s still refused', t.posts() === 1, `posts=${t.posts()} hint="${t.hint()}"`);

  // A5 · the timer lifts it at 5 s
  t.advance(1);
  t.view.render();
  const after5 = t.state();
  say('A5 the cooldown timer lifts the flag at 5 s (button enabled, no click needed)', after5.disabled === false, `disabled=${String(after5.disabled)} timers=${after5.timers}`);
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  say('A5b the next click at +5.000 s is accepted (second request)', t.posts() === 2, `posts=${t.posts()} hint="${t.hint()}"`);

  // A6 · the rolling-window ceiling: 3 per 60 s
  t.advance(5000);
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  say('A6 request #3 at +10 s is accepted (three in the rolling minute)', t.posts() === 3, `posts=${t.posts()} hint="${t.hint()}"`);
  say('A6b after three accepted raises exactly one cooldown timer is alive (the old one was cleared)',
    t.state().timers === 1, `live cooldown timers=${t.state().timers} (all timers=${t.state().allTimers})`);
  t.advance(5001); // +15.001 s: the 5 s cooldown armed at +10 s has just lifted, so the WINDOW is the only gate left
  const before4 = t.posts();
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  const refused = t.state();
  say('A7 request #4 at +15 s is refused by the window gate and posts NOTHING', t.posts() === before4 && refused.hint.indexOf('太频繁') >= 0,
    `posts=${t.posts()} (was ${before4}) hint="${refused.hint}" disabled=${String(refused.disabled)}`);
  say('A7b the window refusal paints the button DISABLED as well (user ruling 2026-10-03: the limit must be visible, not a button that keeps accepting refused clicks)',
    refused.disabled === true, `disabled=${String(refused.disabled)} — the button greys out until the window frees a slot`);

  // A7c · the verify11 L2 gap. The M4-sweep-resets-the-window mutant empties `native.testWindow`
  // inside `nativeSweep`, and BOTH probes stayed green because nothing here ever drove a second
  // snapshot sync. The page syncs on every pending-interaction republish, so this is a route the
  // product really takes — and an empty selection (pushPending([])) is enough to reach the sweep.
  const beforeSync = t.posts();
  t.harness.pushPending([]);
  await settle(6);
  t.view.render();
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  const afterSync = t.state();
  say('A7c a snapshot sync while the window is full does not free a slot',
    t.posts() === beforeSync && afterSync.hint.indexOf('太频繁') >= 0 && afterSync.disabled === true,
    `posts ${beforeSync} -> ${t.posts()} after pushPending([]); hint="${afterSync.hint}" disabled=${String(afterSync.disabled)}`);

  // A8 · the ceiling expires: 60 s after the FIRST of the three, the window frees one slot
  t.advance(45000); // +60 s from click #1
  t.advance(5000);  // the cooldown from the refused click is irrelevant; move past 5 s anyway
  t.view.render();
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  say('A8 after the rolling minute the ceiling frees a slot again', t.posts() === 4, `posts=${t.posts()} hint="${t.hint()}"`);

  // ---------- B. bypass attempts, measured ----------
  // Both B1 and B3 START by filling the window on purpose. A "full window" inherited from the A
  // phase would be a trap: by A8 every stamp of the A phase is ~65 s old, so the window is EMPTY and a raise
  // after the toggle would prove nothing either way (that is how the pre-r30 B1 could pass).
  //
  // B1/B1c · OFF then ON must NOT refill the quota, whichever route writes the switch: the real
  // rendered control (publish() -> nativeTeardown()) or a scope write from outside this page.
  t.advance(30000); // past every stamp of the A phase, so the next three clicks start a fresh window
  const builtUpAt = t.clock.now; // the stamp the fill loop's first raise records
  for (let index = 0; index < 3; index += 1) {
    t.button().props.onClick();
    await settle(6);
    t.view.render();
    if (index < 2) t.advance(5000); // exactly the cooldown: three raises inside one 30 s window
  }
  const filled = t.posts();
  const filledState = t.state();
  t.advance(15000); // the cooldown from the third fill lifts at +5 s; the window stays FULL until +30 s. THIS is the
  // one stretch where a window-gate check can be honest: until +30 s the only thing that can refuse is the window.
  t.view.render();
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  say('B0 the built-up window really is the gate: the click is refused while the cooldown has lifted',
    t.posts() === filled && t.hint().indexOf('太频繁') >= 0,
    `posts ${filled} -> ${t.posts()} with filled-state disabled=${String(filledState.disabled)} and hint="${t.hint()}" — no cooldown timer is live any more, so only the window can refuse this`);
  const postsBeforeToggle = t.posts();
  // B1 · the REAL gesture: the rendered role="switch" checkbox of the pinned nativeToast row,
  // driven through its own onChange. A refill written into that handler runs HERE and nowhere else.
  const offFlipped = await t.flipSwitch(false);
  const offState = t.state();
  const onFlipped = await t.flipSwitch(true);
  const onState = t.state();
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  const afterToggle = t.posts();
  say('B1 switch OFF then ON through the REAL role="switch" control KEEPS the rolling quota: zero new POSTs and the button stays DISABLED',
    offFlipped === true && onFlipped === true && afterToggle === postsBeforeToggle && onState.disabled === true && onState.hint.indexOf('太频繁') >= 0,
    `posts ${postsBeforeToggle} -> ${afterToggle} (zero new requests required); while off: disabled=${String(offState.disabled)}; back on: disabled=${String(onState.disabled)} hint="${onState.hint}" — the real control's own onChange ran, so a refill hidden in that handler would post here`);
  // B1c · the SAME OFF/ON written straight to the settings scope — the route the pre-fix-10 B1 used,
  // kept because the settings can also change from outside this page (another window writes the same
  // field). It is also the control of the comparison above: the refusal is not an artefact of the
  // gesture. Both routes must leave the quota alone — it is PAGE state.
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
  say('B1c the same OFF/ON written directly to the settings scope is refused too (zero new POSTs, the button still disabled)',
    t.posts() === postsBeforeScope && scopeState.disabled === true,
    `posts ${postsBeforeScope} -> ${t.posts()} (zero new requests required); back on: disabled=${String(scopeState.disabled)} hint="${t.hint()}"`);
  t.advance(20000); // the fill loop stamped the window at +0/+5/+10 s and 15 s + 20 s have passed
  // since then, so every stamp is past the 30 s window and exactly one slot is free. (The window is
  // pruned by the NEXT click, not by the clock — this check measures the GATE: a raise really goes
  // out, rather than the painted flag. The age below is measured from this probe's own clock.)
  t.view.render();
  const postsBeforeFree = t.posts();
  const oldestStampAge = t.clock.now - builtUpAt;
  t.button().props.onClick();
  await settle(6);
  t.view.render();
  const freedHint = t.hint();
  say('B1b the slot really does free on the clock: once the oldest stamp has aged past the 30 s window the raise goes through',
    t.posts() === postsBeforeFree + 1 && freedHint.indexOf('已发送') >= 0,
    `posts ${postsBeforeFree} -> ${t.posts()} hint="${freedHint}" (the oldest stamp of the built-up window is ${oldestStampAge} ms old on the probe clock, so the window has room again)`);
  t.view.render();

  // B2 · teardown (the plugin effect disposer) with a live cooldown, then re-apply. The cooldown is
  // the per-switch half, so this is the half teardown is still allowed to drop.
  t.advance(5000); // the cooldown armed by B1c has lifted (the window keeps the two stamps it had)
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
  say('B3 after teardown + re-apply the button raises again immediately (the effect disposer is the ONE thing that refills the quota)',
    t.posts() === postsBeforeReapply + 1,
    `posts ${postsBeforeReapply} -> ${t.posts()}`);

  // B4 · a fresh bundle (what a page reload gives) starts with an empty window
  const second = build();
  say('B4 a fresh bundle starts with an empty window and an enabled button',
    second.button().props.disabled === false && second.posts() === 0,
    `disabled=${String(second.button().props.disabled)} posts=${second.posts()}`);

  const failed = rows.filter((row) => row.ok !== true);
  console.log(`\n### probe-26 (executed) : ${rows.length - failed.length}/${rows.length} measured checks passed`);
  for (const row of failed) console.log(`    FAILED: ${row.name}`);
  console.log(`\nMEASUREMENTS ${JSON.stringify(rows.map((row) => ({ n: row.name.slice(0, 3), ok: row.ok, d: row.detail })), null, 0)}`);
  console.log(`\nprobe-26 verdict: exit ${failed.length > 0 ? 1 : 0}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
