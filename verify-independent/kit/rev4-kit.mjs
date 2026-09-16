/**
 * rev4-kit.mjs — self-built stubs for the rev-4 adversarial verification.
 *
 * WRITTEN BY THE INDEPENDENT VERIFIER. It deliberately imports NOTHING from
 * `dsh-approval-chime/verify/**` (no `_harness.mjs`): the point of this pass is
 * to observe rev-4 through a second, independently written instrument. Only
 * node builtins are used here, and the two files under test are read from disk
 * as text (client.js) or imported as a module (index.js) — never patched.
 *
 * Contents:
 *   - a tee logger that writes PASS/FAIL lines to verify-independent/_raw/,
 *   - process-level hazard tracking (unhandled rejection / uncaught exception),
 *   - a mini React (useState/useEffect/useRef + synchronous re-render),
 *   - a fake DOM (style injection capture, gesture listeners),
 *   - a fake AudioContext that records the real audio graph,
 *   - a fake settings scope, and a client-side cordis context,
 *   - a vm-based loader for `lib/client.js` (a browser bundle, not a module).
 */

import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const KIT_DIR = dirname(fileURLToPath(import.meta.url));
export const INDEPENDENT_DIR = join(KIT_DIR, '..');
export const PLUGIN_DIR = join(INDEPENDENT_DIR, '..');
export const RAW_DIR = join(INDEPENDENT_DIR, '_raw');
export const AUDIO_DIR = join(PLUGIN_DIR, 'audio');
export const HOST_HALF = join(PLUGIN_DIR, 'lib', 'index.js');
export const CLIENT_HALF = join(PLUGIN_DIR, 'lib', 'client.js');

export const ID_A = '11111111-2222-4333-8444-555555555555';
export const ID_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
export const ID_C = '12345678-1234-4234-8234-123456789012';

/* --------------------------------------------------------------------- log */

export function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/**
 * A reporter that prints every line AND archives it, so the report can quote
 * raw output that provably comes from the command it names.
 */
export function createLog(name) {
  mkdirSync(RAW_DIR, { recursive: true });
  const file = join(RAW_DIR, `rev4-${name}.txt`);
  const lines = [];
  let passed = 0;
  let failed = 0;
  // Truncate: an archive must hold exactly ONE run, or quoted evidence is ambiguous.
  writeFileSync(file, `# rev-4 independent probe raw output\n# probe: ${name}\n# started: ${new Date().toISOString()}\n# cwd: ${process.cwd()}\n`, 'utf8');

  const write = (line) => {
    lines.push(line);
    appendFileSync(file, `${line}\n`, 'utf8');
    console.log(line);
  };

  const api = {
    name,
    file,
    lines,
    get passed() {
      return passed;
    },
    get failed() {
      return failed;
    },
    section(title) {
      write('');
      write(`=== ${title} ===`);
    },
    note(text) {
      write(`      · ${text}`);
    },
    raw(label, text) {
      write(`      RAW ${label}:`);
      for (const line of String(text).split('\n')) write(`      | ${line}`);
    },
    check(label, condition, detail) {
      if (condition === true) {
        passed += 1;
        write(`PASS  ${label}${detail === undefined ? '' : ` — ${detail}`}`);
      } else {
        failed += 1;
        write(`FAIL  ${label}${detail === undefined ? '' : ` — ${detail}`}`);
      }
      return condition === true;
    },
    equal(label, actual, expected) {
      const same = Object.is(actual, expected) || actual === expected;
      return api.check(label, same, `actual=${fmt(actual)} expected=${fmt(expected)}`);
    },
    close(label, actual, expected, epsilon = 1e-9) {
      const ok = typeof actual === 'number' && Math.abs(actual - expected) <= epsilon;
      return api.check(label, ok, `actual=${fmt(actual)} expected=${fmt(expected)}`);
    },
    deepEqual(label, actual, expected) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      return api.check(label, a === b, `actual=${a} expected=${b}`);
    },
    /** Report a defect with severity + file:line + minimal repro. */
    defect(id, severity, location, summary, repro) {
      write('');
      write(`DEFECT ${id} [${severity}] ${location}`);
      write(`      what: ${summary}`);
      write(`      repro: ${repro}`);
      return api;
    },
    unproven(id, summary) {
      write('');
      write(`UNPROVEN ${id}`);
      write(`      ${summary}`);
    },
    summary() {
      write('');
      write(`--- ${name}: ${passed} passed, ${failed} failed ---`);
      write(`--- raw log archived at: ${file}`);
      return failed;
    },
  };
  return api;
}

