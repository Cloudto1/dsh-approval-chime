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
 *   - rev-12: the two tone lists — the settings card's and the session popover's —
 *     come out of ONE set of `::picker(select)` declarations, so the JS bundle hands
 *     the browser two menus that differ only in how many rows they show before they
 *     scroll (the popover's four default rows vs the card's three);
 *   - rev-15 (OBS-A): a convergence re-read that FAILS keeps the last known per-session
 *     table — a mute the user set survives a transient failure, the reason lands on the
 *     popover's existing error row, the still-muted session stays silent, and the next
 *     read that lands converges the table onto the Host file again;
 *   - rev-18: the caret's turn moved 160 ms → 300 ms — rev-17's 160 ms justified only
 *     this file's own `.18s` transitions, and the user's device read that as an instant
 *     cut ("要有过渡动画能看到在转动的箭头"). The console surface also answers
 *     `reduceMotion()`, read live on every call, so "the animation is too fast to see" can
 *     be told apart from "this environment deliberately asks for no motion at all";
 *   - rev-19: the caret's turn moved 300 ms → 400 ms — the same device reading that
 *     produced rev-18 said the 300 ms turn was still an instant cut, so the constant
 *     moved again. The stylesheet still CONCATENATES that number from the constant instead of
 *     copying it, and exactly ONE caret transition rule existed;
 *   - rev-20: the turn is 160 ms again (user request: "动画效果打开有效果，不过我要的是开不开都
 *     是能有动画的，把动画时长改回 160ms。") and BOTH reduced-motion media blocks are DELETED —
 *     the caret's own override was the real reason no duration was ever played on the reporting
 *     device, whose system asks for reduced motion. It is a deliberate trade-off and it is
 *     recorded as one next to the constant: this micro-interaction no longer distinguishes
 *     environments, so it must not be quoted as an accessibility policy;
 *   - rev-21: the SECTION BADGE prints the version id alone ("rev-21"), not the whole stamp
 *     (user request: "这里只显示版本号就行了"). `diagnostics.revision` keeps the descriptive
 *     half for the console, `diagnostics.revisionId` is the badge's text, and the badge derives
 *     it from the same string, so the two cannot drift;
 *   - rev-22: the BELL RINGS when it is toggled (user request: "这个铃铛也要有动画"). The glyph
 *     swings about its TOP (a bell hangs from its crown; the caret keeps turning about its
 *     middle), the @keyframes text is generated from one declared frame table, the animation is
 *     armed only after the first click so the first paint is silent, and no reduced-motion block
 *     is added for it — the same standing trade-off rev-20 recorded for the caret;
 *   - rev-23: that rattle is replaced by a TILT (user request: "再换一个要有高级感"). One lean past
 *     rest instead of four swings, a scale track, a 9° peak instead of 14°, and an ease-out with a
 *     long tail instead of a symmetric ease-in-out. The whole difference is the SHAPE of the frame
 *     table, and the assertions below measure that shape rather than the amplitude: they count the
 *     crossings of zero and refuse `ease-in-out` by name;
 *   - rev-24: the tilt is DELETED and the bell does not move at all (user request: "不要晃动，静音时把
 *     斜杠重左上拉到右下的动画"). The mute is what animates: the slash's stroke is drawn from its
 *     top-left end to its bottom-right end by animating `stroke-dashoffset` from the diagonal's own
 *     length to 0, the blue fill dims and returns on the SAME duration, and the stroke is pushed into
 *     the SVG BEFORE the bell so the silhouette paints over it. Two earlier attempts at hiding the
 *     slash are recorded in the bundle: a dash offset leaves a round cap on one end (a dot) or drags
 *     the next repetition in at the other (a stub line), so the resting state is hidden by `opacity`,
 *     and the assertions below pin that — plus the ABSENCE of every tilt rule, because "the bell does
 *     not move" is what a later edit breaks by re-adding a keyframe nobody asked for;
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

/**
 * A per-session store stub whose READS can be broken on demand (rev-15, OBS-A). The
 * mount read answers normally; then `breakWith('http-error')` makes every later GET answer
 * a non-OK status (the shape that used to wipe the local table), `breakWith('reject')` makes
 * it reject the way a dead socket does, and `heal()` lets the next read land again. POST
 * always lands, so "the mute reached the Host" and "the convergence re-read failed" stay
 * two independent, controllable facts. `onRead`, when set, fires as each GET is ISSUED —
 * that is the only place from outside the bundle where the LOCAL table can be observed in
 * the instant before the read that fails (the assertion "field-for-field equal to the table
 * from BEFORE the failure" needs exactly that observation).
 */
function flakyReadStore(initial = {}) {
  const table = JSON.parse(JSON.stringify(initial));
  const calls = [];
  let reads = 0;
  let mode = 'ok';
  const answer = () => ({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, revision: reads, sessions: table }) });
  const api = {
    calls,
    table,
    snapshot: () => JSON.parse(JSON.stringify(table)),
    reads: () => reads,
    posts: () => calls.filter((call) => call.options.method === 'POST'),
    onRead: null,
    breakWith: (how) => {
      mode = how;
    },
    heal: () => {
      mode = 'ok';
    },
  };
  api.fetch = (url, options) => {
    const call = { url, options: options ?? {} };
    calls.push(call);
    if (call.options.method === 'POST') {
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
      return Promise.resolve(answer());
    }
    reads += 1;
    if (typeof api.onRead === 'function') api.onRead();
    if (mode === 'http-error') return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({ ok: false, error: 'the store is unreachable' }) });
    if (mode === 'reject') return Promise.reject(new Error('network down'));
    return Promise.resolve(answer());
  };
  return api;
}

