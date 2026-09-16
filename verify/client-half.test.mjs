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
 *     the active locale, and `locale: NS` — plus ONE
 *     `conversation.session.header.actions` entry (rev-10: private id, `order: 30`),
 *     registers the locale dictionary, subscribes to `uiSession.pendingInteractions`,
 *     and registers NOTHING on the approval waterfall. The Plugins-tab card slot is
 *     never touched: not registered, not waited for, not even named (rev-7 moved the
 *     settings page out of it);
 *   - the registered component IS the section page: one `<h2>` heading carrying the
 *     same text as the navigation label, one intro line, and the controls inside;
 *   - the page is a real range slider (0..100) + switch + tone select + import button
 *     with its hidden file input + preview + reset + visible counters, and every
 *     control writes through the platform's `settingsScope.set/unset` (never through
 *     browser storage);
 *   - a new approval rings once with a master gain of exactly `volume × MASTER_GAIN`,
 *     the same approval can never ring twice, a replacement rings again, and
 *     `volume = 0` / `enabled = false` create no audio node at all;
 *   - rev-10: the session bell — its own header cell (`id`/`order`/`locale`), two SVG
 *     states with a bilingual `title`/`aria-label`, the exact POST body per click, the
 *     self-drawn popover (contents, flip near the viewport edge, Escape/outside
 *     dismissal), the `override ?? global` truth table, a missing custom tone falling
 *     back to the global one, and one chime per audible session 180 ms apart;
 *   - rev-11: two clicks of one session whose POST answers are released OUT OF ORDER
 *     still converge — the local table ends equal to the store stub's content, so the
 *     bell can no longer disagree with the file (the rev-10 review's F-01);
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

/** One slot registration by slot name. */
function entryFor(instance, slotName) {
  return instance.harness.state.slotRegistrations.find((entry) => entry.options?.name === slotName);
}

/** A `custom:<uuid>` no roster will contain. */
const MISSING_TONE_ID = 'feedface-0000-4000-8000-000000000000';

/** A `custom:<uuid>` a roster can be made to contain. */
const CUSTOM_TONE_ID = '11111111-2222-4333-8444-555555555555';

/**
 * A fetch stub serving the per-session route (rev-10). GET answers the table; POST
 * applies the patch the way the Host half does and answers the SAME structure, so a
 * test can assert both the request body and the state the plugin ends up believing.
 */
function sessionsFetch(initial = {}) {
  const table = JSON.parse(JSON.stringify(initial));
  const calls = [];
  let revision = 1;
  const answer = () => ({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, revision, sessions: table }) });
  const fetchStub = (url, options) => {
    const call = { url, options: options ?? {} };
    calls.push(call);
    if (call.options.method !== 'POST') return Promise.resolve(answer());
    const body = JSON.parse(call.options.body);
    const record = { ...(table[body.sessionId] ?? {}) };
    for (const [field, value] of Object.entries(body.patch)) {
      if (value === null) delete record[field];
      else record[field] = value;
    }
    // Same rule as the route: a record is dropped when no OVERRIDE field is left.
    const empty = ['enabled', 'volume', 'tone'].every((field) => record[field] === undefined);
    if (empty) delete table[body.sessionId];
    else {
      record.updatedAt = Date.now();
      table[body.sessionId] = record;
    }
    revision += 1;
    return Promise.resolve(answer());
  };
  return { calls, table, fetch: fetchStub, posts: () => calls.filter((call) => call.options.method === 'POST') };
}

/** The nodes of one className, as the renderer produced them. */
function byClass(tree, className) {
  return collect(tree, (node) => node.props !== undefined && node.props.className === className);
}

/** Real time, so a 180 ms gap can be observed rather than assumed. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A per-session store stub whose POST answers are HELD so a test can release them in
 * any order (rev-11). The store itself is applied in the order the requests arrive —
 * exactly what the real route does — so "the answers arrived reversed" and "the store
 * ended in a known state" stay two independent, controllable facts.
 */
