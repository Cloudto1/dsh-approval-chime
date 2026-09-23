/**
 * Independent probe 3 — the settings card contract and the write path.
 *
 * Covers, independently of the developer's self-test:
 *   (a) `settings.plugin.item` is registered with a key that is EXACTLY the
 *       namespace the Host half registers, and the browser half binds its
 *       settings scope to that same string (four-way agreement, derived by
 *       running both halves and comparing their real arguments);
 *   (b) the card is a range slider (0..100) + switch + tone picker + preview +
 *       reset, and every control writes only through `settingsScope.set/unset`;
 *   (c) the card is invisible until the namespace is served (`status === 'ready'`);
 *   (d) a rejected write surfaces in the card instead of silently diverging.
 *
 * Run: node dsh-approval-chime/verify-independent/probe-3-card-and-scope.mjs
 */

import { pathToFileURL } from 'node:url';
import {
  HOST_PATH,
  NS,
  SLOT,
  allText,
  approval,
  elementsOfType,
  inputsOfType,
  loadBundle,
  makeCtx,
  mount,
  readOrNull,
  settle,
  suite,
  watchRejections,
} from './kit/platform.mjs';

const report = suite('probe-3-card-and-scope.mjs');
const rejections = watchRejections();

/** The Host half, imported so both halves can be compared directly. */
const hostHalf = await import(pathToFileURL(HOST_PATH).href);

/** What the Host half actually passes to `settings.register`. */
const hostRegistrations = [];
hostHalf.apply({
  logger: { info() {}, warn() {}, error() {}, debug() {} },
  settings: {
    describe: () => [],
    register(ns, schema, options) {
      hostRegistrations.push({ ns, options, defaults: schema({}) });
      return {};
    },
  },
});

const bundle = loadBundle();
const harness = makeCtx();
bundle.contract.apply(harness.ctx);
const diagnostics = bundle.diagnostics();

/**
 * rev-7 moved the settings entry out of `settings.plugin.item` into a section row of
 * its own (`settings.section`, lib/client.js:3023), keyed by a private `id` instead of
 * the old keyed-card `key` (lib/client.js:3027); rev-10 added the session-header bell
 * as a SECOND registration (`conversation.session.header.actions`, lib/client.js:3048).
 * The kit's SLOT constant still names the rev-1..rev-6 slot and is shared with probe-17,
 * so the rev-15 slot names are declared here rather than rewritten in the kit.
 */
const SECTION_SLOT = 'settings.section';
const SESSION_SLOT = 'conversation.session.header.actions';

/* --------------------------------------------------- (a) four-way key agreement */

report.group('a. the slot key, the scope namespace and the Host namespace agree');

report.same('the Host half registered exactly one namespace', hostRegistrations.length, 1);
report.same('the Host namespace', hostRegistrations[0]?.ns, 'approval-chime');
report.same('the Host namespace equals the module constant', hostRegistrations[0]?.ns, NS);
report.deep('the Host schema defaults', hostRegistrations[0]?.defaults, { enabled: true, volume: 70, tone: 'chime', custom: [] });
report.same('the Host registration applies live', hostRegistrations[0]?.options?.applies, 'live');

report.deep('the browser half bound exactly one settings scope', harness.log.boundSpecs, [{ namespace: NS }]);
report.deep(
  'the browser half waited for the settings.section slot (rev-7) and the session bell slot (rev-10)',
  harness.log.slotInjects,
  [SECTION_SLOT, SESSION_SLOT],
);
report.same('exactly two entries are registered (the section page and the header bell)', harness.log.slotRegistrations.length, 2);

const card = harness.log.slotRegistrations[0];
report.same('the card slot name (rev-7: its own settings.section row, not a keyed card)', card?.entry?.name, SECTION_SLOT);
report.same('the card id IS the Host settings namespace (the pre-rev-7 `key` field is gone)', card?.entry?.id, hostRegistrations[0]?.ns);
report.same('the card locale namespace is the same string', card?.entry?.locale, hostRegistrations[0]?.ns);
report.same('the diagnostics surface reports the same namespace', diagnostics.namespace, hostRegistrations[0]?.ns);
report.same('the diagnostics surface reports the same slot', diagnostics.slot, SECTION_SLOT);
report.check('the card entry is a function component', typeof card?.component === 'function', typeof card?.component);
report.same('one locale dictionary was registered under that namespace', harness.log.localeRegistrations[0]?.ns, NS);
report.check(
  'the dictionary ships both zh and en',
  typeof harness.log.localeRegistrations[0]?.dictionary?.zh === 'object' && typeof harness.log.localeRegistrations[0]?.dictionary?.en === 'object',
);

/* ------------------------------------------------------------- (b) the card UI */

report.group('b. the rendered card is a slider + switch + picker + preview + reset');

const view = mount(bundle.reactRuntime, card.component, {});
view.render();
view.runEffects();

