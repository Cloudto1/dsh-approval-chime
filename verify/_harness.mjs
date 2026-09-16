/**
 * Shared harness for the three headless self-tests of dsh-approval-chime.
 *
 * Everything here is test scaffolding: it runs the REAL plugin files
 * (`lib/index.js` as a module, `lib/client.js` as a classic script inside a
 * `node:vm` context, exactly like the browser's `<script src>`), with stub
 * platform services and a stub WebAudio implementation. No network, no browser,
 * no Host mutation, no package installation.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const PLUGIN_DIR = resolve(HERE, '..');
export const CLIENT_PATH = join(PLUGIN_DIR, 'lib', 'client.js');
export const HOST_PATH = join(PLUGIN_DIR, 'lib', 'index.js');
export const PACKAGE_PATH = join(PLUGIN_DIR, 'package.json');
export const PATCH_PATH = join(PLUGIN_DIR, 'cordis.patch.yml');

export function readText(path) {
  return readFileSync(path, 'utf8');
}

export function dshHome() {
  const configured = process.env.DSH_HOME;
  return typeof configured === 'string' && configured.length > 0 ? configured : join(homedir(), '.dsh');
}

/* --------------------------------------------------------------- reporting */

export function createReporter(title) {
  const checks = [];
  const api = {
    section(name) {
      console.log(`\n--- ${name} ---`);
    },
    check(name, condition, detail) {
      const passed = condition === true;
      const note = detail === undefined || detail === null || detail === '' ? '' : ` — ${detail}`;
      checks.push({ name, passed, detail: String(detail ?? '') });
      console.log(`${passed ? '[PASS]' : '[FAIL]'} ${name}${note}`);
      return passed;
    },
    equal(name, actual, expected) {
      return api.check(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    close(name, actual, expected, epsilon = 1e-9) {
      const ok = typeof actual === 'number' && Math.abs(actual - expected) < epsilon;
      return api.check(name, ok, `expected ~${expected}, got ${JSON.stringify(actual)}`);
    },
    deepEqual(name, actual, expected) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      return api.check(name, a === b, `expected ${b}, got ${a}`);
    },
    ok(name, value, detail) {
      return api.check(name, value === true, detail);
    },
    skip(name, why) {
      checks.push({ name, passed: true, detail: `skipped: ${why}` });
      console.log(`[SKIP] ${name} — ${why}`);
    },
    summary() {
      const failed = checks.filter((check) => !check.passed);
      console.log(`\n=== ${title}: ${checks.length - failed.length}/${checks.length} checks passed ===`);
      for (const failure of failed) console.log(`  FAILED: ${failure.name}${failure.detail === '' ? '' : ` — ${failure.detail}`}`);
      if (failed.length > 0) process.exitCode = 1;
      return failed.length === 0;
    },
  };
  return api;
}

/* ------------------------------------------------------------ host anchors */

/** package.json anchors this test process can resolve host packages from. */
export function hostAnchors() {
  const anchors = [];
  const push = (href) => {
    if (typeof href === 'string' && href.length > 0 && !anchors.includes(href)) anchors.push(href);
  };
  push(import.meta.url); // verify/ lives inside the plugin: its own junction applies
  const home = dshHome();
  push(pathToFileURL(join(home, 'profiles', 'web', 'package.json')).href);
  push(pathToFileURL(join(home, 'profiles', 'package.json')).href);
  return anchors;
}

/** Resolve a host package (cordis, schemastery, …) from the anchors, or null. */
export function resolveHostPackage(specifier) {
  for (const anchor of hostAnchors()) {
    try {
      return createRequire(anchor).resolve(specifier);
    } catch {
      /* try the next anchor */
    }
  }
  return null;
}

/** The host's real cordis, when this machine has it (the workspace plugins are `link:`-mounted). */
export function resolveCordis() {
  return resolveHostPackage('@deepseek-ai/cordis');
}

/* -------------------------------------------------------- classic-script VM */

/** A DOM stub small enough to reason about, complete enough for style injection and gestures. */
export function createDocumentStub() {
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
    head: { children: [], appendChild(child) { document.head.children.push(child); return child; } },
    /** Fire one gesture-ish event at the bound listeners (capture phase only). */
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
  };
  return document;
}

/**
 * Run one classic script inside a fresh vm context whose `window` is the global
 * object — the exact execution model of the Host's `<script src>` tag.
 */