/** Field-by-field shape of a table: ids sorted, each record's fields sorted by name. */
function fieldWise(table) {
  return Object.keys(table)
    .sort()
    .map((id) => [
      id,
      Object.keys(table[id])
        .sort()
        .map((field) => [field, table[id][field]]),
    ]);
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
report.check('the intro carries the section copy', flattenText(intros[0]).includes('DSH 向你申请权限时响一次'), flattenText(intros[0]));
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
report.equal('the badge names the build the page loaded (the version id, not the prose)', flattenText(revBadges[0]), bundle.diagnostics.revisionId);
report.equal('the revision stamp is rev-24', String(bundle.diagnostics.revision).startsWith('rev-24'), true);
const statsText = flattenText(view.tree);
/* rev-21 · the badge prints the ID alone (user request: "这里只显示版本号就行了"). These assertions are
   the tripwire: the badge must be exactly the version id, it must carry no separator, and the full
   stamp must be absent from the page. Any of them goes red if the badge is pointed back at
   `bundleRevision`. `diagnostics.revision` keeps the descriptive half for the console. */
report.check('the badge is the version id and nothing else (rev-21)', /^rev-\d+$/.test(flattenText(revBadges[0])), flattenText(revBadges[0]));
report.equal('the badge carries no descriptive half (rev-21)', flattenText(revBadges[0]).includes(' · '), false);
report.equal('the badge is exactly diagnostics.revisionId (rev-21)', flattenText(revBadges[0]), bundle.diagnostics.revisionId);
report.equal('the console keeps the descriptive half for diagnosis (rev-21)', String(bundle.diagnostics.revision).indexOf(String(bundle.diagnostics.revisionId) + ' · ') === 0, true);
report.check('the section shows the trigger counter', statsText.includes('已触发'), statsText.slice(0, 120));
report.check('the section shows the last-trigger indicator', statsText.includes('上次触发') && statsText.includes('尚未触发'));
report.check('the section shows the bundle revision stamp (the version id, rev-21)', statsText.includes(bundle.diagnostics.revisionId) && !statsText.includes(bundle.diagnostics.revision));

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
/* The two tone lists — the settings card's and the session popover's — are one design
 * as of rev-12 (user request: the list in the header must look like the one in 设置).
 * These assertions read the JOINED stylesheet, so they check what the browser is given
 * rather than what the source intended, and they compare the two rules against each
 * other: "differ only in the row cap" cannot be satisfied by two hand-kept copies that
 * agree today, only by the shared fragments the bundle actually emits. */
const pickerMetrics = bundle.diagnostics.pickerMetrics;
/* Every rule whose selector LIST contains this selector, merged into one property map
 * (later declarations win, exactly as the cascade would apply them to the element). */
const pickerProps = (selector) => {
  const props = {};
  let from = 0;
  for (;;) {
    const at = styleText.indexOf(selector, from);
    if (at < 0) break;
    from = at + selector.length;
    const before = at === 0 ? '' : styleText[at - 1];
    const after = styleText[at + selector.length];
    if (!(before === '' || before === ',' || before === '}' || before === '{')) continue;
    if (!(after === '{' || after === ',')) continue;
    const brace = after === '{' ? at + selector.length : styleText.indexOf('{', at);
    const end = styleText.indexOf('}', brace);
    for (const declaration of styleText.slice(brace + 1, end).split(';')) {
      const colon = declaration.indexOf(':');
      if (colon > 0) props[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
    }
  }
  return props;
};
const sortedProps = (props, dropped) => Object.keys(props)
  .filter((name) => name !== dropped)
  .sort()
  .map((name) => `${name}:${props[name]}`)
  .join(';');
const cardPicker = pickerProps('.dacCard select::picker(select)');
const popPicker = pickerProps('.dacPop select::picker(select)');
report.ok('the picker still pins its own box model (rev-5 R5-1)', cardPicker['box-sizing'] === 'content-box', 'box-sizing:' + cardPicker['box-sizing']);
report.equal(
  'the card picker still caps at exactly three rows (rev-5 R5-1)',
  cardPicker['max-height'],
  `${pickerMetrics.cardMaxPx}px`,
);
report.equal('the card picker cap is TONE_ROWS x the pinned row height', pickerMetrics.cardMaxPx, 3 * pickerMetrics.rowPx);
report.equal('the picker keeps its 10px rounded corners (rev-3)', cardPicker['border-radius'], '10px');
report.equal('both tone selects opt into the customizable picker (rev-12)', styleText.includes('.dacCard select,.dacPop select{appearance:base-select;}'), true);
report.ok(
  'both pickers are painted by ONE rule, so neither can drift away from the other (rev-12)',
  styleText.includes('.dacCard select::picker(select),.dacPop select::picker(select){'),
);
report.equal('the session popover has a picker rule of its own for its row cap', Object.keys(popPicker).length > 0, true);
report.equal(
  'the popover picker is pinned exactly like the card\'s: content-box, rounded, auto-scroll',
  popPicker['box-sizing'] === 'content-box' && popPicker['border-radius'] === '10px' && popPicker['overflow-y'] === 'auto',
  true,
);
report.equal(
  'the two pickers differ ONLY in how many rows they show (rev-12)',
  sortedProps(cardPicker, 'max-height'),
  sortedProps(popPicker, 'max-height'),
);
report.equal(
  'the popover caps at its four default rows (跟随全局 + the three tones)',
  popPicker['max-height'],
  `${pickerMetrics.sessionMaxPx}px`,
);
report.equal('the popover lists exactly one row more than the card', bundle.diagnostics.sessionToneRows, bundle.diagnostics.toneRows + 1);
report.equal(
  'and that cap is those rows plus the few pixels the browser picker chrome adds',
  pickerMetrics.sessionMaxPx,
  bundle.diagnostics.sessionToneRows * pickerMetrics.rowPx + pickerMetrics.slackPx,
);
report.equal(
  'the popover list states its own type size instead of inheriting the popover\'s 12px (rev-12)',
  popPicker['font-size'],
  `${pickerMetrics.textPx}px`,
);
report.equal('and that size is the card\'s own 13px, so the two lists read the same', pickerMetrics.textPx, 13);
report.ok(
  'both option lists share one row rule (radius 7, 4x9 padding, pinned 20px line box)',
  styleText.includes('.dacCard select option,.dacPop select option{border-radius:7px;padding:4px 9px;line-height:20px;}'),
);
report.ok(
  'both option lists share one highlight rule (the rounded tinted row, not the UA\'s square grey)',
  styleText.includes('.dacPop select option:hover,.dacPop select option:checked{background:color-mix(in srgb,currentColor 14%,transparent);}'),
);
report.ok(
  'and one fallback color rule for a browser without customizable select',
  styleText.includes('.dacCard select option,.dacPop select option{background-color:var(--dsw-alias-bg-layer-1,#fff);'),
);
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
report.equal(
  'the switch keeps its transitions in every environment: the stylesheet carries no reduced-motion rule (rev-20)',
  styleText.includes('prefers-reduced-motion'),
  false,
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

/* rev-13 · the user read the first cut as too small ("把图标改大点，这个太小了"): a 20px
 * button around a 14px icon, whose drawn bell fills ~68% of its viewBox. Three places
 * have to agree — the CSS box, the two <svg> elements and the console surface — so the
 * assertions read the SAME constants the bundle builds them from, and one of them
 * compares against the shipped chips' 28px/15px so "bigger than before" cannot quietly
 * become "bigger than nothing". */
const sessionIcon = bell.diagnostics.sessionIcon;
report.deepEqual(
  'the header control reports its geometry on the console surface (rev-13)',
  { bellBoxPx: sessionIcon.bellBoxPx, caretBoxPx: sessionIcon.caretBoxPx, bellGlyphPx: sessionIcon.bellGlyphPx, caretGlyph: sessionIcon.caretGlyph },
  { bellBoxPx: 28, caretBoxPx: 16, bellGlyphPx: 22, caretGlyph: '11x16' },
);
/* rev-14 · the audible bell wears the switch's blue (user: "改成图片中的蓝色"). The claim
 * that matters is not "it is blue" but "it is the SAME blue as the settings switch and the
 * volume slider" — so the assertions extract the paint out of all three rules and compare
 * them to each other and to the console surface, instead of trusting a literal.
 * `mergedDecls` walks EVERY rule whose selector list names the selector and merges the
 * declarations (later wins — what the element actually resolves to). A first-match lookup
 * was tried first and let the "fill the muted state as well" mutation through, because the
 * offending rule was a SECOND rule for the same selector; this version catches it.
 *
 * It reads the sheet with every `@media (…){…}` block REMOVED (`mediaBlocks` → `sheetDefault`
 * below): the declarations the element resolves to in the DEFAULT environment. Without that
 * strip a reduced-motion override for the same selector would masquerade as the base rule,
 * because "later wins" would let a rule that only applies under `prefers-reduced-motion`
 * overwrite the plain declaration. Media blocks are asserted separately, on their own text
 * (`mediaBlocks` is exported to this file's later sections for exactly that), so nothing
 * stops being checked.
 */
const mediaBlocks = (query) => {
  const blocks = [];
  let from = 0;
  for (;;) {
    const at = styleText.indexOf(query, from);
    if (at < 0) return blocks;
    let depth = 0;
    let end = -1;
    for (let cursor = styleText.indexOf('{', at); cursor >= 0 && cursor < styleText.length; cursor += 1) {
      if (styleText[cursor] === '{') depth += 1;
      else if (styleText[cursor] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = cursor + 1;
          break;
        }
      }
    }
    if (end < 0) return blocks;
    blocks.push(styleText.slice(at, end));
    from = end;
  }
};
const sheetDefault = mediaBlocks('@media').reduce((text, block) => text.replace(block, ''), styleText);
const mergedDecls = (selector) => {
  const props = {};
  let from = 0;
  for (;;) {
    const at = sheetDefault.indexOf(selector, from);
    if (at < 0) break;
    from = at + selector.length;
    const before = at === 0 ? '' : sheetDefault[at - 1];
    const after = sheetDefault[at + selector.length];
    if (!(before === '' || before === ',' || before === '}' || before === '{')) continue;
    if (!(after === '{' || after === ',')) continue;
    const brace = after === '{' ? at + selector.length : sheetDefault.indexOf('{', at);
    const end = sheetDefault.indexOf('}', brace);
    for (const declaration of sheetDefault.slice(brace + 1, end).split(';')) {
      const colon = declaration.indexOf(':');
      if (colon > 0) props[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
    }
  }
  return props;
};
const switchOn = mergedDecls('.dacSwitch[data-on="true"]');
const sliderRule = mergedDecls('.dacCard input[type=range]');
const bellOn = mergedDecls('.dacBell[data-muted="false"]');
const bellOnHover = mergedDecls('.dacBell[data-muted="false"]:hover');
const bellMuted = mergedDecls('.dacBell[data-muted="true"]');
const bellBase = mergedDecls('.dacBell');
report.equal(
  'the audible bell is filled with the reported paint (rev-14)',
  bellOn['background'] + '|' + bellOn['color'],
  sessionIcon.onBackground + '|' + sessionIcon.onForeground,
);
report.equal('and that paint is the VERY SAME token the settings switch turns on with (rev-14)', switchOn['background'], sessionIcon.onBackground);
report.equal('and the same one the volume slider uses (three rules, one value — rev-14)', sliderRule['accent-color'], sessionIcon.onBackground);
report.equal('the bell glyph is white on that fill, so it stays readable', sessionIcon.onForeground, '#fff');
report.equal(
  'the filled bell has its OWN hover paint, so the generic hover cannot wipe the blue (rev-14)',
  bellOnHover['background'],
  'color-mix(in srgb,' + sessionIcon.onBackground + ' 86%,#000)',
);
report.equal(
  'a MUTED session is NOT filled anywhere in the stylesheet: blue means "this session will ring" (rev-14)',
  bellMuted['background'],
  undefined,
);
report.equal(
  'the muted state keeps the caption-grey glyph it always had (rev-14)',
  bellMuted['color'],
  'var(--dsw-alias-label-caption,#71717a)',
);
report.equal(
  'the fill lives on the audible state, never on the plain button class (rev-14)',
  bellBase['background'],
  'transparent',
);
report.ok(
  'and the paint on that fill is the one the console surface reports, not a copy',
  styleText.includes('.dacBell[data-muted="false"]{background:' + sessionIcon.onBackground + ';color:' + sessionIcon.onForeground + ';}'),
);
report.ok(
  'the bell button is the shipped chip size, not the old 20px (rev-13)',
  styleText.includes(`.dacBell{width:${sessionIcon.bellBoxPx}px;height:${sessionIcon.bellBoxPx}px;}`),
  '.dacBell{' + sessionIcon.bellBoxPx + 'px}',
);
report.ok(
  'the caret is wider than before but the same height as the bell (rev-13)',
  styleText.includes(`.dacCaret{width:${sessionIcon.caretBoxPx}px;height:${sessionIcon.bellBoxPx}px;}`),
  '.dacCaret{' + sessionIcon.caretBoxPx + 'x' + sessionIcon.bellBoxPx + '}',
);
report.equal('the bell button matches the height a shipped header chip uses (28px)', sessionIcon.bellBoxPx, 28);
report.ok(
  'the bell and its caret are separated by the reported gap, not flush (rev-16)',
  styleText.includes(
    '.dacBellWrap{position:relative;display:inline-flex;align-items:center;gap:' + sessionIcon.bellGapPx + 'px;}',
  ),
  '.dacBellWrap{gap:' + sessionIcon.bellGapPx + 'px}',
);
report.equal(
  'the gap is the host\'s own inter-chip rhythm, not the pre-rev-16 flush cluster',
  sessionIcon.bellGapPx,
  6,
);
const bellGlyphs = collect(loudView.tree, (node) => node.type === 'svg' && Number(node.props?.width) === sessionIcon.bellGlyphPx);
report.equal(
  'the bell is drawn at the reported glyph size, not at the old 14px',
  bellGlyphs.length >= 1 && bellGlyphs[0]?.props?.height === sessionIcon.bellGlyphPx,
  true,
);
report.ok(
  'and that glyph is materially bigger than rev-12\'s 14px, so it reads as a control (rev-13)',
  sessionIcon.bellGlyphPx >= 20 && sessionIcon.bellGlyphPx > 14 * 1.4,
  sessionIcon.bellGlyphPx + 'px vs 14px (rev-12) = ' + (sessionIcon.bellGlyphPx / 14).toFixed(2) + 'x',
);
const caretGlyphs = collect(loudView.tree, (node) => node.type === 'svg' && String(node.props?.width) + 'x' + String(node.props?.height) === sessionIcon.caretGlyph);
report.equal('the caret chevron is drawn at the reported size (rev-13)', caretGlyphs.length, 1);
report.ok(
  'the hover pill was rounded up with the box (8px, so a 28px box reads as a chip)',
  styleText.includes('cursor:pointer;border-radius:8px;line-height:0;}'),
);

/* rev-17 · the caret TURNS while the popover is open. The failure these assertions exist to
 * catch is not "the angle is wrong" but "the wrong box turned": `.dacCaret` is a 16×28
 * button that has to line up with the 28px bell beside it, and a 90° turn of THAT box swaps
 * it to 28×16, so the tall hover chip would become a wide bar under the pointer. The turn is
 * therefore read off `.dacCaret svg`, the button's own box is checked to be untouched in
 * BOTH states, and the turned glyph's footprint is compared against the box it must fit in.
 * Both numbers are compared against the console surface rather than against a hand-written
 * second copy, so the stylesheet and `sessionIcon` cannot drift apart. */
const caretGlyphRule = mergedDecls('.dacCaret svg');
const caretOpenGlyphRule = mergedDecls('.dacCaret[data-open="true"] svg');
const caretButtonRule = mergedDecls('.dacCaret');
const caretOpenButtonRule = mergedDecls('.dacCaret[data-open="true"]');
const caretGlyphPx = sessionIcon.caretGlyph.split('x').map((part) => Number(part));
report.equal(
  'the caret glyph carries the quarter turn in the open state, at the reported angle (rev-17)',
  caretOpenGlyphRule['transform'],
  'rotate(' + sessionIcon.caretOpenRotateDeg + 'deg)',
);
report.equal(
  'and the closed state is untransformed — the turn is a state, not a base style (rev-17)',
  caretGlyphRule['transform'],
  undefined,
);
report.equal(
  'the turn is animated by the reported duration and curve, so CSS and console cannot disagree (rev-17)',
  caretGlyphRule['transition'],
  'transform ' + sessionIcon.caretRotateMs + 'ms ease',
);
report.equal('the angle is the quarter turn the user asked for (rev-17)', sessionIcon.caretOpenRotateDeg, 90);
/* rev-20 · the duration moved 400 ms → 160 ms, and this round also records WHY no
 * duration was ever played: the caret's own reduced-motion override deleted the transition on the
 * reporting device, so rev-18's 300 ms and rev-19's 400 ms both arrived as the same instant
 * cut. What is pinned below is the SHIPPED number, and that the stylesheet still CONCATENATES
 * it from the constant — a hand-copied `160ms` would satisfy "the value is 160" while
 * quietly re-introducing the second copy the constant exists to prevent.
 *
 * WHAT THESE ASSERTIONS CANNOT CLAIM: that any duration makes the turn perceivable. That is an
 * EXPECTATION — a judgment, not a device measurement — so every check name below states only a
 * measurable fact (the shipped value, the curve, the angle, the box), and the note beside the
 * constant is the only place the expectation is written down. Whether the turn is perceivable is
 * settled by the user on their own hardware and by nothing in this file; r18c/t7 renamed the
 * assertion whose name used to assert otherwise, and r20/t1 changed no assertion into a claim
 * about perception. */
report.equal(
  'the duration is the rev-20 one: 160 ms, the value this round shipped (rev-20)',
  sessionIcon.caretRotateMs,
  160,
);
report.ok(
  'and the stylesheet builds that duration from the constant instead of copying a number (rev-20)',
  source.includes("'.dacCaret svg{transition:transform ' + String(CARET_ROTATE_MS) + 'ms ease;}'"),
  "'.dacCaret svg{transition:transform ' + String(CARET_ROTATE_MS) + 'ms ease;}'",
);
report.equal(
  'so exactly ONE caret transition rule exists, with no stale 400 ms copy beside it (rev-20)',
  (styleText.match(/\.dacCaret svg\{transition:transform \d+ms ease;\}/g) ?? []).length,
  1,
);
report.ok(
  'the turn is centred on the glyph, so it points down instead of swinging towards an edge (rev-17)',
  caretGlyphRule['transform-origin'] === 'center',
  String(caretGlyphRule['transform-origin']),
);
report.ok(
  'the BUTTON is never rotated — no transform on .dacCaret in either state (rev-17)',
  caretButtonRule['transform'] === undefined && caretOpenButtonRule['transform'] === undefined,
  'closed=' + String(caretButtonRule['transform']) + ', open=' + String(caretOpenButtonRule['transform']),
);
report.ok(
  'so the button keeps the exact caretBoxPx×bellBoxPx box the turn must not touch (rev-17)',
  caretButtonRule['width'] === sessionIcon.caretBoxPx + 'px'
    && caretButtonRule['height'] === sessionIcon.bellBoxPx + 'px'
    && sessionIcon.caretBoxPx === 16
    && sessionIcon.bellBoxPx === 28,
  '.dacCaret{' + String(caretButtonRule['width']) + ' × ' + String(caretButtonRule['height']) + '}',
);
report.ok(
  'and the turned glyph (11×16 rotated into 16×11) still fits inside that button (rev-17)',
  caretGlyphPx[1] <= sessionIcon.caretBoxPx && caretGlyphPx[0] <= sessionIcon.bellBoxPx,
  sessionIcon.caretGlyph + ' turned = ' + caretGlyphPx[1] + '×' + caretGlyphPx[0] + ' inside ' + sessionIcon.caretBoxPx + '×' + sessionIcon.bellBoxPx,
);
const caretButton = byClass(loudView.tree, 'dacCaret')[0];
const caretButtonSvg = caretButton?.children?.[0];
report.ok(
  'the rotated element is the <svg> INSIDE the button, and no inline transform is used at all (rev-17)',
  caretButton?.props?.className === 'dacCaret'
    && caretButtonSvg?.type === 'svg'
    && caretButton?.props?.style === undefined
    && caretButtonSvg?.props?.style === undefined,
  'children=' + JSON.stringify((caretButton?.children ?? []).map((child) => child?.type)),
);
/* rev-20 · the override is GONE. rev-17 shipped a reduced-motion block that removed the caret's
 * transition for readers who ask for no motion, and rev-18 and rev-19 raised the duration twice while
 * that block silently deleted it on the reporting user's machine — which is why no duration ever
 * showed up there. Both it and the switch's sibling block are deleted, so the caret turn takes
 * `sessionIcon.caretRotateMs` in EVERY environment. These three checks state that as a measurable
 * fact instead of pinning a block that no longer exists. */
report.equal(
  'no reduced-motion rule is emitted for the caret any more (rev-20)',
  mediaBlocks('@media (prefers-reduced-motion').length,
  0,
);
report.ok(
  'and the product itself carries no `@media (prefers-reduced-motion` block at all, so nothing can damp the turn (rev-20)',
  (String(source).match(/@media \(prefers-reduced-motion/g) ?? []).length === 0,
  'occurrences in lib/client.js=' + String((String(source).match(/@media \(prefers-reduced-motion/g) ?? []).length),
);
report.ok(
  'so the caret keeps its ONE transition in every environment, whatever the platform prefers (rev-20)',
  styleText.includes('.dacCaret svg{transition:transform ' + sessionIcon.caretRotateMs + 'ms ease;}')
    && !styleText.includes('prefers-reduced-motion'),
  'transition=' + String(sessionIcon.caretRotateMs) + 'ms, reduced-motion text in the sheet=' + styleText.includes('prefers-reduced-motion'),
);
report.ok(
  'and the 90° terminal state really is outside it, spelled from the two reported constants (rev-17)',
  styleText.includes('.dacCaret[data-open="true"] svg{transform:rotate(' + sessionIcon.caretOpenRotateDeg + 'deg);}')
    && styleText.includes('.dacCaret svg{transition:transform ' + sessionIcon.caretRotateMs + 'ms ease;}'),
  'rotate(' + sessionIcon.caretOpenRotateDeg + 'deg) / ' + sessionIcon.caretRotateMs + 'ms ease',
);

/* rev-24 · the bell's MOTION IS GONE; the MUTE is drawn instead (user requests, in order: "不要晃动，静音时
 * 把斜杠重左上拉到右下的动画", "关闭静音的时候斜杠从左上到右下动画两个动画时长一样", "斜杠的图层是在铃铛上面
 * 的", "蓝色的部分也弄个逐渐变暗到消失的动画"). rev-23's tilt is DELETED, not toned down: no transform, no
 * transform-origin and no animation on the glyph or on the button, in any state.
 *
 * That deletion is the load-bearing half of this section. "The bell does not move" is exactly the property a
 * later edit breaks by re-adding a keyframe nobody asked for, so it is asserted as an ABSENCE — on the
 * declarations, on the generated sheet, on the rendered tree, and on the SOURCE, where a dead identifier
 * left in a comment is how the next reader concludes the code still owns a motion that is gone.
 *
 * What replaced it: the slash's STROKE is drawn from its top-left end to its bottom-right end by animating
 * `stroke-dashoffset` from the diagonal's own length to 0, while the blue fill dims and returns on the same
 * clock. Four things must hold together, and none of them is asserted from a literal the bundle does not
 * also build from:
 *
 *   1. the console surface reports the duration and the drawn length;
 *   2. the stylesheet ARMS all four halves from exactly those numbers, in the sheet with NO media condition
 *      — rev-20's standing trade-off, restated for a new animation rather than quietly weakened;
 *   3. the generated @keyframes text carries the same geometry, and BOTH keyframes animate `opacity`:
 *      without that track a finished sweep would fall back to the resting rule with the dash parked on its
 *      end point, i.e. the bottom-right DOT the user reported ("为什么右下角有个点");
 *   4. the resting AUDIBLE state carries zero visible ink. `stroke-dasharray` with a single value repeats
 *      every 2·LEN, so no dash offset can be parked clear of BOTH ends of a path whose length IS the dash
 *      length — LEN lands a round cap on the far end (the dot) and LEN+margin drags the next repetition in
 *      at the near end ("现在是左上角有个线"). Hence `opacity`, which no dash geometry can defeat.
 *
 * PAINT ORDER is asserted too, because SVG has no z-index: the slash is pushed into the paths array BEFORE
 * the bell and its clapper, so those later siblings paint over the stroke (user report: "斜杠的图层是在铃铛
 * 上面的").
 *
 * The render half runs on its OWN bundle instances, so the clicks below cannot shift the order of the writes
 * that later sections read back by index.
 *
 * WHAT THIS CANNOT PROVE: that a browser's React runtime really replaces the node and replays the animation,
 * or that the frames LOOK right. This harness's React stub keeps `key` in `props` and re-invokes the
 * component on every render, so all it can show is that the counter is wired to the glyph's key, that the
 * animation is armed, and that the numbers agree. Frames need a browser engine, and that probe cannot run
 * here. */
report.section('rev-24 · muting draws the slash and never moves the bell');
const DRAW_EASE_TEXT = 'cubic-bezier(0.22,1,0.36,1)';
const SWEEP_EASE_TEXT = 'cubic-bezier(0.42,0,0.58,1)';
const muteInstance = instantiate({ fetch: sessionsFetch({}).fetch });
await settle();
const muteComponent = entryFor(muteInstance, 'conversation.session.header.actions').component;
const muteView = createRenderer(muteInstance.sandbox.react, muteComponent, { sessionId: 'session-mute' });
muteView.render();
muteView.runEffects();
const muteBell = () => byClass(muteView.tree, 'dacBell')[0];
const muteGlyph = () => muteBell()?.children?.[0];
const pathKeys = () => (muteGlyph()?.children ?? []).map((node) => String(node?.props?.key ?? ''));

report.equal('the console surface reports the mute gesture duration (rev-24)', sessionIcon.bellMuteMs, 240);
report.equal('and the drawn length of the diagonal that stroke travels (rev-24)', sessionIcon.bellSlashLen, 15.27);

/* 1 · THE BELL DOES NOT MOVE — asserted as an absence in every place the motion could come back. */
report.equal('the glyph carries no animation in any state (rev-24)', mergedDecls('.dacBell svg')['animation'], undefined);
report.equal('no transform on the glyph either (rev-24)', mergedDecls('.dacBell svg')['transform'], undefined);
report.equal(
  'and no transform-origin: the pivot rev-23 argued about left with the motion (rev-24)',
  mergedDecls('.dacBell svg')['transform-origin'],
  undefined,
);
report.equal(
  'the 28px button that carries the hover pill is motionless too (rev-24)',
  mergedDecls('.dacBell')['animation'],
  undefined,
);
report.equal(
  'no armed-glyph rule survives — [data-draw] arms the SLASH, never the glyph (rev-24)',
  mergedDecls('.dacBell[data-draw="true"] svg')['animation'],
  undefined,
);
report.ok(
  'the sheet carries no tilt keyframes and no tilt attribute at all (rev-24)',
  !styleText.includes('@keyframes dacBellTilt') && !styleText.includes('data-tilt'),
  'keyframes=' + String(styleText.includes('@keyframes dacBellTilt')) + ' data-tilt=' + String(styleText.includes('data-tilt')),
);
report.deepEqual(
  'and no dead name from the two rejected motions survives in the bundle, comments included (rev-24)',
  ['BELL_TILT', 'data-tilt', 'bellTilt', 'dacBellTilt', 'BELL_SLASH_MS'].filter((name) => source.includes(name)),
  [],
);

/* 2 · all four halves are armed from the console surface's own numbers, in the unconditioned sheet. */
report.equal(
  'the stylesheet arms the DRAW from those numbers (rev-24)',
  mergedDecls('.dacBell[data-draw="true"][data-muted="true"] .dacSlash')['animation'],
  'dacSlashDraw ' + sessionIcon.bellMuteMs + 'ms ' + DRAW_EASE_TEXT,
);
report.equal(
  'and the SWEEP from the SAME duration — "两个动画时长一样" holds by construction (rev-24)',
  mergedDecls('.dacBell[data-draw="true"][data-muted="false"] .dacSlash')['animation'],
  'dacSlashSweep ' + sessionIcon.bellMuteMs + 'ms ' + SWEEP_EASE_TEXT + ' forwards',
);
report.equal(
  'the fill dims on the same clock, on the button rather than on the glyph (rev-24)',
  mergedDecls('.dacBell[data-draw="true"][data-muted="true"]')['animation'],
  'dacBellDim ' + sessionIcon.bellMuteMs + 'ms ' + SWEEP_EASE_TEXT,
);
report.equal(
  'and comes back on the same clock in the other direction (rev-24)',
  mergedDecls('.dacBell[data-draw="true"][data-muted="false"]')['animation'],
  'dacBellGlow ' + sessionIcon.bellMuteMs + 'ms ' + DRAW_EASE_TEXT,
);
report.ok(
  'the slash and the fill SWAP curves between the two directions, so one eases out while the other eases in and out (rev-24)',
  String(mergedDecls('.dacBell[data-draw="true"][data-muted="true"] .dacSlash')['animation']).includes(DRAW_EASE_TEXT)
    && String(mergedDecls('.dacBell[data-draw="true"][data-muted="true"]')['animation']).includes(SWEEP_EASE_TEXT)
    && String(mergedDecls('.dacBell[data-draw="true"][data-muted="false"] .dacSlash')['animation']).includes(SWEEP_EASE_TEXT)
    && String(mergedDecls('.dacBell[data-draw="true"][data-muted="false"]')['animation']).includes(DRAW_EASE_TEXT),
  'in=' + String(mergedDecls('.dacBell[data-draw="true"][data-muted="true"] .dacSlash')['animation'])
    + ' out=' + String(mergedDecls('.dacBell[data-draw="true"][data-muted="false"] .dacSlash')['animation']),
);
const curveNumbers = (text) => String(text).match(/cubic-bezier\(([^)]+)\)/)[1].split(',').map(Number);
/* Rounded to the 2 decimals the curves are written in: 1 − 0.58 is 0.42000000000000004 in binary
 * floating point, and a curve that is its own mirror must compare EQUAL, not nearly equal. */
const timeMirror = (curve) => [1 - curve[2], 1 - curve[3], 1 - curve[0], 1 - curve[1]].map((value) => Math.round(value * 100) / 100);
report.deepEqual(
  'the sweep curve is its OWN time-reverse, which is the math the note beside it claims (rev-24)',
  timeMirror(curveNumbers(SWEEP_EASE_TEXT)),
  curveNumbers(SWEEP_EASE_TEXT),
);
report.ok(
  'and the draw curve deliberately is NOT, so neither direction is a copy of the other (rev-24)',
  JSON.stringify(timeMirror(curveNumbers(DRAW_EASE_TEXT))) !== JSON.stringify(curveNumbers(DRAW_EASE_TEXT)),
  'mirror=' + timeMirror(curveNumbers(DRAW_EASE_TEXT)).join(','),
);

/* 3 · the generated frames carry the same geometry, and neither direction can leave a dot behind. */
/* Balanced on purpose: `(.*?)\}\}` would stop at the keyframes' own closing brace and hand back a `to{}`
 * block missing its last character, which reads as a product defect in the failure output. */
const slashDrawKeyframes = styleText.match(/@keyframes dacSlashDraw\{(from\{[^}]*\}to\{[^}]*\})\}/);
const slashSweepKeyframes = styleText.match(/@keyframes dacSlashSweep\{(from\{[^}]*\}to\{[^}]*\})\}/);
report.equal(
  'the draw and the sweep are both generated into the stylesheet (rev-24)',
  slashDrawKeyframes !== null && slashSweepKeyframes !== null,
  true,
);
report.equal(
  'the draw starts fully offset — no ink anywhere — and ends fully drawn and visible (rev-24)',
  slashDrawKeyframes?.[1],
  'from{stroke-dashoffset:' + String(sessionIcon.bellSlashLen) + ';opacity:0;}to{stroke-dashoffset:0;opacity:1;}',
);
report.equal(
  'the sweep is its inverse, spelled from the SAME length, and ends invisible (rev-24)',
  slashSweepKeyframes?.[1],
  'from{stroke-dashoffset:0;opacity:1;}to{stroke-dashoffset:-' + String(sessionIcon.bellSlashLen) + ';opacity:0;}',
);
report.equal(
  'BOTH frames of BOTH keyframes animate opacity — that track hides the ink, not the dash (rev-24)',
  (String(slashDrawKeyframes?.[1]) + String(slashSweepKeyframes?.[1])).match(/opacity:/g)?.length,
  4,
);
report.equal(
  'and the fill has its two generated directions as well (rev-24)',
  styleText.includes('@keyframes dacBellDim{') && styleText.includes('@keyframes dacBellGlow{'),
  true,
);
report.ok(
  'neither fill direction holds its end state with forwards — its end state IS the resting rule, and a held fill would out-rank :hover (rev-24)',
  !String(mergedDecls('.dacBell[data-draw="true"][data-muted="true"]')['animation']).includes('forwards')
    && !String(mergedDecls('.dacBell[data-draw="true"][data-muted="false"]')['animation']).includes('forwards'),
  'dim=' + String(mergedDecls('.dacBell[data-draw="true"][data-muted="true"]')['animation'])
    + ' glow=' + String(mergedDecls('.dacBell[data-draw="true"][data-muted="false"]')['animation']),
);
report.ok(
  'while the SWEEP alone fills forwards, or the finished slash would snap back to fully drawn (rev-24)',
  String(mergedDecls('.dacBell[data-draw="true"][data-muted="false"] .dacSlash')['animation']).includes('forwards'),
  String(mergedDecls('.dacBell[data-draw="true"][data-muted="false"] .dacSlash')['animation']),
);

