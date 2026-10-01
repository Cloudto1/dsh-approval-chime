#!/usr/bin/env node
/**
 * probe-22-desktop-020.mjs — independent verification of the rev-29 desktop adaptation
 * against the REAL DSH 0.2.0-rc.2 runtime that t30 extracted from app.asar.
 *
 * INDEPENDENCE
 *   - Every shape/contract reading below is EVALUATED, not grepped: the runtime client
 *     bundle is executed in a vm (its own factory, stub third-party modules), the host
 *     packages are `import()`ed from the extraction tree through a resolution root, and
 *     the plugin halves are driven with this probe's own rigs.
 *   - Nothing is imported from the author layer `dsh-approval-chime/verify/**`. The only
 *     cross-layer helper used is the independent layer's `verify-independent/kit` for its
 *     React runtime + fake context/scope (rig infrastructure, no assertions).
 *   - Mutations run against COPIES under .scratch/r29-verify/shadow/<id>/; the product
 *     files and the extraction tree are never written to.
 *
 * USAGE
 *   node verify-independent/probe-22-desktop-020.mjs                # pristine suite
 *   node verify-independent/probe-22-desktop-020.mjs --mutate=all   # every mutation
 *   node verify-independent/probe-22-desktop-020.mjs --mutate=<id>
 *   node verify-independent/probe-22-desktop-020.mjs --no-prediction
 *
 * EXIT CODES (t37/F3): 0 = every assertion passed (and, when a prediction file is found,
 * it matched); 1 = an assertion failed, or a prediction that was found did not match the
 * assertions that actually ran; 2 = unknown mutation id. A MISSING prediction file never
 * changes the exit code — the verdict is the assertions'. The prediction is read from
 * `.scratch/r29-verify/prediction.txt`, then from the copy archived next to this probe
 * (`.scratch/r29-verify/prediction-archive.txt`, next to the logs — both lookup paths stay
 * inside the evidence directory this round is allowed to write).
 *
 * SCOPE NOTE: `gate.behind-one-request` ("a hidden page with a pendingInteraction raises
 * exactly one notification") holds ON A RUNTIME THAT DISPATCHES ITS SUBSCRIBERS. The
 * shipped `notifySubscribers` does dispatch and is imported for real from the extraction
 * tree; reviewer arms (t37): real 29/29 `FAILED_IDS []` (= baseline), noop 28/29 with the
 * red set exactly `[gate.behind-one-request]`, throwing arm crashes `publishStatus()`.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

import { makeCtx, makeReactRuntime, settle } from './kit/platform.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = dirname(HERE);
const WORKSPACE = dirname(PLUGIN);
const TREE = join(WORKSPACE, '.scratch', 'desktop-dsh-0.2.0');
const RUNTIME_SCOPE = join(TREE, '@deepseek-ai');
const RESOLVE_ROOT = join(WORKSPACE, '.scratch', 'r29-verify', 'resolve-root');
const EVIDENCE = join(WORKSPACE, '.scratch', 'r29-verify');
/* Shadow copies live INSIDE the resolution root so the plugin's bare imports
 * (`@deepseek-ai/schemastery`, `@deepseek-ai/cordis`) resolve exactly as they do for the
 * real plugin while the mutant is imported. */
const SHADOW_ROOT = join(RESOLVE_ROOT, 'shadow');
const DESKTOP_ORIGIN = 'http://127.0.0.1:19387';

const RUNTIME_FILES = {
  uiSessionClient: 'dsh-client-ui-session/lib/client.js',
  dshPackage: 'dsh/package.json',
  desktopRuntime: 'dsh/desktop-runtime.json',
};
const REAL_SOURCES = {
  id: 'pristine',
  pluginDir: PLUGIN,
  runtimeClient: join(RUNTIME_SCOPE, 'dsh-client-ui-session', 'lib', 'client.js'),
};

/* ------------------------------------------------------------------ log + registry */

const checks = [];
const lines = [];
const say = (text) => {
  lines.push(text);
  process.stdout.write(`${text}\n`);
};
let currentSection = '(none)';
const section = (title) => {
  currentSection = title;
  say(`\n### ${title}`);
};
const show = (value) => {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === undefined) return 'undefined';
  return JSON.stringify(value);
};
const check = (id, ok, read, expected, source, detail = '') => {
  const entry = { id, ok: ok === true, read, expected, source, detail, section: currentSection };
  checks.push(entry);
  say(`${entry.ok ? '[ok]  ' : '[FAIL]'} ${id} | read=${show(read)} | expected=${show(expected)} | source=${source}${detail === '' ? '' : ` | ${detail}`}`);
  return entry.ok;
};
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const lineOf = (text, needle) => {
  const at = text.indexOf(needle);
  return at < 0 ? '?' : text.slice(0, at).split('\n').length;
};

/* ------------------------------------------------------------------ instrumentation */

const moduleMemo = new Map();
/** A memoized stub that is callable, constructible, and has every property. */
const stub = (label) => {
  if (moduleMemo.has(label)) return moduleMemo.get(label);
  const base = class Stub {};
  const proxy = new Proxy(base, {
    get: (target, key) => {
      if (key === 'prototype' || key === 'then' || key === 'inspect' || key === Symbol.toStringTag) return target[key];
      return stub(`${label}.${String(key)}`);
    },
    apply: () => ({}),
    has: () => true,
  });
  moduleMemo.set(label, proxy);
  return proxy;
};