function outOfOrderStore(initial = {}) {
  const store = JSON.parse(JSON.stringify(initial));
  const held = [];
  const posts = [];
  let reads = 0;
  const snapshot = () => JSON.parse(JSON.stringify(store));
  const answer = (sessions) => ({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, revision: 0, sessions }) });
  const fetchStub = (url, options) => {
    if ((options ?? {}).method !== 'POST') {
      reads += 1;
      return Promise.resolve(answer(snapshot()));
    }
    const body = JSON.parse(options.body);
    posts.push(body);
    const record = { ...(store[body.sessionId] ?? {}) };
    for (const [field, value] of Object.entries(body.patch)) {
      if (value === null) delete record[field];
      else record[field] = value;
    }
    // "Empty" means no OVERRIDE field left, exactly like the route's applySessionPatch:
    // `updatedAt` is bookkeeping and must not keep an empty record alive.
    const empty = ['enabled', 'volume', 'tone'].every((field) => record[field] === undefined);
    if (empty) delete store[body.sessionId];
    else {
      record.updatedAt = Date.now();
      store[body.sessionId] = record;
    }
    const table = snapshot();
    return new Promise((resolve) => {
      held.push(() => resolve(answer(table)));
    });
  };
  return { store, held, posts, fetch: fetchStub, reads: () => reads, snapshot };
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
report.ok(
  'nor IndexedDB, nor the Cache Storage API — the bundle calls neither (rev-10 keeps this true)',
  !/indexedDB|IDBFactory|webkitIndexedDB|caches\s*\.|CacheStorage/.test(source),
  'per-session state travels over the HTTP route instead',
);
report.ok('the per-session table is addressed through the Host route', source.includes("'/api/approval-chime/sessions'"));

/* ----------------------------------------------------------- 2. apply() wiring */

report.section('apply() wiring');
const wiring = bundle.harness.state;
report.deepEqual('settings scope is bound to the Host namespace', wiring.boundSpecs, [{ namespace: 'approval-chime' }]);
const settingsEntries = wiring.slotRegistrations.filter((entry) => entry.options?.name === 'settings.section');
report.equal('exactly one settings entry is registered', settingsEntries.length, 1);
const sectionEntry = settingsEntries[0];
report.equal('it registers into settings.section', sectionEntry?.options?.name, 'settings.section');
report.deepEqual(
  'both slots are waited for before registering (settings page, then the session bell)',
  wiring.injectedSlots,
  ['settings.section', 'conversation.session.header.actions'],
);
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
report.equal('the switch never re-registered the row', wiring.slotRegistrations.filter((entry) => entry.options?.name === 'settings.section').length, 1);

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
report.equal('the revision stamp is rev-11', String(bundle.diagnostics.revision).startsWith('rev-11'), true);
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

/* ===================== 5b. rev-10 · the session bell in the header ========= */

report.section('rev-10 · the session bell claims a cell of its own');
const bellEntry = entryFor(bundle, 'conversation.session.header.actions');
report.check('a session-header action is registered', bellEntry !== undefined);
report.equal('it registers into the header actions list slot', bellEntry?.options?.name, 'conversation.session.header.actions');
report.equal("the cell id is the plugin's own", bellEntry?.options?.id, 'approval-chime');
report.ok(
  'the id cannot shadow a shipped cell (agent-preset / job-list / schedule-catalog / agent-team)',
  !['agent-preset', 'job-list', 'schedule-catalog', 'agent-team'].includes(bellEntry?.options?.id),
  String(bellEntry?.options?.id),
);
report.equal('order 30 sits after every shipped action cell (-10 / 10 / 20)', bellEntry?.options?.order, 30);
report.ok('which is past all three shipped orders', bellEntry.options.order > 20, String(bellEntry.options.order));
report.equal('the popover copy comes from the plugin dictionary', bellEntry?.options?.locale, 'approval-chime');
report.check('the bell is a function component', typeof bellEntry?.component === 'function');
report.ok('the header slot was waited for before registering', wiring.injectedSlots.includes('conversation.session.header.actions'));
report.equal('diagnostics names the session slot', bundle.diagnostics.sessionSlot, 'conversation.session.header.actions');
report.deepEqual('diagnostics names the cell and its order', bundle.diagnostics.sessionAction, { id: 'approval-chime', order: 30 });
report.equal('diagnostics publishes the batch gap', bundle.diagnostics.batchGapMs, 180);
report.ok(
  'NOTHING is registered into the right-aligned utilities slot',
  !wiring.slotRegistrations.some((entry) => String(entry.options?.name).includes('header.utilities')),
);
report.ok('the bundle still never names the plugins-tab card slot', !source.includes('settings.plugin.item'));
report.ok(
  'the diagnostics surface keeps every pre-rev-10 key (one was not dropped)',
  ['audio', 'custom', 'customPrefix', 'fallback', 'masterGain', 'namespace', 'plugin', 'preview', 'revision', 'settings', 'slot', 'snapshot', 'stats', 'toneOptions', 'toneRows', 'tones', 'unlock', 'upload'].every((key) => key in bundle.diagnostics),
  Object.keys(bundle.diagnostics).join(', '),
);
report.ok(
  'and adds sessions() plus sessionSettings(id)',
  typeof bundle.diagnostics.sessions === 'function' && typeof bundle.diagnostics.sessionSettings === 'function',
);
report.deepEqual(
  'the legacy diagnostics values are unchanged',
  { plugin: bundle.diagnostics.plugin, namespace: bundle.diagnostics.namespace, slot: bundle.diagnostics.slot, tones: bundle.diagnostics.tones, toneRows: bundle.diagnostics.toneRows },
  { plugin: 'dsh-approval-chime', namespace: 'approval-chime', slot: 'settings.section', tones: ['chime', 'bell', 'beep'], toneRows: 3 },
);
report.equal('with no fetch at all the table degrades to unread (not to a crash)', bundle.diagnostics.sessions().ready, false);
report.deepEqual('and an unread table mutes nothing — everybody follows the global settings', bundle.diagnostics.sessions().sessions, {});
report.ok('a failed read is reported on the diagnostics surface', String(bundle.diagnostics.sessions().error).length > 0, bundle.diagnostics.sessions().error);
report.deepEqual(
  'sessionSettings() answers the global values when nothing is covered',
  { enabled: bundle.diagnostics.sessionSettings('session-1').enabled, volume: bundle.diagnostics.sessionSettings('session-1').volume, tone: bundle.diagnostics.sessionSettings('session-1').tone },
  { enabled: true, volume: 70, tone: 'chime' },
);

