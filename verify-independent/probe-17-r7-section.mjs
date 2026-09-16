/**
 * Independent probe 17 — rev-7: the settings entry left `settings.plugin.item` and
 * became a `settings.section` page of its own ("设置 → 通知提醒").
 *
 * Written by the verifier (task t2) against the SHIPPED BYTES of lib/client.js.
 *
 * Independence (contract: "must use its own loader, must not reuse verify/_harness.mjs"):
 *   This file imports NOTHING from `dsh-approval-chime/verify/` and nothing from
 *   `verify-independent/kit/`. The reporter, the classic-script loader, the React
 *   function-component driver, the DOM stub and the plugin-context stub are all
 *   implemented below, from the host contracts read first-hand:
 *     - `settings.section` list slot, register options id/order/label:
 *       @deepseek-ai/dsh-cordis-client-runner/lib/client.js:3872-3919
 *     - the slot DECLARATION (kind list, scope root) and the per-row projection that
 *       reads `options.id` / `options.order` / `resolveSlotLabel(options.label)`:
 *       @deepseek-ai/dsh-client-ui-settings-general/lib/client.js:621-624, :560-582
 *     - the plugin-page intersection (a card only exists for `settings.plugin.item`
 *       registrations whose `key` the Host serves):
 *       @deepseek-ai/dsh-client-ui-settings-plugins/lib/client.js:1099-1152, :1780-1791
 *
 * Two directions are both falsifiable, which is why the mutation section at the end
 * exists: "it moved away" (source-string counter-check + slot-call ledger) and
 * "nothing was lost" (control-by-control render assertions). `--mutate=<name>` loads
 * a deliberately broken in-memory copy of the SAME assertion set and REQUIRES the
 * named checks to fail; a mutation that nothing notices is reported as a failure.
 *
 * Run:  node verify-independent/probe-17-r7-section.mjs
 *       node verify-independent/probe-17-r7-section.mjs --mutate=slot
 *       node verify-independent/probe-17-r7-section.mjs --mutate=order
 *       node verify-independent/probe-17-r7-section.mjs --mutate=heading
 *       node verify-independent/probe-17-r7-section.mjs --mutate=picker
 *       node verify-independent/probe-17-r7-section.mjs --mutate=rogue
 *       node verify-independent/probe-17-r7-section.mjs --list-mutations
 *
 * Exit 0 when every check passes (and, in mutation mode, when exactly the expected
 * checks fail).
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/* ------------------------------------------------------------------ locations */

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = resolve(HERE, '..');
const CLIENT_PATH = join(PLUGIN, 'lib', 'client.js');

const HOST_ROOT = join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx', '1e7f6d9597241db0', 'node_modules', '@deepseek-ai');
const HOST_FILES = {
  general: join(HOST_ROOT, 'dsh-client-ui-settings-general', 'lib', 'client.js'),
  models: join(HOST_ROOT, 'dsh-client-ui-settings-models', 'lib', 'client.js'),
  plugins: join(HOST_ROOT, 'dsh-client-ui-settings-plugins', 'lib', 'client.js'),
  presets: join(HOST_ROOT, 'dsh-client-ui-agent-preset', 'lib', 'client.js'),
  runner: join(HOST_ROOT, 'dsh-cordis-client-runner', 'lib', 'client.js'),
};

/* ------------------------------------------------------------------ reporter */

function makeReport(title) {
  const rows = [];
  const out = {
    rows,
    group(name) {
      console.log(`\n--- ${name} ---`);
    },
    note(label, value) {
      const shown = typeof value === 'string' ? value : JSON.stringify(value);
      console.log(`    · ${label} = ${shown}`);
    },
    check(name, ok, detail) {
      const passed = ok === true;
      rows.push({ name, passed });
      console.log(`${passed ? '[PASS]' : '[FAIL]'} ${name}${detail === undefined || detail === '' ? '' : ` — ${detail}`}`);
      return passed;
    },
    same(name, actual, expected) {
      return out.check(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    deep(name, actual, expected) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      return out.check(name, a === b, `expected ${b}, got ${a}`);
    },    done() {
      const bad = rows.filter((row) => !row.passed);
      console.log(`\n### ${title}: ${rows.length - bad.length}/${rows.length} independent checks passed`);
      for (const row of bad) console.log(`    FAILED: ${row.name}`);
      return { total: rows.length, failed: bad.length, failedNames: bad.map((row) => row.name) };
    },
  };
  return out;
}

/* ------------------------------------------------- read the real shipped bytes */

const CLIENT_SOURCE = readFileSync(CLIENT_PATH, 'utf8');
const CLIENT_BYTES = Buffer.byteLength(CLIENT_SOURCE, 'utf8');
const CLIENT_SHA256 = createHash('sha256').update(Buffer.from(CLIENT_SOURCE, 'utf8')).digest('hex').toUpperCase();
const CLIENT_LINES = CLIENT_SOURCE.split(/\r?\n/);

/** `file:line: text` for the first line matching `pattern` — the evidence form. */
function locate(source, pattern) {
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) return { line: index + 1, text: lines[index].trim() };
  }
  return null;
}

/* --------------------------------------------------------------- mutations */