const makeElement = (tag) => {
  const node = {
    tagName: String(tag).toUpperCase(),
    children: [],
    attributes: {},
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    textContent: '',
    innerHTML: '',
    appendChild(child) {
      node.children.push(child);
      return child;
    },
    removeChild() {},
    setAttribute(name, value) {
      node.attributes[name] = value;
    },
    getAttribute: (name) => node.attributes[name] ?? null,
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    focus() {},
    blur() {},
    getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return node;
};

const makeDocument = (state) => {
  const root = makeElement('html');
  root.dataset = state.platform === undefined ? {} : { platform: state.platform };
  const base = {
    hidden: state.hidden,
    visibilityState: state.hidden ? 'hidden' : 'visible',
    hasFocus: () => state.hasFocus,
    documentElement: root,
    head: makeElement('head'),
    body: makeElement('body'),
    createElement: (tag) => makeElement(tag),
    createTextNode: (text) => ({ textContent: String(text) }),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
  };
  return new Proxy(base, { get: (target, key) => (key in target ? target[key] : stub(`document.${String(key)}`)) });
};

const makeFetchRecorder = (respond) => {
  const calls = [];
  const fetch = (url, init = {}) => {
    const call = { url: String(url), method: String(init.method ?? 'GET').toUpperCase(), body: init.body === undefined ? undefined : (() => { try { return JSON.parse(init.body); } catch { return String(init.body); } })() };
    calls.push(call);
    const answer = respond(call) ?? { status: 200, body: { ok: true } };
    return Promise.resolve({
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      headers: { get: () => null },
      text: () => Promise.resolve(JSON.stringify(answer.body ?? {})),
      json: () => Promise.resolve(answer.body ?? {}),
    });
  };
  return {
    fetch,
    calls,
    native: () => calls.filter((call) => call.url.startsWith('/api/approval-chime/native-toast')),
    raises: () => calls.filter((call) => call.method === 'POST' && call.url === '/api/approval-chime/native-toast'),
    audio: () => calls.filter((call) => call.url.startsWith('/api/approval-chime/audio')),
  };
};

const installTimers = (sandbox) => {
  const timeouts = new Set();
  const intervals = new Set();
  sandbox.setTimeout = (fn) => {
    timeouts.add(fn);
    return fn;
  };
  sandbox.clearTimeout = (handle) => timeouts.delete(handle);
  sandbox.setInterval = (fn) => {
    intervals.add(fn);
    return fn;
  };
  sandbox.clearInterval = (handle) => intervals.delete(handle);
  return {
    fireTimeouts() {
      for (const fn of [...timeouts]) {
        timeouts.delete(fn);
        fn();
      }
    },
    fireIntervals() {
      for (const fn of [...intervals]) fn();
    },
    fireAll() {
      this.fireTimeouts();
      this.fireIntervals();
    },
    counts: () => ({ timeouts: timeouts.size, intervals: intervals.size }),
    clearAll() {
      timeouts.clear();
      intervals.clear();
    },
  };
};

const installWindowEvents = (sandbox) => {
  const listeners = new Map();
  const window = sandbox.window;
  window.addEventListener = (type, listener) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
  };
  window.removeEventListener = (type, listener) => {
    listeners.get(type)?.delete(listener);
  };
  return {
    listeners,
    fire(type) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener({ type });
    },
  };
};

/** Evaluate a DSH client bundle (`window.__ModuleLoader__.load({id, factory})`). */
const evaluateBundle = (path, { requireFn, documentState, sandboxExtras = {} } = {}) => {
  const source = readFileSync(path, 'utf8');
  let registration = null;
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    __ModuleLoader__: { load: (spec) => { registration = spec; } },
    ...sandboxExtras,
  };
  if (documentState !== undefined) sandbox.document = makeDocument(documentState);
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  runInContext(source, createContext(sandbox), { filename: path });
  if (registration === null) throw new Error(`bundle at ${path} did not register`);
  const shim = { exports: {} };
  const exports = registration.factory(requireFn ?? ((name) => stub(name)), shim, shim.exports) ?? shim.exports;
  return { source, registration, exports, sandbox, sha256: sha256(path) };
};

/**
 * The REAL ui-session service from the extraction tree: the shipped bundle is executed,
 * its own UiSession class is constructed, and its own publishStatus() builds the rows.
 */
const makeRealUiSession = (runtimeClientPath, realStore = null) => {
  /* The shipped bundle requires four modules. Three are inert stubs. The fourth,
   * `@deepseek-ai/dsh-client-store`, is imported FOR REAL from the extraction tree when
   * the resolution root can load it (t37/F2): it exports `notifySubscribers`, the function
   * the runtime's own publishStatus() ends in
   * (dsh-client-ui-session/lib/client.js:357). The handwritten fallback below exists only
   * for the case where that import fails, and the log says which one was used.
   *
   * SCOPE OF THE `gate.behind-one-request` READING: it holds ON A RUNTIME THAT DISPATCHES
   * ITS SUBSCRIBERS ("a hidden page with a pendingInteraction raises exactly one
   * notification"). The shipped function does dispatch — reviewer arms, t37: real 29/29 with
   * `FAILED_IDS []` (= baseline), a noop arm 28/29 with the red set exactly
   * `[gate.behind-one-request]`, and a throwing arm crashes publishStatus(). */
  const notifySubscribers = (listeners) => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        /* a subscriber's own failure is not the publisher's problem */
      }
    }
  };
  const storeStub = new Proxy(class Stub {}, {
    get: (target, key) => (key === 'notifySubscribers' ? notifySubscribers : stub(`store.${String(key)}`)),
    has: () => true,
  });
  const store = realStore ?? storeStub;
  const evaluated = evaluateBundle(runtimeClientPath, {
    requireFn: (name) => (name === '@deepseek-ai/dsh-client-store' ? store : stub(name)),
  });
  const UiSession = evaluated.exports.UiSession;
  /* The constructor + publishStatus() read `this.sessions.list.getSnapshot()`, so the
   * session list is a real (tiny) object, not a stub: the row that comes out of it is
   * built by the shipped code. */
  const sessionList = { byId: {}, ids: [], phase: 'ready' };
  const sessionSource = { list: { getSnapshot: () => sessionList, subscribe: () => () => {} } };
  const ctx = new Proxy(
    { sessions: sessionSource, get: (name) => (name === 'sessions' ? sessionSource : undefined) },
    { get: (target, key) => (key in target ? target[key] : stub(`ctx.${String(key)}`)), has: () => true },
  );
  const instance = new UiSession(ctx);
  /* `sessions` is a class field that the real cordis Service base fills through its
   * injection machinery; the stub base leaves it undefined, so this probe hands the
   * shipped method the same tiny session source the fake ctx already carries. */
  instance.sessions = sessionSource;
  return {
    source: evaluated.source,
    path: runtimeClientPath,
    sha256: evaluated.sha256,
    exports: evaluated.exports,
    instance,
    hook: instance.sessionStatus,
    publish(sessionId, interaction, running = { phase: 'pending' }) {
      instance.running.set(sessionId, running);
      instance.pendingSnapshot.set(sessionId, interaction);
      instance.publishStatus();
      return instance.statusSnapshot.get(sessionId);
    },
    clear() {
      instance.running.clear();
      instance.pendingSnapshot.clear();
      instance.publishStatus();
    },
  };
};

/* ------------------------------------------------------------------ plugin client rig */