function fmt(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (Buffer.isBuffer(value)) return `<Buffer ${value.length}B>`;
  try {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  } catch {
    return String(value);
  }
}

/* ------------------------------------------------------------------ hazards */

/** Record process-level hazards; never swallow them silently. */
export function trackHazards() {
  const seen = { rejections: [], exceptions: [], warnings: [] };
  process.on('unhandledRejection', (reason) => {
    seen.rejections.push(reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason));
  });
  process.on('uncaughtException', (error) => {
    seen.exceptions.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  });
  const originalWarn = console.warn;
  console.warn = (...args) => {
    seen.warnings.push(args.map(String).join(' '));
    originalWarn.apply(console, args);
  };
  seen.stop = () => {
    process.removeAllListeners('unhandledRejection');
    process.removeAllListeners('uncaughtException');
    console.warn = originalWarn;
  };
  return seen;
}

export function settle(times = 6) {
  let chain = Promise.resolve();
  for (let index = 0; index < times; index += 1) {
    chain = chain.then(() => new Promise((resolve) => setImmediate(resolve)));
  }
  return chain;
}

/**
 * Make a mid-probe crash visible: without this, `trackHazards`'s
 * uncaughtException listener keeps the process alive and it exits 0 with a
 * truncated log — exactly the failure mode that must never look like a pass.
 */
export function failFastOnCrash(log, hazards) {
  process.on('uncaughtException', (error) => {
    log.check('the probe itself did not crash', false, String((error && error.stack) || error));
    log.summary();
    hazards.stop();
    process.exit(1);
  });
}

/* --------------------------------------------------------------- mini react */

/**
 * The smallest React the card actually uses. State setters re-render
 * SYNCHRONOUSLY so a probe can read the tree right after an event without
 * waiting for a scheduler; effects run after the tree is produced.
 */
export function createMiniReact() {
  const hooks = [];
  let cursor = 0;
  let root = null;
  let tree = null;
  let rendering = false;
  let pending = false;
  let warns = [];

  function runEffects() {
    for (const slot of hooks) {
      if (slot === undefined || slot.effect === undefined) continue;
      const first = slot.mounted !== true;
      const changed = !sameDeps(slot.deps, slot.effectDeps);
      if (!first && !changed) continue;
      if (typeof slot.cleanup === 'function') {
        try {
          slot.cleanup();
        } catch (error) {
          warns.push(`effect cleanup threw: ${error.message}`);
        }
      }
      slot.mounted = true;
      slot.deps = slot.effectDeps;
      slot.cleanup = undefined;
      try {
        const result = slot.effect();
        if (typeof result === 'function') slot.cleanup = result;
      } catch (error) {
        warns.push(`effect threw: ${error.message}`);
      }
    }
  }

  function pass() {
    if (root === null) return;
    rendering = true;
    cursor = 0;
    for (const slot of hooks) {
      if (slot !== undefined) slot.effect = undefined;
    }
    const next = root.fn(root.props);
    rendering = false;
    tree = next;
    runEffects();
    if (pending) {
      pending = false;
      pass();
    }
  }

  function setState(slot, value) {
    slot.value = typeof value === 'function' ? value(slot.value) : value;
    if (rendering) {
      pending = true;
      return;
    }
    pass();
  }

  const React = {
    createElement(type, props, ...children) {
      const merged = props === null || props === undefined ? {} : { ...props };
      merged.children = children.length <= 1 ? children[0] : children;
      return { type, props: merged };
    },
    useState(initial) {
      const index = cursor;
      cursor += 1;
      if (hooks[index] === undefined) {
        hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      }
      const slot = hooks[index];
      return [
        slot.value,
        (value) => {
          setState(slot, value);
        },
      ];
    },
    useEffect(effect, deps) {
      const index = cursor;
      cursor += 1;
      if (hooks[index] === undefined) hooks[index] = {};
      const slot = hooks[index];
      slot.effect = effect;
      slot.effectDeps = deps;
    },
    useRef(initial) {
      const index = cursor;
      cursor += 1;
      if (hooks[index] === undefined) hooks[index] = { ref: { current: initial } };
      return hooks[index].ref;
    },
    useMemo(factory) {
      return factory();
    },
    useCallback(fn) {
      return fn;
    },
  };

  return {
    React,
    warnings: warns,
    setRoot(fn, props) {
      root = { fn, props };
      hooks.length = 0;
      cursor = 0;
      tree = null;
      pass();
    },
    getTree() {
      if (tree === null) pass();
      return tree;
    },
    rerender() {
      pass();
      return tree;
    },
    hookCount() {
      return hooks.length;
    },
  };
}