/* 4 · the resting audible state draws NOTHING, and that lives in the base rule rather than an override. */
report.equal(
  'the slash rests fully drawn and invisible — the state a sweep needs an element for (rev-24)',
  mergedDecls('.dacSlash')['stroke-dashoffset'] + '|' + mergedDecls('.dacSlash')['opacity'],
  '0|0',
);
report.equal(
  'its dash length IS the diagonal, from the one constant the path and the sheet both read (rev-24)',
  mergedDecls('.dacSlash')['stroke-dasharray'],
  String(sessionIcon.bellSlashLen),
);
report.equal(
  'the muted state lifts the opacity, and that is the whole of "drawn" (rev-24)',
  mergedDecls('.dacBell[data-muted="true"] .dacSlash')['opacity'],
  '1',
);
report.ok(
  'there is NO audible-state slash rule at all — hiding lives in the base rule (rev-24)',
  !sheetDefault.includes('.dacBell[data-muted="false"] .dacSlash'),
  'override=' + String(sheetDefault.includes('.dacBell[data-muted="false"] .dacSlash')),
);

/* 5 · ONE declaration each, so the four halves and the geometry cannot drift apart. */
report.equal(
  'exactly one declaration of the gesture duration (rev-24)',
  (source.match(/var BELL_MUTE_MS = \d+;/g) ?? []).length,
  1,
);
report.equal(
  'and exactly one of the drawn length (rev-24)',
  (source.match(/var BELL_SLASH_LEN = /g) ?? []).length,
  1,
);