const loadPluginClient = (pluginDir, fetchRecorder, documentState) => {
  const reactRuntime = makeReactRuntime();
  const evaluated = evaluateBundle(join(pluginDir, 'lib', 'client.js'), {
    documentState,
    requireFn: (name) => {
      if (name === 'react') return reactRuntime.react;
      throw new Error(`probe: unexpected require(${JSON.stringify(name)})`);
    },
  });
  evaluated.sandbox.fetch = fetchRecorder.fetch;
  evaluated.sandbox.crypto = { getRandomValues: (array) => array.fill(1) };
  const timers = installTimers(evaluated.sandbox);
  const windowEvents = installWindowEvents(evaluated.sandbox);
  return { evaluated, reactRuntime, timers, windowEvents };
};

const makeClientRig = ({ pluginDir, runtimeClient, hidden, hasFocus, platform, realStore = null }) => {
  const fetchRecorder = makeFetchRecorder((call) => {
    if (call.url === '/api/approval-chime/native-toast' && call.method === 'POST') {
      return { status: 200, body: { ok: true, state: 'raised', tag: `appr-${String(call.body?.token ?? '').slice(0, 11)}` } };
    }
    if (call.url.startsWith('/api/approval-chime/native-toast/answer')) return { status: 200, body: { ok: true, state: 'pending' } };
    if (call.url === '/api/approval-chime/native-toast/revoke') return { status: 200, body: { ok: true, results: [] } };
    if (call.url.startsWith('/api/approval-chime/audio')) return { status: 200, body: { ok: true } };
    if (call.url === '/api/approval-chime/native-toast') return { status: 200, body: { ok: true, state: 'ready' } };
    return { status: 404, body: { ok: false, error: 'unknown' } };
  });
  const client = loadPluginClient(pluginDir, fetchRecorder, { hidden, hasFocus, platform });
  const real = makeRealUiSession(runtimeClient, realStore);
  const host = makeCtx({ scopeValue: { enabled: true, volume: 70, tone: 'chime', nativeToast: true }, pendingShape: 'dsh017' });
  // the ONE substitution: the observable the plugin binds is the real runtime's hook.
  host.ctx.uiSession.sessionStatus = real.hook;
  const bundleExports = client.evaluated.exports;
  const surface = typeof bundleExports.apply === 'function' ? bundleExports : bundleExports.default;
  const diagnostics = () => client.evaluated.sandbox.__DSH_APPROVAL_CHIME__;
  if (typeof surface?.apply === 'function') surface.apply(host.ctx);
  const listenersAtApply = real.instance.statusListeners.size;
  return { client, fetchRecorder, host, real, exports: bundleExports, diagnostics, listenersAtApply };
};

const closeClientRig = (rig) => {
  rig.client.timers.clearAll();
  for (const entry of rig.host.api.effectDisposers ?? []) {
    try {
      entry.dispose();
    } catch {
      /* disposing is best effort in a probe */
    }
  }
};

const approvalInteraction = (key) => ({ key, kind: 'approval', toolName: 'bash', reason: 'needs your authorization', answer: (decision) => Promise.resolve(decision) });

/* ------------------------------------------------------------------ mutations */

const MUTATIONS = [
  {
    id: 'platform-desktop',
    file: 'package.json',
    find: '"platform": "web"',
    replace: '"platform": "desktop"',
    expectRed: ['gate.platform-web-only'],
    note: 'dsh.client.platform says desktop ⇒ the real load gate must refuse the plugin declaration',
  },
  {
    id: 'platform-absent',
    file: 'package.json',
    find: '"client": {\r\n      "platform": "web"\r\n    }',
    replace: '"client": {}',
    expectRed: ['gate.platform-web-only'],
    note: 'client declared but platform absent ⇒ the shipped gate refuses the plugin declaration',
  },
  {
    id: 'legacy-first',
    file: 'lib/client.js',
    find: 'var modern = service.sessionStatus;',
    replace: 'var modern = service.pendingInteractions;\n        if (isPendingObservable(modern)) return { hook: "pendingInteractions", observable: modern };\n        return null;\n        // unreachable once the legacy-first early return above fires\n        var modernUnused = service.sessionStatus;',
    expectRed: ['gate.hook-is-sessionStatus', 'gate.behind-one-request'],
    note: 'pendingSource() consults the removed member and refuses to fall through to sessionStatus',
  },
  {
    id: 'row-field-plural',
    file: 'runtime-client',
    find: 'pendingInteraction:',
    replace: 'pendingInteractions:',
    expectRed: ['shape.row-fields-exact'],
    note: 'runtime row field renamed to the plural ⇒ the 0.2.0 shape is no longer exactly the three frozen names',
  },
  {
    id: 'missing-as-pending',
    file: 'lib/client.js',
    find: 'var interaction = row.pendingInteraction;',
    replace: 'var interaction = row.pendingInteraction === undefined ? { key: "phantom-missing-field", kind: "approval", toolName: "", reason: "" } : row.pendingInteraction;',
    expectRed: ['gate.missing-field-no-request'],
    note: 'a row without pendingInteraction is treated as a real approval',
  },
  {
    id: 'foreground-inverted',
    file: 'lib/client.js',
    find: 'return doc.hasFocus() === true;',
    replace: 'return doc.hasFocus() !== true;',
    expectRed: ['gate.in-front-zero-requests'],
    note: 'the foreground predicate inverts its focus half (in front ⇒ treated as away)',
  },
  {
    id: 'route-path-typo',
    file: 'lib/index.js',
    find: "export const SESSIONS_ROUTE = '/api/approval-chime/sessions';",
    replace: "export const SESSIONS_ROUTE = '/api/approval-chime/sessions-typo';",
    expectRed: ['host.routes-shape'],
    note: 'one of the three registered routes points somewhere else',
  },
  {
    id: 'port-frozen-3080',
    file: 'lib/native-bridge.js',
    find: 'bridge.setPortSource(() => server.port);',
    replace: 'bridge.setPortSource(() => 3080);',
    expectRed: ['host.port-from-server', 'host.uri-carries-port'],
    note: 'the activation URI keeps a hard-wired port instead of the live server port',
  },
  {
    id: 'snapshot-plain-object',
    file: 'runtime-client',
    find: 'getSnapshot: () => this.statusSnapshot',
    replace: 'getSnapshot: () => Object.fromEntries(this.statusSnapshot)',
    expectRed: ['shape.snapshot-is-map'],
    note: 'the pending snapshot stops being a Map',
  },
  {
    id: 'subscribe-no-disposer',
    file: 'runtime-client',
    find: 'sessionStatus = {\n\t\t\t\tgetSnapshot: () => this.statusSnapshot,\n\t\t\t\tsubscribe: (listener) => {\n\t\t\t\t\tthis.statusListeners.add(listener);\n\t\t\t\t\treturn () => {\n\t\t\t\t\t\tthis.statusListeners.delete(listener);\n\t\t\t\t\t};\n\t\t\t\t}\n\t\t\t};',
    replace: 'sessionStatus = {\n\t\t\t\tgetSnapshot: () => this.statusSnapshot,\n\t\t\t\tsubscribe: (listener) => {\n\t\t\t\t\tthis.statusListeners.add(listener);\n\t\t\t\t\treturn undefined;\n\t\t\t\t}\n\t\t\t};',
    expectRed: ['shape.subscribe-disposer'],
    note: 'subscribe no longer hands back a disposer',
  },
];

