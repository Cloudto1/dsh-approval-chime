/**
 * Independent probe kit — task t3 (verifier).
 *
 * Written from scratch for the independent verification pass. It imports NOTHING
 * from `dsh-approval-chime/verify/` (the developer's self-test harness): the
 * reporter, the classic-script loader, the React hook driver, the WebAudio
 * recorder and the fake plugin context below are all separate implementations,
 * so a bug in the developer's scaffolding cannot make these probes pass.
 *
 * Only the two REAL plugin files under test are shared with the implementation:
 *   lib/client.js  (run as a classic script inside a `node:vm` context)
 *   lib/index.js   (imported as an ES module)
 */

import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

export const KIT_DIR = dirname(fileURLToPath(import.meta.url));
export const INDEPENDENT_DIR = resolve(KIT_DIR, '..');
export const PLUGIN_DIR = resolve(INDEPENDENT_DIR, '..');
export const CLIENT_PATH = join(PLUGIN_DIR, 'lib', 'client.js');
export const HOST_PATH = join(PLUGIN_DIR, 'lib', 'index.js');
export const PACKAGE_PATH = join(PLUGIN_DIR, 'package.json');

export const CLIENT_SOURCE = readFileSync(CLIENT_PATH, 'utf8');
export const HOST_SOURCE = readFileSync(HOST_PATH, 'utf8');
export const PACKAGE_JSON = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));

export const DSH_HOME = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.length > 0 ? process.env.DSH_HOME : join(homedir(), '.dsh');
export const PROFILE_DIR = join(DSH_HOME, 'profiles', 'web');

export const NS = 'approval-chime';
export const PLUGIN_ID = 'dsh-approval-chime';
export const SLOT = 'settings.plugin.item';

/* ------------------------------------------------------------------ reporting */

/** A tiny reporter: every check prints the raw value it judged, pass or fail. */
export function suite(title) {
  const rows = [];
  const out = {
    rows,
    group(name) {
      console.log(`\n--- ${name} ---`);
    },
    /** Raw evidence without a verdict. */
    note(label, value) {
      console.log(`    · ${label} = ${typeof value === 'string' ? value : JSON.stringify(value)}`);
    },
    check(name, ok, detail) {
      const passed = ok === true;
      rows.push({ name, passed, detail: detail === undefined ? '' : String(detail) });
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
    },
    near(name, actual, expected, epsilon = 1e-12) {
      const ok = typeof actual === 'number' && Math.abs(actual - expected) < epsilon;
      return out.check(name, ok, `expected ~${expected}, got ${JSON.stringify(actual)}`);
    },
    fail(name, detail) {
      return out.check(name, false, detail);
    },
    done() {
      const bad = rows.filter((row) => !row.passed);
      console.log(`\n### ${title}: ${rows.length - bad.length}/${rows.length} independent checks passed`);
      for (const row of bad) console.log(`    FAILED: ${row.name} — ${row.detail}`);
      if (bad.length > 0) process.exitCode = 1;
      return bad.length === 0;
    },
  };
  return out;
}

/* ------------------------------------------------------------- global tools */

export async function settle(rounds = 8) {
  for (let index = 0; index < rounds; index += 1) await new Promise((tick) => setImmediate(tick));
}

/** Watch the process for unhandled rejections during a probe. */
export function watchRejections() {
  const seen = [];
  const handler = (reason) => seen.push(reason);
  process.on('unhandledRejection', handler);
  return {
    seen,
    stop() {
      process.off('unhandledRejection', handler);
    },
  };
}

/* ------------------------------------------------------------ classic script */