/* 6 · paint order: the stroke is pushed FIRST, so the bell's silhouette covers it. */
report.ok(
  'in the SOURCE the slash is pushed before the bell and the clapper (rev-24)',
  source.indexOf("key: 'slash'") >= 0 && source.indexOf("key: 'bell'") > source.indexOf("key: 'slash'"),
  'slash@' + String(source.indexOf("key: 'slash'")) + ' bell@' + String(source.indexOf("key: 'bell'")),
);

/* 7 · the render: a silent first paint, then one click arms exactly one draw. */
report.equal(
  'the first paint is SILENT — the bell has not been clicked, so nothing is armed (rev-24)',
  muteBell()?.props?.['data-draw'],
  'false',
);
report.equal('and its glyph is keyed on the zero counter (rev-24)', String(muteGlyph()?.props?.key ?? ''), 'glyph0');
report.deepEqual(
  'an audible bell that was never toggled carries NO slash node — the two paths the rev-10 icon contract describes (rev-24)',
  pathKeys(),
  ['bell', 'clapper'],
);
muteBell().props.onClick({});
await settle();
muteView.render();
report.deepEqual(
  'the click arms the draw AND flips the session to muted (rev-24)',
  [String(byClass(muteView.tree, 'dacBell')[0]?.props?.['data-draw']), String(byClass(muteView.tree, 'dacBell')[0]?.props?.['data-muted'])],
  ['true', 'true'],
);
report.equal(
  'the glyph is re-keyed, which is the replacement that replays the animation (rev-24)',
  String(byClass(muteView.tree, 'dacBell')[0]?.children?.[0]?.props?.key ?? ''),
  'glyph1',
);
report.deepEqual(
  'and the stroke is now the FIRST of three paths, so the bell paints over it (rev-24)',
  pathKeys(),
  ['slash', 'bell', 'clapper'],
);