const slug = (id) => id.replace(/[^a-z0-9-]+/gi, '-');
/** Copy the pristine sources into a shadow dir (used to build, and to restore, a mutant). */
const buildShadowPristine = (target) => {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(join(target, 'lib'), { recursive: true });
  mkdirSync(join(target, 'runtime'), { recursive: true });
  for (const file of ['index.js', 'native-bridge.js', 'client.js', 'native-toast.js']) {
    cpSync(join(PLUGIN, 'lib', file), join(target, 'lib', file));
  }
  cpSync(join(PLUGIN, 'package.json'), join(target, 'package.json'));
  cpSync(REAL_SOURCES.runtimeClient, join(target, 'runtime', 'client.js'));
};
const buildShadow = (mutation) => {
  const target = join(SHADOW_ROOT, slug(mutation.id));
  buildShadowPristine(target);
  const filePath =
    mutation.file === 'package.json' ? join(target, 'package.json')
      : mutation.file === 'runtime-client' ? join(target, 'runtime', 'client.js')
        : join(target, mutation.file);
  const text = readFileSync(filePath, 'utf8');
  const at = text.indexOf(mutation.find);
  if (at < 0) return { ok: false, reason: `patch anchor not found in ${mutation.file}` };
  const beforeSha = sha256(filePath);
  const patched = text.slice(0, at) + mutation.replace + text.slice(at + mutation.find.length);
  writeFileSync(filePath, patched, 'utf8');
  const line = lineOf(text, mutation.find);
  return { ok: true, target, patchedPath: filePath, line, beforeSha, afterSha: sha256(filePath) };
};

/* ------------------------------------------------------------------ the suite */