/**
 * In-memory-only mutations of the SHIPPED source. `files` stay untouched: the probe
 * rewrites the string it is about to evaluate, never the file on disk. `expectFail`
 * lists the checks that MUST report a failure — a mutation nothing notices fails
 * the probe, which is what makes every check below falsifiable rather than decorative.
 */
const MUTATIONS = {
  slot: {
    what: '注册槽位改回 settings.plugin.item（模拟"没移走"）',
    always: ['the entry slot name (stub ledger)', 'no settings.plugin.item registration ledger entry'],
    expectFail: [
      'the entry slot name (stub ledger)',
      'no settings.plugin.item registration ledger entry',
      'the bundle no longer claims a keyed-card key',
    ],
    apply(source) {
      const once = (from, to, label) => {
        const at = source.indexOf(from);
        if (at < 0) throw new Error(`mutation anchor not found: ${label ?? from}`);
        return source.slice(0, at) + to + source.slice(at + from.length);
      };
      // Anchor on the registration BLOCK, not the bare call: the bundle's own doc
      // comment mentions `settings.section` too, and a comment is not a registration.
      let next = once("ctx.slots.inject('settings.section', function () {", "ctx.slots.inject('settings.plugin.item', function () {", 'inject call');
      next = once("name: 'settings.section',\n                id: 'approval-chime'", "name: 'settings.plugin.item',\n                key: 'approval-chime'", 'register entry head');
      return next;
    },
  },
  order: {
    what: 'order 从 16 改成 99（模拟"写错位置"）',
    expectFail: ['order is 16 (right after 插件 at 15)'],
    apply(source) {
      return source.replace("order: 16,", 'order: 99,');
    },
  },
  heading: {
    what: '删掉页面标题 h2（模拟"控件缺失"）',
    expectFail: ['the page heading is an <h2> carrying 通知提醒', 'exactly one <h2> on the page'],
    apply(source) {
      return source.replace("React.createElement('h2', { className: 'dacTitle' }, t('title')),", 'null,');
    },
  },
  picker: {
    what: '删掉 ::picker(select) 的 3 行高度规则（模拟"播放下拉回归"）',
    expectFail: ['the ::picker(select) block keeps box-sizing:content-box;max-height:84px'],
    apply(source) {
      return source.replace("'box-sizing:content-box;max-height:' + String(TONE_ROWS * TONE_ROW_PX) + 'px;',", '');
    },
  },
  rogue: {
    what: '在新分区之外又偷偷注册 settings.plugin.item（模拟"旧的没删干净"）',
    always: [
      'no settings.plugin.item registration ledger entry',
      'no settings.plugin.item slot was injected',
      'the "plugins tab" vocabulary is absent as well (no keyed-card leftovers)',
    ],
    expectFail: [
      'no settings.plugin.item registration ledger entry',
      'no settings.plugin.item slot was injected',
      'the "plugins tab" vocabulary is absent as well (no keyed-card leftovers)',
    ],
    apply(source) {
      const anchor = 'ctx.slots.inject(\'settings.section\', function () {';
      const at = source.indexOf(anchor);
      if (at < 0) throw new Error('mutation anchor not found');
      const rogue = "ctx.slots.inject('settings.plugin.item', function () { return ctx.slots.register({ name: 'settings.plugin.item', key: NS }, ChimeSection); });\n          ";
      return source.slice(0, at) + rogue + source.slice(at);
    },
  },
};

const mutateArg = process.argv.find((value) => value.startsWith('--mutate='));
const MUTATION = mutateArg === undefined ? null : MUTATIONS[mutateArg.slice('--mutate='.length)];
if (mutateArg !== undefined && MUTATION === undefined) {
  console.error(`unknown mutation ${mutateArg}; available: ${Object.keys(MUTATIONS).join(', ')}`);
  process.exit(2);
}
if (process.argv.includes('--list-mutations')) {
  for (const [name, entry] of Object.entries(MUTATIONS)) console.log(`${name}: ${entry.what}`);
  process.exit(0);
}

const EVALUATED_SOURCE = MUTATION === null ? CLIENT_SOURCE : MUTATION.apply(CLIENT_SOURCE);
const MODE = MUTATION === null ? 'shipped' : `mutant:${mutateArg.slice('--mutate='.length)}`;

/* ---------------------------------------------------------------- vm plumbing */