/* 8 · a page that LOADS already muted shows the stroke already drawn, with nothing armed. */
const preMutedInstance = instantiate({ fetch: sessionsFetch({ 'session-pre-muted': { enabled: false } }).fetch });
await settle();
const preMutedComponent = entryFor(preMutedInstance, 'conversation.session.header.actions').component;
const preMutedView = createRenderer(preMutedInstance.sandbox.react, preMutedComponent, { sessionId: 'session-pre-muted' });
preMutedView.render();
preMutedView.runEffects();
await settle();
preMutedView.render();
const preMutedBell = () => byClass(preMutedView.tree, 'dacBell')[0];
report.equal(
  'a session muted by its own record is drawn struck through (rev-24)',
  byClass(preMutedView.tree, 'dacSlash').length,
  1,
);
report.deepEqual(
  'with the animation NOT armed and the glyph on the zero counter, so nothing draws itself at the reader (rev-24)',
  [
    String(preMutedBell()?.props?.['data-draw']),
    String(preMutedBell()?.props?.['data-muted']),
    String(preMutedBell()?.children?.[0]?.props?.key ?? ''),
  ],
  ['false', 'true', 'glyph0'],
);

/* rev-18 · the reduce-motion diagnostic, re-scoped by rev-20. It used to be the second half of
 * the "an arrow that jumps has TWO causes" story: the turn was too fast to see, or the environment
 * asked for reduced motion and the media block then removed the transition BY DESIGN. rev-20 deleted
 * that block — the environment had been deleting the turn on the reporting device all along — so the
 * diagnostic is now an ENVIRONMENT REPORT: it still answers the live media query on every call, and
 * nothing in the bundle branches on the answer any more. The three stubs below are the three answers a
 * real page can give — reduce, no preference, and no `matchMedia` at all (which is what this repo's own
 * headless platform looks like, so it is the branch most likely to be hit accidentally and must not
 * throw). */