/* =================== 5c. rev-10 · the bell's two states ==================== */

report.section('rev-10 · the bell renders both states with bilingual copy');
const bellTable = sessionsFetch({
  'session-quiet': { enabled: false, updatedAt: 5 },
  'session-loud': { volume: 30, updatedAt: 6 },
});
const bell = instantiate({ fetch: bellTable.fetch });
await settle();
report.ok('the table is read from the Host at apply time', bell.diagnostics.sessions().ready === true, JSON.stringify(bell.diagnostics.sessions()));
report.equal('the answer carries the Host revision', bell.diagnostics.sessions().revision, 1);
const actionComponent = entryFor(bell, 'conversation.session.header.actions').component;

const loudView = createRenderer(bell.sandbox.react, actionComponent, { sessionId: 'session-loud' });
loudView.render();
loudView.runEffects();
const loudBell = () => byClass(loudView.tree, 'dacBell')[0];
report.check('the bell renders for a session id', loudBell() !== undefined);
report.equal('two inline svgs (the bell and its caret) — no icon font, no request', elementsOfType(loudView.tree, 'svg').length, 2);
report.equal('exactly one bell button', byClass(loudView.tree, 'dacBell').length, 1);
report.equal('exactly one caret button beside it', byClass(loudView.tree, 'dacCaret').length, 1);
report.equal('an audible session draws the solid bell (no slash)', byClass(loudView.tree, 'dacSlash').length, 0);
report.equal('and says so on the muted attribute', loudBell()?.props?.['data-muted'], 'false');
report.equal('the button reports the state to assistive tech', loudBell()?.props?.['aria-pressed'], true);
report.equal('the button is a real button (keyboard operable)', loudBell()?.props?.type, 'button');
const loudLabel = String(loudBell()?.props?.title ?? '');
report.ok('the tooltip carries the Chinese wording', loudLabel.includes('本会话审批提示音：开'), loudLabel);
report.ok('the tooltip carries the English wording at the same time', loudLabel.includes('Approval chime for this session: on'), loudLabel);
report.equal('aria-label is the very same bilingual text', loudBell()?.props?.['aria-label'], loudLabel);
report.equal('the caret names what it opens', String(byClass(loudView.tree, 'dacCaret')[0]?.props?.title ?? '').includes('本会话音色与音量'), true);

const quietView = createRenderer(bell.sandbox.react, actionComponent, { sessionId: 'session-quiet' });
quietView.render();
quietView.runEffects();
const quietBell = () => byClass(quietView.tree, 'dacBell')[0];
report.equal('a session muted by its own record is drawn struck through', byClass(quietView.tree, 'dacSlash').length, 1);
report.equal('and marked muted', quietBell()?.props?.['data-muted'], 'true');
report.equal('with aria-pressed false', quietBell()?.props?.['aria-pressed'], false);
report.ok('the muted tooltip says off in Chinese', String(quietBell()?.props?.title ?? '').includes('本会话审批提示音：关'), String(quietBell()?.props?.title));
report.ok('and in English', String(quietBell()?.props?.title ?? '').includes('Approval chime for this session: off'), String(quietBell()?.props?.title));