function makeConsole(ledger) {
  const write = (level) => (...args) => {
    const line = args.map((value) => (typeof value === 'string' ? value : safeJson(value))).join(' ');
    ledger.console.push(`${level}: ${line}`);
  };
  return { log: write('log'), info: write('info'), warn: write('warn'), error: write('error'), debug: write('debug'), trace: () => {} };
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** A DOM stub that records every element it is asked to create. */
function makeDocument(ledger) {
  const listeners = new Map();
  const elements = [];
  const document = {
    listeners,
    elements,
    head: {
      children: [],
      appendChild(child) {
        document.head.children.push(child);
        return child;
      },
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      const set = listeners.get(type);
      if (set) set.delete(handler);
    },
    getElementById(id) {
      for (const element of elements) if (element.id === id) return element;
      return null;
    },
    createElement(tag) {
      ledger.elementTags.push(tag);
      const element = {
        tag,
        id: '',
        attributes: {},
        children: [],
        textContent: '',
        setAttribute(name, value) {
          element.attributes[name] = value;
        },
        appendChild(child) {
          element.children.push(child);
          return child;
        },
      };
      elements.push(element);
      return element;
    },
    /** Dispatch a gesture-ish event at every capture listener. */
    fire(type) {
      const set = listeners.get(type);
      if (!set) return 0;
      let count = 0;
      for (const handler of [...set]) {
        handler({ type });
        count += 1;
      }
      return count;
    },
    listenerCount() {
      let total = 0;
      for (const set of listeners.values()) total += set.size;
      return total;
    },
  };
  return document;
}

/**
 * Recording WebAudio implementation. Every parameter call is attributed to the
 * node it was made on, so the probe can prove the MASTER gain never ramps and
 * that exactly one node in each chime reaches the destination.
 */
export function makeAudioRecorder(options = {}) {
  const record = {
    contexts: [],
    gains: [],
    oscillators: [],
    links: [],
    starts: [],
    stops: [],
    paramCalls: [],
    resumes: 0,
    constructErrors: 0,
  };
  let sequence = 0;

  function AudioContext() {
    if (options.constructThrows === true) {
      record.constructErrors += 1;
      throw new Error('probe: AudioContext construction refused');
    }
    const context = this;
    this.state = options.state === undefined ? 'running' : options.state;
    this.currentTime = 42.5; // deliberately not 0: proves currentTime is read
    this.destination = { kind: 'destination', id: 'destination' };
    record.contexts.push(this);
    this.resume = function resume() {
      record.resumes += 1;
      if (options.resumeKeepsSuspended !== true) context.state = 'running';
      return Promise.resolve();
    };
    this.createGain = function createGain() {
      if (options.createGainThrows === true) throw new Error('probe: createGain refused');
      sequence += 1;
      const gain = {
        kind: 'gain',
        id: `gain-${sequence}`,
        outputs: [],
        value: 1,
        valueHistory: [],
        connect(target) {
          gain.outputs.push(target);
          record.links.push({ from: gain, to: target });
          return target;
        },
        disconnect() {},
      };
      gain.gain = {
        get value() {
          return gain.value;
        },
        set value(next) {
          gain.value = next;
          gain.valueHistory.push(next);
        },
        setValueAtTime(next) {
          record.paramCalls.push({ node: gain.id, method: 'setValueAtTime', value: next });
          gain.value = next;
          gain.valueHistory.push(next);
        },
        linearRampToValueAtTime(next) {
          record.paramCalls.push({ node: gain.id, method: 'linearRamp', value: next });
        },
        exponentialRampToValueAtTime(next) {
          record.paramCalls.push({ node: gain.id, method: 'exponentialRamp', value: next });
        },
      };
      record.gains.push(gain);
      return gain;
    };
    this.createOscillator = function createOscillator() {
      if (options.createOscillatorThrows === true) throw new Error('probe: createOscillator refused');
      sequence += 1;
      const oscillator = {
        kind: 'oscillator',
        id: `osc-${sequence}`,
        type: 'sine',
        frequency: { value: 0 },
        outputs: [],
        startedAt: null,
        stoppedAt: null,
        connect(target) {
          oscillator.outputs.push(target);
          record.links.push({ from: oscillator, to: target });
          return target;
        },
        disconnect() {},
        start(at) {
          oscillator.startedAt = at;
          record.starts.push({ node: oscillator.id, at });
        },
        stop(at) {
          oscillator.stoppedAt = at;
          record.stops.push({ node: oscillator.id, at });
        },
      };
      record.oscillators.push(oscillator);
      return oscillator;
    };
  }

  record.masterGains = () => record.gains.filter((gain) => gain.outputs.some((target) => target !== null && target.kind === 'destination'));
  record.envelopes = () => record.gains.filter((gain) => !record.masterGains().includes(gain));
  return { Ctor: AudioContext, record };
}

/** Wire the sandbox globals and run lib/client.js exactly like `<script src>`. */
export function loadBundle(options = {}) {
  const ledger = {
    console: [],
    elementTags: [],
    requires: [],
    traps: [],
    navigatorReads: 0,
  };
  const sandbox = {
    console: makeConsole(ledger),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
  };

  const document = options.document === false ? null : makeDocument(ledger);
  if (document !== null) sandbox.document = document;

  const audio = makeAudioRecorder(options.audio === undefined ? {} : options.audio);
  if (options.audio !== 'absent') sandbox.AudioContext = audio.Ctor;

  // Outbound-resource traps: any attempt to reach the network or load media is
  // recorded and then refuses, so a "no external resource" claim is measured.
  const trap = (label) =>
    function trapped(...args) {
      ledger.traps.push({ label, args: args.map((value) => String(value)).slice(0, 2) });
      throw new Error(`probe trap: ${label} is not available to this bundle`);
    };
  for (const label of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Audio', 'Image', 'Worker', 'importScripts', 'sendBeacon', 'Request', 'Response']) {
    sandbox[label] = trap(label);
  }
  Object.defineProperty(sandbox, 'navigator', {
    configurable: true,
    get() {
      ledger.navigatorReads += 1;
      return { userAgent: 'probe' };
    },
  });

  const registrations = [];
  sandbox.__ModuleLoader__ = {
    load(registration) {
      registrations.push(registration);
    },
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const context = vm.createContext(sandbox);

  let loadError = null;
  try {
    vm.runInContext(CLIENT_SOURCE, context, { filename: CLIENT_PATH });
  } catch (error) {
    loadError = error;
  }

  const reactRuntime = makeReactRuntime();
  const registration = registrations.length > 0 ? registrations[0] : null;
  const requireFn = (specifier) => {
    ledger.requires.push(specifier);
    if (specifier === 'react') return reactRuntime.react;
    throw new Error(`probe: unexpected require(${JSON.stringify(specifier)})`);
  };
  let contract = null;
  let factoryError = null;
  if (registration !== null && loadError === null) {
    try {
      contract = registration.factory(requireFn);
    } catch (error) {
      factoryError = error;
    }
  }

  return {
    sandbox,
    context,
    ledger,
    document,
    audio,
    registrations,
    registration,
    contract,
    factoryError,
    loadError,
    requireFn,
    reactRuntime,
    /** The plugin's own diagnostics surface, installed by the bundle. */
    diagnostics() {
      return sandbox.__DSH_APPROVAL_CHIME__;
    },
  };
}

/* ------------------------------------------------------------ react runtime */

function flattenChildren(children) {
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

/** A minimal function-component runtime with real hook slots. */
export function makeReactRuntime() {
  const runtime = { hooks: [], effects: [], cursor: 0 };

  const react = {
    createElement(type, props, ...children) {
      return { type, props: props === null || props === undefined ? {} : props, children: flattenChildren(children) };
    },
    useState(initial) {
      const slot = runtime.cursor;
      runtime.cursor += 1;
      if (!(slot in runtime.hooks)) runtime.hooks[slot] = typeof initial === 'function' ? initial() : initial;
      const set = (next) => {
        runtime.hooks[slot] = typeof next === 'function' ? next(runtime.hooks[slot]) : next;
      };
      return [runtime.hooks[slot], set];
    },
    useEffect(callback) {
      const slot = runtime.cursor;
      runtime.cursor += 1;
      if (!runtime.effects.some((effect) => effect.slot === slot)) runtime.effects.push({ slot, callback, ran: false, dispose: null });
      return undefined;
    },
    useRef(initial) {
      const slot = runtime.cursor;
      runtime.cursor += 1;
      if (!(slot in runtime.hooks)) runtime.hooks[slot] = { current: initial };
      return runtime.hooks[slot];
    },
    useMemo(factory) {
      return factory();
    },
    useCallback(fn) {
      return fn;
    },
  };

  return { react, runtime };
}

/** Mount a function component and drive it: re-render on demand, run effects once. */
export function mount(reactRuntime, Component, props) {
  const api = {
    tree: null,
    render() {
      reactRuntime.runtime.cursor = 0;
      api.tree = Component(props === undefined ? {} : props);
      return api.tree;
    },
    runEffects() {
      const disposers = [];
      for (const effect of reactRuntime.runtime.effects) {
        if (effect.ran) continue;
        effect.ran = true;
        const dispose = effect.callback();
        if (typeof dispose === 'function') {
          effect.dispose = dispose;
          disposers.push(dispose);
        }
      }
      return disposers;
    },
  };
  return api;
}

export function walk(node, visit) {
  if (node === null || node === undefined || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  visit(node);
  walk(node.children, visit);
}

export function findAll(tree, predicate) {
  const found = [];
  walk(tree, (node) => {
    if (predicate(node)) found.push(node);
  });
  return found;
}

export function allText(node) {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (node === null || node === undefined || typeof node !== 'object') return '';
  if (Array.isArray(node)) return node.map(allText).join(' ');
  return node.children.map(allText).join(' ');
}

export const inputsOfType = (tree, type) => findAll(tree, (node) => node.type === 'input' && node.props.type === type);
export const elementsOfType = (tree, type) => findAll(tree, (node) => node.type === type);

/* ---------------------------------------------------------------- fake ctx */

/**
 * The browser-side plugin context, stubbed to the four services this bundle
 * injects. `remote.$on` can be bridged into a real cordis context, so "the
 * plugin registered nothing on the approval chain" becomes a functional claim.
 */
export function makeCtx(options = {}) {
  const log = {
    logger: [],
    boundSpecs: [],
    slotRegistrations: [],
    slotInjects: [],
    localeRegistrations: [],
    effectLabels: [],
    remoteSubs: [],
    setCalls: [],
    unsetCalls: [],
    subscribeErrors: [],
    pendingSubscribers: 0,
  };

  const scopeState = {
    status: options.scopeStatus === undefined ? 'ready' : options.scopeStatus,
    value: options.scopeValue === undefined ? { enabled: true, volume: 70, tone: 'chime' } : options.scopeValue,
    user: {},
    writable: options.writable === undefined ? true : options.writable,
    mode: 'host',
    revision: 1,
  };

  const api = {
    log,
    scopeState,
    scopeThrows: options.scopeThrows === true,
    pendingThrows: options.pendingThrows === true,
    documents: new Map(),
    pendingListeners: new Set(),
    scopeListeners: new Set(),
    effectDisposers: [],
  };

  const scope = {
    getSnapshot() {
      if (api.scopeThrows) throw new Error('probe: settingsScope.getSnapshot refused');
      return {
        status: scopeState.status,
        value: scopeState.value === undefined ? undefined : { ...scopeState.value },
        user: { ...scopeState.user },
        base: {},
        writable: scopeState.writable,
        mode: scopeState.mode,
        revision: scopeState.revision,
      };
    },
    subscribe(listener) {
      api.scopeListeners.add(listener);
      return () => api.scopeListeners.delete(listener);
    },
    set(field, value) {
      log.setCalls.push({ field, value });
      scopeState.value = { ...(scopeState.value === undefined ? {} : scopeState.value), [field]: value };
      scopeState.user = { ...scopeState.user, [field]: value };
      scopeState.revision += 1;
      for (const listener of [...api.scopeListeners]) listener();
      return options.setRejects === true ? Promise.reject(new Error('probe: settings write rejected')) : Promise.resolve(true);
    },
    unset(field) {
      log.unsetCalls.push({ field });
      const value = { ...(scopeState.value === undefined ? {} : scopeState.value) };
      delete value[field];
      const user = { ...scopeState.user };
      delete user[field];
      scopeState.value = value;
      scopeState.user = user;
      scopeState.revision += 1;
      for (const listener of [...api.scopeListeners]) listener();
      return Promise.resolve(true);
    },
  };
  api.scope = scope;
  /** Simulate a Host-side settings revision arriving (the scope notifies subscribers). */
  api.notifyScope = () => {
    for (const listener of [...api.scopeListeners]) listener();
  };

  let pendingMap = new Map();
  const uiSession = {
    pendingInteractions: {
      getSnapshot() {
        if (api.pendingThrows) throw new Error('probe: pendingInteractions.getSnapshot refused');
        return pendingMap;
      },
      subscribe(listener) {
        api.pendingListeners.add(listener);
        log.pendingSubscribers += 1;
        return () => api.pendingListeners.delete(listener);
      },
    },
  };
  api.uiSession = uiSession;

  /**
   * Publish a snapshot the way `ui-session.publishPendingInteractions()` does:
   * replace the Map, then call every listener. Errors are captured rather than
   * swallowed by the caller, so "our listener never threw" is measurable.
   */
  api.publish = (entries) => {
    const next = new Map();
    for (const [sessionId, interaction] of entries) next.set(sessionId, interaction);
    pendingMap = next;
    for (const listener of [...api.pendingListeners]) {
      try {
        listener();
      } catch (error) {
        log.subscribeErrors.push(error === null || error === undefined ? 'unknown' : String(error.message || error));
      }
    }
    return pendingMap;
  };
  /** A publish that does NOT guard the listener, to see whether anything escapes. */
  api.publishRaw = (entries) => {
    const next = new Map();
    for (const [sessionId, interaction] of entries) next.set(sessionId, interaction);
    pendingMap = next;
    for (const listener of [...api.pendingListeners]) listener();
    return pendingMap;
  };

  const logger = (level) => (message) => log.logger.push(`${level}: ${String(message)}`);

  const ctx = {
    baseUrl: 'file:///C:/Users/28779/.dsh/profiles/web/',
    effect(callback, label) {
      log.effectLabels.push(label);
      const dispose = callback();
      if (typeof dispose === 'function') api.effectDisposers.push({ label, dispose });
      return dispose;
    },
    slots: {
      inject(name, callback) {
        log.slotInjects.push(name);
        return callback();
      },
      register(entry, component) {
        log.slotRegistrations.push({ entry, component });
        return () => {};
      },
    },
    locale: {
      register(ns, dictionary) {
        log.localeRegistrations.push({ ns, dictionary });
        return () => {};
      },
      bind: () => (key) => key,
      subscribe: () => () => {},
      getSnapshot: () => ({ revision: 0 }),
    },
    settingsScope: {
      bind(spec) {
        log.boundSpecs.push(spec);
        return scope;
      },
    },
    uiSession,
    remote: {
      $on(event, listener, third) {
        log.remoteSubs.push({ event, listener, third });
        if (typeof options.bridgeRemote === 'function') options.bridgeRemote(event, listener, third);
        return () => {};
      },
    },
    logger: { info: logger('info'), warn: logger('warn'), error: logger('error'), debug: logger('debug') },
  };

  for (const service of options.dropServices === undefined ? [] : options.dropServices) delete ctx[service];
  if (options.settingsScope === 'throws') ctx.settingsScope = { bind() { throw new Error('probe: bind refused'); } };
  if (options.uiSession === 'throws') {
    Object.defineProperty(ctx, 'uiSession', {
      get() {
        throw new Error('probe: uiSession access refused');
      },
    });
  }

  return { ctx, api, scope, log };
}

/** An approval-shaped pending interaction, as dsh-client-ui-approval builds it. */
export function approval(key, extra = {}) {
  return { sessionId: extra.sessionId === undefined ? 'session-1' : extra.sessionId, kind: 'approval', key, toolName: 'Bash', ...extra };
}

/* ------------------------------------------------------------- host anchors */

/** Resolve a Node package the way the Host's own profile would. */
export function resolveFromProfile(specifier) {
  const anchors = [
    pathToFileURL(join(PROFILE_DIR, 'package.json')).href,
    pathToFileURL(join(DSH_HOME, 'profiles', 'package.json')).href,
    import.meta.url,
  ];
  for (const anchor of anchors) {
    try {
      return createRequire(anchor).resolve(specifier);
    } catch {
      /* next anchor */
    }
  }
  return null;
}

/** Read a file as UTF-8, or null when it is absent. */
export function readOrNull(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** Report a `file:line` match with a short snippet — the raw evidence form. */
export function grepLine(source, pattern) {
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) return { line: index + 1, text: lines[index].trim().slice(0, 200) };
  }
  return null;
}

export { createRequire, pathToFileURL };