report.section('rev-18 · reduceMotion() reports the environment (re-scoped by rev-20: nothing branches on it)');
report.equal(
  'the diagnostic is a top-level function, not a boolean snapshot (rev-18)',
  typeof bundle.diagnostics.reduceMotion,
  'function',
);
report.equal(
  'and it is NOT a member of the geometry snapshot (sessionIcon carries the motion CONSTANTS but never the media-query answer) (rev-18)',
  Object.prototype.hasOwnProperty.call(sessionIcon, 'reduceMotion'),
  false,
);

const noMediaInstance = instantiate();
report.equal(
  'the stub platform really has no matchMedia, so the no-support case is honest (rev-18)',
  typeof noMediaInstance.sandbox.context.window.matchMedia,
  'undefined',
);
report.equal(
  'no matchMedia at all answers false instead of throwing (rev-18)',
  noMediaInstance.diagnostics.reduceMotion(),
  false,
);

const calmMediaInstance = instantiate();
calmMediaInstance.sandbox.context.window.matchMedia = (query) => ({ media: query, matches: false });
report.equal(
  'matchMedia reporting no preference answers false (rev-18)',
  calmMediaInstance.diagnostics.reduceMotion(),
  false,
);

const reducedMediaInstance = instantiate();
const askedMotionQueries = [];
reducedMediaInstance.sandbox.context.window.matchMedia = (query) => {
  askedMotionQueries.push(query);
  return { media: query, matches: query === '(prefers-reduced-motion: reduce)' };
};
report.equal(
  'matchMedia reporting reduce answers true (rev-18)',
  reducedMediaInstance.diagnostics.reduceMotion(),
  true,
);
report.deepEqual(
  'and the query it asked is exactly the reduced-motion one (rev-18)',
  askedMotionQueries,
  ['(prefers-reduced-motion: reduce)'],
);