const uncoveredView = createRenderer(bell.sandbox.react, actionComponent, { sessionId: 'session-uncovered' });
uncoveredView.render();
uncoveredView.runEffects();
report.equal('a session with no record follows the global switch (bell on)', byClass(uncoveredView.tree, 'dacBell')[0]?.props?.['data-muted'], 'false');

const anonymousView = createRenderer(bell.sandbox.react, actionComponent, {});
anonymousView.render();
report.equal('a cell without a sessionId renders nothing rather than a dead control', anonymousView.tree, null);

/* ============ 5d. rev-10 · clicking the bell writes through the route ====== */

report.section('rev-10 · clicking the bell writes the patch the Host expects');
report.deepEqual('the record is untouched before the click', bell.diagnostics.sessions().sessions['session-loud'], { volume: 30, updatedAt: 6 });
loudBell().props.onClick({});
await settle();
const mutePosts = bellTable.posts();
report.equal('muting posts exactly one request', mutePosts.length, 1);
report.equal('to the per-session route', mutePosts[0]?.url, '/api/approval-chime/sessions');
report.equal('with POST', mutePosts[0]?.options?.method, 'POST');
report.equal('asking for same-origin credentials', mutePosts[0]?.options?.credentials, 'same-origin');
report.equal('declaring a JSON body', mutePosts[0]?.options?.headers?.['content-type'], 'application/json');
report.deepEqual(
  'carrying this session and a mute — and nothing else',
  JSON.parse(mutePosts[0]?.options?.body ?? 'null'),
  { sessionId: 'session-loud', patch: { enabled: false } },
);
report.equal('the mute reached the table', bell.diagnostics.sessionSettings('session-loud').enabled, false);
report.equal('the other override on the same record survived', bell.diagnostics.sessionSettings('session-loud').volume, 30);
report.equal('the bells of the other sessions are unaffected', bell.diagnostics.sessionSettings('session-quiet').enabled, false);

loudView.render();
byClass(loudView.tree, 'dacBell')[0].props.onClick({});
await settle();
report.deepEqual(
  'clicking a muted bell clears the override (back to following the global switch)',
  JSON.parse(bellTable.posts()[1]?.options?.body ?? 'null'),
  { sessionId: 'session-loud', patch: { enabled: null } },
);
report.equal('the record no longer carries an enabled override', bell.diagnostics.sessionSettings('session-loud').overridden.enabled, false);
report.equal('so the session is audible again', bell.diagnostics.sessionSettings('session-loud').enabled, true);

/* ============ 5e. rev-10 · the popover: contents, positioning, closing ===== */

report.section('rev-10 · the caret opens a self-drawn popover that dismisses itself');
const popInstance = instantiate({ fetch: sessionsFetch({ 'session-1': { tone: 'bell', updatedAt: 3 } }).fetch });
await settle();
const popComponent = entryFor(popInstance, 'conversation.session.header.actions').component;
const popView = createRenderer(popInstance.sandbox.react, popComponent, { sessionId: 'session-1' });
popView.render();
popView.runEffects();
report.equal('nothing is drawn before the caret is pressed', byClass(popView.tree, 'dacPop').length, 0);
byClass(popView.tree, 'dacCaret')[0].props.onClick({});
popView.render();
popView.runEffects();
const popover = () => byClass(popView.tree, 'dacPop')[0];
report.equal('pressing the caret opens exactly one popover', byClass(popView.tree, 'dacPop').length, 1);
report.equal('the caret reports its expanded state', byClass(popView.tree, 'dacCaret')[0]?.props?.['data-open'], 'true');
report.equal('the popover is a dialog for assistive tech', popover()?.props?.role, 'dialog');
report.equal('it is positioned fixed, so the header row cannot clip or scroll it', popover()?.props?.style?.position, 'fixed');
const popSelects = collect(popover(), (node) => node.type === 'select');
report.equal('it offers exactly one tone select', popSelects.length, 1);
const popOptions = collect(popover(), (node) => node.type === 'option');
report.deepEqual('the tone list starts with follow-global, then the built-ins', popOptions.map((node) => node.props.value), ['', 'chime', 'bell', 'beep']);
report.equal('and its first row IS the localized follow-global copy', flattenText(popOptions[0]), '跟随全局');
const popOptionLabels = () => collect(popover(), (node) => node.type === 'option').map(flattenText);
report.ok(
  'no missing-file row while the stored tone is a built-in that exists',
  !popOptionLabels().some((label) => label.includes('file missing') || label.includes('文件缺失')),
  popOptionLabels().join(' | '),
);
report.equal('the stored per-session tone is the selected one', popSelects[0]?.props?.value, 'bell');
const popFollow = collect(popover(), (node) => node.type === 'input' && node.props['data-field'] === 'volume-follow');
report.equal('the volume row has a follow-the-global checkbox', popFollow.length, 1);
report.equal('checked while the volume only follows the global setting', popFollow[0]?.props?.checked, true);
report.equal('and the range is disabled until the override exists', collect(popover(), (node) => node.type === 'input' && node.props.type === 'range')[0]?.props?.disabled, true);
report.equal('the range still shows the global volume', Number(collect(popover(), (node) => node.type === 'input' && node.props.type === 'range')[0]?.props?.value), 70);
report.ok('a follow-global button is offered', elementsOfType(popover(), 'button').some((button) => flattenText(button).includes('恢复跟随全局')));
report.ok('the popover says where the data is stored', flattenText(popover()).includes('approval-chime/sessions.json'), flattenText(popover()).slice(0, 220));