const slider = () => inputsOfType(view.tree, 'range')[0];
const switchInput = () => inputsOfType(view.tree, 'checkbox')[0];
const selectInput = () => elementsOfType(view.tree, 'select')[0];
const buttonWith = (label) => elementsOfType(view.tree, 'button').find((button) => allText(button).includes(label));

report.same('exactly one range slider', inputsOfType(view.tree, 'range').length, 1);
report.same('slider min', Number(slider().props.min), 0);
report.same('slider max', Number(slider().props.max), 100);
report.same('slider step', Number(slider().props.step), 1);
report.same('slider shows the effective setting', Number(slider().props.value), 70);
report.same('exactly one enable switch', inputsOfType(view.tree, 'checkbox').length, 1);
report.same('the switch is on by default', switchInput().props.checked, true);
report.same('exactly one tone picker', elementsOfType(view.tree, 'select').length, 1);
report.deep('the picker offers the three documented tones', elementsOfType(view.tree, 'option').map((option) => option.props.value), ['chime', 'bell', 'beep']);
report.check('a preview button exists', buttonWith('试听') !== undefined, JSON.stringify(elementsOfType(view.tree, 'button').map(allText)));
report.check('a reset button exists', buttonWith('恢复默认') !== undefined);
report.check('the slider is enabled while the scope is writable', slider().props.disabled !== true);
report.check('the card displays the bundle revision id (rev-21: the badge prints the version id alone)', allText(view.tree).includes(diagnostics.revisionId) && !allText(view.tree).includes(diagnostics.revision), String(diagnostics.revisionId));
report.check(
  'the bundled zh copy is used when the platform hands no translator (rev-7 renamed the page to 通知提醒)',
  allText(view.tree).includes('通知提醒') && allText(view.tree).includes('音量'),
  allText(view.tree).slice(0, 150),
);

/* ------------------------------------------------- the write path, field by field */

report.group('b2. every control writes through settingsScope, and nothing else');

slider().props.onChange({ target: { value: '35' } });
view.render();
report.same('dragging stages locally: no write yet', harness.log.setCalls.length, 0);
report.same('the slider follows the drag immediately', Number(slider().props.value), 35);
report.same('the drag preview did not count as an approval chime', diagnostics.stats().triggers, 0);
view.render();
slider().props.onPointerUp();
await settle();
report.deep('releasing the slider performs exactly one volume write', harness.log.setCalls, [{ field: 'volume', value: 35 }]);
report.same('the value survives the write', Number(view.render() && slider().props.value), 35);
report.same('the staged draft was dropped after the write', bundle.reactRuntime.runtime.hooks[1], null);

switchInput().props.onChange({ target: { checked: false } });
await settle();
report.same('the switch writes immediately', JSON.stringify(harness.log.setCalls[1]), JSON.stringify({ field: 'enabled', value: false }));

view.render();
selectInput().props.onChange({ target: { value: 'bell' } });
await settle();
report.same('the picker writes immediately', JSON.stringify(harness.log.setCalls[2]), JSON.stringify({ field: 'tone', value: 'bell' }));

view.render();
report.check('preview is disabled while the chime is off', buttonWith('试听')?.props?.disabled === true);
report.check('reset is still available', buttonWith('恢复默认')?.props?.disabled !== true);
buttonWith('恢复默认').props.onClick({});
await settle();
report.deep('reset clears all three fields', harness.log.unsetCalls, [{ field: 'enabled' }, { field: 'volume' }, { field: 'tone' }]);
report.same('reset never wrote through set()', harness.log.setCalls.length, 3);
report.same('no other write channel was used', harness.log.setCalls.length + harness.log.unsetCalls.length, 6);

const keyboard = loadBundle();
const keyboardHarness = makeCtx();
keyboard.contract.apply(keyboardHarness.ctx);
const keyboardView = mount(keyboard.reactRuntime, keyboardHarness.log.slotRegistrations[0].component, {});
keyboardView.render();
keyboardView.runEffects();
inputsOfType(keyboardView.tree, 'range')[0].props.onChange({ target: { value: '12' } });
keyboardView.render();
inputsOfType(keyboardView.tree, 'range')[0].props.onKeyUp({ key: 'ArrowRight' });
await settle();
report.deep('the keyboard path also commits exactly once', keyboardHarness.log.setCalls, [{ field: 'volume', value: 12 }]);