function sameDeps(left, right) {
  if (left === undefined || right === undefined) return false;
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!Object.is(left[index], right[index])) return false;
  }
  return true;
}

/* ------------------------------------------------------------- tree helpers */

export function walk(node, visit) {
  if (node === null || node === undefined || typeof node !== 'object') return;
  visit(node);
  const children = node.props === undefined ? undefined : node.props.children;
  if (Array.isArray(children)) {
    for (const child of children) walk(child, visit);
  } else if (children !== null && typeof children === 'object') {
    walk(children, visit);
  }
}

export function elementsOfType(tree, type) {
  const found = [];
  walk(tree, (node) => {
    if (node.type === type) found.push(node);
  });
  return found;
}

/** Text of a subtree. Unlike `walk` this descends into string/number children. */
export function flattenText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (node === null || node === undefined || typeof node !== 'object') return '';
  const children = node.props === undefined ? undefined : node.props.children;
  const list = Array.isArray(children) ? children : [children];
  let text = '';
  for (const child of list) text += flattenText(child);
  return text;
}

export function findByClass(tree, className) {
  const found = [];
  walk(tree, (node) => {
    const value = node.props === undefined ? undefined : node.props.className;
    if (typeof value === 'string' && value.split(/\s+/).indexOf(className) >= 0) found.push(node);
  });
  return found;
}

/* ------------------------------------------------------------------ fake DOM */

export function createFakeDocument() {
  const created = [];
  const listeners = new Map();
  const doc = {
    head: {
      appendChild(element) {
        created.push(element);
        return element;
      },
    },
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        id: '',
        textContent: '',
        attributes: {},
        setAttribute(key, value) {
          this.attributes[key] = value;
        },
      };
    },
    getElementById(id) {
      return created.find((element) => element.id === id) ?? null;
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const bucket = listeners.get(type);
      if (bucket === undefined) return;
      const at = bucket.indexOf(handler);
      if (at >= 0) bucket.splice(at, 1);
    },
  };
  return { document: doc, created, listeners };
}

/* ------------------------------------------------------------ fake AudioContext */

/**
 * Records the audio graph the card really builds. Options let a probe make one
 * step fail on purpose (decode throws / fetch missing / start with no buffer).
 */