popInstance.sandbox.document.fire('keydown', { key: 'Escape' });
popView.render();
report.equal('Escape closes the popover', byClass(popView.tree, 'dacPop').length, 0);
byClass(popView.tree, 'dacCaret')[0].props.onClick({});
popView.render();
popView.runEffects();
report.equal('the popover can be reopened', byClass(popView.tree, 'dacPop').length, 1);
popInstance.sandbox.document.fire('pointerdown');
popView.render();
report.equal('an outside pointer press closes it', byClass(popView.tree, 'dacPop').length, 0);

// The two refs, in hook order: the wrapper (what the popover anchors to) and the caret.
const popRefs = popView.hooks.filter((hook) => hook !== null && typeof hook === 'object' && 'current' in hook);
report.equal('the component keeps a wrapper ref and a caret ref', popRefs.length, 2);
popInstance.sandbox.context.window.innerWidth = 1000;
popInstance.sandbox.context.window.innerHeight = 800;
popRefs[0].current = { contains: () => false, getBoundingClientRect: () => ({ left: 300, top: 40, right: 320, bottom: 60 }) };
byClass(popView.tree, 'dacCaret')[0].props.onClick({});
popView.render();
report.deepEqual(
  'with room below, the popover hangs under the bell',
  { left: popover()?.props?.style?.left, top: popover()?.props?.style?.top },
  { left: 300, top: 66 },
);
popRefs[0].current = { contains: () => false, getBoundingClientRect: () => ({ left: 900, top: 700, right: 920, bottom: 720 }) };
popView.render();
report.deepEqual(
  'near the viewport edge it flips above the bell and stays inside the width',
  { left: popover()?.props?.style?.left, top: popover()?.props?.style?.top },
  { left: 744, top: 510 },
);

/* ============ 5f. rev-10 · a refused write rolls back and reports ========== */

report.section('rev-10 · a refused write rolls back and shows the error line');
const refused = instantiate({
  fetch: (url, options) => {
    if (options?.method === 'POST') {
      return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ ok: false, error: 'tone must be one of chime|bell|beep' }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, revision: 1, sessions: {} }) });
  },
});
await settle();
const refusedView = createRenderer(refused.sandbox.react, entryFor(refused, 'conversation.session.header.actions').component, { sessionId: 'session-1' });
refusedView.render();
refusedView.runEffects();
byClass(refusedView.tree, 'dacCaret')[0].props.onClick({});
refusedView.render();
refusedView.runEffects();
byClass(refusedView.tree, 'dacBell')[0].props.onClick({});
refusedView.render();
report.equal('the optimistic mute is on screen before the Host answers', byClass(refusedView.tree, 'dacBell')[0]?.props?.['data-muted'], 'true');
await settle();
refusedView.render();
report.equal('a refused write rolls the bell back to its previous state', byClass(refusedView.tree, 'dacBell')[0]?.props?.['data-muted'], 'false');
report.equal('and nothing was applied locally', refused.diagnostics.sessions().sessions['session-1'], undefined);
const refusedPopover = byClass(refusedView.tree, 'dacPop')[0];
report.ok('the popover shows the per-session error line', flattenText(refusedPopover).includes('本会话设置写入失败'), flattenText(refusedPopover).slice(0, 240));
report.ok('carrying the Host reason', flattenText(refusedPopover).includes('tone must be one of'), flattenText(refusedPopover).slice(0, 240));