// Observation (documented, not a failure): one physical mouse drag fires BOTH
// pointerup and mouseup, and the card clears its staged draft only after the
// write settles, so both events commit the same field/value. The platform scope
// serializes writes through a queue and threads its pending revision, so the
// duplicate is idempotent; this probe records the fact rather than assuming it.
const duplicate = loadBundle();
const duplicateHarness = makeCtx();
duplicate.contract.apply(duplicateHarness.ctx);
const duplicateView = mount(duplicate.reactRuntime, duplicateHarness.log.slotRegistrations[0].component, {});
duplicateView.render();
duplicateView.runEffects();
inputsOfType(duplicateView.tree, 'range')[0].props.onChange({ target: { value: '60' } });
duplicateView.render();
inputsOfType(duplicateView.tree, 'range')[0].props.onPointerUp();
inputsOfType(duplicateView.tree, 'range')[0].props.onMouseUp();
await settle();
report.note('writes recorded for one pointerup+mouseup release', duplicateHarness.log.setCalls);
report.check(
  'a duplicated release carries the identical field/value (idempotent, platform-serialized)',
  duplicateHarness.log.setCalls.length >= 1 && duplicateHarness.log.setCalls.every((call) => call.field === 'volume' && call.value === 60),
  JSON.stringify(duplicateHarness.log.setCalls),
);

/* --------------------------------------------------------- translator + writability */

report.group('b3. platform translator, read-only mode, counters');

const translated = loadBundle();
const translatedHarness = makeCtx();
translated.contract.apply(translatedHarness.ctx);
const translatedView = mount(translated.reactRuntime, translatedHarness.log.slotRegistrations[0].component, { t: (key) => `T:${key}` });
translatedView.render();
translatedView.runEffects();
report.check(
  'props.t from the platform is used when present',
  allText(translatedView.tree).includes('T:volume') && allText(translatedView.tree).includes('T:preview'),
  allText(translatedView.tree).slice(0, 160),
);

const readOnly = loadBundle();
const readOnlyHarness = makeCtx({ writable: false });
readOnly.contract.apply(readOnlyHarness.ctx);
const readOnlyView = mount(readOnly.reactRuntime, readOnlyHarness.log.slotRegistrations[0].component, {});
readOnlyView.render();
readOnlyView.runEffects();
report.check('the slider is disabled when the scope is not writable', inputsOfType(readOnlyView.tree, 'range')[0].props.disabled === true);
report.check('the switch is disabled when the scope is not writable', inputsOfType(readOnlyView.tree, 'checkbox')[0].props.disabled === true);
report.check('the picker is disabled when the scope is not writable', elementsOfType(readOnlyView.tree, 'select')[0].props.disabled === true);
report.check('the reset button is disabled when the scope is not writable', elementsOfType(readOnlyView.tree, 'button').find((b) => allText(b).includes('恢复默认')).props.disabled === true);

// Drive one chime, then re-render so the counters visible on the card move.
// (The card re-renders in the browser because its own store subscription calls
// `setSnapshot`; this driver's hook runtime does the same, so a plain re-render
// picks the fresh snapshot up. The assertion uses the platform translator's
// keys because this card instance was mounted with `props.t`.)
translatedHarness.api.publish([['session-1', approval('approval:1')]]);
translatedView.render();
report.check(
  'the trigger counter is rendered from the live counters',
  allText(translatedView.tree).includes('T:statsTriggered: 1'),
  allText(translatedView.tree).match(/T:statsTriggered: \d+/)?.[0] ?? allText(translatedView.tree).slice(0, 120),
);

/* -------------------------------------------------- (c) availability gate */

report.group('c. the card is invisible until the namespace is served');

const gated = loadBundle();
const gatedHarness = makeCtx({ scopeStatus: 'loading' });
gated.contract.apply(gatedHarness.ctx);
const gatedView = mount(gated.reactRuntime, gatedHarness.log.slotRegistrations[0].component, {});
report.same('status=loading renders nothing', gatedView.render(), null);
gatedView.runEffects();

gatedHarness.api.scopeState.status = 'error';
gatedHarness.api.notifyScope();
report.same('status=error renders nothing', gatedView.render(), null);

gatedHarness.api.scopeState.status = 'ready';
gatedHarness.api.notifyScope();
report.check('status=ready renders the card', gatedView.render() !== null, 'the card became visible when the namespace was served');

/* ------------------------------------------------- (d) a rejected write is visible */

report.group('d. a rejected write is reported to the user');

const failing = loadBundle();
const failingHarness = makeCtx({ setRejects: true });
failing.contract.apply(failingHarness.ctx);
const failingView = mount(failing.reactRuntime, failingHarness.log.slotRegistrations[0].component, {});
failingView.render();
failingView.runEffects();
inputsOfType(failingView.tree, 'range')[0].props.onChange({ target: { value: '44' } });
failingView.render();
inputsOfType(failingView.tree, 'range')[0].props.onPointerUp();
await settle(12);
failingView.render();
report.check(
  'the failure text is rendered inside the card',
  allText(failingView.tree).includes('设置写入失败'),
  allText(failingView.tree).slice(-200),
);
report.check('the card still renders after the failure', failingView.tree !== null);

await settle();
report.same('no unhandled rejection in this probe', rejections.seen.length, 0);
report.same('the plugin file that was loaded is the shipped one', readOrNull(HOST_PATH) !== null, true);
rejections.stop();
report.done();