export function createAudioStub(options = {}) {
  const track = {
    gains: [],
    oscillators: [],
    sources: [],
    decoded: [],
    started: [],
    resumes: 0,
    constructed: 0,
  };

  class AudioContextStub {
    constructor() {
      track.constructed += 1;
      this.state = options.state ?? 'running';
      this.currentTime = 1.5;
      this.destination = { kind: 'destination' };
    }

    createGain() {
      const node = {
        kind: 'gain',
        gain: {
          value: 1,
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connected: [],
        connect(target) {
          node.connected.push(target);
          return target;
        },
      };
      track.gains.push(node);
      return node;
    }

    createOscillator() {
      const node = {
        kind: 'oscillator',
        type: 'sine',
        frequency: { value: 0, setValueAtTime() {} },
        connected: [],
        started: null,
        connect(target) {
          node.connected.push(target);
          return target;
        },
        start(at) {
          node.started = at;
          track.oscillators.push(node);
        },
        stop() {},
      };
      return node;
    }

    createBufferSource() {
      const node = {
        kind: 'source',
        buffer: null,
        connected: [],
        connect(target) {
          node.connected.push(target);
          return target;
        },
        start(at) {
          if (options.startNeedsBuffer === true && (node.buffer === null || node.buffer === undefined)) {
            throw new Error('InvalidStateError: buffer is null');
          }
          node.startedAt = at;
          track.sources.push(node);
          track.started.push(node);
        },
      };
      return node;
    }

    decodeAudioData(bytes) {
      if (options.decodeThrows === true) throw new Error('decodeAudioData exploded (sync)');
      if (options.decodeRejects === true) return Promise.reject(new Error('decodeAudioData rejected'));
      if (options.decodeReturnsUndefined === true) return undefined;
      track.decoded.push(bytes);
      return Promise.resolve({ byteLength: bytes === undefined ? 0 : bytes.byteLength, duration: 0.2 });
    }

    resume() {
      track.resumes += 1;
      this.state = 'running';
      return Promise.resolve();
    }

    suspend() {
      this.state = 'suspended';
      return Promise.resolve();
    }
  }

  return { AudioContext: AudioContextStub, track };
}

/* --------------------------------------------------------------- fake scope */

export function createScope(initial = {}, options = {}) {
  const value = { ...initial };
  const user = { ...initial };
  const snapshot = {
    status: options.status ?? 'ready',
    writable: options.writable ?? true,
    mode: options.mode ?? 'disk',
    revision: 1,
    value,
    user,
  };
  const subscribers = new Set();
  const calls = [];
  const scope = {
    calls,
    snapshot,
    getSnapshot() {
      return {
        ...snapshot,
        value: { ...snapshot.value },
        user: { ...snapshot.user },
      };
    },
    subscribe(listener) {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    set(field, next) {
      calls.push({ op: 'set', field, value: next });
      if (options.setFails === true) return Promise.reject(new Error('write refused'));
      snapshot.value[field] = next;
      snapshot.user[field] = next;
      snapshot.revision += 1;
      for (const listener of [...subscribers]) listener();
      return Promise.resolve();
    },
    unset(field) {
      calls.push({ op: 'unset', field });
      delete snapshot.value[field];
      delete snapshot.user[field];
      snapshot.revision += 1;
      for (const listener of [...subscribers]) listener();
      return Promise.resolve();
    },
    /** Test-only: mutate the value without a write call, then notify. */
    poke(field, next) {
      snapshot.value[field] = next;
      snapshot.revision += 1;
      for (const listener of [...subscribers]) listener();
    },
  };
  return scope;
}

/* ------------------------------------------------------- client-half sandbox */

/**
 * Load `lib/client.js` the way the browser would: a plain script that finds
 * `window.__ModuleLoader__` and registers a factory. No rewrite, no patch.
 */
export function createClientSandbox() {
  const source = readFileSync(CLIENT_HALF, 'utf8');
  const registrations = [];
  const { document, created, listeners } = createFakeDocument();
  const consoleLines = [];
  const sandboxObject = {
    window: {
      __ModuleLoader__: {
        load(spec) {
          registrations.push(spec);
        },
      },
    },
    document,
    console: {
      log: (...args) => consoleLines.push(['log', args]),
      warn: (...args) => consoleLines.push(['warn', args]),
      error: (...args) => consoleLines.push(['error', args]),
      info: (...args) => consoleLines.push(['info', args]),
      debug: () => {},
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  const context = vm.createContext(sandboxObject);
  vm.runInContext(source, context, { filename: 'dsh-approval-chime/lib/client.js' });

  return {
    source,
    registrations,
    created,
    listeners,
    consoleLines,
    sandboxObject,
    context,
    /** Globals of the browser half. `fetch` is deliberately absent until set. */
    setGlobal(key, value) {
      sandboxObject[key] = value;
    },
    get window() {
      return sandboxObject.window;
    },
  };
}

/**
 * The cordis context the browser half's `apply` expects, plus a renderer for
 * the card the plugin registers on the slot.
 */
export function createClientHarness(sandbox, options = {}) {
  const scope = options.scope ?? createScope(options.settings ?? { enabled: true, volume: 70, tone: 'chime', custom: [] });
  const state = {
    slotRegistrations: [],
    localeRegistrations: [],
    effects: [],
    disposes: [],
    warns: sandbox.consoleLines,
  };
  let pendingSource = options.pendingSource ?? {
    snapshot: new Map(),
    getSnapshot() {
      return this.snapshot;
    },
    subscribe() {
      return () => {};
    },
  };

  const ctx = {
    settingsScope: {
      bind(request) {
        state.boundRequest = request;
        if (options.bindThrows === true) throw new Error('bind refused');
        return scope;
      },
    },
    slots: {
      inject(slot, callback) {
        state.injectedSlot = slot;
        callback();
      },
      register(spec, component) {
        state.slotRegistrations.push({ options: spec, component });
        return () => {};
      },
    },
    locale: {
      register(namespace, dict) {
        state.localeRegistrations.push({ namespace, dict });
        return () => {};
      },
    },
    uiSession: {
      get pendingInteractions() {
        return pendingSource;
      },
    },
    effect(callback) {
      state.effects.push(callback);
      try {
        const disposer = callback();
        if (typeof disposer === 'function') state.disposes.push(disposer);
      } catch (error) {
        state.effectsError = error;
        throw error;
      }
    },
  };

  const contract = sandbox.registrations.length > 0 ? sandbox.registrations[0] : null;
  const mini = createMiniReact();
  const harness = {
    scope,
    state,
    ctx,
    mini,
    contract,
    diagnostics: null,
    module: null,
    get pendingInteractions() {
      return pendingSource;
    },
    setPendingSource(source) {
      pendingSource = source;
    },
    apply() {
      if (contract === null) throw new Error('client.js registered no factory');
      harness.module = contract.factory((id) => {
        if (id === 'react') return mini.React;
        throw new Error(`unexpected require(${id})`);
      });
      harness.module.apply(ctx);
      harness.diagnostics = sandbox.window.__DSH_APPROVAL_CHIME__ ?? null;
      return harness.module;
    },
    /** Render the card the plugin registered, exactly as the settings slot would. */
    mountCard(props = {}) {
      const entry = state.slotRegistrations[0];
      if (entry === undefined) throw new Error('the card registered no slot entry');
      mini.setRoot(entry.component, props);
      return mini.getTree();
    },
    get tree() {
      return mini.getTree();
    },
    options() {
      return elementsOfType(mini.getTree(), 'option').map((node) => node.props.value);
    },
    select() {
      return elementsOfType(mini.getTree(), 'select')[0];
    },
    buttons() {
      return elementsOfType(mini.getTree(), 'button');
    },
    buttonLabels() {
      return elementsOfType(mini.getTree(), 'button').map((node) => flattenText(node));
    },
    fileInput() {
      return elementsOfType(mini.getTree(), 'input').find((node) => node.props.type === 'file');
    },
    /** Drive the hidden file input the way a real <input type=file> would. */
    chooseFile(fileLike) {
      const input = harness.fileInput();
      if (input === undefined) throw new Error('no file input rendered');
      const target = { files: [fileLike], value: 'user-picked' };
      harness.lastFileTarget = target;
      input.props.onChange({ target });
      return input;
    },
    clickButton(label) {
      const node = elementsOfType(mini.getTree(), 'button').find((button) => flattenText(button) === label);
      if (node === undefined) throw new Error(`no button labelled ${label}`);
      node.props.onClick({});
      return node;
    },
    exportDiagnostics() {
      return harness.diagnostics;
    },
  };
  return harness;
}

/* ----------------------------------------------------------------- utilities */

export function styleTextOf(sandbox) {
  const tag = sandbox.created.find((element) => element.id === 'dsh-approval-chime/styles');
  return tag === undefined ? '' : String(tag.textContent);
}

/** Extract one `@supports (...) {...}` block by brace matching. */
export function extractSupportsBlock(css, condition) {
  const needle = `@supports ${condition}{`;
  const start = css.indexOf(needle);
  if (start < 0) return null;
  let depth = 1;
  let index = start + needle.length;
  const bodyStart = index;
  while (index < css.length && depth > 0) {
    const character = css[index];
    if (character === '{') depth += 1;
    else if (character === '}') depth -= 1;
    index += 1;
  }
  return { start, end: index, body: css.slice(bodyStart, index - 1) };
}

export function listAudioFiles(readdirSyncImpl) {
  try {
    return readdirSyncImpl(AUDIO_DIR);
  } catch {
    return [];
  }
}

export function wipeAudioDir() {
  try {
    rmSync(AUDIO_DIR, { recursive: true, force: true });
  } catch {
    /* the directory is recreated by the route under test */
  }
}