/* ============ 5g. rev-10 · effective values: override ?? global =========== */

report.section('rev-10 · effective values are session override ?? global, field by field');
const overrides = instantiate({
  fetch: sessionsFetch({
    's-mute': { enabled: false, updatedAt: 1 },
    's-tone': { tone: 'bell', updatedAt: 2 },
    's-volume': { volume: 30, updatedAt: 3 },
    's-forced': { enabled: true, updatedAt: 4 },
    's-gone': { tone: `custom:${MISSING_TONE_ID}`, updatedAt: 5 },
    's-empty': {},
  }).fetch,
});
await settle();
const per = (id) => overrides.diagnostics.sessionSettings(id);
report.ok('the whole table is read before the first bell renders', overrides.diagnostics.sessions().ready === true, JSON.stringify(overrides.diagnostics.sessions()));
report.deepEqual(
  'an empty record never reaches the table (it would mean "follow global" anyway)',
  Object.keys(overrides.diagnostics.sessions().sessions).sort(),
  ['s-forced', 's-gone', 's-mute', 's-tone', 's-volume'],
);
report.deepEqual(
  'global on · uncovered → every field follows the global settings',
  { enabled: per('s-uncovered').enabled, volume: per('s-uncovered').volume, tone: per('s-uncovered').tone },
  { enabled: true, volume: 70, tone: 'chime' },
);
report.deepEqual(
  'global on · muted → only the switch is overridden',
  { enabled: per('s-mute').enabled, volume: per('s-mute').volume, tone: per('s-mute').tone },
  { enabled: false, volume: 70, tone: 'chime' },
);
report.deepEqual(
  'global on · tone → only the tone is overridden',
  { enabled: per('s-tone').enabled, volume: per('s-tone').volume, tone: per('s-tone').tone },
  { enabled: true, volume: 70, tone: 'bell' },
);
report.deepEqual(
  'global on · volume → only the volume is overridden',
  { enabled: per('s-volume').enabled, volume: per('s-volume').volume, tone: per('s-volume').tone },
  { enabled: true, volume: 30, tone: 'chime' },
);
report.deepEqual('the override ledger says which fields came from the session', per('s-volume').overridden, { enabled: false, volume: true, tone: false });

await overrides.harness.scope.set('enabled', false);
await settle();
report.equal('global off · uncovered → silent', per('s-uncovered').enabled, false);
report.equal('global off · a tone-only override is still silent (it follows the global switch)', per('s-tone').enabled, false);
report.equal('global off · a volume-only override is silent too', per('s-volume').enabled, false);
report.equal('global off · its volume override still means 30', per('s-volume').volume, 30);
report.equal('global off · an uncovered session keeps following the global volume', per('s-uncovered').volume, 70);
report.equal('global off · a record that carries enabled:true IS the value (override ?? global)', per('s-forced').enabled, true);
report.equal('and only the bell ever writes false or null — the UI never writes a force-on', source.includes("view.enabled === true ? { enabled: false } : { enabled: null }"), true);

await overrides.harness.scope.set('enabled', true);
await settle();
report.equal('turning the global switch back on restores every uncovered session', per('s-uncovered').enabled, true);