export function createClientSandbox(options = {}) {
  const sandbox = { console, setTimeout, clearTimeout, setInterval, clearInterval };
  const context = vm.createContext(sandbox);
  vm.runInContext('globalThis.window = globalThis;', context);
  const document = options.document === false ? null : createDocumentStub();
  if (document !== null) context.window.document = document;
  const loader = createModuleLoaderStub();
  context.window.__ModuleLoader__ = loader;
  const audio = createAudioContextStub(options.audio);
  if (options.audio !== false && options.audioUnsupported !== true) context.window.AudioContext = audio.AudioContext;
  const requires = [];
  const react = createReactStub();
  const requireFn = (specifier) => {
    requires.push(specifier);
    if (specifier === 'react') return react;
    throw new Error(`unexpected require(${JSON.stringify(specifier)}) — the bundle may only require seed modules`);
  };
  const result = { context, document, loader, audio, react, requires, requireFn, error: null };
  try {
    vm.runInContext(readText(CLIENT_PATH), context, { filename: CLIENT_PATH });
  } catch (error) {
    result.error = error;
  }
  return result;
}

export function createModuleLoaderStub() {
  const registrations = [];
  return {
    registrations,
    load(registration) {
      registrations.push(registration);
    },
  };
}

/** Minimal React: `createElement` plus a hook runtime installed by {@link renderOnce}. */
export function createReactStub() {
  const createElement = (type, props, ...children) => ({
    type,
    props: props === null || props === undefined ? {} : props,
    children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false),
  });
  return {
    createElement,
    useState: () => [undefined, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: undefined }),
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
  };
}

/**
 * A real (if tiny) hook runtime plus a re-renderable component driver, so the
 * card's own React hooks behave like they do in the browser: state slots are
 * stable across renders and effects run when the test asks for them.
 *
 * @returns `{ render, runEffects, tree, hooks }` — `render()` re-runs the
 *   component over the same hook slots, which is what lets a test drive an event
 *   handler, re-render, and then drive the next one on the fresh closure.
 */