const liveMediaInstance = instantiate();
liveMediaInstance.sandbox.context.window.matchMedia = () => ({ matches: false });
const motionBeforeFlip = liveMediaInstance.diagnostics.reduceMotion();
liveMediaInstance.sandbox.context.window.matchMedia = () => ({ matches: true });
const motionAfterFlip = liveMediaInstance.diagnostics.reduceMotion();
report.ok(
  'the answer is re-read on EVERY call, so a setting flipped mid-session is seen (rev-18)',
  motionBeforeFlip === false && motionAfterFlip === true,
  motionBeforeFlip + ' → ' + motionAfterFlip,
);

const hostileMediaInstance = instantiate();
hostileMediaInstance.sandbox.context.window.matchMedia = () => {
  throw new Error('matchMedia blocked');
};
let hostileMotionAnswer = null;
let hostileMotionThrew = null;
try {
  hostileMotionAnswer = hostileMediaInstance.diagnostics.reduceMotion();
} catch (error) {
  hostileMotionThrew = error.message;
}
report.ok(
  'a matchMedia that THROWS is caught and answers false, rather than breaking the page (rev-18)',
  hostileMotionThrew === null && hostileMotionAnswer === false,
  hostileMotionThrew === null ? String(hostileMotionAnswer) : 'threw: ' + hostileMotionThrew,
);

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
/* rev-17 · the turn is driven by the hook the render tree ALREADY had: no angle is computed
 * in JS, and the element that turns is still the <svg> child — never the button box. */
const openCaret = byClass(popView.tree, 'dacCaret')[0];
const openCaretSvg = openCaret?.children?.[0];
report.ok(
  'the open caret turns its glyph off that same [data-open="true"] hook — no angle is computed in JS (rev-17)',
  openCaret?.props?.['data-open'] === 'true'
    && openCaret?.props?.['aria-expanded'] === true
    && openCaretSvg?.type === 'svg'
    && openCaret?.props?.style === undefined
    && openCaretSvg?.props?.style === undefined,
  'data-open=' + String(openCaret?.props?.['data-open']) + ', child=' + String(openCaretSvg?.type),
);
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
report.ok(
  'and the caret drops back to the untransformed state the CSS names [data-open="false"] (rev-17)',
  byClass(popView.tree, 'dacCaret')[0]?.props?.['data-open'] === 'false'
    && byClass(popView.tree, 'dacCaret')[0]?.children?.[0]?.type === 'svg'
    && byClass(popView.tree, 'dacCaret')[0]?.props?.style === undefined,
  'data-open=' + String(byClass(popView.tree, 'dacCaret')[0]?.props?.['data-open']),
);
byClass(popView.tree, 'dacCaret')[0].props.onClick({});
popView.render();
popView.runEffects();
report.equal('the popover can be reopened', byClass(popView.tree, 'dacPop').length, 1);

// The two refs, in hook order: the wrapper (what the popover anchors to) and the caret.
const popRefs = popView.hooks.filter((hook) => hook !== null && typeof hook === 'object' && 'current' in hook);
report.equal('the component keeps a wrapper ref and a caret ref', popRefs.length, 2);

/* rev-12 hands the tone list to the browser's customizable-select rendering, which makes
 * the options real DOM inside the select — so a press on one of them is an INSIDE press
 * for the dismissal handler. The suite only covered Escape and outside presses before;
 * if "inside" ever stopped keeping the panel open, picking a tone would close the popover
 * before the change event could reach the select and the choice would be lost. */
popRefs[0].current = { contains: () => true, getBoundingClientRect: () => ({ left: 300, top: 40, right: 320, bottom: 60 }) };
report.equal('the popover renders its option list inside its own subtree (rev-12)', collect(popover(), (node) => node.type === 'option').length, 4);
popInstance.sandbox.document.fire('pointerdown', { target: { tagName: 'OPTION' } });
popView.render();
report.equal('a press on the tone list counts as INSIDE and leaves the popover open (rev-12)', byClass(popView.tree, 'dacPop').length, 1);
popRefs[0].current = { contains: () => false, getBoundingClientRect: () => ({ left: 300, top: 40, right: 320, bottom: 60 }) };
popInstance.sandbox.document.fire('pointerdown', { target: { tagName: 'BODY' } });
popView.render();
report.equal('an outside pointer press closes it', byClass(popView.tree, 'dacPop').length, 0);