report.section('rev-10 · a missing custom tone falls back to the GLOBAL tone');
report.equal('a custom override whose file is gone uses the global tone', per('s-gone').tone, 'chime');
report.equal('and reports why, instead of failing to decode', per('s-gone').customMissing, true);
await overrides.harness.scope.set('tone', 'beep');
await settle();
report.equal('the fallback is the CURRENT global tone, not a fixed default', per('s-gone').tone, 'beep');
const rosterInstance = instantiate({ fetch: sessionsFetch({ 's-custom': { tone: `custom:${CUSTOM_TONE_ID}`, updatedAt: 1 } }).fetch });
await settle();
report.equal('with an empty roster the custom override falls back', rosterInstance.diagnostics.sessionSettings('s-custom').tone, 'chime');
await rosterInstance.harness.scope.set('custom', [{ id: CUSTOM_TONE_ID, name: 'mine.mp3' }]);
await settle();
report.equal('once the file is in the roster the override plays', rosterInstance.diagnostics.sessionSettings('s-custom').tone, `custom:${CUSTOM_TONE_ID}`);
report.equal('and the missing-file note is gone', rosterInstance.diagnostics.sessionSettings('s-custom').customMissing, false);
// The select must still SHOW a stored tone the roster no longer names: an option-less
// value renders blank, which would hide exactly the state the user needs to see.
const goneView = createRenderer(overrides.sandbox.react, entryFor(overrides, 'conversation.session.header.actions').component, { sessionId: 's-gone' });
goneView.render();
goneView.runEffects();
byClass(goneView.tree, 'dacCaret')[0].props.onClick({});
goneView.render();
const goneOptions = collect(byClass(goneView.tree, 'dacPop')[0], (node) => node.type === 'option');
report.equal('the stored-but-missing tone still gets a row', goneOptions.some((node) => node.props.value === `custom:${MISSING_TONE_ID}`), true);
report.ok('labelled as missing, in the active locale', goneOptions.some((node) => flattenText(node).includes('文件缺失')), goneOptions.map(flattenText).join(' | '));
report.equal('the select reports that stored value, so it cannot render blank', collect(byClass(goneView.tree, 'dacPop')[0], (node) => node.type === 'select')[0]?.props?.value, `custom:${MISSING_TONE_ID}`);
report.ok('and the popover spells out the fallback', flattenText(byClass(goneView.tree, 'dacPop')[0]).includes('回退全局音色'), flattenText(byClass(goneView.tree, 'dacPop')[0]).slice(0, 200));

/* ============ 5h. rev-10 · one batch, one chime per session =============== */

report.section('rev-10 · a batch of four sessions rings three times, 180 ms apart');
const batchTable = sessionsFetch({
  's-b': { volume: 30, updatedAt: 1 },
  's-c': { enabled: false, updatedAt: 2 },
  's-d': { volume: 90, updatedAt: 3 },
});
const batch = instantiate({ fetch: batchTable.fetch });
await settle();
const batchGains = () => batch.record.gains.filter((gain) => batch.record.connections.some((link) => link.from === gain && link.to.kind === 'destination'));
const batchStats = () => batch.diagnostics.stats();
batch.harness.pushPending([
  ['s-a', approvalInteraction('approval:a', { sessionId: 's-a' })],
  ['s-b', approvalInteraction('approval:b', { sessionId: 's-b' })],
  ['s-c', approvalInteraction('approval:c', { sessionId: 's-c' })],
  ['s-d', approvalInteraction('approval:d', { sessionId: 's-d' })],
]);
report.equal('four pendings in one snapshot are one batch', batchStats().lastBatchSize, 4);
report.equal('three of them are audible', batchStats().lastBatchPlayed, 3);
report.equal('the first session rings immediately', batchStats().triggers, 1);
report.equal('the muted session made no sound at all', batchGains().length, 1);
report.equal('the session mute has its own counter', batchStats().suppressedSession, 1);
report.equal('the global suppression counter is untouched by a session mute', batchStats().suppressedDisabled, 0);
report.close('the first chime used the GLOBAL volume (70)', batchGains()[0].gain.value, (70 / 100) * batch.diagnostics.masterGain);
await sleep(120);
report.equal('120 ms in, the batch has still rung only once (the 180 ms gap is real)', batchStats().triggers, 1);
await sleep(120);
report.equal('by 240 ms the second session has rung', batchStats().triggers, 2);
report.close("with ITS own volume (30), not the global one", batchGains()[1].gain.value, (30 / 100) * batch.diagnostics.masterGain);
await sleep(200);
report.equal('by 440 ms the third session has rung', batchStats().triggers, 3);
report.close('with its own volume too (90)', batchGains()[2].gain.value, (90 / 100) * batch.diagnostics.masterGain);
report.deepEqual(
  'the sounds arrive in snapshot order, one per audible session',
  batchGains().map((gain) => gain.gain.value),
  [(70 / 100) * batch.diagnostics.masterGain, (30 / 100) * batch.diagnostics.masterGain, (90 / 100) * batch.diagnostics.masterGain],
);
report.equal('three separate triggers, never one merged sound', batchStats().triggers, 3);
report.equal('every interaction was counted, including the muted one', batchStats().approvalsSeen, 4);
batch.harness.pushPending([['s-a', approvalInteraction('approval:a', { sessionId: 's-a' })]]);
report.equal('re-publishing the same approval still rings nobody again', batchStats().triggers, 3);
const batchSection = createRenderer(batch.sandbox.react, entryFor(batch, 'settings.section').component, {});
batchSection.render();
report.ok(
  'the settings page explains the session mute',
  flattenText(batchSection.tree).includes('因本会话提示音关闭而静音 ×1'),
  flattenText(batchSection.tree).slice(0, 260),
);

