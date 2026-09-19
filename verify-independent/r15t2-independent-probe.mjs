#!/usr/bin/env node
/**
 * r15-t2 — an INDEPENDENT failure-path probe for the rev-15 fix of OBS-A.
 *
 * Why this file exists: the round's self-test layer lives under `verify/` and was
 * written by the same hand that wrote the fix. This probe is the second opinion.
 * It is built from scratch:
 *   - the loader is a `node:vm` context created HERE (the real `lib/client.js`
 *     bytes run in it as a classic script, the way a `<script src>` would),
 *   - every platform service, the DOM node factory, the WebAudio graph and the
 *     HTTP exchange are stubs written HERE,
 *   - every check name is written HERE, and the probe re-derives the assertion
 *     texts that exist under `verify/` and refuses to share any of them with
 *     itself (check A5),
 *   - it observes the REAL render tree of the registered session-header entry and
 *     the REAL diagnostics surface the bundle installs on `window`, never the
 *     author's expectations.
 *
 * What it drives: the per-session override table is fetched from the Host route.
 * A table is read (success). A user-facing write lands. THEN the convergence
 * re-read that follows that write fails in four different ways (HTTP 500, network
 * rejection, synchronous throw, JSON body that cannot be parsed) plus one read
 * that never answers. For every one of them the probe asserts the four claims of
 * this round:
 *   1. the local override table is not dropped by a failed re-read,
 *   2. a muted session stays muted — no oscillator, counted as suppressed,
 *   3. the reason shows up on the popover's error line and disappears on recovery,
 *   4. after recovery the table equals the host file and nothing is in flight.
 *
 * `--mutant` mode: the shipped bytes are patched IN MEMORY ONLY, reverting the
 * `sessionsReadFailed` body to the rev-14 behaviour ("a failed read means the
 * overrides are gone"). The mutated text is what the vm runs; `lib/**` is never
 * written by this probe (check Z1 compares the on-disk hashes of `lib/**` taken
 * before and after the whole run). In that mode the probe requires the red set to
 * be NON-EMPTY and EXACTLY the set declared in {@link DECLARED_RED_SET}, and exits
 * 0 only when that holds — a mutant the probe cannot catch, or one that drags
 * extra checks red, is a probe failure, not a pass.
 *
 * Usage (run from anywhere; paths resolve from this file):
 *   node verify-independent/r15t2-independent-probe.mjs
 *   node verify-independent/r15t2-independent-probe.mjs --mutant
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(HERE, '..');
const LIB_DIR = join(PLUGIN_DIR, 'lib');
const CLIENT_PATH = join(LIB_DIR, 'client.js');
const VERIFY_DIR = join(PLUGIN_DIR, 'verify');
const RAW_DIR = join(HERE, '_raw');

/** The frozen rev-20 bytes this probe is anchored to (t7 close-out). */
const FROZEN = {
  sha256: '4B6C8B91F0C294A0E2C561934C8ED627C7D3F937CFF33904A8FACA651A5949F3',
  bytes: 158549,
  revision: 'rev-20 · the caret turn takes 160 ms',
};

const SESSIONS_ROUTE = '/api/approval-chime/sessions';

/** The shipped file is CRLF throughout; the anchor keeps that style byte for byte. */
const EOL = '\r\n';

/** The line the fix lives on: kept whole so the anchor can only match one site. */
const ANCHOR = [
  '      function sessionsReadFailed(message) {',
  '        sessions.error = message;',
  '        publish();',
  '        return false;',
  '      }',
].join(EOL);

/** The rev-14 direction, restored by hand (in memory) for the falsification run. */
const MUTANT = [
  '      function sessionsReadFailed(message) {',
  '        // r15-t2 regression mutant (authored by the verifier for this probe):',
  '        // a failed read is taken as proof that every override is gone, which is',
  '        // exactly the direction the rev-15 fix exists to remove.',
  '        sessions.table = Object.create(null);',
  '        sessions.ready = false;',
  '        sessions.revision = null;',
  '        sessions.error = message;',
  '        publish();',
  '        return false;',
  '      }',
].join(EOL);

/**
 * The checks that MUST be red when the mutant runs. Declared before the mutant is
 * ever executed; the mutant run passes only if the actual red set equals this set.
 */
const DECLARED_RED_SET = [
  'B-keys: the failed re-read keeps every session key',
  'B-fields: the failed re-read keeps every field of every record',
  'B-ready: the failed re-read keeps the table known',
  'B-revision: the failed re-read keeps the revision',
  'B-mute: the muted session does not sound after the failed re-read',
  'B-mute-count: the muted session is counted as suppressed, not played',
  'B-bell: the render tree still shows this session as muted',
  'D-reject: the failed read keeps the table',
  'D-throw: the failed read keeps the table',
  'D-badjson: the failed read keeps the table',
];