popInstance.sandbox.context.window.innerWidth = 1000;
popInstance.sandbox.context.window.innerHeight = 800;
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

/* ========= 5j. rev-15 · a failed convergence re-read keeps the mutes (OBS-A) ======= */

report.section('rev-15 · a failed convergence re-read keeps the mutes (OBS-A)');

/* OBS-A: rev-11 made every settled write re-read the table, and that re-read used to
 * degrade the local copy to "no overrides" whenever it failed — the local table is what
 * holds the user's own mutes, so ONE transient failure put a silenced session back on the
 * global switch, and it rang. The failure-path claims below are RED on the pre-fix bytes
 * (measured against the verbatim rev-14 copy: 11 of them, plus the revision stamp). The
 * rest of the block pins what the fix must NOT change — the error row, one read per settle,
 * the popover, the counters — and is therefore green on both sides by construction. The
 * table is compared field by field across the failure, the silenced session is re-triggered
 * afterwards, and the failure reason has to reach the popover's EXISTING error row. */
const obsAStore = flakyReadStore({ 'obs-a-keep': { tone: 'bell', updatedAt: 4 } });
const obsA = instantiate({ fetch: obsAStore.fetch });
await settle();
const obsAView = createRenderer(obsA.sandbox.react, entryFor(obsA, 'conversation.session.header.actions').component, { sessionId: 'obs-a' });
obsAView.render();
obsAView.runEffects();
report.equal('the mount read landed — it is the RE-read that will break', obsA.diagnostics.sessions().ready, true);
report.equal('one read before any write', obsAStore.reads(), 1);
report.deepEqual('and the table is the Host file', obsA.diagnostics.sessions().sessions, obsAStore.snapshot());

// Ring once while the session is still audible, so the silence asserted further down is a
// CHANGE and not a tautology.
obsA.harness.pushPending([['obs-a', approvalInteraction('approval:obs-a-1')]]);
await settle();
report.equal('an approval for the audible session rings', obsA.diagnostics.stats().triggers, 1);
const nodesWhileAudible = obsA.record.oscillators.length;
report.check('and it really built audio nodes', nodesWhileAudible > 0, `${nodesWhileAudible} oscillator(s)`);

// The user mutes THIS session. The write lands; the convergence re-read that follows does not.
// The hook records the LOCAL table in the instant that failing read is issued — the "before"
// side of the comparison, taken from the bundle itself rather than assumed to equal the store.
let tableWhenReadFailed = null;
obsAStore.onRead = () => {
  if (tableWhenReadFailed === null) tableWhenReadFailed = obsA.diagnostics.sessions().sessions;
};
obsAStore.breakWith('http-error');
const obsAMute = obsA.diagnostics.toggleSession('obs-a');
report.equal('the write lands and the promise still resolves false (never a rejection)', await obsAMute, false);
await settle();
obsAStore.onRead = null;
const afterFailure = obsA.diagnostics.sessions();
report.equal('the POST carried the mute to the Host', JSON.parse(obsAStore.posts()[0]?.options?.body ?? 'null').patch.enabled, false);
report.equal('so the Host file holds the mute', obsAStore.snapshot()['obs-a']?.enabled, false);
report.equal('the failed re-read happened exactly once — a settle never retries', obsAStore.reads(), 2);
report.deepEqual('OBS-A: the failed re-read did NOT drop the local table', afterFailure.sessions, obsAStore.snapshot());
report.deepEqual('the table is the table from BEFORE the failure (observed on the bundle, not assumed)', afterFailure.sessions, tableWhenReadFailed);
report.deepEqual('field-for-field, order-independent — not just the same JSON text', fieldWise(afterFailure.sessions), fieldWise(tableWhenReadFailed));
report.equal('the mute the user made is still there', afterFailure.sessions['obs-a']?.enabled, false);
report.equal('the other session keeps its untouched override', afterFailure.sessions['obs-a-keep']?.tone, 'bell');
report.equal('ready is not rolled back either — the table is still known', afterFailure.ready, true);
report.equal('nor is the revision', afterFailure.revision, 1);
report.ok('the failure reason is on the error line', String(afterFailure.error).includes('the store is unreachable'), afterFailure.error);
obsAView.render();
report.equal('the bell still reads as muted (the click was not undone)', byClass(obsAView.tree, 'dacBell')[0]?.props?.['data-muted'], 'true');

byClass(obsAView.tree, 'dacCaret')[0].props.onClick({});
obsAView.render();
obsAView.runEffects();
report.equal('the popover opens', byClass(obsAView.tree, 'dacPop').length, 1);
report.equal('the reason shows in the error row the popover already had', byClass(obsAView.tree, 'dacPopError').length, 1);
report.ok(
  'carrying the reason, not a bare label',
  flattenText(byClass(obsAView.tree, 'dacPop')[0]).includes('the store is unreachable'),
  flattenText(byClass(obsAView.tree, 'dacPop')[0]).slice(0, 240),
);

// THE POINT OF OBS-A: a muted session must not ring because a read failed.
const suppressedBeforeRetrigger = obsA.diagnostics.stats().suppressedSession;
const nodesBeforeRetrigger = obsA.record.oscillators.length;
obsA.harness.pushPending([['obs-a', approvalInteraction('approval:obs-a-2')]]);
await settle();
report.equal('a NEW approval for the still-muted session does not ring', obsA.diagnostics.stats().triggers, 1);
report.equal('no audio node was built for it', obsA.record.oscillators.length, nodesBeforeRetrigger);
report.equal('it counts as a per-session mute', obsA.diagnostics.stats().suppressedSession, suppressedBeforeRetrigger + 1);
report.equal('the global switch was never the reason', obsA.diagnostics.stats().suppressedDisabled, 0);

// The other failure shape: the socket itself dies (the promise rejects instead of answering).
obsAStore.breakWith('reject');
report.equal('a rejected re-read reports false too', await obsA.diagnostics.refreshSessions(), false);
await settle();
report.deepEqual('a rejected re-read also keeps the whole table', obsA.diagnostics.sessions().sessions, obsAStore.snapshot());
report.ok('with its own reason on the error line', String(obsA.diagnostics.sessions().error).includes('network down'), obsA.diagnostics.sessions().error);

// Convergence is still convergence: the next read that LANDS sets the table to the file.
obsAStore.heal();
report.equal('a later read lands again', await obsA.diagnostics.refreshSessions(), true);
await settle();
report.deepEqual('and the table converges onto the Host file', obsA.diagnostics.sessions().sessions, obsAStore.snapshot());
report.equal('the error line is gone once a read succeeds', obsA.diagnostics.sessions().error, '');
report.equal('the mute the user set is still in place', obsA.diagnostics.sessionSettings('obs-a').enabled, false);
obsAView.render();
report.equal('so the popover carries no error row any more', byClass(obsAView.tree, 'dacPopError').length, 0);
report.equal('four reads in total: mount, convergence, one broken manual read, one recovery', obsAStore.reads(), 4);
report.ok('neither failure produced an unhandled rejection', rejections.seen.length === 0, rejections.seen.map(String).join(' | '));

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