/* ============ 5i. rev-11 · out-of-order answers cannot desync the table ===== */

report.section('rev-11 · answers delivered out of order still converge on the store');
const raceStore = outOfOrderStore();
const race = instantiate({ fetch: raceStore.fetch });
await settle();
report.equal('the mount read is the only read before any write', raceStore.reads(), 1);
const raceReadsAtMount = raceStore.reads();
const firstWrite = race.diagnostics.toggleSession('race-1');
const secondWrite = race.diagnostics.toggleSession('race-1');
report.deepEqual(
  'two clicks of one session are two patches (mute, then clear)',
  raceStore.posts.map((entry) => entry.patch),
  [{ enabled: false }, { enabled: null }],
);
report.equal('the store applied both in request order and holds no record again', Object.keys(raceStore.store).length, 0);
report.equal('both writes are in flight at once (that is the window)', race.diagnostics.sessionWrites().outstanding, 2);
// Release the SECOND answer first, then the first: the answers arrive reversed, which
// is the order the rev-10 review measured and filed as F-01.
raceStore.held[1]();
await secondWrite;
await settle();
report.equal('mid-flight the bell already follows the clearing click', race.diagnostics.sessionSettings('race-1').enabled, true);
report.equal('one write is still outstanding', race.diagnostics.sessionWrites().outstanding, 1);
raceStore.held[0]();
await firstWrite;
await settle();
report.equal('the stale answer cannot leave a record behind', race.diagnostics.sessions().sessions['race-1'], undefined);
report.equal('so the bell still follows the global switch (no phantom mute)', race.diagnostics.sessionSettings('race-1').enabled, true);
report.deepEqual('the local table equals the store the Host holds', race.diagnostics.sessions().sessions, raceStore.snapshot());
report.equal('the last settled write re-reads the store once (not once per write)', raceStore.reads(), raceReadsAtMount + 1);
report.equal('no write is left in flight', race.diagnostics.sessionWrites().outstanding, 0);
report.equal('and the convergence read left no error line behind', race.diagnostics.sessions().error, '');

report.section('rev-11 · a single click still converges, and a refused one keeps its error');
const singleStore = outOfOrderStore();
const single = instantiate({ fetch: singleStore.fetch });
await settle();
const singleWrite = single.diagnostics.toggleSession('single-1');
singleStore.held[0]();
await singleWrite;
await settle();
report.deepEqual('one click lands the store record and the local table matches', single.diagnostics.sessions().sessions, singleStore.snapshot());
report.equal('the bell is muted', single.diagnostics.sessionSettings('single-1').enabled, false);
report.equal('one click re-reads the store once', singleStore.reads(), 2);
report.equal('and leaves nothing in flight', single.diagnostics.sessionWrites().outstanding, 0);

const refusedRace = instantiate({
  fetch: (url, options) => {
    if ((options ?? {}).method === 'POST') {
      return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ ok: false, error: 'volume must be an integer in 0..100, or null' }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, revision: 1, sessions: {} }) });
  },
});
await settle();
const refusedWrite = refusedRace.diagnostics.toggleSession('session-1');
report.equal('a refused write resolves false (it never rejects)', await refusedWrite, false);
await settle();
report.equal('the refused session is not in the local table', refusedRace.diagnostics.sessions().sessions['session-1'], undefined);
report.ok(
  'and the convergence read did not erase the refusal',
  refusedRace.diagnostics.sessions().error.includes('volume must be an integer'),
  refusedRace.diagnostics.sessions().error,
);
report.equal('nothing is left in flight after a refusal', refusedRace.diagnostics.sessionWrites().outstanding, 0);

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
report.equal(
  'the card is still registered without a chime source',
  degradedCtx.state.slotRegistrations.filter((entry) => entry.options?.name === 'settings.section').length,
  1,
);
report.equal(
  'and the session bell registers without a chime source too',
  degradedCtx.state.slotRegistrations.filter((entry) => entry.options?.name === 'conversation.session.header.actions').length,
  1,
);

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