/** Reasons the stub hands back, so the error line can be traced to its source. */
const READ_FAILURE_REASON = 'stub read failure: the sessions file could not be read (EACCES)';
const REJECT_REASON = 'stub network down: the read was refused';
const THROW_REASON = 'stub transport threw before the request left';
const BAD_JSON_REASON = 'the Host refused the per-session request (200)';

const AUTHOR = "the version of the bundle this repo ships as rev-20";
void AUTHOR; // kept only so the anchor comment above reads naturally

/* ------------------------------------------------------------------ utilities */

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').toUpperCase();
}

function countOccurrences(haystack, needle) {
  if (needle.length === 0) return 0;
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at >= 0) {
    count += 1;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return count;
}

function hashTree(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(root);
  files.sort();
  return files.map((file) => ({
    path: relative(PLUGIN_DIR, file).split('\\').join('/'),
    bytes: statSync(file).size,
    sha256: sha256(readFileSync(file, 'utf8')),
  }));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Field-by-field table comparison; JSON.stringify is order-sensitive and unusable. */
function sameTable(left, right) {
  const leftIds = Object.keys(left).sort();
  const rightIds = Object.keys(right).sort();
  if (leftIds.join('\u0000') !== rightIds.join('\u0000')) return false;
  for (const id of leftIds) {
    const a = left[id] ?? {};
    const b = right[id] ?? {};
    const fields = ['enabled', 'volume', 'tone', 'updatedAt'];
    for (const field of fields) {
      if (a[field] !== b[field]) return false;
    }
    const extra = Object.keys(a).concat(Object.keys(b)).filter((key) => !fields.includes(key));
    if (extra.length > 0) return false;
  }
  return true;
}

function firstTableDifference(left, right) {
  const leftIds = Object.keys(left).sort();
  const rightIds = Object.keys(right).sort();
  if (leftIds.join('\u0000') !== rightIds.join('\u0000')) {
    return `keys left=[${leftIds.join(',')}] right=[${rightIds.join(',')}]`;
  }
  for (const id of leftIds) {
    const a = left[id] ?? {};
    const b = right[id] ?? {};
    for (const field of ['enabled', 'volume', 'tone', 'updatedAt']) {
      if (a[field] !== b[field]) return `${id}.${field}: ${JSON.stringify(a[field])} -> ${JSON.stringify(b[field])}`;
    }
  }
  return 'no difference';
}

/* ------------------------------------------------------------------ reporter */

function createReporter() {
  const checks = [];
  const record = (name, passed, detail) => {
    const text = detail === undefined || detail === null || detail === '' ? '' : ` — ${detail}`;
    checks.push({ name, passed: passed === true, detail: String(detail ?? '') });
    console.log(`${passed === true ? '[ ok ]' : '[RED ]'} ${name}${text}`);
    return passed === true;
  };
  return {
    checks,
    check: record,
    equal(name, actual, expected, detail) {
      return record(name, Object.is(actual, expected), `${detail === undefined ? '' : detail + ' '}actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
    },
    failNames() {
      return checks.filter((check) => !check.passed).map((check) => check.name);
    },
  };
}

/* ------------------------------------------------------- verify/ text overlap */

/** The assertion methods the self-tests call (names only; bodies are never read). */
const ASSERTION_METHODS = ['check', 'equal', 'deepEqual', 'ok', 'close', 'skip'];

function readStringLiteral(source, from) {
  const quote = source[from];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  let out = '';
  let index = from + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      out += source[index + 1] ?? '';
      index += 2;
      continue;
    }
    if (char === quote) return { text: out, dynamic: quote === '`' && out.includes('${'), end: index + 1 };
    out += char;
    index += 1;
  }
  return null;
}

/** Every string literal handed to `report.<assertion>(...)` in one source file. */
function assertionNamesOf(source) {
  const names = [];
  for (const method of ASSERTION_METHODS) {
    let at = 0;
    const needle = `.${method}(`;
    while (at < source.length) {
      const found = source.indexOf(needle, at);
      if (found < 0) break;
      at = found + needle.length;
      let index = at;
      while (index < source.length && /\s/.test(source[index])) index += 1;
      const literal = readStringLiteral(source, index);
      if (literal !== null && literal.dynamic !== true && literal.text.length > 0) names.push(literal.text);
    }
  }
  return names;
}

function verifyAssertionTexts() {
  const texts = new Map();
  for (const entry of readdirSync(VERIFY_DIR)) {
    if (!entry.endsWith('.mjs')) continue;
    const source = readFileSync(join(VERIFY_DIR, entry), 'utf8');
    for (const name of assertionNamesOf(source)) {
      if (!texts.has(name)) texts.set(name, entry);
    }
  }
  return texts;
}

/* ------------------------------------------------------------------- the DOM */

function createDocumentStub() {
  const listeners = new Map();
  const created = [];
  const document = {
    listeners,
    created,
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      const set = listeners.get(type);
      if (set) set.delete(handler);
    },
    getElementById(id) {
      return created.find((element) => element.id === id) ?? null;
    },
    createElement(tag) {
      const element = {
        tag,
        id: '',
        textContent: '',
        attributes: {},
        children: [],
        setAttribute(key, value) {
          element.attributes[key] = value;
        },
        appendChild(child) {
          element.children.push(child);
          return child;
        },
      };
      created.push(element);
      return element;
    },
    head: {
      children: [],
      appendChild(child) {
        document.head.children.push(child);
        return child;
      },
    },
  };
  return document;
}

/* ------------------------------------------------------------------ WebAudio */

function createAudioRecorder() {
  const record = { instances: [], gains: [], oscillators: [], started: [], connections: [], resumes: 0 };
  function AudioContextStub() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = { kind: 'destination' };
    record.instances.push(this);
    this.resume = () => {
      record.resumes += 1;
      this.state = 'running';
      return Promise.resolve();
    };
    this.createGain = () => {
      const node = {
        kind: 'gain',
        gain: {
          value: 1,
          setValueAtTime(value) {
            node.gain.value = value;
          },
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect(target) {
          record.connections.push({ from: node, to: target });
          return target;
        },
        disconnect() {},
      };
      record.gains.push(node);
      return node;
    };
    this.createOscillator = () => {
      const node = {
        kind: 'oscillator',
        type: 'sine',
        frequency: { value: 0 },
        startedAt: null,
        connect(target) {
          record.connections.push({ from: node, to: target });
          return target;
        },
        disconnect() {},
        start(at) {
          node.startedAt = at;
          record.started.push({ node, at });
        },
        stop() {},
      };
      record.oscillators.push(node);
      return node;
    };
  }
  return { AudioContext: AudioContextStub, record };
}

/* --------------------------------------------------------------- React hooks */

function createHookRuntime() {
  const slots = [];
  const effectSlots = [];
  let index = 0;
  const react = {
    createElement(type, props, ...children) {
      return {
        type,
        props: props === null || props === undefined ? {} : props,
        children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false),
      };
    },
    useState(initial) {
      const slot = index;
      index += 1;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      const set = (value) => {
        slots[slot] = typeof value === 'function' ? value(slots[slot]) : value;
      };
      return [slots[slot], set];
    },
    useEffect(callback) {
      const slot = index;
      index += 1;
      const existing = effectSlots.find((effect) => effect.slot === slot);
      if (existing === undefined) effectSlots.push({ slot, callback });
      else existing.callback = callback;
    },
    useRef(initial) {
      const slot = index;
      index += 1;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
  };
  return {
    react,
    render(Component, props) {
      index = 0;
      return Component(props);
    },
    runEffects() {
      const disposers = [];
      for (const effect of [...effectSlots]) {
        const dispose = effect.callback();
        if (typeof dispose === 'function') disposers.push(dispose);
      }
      return disposers;
    },
  };
}

function walkTree(node, visit) {
  if (node === null || node === undefined || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walkTree(child, visit);
    return;
  }
  visit(node);
  walkTree(node.children, visit);
}

function nodesWhere(tree, predicate) {
  const found = [];
  walkTree(tree, (node) => {
    if (node.type !== undefined && predicate(node)) found.push(node);
  });
  return found;
}

function nodesByClass(tree, className) {
  return nodesWhere(tree, (node) => node.props !== undefined && node.props.className === className);
}

function flattenText(node) {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (node === null || node === undefined || typeof node !== 'object') return '';
  if (Array.isArray(node)) return node.map(flattenText).join(' ');
  return (node.children ?? []).map(flattenText).join(' ');
}

/* ------------------------------------------------------------- the host model */

function createHostStub(initialFile) {
  const calls = [];
  const file = {};
  for (const id of Object.keys(initialFile)) file[id] = { ...initialFile[id] };
  const state = { mode: 'ok', sampleOnRead: null, lastSample: null, sampleError: null };
  let revision = 11;

  const answer = (status, body) => ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(clone(body)) });
  const tableAnswer = () => answer(200, { ok: true, revision, sessions: clone(file) });

  const applyPatch = (sessionId, patch) => {
    const record = { ...(file[sessionId] ?? {}) };
    for (const field of ['enabled', 'volume', 'tone']) {
      if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
      const value = patch[field];
      if (value === undefined) continue;
      if (value === null) delete record[field];
      else record[field] = value;
    }
    const empty = ['enabled', 'volume', 'tone'].every((field) => record[field] === undefined);
    if (empty) delete file[sessionId];
    else {
      record.updatedAt = Date.now();
      file[sessionId] = record;
    }
    revision += 1;
    return tableAnswer();
  };

  const fetchStub = (url, init) => {
    const method = init !== null && init !== undefined && init.method === 'POST' ? 'POST' : 'GET';
    calls.push({ method, url, body: init !== null && init !== undefined && typeof init.body === 'string' ? init.body : null, mode: state.mode });
    if (method === 'POST') {
      const payload = JSON.parse(init.body);
      return applyPatch(payload.sessionId, payload.patch);
    }
    // The failing read is what the table must survive: sample what is known at the
    // moment the request leaves, so "before the failure" is observed, not assumed.
    if (typeof state.sampleOnRead === 'function') {
      try {
        state.lastSample = state.sampleOnRead();
      } catch (error) {
        state.sampleError = String(error);
      }
      state.sampleOnRead = null;
    }
    if (state.mode === 'ok') return tableAnswer();
    if (state.mode === 'http500') return answer(500, { ok: false, error: READ_FAILURE_REASON });
    if (state.mode === 'reject') return Promise.reject(new TypeError(REJECT_REASON));
    if (state.mode === 'throw') throw new Error(THROW_REASON);
    if (state.mode === 'timeout') return new Promise(() => {});
    if (state.mode === 'badjson') return { ok: true, status: 200, json: () => Promise.reject(new SyntaxError('stub body is not JSON')) };
    throw new Error(`unknown stub mode ${state.mode}`);
  };

  return { fetchStub, calls, file, state, revisionCounter: () => revision };
}

/* ---------------------------------------------------------------- the sandbox */

function createWorld(sourceText) {
  const warnings = [];
  const sandboxConsole = {
    log() {},
    info() {},
    debug() {},
    warn(...args) {
      warnings.push(args.map((value) => String(value)).join(' '));
    },
    error(...args) {
      warnings.push(args.map((value) => String(value)).join(' '));
    },
  };

  const sandbox = { console: sandboxConsole, setTimeout, clearTimeout, setInterval, clearInterval };
  const context = vm.createContext(sandbox);
  vm.runInContext('globalThis.window = globalThis;', context);

  const document = createDocumentStub();
  const windowListeners = new Map();
  context.window.document = document;
  context.window.addEventListener = (type, handler) => {
    if (!windowListeners.has(type)) windowListeners.set(type, new Set());
    windowListeners.get(type).add(handler);
  };
  context.window.removeEventListener = (type, handler) => {
    const set = windowListeners.get(type);
    if (set) set.delete(handler);
  };
  context.window.innerWidth = 1280;
  context.window.innerHeight = 800;

  const registrations = [];
  context.window.__ModuleLoader__ = {
    load(registration) {
      registrations.push(registration);
    },
  };

  const audio = createAudioRecorder();
  context.window.AudioContext = audio.AudioContext;

  const host = createHostStub({
    'sess-alpha': { enabled: false, updatedAt: 1000 },
    'sess-beta': { volume: 30, updatedAt: 2000 },
  });
  context.window.fetch = host.fetchStub;

  let loadError = null;
  try {
    vm.runInContext(sourceText, context, { filename: 'lib/client.js (probe copy)' });
  } catch (error) {
    loadError = error;
  }

  const runtime = createHookRuntime();
  const requires = [];
  const registration = registrations.length === 1 ? registrations[0] : null;
  let contract = null;
  if (registration !== null && typeof registration.factory === 'function') {
    contract = registration.factory((specifier) => {
      requires.push(specifier);
      if (specifier === 'react') return runtime.react;
      throw new Error(`the bundle asked for an unexpected seed module: ${specifier}`);
    });
  }

  const state = {
    injected: [],
    slots: [],
    localeRegistrations: [],
    bindSpecs: [],
    effects: [],
    pendingListeners: new Set(),
    pendingSnapshot: new Map(),
    remoteSubscriptions: [],
  };
  const scopeListeners = new Set();
  const scopeSnapshot = {
    status: 'ready',
    value: { enabled: true, volume: 70, tone: 'chime' },
    base: {},
    user: {},
    revision: 1,
    writable: true,
    mode: 'host',
  };
  const scope = {
    getSnapshot: () => scopeSnapshot,
    subscribe: (listener) => {
      scopeListeners.add(listener);
      return () => scopeListeners.delete(listener);
    },
    set: () => Promise.resolve(),
    unset: () => Promise.resolve(),
  };
  const ctx = {
    effect(callback, label) {
      let dispose = null;
      try {
        dispose = callback();
      } catch (error) {
        warnings.push(`effect ${String(label)} threw: ${String(error)}`);
      }
      state.effects.push({ label, dispose });
      return typeof dispose === 'function' ? dispose : () => {};
    },
    slots: {
      inject(name, callback) {
        state.injected.push(name);
        return callback();
      },
      register(options, component) {
        state.slots.push({ options, component });
        return () => {};
      },
    },
    locale: {
      register(ns, dictionary) {
        state.localeRegistrations.push({ ns, dictionary });
        return () => {};
      },
      bind: (ns) => (key) => {
        for (const localeId of ['zh', 'en']) {
          for (const entry of state.localeRegistrations) {
            if (entry.ns !== ns) continue;
            const value = entry.dictionary?.[localeId]?.[key];
            if (typeof value === 'string') return value;
          }
        }
        return key;
      },
      subscribe: () => () => {},
      getSnapshot: () => ({ revision: 0 }),
    },
    settingsScope: {
      bind(spec) {
        state.bindSpecs.push(spec);
        return scope;
      },
      describe: () => ({ getSnapshot: () => ({ view: { writable: true, namespaces: [] } }), subscribe: () => () => {}, ensure() {} }),
    },
    uiSession: {
      pendingInteractions: {
        getSnapshot: () => state.pendingSnapshot,
        subscribe(listener) {
          state.pendingListeners.add(listener);
          return () => state.pendingListeners.delete(listener);
        },
      },
    },
    remote: {
      $on(event, listener) {
        state.remoteSubscriptions.push({ event, listener });
        return () => {};
      },
    },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
  };

  let applyError = null;
  if (contract !== null && typeof contract.apply === 'function') {
    try {
      contract.apply(ctx);
    } catch (error) {
      applyError = error;
    }
  }

  const diagnostics = context.window.__DSH_APPROVAL_CHIME__ ?? null;

  const pushPending = (entries) => {
    const next = new Map();
    for (const [sessionId, interaction] of entries) next.set(sessionId, interaction);
    state.pendingSnapshot = next;
    for (const listener of [...state.pendingListeners]) listener();
    return next;
  };

  /* The table is read back by the bundle; the stub samples on request, so install
   * the sampler through the host stub. */
  host.state.sampleOnRead = null;

  return {
    context,
    document,
    audio,
    host,
    runtime,
    requires,
    registration,
    contract,
    state,
    scope,
    ctx,
    diagnostics,
    warnings,
    loadError,
    applyError,
    pushPending,
    translator: ctx.locale.bind('approval-chime'),
    sessionSlotName: 'conversation.session.header.actions',
  };
}

/* ----------------------------------------------------------------- utilities 2 */

function settle(rounds = 8) {
  return new Promise((resolveTick) => {
    let left = rounds;
    const step = () => {
      left -= 1;
      if (left <= 0) resolveTick();
      else setImmediate(step);
    };
    setImmediate(step);
  });
}

function sleep(ms) {
  return new Promise((resolveTick) => setTimeout(resolveTick, ms));
}

/* -------------------------------------------------------------------- scenario */

async function runScenario(world, report) {
  const { diagnostics, host, audio, runtime, pushPending } = world;

  /* ---- A: the first read lands and the popover renders ------------------ */

  await settle();
  const warm = diagnostics.sessions();
  report.check(
    'A-warm: the first read lands and both records are known',
    warm.ready === true &&
      warm.error === '' &&
      Object.keys(warm.sessions).length === 2 &&
      warm.sessions['sess-alpha']?.enabled === false &&
      warm.sessions['sess-beta']?.volume === 30,
    JSON.stringify(warm),
  );
  report.check(
    'A-warm: the route the bundle used is the documented one',
    host.calls.length > 0 && host.calls.every((call) => call.url === SESSIONS_ROUTE),
    `${host.calls.length} call(s), first url=${JSON.stringify(host.calls[0]?.url ?? null)}`,
  );
  report.check(
    'A-warm: no session write is in flight after the first read',
    diagnostics.sessionWrites().outstanding === 0,
    JSON.stringify(diagnostics.sessionWrites()),
  );

  const slot = world.state.slots.find((entry) => entry.options.name === world.sessionSlotName);
  report.check(
    'A-bell: the session header entry is registered by the bundle',
    slot !== undefined && typeof slot.component === 'function',
    `slots=${world.state.slots.map((entry) => entry.options.name).join(',')}`,
  );
  if (slot === undefined) return;

  const props = { sessionId: 'sess-alpha', t: world.translator };
  let tree = runtime.render(slot.component, props);
  runtime.runEffects();
  const caret = nodesByClass(tree, 'dacCaret')[0];
  if (caret !== undefined) caret.props.onClick();
  tree = runtime.render(slot.component, props);
  const popovers = nodesByClass(tree, 'dacPop');
  report.check(
    'A-popover: the caret opens one box with no error row while nothing failed',
    popovers.length === 1 && nodesByClass(tree, 'dacPopError').length === 0,
    `popovers=${popovers.length} errorRows=${nodesByClass(tree, 'dacPopError').length}`,
  );

  /* ---- B: a write lands, then the convergence re-read fails ------------- */

  host.state.mode = 'http500';
  host.state.sampleOnRead = () => clone(diagnostics.sessions());
  const writeOutcome = await diagnostics.toggleSession('sess-beta');
  await settle();

  const before = host.state.lastSample;
  const after = diagnostics.sessions();

  report.check(
    'B-write: the user-facing write reached the host model',
    host.file['sess-beta']?.enabled === false && host.file['sess-beta']?.volume === 30,
    `host file now ${JSON.stringify(host.file['sess-beta'] ?? null)}; the promise answered ${String(writeOutcome)} because the convergence re-read that follows the write failed`,
  );
  report.check(
    'B-before: the read that failed started from a known table',
    before !== null &&
      before.ready === true &&
      before.sessions['sess-alpha']?.enabled === false &&
      before.sessions['sess-beta']?.enabled === false,
    JSON.stringify(before),
  );

  const beforeTable = before === null ? {} : before.sessions;
  report.check(
    'B-keys: the failed re-read keeps every session key',
    JSON.stringify(Object.keys(beforeTable).sort()) === JSON.stringify(Object.keys(after.sessions).sort()),
    `left=[${Object.keys(beforeTable).sort().join(',')}] right=[${Object.keys(after.sessions).sort().join(',')}]`,
  );
  report.check(
    'B-fields: the failed re-read keeps every field of every record',
    sameTable(beforeTable, after.sessions),
    firstTableDifference(beforeTable, after.sessions),
  );
  report.check(
    'B-ready: the failed re-read keeps the table known',
    after.ready === true && after.ready === before?.ready,
    `before.ready=${JSON.stringify(before?.ready)} after.ready=${JSON.stringify(after.ready)}`,
  );
  report.check(
    'B-revision: the failed re-read keeps the revision',
    typeof after.revision === 'number' && after.revision === before?.revision,
    `before.revision=${JSON.stringify(before?.revision)} after.revision=${JSON.stringify(after.revision)}`,
  );
  report.check(
    'B-error: the failed re-read reports its reason on the error line',
    typeof after.error === 'string' && after.error.includes(READ_FAILURE_REASON),
    JSON.stringify(after.error),
  );
  report.check(
    'B-inflight: the failed re-read leaves no session write in flight',
    diagnostics.sessionWrites().outstanding === 0,
    JSON.stringify(diagnostics.sessionWrites()),
  );

  /* ---- B: the muted session must stay silent --------------------------- */

  const statsBefore = diagnostics.stats();
  const oscillatorsBefore = audio.record.oscillators.length;
  pushPending([['sess-alpha', { sessionId: 'sess-alpha', kind: 'approval', key: 'probe-failed-read-1' }]]);
  await settle();
  await sleep(40);
  const statsAfter = diagnostics.stats();
  const oscillatorsAfter = audio.record.oscillators.length;

  report.check(
    'B-mute: the muted session does not sound after the failed re-read',
    statsAfter.triggers === statsBefore.triggers && oscillatorsAfter === oscillatorsBefore,
    `triggers ${statsBefore.triggers}->${statsAfter.triggers}, oscillators ${oscillatorsBefore}->${oscillatorsAfter}`,
  );
  report.check(
    'B-mute-count: the muted session is counted as suppressed, not played',
    statsAfter.suppressedSession === statsBefore.suppressedSession + 1 &&
      statsAfter.lastBatchPlayed === 0 &&
      statsAfter.lastBatchSize === 1,
    `suppressedSession ${statsBefore.suppressedSession}->${statsAfter.suppressedSession}, lastBatchSize=${statsAfter.lastBatchSize}, lastBatchPlayed=${statsAfter.lastBatchPlayed}`,
  );

  tree = runtime.render(slot.component, props);
  const bellNode = nodesByClass(tree, 'dacBell')[0];
  report.check(
    'B-bell: the render tree still shows this session as muted',
    bellNode !== undefined && bellNode.props['data-muted'] === 'true',
    `data-muted=${JSON.stringify(bellNode?.props['data-muted'] ?? null)}`,
  );
  const errorRows = nodesByClass(tree, 'dacPopError');
  report.check(
    'B-popover: the popover error row carries the reason',
    errorRows.length === 1 && typeof after.error === 'string' && after.error.length > 0 && flattenText(errorRows[0]).includes(after.error),
    `rows=${errorRows.length} text=${JSON.stringify(flattenText(errorRows[0] ?? null))}`,
  );

  /* ---- C: recovery ------------------------------------------------------ */

  host.state.mode = 'ok';
  const recovered = await diagnostics.refreshSessions();
  await settle();
  const afterRecovery = diagnostics.sessions();
  report.check(
    'C-error: a landed read clears the error line',
    recovered === true && afterRecovery.error === '',
    `returned=${String(recovered)} error=${JSON.stringify(afterRecovery.error)}`,
  );
  report.check(
    'C-table: the recovered table equals the host file field-by-field',
    sameTable(afterRecovery.sessions, host.file),
    firstTableDifference(afterRecovery.sessions, host.file),
  );
  report.check(
    'C-inflight: no session write is left in flight after recovery',
    diagnostics.sessionWrites().outstanding === 0,
    JSON.stringify(diagnostics.sessionWrites()),
  );
  tree = runtime.render(slot.component, props);
  report.check(
    'C-popover: the error row is gone after recovery',
    nodesByClass(tree, 'dacPopError').length === 0 && nodesByClass(tree, 'dacPop').length === 1,
    `errorRows=${nodesByClass(tree, 'dacPopError').length} popovers=${nodesByClass(tree, 'dacPop').length}`,
  );

  const statsPreRecovered = diagnostics.stats();
  const oscillatorsPreRecovered = audio.record.oscillators.length;
  pushPending([['sess-alpha', { sessionId: 'sess-alpha', kind: 'approval', key: 'probe-after-recovery-1' }]]);
  await settle();
  await sleep(40);
  const statsPostRecovered = diagnostics.stats();
  report.check(
    'C-mute: after recovery the mute suppresses a fresh approval again',
    statsPostRecovered.triggers === statsPreRecovered.triggers &&
      statsPostRecovered.suppressedSession === statsPreRecovered.suppressedSession + 1 &&
      audio.record.oscillators.length === oscillatorsPreRecovered,
    `triggers ${statsPreRecovered.triggers}->${statsPostRecovered.triggers}, suppressedSession ${statsPreRecovered.suppressedSession}->${statsPostRecovered.suppressedSession}`,
  );

  /* ---- D: the other ways a read can fail ------------------------------- */

  const failureModes = [
    { mode: 'reject', name: 'network rejection', reason: REJECT_REASON },
    { mode: 'throw', name: 'synchronous throw', reason: THROW_REASON },
    { mode: 'badjson', name: 'unparseable answer', reason: BAD_JSON_REASON },
  ];
  for (const entry of failureModes) {
    host.state.mode = 'ok';
    await diagnostics.refreshSessions();
    await settle();
    const known = diagnostics.sessions();
    report.check(
      `D-${entry.mode}: the table is known again before the ${entry.name}`,
      known.ready === true && Object.keys(known.sessions).length === 2 && known.sessions['sess-alpha']?.enabled === false,
      JSON.stringify(known.sessions),
    );
    host.state.mode = entry.mode;
    await diagnostics.refreshSessions();
    await settle();
    const post = diagnostics.sessions();
    report.check(
      `D-${entry.mode}: the failed read keeps the table`,
      sameTable(known.sessions, post.sessions) && post.ready === known.ready && post.revision === known.revision,
      `${firstTableDifference(known.sessions, post.sessions)} ready ${JSON.stringify(known.ready)}->${JSON.stringify(post.ready)} revision ${JSON.stringify(known.revision)}->${JSON.stringify(post.revision)}`,
    );
    report.check(
      `D-${entry.mode}: the failed read reports its reason`,
      typeof post.error === 'string' && post.error.includes(entry.reason),
      JSON.stringify(post.error),
    );
  }

  host.state.mode = 'ok';
  await diagnostics.refreshSessions();
  await settle();
  const knownTimeout = diagnostics.sessions();
  report.check(
    'D-timeout: the table is known again before the unanswered read',
    knownTimeout.ready === true && knownTimeout.sessions['sess-alpha']?.enabled === false,
    JSON.stringify(knownTimeout.sessions),
  );
  host.state.mode = 'timeout';
  const neverSettles = diagnostics.refreshSessions();
  await sleep(80);
  const postTimeout = diagnostics.sessions();
  report.check(
    'D-timeout: an unanswered read leaves the table and the error line untouched',
    sameTable(knownTimeout.sessions, postTimeout.sessions) &&
      postTimeout.ready === knownTimeout.ready &&
      postTimeout.revision === knownTimeout.revision &&
      postTimeout.error === '',
    `${firstTableDifference(knownTimeout.sessions, postTimeout.sessions)} ready ${JSON.stringify(knownTimeout.ready)}->${JSON.stringify(postTimeout.ready)} error=${JSON.stringify(postTimeout.error)}`,
  );
  host.state.mode = 'ok';
  neverSettles.catch(() => {});

  report.check(
    'D-settle: no probe warning came out of the bundle during the run',
    world.warnings.length === 0,
    world.warnings.join(' | '),
  );
}

/* ------------------------------------------------------------------------ main */

async function main() {
  const mutantMode = process.argv.includes('--mutant');
  const report = createReporter();

  const shippedText = readFileSync(CLIENT_PATH, 'utf8');
  const shippedHash = sha256(shippedText);
  const libBefore = hashTree(LIB_DIR);

  report.check(
    'A1: lib/client.js is the frozen rev-20 byte sequence',
    shippedHash === FROZEN.sha256 && Buffer.byteLength(shippedText, 'utf8') === FROZEN.bytes,
    `sha256=${shippedHash} bytes=${Buffer.byteLength(shippedText, 'utf8')} expected=${FROZEN.sha256}/${FROZEN.bytes}`,
  );

  const anchorCount = countOccurrences(shippedText, ANCHOR);
  report.check('A2: the mutation anchor matches exactly one site', anchorCount === 1, `matches=${anchorCount}`);

  const verifyTexts = verifyAssertionTexts();
  const probeSource = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const hits = [];
  for (const [text, file] of verifyTexts) {
    if (probeSource.includes(text)) hits.push(`${file}: ${text}`);
  }
  report.check(
    'A3: no assertion text from verify/ appears in this probe',
    hits.length === 0,
    `${verifyTexts.size} distinct assertion texts compared, ${hits.length} hit(s)${hits.length > 0 ? ' :: ' + hits.join(' | ') : ''}`,
  );

  let sourceText = shippedText;
  let sourceLabel = 'shipped rev-20 bytes';
  if (mutantMode) {
    const at = shippedText.indexOf(ANCHOR);
    const mutantText = shippedText.slice(0, at) + MUTANT + shippedText.slice(at + ANCHOR.length);
    const mutantHash = sha256(mutantText);
    report.check('A4: the mutant is not the shipped byte sequence', mutantHash !== shippedHash, `mutant=${mutantHash} shipped=${shippedHash}`);
    report.check(
      'A5: only the anchor span differs between shipped bytes and mutant',
      mutantText.startsWith(shippedText.slice(0, at)) &&
        mutantText.endsWith(shippedText.slice(at + ANCHOR.length)) &&
        mutantText.length === shippedText.length - ANCHOR.length + MUTANT.length,
      `unchanged prefix=${Buffer.byteLength(shippedText.slice(0, at), 'utf8')}B suffix=${Buffer.byteLength(shippedText.slice(at + ANCHOR.length), 'utf8')}B, ` +
        `anchor=${Buffer.byteLength(ANCHOR, 'utf8')}B -> mutant span=${Buffer.byteLength(MUTANT, 'utf8')}B, ` +
        `whole file ${Buffer.byteLength(shippedText, 'utf8')}B -> ${Buffer.byteLength(mutantText, 'utf8')}B`,
    );
    sourceText = mutantText;
    sourceLabel = `rev-14 regression mutant (in memory) sha256=${mutantHash}`;
    try {
      writeFileSync(join(RAW_DIR, 'r15-t2-mutant-copy-lib-client.js.txt'), mutantText, 'utf8');
    } catch (error) {
      report.check('A6: the mutant could be dumped for audit', false, String(error));
    }
  }

  console.log(`\n# source under test: ${sourceLabel}\n`);

  const world = createWorld(sourceText);
  report.check(
    'B0: the bundle loaded as a classic script and registered one module',
    world.loadError === null && world.registration !== null && world.registration.id === 'dsh-approval-chime',
    world.loadError === null ? `id=${String(world.registration?.id)}` : String(world.loadError),
  );
  report.check(
    'B0: the factory answered the plugin contract and apply() ran',
    world.contract !== null &&
      typeof world.contract.apply === 'function' &&
      Array.isArray(world.contract.inject) &&
      world.applyError === null &&
      world.diagnostics !== null,
    `inject=[${(world.contract?.inject ?? []).join(',')}] diagnostics=${world.diagnostics === null ? 'missing' : 'present'}`,
  );
  report.check(
    'B0: the bundle only asked for react',
    world.requires.length === 1 && world.requires[0] === 'react',
    `requires=[${world.requires.join(',')}]`,
  );
  report.check(
    'B0: the bundle reports the revision it was built from',
    typeof world.diagnostics?.revision === 'string' && world.diagnostics.revision === FROZEN.revision,
    JSON.stringify(world.diagnostics?.revision ?? null),
  );

  if (world.diagnostics !== null && world.loadError === null) {
    await runScenario(world, report);
  }

  const libAfter = hashTree(LIB_DIR);
  report.check(
    'Z1: lib/** carries the same bytes before and after the run',
    JSON.stringify(libBefore) === JSON.stringify(libAfter),
    libAfter.map((entry) => `${entry.path} ${entry.sha256.slice(0, 12)} ${entry.bytes}B`).join(' | '),
  );

  const red = report.failNames();
  const passed = report.checks.length - red.length;

  if (!mutantMode) {
    console.log(`\n=== shipped rev-20 run: ${passed}/${report.checks.length} checks passed ===`);
    for (const name of red) console.log(`  RED: ${name}`);
    console.log(`exit ${red.length === 0 ? 0 : 1}`);
    process.exitCode = red.length === 0 ? 0 : 1;
    return;
  }

  const declared = [...DECLARED_RED_SET].sort();
  const actual = [...red].sort();
  const identical = declared.length === actual.length && declared.every((name, index) => name === actual[index]);
  console.log('\n--- mutant verdict ---');
  console.log(`declared red set (${declared.length}):`);
  for (const name of declared) console.log(`  - ${name}`);
  console.log(`actual red set (${actual.length}):`);
  for (const name of actual) console.log(`  - ${name}`);
  const nonEmpty = actual.length > 0;
  const verdict = nonEmpty && identical;
  console.log(`M1: the red set is non-empty: ${nonEmpty ? 'yes' : 'NO'}`);
  console.log(`M2: the red set equals the declared set exactly: ${identical ? 'yes' : 'NO'}`);
  console.log(`=== mutant run: ${passed}/${report.checks.length} checks passed, ${actual.length} red, declared ${declared.length} ===`);
  console.log(`exit ${verdict ? 0 : 1}`);
  process.exitCode = verdict ? 0 : 1;
}

await main();