/** A document stub: records created elements, keeps a real id ledger, allows listeners. */
function makeDocument() {
  const elements = [];
  const listeners = new Map();
  return {
    elements,
    listeners,
    head: { appended: [], appendChild(node) { this.appended.push(node); return node; } },
    getElementById(id) {
      for (const element of elements) if (element.id === id) return element;
      return null;
    },
    createElement(tag) {
      const element = {
        tag,
        id: '',
        attributes: {},
        textContent: '',
        setAttribute(name, value) { element.attributes[name] = value; },
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
    /** The text of the one <style> element the bundle injects, or null. */
    stylesheet() {
      const style = elements.find((element) => element.tag === 'style' && element.id === 'dsh-approval-chime/styles');
      return style === undefined ? null : style.textContent;
    },
  };
}

/** A recording WebAudio stub — enough for a preview button press, no analysis here. */
function makeAudioContext() {
  const record = { contexts: 0, gains: 0, oscillators: 0, destinations: 0 };
  function AudioContext() {
    record.contexts += 1;
    this.state = 'running';
    this.currentTime = 1;
    this.destination = { kind: 'destination' };
    this.resume = () => Promise.resolve();
    this.createGain = () => {
      record.gains += 1;
      return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (t) => t, disconnect() {} };
    };
    this.createOscillator = () => {
      record.oscillators += 1;
      return { type: 'sine', frequency: { value: 0 }, connect: (t) => t, disconnect() {}, start() {}, stop() {} };
    };
  }
  return { Ctor: AudioContext, record };
}

/**
 * Load a classic-script bundle into a fresh vm context, exactly the way
 * `<script src>` does: `window.__ModuleLoader__.load({ id, factory })` is captured
 * and then called with a `require` that answers only for `react`.
 */
function loadClient(source) {
  const ledger = { console: [], registrations: [], requires: [], loadError: null, factoryError: null };
  const sandbox = {
    console: {
      log: (...a) => ledger.console.push(`log: ${a.join(' ')}`),
      info: (...a) => ledger.console.push(`info: ${a.join(' ')}`),
      warn: (...a) => ledger.console.push(`warn: ${a.join(' ')}`),
      error: (...a) => ledger.console.push(`error: ${a.join(' ')}`),
      debug: (...a) => ledger.console.push(`debug: ${a.join(' ')}`),
    },
    setTimeout,
    clearTimeout,
    queueMicrotask,
    document: makeDocument(),
  };
  const audio = makeAudioContext();
  sandbox.AudioContext = audio.Ctor;
  for (const label of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Audio', 'Image']) {
    sandbox[label] = () => {
      throw new Error(`probe: ${label} is not available to this bundle`);
    };
  }
  sandbox.__ModuleLoader__ = { load: (registration) => ledger.registrations.push(registration) };
  sandbox.window = sandbox;
  sandbox.self = sandbox;

  const context = vm.createContext(sandbox);
  try {
    vm.runInContext(source, context, { filename: CLIENT_PATH });
  } catch (error) {
    ledger.loadError = error;
  }

  const react = makeReact();
  let contract = null;
  if (ledger.registrations.length > 0 && ledger.loadError === null) {
    try {
      contract = ledger.registrations[0].factory((specifier) => {
        ledger.requires.push(specifier);
        if (specifier === 'react') return react.api;
        throw new Error(`probe: unexpected require(${JSON.stringify(specifier)})`);
      });
    } catch (error) {
      ledger.factoryError = error;
    }
  }

  return {
    ledger,
    sandbox,
    document: sandbox.document,
    audio,
    react,
    contract,
    registration: ledger.registrations[0] ?? null,
    diagnostics: sandbox.__DSH_APPROVAL_CHIME__,
  };
}

/* ------------------------------------------------- my own React hook runtime */

function flatten(children) {
  const flat = [];
  const push = (child) => {
    if (Array.isArray(child)) {
      for (const item of child) push(item);
      return;
    }
    if (child === null || child === undefined || child === false || child === true) return;
    flat.push(child);
  };
  for (const child of children) push(child);
  return flat;
}

function makeReact() {
  const runtime = { hooks: [], effects: [] };
  let cursor = 0;
  const api = {
    createElement(type, props, ...children) {
      return { type, props: props === null || props === undefined ? {} : props, children: flatten(children) };
    },
    useState(initial) {
      const slot = cursor;
      cursor += 1;
      if (!(slot in runtime.hooks)) runtime.hooks[slot] = typeof initial === 'function' ? initial() : initial;
      return [runtime.hooks[slot], (next) => { runtime.hooks[slot] = typeof next === 'function' ? next(runtime.hooks[slot]) : next; }];
    },
    useEffect(callback) {
      const slot = cursor;
      cursor += 1;
      if (!runtime.effects.some((effect) => effect.slot === slot)) runtime.effects.push({ slot, callback, ran: false });
    },
    useRef(initial) {
      const slot = cursor;
      cursor += 1;
      if (!(slot in runtime.hooks)) runtime.hooks[slot] = { current: initial };
      return runtime.hooks[slot];
    },
    useMemo: (factory) => factory(),
    useCallback: (fn) => fn,
  };
  return {
    api,
    runtime,
    draw(Component, props) {
      cursor = 0;
      return Component(props === undefined ? {} : props);
    },
    runEffects() {
      const disposers = [];
      for (const effect of runtime.effects) {
        if (effect.ran) continue;
        effect.ran = true;
        const dispose = effect.callback();
        if (typeof dispose === 'function') disposers.push(dispose);
      }
      return disposers;
    },
  };
}

/* ------------------------------------------------------- tree walking helpers */

function walk(node, visit) {
  if (node === null || node === undefined || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  visit(node);
  walk(node.children, visit);
}

const findAll = (tree, predicate) => {
  const found = [];
  walk(tree, (node) => { if (predicate(node)) found.push(node); });
  return found;
};
const byType = (tree, type) => findAll(tree, (node) => node.type === type);
const inputsOf = (tree, type) => findAll(tree, (node) => node.type === 'input' && node.props.type === type);
const buttonTexts = (tree) => byType(tree, 'button').map((node) => textOf(node));

function textOf(node) {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (node === null || node === undefined || typeof node !== 'object') return '';
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return node.children.map(textOf).join(' ');
}

/* ------------------------------------------------- the plugin context stub */

const NS = 'approval-chime';
const SLOT = 'settings.section';

/**
 * Stub of the four services the bundle injects (`slots`, `locale`, `settingsScope`,
 * `uiSession`) plus `effect`. Every call made by the bundle is recorded verbatim, so
 * "what did it register" is a measurement, not a reading of the source.
 */
function makeCtx(options = {}) {
  const log = {
    slotInjects: [],
    registrations: [],
    localeRegistrations: [],
    boundNamespaces: [],
    bindEvents: [],
    writeCalls: [],
    effectLabels: [],
    consoleWarnings: [],
  };

  const state = {
    locale: options.locale === undefined ? 'zh' : options.locale,
    value: options.value === undefined ? { enabled: true, volume: 70, tone: 'chime' } : options.value,
    user: {},
    writable: options.writable === undefined ? true : options.writable,
    status: options.status === undefined ? 'ready' : options.status,
    revision: 1,
  };

  const scopeListeners = new Set();
  const scope = {
    getSnapshot: () => ({
      status: state.status,
      value: { ...state.value },
      user: { ...state.user },
      writable: state.writable,
      mode: 'host',
      revision: state.revision,
    }),
    subscribe(listener) {
      scopeListeners.add(listener);
      return () => scopeListeners.delete(listener);
    },
    set(field, value) {
      log.writeCalls.push({ kind: 'set', field, value });
      state.value = { ...state.value, [field]: value };
      state.user = { ...state.user, [field]: value };
      state.revision += 1;
      for (const listener of [...scopeListeners]) listener();
      return Promise.resolve(true);
    },
    unset(field) {
      log.writeCalls.push({ kind: 'unset', field });
      const value = { ...state.value };
      delete value[field];
      state.value = value;
      const user = { ...state.user };
      delete user[field];
      state.user = user;
      state.revision += 1;
      for (const listener of [...scopeListeners]) listener();
      return Promise.resolve(true);
    },
  };

  const pendingListeners = new Set();
  let pending = new Map();

  const ctx = {
    effect(callback, label) {
      log.effectLabels.push(label);
      const dispose = callback();
      return typeof dispose === 'function' ? dispose : () => {};
    },
    slots: {
      /** Records the injected slot name, then runs the injector like the real ledger. */
      inject(name, callback) {
        log.slotInjects.push(name);
        return callback();
      },
      register(entry, component) {
        log.registrations.push({ entry, component });
        return () => {};
      },
    },
    locale: {
      register(ns, dictionary) {
        log.localeRegistrations.push({ ns, dictionary });
        return () => {};
      },
      /** The Host's `bind(ns)` face: a translator that answers for the live locale. */
      bind(ns) {
        log.boundNamespaces.push(ns);
        return (key) => {
          log.bindEvents.push({ ns, key, locale: state.locale });
          const table = log.localeRegistrations[0]?.dictionary?.[state.locale];
          if (table !== undefined && Object.prototype.hasOwnProperty.call(table, key)) return table[key];
          return key;
        };
      },
      subscribe: () => () => {},
      getSnapshot: () => ({ revision: 0, locale: state.locale }),
    },
    settingsScope: {
      bind(spec) {
        log.boundNamespaces.push(spec === undefined ? undefined : spec.namespace);
        return scope;
      },
    },
    uiSession: {
      pendingInteractions: {
        getSnapshot: () => pending,
        subscribe(listener) {
          pendingListeners.add(listener);
          return () => pendingListeners.delete(listener);
        },
      },
    },
  };

  return {
    ctx,
    log,
    state,
    scope,
    /**
     * Publish a Host-side settings revision the way the real scope does: the bound
     * scope notifies its subscribers, which is what re-folds the page's snapshot.
     */
    notifyScope() {
      for (const listener of [...scopeListeners]) listener();
    },
    publish(entries) {
      pending = new Map(entries);
      for (const listener of [...pendingListeners]) listener();
    },
  };
}

const settle = async (rounds = 8) => {
  for (let index = 0; index < rounds; index += 1) await new Promise((tick) => setImmediate(tick));
};

/* =============================================================== the checks */

const report = makeReport(`probe-17-r7-section.mjs [${MODE}]`);

report.group('0. the bytes under test are the shipped ones');
report.note('file', CLIENT_PATH);
report.note('bytes', CLIENT_BYTES);
report.note('sha256', CLIENT_SHA256);
report.same('lib/client.js byte count is what rev-11 claims', CLIENT_BYTES, 137971);
report.same(
  'lib/client.js sha256 is what rev-11 claims',
  CLIENT_SHA256,
  '36BDD86B4D09A96492FCD6819913A50117E17EB6017F07914E98955A02D6E9CB',
);
report.same('lib/client.js has no top-level import/export (it is a classic script)', /^import |^export /m.test(CLIENT_SOURCE), false);

/* ---------------------------------------------------------- 1. slot registration */

report.group('1. the registration lands on settings.section, and nowhere else');

const bundle = loadClient(EVALUATED_SOURCE);
report.check('the bundle evaluated without a load error', bundle.ledger.loadError === null, String(bundle.ledger.loadError ?? ''));
report.check('the bundle evaluated without a factory error', bundle.ledger.factoryError === null, String(bundle.ledger.factoryError ?? ''));
report.same('the module graph really loaded exactly one registration', bundle.ledger.registrations.length, 1);
report.same('its id is the package name', bundle.ledger.registrations[0]?.id, 'dsh-approval-chime');
report.deep('it required only react (nothing else is requireable)', bundle.ledger.requires, ['react']);
report.check('it exposes an apply()', typeof bundle.contract?.apply === 'function');

const bundle2 = loadClient(EVALUATED_SOURCE);
const ctx2 = makeCtx();
bundle2.contract.apply(ctx2.ctx);
const diagnostics = bundle2.sandbox.__DSH_APPROVAL_CHIME__;

report.note('slots.inject calls', ctx2.log.slotInjects);
report.note('slots.register entries', ctx2.log.registrations.map((row) => ({ name: row.entry.name, id: row.entry.id, key: row.entry.key, order: row.entry.order, locale: row.entry.locale })));
report.same('exactly two slots.inject happened (rev-10 adds the session-header bell)', ctx2.log.slotInjects.length, 2);
report.same('the injected slot names', JSON.stringify(ctx2.log.slotInjects), JSON.stringify([SLOT, 'conversation.session.header.actions']));
report.same('exactly two slots.register happened (the section + the bell)', ctx2.log.registrations.length, 2);

/**
 * Resolve one registration out of the stub ledger. The strict lookup is by slot name;
 * the fallback keeps a mutant (which registers somewhere else on purpose) from
 * crashing the probe before it can print the whole diagnosis.
 */
const pick = (ctx) => {
  const strict = ctx.log.registrations.find((row) => row.entry?.name === SLOT);
  return strict === undefined ? ctx.log.registrations[0] : strict;
};

const entry = pick(ctx2)?.entry;
report.same('the entry slot name (stub ledger)', entry?.name, SLOT);
report.check('the component is a function component', typeof pick(ctx2)?.component === 'function');
report.same('the settings namespace it binds is its own', ctx2.log.boundNamespaces[0], NS);
report.check('no other namespace was bound', ctx2.log.boundNamespaces.every((ns) => ns === NS), JSON.stringify(ctx2.log.boundNamespaces));

/* ------------------------------------------------ 2. settings.plugin.item is gone */

report.group('2. settings.plugin.item is gone — source string AND stub ledger');

const pluginItem = 'settings' + '.plugin.item';
const pluginItemHits = [];
CLIENT_LINES.forEach((line, index) => { if (line.includes(pluginItem)) pluginItemHits.push({ line: index + 1, text: line.trim() }); });
report.note('literal occurrences in the shipped source (comments included)', pluginItemHits);
report.same('no settings.plugin.item registration ledger entry', ctx2.log.registrations.filter((row) => row.entry?.name === pluginItem).length, 0);
report.same('no settings.plugin.item slot was injected', ctx2.log.slotInjects.filter((name) => name === pluginItem).length, 0);
// The unconditional string check: the marker must not appear at all, so the claim
// survives rewording (a `name:`/`key:`/`inject(` construction anywhere would match).
report.same('the shipped source contains no settings.plugin.item registration', pluginItemHits.length, 0);
report.check(
  'the "plugins tab" vocabulary is absent as well (no keyed-card leftovers)',
  !/plugin\.item|plugins\.tab|ConfigurablePlugins/.test(EVALUATED_SOURCE),
  `matches: ${JSON.stringify((EVALUATED_SOURCE.match(/plugin\.item|plugins\.tab|ConfigurablePlugins/g) ?? []).slice(0, 5))}`,
);
report.same('the bundle no longer claims a keyed-card key', entry?.key, undefined);
report.same('diagnostics.slot reports the new slot', diagnostics?.slot, SLOT);

/* ------------------------------------------------------------ 3. locale + order */

report.group('3. locale reaction, private id, order between 插件(15) and Agent 预设(20)');

report.same('the nav label option is a thunk, not a fixed string', typeof entry?.label, 'function');
const zh = loadClient(EVALUATED_SOURCE);
const zhCtx = makeCtx({ locale: 'zh' });
zh.contract.apply(zhCtx.ctx);
const zhEntry = pick(zhCtx).entry;
report.same('zh: the label thunk resolves to 通知提醒', zhEntry.label?.(), '通知提醒');
const en = loadClient(EVALUATED_SOURCE);
const enCtx = makeCtx({ locale: 'en' });
en.contract.apply(enCtx.ctx);
const enEntry = pick(enCtx).entry;
report.same('en: the same registration resolves to the English string', enEntry.label?.(), 'Notifications');
report.check('the English label is not the Chinese one', enEntry.label?.() !== zhEntry.label?.(), `${zhEntry.label?.()} / ${enEntry.label?.()}`);
// Reactivity without re-registering: flip the locale on the SAME bundle and re-project.
zhCtx.state.locale = 'en';
report.same('zh entry, locale flipped to en: the same thunk now answers in English', zhEntry.label?.(), 'Notifications');
zhCtx.state.locale = 'zh';
report.same('and back to zh', zhEntry.label?.(), '通知提醒');
report.same('the label option names the bundled locale namespace', entry?.locale, NS);
report.check('the thunk reads the `nav` key through the bound translator', zhCtx.log.bindEvents.some((event) => event.key === 'nav'), JSON.stringify(zhCtx.log.bindEvents));
report.same('the host-visible register option set is exactly name/id/order/label/locale', Object.keys(entry ?? {}).sort().join(','), 'id,label,locale,name,order');
report.note('the raw entry handed to slots.register', Object.keys(entry ?? {}).map((key) => `${key}=${typeof entry[key]}`).join(' '));

report.same('order is 16 (right after 插件 at 15)', entry?.order, 16);
report.same('the private id is the plugin namespace, not a shipped one', entry?.id, 'approval-chime');
report.check(
  'the id collides with none of the shipped section ids',
  ['general', 'models', 'plugins', 'agent-presets'].every((shipped) => shipped !== entry?.id),
  JSON.stringify(entry?.id),
);

// The host orders are read from the HOST's own files, not from the plugin's comments.
const hostOrders = {};
for (const [key, path] of Object.entries(HOST_FILES)) {
  const source = readFileSync(path, 'utf8');
  const hit = locate(source, /name: "settings\.section"/);
  if (hit === null) continue;
  const window = source.split(/\r?\n/).slice(hit.line - 1, hit.line + 6).join('\n');
  const id = /id: "([a-z-]+)"/.exec(window);
  const order = /order: (\d+)/.exec(window);
  hostOrders[key] = { path, sectionLine: hit.line, id: id?.[1], order: order === null ? null : Number(order[1]) };
}
report.note('host section registrations read first-hand', hostOrders);
report.deep('general registers order 0', { line: hostOrders.general.sectionLine, order: hostOrders.general.order }, { line: 652, order: 0 });
report.deep('models registers order 10', { line: hostOrders.models.sectionLine, order: hostOrders.models.order }, { line: 2937, order: 10 });
report.deep('plugins registers order 15', { line: hostOrders.plugins.sectionLine, order: hostOrders.plugins.order }, { line: 1762, order: 15 });
report.deep('agent-presets registers order 20', { line: hostOrders.presets.sectionLine, order: hostOrders.presets.order }, { line: 1520, order: 20 });
report.check(
  'order 16 falls strictly between plugins(15) and agent-presets(20)',
  entry?.order > hostOrders.plugins.order && entry?.order < hostOrders.presets.order,
  `${hostOrders.plugins.order} < ${entry?.order} < ${hostOrders.presets.order}`,
);
report.check(
  'order 16 falls after models(10) too, so the row follows the whole shipped prefix',
  entry?.order > hostOrders.models.order && entry?.order > hostOrders.general.order,
  `${hostOrders.general.order} / ${hostOrders.models.order} < ${entry?.order}`,
);

// The host's own projection rule: sort by order ascending, resolve label per row.
const rows = [
  { id: hostOrders.general.id, order: hostOrders.general.order, label: 'General' },
  { id: hostOrders.models.id, order: hostOrders.models.order, label: 'Models' },
  { id: hostOrders.plugins.id, order: hostOrders.plugins.order, label: '插件' },
  { id: entry?.id, order: entry?.order, label: entry?.label?.() },
  { id: hostOrders.presets.id, order: hostOrders.presets.order, label: 'Agent 预设' },
].sort((a, b) => a.order - b.order);
report.deep('the host projection (sort by order) puts this row directly after 插件', rows.map((row) => row.id), ['general', 'models', 'plugins', 'approval-chime', 'agent-presets']);
report.same('no two section ids share an order-derived cell', new Set(rows.map((row) => row.id)).size, rows.length);

/* -------------------------------------------------------------- 4. the page */

report.group('4. the rendered page keeps every control rev-6 had');

const view = loadClient(EVALUATED_SOURCE);
const viewCtx = makeCtx();
view.contract.apply(viewCtx.ctx);
const Section = pick(viewCtx).component;
const stylesheet = view.document.stylesheet();
report.check('the bundle injected its stylesheet', typeof stylesheet === 'string' && stylesheet.length > 0, `${stylesheet === null ? 'null' : `${stylesheet.length} chars`}`);

const tree = view.react.draw(Section, { close: () => {} });
view.react.runEffects();
report.check('the page renders (available === true once the namespace is served)', tree !== null, String(tree));
const text = textOf(tree);

report.same('the page heading is an <h2> carrying 通知提醒', textOf(byType(tree, 'h2')[0]) , '通知提醒');
report.same('exactly one <h2> on the page', byType(tree, 'h2').length, 1);
report.check('the intro line is present', text.includes('宿主向你申请权限时响一次'), text.slice(0, 90));
report.check('the section carries the plugin data attribute for a browser probe', byType(tree, 'section')[0]?.props?.['data-plugin'] === 'dsh-approval-chime');
report.same('the bundleRevision badge shows the rev-11 stamp', textOf(byType(tree, 'span').find((node) => node.props.className === 'dacRev')), diagnostics.revision);
report.check('the revision stamp is the rev-11 one', /rev-11/.test(diagnostics.revision), diagnostics.revision);

const checkbox = inputsOf(tree, 'checkbox')[0];
report.same('exactly one enable checkbox', inputsOf(tree, 'checkbox').length, 1);
report.same('the checkbox is checked by default', checkbox?.props.checked, true);
report.check('the checkbox sits inside a <label> with its text', byType(tree, 'label').some((label) => textOf(label).includes('启用提示音') && label.children.some((child) => child.type === 'input')), JSON.stringify(byType(tree, 'label').map(textOf)));

const range = inputsOf(tree, 'range')[0];
report.same('exactly one volume slider', inputsOf(tree, 'range').length, 1);
report.deep('the slider is 0..100 step 1', { min: Number(range?.props.min), max: Number(range?.props.max), step: Number(range?.props.step) }, { min: 0, max: 100, step: 1 });
report.same('the slider is labelled for screen readers', range?.props['aria-label'], '音量');
report.same('the slider shows the effective value', Number(range?.props.value), 70);
report.same('it is enabled while the scope is writable', range?.props.disabled, false);

const select = byType(tree, 'select')[0];
report.same('exactly one tone picker', byType(tree, 'select').length, 1);
report.deep('the picker offers the three built-in tones', byType(tree, 'option').map((option) => option.props.value), ['chime', 'bell', 'beep']);
report.same('the picker is labelled for screen readers', select?.props['aria-label'], '音色');

const file = inputsOf(tree, 'file')[0];
report.same('exactly one hidden file input', inputsOf(tree, 'file').length, 1);
report.same('the file input accepts audio', file?.props.accept, 'audio/*');
report.same('the file input is the hidden one', file?.props.className, 'dacFile');
report.check('the file input is hidden by injected CSS rather than absent', /\.dacCard \.dacFile\{display:none;\}/.test(stylesheet ?? ''), (stylesheet ?? '').match(/\.dacCard \.dacFile\{[^}]*\}/)?.[0]);

const buttons = byType(tree, 'button');
report.deep('the visible actions are import / preview / reset (no custom tone selected yet)', buttonTexts(tree), ['导入音频', '试听', '恢复默认']);
report.check('the import button carries the custom-tone hint', typeof buttons[0]?.props?.title === 'string' && buttons[0].props.title.length > 0, buttons[0]?.props?.title);
report.same('the preview button is enabled while the chime is on', buttons.find((node) => textOf(node) === '试听')?.props.disabled, false);
report.same('the preview button plays the current tone', typeof buttons.find((node) => textOf(node) === '试听')?.props.onClick, 'function');

const statsRow = byType(tree, 'div').find((node) => node.props.className === 'dacStats');
report.check('the counters row exists', statsRow !== undefined);
report.same('the counters row shows the trigger count', textOf(byType(statsRow, 'span')[0]), '已触发: 0');
report.check('the counters row shows the last-trigger slot', textOf(statsRow).includes('上次触发: 尚未触发'), textOf(statsRow));
report.check('the counters row shows the last tone/volume', textOf(statsRow).includes('最近音色/音量'), textOf(statsRow));
report.check('the counters row shows the audio state', textOf(statsRow).includes('音频状态: 未创建'), textOf(statsRow));
report.check('the counters row shows the approvals-seen count', textOf(statsRow).includes('已见审批: 0'), textOf(statsRow));

report.check(
  'the ::picker(select) block keeps box-sizing:content-box;max-height:84px',
  /::picker\(select\)\{[^}]*box-sizing:content-box;max-height:84px;/.test(stylesheet ?? ''),
  (stylesheet ?? '').match(/::picker\(select\)\{[^}]*\}/)?.[0],
);
report.check('the popup keeps border-radius:10px', /::picker\(select\)\{[^}]*border-radius:10px;/.test(stylesheet ?? ''), (stylesheet ?? '').match(/::picker\(select\)\{[^}]*border-radius:10px;/)?.[0]);
report.same('the declared row count is 3', diagnostics.toneRows, 3);
const styledOptionRule = (stylesheet ?? '').split('}').map((part) => `${part}}`).find((part) => /^\.dacCard select option\{/.test(part) && /line-height:/.test(part)) ?? '';
report.check(
  '3 rows are exactly what the popup shows: max-height 84px = 3 x (line-height 20px + 4px padding x2)',
  /line-height:20px;/.test(styledOptionRule) && 3 * (20 + 4 + 4) === 84,
  styledOptionRule || 'no styled option rule found',
);
report.check('the popup scrolls rather than growing', /::picker\(select\)\{[^}]*overflow-y:auto;/.test(stylesheet ?? ''), (stylesheet ?? '').match(/::picker\(select\)\{[^}]*overflow-y:auto;/)?.[0]);
report.check(
  'the expanded popup inherits the card palette (option colours are stated)',
  /\.dacCard select option\{background-color:var\(--dsw-alias-bg-layer-1/.test(stylesheet ?? ''),
  (stylesheet ?? '').match(/\.dacCard select option\{background-color[^}]*\}/)?.[0],
);

/* ------------------------------- 5. the "custom tone selected" state keeps 移除 */

report.group('5. an imported tone still renders the 移除 action');

const CUSTOM_ID = `${'a'.repeat(8)}-${'b'.repeat(4)}-${'c'.repeat(4)}-${'d'.repeat(4)}-${'e'.repeat(12)}`;
const customValue = { enabled: true, volume: 70, tone: `custom:${CUSTOM_ID}`, custom: [{ id: CUSTOM_ID, name: 'door.wav' }] };
const custom = makeCtx({ value: customValue });
const customView = loadClient(EVALUATED_SOURCE);
customView.contract.apply(custom.ctx);
const customSection = pick(custom).component;
const customTree = customView.react.draw(customSection, {});
customView.react.runEffects();
report.check('an imported tone is rendered as an option', byType(customTree, 'option').some((option) => option.props.value === customValue.tone), JSON.stringify(byType(customTree, 'option').map((option) => option.props.value)));
report.same('the roster name is the option label', textOf(byType(customTree, 'option')[0]), 'door.wav');
report.deep('the actions are now import / 移除 / preview / reset', buttonTexts(customTree), ['导入音频', '移除', '试听', '恢复默认']);
report.same('the 移除 button is enabled while writable', byType(customTree, 'button').find((node) => textOf(node) === '移除')?.props.disabled, false);
report.check('the roster puts imported tones before the built-ins', textOf(byType(customTree, 'option')[1]) === '风铃 chime', JSON.stringify(byType(customTree, 'option').map(textOf)));

/* --------------------------- 6. the controls still write, and the page still gates */

report.group('6. the page still writes through settingsScope, and still gates on availability');

let viewTree = view.react.draw(Section, {});
const rangeNow = () => inputsOf(viewTree, 'range')[0];
rangeNow().props.onChange({ target: { value: '35' } });
viewTree = view.react.draw(Section, {});
report.same('dragging stages locally (no write yet)', viewCtx.log.writeCalls.length, 0);
report.same('the slider follows the drag', Number(rangeNow().props.value), 35);
rangeNow().props.onPointerUp();
await settle();
report.same('releasing writes exactly once', viewCtx.log.writeCalls.length, 1);
report.same('the write is the volume field', JSON.stringify(viewCtx.log.writeCalls[0]), JSON.stringify({ kind: 'set', field: 'volume', value: 35 }));

viewTree = view.react.draw(Section, {});
inputsOf(viewTree, 'checkbox')[0].props.onChange({ target: { checked: false } });
await settle();
report.same('the switch writes the enabled field', JSON.stringify(viewCtx.log.writeCalls[1]), JSON.stringify({ kind: 'set', field: 'enabled', value: false }));

const gated = loadClient(EVALUATED_SOURCE);
const gatedCtx = makeCtx({ status: 'loading' });
gated.contract.apply(gatedCtx.ctx);
const gatedSection = pick(gatedCtx).component;
report.same('status=loading renders nothing (never a dead control)', gated.react.draw(gatedSection, {}), null);
gated.react.runEffects();
gatedCtx.state.status = 'ready';
gatedCtx.notifyScope();
report.check('status=ready renders the page', gated.react.draw(gatedSection, {}) !== null);
gatedCtx.state.status = 'error';
gatedCtx.notifyScope();
report.same('status=error renders nothing again', gated.react.draw(gatedSection, {}), null);

/* ------------------------------------------------------------- 7. mutation tests */

report.group('7. the probe can falsify a regression, not just confirm the fix');

/** The set of checks a mutant is REQUIRED to turn red. */
const FAILING_SET = new Set(report.rows.filter((row) => !row.passed).map((row) => row.name));

if (MUTATION === null) {
  report.note('mutation mode', 'off — run with --mutate=<name> to prove the checks bite');
  report.note('available mutations', Object.keys(MUTATIONS));
} else {
  report.note('mutation', MUTATION.what);
  report.note('checks that turned red', [...FAILING_SET]);
  const missing = MUTATION.expectFail.filter((name) => !FAILING_SET.has(name));
  report.check(
    `every expected check failed under "${MUTATION.what}"`,
    missing.length === 0,
    missing.length === 0 ? `all ${MUTATION.expectFail.length} expected failures observed` : `NOT caught: ${JSON.stringify(missing)}`,
  );
  for (const name of MUTATION.always ?? []) {
    report.check(`the always-on invariant "${name}" also failed (as required)`, FAILING_SET.has(name), FAILING_SET.has(name) ? 'failed as required' : 'unexpectedly still passed');
  }
  report.check('the mutation really rewrote the evaluated source', EVALUATED_SOURCE !== CLIENT_SOURCE, `${Buffer.byteLength(EVALUATED_SOURCE, 'utf8')} vs ${CLIENT_BYTES} bytes`);
}

/* --------------------------------------------------------------------- verdict */

const verdict = report.done();
if (MUTATION !== null && verdict.failed > 0) process.exitCode = 1;
if (verdict.failed > 0) process.exitCode = 1;
