/**
 * Headless self-test 2/3 and 3/3 — the browser half.
 *
 * `lib/client.js` is executed the way the Host executes it: as a CLASSIC script
 * inside a fresh `node:vm` context whose `window` is the global object, with a
 * stubbed `__ModuleLoader__`, a stubbed React, a stubbed `document`, and a
 * recording WebAudio implementation. The real plugin code runs; only the platform
 * around it is fake.
 *
 * It proves:
 *   - the bundle registers itself under the package name and its factory returns
 *     `{ name, inject, apply }` with `react` as its only require;
 *   - `apply()` binds the `approval-chime` settings scope, registers ONE
 *     `settings.section` entry — private id, `order: 16`, a label thunk that follows
 *     the active locale, and `locale: NS` — registers the locale dictionary,
 *     subscribes to `uiSession.pendingInteractions`, and registers NOTHING on the
 *     approval waterfall. The Plugins-tab card slot is never touched: not registered,
 *     not waited for, not even named (rev-7 moved the settings page out of it);
 *   - the registered component IS the section page: one `<h2>` heading carrying the
 *     same text as the navigation label, one intro line, and the controls inside;
 *   - the page is a real range slider (0..100) + switch + tone select + import button
 *     with its hidden file input + preview + reset + visible counters, and every
 *     control writes through the platform's `settingsScope.set/unset` (never through
 *     browser storage);
 *   - a new approval rings once with a master gain of exactly `volume × MASTER_GAIN`,
 *     the same approval can never ring twice, a replacement rings again, and
 *     `volume = 0` / `enabled = false` create no audio node at all;
 *   - the AudioContext unlocks on the first user gesture and every failure mode
 *     (no WebAudio, suspended context, unresolvable plugin service) degrades
 *     without an uncaught exception or an unhandled rejection.
 *
 * Run: node dsh-approval-chime/verify/client-half.test.mjs
 */

import {
  CLIENT_PATH,
  approvalInteraction,
  collect,
  createClientCtx,
  createClientSandbox,
  createRenderer,
  createReporter,
  elementsOfType,
  flattenText,
  readText,
  settle,
  trackUnhandledRejections,
} from './_harness.mjs';

const report = createReporter('client-half.test.mjs');
const source = readText(CLIENT_PATH);
const rejections = trackUnhandledRejections();

/** Boot one fresh copy of the bundle against a fresh platform. */
function instantiate(sandboxOptions = {}) {
  const sandbox = createClientSandbox(sandboxOptions);
  const registration = sandbox.loader.registrations[0] ?? null;
  const contract = registration === null || sandbox.error !== null ? null : registration.factory(sandbox.requireFn);
  const harness = createClientCtx();
  if (contract !== null) contract.apply(harness.ctx);
  return {
    sandbox,
    registration,
    contract,
    harness,
    diagnostics: sandbox.context.window.__DSH_APPROVAL_CHIME__,
    record: sandbox.audio.record,
  };
}

/* ------------------------------------------------------------- 1. bundle shape */

report.section('bundle shape (classic script, module id, factory contract)');
const bundle = instantiate();
report.check('the file loads as a classic script without a syntax error', bundle.sandbox.error === null, String(bundle.sandbox.error ?? ''));
report.equal('exactly one module registration', bundle.sandbox.loader.registrations.length, 1);
report.equal('module id is the package name', bundle.registration?.id, 'dsh-approval-chime');
report.check('registration carries a factory function', typeof bundle.registration?.factory === 'function');
report.deepEqual('the bundle requires only react', bundle.sandbox.requires, ['react']);
report.deepEqual('no top-level import/export statements', /(^|\n)\s*(import|export)\b/.exec(source) === null, true);
report.equal('factory returns the plugin name', bundle.contract?.name, 'dsh-approval-chime');
report.check('factory returns apply()', typeof bundle.contract?.apply === 'function');
report.check('factory returns inject[]', Array.isArray(bundle.contract?.inject));
report.deepEqual('inject covers every service the bundle uses', [...bundle.contract.inject].sort(), ['locale', 'settingsScope', 'slots', 'uiSession']);
report.check('inject does NOT include remote (no waterfall involvement)', !bundle.contract.inject.includes('remote'));
report.check(
  'diagnostics surface is installed for headless/manual verification',
  bundle.diagnostics !== undefined && bundle.diagnostics.masterGain > 0 && bundle.diagnostics.tones.length >= 2,
  `${String(bundle.diagnostics?.revision)} · tones=${JSON.stringify(bundle.diagnostics?.tones)}`,
);
report.ok('no browser storage API is touched', !source.includes('localStorage') && !source.includes('sessionStorage'));