export function createRenderer(react, Component, props) {
  const hooks = [];
  const effects = [];
  const driver = {
    tree: null,
    hooks,
    render() {
      let index = 0;
      react.useState = (initial) => {
        const slot = index;
        index += 1;
        if (!(slot in hooks)) hooks[slot] = typeof initial === 'function' ? initial() : initial;
        const set = (value) => {
          hooks[slot] = typeof value === 'function' ? value(hooks[slot]) : value;
        };
        return [hooks[slot], set];
      };
      react.useEffect = (callback) => {
        const slot = index;
        index += 1;
        if (!effects.some((effect) => effect.slot === slot)) effects.push({ slot, callback });
      };
      react.useRef = (initial) => {
        const slot = index;
        index += 1;
        if (!(slot in hooks)) hooks[slot] = { current: initial };
        return hooks[slot];
      };
      react.useCallback = (fn) => fn;
      react.useMemo = (fn) => fn();
      driver.tree = Component(props === undefined ? {} : props);
      return driver.tree;
    },
    /** Run the effects once, keeping their disposers for a later cleanup call. */
    runEffects() {
      const disposers = [];
      for (const effect of effects) {
        const dispose = effect.callback();
        if (typeof dispose === 'function') disposers.push(dispose);
      }
      return disposers;
    },
  };
  return driver;
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

export function collect(tree, predicate) {
  const found = [];
  walk(tree, (node) => {
    if (node.type !== undefined && predicate(node)) found.push(node);
  });
  return found;
}

export function elementsOfType(tree, type) {
  return collect(tree, (node) => node.type === type);
}

export function flattenText(node) {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (node === null || node === undefined || typeof node !== 'object') return '';
  if (Array.isArray(node)) return node.map(flattenText).join(' ');
  return (node.children ?? []).map(flattenText).join(' ');
}

/* -------------------------------------------------------------- WebAudio stub */

/**
 * Records what the plugin actually built. The audio graph is the only artifact a
 * sound leaves behind, so these records are the assertion surface.
 */
export function createAudioContextStub(options = {}) {
  const record = {
    instances: [],
    gains: [],
    oscillators: [],
    connections: [],
    gainCalls: [],
    rampCalls: [],
    started: [],
    resumes: 0,
    destinations: [],
  };
  const initialState = options.state ?? 'running';
  const resumeKeepsSuspended = options.resumeFails === true;

  function AudioContextStub() {
    const self = this;
    this.state = initialState;
    this.currentTime = 0;
    this.destination = { kind: 'destination', index: record.destinations.length };
    record.destinations.push(this.destination);
    record.instances.push(this);
    this.resume = function resume() {
      record.resumes += 1;
      self.state = resumeKeepsSuspended ? 'suspended' : 'running';
      return Promise.resolve();
    };
    this.createGain = function createGain() {
      const node = {
        kind: 'gain',
        gain: {
          value: 1,
          setValueAtTime(value, at) {
            node.gain.value = value;
            record.gainCalls.push({ value, at });
          },
          linearRampToValueAtTime(value, at) {
            record.rampCalls.push({ value, at, kind: 'linear' });
          },
          exponentialRampToValueAtTime(value, at) {
            record.rampCalls.push({ value, at, kind: 'exponential' });
          },
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
    this.createOscillator = function createOscillator() {
      const node = {
        kind: 'oscillator',
        type: 'sine',
        frequency: { value: 0 },
        startedAt: null,
        stoppedAt: null,
        connect(target) {
          record.connections.push({ from: node, to: target });
          return target;
        },
        disconnect() {},
        start(at) {
          node.startedAt = at;
          record.started.push({ node, at });
        },
        stop(at) {
          node.stoppedAt = at;
        },
      };
      record.oscillators.push(node);
      return node;
    };
  }

  /** The master gain: the one gain node wired straight into the destination. */
  record.masterGains = () => record.gains.filter((gain) => record.connections.some((link) => link.from === gain && link.to.kind === 'destination'));

  return { AudioContext: AudioContextStub, record };
}

/* ------------------------------------------------------------------ fake ctx */

/** The browser-side plugin context, stubbed down to the services this bundle uses. */
export function createClientCtx(options = {}) {
  const state = {
    slotRegistrations: [],
    injectedSlots: [],
    localeRegistrations: [],
    /** The active locale of this fake platform; `setLocale` switches it. */
    locale: options.locale ?? 'zh',
    /** Bumped by `setLocale`, mirroring the host's locale snapshot revision. */
    localeRevision: 0,
    boundSpecs: [],
    remoteSubscriptions: [],
    effects: [],
    setCalls: [],
    unsetCalls: [],
    scopeListeners: new Set(),
    pendingListeners: new Set(),
    scopeSnapshot: {
      status: 'ready',
      value: { enabled: true, volume: 70, tone: 'chime' },
      base: {},
      user: {},
      revision: 1,
      writable: true,
      mode: 'host',
    },
    pendingSnapshot: new Map(),
  };
  if (options.scopeSnapshot) state.scopeSnapshot = { ...state.scopeSnapshot, ...options.scopeSnapshot };

  const notifyScope = () => {
    for (const listener of [...state.scopeListeners]) listener();
  };

  const scope = {
    getSnapshot: () => state.scopeSnapshot,
    subscribe(listener) {
      state.scopeListeners.add(listener);
      return () => state.scopeListeners.delete(listener);
    },
    set(field, value) {
      state.setCalls.push({ field, value });
      state.scopeSnapshot = {
        ...state.scopeSnapshot,
        value: { ...state.scopeSnapshot.value, [field]: value },
        user: { ...state.scopeSnapshot.user, [field]: value },
        revision: state.scopeSnapshot.revision + 1,
      };
      notifyScope();
      return Promise.resolve();
    },
    unset(field) {
      state.unsetCalls.push({ field });
      const value = { ...state.scopeSnapshot.value };
      delete value[field];
      const user = { ...state.scopeSnapshot.user };
      delete user[field];
      state.scopeSnapshot = { ...state.scopeSnapshot, value, user, revision: state.scopeSnapshot.revision + 1 };
      notifyScope();
      return Promise.resolve();
    },
    mutate(ops, revision) {
      state.setCalls.push({ ops, revision });
      return Promise.resolve();
    },
  };

  const ctx = {
    baseUrl: options.baseUrl ?? 'file:///C:/Users/28779/.dsh/profiles/web/',
    effect(callback, label) {
      const dispose = callback();
      state.effects.push({ label, dispose });
      return dispose;
    },
    slots: {
      inject(name, callback) {
        state.injectedSlots.push(name);
        return callback();
      },
      register(slotOptions, component) {
        state.slotRegistrations.push({ options: slotOptions, component });
        return () => {};
      },
    },
    locale: {
      register(ns, dictionary) {
        state.localeRegistrations.push({ ns, dictionary });
        return () => {};
      },
      /**
       * The host's `locale.bind(ns)`: a translator that reads the ACTIVE locale on
       * every call and falls back through the chain to `en`, then to the key itself
       * (dsh-client-locale/lib/client.js:1283-1304). A label thunk that calls the
       * bound translator therefore follows a locale switch without re-registering —
       * which is exactly what `setLocale` below lets a test prove.
       */
      bind: (ns) => (key) => {
        for (const localeId of [state.locale, 'en']) {
          for (const entry of state.localeRegistrations) {
            if (entry.ns !== ns) continue;
            const value = entry.dictionary?.[localeId]?.[key];
            if (typeof value === 'string') return value;
          }
        }
        return key;
      },
      subscribe: () => () => {},
      getSnapshot: () => ({ revision: state.localeRevision }),
    },
    settingsScope: {
      bind(spec) {
        state.boundSpecs.push(spec);
        return scope;
      },
      describe: () => ({
        getSnapshot: () => ({ view: { writable: true, namespaces: [] } }),
        subscribe: () => () => {},
        ensure() {},
      }),
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

  const pushPending = (entries) => {
    const next = new Map();
    for (const [sessionId, interaction] of entries) next.set(sessionId, interaction);
    state.pendingSnapshot = next;
    for (const listener of [...state.pendingListeners]) listener();
    return next;
  };

  /** Switch the fake platform's active locale (what the host's Language row does). */
  const setLocale = (id) => {
    state.locale = id;
    state.localeRevision += 1;
  };

  return { ctx, state, scope, pushPending, notifyScope, setLocale };
}

/** An approval-shaped pending interaction, as dsh-client-ui-approval publishes it. */
export function approvalInteraction(key, extra = {}) {
  return { sessionId: extra.sessionId ?? 'session-1', kind: 'approval', key, toolName: 'Bash', ...extra };
}

/** Flush microtasks (every promise chain in the plugin is short). */
export async function settle(rounds = 6) {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolveTick) => setImmediate(resolveTick));
  }
}

/** Track unhandled rejections so a silent async failure cannot hide in a test. */
export function trackUnhandledRejections() {
  const seen = [];
  const onRejection = (reason) => {
    seen.push(reason);
  };
  process.on('unhandledRejection', onRejection);
  return {
    seen,
    stop() {
      process.off('unhandledRejection', onRejection);
    },
  };
}

/* --------------------------------------------- degraded host (child process) */

/**
 * Prove the Host half stays inert when the schema package is unreachable.
 *
 * A copy of `lib/index.js` is placed in a temp directory OUTSIDE this package
 * (so the shipped junction is not on its resolution path) and run in a child
 * process whose `$DSH_HOME` points at an empty directory. The child writes its
 * verdict to a file rather than a pipe, because a confined Windows sandbox
 * cannot give a captured pipe to another program.
 *
 * @returns `{ ok, verdict, directory }` with the child's JSON verdict.
 */
export function runDegradedHostChild(pluginSource) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-approval-chime-degrade-'));
  const emptyHome = join(directory, 'home');
  const libDir = join(directory, 'plugin', 'lib');
  mkdirSync(libDir, { recursive: true });
  mkdirSync(emptyHome, { recursive: true });
  writeFileSync(join(libDir, 'index.js'), pluginSource, 'utf8');
  const childPath = join(directory, 'child.mjs');
  const outPath = join(directory, 'verdict.json');
  writeFileSync(
    childPath,
    `import { writeFileSync } from 'node:fs';
const verdict = { threw: false, error: null, registrations: 0, warnings: [] };
try {
  const plugin = await import(${JSON.stringify(pathToFileURL(join(libDir, 'index.js')).href)});
  const ctx = {
    logger: { info() {}, warn(message) { verdict.warnings.push(String(message)); }, error() {}, debug() {} },
    settings: {
      describe: () => [],
      register() { verdict.registrations += 1; },
    },
  };
  plugin.apply(ctx);
  await new Promise((settleTick) => setTimeout(settleTick, 150));
} catch (error) {
  verdict.threw = true;
  verdict.error = String(error && error.message ? error.message : error);
}
writeFileSync(${JSON.stringify(outPath)}, JSON.stringify(verdict), 'utf8');
`,
    'utf8',
  );
  const child = spawnSync(process.execPath, [childPath], {
    stdio: 'ignore',
    env: { ...process.env, DSH_HOME: emptyHome },
    timeout: 30_000,
  });
  let verdict = null;
  if (existsSync(outPath)) {
    try {
      verdict = JSON.parse(readText(outPath));
    } catch (error) {
      verdict = { threw: true, error: `unreadable child verdict: ${String(error)}` };
    }
  }
  return {
    ok: child.status === 0 && verdict !== null,
    status: child.status,
    verdict,
    directory,
    cleanup() {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        /* a leftover temp directory is not a test failure */
      }
    },
  };
}
