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

/* -------------------------- resolving the injected CSS (rev-12 shape repair, t2) */

/*
 * Three checks below used to read the picker styles by REGEX out of one
 * `::picker(select){...}` block. rev-12 deliberately split that block: the box declarations
 * moved into a rule whose selector list names BOTH tone lists, and each list kept a rule of
 * its own carrying only `max-height`. The three checks keep their SUBJECTS unchanged — the
 * card's list is content-box AND exactly 84px; its option rows are 20px/4px so three rows
 * are 84px; the fallback option-colour rule still covers the card — but they now RESOLVE
 * those facts by cascading over every rule inside `@supports (appearance:base-select)`
 * whose selector LIST names the card's list, which is what a browser does. Nothing here
 * asserts co-location any more: that is exactly what rev-12 changed.
 */

const CARD_PICKER_SELECTOR = '.dacCard select::picker(select)';
const CARD_OPTION_SELECTOR = '.dacCard select option';

/** The body of `prelude{...}` with brace matching, plus where it sits in `css`. */
function cssBlockBody(css, prelude) {
  const at = css.indexOf(prelude);
  if (at < 0) return null;
  const open = css.indexOf('{', at);
  if (open < 0) return null;
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    else if (css[index] === '}') {
      depth -= 1;
      if (depth === 0) return { body: css.slice(open + 1, index), start: open + 1, end: index, preludeStart: at };
    }
  }
  return null;
}

/** The flat `sel{decls}` rules of a body (nested blocks are not expected in this sheet). */
function cssRules(body) {
  const found = [];
  let cursor = 0;
  while (cursor < body.length) {
    const open = body.indexOf('{', cursor);
    if (open < 0) break;
    const selector = body.slice(cursor, open).trim();
    let depth = 0;
    for (let index = open; index < body.length; index += 1) {
      if (body[index] === '{') depth += 1;
      else if (body[index] === '}') {
        depth -= 1;
        if (depth === 0) {
          found.push({ selector, declarations: body.slice(open + 1, index) });
          cursor = index + 1;
          break;
        }
      }
    }
  }
  return found;
}

/** Top-level selector-list split: a comma inside `(...)` does not split. */
function cssSelectorList(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      out.push(text.slice(start, index));
      start = index + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((entry) => entry.trim().replace(/\s+/g, ' ')).filter((entry) => entry !== '');
}

/**
 * Resolve a target's declarations across the rules that NAME it. Participation is an exact
 * selector match, so every participant carries the identical specificity and written order
 * is the entire cascade. `declarations` is a Map; missing properties simply do not appear.
 */
function cssResolve(ruleList, target) {
  const participants = ruleList.filter((rule) => cssSelectorList(rule.selector).includes(target));
  const declarations = new Map();
  for (const rule of participants) {
    for (const part of rule.declarations.split(';')) {
      const colon = part.indexOf(':');
      if (colon < 0) continue;
      declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
    }
  }
  return { participants, declarations };
}

/** Map lookup that answers null instead of undefined. */
function cssValue(resolved, property) {
  return resolved.declarations.has(property) ? resolved.declarations.get(property) : null;
}

/** The whole stylesheet with the `@supports (appearance:base-select)` block cut out. */
function cssOutsideSupports(css) {
  const block = cssBlockBody(css, '@supports (appearance:base-select)');
  if (block === null) return css;
  return css.slice(0, block.preludeStart) + css.slice(block.end + 1);
}

/* --------------------------------------------------------------- mutations */

/**
 * Replace the ONE occurrence of `from`, MEASURING the anchor first. An anchor that occurs
 * zero times is a dead mutation (it would silently change nothing at all); one that occurs
 * twice would let a plain `String.replace` pick a spot the author did not mean. Both are
 * hard errors here, and the measured count goes into the message, so a log proves the
 * measurement happened instead of leaving a no-op looking like a pass.
 *
 * Every anchor below is a SINGLE-LINE fragment on purpose: this worktree checks
 * `lib/client.js` out as CRLF (`git ls-files --eol` -> `i/lf w/crlf`), so an anchor
 * carrying a bare `\n` could never match and would throw instead of proving anything.
 */
function replaceOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`mutation anchor not found (0 occurrences): ${label ?? from}`);
  const second = source.indexOf(from, first + from.length);
  if (second >= 0) throw new Error(`mutation anchor is not unique (2+ occurrences): ${label ?? from}`);
  return source.slice(0, first) + to + source.slice(first + from.length);
}

/**
 * In-memory-only mutations of the SHIPPED source. `files` stay untouched: the probe
 * rewrites the string it is about to evaluate, never the file on disk. `expectFail`
 * lists the checks that MUST report a failure — and, since the t2 audit, that is an
 * EXACT list: a red check outside `expectFail` fails the mutant too, because "one
 * mutation reddens some set of checks" is not the claim being made here. A mutation
 * nothing notices fails the probe, which is what makes every check below falsifiable
 * rather than decorative.
 */
const MUTATIONS = {
  slot: {
    what: '注册槽位改回 settings.plugin.item（模拟"没移走"）',
    always: ['the entry slot name (stub ledger)', 'no settings.plugin.item registration ledger entry'],
    // The t2 audit re-measured this mutant three times (identical sets every time): swapping
    // the registration back to the old slot also reddens the slot-name ledger, the
    // "no settings.plugin.item slot" pair, the keyed-card key claim, the register option
    // set, the private-id claim and the host projection. The declaration below lists the
    // MEASURED set; the previous three-entry list was simply incomplete.
    expectFail: [
      'the injected slot names',
      'the entry slot name (stub ledger)',
      'no settings.plugin.item registration ledger entry',
      'no settings.plugin.item slot was injected',
      'the "plugins tab" vocabulary is absent as well (no keyed-card leftovers)',
      'the bundle no longer claims a keyed-card key',
      'the host-visible register option set is exactly name/id/order/label/locale',
      'the private id is the plugin namespace, not a shipped one',
      'the host projection (sort by order) puts this row directly after 插件',
    ],
    apply(source) {
      // `once` CHAINS onto its own output (t2 repair). It used to slice the original
      // `source` every time, so of three substitutions only the LAST one survived -- which
      // is why the register-entry swaps never reached the evaluated source even when their
      // anchors matched. Each call now asserts the anchor occurs EXACTLY once in the text
      // it is about to rewrite (see replaceOnce), and the result is asserted to differ from
      // the shipped bytes by the mutation verdict below.
      let next = source;
      const once = (from, to, label) => {
        const before = next;
        next = replaceOnce(next, from, to, label);
        if (next === before) throw new Error(`mutation substitution was a no-op: ${label}`);
      };
      // Anchor on the registration BLOCK, not the bare call: the bundle's own doc
      // comment mentions `settings.section` too, and a comment is not a registration.
      //
      // Two SINGLE-LINE anchors on purpose (found while fixing rev-12): this worktree
      // checks `lib/client.js` out as CRLF (`git ls-files --eol` says `i/lf w/crlf`), so the
      // previous two-line anchor carrying a bare `\n` could never match and this mutation
      // threw "mutation anchor not found" instead of proving anything.
      once("ctx.slots.inject('settings.section', function () {", "ctx.slots.inject('settings.plugin.item', function () {", 'inject call');
      once("name: 'settings.section',", "name: 'settings.plugin.item',", 'register entry name');
      once("id: 'approval-chime',", "key: 'approval-chime',", 'register entry key');
      return next;
    },
  },
  order: {
    what: 'order 从 16 改成 99（模拟"写错位置"）',
    // Measured (three identical runs in the t2 audit): a wrong `order` also trips the
    // "strictly between plugins(15) and agent-presets(20)" fence and the host projection.
    // The old one-entry declaration was incomplete; the checks themselves are unchanged.
    expectFail: [
      'order is 16 (right after 插件 at 15)',
      'order 16 falls strictly between plugins(15) and agent-presets(20)',
      'the host projection (sort by order) puts this row directly after 插件',
    ],
    apply(source) {
      return replaceOnce(source, "order: 16,", 'order: 99,', 'order');
    },
  },
  heading: {
    what: '删掉页面标题 h2（模拟"控件缺失"）',
    expectFail: ['the page heading is an <h2> carrying 通知提醒', 'exactly one <h2> on the page'],
    apply(source) {
      return replaceOnce(source, "React.createElement('h2', { className: 'dacTitle' }, t('title')),", 'null,', 'heading h2');
    },
  },
  picker: {
    what: '删掉卡片那张列表的 max-height 上限规则（模拟"播放下拉回归"；rev-12 后上限已是一条独立规则）',
    expectFail: [
      'the card list\'s ::picker(select) resolves box-sizing:content-box AND max-height:84px',
      '3 rows are exactly what the popup shows: max-height 84px = 3 x (line-height 20px + 4px padding x2)',
    ],
    apply(source) {
      return replaceOnce(source, "'.dacCard select::picker(select){max-height:' + String(TONE_ROWS * TONE_ROW_PX) + 'px;}',", '', 'card picker cap rule');
    },
  },
  rogue: {
    what: '在新分区之外又偷偷注册 settings.plugin.item（模拟"旧的没删干净"）',
    always: [
      'no settings.plugin.item registration ledger entry',
      'no settings.plugin.item slot was injected',
      'the "plugins tab" vocabulary is absent as well (no keyed-card leftovers)',
    ],
    // Measured in the t2 audit: a second inject/register also reddens the two slot-count
    // checks and the injected-slot-name list, on top of the three always-on invariants.
    // The old three-entry declaration was incomplete (it repeated `always`).
    expectFail: [
      'exactly two slots.inject happened (rev-10 adds the session-header bell)',
      'the injected slot names',
      'exactly two slots.register happened (the section + the bell)',
      'no settings.plugin.item registration ledger entry',
      'no settings.plugin.item slot was injected',
      'the "plugins tab" vocabulary is absent as well (no keyed-card leftovers)',
    ],
    apply(source) {
      const anchor = 'ctx.slots.inject(\'settings.section\', function () {';
      const at = source.indexOf(anchor);
      if (at < 0) throw new Error('mutation anchor not found');
      if (source.indexOf(anchor, at + anchor.length) >= 0) throw new Error('mutation anchor is not unique: settings.section inject');
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
report.same('lib/client.js byte count is what rev-20 claims', CLIENT_BYTES, 158549);
report.same(
  'lib/client.js sha256 is what rev-20 claims',
  CLIENT_SHA256,
  '4B6C8B91F0C294A0E2C561934C8ED627C7D3F937CFF33904A8FACA651A5949F3',
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
report.check('the intro line is present', text.includes('DSH 向你申请权限时响一次'), text.slice(0, 90));
report.check('the section carries the plugin data attribute for a browser probe', byType(tree, 'section')[0]?.props?.['data-plugin'] === 'dsh-approval-chime');
report.same('the bundleRevision badge shows the rev-20 stamp', textOf(byType(tree, 'span').find((node) => node.props.className === 'dacRev')), diagnostics.revision);
report.check('the revision stamp is the rev-20 one', /rev-20/.test(diagnostics.revision), diagnostics.revision);

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

const supportsBody = cssBlockBody(stylesheet ?? '', '@supports (appearance:base-select)');
const pickerCss = cssResolve(cssRules(supportsBody === null ? '' : supportsBody.body), CARD_PICKER_SELECTOR);
const optionCss = cssResolve(cssRules(supportsBody === null ? '' : supportsBody.body), CARD_OPTION_SELECTOR);
const pickerMaxHeight = cssValue(pickerCss, 'max-height');
report.check(
  'the card list\'s ::picker(select) resolves box-sizing:content-box AND max-height:84px',
  cssValue(pickerCss, 'box-sizing') === 'content-box' && pickerMaxHeight === '84px',
  `${pickerCss.participants.length} rule(s) name the card list: ${JSON.stringify(Object.fromEntries(pickerCss.declarations))}`,
);
report.check('the popup keeps border-radius:10px', /::picker\(select\)\{[^}]*border-radius:10px;/.test(stylesheet ?? ''), (stylesheet ?? '').match(/::picker\(select\)\{[^}]*border-radius:10px;/)?.[0]);
report.same('the declared row count is 3', diagnostics.toneRows, 3);
report.check(
  '3 rows are exactly what the popup shows: max-height 84px = 3 x (line-height 20px + 4px padding x2)',
  cssValue(optionCss, 'line-height') === '20px' && cssValue(optionCss, 'padding') === '4px 9px'
    && pickerMaxHeight === `${3 * (20 + 4 + 4)}px` && 3 * (20 + 4 + 4) === 84,
  `option line-height=${JSON.stringify(cssValue(optionCss, 'line-height'))}, option padding=${JSON.stringify(cssValue(optionCss, 'padding'))}, card max-height=${JSON.stringify(pickerMaxHeight)}, 3 rows=${3 * (20 + 4 + 4)}px`,
);
report.check('the popup scrolls rather than growing', /::picker\(select\)\{[^}]*overflow-y:auto;/.test(stylesheet ?? ''), (stylesheet ?? '').match(/::picker\(select\)\{[^}]*overflow-y:auto;/)?.[0]);
const fallbackOptionCss = cssResolve(cssRules(cssOutsideSupports(stylesheet ?? '')), CARD_OPTION_SELECTOR);
report.check(
  'the expanded popup inherits the card palette (option colours are stated)',
  (cssValue(fallbackOptionCss, 'background-color') ?? '').startsWith('var(--dsw-alias-bg-layer-1')
    && (cssValue(fallbackOptionCss, 'color') ?? '').startsWith('var(--dsw-alias-label-primary'),
  `card option fallback rules=${fallbackOptionCss.participants.length}: ${JSON.stringify(Object.fromEntries(fallbackOptionCss.declarations))}`,
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

/**
 * A mutant is "caught exactly as declared" when ALL THREE hold:
 *   1. every check in `expectFail` is red,
 *   2. NO check outside `expectFail` is red (a drifting red set means the declaration and
 *      the probe disagree -- one of them is wrong and the run must not hide that), and
 *   3. the evaluated bytes provably differ from the shipped ones (a dead/no-op mutation
 *      must never look like a pass).
 * Only that combination may exit 0 in mutation mode, which is the discipline
 * probe-11/probe-18/probe-19 already use. Before the t2 audit this probe exited 1 whenever
 * ANY check was red -- i.e. exactly when the mutation WAS caught -- so all five mutants
 * reported a false red and the driver, not the product, was the defect.
 */
let mutationCaught = false;

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
  const declared = new Set(MUTATION.expectFail);
  const surprise = [...FAILING_SET].filter((name) => !declared.has(name));
  report.check(
    `no undeclared check turned red under "${MUTATION.what}"`,
    surprise.length === 0,
    surprise.length === 0
      ? `the red set is exactly the ${declared.size} declared check(s) (measured ${FAILING_SET.size})`
      : `UNDECLARED red: ${JSON.stringify(surprise)}`,
  );
  for (const name of MUTATION.always ?? []) {
    report.check(`the always-on invariant "${name}" also failed (as required)`, FAILING_SET.has(name), FAILING_SET.has(name) ? 'failed as required' : 'unexpectedly still passed');
  }
  const evaluatedHash = createHash('sha256').update(Buffer.from(EVALUATED_SOURCE, 'utf8')).digest('hex').toUpperCase();
  const sourceChanged = evaluatedHash !== CLIENT_SHA256;
  report.check(
    'the mutation really rewrote the evaluated source',
    sourceChanged,
    `${Buffer.byteLength(EVALUATED_SOURCE, 'utf8')} vs ${CLIENT_BYTES} bytes; sha256 ${evaluatedHash.slice(0, 16)} vs ${CLIENT_SHA256.slice(0, 16)}${sourceChanged ? '' : ' — DEAD MUTATION: it changed nothing'}`,
  );
  mutationCaught = missing.length === 0 && surprise.length === 0 && sourceChanged;
}

/* --------------------------------------------------------------------- verdict */

const verdict = report.done();
// Mutation mode answers ONE question -- "was this mutant caught exactly as declared?" -- so
// the expected red assertions are the outcome under test, not a regression. Without
// --mutate the exit code is the plain shipped-suite verdict.
if (MUTATION !== null) process.exitCode = mutationCaught ? 0 : 1;
else if (verdict.failed > 0) process.exitCode = 1;