/* ----------------------------------------------------------- 2. apply() wiring */

report.section('apply() wiring');
const wiring = bundle.harness.state;
report.deepEqual('settings scope is bound to the Host namespace', wiring.boundSpecs, [{ namespace: 'approval-chime' }]);
report.equal('exactly one settings entry is registered', wiring.slotRegistrations.length, 1);
const sectionEntry = wiring.slotRegistrations[0];
report.equal('it registers into settings.section', sectionEntry?.options?.name, 'settings.section');
report.deepEqual('the slot was waited for before registering', wiring.injectedSlots, ['settings.section']);
report.equal('the section id is the plugin\'s own', sectionEntry?.options?.id, 'approval-chime');
report.ok(
  'the id cannot shadow a shipped section (general/models/plugins/agent-presets)',
  !['general', 'models', 'plugins', 'agent-presets'].includes(sectionEntry?.options?.id),
  String(sectionEntry?.options?.id),
);
report.equal('order 16 places the row right after Plugins (15) and before Agent presets (20)', sectionEntry?.options?.order, 16);
report.check('the label is a thunk, not a string frozen at apply time', typeof sectionEntry?.options?.label === 'function');
report.equal('the label speaks the active locale (zh)', sectionEntry?.options?.label?.(), '通知提醒');
report.equal('the section locale namespace is the settings namespace', sectionEntry?.options?.locale, 'approval-chime');
report.check('the section component is a function component', typeof sectionEntry?.component === 'function');
report.ok(
  'NOTHING is registered into the plugins-tab card slot',
  !wiring.slotRegistrations.some((entry) => String(entry.options?.name).includes('settings.plugin.item')),
);
report.ok('the plugins-tab card slot was never waited for', wiring.injectedSlots.every((slot) => slot !== 'settings.plugin.item'));
report.ok('the bundle never even names the plugins-tab card slot', !source.includes('settings.plugin.item'));
report.ok('the diagnostics surface reports the slot it registers into', bundle.diagnostics.slot === 'settings.section', String(bundle.diagnostics.slot));
report.equal('locale dictionary registered once', wiring.localeRegistrations.length, 1);
report.equal('dictionary namespace', wiring.localeRegistrations[0]?.ns, 'approval-chime');
report.check('dictionary carries zh and en', typeof wiring.localeRegistrations[0]?.dictionary?.zh === 'object' && typeof wiring.localeRegistrations[0]?.dictionary?.en === 'object');
const dictionary = wiring.localeRegistrations[0]?.dictionary;
report.equal('the dictionary carries the nav copy', dictionary?.zh?.nav, '通知提醒');
report.equal('the en nav copy says Notifications', dictionary?.en?.nav, 'Notifications');
report.equal('nav and title are the same text by construction', dictionary?.zh?.nav === dictionary?.zh?.title, true);
report.check('the intro is one line of copy', typeof dictionary?.zh?.intro === 'string' && dictionary.zh.intro.length > 0, String(dictionary?.zh?.intro));
report.equal('exactly one pendingInteractions subscription', wiring.pendingListeners.size, 1);
report.check('ctx.effect labels are present', wiring.effects.length >= 3 && wiring.effects.every((effect) => typeof effect.label === 'string' && effect.label.startsWith('dsh-approval-chime:')), wiring.effects.map((effect) => effect.label).join(' | '));
report.equal('NOTHING is registered on the approval waterfall', wiring.remoteSubscriptions.length, 0);
report.ok('the bundle never names the approval event', !source.includes('approval/request'));
report.ok('the bundle never uses the remote-event subscription API', !source.includes('$on'));
report.ok('the bundle never calls a bare .on(event, …)', !/\.\s*(on|once)\s*\(/.test(source));

/* ------------------------------------------ 2b. the row is the shell's own copy */

report.section('settings.section row: localized label thunk');
report.equal('the row label resolves through the dictionary', sectionEntry.options.label(), '通知提醒');
bundle.harness.setLocale('en');
report.equal('a locale switch is picked up on the next projection (no re-registration)', sectionEntry.options.label(), 'Notifications');
bundle.harness.setLocale('zh');
report.equal('switching back restores the zh label', sectionEntry.options.label(), '通知提醒');
report.equal('the switch never re-registered the row', wiring.slotRegistrations.length, 1);

/* ------------------------------------------------------- 3. the section page UI */

report.section('settings section render');
const section = sectionEntry.component;
const view = createRenderer(bundle.sandbox.react, section, {});
view.render();
view.runEffects();
report.check('the section renders when the namespace is ready', view.tree !== null && view.tree !== undefined, String(view.tree));

const headings = elementsOfType(view.tree, 'h2');
const containers = elementsOfType(view.tree, 'section');
const intros = elementsOfType(view.tree, 'p');
report.equal('exactly one <section> container', containers.length, 1);
report.equal('exactly one page-level heading (h2) on the page', headings.length, 1);
report.equal('the heading is the section title', flattenText(headings[0]), '通知提醒');
report.equal('the heading text equals the navigation row text', flattenText(headings[0]), sectionEntry.options.label());
report.equal('exactly one intro line', intros.length, 1);
report.check('the intro carries the section copy', flattenText(intros[0]).includes('宿主向你申请权限时响一次'), flattenText(intros[0]));
report.ok('the old competing card title is gone from the page', !flattenText(view.tree).includes('审批提示音'));

const ranges = collect(view.tree, (node) => node.type === 'input' && node.props.type === 'range');
const checkboxes = collect(view.tree, (node) => node.type === 'input' && node.props.type === 'checkbox');
const selects = elementsOfType(view.tree, 'select');
const options = elementsOfType(view.tree, 'option');
const buttons = elementsOfType(view.tree, 'button');
const revBadges = collect(view.tree, (node) => node.props !== undefined && node.props.className === 'dacRev');
report.equal('exactly one range slider (the volume progress bar)', ranges.length, 1);
report.equal('slider min is 0', Number(ranges[0]?.props?.min), 0);
report.equal('slider max is 100', Number(ranges[0]?.props?.max), 100);
report.equal('slider shows the effective volume', Number(ranges[0]?.props?.value), 70);
report.equal('exactly one enable switch', checkboxes.length, 1);
report.equal('switch reflects the effective value', checkboxes[0]?.props?.checked, true);
/* rev-8: the enable control is painted as the Apple switch. The native input
   keeps the semantics; the styled span mirrors the value for CSS, which cannot
   read React's `checked` prop. */
const switchTracks = collect(view.tree, (node) => node.props !== undefined && node.props.className === 'dacSwitch');
const switchKnobs = collect(view.tree, (node) => node.props !== undefined && node.props.className === 'dacKnob');
report.equal('the enable input reports itself as a switch', checkboxes[0]?.props?.role, 'switch');
report.equal('the switch states its checked value to assistive tech', checkboxes[0]?.props?.['aria-checked'], true);
report.equal('exactly one painted switch track', switchTracks.length, 1);
report.equal('the painted track shows the on state', switchTracks[0]?.props?.['data-on'], 'true');
report.equal('the painted track is hidden from assistive tech (the input carries the state)', switchTracks[0]?.props?.['aria-hidden'], 'true');
report.equal('the painted track is not marked disabled while the namespace is writable', switchTracks[0]?.props?.['data-disabled'], 'false');
report.equal('the painted track carries exactly one knob', switchKnobs.length, 1);
report.equal('exactly one tone select', selects.length, 1);
report.deepEqual('three tones are offered', options.map((option) => option.props.value), ['chime', 'bell', 'beep']);
report.check('a preview button exists', buttons.some((button) => flattenText(button).includes('试听')));
report.check('a reset-to-defaults button exists', buttons.some((button) => flattenText(button).includes('恢复默认')));
report.check('an import button exists', buttons.some((button) => flattenText(button).includes('导入音频')));
const fileInputs = collect(view.tree, (node) => node.type === 'input' && node.props.type === 'file');
report.equal('the hidden file input is still rendered next to the picker', fileInputs.length, 1);
report.equal('the remove control is absent while no imported tone is selected', buttons.some((button) => flattenText(button).includes('移除')), false);
report.equal('exactly one bundle-revision badge', revBadges.length, 1);
report.equal('the badge names the build the page loaded', flattenText(revBadges[0]), bundle.diagnostics.revision);
report.equal('the revision stamp is rev-9', String(bundle.diagnostics.revision).startsWith('rev-9'), true);
const statsText = flattenText(view.tree);
report.check('the section shows the trigger counter', statsText.includes('已触发'), statsText.slice(0, 120));
report.check('the section shows the last-trigger indicator', statsText.includes('上次触发') && statsText.includes('尚未触发'));
report.check('the section shows the bundle revision stamp', statsText.includes(bundle.diagnostics.revision));

const styleText = String(bundle.sandbox.document.created.find((element) => element.id === 'dsh-approval-chime/styles')?.textContent ?? '');
report.ok(
  'the section container follows the Host section rule (column, 12px gap, 720px cap)',
  styleText.includes('.dacSection{max-width:720px;color:var(--dsw-alias-label-primary,#1a1a1a);flex-direction:column;gap:12px;display:flex;}'),
  styleText.slice(0, 140),
);
report.ok(
  'the section title follows the Host title rule (16px/500/24)',
  styleText.includes('.dacTitle{color:var(--dsw-alias-label-primary,#1a1a1a);margin:0;font-size:16px;font-weight:500;line-height:24px;}'),
);
report.ok(
  'the intro follows the Host intro rule (14px/22 + label-tertiary token)',
  styleText.includes('.dacIntro{color:var(--dsw-alias-label-tertiary,#71717a);margin:0;font-size:14px;line-height:22px;}'),
);
report.ok('the picker still pins its own box model (rev-5 R5-1)', styleText.includes('box-sizing:content-box;max-height:84px'), 'box-sizing:content-box;max-height:84px');
report.ok('the picker keeps its 10px rounded corners (rev-3)', styleText.includes('border-radius:10px'));
report.ok(
  'the enable control is the Apple switch (38x22 track, 16px knob, 2px inset, 16px travel)',
  styleText.includes('.dacSwitch{box-sizing:border-box;position:relative;flex:none;width:38px;height:22px;')
    && styleText.includes('.dacKnob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;')
    && styleText.includes('.dacSwitch[data-on="true"] .dacKnob{transform:translateX(16px);}'),
  styleText.length + ' chars of CSS',
);
report.ok(
  'the switch is on in the SAME token as the volume slider (one color, not two)',
  styleText.includes('.dacSwitch[data-on="true"]{background:var(--dsw-alias-state-business-primary,#2563eb);')
    && styleText.includes('input[type=range]{flex:1;min-width:160px;accent-color:var(--dsw-alias-state-business-primary,#2563eb);}'),
);
report.ok(
  'the native input is clipped rather than display:none, so it stays focusable',
  styleText.includes('.dacToggle input{position:absolute;width:1px;height:1px;margin:-1px;padding:0;')
    && styleText.includes('clip:rect(0 0 0 0)'),
);
report.ok(
  'the switch honours prefers-reduced-motion',
  styleText.includes('@media (prefers-reduced-motion:reduce){.dacSwitch,.dacKnob{transition:none;}}'),
);

/* -------------------------------------------------- 4. card writes the platform */

report.section('card writes go through the settings scope only');
const slider = () => collect(view.tree, (node) => node.type === 'input' && node.props.type === 'range')[0];
slider().props.onChange({ target: { value: '35' } });
view.render();
report.equal('dragging stages locally first (no write yet)', wiring.setCalls.length, 0);
report.equal('the slider follows the drag immediately', Number(slider().props.value), 35);
slider().props.onPointerUp();
await settle();
report.deepEqual('releasing the slider performs one fenced write', wiring.setCalls, [{ field: 'volume', value: 35 }]);
report.check('the volume survives the write (persisted by the Host document)', view.render() !== null && Number(slider().props.value) === 35);
report.equal('an in-flight draft is dropped after the write settles', view.hooks[1], null);

const rerender = () => view.render();
rerender();
collect(view.tree, (node) => node.type === 'input' && node.props.type === 'checkbox')[0].props.onChange({ target: { checked: false } });
await settle();
report.deepEqual('the switch writes immediately', wiring.setCalls[1], { field: 'enabled', value: false });
rerender();
report.equal(
  'the painted track follows the switch off (rev-8)',
  collect(view.tree, (node) => node.props !== undefined && node.props.className === 'dacSwitch')[0]?.props?.['data-on'],
  'false',
);
const gainsBeforeMutedControls = bundle.record.gains.length;
slider().props.onChange({ target: { value: '55' } });
report.equal('dragging the slider while the chime is off makes no sound', bundle.record.gains.length, gainsBeforeMutedControls);
collect(view.tree, (node) => node.type === 'select')[0].props.onChange({ target: { value: 'bell' } });
report.equal('picking a tone while the chime is off makes no sound', bundle.record.gains.length, gainsBeforeMutedControls);
await settle();
report.deepEqual('the tone select writes immediately', wiring.setCalls[2], { field: 'tone', value: 'bell' });
const previewButton = elementsOfType(view.tree, 'button').find((button) => flattenText(button).includes('试听'));
report.equal('preview is disabled while the chime is switched off', previewButton?.props?.disabled, true);
rerender();
elementsOfType(view.tree, 'button').find((button) => flattenText(button).includes('恢复默认')).props.onClick({});
await settle();
report.deepEqual('reset clears all three fields (re-inheriting the Host defaults)', wiring.unsetCalls, [{ field: 'enabled' }, { field: 'volume' }, { field: 'tone' }]);

const loading = instantiate();
loading.harness.state.scopeSnapshot = { ...loading.harness.state.scopeSnapshot, status: 'loading', value: undefined };
loading.harness.notifyScope();
const loadingView = createRenderer(loading.sandbox.react, loading.harness.state.slotRegistrations[0].component, {});
loadingView.render();
report.equal('the section renders nothing before the first describe answer', loadingView.tree, null);

/* ---------------------------- 3b. conditional rows that must survive the move */

report.section('conditional rows: read-only badge and the write error line');
const readOnly = instantiate();
readOnly.harness.state.scopeSnapshot = { ...readOnly.harness.state.scopeSnapshot, writable: false };
readOnly.harness.notifyScope();
const readOnlyView = createRenderer(readOnly.sandbox.react, readOnly.harness.state.slotRegistrations[0].component, {});
readOnlyView.render();
report.check('a read-only namespace still shows its badge', flattenText(readOnlyView.tree).includes('设置当前不可写'), flattenText(readOnlyView.tree).slice(0, 160));
report.equal(
  'and its controls are disabled',
  collect(readOnlyView.tree, (node) => node.type === 'input' && node.props.type === 'range')[0]?.props?.disabled,
  true,
);

const failing = instantiate();
failing.harness.scope.set = () => Promise.reject(new Error('write refused'));
const failingView = createRenderer(failing.sandbox.react, failing.harness.state.slotRegistrations[0].component, {});
failingView.render();
collect(failingView.tree, (node) => node.type === 'input' && node.props.type === 'checkbox')[0].props.onChange({ target: { checked: false } });
await settle();
failingView.render();
report.check('a refused write still surfaces the error line', flattenText(failingView.tree).includes('设置写入失败'), flattenText(failingView.tree).slice(0, 200));

/* --------------------------------------------------------- 5. chime semantics */

report.section('chime: gain graph, dedup, and the silent gates');
const chime = instantiate();
const record = chime.record;
const masterGains = () => record.gains.filter((gain) => record.connections.some((link) => link.from === gain && link.to.kind === 'destination'));

chime.harness.pushPending([['session-1', approvalInteraction('approval:1')]]);
report.equal('one approval rings once', chime.diagnostics.stats().triggers, 1);
report.equal('exactly one master gain is wired to the destination', masterGains().length, 1);
report.close(
  'the master gain equals volume × MASTER_GAIN',
  masterGains()[0].gain.value,
  (70 / 100) * chime.diagnostics.masterGain,
);
report.equal('the master gain does not ramp (the peak stays the settings value)', record.rampCalls.every((call) => call.value <= 1), true);
report.check('oscillators were started', record.started.length >= 1, `${record.started.length} started`);
report.check('every oscillator is enveloped, not raw', record.gains.length > masterGains().length, `${record.gains.length} gain nodes`);
report.ok('the diagnostics surface agrees with the graph', chime.diagnostics.stats().lastGain === masterGains()[0].gain.value);

const gainsAfterFirst = record.gains.length;
chime.harness.pushPending([['session-1', approvalInteraction('approval:1')]]);
report.equal('re-publishing the same approval does not re-chime', record.gains.length, gainsAfterFirst);
report.equal('the trigger counter stays at one', chime.diagnostics.stats().triggers, 1);
report.equal('the same approval is only ever counted once', chime.diagnostics.stats().approvalsSeen, 1);
chime.harness.pushPending([['session-1', approvalInteraction('approval:1'), 'session-2', approvalInteraction('approval:1')].slice(0, 2)]);
report.equal('an unrelated snapshot refresh stays silent', chime.diagnostics.stats().triggers, 1);

chime.harness.pushPending([['session-1', approvalInteraction('approval:2', { toolName: 'Write' })]]);
report.equal('a replacement request (new key) rings again', chime.diagnostics.stats().triggers, 2);
report.equal('two master gains after two approvals', masterGains().length, 2);
chime.harness.pushPending([['session-1', { sessionId: 'session-1', kind: 'question', key: 'question:1' }]]);
report.equal('a non-approval pending interaction never rings', chime.diagnostics.stats().triggers, 2);

await chime.harness.scope.set('volume', 0);
await settle();
const gainsBeforeSilent = record.gains.length;
chime.harness.pushPending([['session-1', approvalInteraction('approval:3')]]);
report.equal('volume = 0 creates no audio node', record.gains.length, gainsBeforeSilent);
report.equal('volume = 0 is counted as a silent trigger', chime.diagnostics.stats().suppressedSilent, 1);

await chime.harness.scope.set('volume', 70);
await chime.harness.scope.set('enabled', false);
await settle();
const gainsBeforeDisabled = record.gains.length;
chime.harness.pushPending([['session-1', approvalInteraction('approval:4')]]);
report.equal('enabled = false creates no audio node', record.gains.length, gainsBeforeDisabled);
report.equal('enabled = false is counted as a disabled trigger', chime.diagnostics.stats().suppressedDisabled, 1);
report.equal('no chime was rendered for the muted approvals', chime.diagnostics.stats().triggers, 2);
const gainsBeforeMutedPreview = record.gains.length;
report.equal('the diagnostics preview obeys the switch too', chime.diagnostics.preview(), false);
report.equal('a preview while the chime is off creates no audio node', record.gains.length, gainsBeforeMutedPreview);

await chime.harness.scope.set('enabled', true);
await chime.harness.scope.set('tone', 'beep');
await settle();
chime.harness.pushPending([['session-1', approvalInteraction('approval:5')]]);
report.equal('the chime resumes after re-enabling', chime.diagnostics.stats().triggers, 3);
report.equal('the newest chime used the configured tone', chime.diagnostics.stats().lastTone, 'beep');
report.deepEqual('the newest chime used the configured volume', chime.diagnostics.stats().lastVolume, 70);
const gainsBeforePreview = record.gains.length;
report.equal('an explicit preview plays while the chime is on', chime.diagnostics.preview(), true);
report.check('an explicit preview builds audio', record.gains.length > gainsBeforePreview, `${record.gains.length} gain nodes`);
report.equal('a preview is counted separately from an approval chime', chime.diagnostics.stats().previews, 1);
report.equal('a preview does not inflate the approval counter', chime.diagnostics.stats().triggers, 3);

// The suppression row is the "why was it silent" line; it only renders once a gate
// actually skipped something, so it is asserted on this instance, which has both a
// silent (volume 0) and a disabled skip behind it.
const chimeView = createRenderer(chime.sandbox.react, chime.harness.state.slotRegistrations[0].component, {});
chimeView.render();
const chimeText = flattenText(chimeView.tree);
report.check('the suppression row lists the silent skip', chimeText.includes('因音量为 0 而静音 ×' + chime.diagnostics.stats().suppressedSilent), chimeText.slice(0, 240));
report.check('the suppression row lists the disabled skip', chimeText.includes('因“启用”关闭而静音 ×' + chime.diagnostics.stats().suppressedDisabled), chimeText.slice(0, 240));
report.equal('and the suppression row lives on the section page (one h2)', elementsOfType(chimeView.tree, 'h2').length, 1);

/* ------------------------------------------------- 6. autoplay + degradation */

report.section('autoplay unlock, failure modes, and degradations');
const blocked = instantiate({ audio: { state: 'suspended', resumeFails: true } });
blocked.harness.pushPending([['session-1', approvalInteraction('approval:1')]]);
report.equal('a suspended context does not throw', blocked.diagnostics.audio().state, 'suspended');
report.equal('the policy block is counted', blocked.diagnostics.stats().suppressedPolicy, 1);
report.check('an unlock attempt was made', blocked.record.resumes >= 1, `${blocked.record.resumes} resume() call(s)`);
report.equal('a refusing browser leaves the chime locked, not broken', blocked.diagnostics.audio().unlocked, false);
const gestureListeners = () => ['pointerdown', 'mousedown', 'keydown', 'touchstart'].reduce((total, type) => total + (blocked.sandbox.document.listeners.get(type)?.size ?? 0), 0);
report.check('gesture listeners stay bound while locked', gestureListeners() > 0, `${gestureListeners()} listeners`);
blocked.sandbox.document.fire('pointerdown');
await settle();
report.check('a gesture retries the unlock instead of giving up', blocked.record.resumes >= 2, `${blocked.record.resumes} resume() call(s)`);

const late = instantiate({ audio: { state: 'suspended' } });
report.check('gesture listeners are bound at apply time', late.sandbox.document.listeners.get('pointerdown')?.size === 1);
await late.sandbox.document.fire('pointerdown');
await settle();
report.equal('the first user gesture unlocks the AudioContext', late.diagnostics.audio().unlocked, true);
report.equal('the context is running after the unlock', late.diagnostics.audio().state, 'running');
const listenersAfterUnlock = ['pointerdown', 'mousedown', 'keydown', 'touchstart'].reduce((total, type) => total + (late.sandbox.document.listeners.get(type)?.size ?? 0), 0);
report.equal('the gesture listeners are released once unlocked', listenersAfterUnlock, 0);
late.harness.pushPending([['session-1', approvalInteraction('approval:1')]]);
report.equal('an approval after the unlock is audible', late.diagnostics.stats().triggers, 1);
report.equal('no policy block is counted after the unlock', late.diagnostics.stats().suppressedPolicy, 0);
report.ok('no unhandled rejection anywhere so far', rejections.seen.length === 0, rejections.seen.map(String).join(' | '));

const unsupported = instantiate({ audioUnsupported: true });
unsupported.harness.pushPending([['session-1', approvalInteraction('approval:1')]]);
report.equal('a browser without WebAudio does not throw', unsupported.diagnostics.stats().triggers, 0);
report.equal('the missing WebAudio is reported as a degradation', unsupported.diagnostics.audio().state, 'unsupported');
report.equal('the unsupported attempt is counted', unsupported.diagnostics.stats().suppressedUnsupported, 1);

const degraded = createClientSandbox();
const degradedContract = degraded.loader.registrations[0].factory(degraded.requireFn);
const degradedCtx = createClientCtx();
degradedCtx.ctx.uiSession = { pendingInteractions: null };
let degradedThrew = null;
try {
  degradedContract.apply(degradedCtx.ctx);
} catch (error) {
  degradedThrew = error.message;
}
report.check('a missing pendingInteractions source degrades instead of throwing', degradedThrew === null, degradedThrew ?? '');
report.equal('the card is still registered without a chime source', degradedCtx.state.slotRegistrations.length, 1);

const noDocument = createClientSandbox({ document: false });
const noDocumentContract = noDocument.loader.registrations[0].factory(noDocument.requireFn);
let documentThrew = null;
try {
  noDocumentContract.apply(createClientCtx().ctx);
} catch (error) {
  documentThrew = error.message;
}
report.check('a context without a document still applies', documentThrew === null, documentThrew ?? '');

await settle();
report.ok('no unhandled rejection at the end of the run', rejections.seen.length === 0, rejections.seen.map(String).join(' | '));
rejections.stop();

report.summary();