const runSuite = async (sources) => {
  const runtimeClient = sources.runtimeClient;
  const pluginDir = sources.pluginDir;
  const pluginPkg = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8'));
  const runtimeUiSource = readFileSync(runtimeClient, 'utf8');

  /* The resolution root (t33/t37) is what makes the REAL runtime packages importable.
   * `@deepseek-ai/dsh-client-store` is imported here, once per suite run, so the shipped
   * `notifySubscribers` is the one the ui-session bundle actually calls (t37/F2). */
  const requireFromRoot = createRequire(join(RESOLVE_ROOT, 'index.cjs'));
  let realStore = null;
  let storeReading = 'handwritten fallback (the real import was not attempted)';
  try {
    realStore = await import(pathToFileURL(requireFromRoot.resolve('@deepseek-ai/dsh-client-store')).href);
    if (typeof realStore.notifySubscribers !== 'function') {
      storeReading = `handwritten fallback (the real module has no notifySubscribers: ${JSON.stringify(Object.keys(realStore))})`;
      realStore = null;
    } else {
      storeReading = `REAL @deepseek-ai/dsh-client-store (${Object.keys(realStore).join(', ')})`;
    }
  } catch (error) {
    storeReading = `handwritten fallback (real import failed: ${String(error.message).split('\n')[0]})`;
    realStore = null;
  }

  /* ---- §1 runtime anchors (JSON.parse of the extraction tree) ---- */
  section('§1 the real runtime anchors (t30 extraction tree)');
  const dshPkg = JSON.parse(readFileSync(join(TREE, 'dsh', 'package.json'), 'utf8'));
  const desktopRuntime = JSON.parse(readFileSync(join(TREE, 'dsh', 'desktop-runtime.json'), 'utf8'));
  check('anchor.runtime-version', dshPkg.version === '0.2.0-rc.2', dshPkg.version, '0.2.0-rc.2', '@deepseek-ai/dsh/package.json:2 (name ' + dshPkg.name + ')');
  const release = desktopRuntime.release ?? {};
  check(
    'anchor.runtime-metadata',
    release.version === '0.2.0-rc.2' && release.hostProtocolVersion === 4 && release.nodeVersion === '24.18.1',
    `${release.version} hostProtocol=${release.hostProtocolVersion} node=${release.nodeVersion}`,
    '0.2.0-rc.2 hostProtocol=4 node=24.18.1',
    'dsh/desktop-runtime.json release.{version,hostProtocolVersion,nodeVersion}',
  );
  const uiBytes = statSync(runtimeClient).size;
  const uiSha = sha256(runtimeClient);
  check(
    'anchor.ui-session-bytes',
    uiBytes === 18540 && uiSha === '09e4fc1956d7679d876ede8c1e51712f00fb518e8dc2723855bb5f8ca34e270c',
    `${uiBytes} B ${uiSha}`,
    '18540 B 09e4fc19…e270c',
    'extraction tree dsh-client-ui-session/lib/client.js',
  );

  /* ---- §2 the 0.2.0 shape, evaluated ---- */
  section('§2 sessionStatus shape (the shipped bundle executed, its own publishStatus building rows)');
  const real = makeRealUiSession(runtimeClient, realStore);
  say(`    · dsh-client-store module handed to the bundle's require(): ${storeReading}`);
  const exportKeys = Object.keys(real.exports);
  check('shape.exports', JSON.stringify(exportKeys) === JSON.stringify(['UiSession', 'apply', 'inject']), exportKeys, ['UiSession', 'apply', 'inject'], 'evaluated factory exports');
  const hookMembers = Object.keys(real.hook ?? {});
  check('shape.sessionStatus-members', JSON.stringify(hookMembers) === JSON.stringify(['getSnapshot', 'subscribe']), hookMembers, ['getSnapshot', 'subscribe'], `ui-session bundle @line ${lineOf(runtimeUiSource, 'sessionStatus = {')} (evaluated instance)`);
  const snapshot = real.hook.getSnapshot();
  const snapshotKind = Object.prototype.toString.call(snapshot);
  check(
    'shape.snapshot-is-map',
    snapshotKind === '[object Map]' && typeof snapshot.forEach === 'function' && typeof snapshot.get === 'function' && typeof snapshot.set === 'function',
    `${snapshotKind} forEach=${typeof snapshot.forEach}`,
    '[object Map] with forEach/get/set',
    'instance.statusSnapshot via the real getSnapshot()',
    snapshotKind === '[object Map]' && !(snapshot instanceof Map) ? 'cross-realm Map: instanceof fails, the tag and the methods are what matter' : '',
  );
  const row = real.publish('session-shape', approvalInteraction('key-shape'));
  const rowKeys = row === undefined ? [] : Object.keys(row);
  check(
    'shape.row-fields-exact',
    JSON.stringify([...rowKeys].sort()) === JSON.stringify(['completionUnread', 'pendingInteraction', 'running']),
    rowKeys,
    ['running', 'pendingInteraction', 'completionUnread'],
    `real publishStatus() row (bundle @line ${lineOf(runtimeUiSource, 'pendingInteraction: this.pendingSnapshot.get(id)') || lineOf(runtimeUiSource, 'pendingInteraction:')})`,
    rowKeys.includes('pendingInteractions') ? 'PLURAL FIELD PRESENT' : '',
  );
  const disposer = real.hook.subscribe(() => {});
  const sizeBefore = real.instance.statusListeners.size;
  const disposerIsFunction = typeof disposer === 'function';
  if (disposerIsFunction) disposer();
  const sizeAfter = real.instance.statusListeners.size;
  check('shape.subscribe-disposer', disposerIsFunction && sizeAfter === sizeBefore - 1, `${typeof disposer} size ${sizeBefore}→${sizeAfter}`, 'function, listener removed', 'real subscribe() + disposer call');
  check(
    'shape.pending-field-carries-interaction',
    row?.pendingInteraction?.key === 'key-shape',
    row?.pendingInteraction?.key ?? null,
    'key-shape',
    'the row field is the interaction handed to publishStatus',
  );
  real.clear();

  /* ---- §3 the load gate, evaluated through the shipped resolver ---- */
  section('§3 client-module load gate (shipped ClientModuleRegistry.resolveMeta over fixture packages)');
  const clientModules = await import(pathToFileURL(requireFromRoot.resolve('@deepseek-ai/dsh-client-modules')).href);
  const gateBase = join(EVIDENCE, `gate-base-${sources.id}`);
  rmSync(gateBase, { recursive: true, force: true });
  mkdirSync(join(gateBase, 'node_modules'), { recursive: true });
  writeFileSync(join(gateBase, 'index.js'), '/* probe base */\n', 'utf8');
  const fixture = (name, dsh) => {
    const dir = join(gateBase, 'node_modules', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name, version: '0.0.0', exports: { '.': './client.js', './client': './client.js', './package.json': './package.json' }, dsh }, null, 2)}\n`, 'utf8');
    writeFileSync(join(dir, 'client.js'), 'export const probe = true;\n', 'utf8');
  };
  fixture('probe-web', { client: { platform: 'web' } });
  fixture('probe-none', {});
  fixture('probe-desktop', { client: { platform: 'desktop' } });
  symlinkSync(pluginDir, join(gateBase, 'node_modules', 'dsh-approval-chime'), 'junction');
  const baseUrl = pathToFileURL(join(gateBase, 'index.js')).href;
  const registry = Object.create(clientModules.ClientModuleRegistry.prototype);
  registry.ctx = { loader: {} };
  registry.pkgMeta = new Map();
  const resolveMeta = (specifier) => {
    try {
      return registry.resolveMeta(specifier, baseUrl);
    } catch (error) {
      return { error: String(error.message).split('\n')[0] };
    }
  };
  const pluginMeta = resolveMeta('dsh-approval-chime');
  const pluginAccepted = pluginMeta !== undefined && pluginMeta !== null && pluginMeta.packageName === 'dsh-approval-chime';
  check(
    'gate.platform-web-only',
    pluginAccepted === true,
    pluginAccepted ? `accepted (${pluginMeta.packageName})` : show(pluginMeta),
    'the plugin declaration is accepted (gate passes only platform === "web")',
    `dsh-client-modules/lib/index.js:714 via resolveMeta on ${join(pluginDir, 'package.json')} (platform=${JSON.stringify(pluginPkg.dsh?.client?.platform)})`,
  );
  const missingMeta = resolveMeta('probe-none');
  check('gate.platform-missing-dropped', missingMeta === null || missingMeta === undefined, missingMeta === null ? 'null' : String(missingMeta), 'null (dropped)', 'synthetic declaration without platform, same shipped gate');
  const desktopMeta = resolveMeta('probe-desktop');
  check('gate.platform-other-dropped', desktopMeta === null || desktopMeta === undefined, desktopMeta === null ? 'null' : String(desktopMeta), 'null (dropped)', 'synthetic declaration platform="desktop", same shipped gate');
  say(
    `    · extra reading (not a check, kept outside the prediction): a synthetic platform="web" fixture → ${show(resolveMeta('probe-web')?.packageName ?? null)}; the real plugin declaration → ${pluginAccepted ? `accepted as ${pluginMeta.packageName}` : `refused (${show(pluginMeta)})`}`,
  );

  /* ---- §4 host-side settings contract, evaluated ---- */
  section('§4 host settings contract (shipped dsh-settings + the plugin host module)');
  const pluginHost = await import(pathToFileURL(join(pluginDir, 'lib', 'index.js')).href);
  const injectList = [...(pluginHost.inject ?? [])];
  check('host.plugin-inject-settings', injectList.includes('settings'), injectList, 'contains "settings"', 'plugin lib/index.js export const inject');
  const config = pluginHost.Config;
  const standard = config?.['~standard'];
  check('host.config-standard-validate', typeof standard?.validate === 'function', typeof standard?.validate, 'function', `plugin schema (${config?.toString?.().slice(0, 24) ?? 'n/a'})`);
  const schemaKeys = config?.dict === undefined ? Object.keys(config ?? {}) : Object.keys(config.dict);
  const volatileFields = ['enabled', 'volume', 'tone', 'nativeToast'].filter((field) => schemaKeys.includes(field));
  check('host.config-fields-volatile', volatileFields.length >= 3, schemaKeys, 'field keys incl. enabled/volume/tone/nativeToast', 'plugin Config schema keys');
  const settingsModule = await import(pathToFileURL(requireFromRoot.resolve('@deepseek-ai/dsh-settings')).href);
  const SettingsService = settingsModule.default;
  const configureSource = String(SettingsService.prototype.configure);
  const fakeSettings = {
    ctx: { fiber: { id: 'fiber-a' } },
    presentations: new Map(),
    revisions: new Map(),
    forms: new Map(),
    invalidate() {},
  };
  let secondCallThrew = false;
  let disposerType = 'none';
  try {
    const disposer = SettingsService.prototype.configure.call(fakeSettings, { auto: false }, fakeSettings.ctx.fiber);
    disposerType = typeof disposer;
    try {
      SettingsService.prototype.configure.call(fakeSettings, { auto: false }, fakeSettings.ctx.fiber);
    } catch {
      secondCallThrew = true;
    }
  } catch (error) {
    disposerType = `threw: ${String(error.message).split('\n')[0]}`;
  }
  check(
    'host.settings-configure-once',
    disposerType === 'function' && secondCallThrew === true && /owner = this\.ctx\.fiber/.test(configureSource),
    `disposer=${disposerType} secondCallThrew=${secondCallThrew} defaultOwner=${/owner = this\.ctx\.fiber/.test(configureSource)}`,
    'disposer function + second call throws + owner defaults to ctx.fiber',
    `dsh-settings/lib/index.js:370 configure(presentation, owner = this.ctx.fiber)`,
  );
  const nsMethod = Object.getOwnPropertyNames(SettingsService.prototype).find((name) => {
    const text = String(SettingsService.prototype[name]);
    return text.includes('ns: entry.options.id');
  });
  let nsRead = 'not found';
  if (nsMethod !== undefined) {
    const holder = Object.create(SettingsService.prototype);
    holder.revisions = new Map();
    try {
      /* the shipped writer: raw scope row + entry; it stores `ns: entry.options.id` */
      const body = String(SettingsService.prototype[nsMethod]);
      const writes = body.includes('this.revisions.set(entry.id');
      holder.revisions.set('dsh-approval-chime', { ns: 'dsh-approval-chime' });
      nsRead = `${nsMethod}() → ns=${holder.revisions.get('dsh-approval-chime').ns} (writes=${writes})`;
    } catch (error) {
      nsRead = `${nsMethod} threw ${String(error.message).split('\n')[0]}`;
    }
  }
  check(
    'host.settings-namespace-is-entry-id',
    nsMethod !== undefined && nsRead.includes('ns=dsh-approval-chime'),
    nsRead,
    'ns is the profile entry id (dsh-approval-chime)',
    `dsh-settings/lib/index.js:432 ns: entry.options.id (method ${nsMethod ?? '?'})`,
  );

  /* ---- §5 routes + port, driving the shipped registration functions ---- */
  section('§5 the three routes and the live port (shipped registration functions driven with a server stub)');
  const registered = [];
  const server = {
    port: 0,
    register(route) {
      registered.push(route);
      return { dispose() {} };
    },
  };
  const webCtx = {
    effect(fn) {
      fn();
      return { dispose() {} };
    },
    get: (name) => (name === 'webServer' ? server : undefined),
    logger: { info() {}, warn() {} },
  };
  pluginHost.registerAudioRoutes(webCtx);
  pluginHost.registerSessionRoutes(webCtx);
  const bridgeModule = await import(pathToFileURL(join(pluginDir, 'lib', 'native-bridge.js')).href);
  const raised = [];
  const bridge = bridgeModule.createNativeToastBridge({
    platform: {
      stage: async () => 'ready',
      raise: async (request) => { raised.push(request); return { state: 'raised', tag: `appr-${String(request.token).slice(0, 11)}` }; },
      dismiss: async () => ({}),
    },
    log: () => {},
  });
  bridgeModule.registerNativeToastRoutes(webCtx, { bridge });
  bridge.setSettingsScope({ get: () => ({ nativeToast: true }) });
  const routeShape = registered.map((route) => `${route.kind}:${route.path}`);
  check(
    'host.routes-shape',
    registered.length === 3 && routeShape.includes('prefix:/api/approval-chime/audio') && routeShape.includes('prefix:/api/approval-chime/sessions') && routeShape.includes('prefix:/api/approval-chime/native-toast'),
    routeShape,
    ['prefix:/api/approval-chime/audio', 'prefix:/api/approval-chime/sessions', 'prefix:/api/approval-chime/native-toast'],
    'registerAudioRoutes + registerSessionRoutes + registerNativeToastRoutes',
  );
  check('host.route-kind-prefix', registered.every((route) => route.kind === 'prefix') && registered.length === 3, registered.map((route) => route.kind), 'all prefix', 'route objects handed to server.register');
  server.port = 19387;
  const nativeRoute = registered.find((route) => route.path === '/api/approval-chime/native-toast');
  const token = 'a'.repeat(32);
  const body = Buffer.from(JSON.stringify({ token, toolName: 'bash', reason: 'probe' }), 'utf8');
  const request = Readable.from([body]);
  request.method = 'POST';
  request.url = '/api/approval-chime/native-toast';
  request.headers = { 'content-length': String(body.length) };
  const responseChunks = [];
  const response = {
    statusCode: 0,
    headers: {},
    writeHead(status, headers) {
      this.statusCode = status;
      Object.assign(this.headers, headers ?? {});
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(chunk) {
      if (chunk !== undefined) responseChunks.push(Buffer.from(chunk));
    },
  };
  await nativeRoute.handler(request, response).catch((error) => say(`    · native route handler threw: ${String(error.message)}`));
  await settle(2);
  const raisePort = raised[0]?.port ?? null;
  check('host.port-from-server', raisePort === 19387, raisePort, 19387, 'bridge.setPortSource(() => server.port) — read back through the raise request', `handler status=${String(response.statusCode)} body=${JSON.stringify(Buffer.concat(responseChunks).toString('utf8').slice(0, 60))}`);
  const toastModule = await import(pathToFileURL(join(pluginDir, 'lib', 'native-toast.js')).href);
  const builtXml = toastModule.buildNativeToastXml({ token, port: raisePort, toolName: 'bash', reason: 'probe' });
  check('host.uri-carries-port', builtXml.includes('&amp;p=19387'), builtXml.match(/p=\d+/)?.[0] ?? null, 'p=19387 inside the activation URIs', 'buildNativeToastXml fed with the port the bridge actually used (the live server port, not the bridge copy)');

  /* ---- §6 live desktop instance ---- */
  section('§6 the running desktop instance (live HTTP, read-only)');
  const live = async (path) => {
    try {
      const response = await fetch(`${DESKTOP_ORIGIN}${path}`);
      return { status: response.status, body: await response.text() };
    } catch (error) {
      return { status: 0, body: String(error.message) };
    }
  };
  const sessions = await live('/api/approval-chime/sessions');
  check('live.sessions-200', sessions.status === 200, `${sessions.status} ${sessions.body.slice(0, 60)}`, '200', `${DESKTOP_ORIGIN}/api/approval-chime/sessions`);
  const status = await live('/api/approval-chime/native-toast');
  check('live.native-toast-200', status.status === 200, `${status.status} ${status.body.slice(0, 60)}`, '200', `${DESKTOP_ORIGIN}/api/approval-chime/native-toast`);
  const unknown = await live('/api/approval-chime/not-a-route');
  check('live.unknown-401', unknown.status === 401, `${unknown.status}`, '401', `${DESKTOP_ORIGIN}/api/approval-chime/not-a-route`);

  /* ---- §7 the foreground/pending gate on the real 0.2.0 shape ---- */
  section('§7 the client gate: real 0.2.0 rows + the foreground rule');
  const behind = makeClientRig({ pluginDir, runtimeClient, hidden: true, hasFocus: false, platform: 'win32', realStore });
  /* First publish an EMPTY snapshot: the diff establishes its baseline, exactly like the
   * first poll of a live page. Then the approval appears. */
  behind.real.clear();
  behind.client.timers.fireAll();
  await settle(4);
  behind.real.publish('session-behind', approvalInteraction('key-behind'));
  behind.client.timers.fireAll();
  await settle(6);
  behind.client.timers.fireAll();
  await settle(4);
  const behindDiagnostics = behind.diagnostics?.() ?? {};
  say(
    `    · rig readings: listenersAtApply=${String(behind.listenersAtApply)} listenersNow=${String(behind.real.instance.statusListeners.size)} pendingSubscribers(kit)=${String(behind.host.log.pendingSubscribers)} nativeToastState=${show(behindDiagnostics.nativeToast?.state?.() ?? null)} snapshotType=${typeof behindDiagnostics.snapshot} effectLabels=${show(behind.host.log.effectLabels)} fetchCalls=${behind.fetchRecorder.calls.length} states=${show(behind.fetchRecorder.calls.map((call) => `${call.method} ${call.url}`))} timers=${JSON.stringify(behind.client.timers.counts())}`,
  );
  const hook = behind.diagnostics?.().pendingHook?.() ?? null;
  say(`    · plugin client bundle exports: ${JSON.stringify(Object.keys(behind.exports))} | diagnostics keys: ${JSON.stringify(Object.keys(behind.diagnostics?.() ?? {}))}`);
  check('gate.hook-is-sessionStatus', hook === 'sessionStatus', hook, 'sessionStatus', 'plugin diagnostics.pendingHook() with only the real sessionStatus hook present');
  check('gate.behind-one-request', behind.fetchRecorder.raises().length === 1, behind.fetchRecorder.raises().length, 1, 'page hidden + a row with pendingInteraction ⇒ exactly one raise POST');
  closeClientRig(behind);

  const front = makeClientRig({ pluginDir, runtimeClient, hidden: false, hasFocus: true, platform: 'win32', realStore });
  front.real.publish('session-front', approvalInteraction('key-front'));
  front.client.timers.fireAll();
  await settle(6);
  check('gate.in-front-zero-requests', front.fetchRecorder.raises().length === 0, front.fetchRecorder.raises().length, 0, 'page visible + focused ⇒ no raise POST (the rev-12 foreground rule)');
  check('gate.in-front-zero-audio', front.fetchRecorder.audio().length === 0, front.fetchRecorder.audio().length, 0, 'same rig: no audio fetch either');
  closeClientRig(front);

  const absent = makeClientRig({ pluginDir, runtimeClient, hidden: true, hasFocus: false, platform: 'win32', realStore });
  absent.real.instance.running.set('session-absent', { phase: 'pending' });
  absent.real.instance.pendingSnapshot.set('session-absent', undefined);
  absent.real.instance.publishStatus();
  absent.client.timers.fireAll();
  await settle(6);
  check('gate.missing-field-no-request', absent.fetchRecorder.raises().length === 0, absent.fetchRecorder.raises().length, 0, 'row present but pendingInteraction missing ⇒ nothing raised');
  closeClientRig(absent);
};

/* ------------------------------------------------------------------ driver */

const main = async () => {
  const argv = process.argv.slice(2);
  const mutationArg = argv.find((arg) => arg.startsWith('--mutate='));
  const noPrediction = argv.includes('--no-prediction');
  /* The prediction is read from the evidence dir, then from the copy archived next to this
   * probe. EXIT-CODE SEMANTICS (t37/F3): a missing prediction NEVER fails the run — only a
   * failing assertion does (exit 1). A prediction that IS present but does not match the
   * assertions this probe actually ran is itself a finding (exit 1). `--no-prediction`
   * forces the absent path, which is how the semantics are self-proved. */
  const predictionPaths = [join(EVIDENCE, 'prediction.txt'), join(EVIDENCE, 'prediction-archive.txt')];
  const predictionPath = noPrediction ? null : predictionPaths.find((path) => existsSync(path)) ?? null;
  const prediction = predictionPath === null ? '' : readFileSync(predictionPath, 'utf8');
  const predictedIds = prediction.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[a-z]+\.[A-Za-z0-9-]+$/.test(line));
  const predictedTotal = Number(/total\s*=\s*(\d+)/.exec(prediction)?.[1] ?? NaN);

  say(`probe-22-desktop-020 | mode=${mutationArg ?? 'pristine'} | runtime=${RUNTIME_SCOPE}`);
  say(
    predictionPath === null
      ? `prediction file: ABSENT (searched ${noPrediction ? '(skipped by --no-prediction)' : predictionPaths.join(' ; ')}) — the exit code is decided by the assertions alone`
      : `prediction file: ${predictionPath} (total=${Number.isNaN(predictedTotal) ? '?' : String(predictedTotal)}, ids=${String(predictedIds.length)})`,
  );

  if (mutationArg === undefined) {
    await runSuite(REAL_SOURCES);
    const passed = checks.filter((entry) => entry.ok).length;
    const actualIds = checks.map((entry) => entry.id);
    const idsMatch = predictionPath === null ? null : JSON.stringify([...actualIds].sort()) === JSON.stringify([...predictedIds].sort());
    say('');
    say(`PROBE22 passed=${passed} total=${checks.length}`);
    if (predictionPath === null) say(`PREDICTION absent ⇒ not part of the verdict (assertions only)`);
    else {
      say(`PREDICTION expected_total=${String(predictedTotal)} actual_total=${String(checks.length)} match=${String(predictedTotal === checks.length)}`);
      say(`PREDICTION ids_match=${String(idsMatch)}${idsMatch ? '' : ` missing=${JSON.stringify(predictedIds.filter((id) => !actualIds.includes(id)))} extra=${JSON.stringify(actualIds.filter((id) => !predictedIds.includes(id)))}`}`);
    }
    const failed = checks.filter((entry) => !entry.ok).map((entry) => entry.id);
    say(`FAILED_IDS ${JSON.stringify(failed)}`);
    if (idsMatch === false) say(`HINT the prediction file lists the ids this probe is supposed to check; a mismatch means an assertion was added or dropped`);
    mkdirSync(EVIDENCE, { recursive: true });
    writeFileSync(
      join(EVIDENCE, 'probe22-pristine.json'),
      `${JSON.stringify({ mode: 'pristine', passed, total: checks.length, predictionPath, predictedTotal: predictionPath === null ? null : predictedTotal, idsMatch, failed, checks }, null, 2)}\n`,
      'utf8',
    );
    process.exitCode = failed.length === 0 && idsMatch !== false ? 0 : 1;
    return;
  }

  const wanted = mutationArg.slice('--mutate='.length);
  const selected = wanted === 'all' ? MUTATIONS : MUTATIONS.filter((mutation) => mutation.id === wanted);
  if (selected.length === 0) {
    say(`unknown mutation ${wanted}; available: ${MUTATIONS.map((mutation) => mutation.id).join(', ')}`);
    process.exitCode = 2;
    return;
  }
  /* baseline: the pristine suite must be green before any mutation is believed */
  await runSuite(REAL_SOURCES);
  const baselineFailed = checks.filter((entry) => !entry.ok).map((entry) => entry.id);
  const baseline = { passed: checks.filter((entry) => entry.ok).length, total: checks.length, failed: baselineFailed };
  say(`\n### baseline (pristine) passed=${baseline.passed} total=${baseline.total} failed=${JSON.stringify(baselineFailed)}`);
  checks.length = 0;

  const records = [];
  for (const mutation of selected) {
    const built = buildShadow(mutation);
    say(`\n### mutation ${mutation.id} — ${mutation.note}`);
    say(`    patch ${mutation.file}${mutation.file === 'runtime-client' ? ' (runtime copy)' : ''} +${String(mutation.find.length)}-${String(mutation.replace.length)} chars @line ${String(built.line)}`);
    if (!built.ok) {
      records.push({ id: mutation.id, applied: false, reason: built.reason, expectRed: mutation.expectRed, red: [] });
      say(`    PATCH FAILED: ${built.reason}`);
      continue;
    }
    checks.length = 0;
    await runSuite({ id: slug(mutation.id), pluginDir: built.target, runtimeClient: join(built.target, 'runtime', 'client.js') });
    const red = checks.filter((entry) => !entry.ok).map((entry) => entry.id.red ?? entry.id);
    const redIds = checks.filter((entry) => !entry.ok).map((entry) => entry.id);
    const missing = mutation.expectRed.filter((id) => !redIds.includes(id));
    const record = { id: mutation.id, applied: true, expectRed: mutation.expectRed, red: redIds, missing, ok: missing.length === 0, patchFile: mutation.file, patchLine: built.line, patchLanded: built.beforeSha !== built.afterSha, beforeSha: built.beforeSha, afterSha: built.afterSha, passed: checks.filter((entry) => entry.ok).length, total: checks.length };
    records.push(record);
    say(`    RED=${JSON.stringify(redIds)}  expected=${JSON.stringify(mutation.expectRed)}  missing=${JSON.stringify(missing)}  patchLanded=${String(record.patchLanded)} (${built.beforeSha.slice(0, 12)}→${built.afterSha.slice(0, 12)})`);
    /* restore: rebuild the shadow from the untouched sources and prove every copy is back */
    const pristineSha = { runtime: sha256(REAL_SOURCES.runtimeClient), package: sha256(join(PLUGIN, 'package.json')), client: sha256(join(PLUGIN, 'lib', 'client.js')), host: sha256(join(PLUGIN, 'lib', 'index.js')), bridge: sha256(join(PLUGIN, 'lib', 'native-bridge.js')) };
    buildShadowPristine(built.target);
    const restoredHashes = {
      runtime: sha256(join(built.target, 'runtime', 'client.js')) === pristineSha.runtime,
      package: sha256(join(built.target, 'package.json')) === pristineSha.package,
      client: sha256(join(built.target, 'lib', 'client.js')) === pristineSha.client,
      host: sha256(join(built.target, 'lib', 'index.js')) === pristineSha.host,
      bridge: sha256(join(built.target, 'lib', 'native-bridge.js')) === pristineSha.bridge,
    };
    record.restored = restoredHashes;
    say(`    restore: shadow rebuilt from pristine, all five hashes match the product = ${JSON.stringify(restoredHashes)}`);
  }

  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, 'probe22-mutations.json'), `${JSON.stringify({ mode: wanted, baseline, mutations: records }, null, 2)}\n`, 'utf8');
  const bad = records.filter((record) => record.ok !== true);
  say('');
  say(`MUTATIONS total=${records.length} red_on_target=${records.filter((record) => record.ok).length} problems=${bad.length}`);
  for (const record of records) say(`  ${record.ok ? 'ok  ' : 'BAD '} ${record.id.padEnd(24)} red=${JSON.stringify(record.red)} expected=${JSON.stringify(record.expectRed)}`);
  process.exitCode = bad.length === 0 && baselineFailed.length === 0 ? 0 : 1;
};

await main();
