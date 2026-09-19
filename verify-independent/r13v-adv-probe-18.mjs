/**
 * Independent probe 18 (verifier, task t2) — rev-10: per-session chime.
 *
 * FOUR CLAIMS ARE PUT ON TRIAL, against the SHIPPED BYTES of lib/client.js and
 * lib/index.js (no copy, no re-implementation of the plugin):
 *   1. the session header really carries a bell, and a click writes THAT session;
 *   2. the effective value is exactly `override ?? global`, field by field;
 *   3. one batch of N sessions makes N sounds, 180 ms apart, and a session muted by
 *      its own override does not sound and is counted on its own line;
 *   4. the overrides really land in the plugin's own file (atomic write, 400/404,
 *      200-record cap, $DSH_HOME, corrupt-store degradation) — never in the settings
 *      document and never in browser storage.
 *
 * INDEPENDENCE (contract: "must use its own loader and stubs, must not reuse
 * verify/_harness.mjs"). This file imports NOTHING from `dsh-approval-chime/verify/`
 * and nothing from `verify-independent/kit/`. The classic-script loader, the
 * function-component driver, the DOM/AudioContext/fetch stubs, the virtual clock and
 * the HTTP server are all written below, from the host contracts read first-hand:
 *   - the slot itself, its kind/scope and its register options: the platform's own
 *     contract catalog says `conversation.session.header.actions` is `kind: "list"`,
 *     `scope: "session"`, options `id` (required) / `order` / `label`
 *     (dsh-cordis-client-runner/lib/client.js:3102-3126), and that its standard
 *     props include `sessionId: SessionId` (:3129-3144);
 *   - the session-scope binding supplies that `sessionId` as a plain prop:
 *     dsh-client-ui-session/lib/client.js:61-70 (`props: ["sessionId"]`,
 *     `props: { sessionId: binding.sessionId }`) and :246-267, merged into the entry
 *     kit by dsh-client-ui-renderer/lib/client.js:538-539, :551-573, :792;
 *   - the render site hands the slot an EMPTY owner-props object and the cell lives
 *     in the header's action cluster: dsh-client-ui-conversation/lib/client.js:15067-15070;
 *   - the three shipped occupants and their orders: agent-preset -10
 *     (dsh-client-ui-agent-preset/lib/client.js:1474-1479), schedule-catalog 10
 *     (dsh-client-ui-schedule/lib/client.js:293-298), job-list 20
 *     (dsh-client-ui-jobs/lib/client.js:266-271);
 *   - the pending table is `ReadonlyMap<SessionId, PendingInteraction>` rebuilt as a
 *     Map keyed by `interaction.sessionId`, one interaction per session:
 *     dsh-client-ui-session/lib/client.js:213-227, surfaced through
 *     `pendingInteractions.getSnapshot/subscribe` (:83-90);
 *   - the route table is keyed by `(kind, path)` and a duplicate THROWS:
 *     dsh-host-webserver/lib/index.js:176-183;
 *   - the home rule (a whitespace-only $DSH_HOME counts as unset):
 *     @deepseek-ai/dsh-home-paths/lib/index.js:49-51, :73-76.
 *
 * THE FALSIFIABILITY SECTION AT THE END IS NOT DECORATION: `--mutate=<name>` loads a
 * deliberately broken IN-MEMORY copy of the same bytes and REQUIRES the observed
 * red set to be exactly the declared one. A mutation the probe fails to notice is a
 * failure of the probe; a mutation that reddens more than it declared is reported as
 * "not surgical". So "the probe passes" and "the probe can go red" are two separate
 * measurements.
 *
 * Run:  node verify-independent/probe-18-r10-sessions.mjs
 *       node verify-independent/probe-18-r10-sessions.mjs --list-mutations
 *       node verify-independent/probe-18-r10-sessions.mjs --mutate=all
 *       node verify-independent/probe-18-r10-sessions.mjs --mutate=<name>
 *
 * Exit 0 when every check passes (and, per mutation, when the red set matches the
 * declaration). Exit 1 otherwise. Nothing outside `os.tmpdir()` is written.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

/* ------------------------------------------------------------------ locations */

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = resolve(HERE, '..');
const CLIENT_PATH = join(PLUGIN, 'lib', 'client.js');
const INDEX_PATH = join(PLUGIN, 'lib', 'index.js');
const HOST_ROOT = join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx', '1e7f6d9597241db0', 'node_modules', '@deepseek-ai');
const WEBSERVER_PATH = join(HOST_ROOT, 'dsh-host-webserver', 'lib', 'index.js');
const HOME_PATHS_PATH = join(HOST_ROOT, 'dsh-home-paths', 'lib', 'index.js');
const SESSIONS_SLOT = 'conversation.session.header.actions';
const SESSIONS_ROUTE = '/api/approval-chime/sessions';
const AUDIO_ROUTE = '/api/approval-chime/audio';
const NS = 'approval-chime';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase();

/* ------------------------------------------------------------------ reporter */

let passed = 0;
const failures = [];
let section = '(none)';

function note(line) {
  console.log(line);
}

function startSection(title) {
  section = title;
  console.log(`\n=== ${title} ===`);
}

function check(id, ok, detail) {
  if (ok === true) {
    passed += 1;
    console.log(`  ok   ${id}${detail === undefined ? '' : ` :: ${detail}`}`);
  } else {
    failures.push({ id, section, detail: detail === undefined ? '' : String(detail) });
    console.log(`  FAIL ${id}${detail === undefined ? '' : ` :: ${detail}`}`);
  }
  return ok === true;
}

const show = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const eq = (a, b) => show(a) === show(b);

/* ------------------------------------------------------------------- sandbox */

/** A monotone virtual clock plus a controllable timer table (no real waiting). */
function makeClock(baseEpoch) {
  let now = 0;
  let sequence = 1;
  const timers = new Map();
  return {
    now: () => now,
    epoch: () => baseEpoch + now,
    setTimeout(handler, ms) {
      const id = sequence;
      sequence += 1;
      timers.set(id, { handler, at: now + (Number.isFinite(Number(ms)) ? Number(ms) : 0) });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    pending: () => [...timers.values()].map((entry) => entry.at).sort((a, b) => a - b),
    drain() {
      const fired = [];
      for (let guard = 0; guard < 512; guard += 1) {
        const due = [...timers.entries()]
          .filter(([, entry]) => entry.at >= now)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
        if (due.length === 0) break;
        const [id, entry] = due[0];
        timers.delete(id);
        now = Math.max(now, entry.at);
        fired.push(now);
        entry.handler();
      }
      return fired;
    },
    reset() {
      now = 0;
      timers.clear();
    },
  };
}

/**
 * The audio graph, INSTRUMENTED instead of counted: "what really went into the
 * chime" is the master gain's value (volume x MASTER_GAIN) plus the oscillator wave
 * and frequency the plugin scheduled — not the plugin's own counters.
 */
function makeAudioProbe(clock) {
  const events = [];
  let masterGain = null;
  function Ctor() {
    const self = this;
    self.state = 'running';
    self.currentTime = 0;
    self.sampleRate = 48000;
    self.destination = { dshDestination: true };
    self.createGain = () => {
      const node = {
        gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect(target) {
          if (target === self.destination) masterGain = node.gain.value;
        },
      };
      return node;
    };
    self.createOscillator = () => {
      const node = {
        type: '',
        frequency: { value: 0 },
        connect() {},
        start(at) {
          events.push({ kind: 'tone', wave: node.type, freq: node.frequency.value, gain: masterGain, at, vnow: clock.now() });
        },
        stop() {},
      };
      return node;
    };
    self.createBufferSource = () => {
      const node = {
        buffer: null,
        connect() {},
        start() {
          events.push({ kind: 'sample', id: node.buffer === null ? null : node.buffer.marker, gain: masterGain, vnow: clock.now() });
        },
      };
      return node;
    };
    self.decodeAudioData = (bytes) => Promise.resolve({ marker: bytes === null || bytes === undefined ? null : bytes.marker });
    self.resume = () => {
      self.state = 'running';
      return Promise.resolve();
    };
    self.close = () => Promise.resolve();
  }
  return {
    Ctor,
    events,
    reset() {
      events.length = 0;
      masterGain = null;
    },
    /** One row per chime, in the order the plugin made it. */
    chimes() {
      const byTime = new Map();
      for (const entry of events) {
        if (!byTime.has(entry.vnow)) byTime.set(entry.vnow, []);
        byTime.get(entry.vnow).push(entry);
      }
      return [...byTime.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([at, rows]) => ({
          at,
          gain: rows[0].gain,
          wave: rows.find((row) => row.kind === 'tone')?.wave ?? null,
          freqs: rows.filter((row) => row.kind === 'tone').map((row) => row.freq),
          sample: rows.find((row) => row.kind === 'sample')?.id ?? null,
        }));
    },
  };
}

/** A minimal but faithful function-component driver (useState/useRef/useEffect). */
function makeReact() {
  let current = null;
  return {
    createElement(type, props, ...children) {
      const flat = [];
      for (const child of children) {
        if (Array.isArray(child)) flat.push(...child);
        else flat.push(child);
      }
      const element = { type, props: props === null || props === undefined ? {} : props, children: flat };
      const ref = element.props.ref;
      if (ref !== null && ref !== undefined && typeof ref === 'object') ref.current = makeElementHandle();
      return element;
    },
    useState(initial) {
      const holder = current;
      const index = holder.cursor;
      holder.cursor += 1;
      if (!(index in holder.states)) holder.states[index] = typeof initial === 'function' ? initial() : initial;
      const set = (value) => {
        const next = typeof value === 'function' ? value(holder.states[index]) : value;
        if (!Object.is(next, holder.states[index])) {
          holder.states[index] = next;
          holder.dirty = true;
        }
      };
      return [holder.states[index], set];
    },
    useRef(initial) {
      const holder = current;
      const index = holder.cursor;
      holder.cursor += 1;
      if (!(index in holder.refs)) holder.refs[index] = { current: initial };
      return holder.refs[index];
    },
    useEffect(fn, deps) {
      const holder = current;
      const index = holder.cursor;
      holder.cursor += 1;
      holder.effects.push({ index, fn, deps });
    },
    __setCurrent(holder) {
      current = holder;
    },
  };
}

/** A stand-in for anything React would hand back through a `ref`. */
function makeElementHandle() {
  const handle = {
    rect: { left: 300, top: 20, bottom: 40, right: 320, width: 20, height: 20 },
    rectReads: 0,
    insideTargets: new Set(),
    focused: 0,
    contains: (target) => handle.insideTargets.has(target),
    getBoundingClientRect() {
      handle.rectReads += 1;
      return handle.rect;
    },
    focus() {
      handle.focused += 1;
    },
  };
  return handle;
}

/** Mount one function component, running effects and re-rendering on setState. */
function mount(Comp, props, runtime) {
  const holder = { states: [], refs: [], cursor: 0, dirty: false, effects: [], deps: [], cleanups: [], tree: null };
  const pass = () => {
    for (let guard = 0; guard < 24; guard += 1) {
      holder.dirty = false;
      holder.cursor = 0;
      holder.effects = [];
      runtime.__setCurrent(holder);
      holder.tree = Comp(props);
      runtime.__setCurrent(null);
      for (const effect of holder.effects) {
        const previous = holder.deps[effect.index];
        const same = previous !== undefined && effect.deps !== undefined && previous.length === effect.deps.length
          && effect.deps.every((value, index) => Object.is(value, previous[index]));
        if (same) continue;
        const cleanup = holder.cleanups[effect.index];
        if (typeof cleanup === 'function') cleanup();
        holder.deps[effect.index] = effect.deps;
        const disposer = effect.fn();
        holder.cleanups[effect.index] = typeof disposer === 'function' ? disposer : undefined;
      }
      if (holder.dirty !== true) break;
    }
  };
  pass();
  return {
    get tree() {
      return holder.tree;
    },
    rerender() {
      pass();
      return holder.tree;
    },
  };
}

/* ------------------------------------------------------------ tree utilities */

function walk(node, visit) {
  if (node === null || node === undefined || typeof node !== 'object') return;
  visit(node);
  for (const child of node.children ?? []) {
    if (child !== null && typeof child === 'object') walk(child, visit);
  }
}

const findAll = (root, predicate) => {
  const out = [];
  walk(root, (node) => {
    if (predicate(node) === true) out.push(node);
  });
  return out;
};

const byClass = (root, className) => findAll(root, (node) => node.props !== undefined && node.props.className === className);
const findBy = (root, predicate) => findAll(root, predicate)[0] ?? null;

function texts(root) {
  const out = [];
  walk(root, (node) => {
    for (const child of node.children ?? []) if (typeof child === 'string') out.push(child);
  });
  return out;
}

/* ------------------------------------------------------------ plugin loading */

function makeDateShim(clock) {
  const Real = Date;
  return class VirtualDate extends Real {
    constructor(...args) {
      if (args.length === 0) super(clock.epoch());
      else super(...args);
    }
    static now() {
      return clock.epoch();
    }
  };
}

/**
 * Load the shipped client bundle in a fresh vm realm with our own classic-script
 * loader, capture the `{name, inject, apply}` module and hand back the ledgers.
 */
function loadClient(source, options = {}) {
  const clock = options.clock ?? makeClock(1730000000000);
  const audio = options.audio ?? makeAudioProbe(clock);
  const sandbox = {};
  const registrations = [];
  const slots = { injects: [], entries: [] };
  const fetchLog = [];
  const storageTouches = [];
  const documentListeners = new Map();
  const styleNodes = [];
  const runtime = makeReact();

  sandbox.__ModuleLoader__ = { load: (registration) => registrations.push(registration) };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.console = { warn() {}, log() {}, error() {} };
  sandbox.AudioContext = audio.Ctor;
  sandbox.setTimeout = (handler, ms) => clock.setTimeout(handler, ms);
  sandbox.clearTimeout = (id) => clock.clearTimeout(id);
  sandbox.Date = options.realDate === true ? Date : makeDateShim(clock);
  sandbox.window.innerWidth = 1280;
  sandbox.window.innerHeight = 800;
  sandbox.fetch = () => Promise.reject(new Error('probe: no fetch installed for this bundle'));
  sandbox.document = {
    head: { appendChild(node) { styleNodes.push(node); } },
    getElementById: () => null,
    createElement: (tag) => ({ tagName: tag, id: '', textContent: '', setAttribute() {}, appendChild() {} }),
    addEventListener(type, handler, capture) {
      const list = documentListeners.get(type) ?? [];
      list.push({ handler, capture });
      documentListeners.set(type, list);
    },
    removeEventListener(type, handler) {
      documentListeners.set(type, (documentListeners.get(type) ?? []).filter((entry) => entry.handler !== handler));
    },
    dispatch(type, event) {
      for (const entry of [...(documentListeners.get(type) ?? [])]) entry.handler(event);
    },
  };
  for (const name of ['localStorage', 'sessionStorage', 'indexedDB']) {
    Object.defineProperty(sandbox, name, {
      configurable: true,
      get() {
        storageTouches.push(name);
        return undefined;
      },
    });
  }

  const context = vm.createContext(sandbox);
  vm.runInContext(source, context, { filename: CLIENT_PATH });

  if (registrations.length !== 1) throw new Error(`expected exactly one module registration, saw ${registrations.length}`);
  const module = registrations[0].factory((id) => {
    if (id !== 'react') throw new Error(`unexpected require('${id}')`);
    return runtime;
  });

  return {
    module,
    sandbox,
    runtime,
    clock,
    audio,
    slots,
    fetchLog,
    storageTouches,
    documentListeners,
    document: sandbox.document,
    diagnostics: sandbox.__DSH_APPROVAL_CHIME__,
    styles: () => styleNodes.map((node) => node.textContent).join('\n'),
    setFetch(implementation) {
      sandbox.fetch = (url, init) => {
        fetchLog.push({ url: String(url), init: init ?? null });
        return implementation(String(url), init);
      };
    },
  };
}

/* ----------------------------------------------------------- plugin context */

function makePendingSource() {
  let snapshot = new Map();
  const listeners = [];
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
    emit(map) {
      snapshot = map;
      for (const listener of [...listeners]) listener();
    },
  };
}

function makeScope(initial) {
  let value = { ...(initial ?? { enabled: true, volume: 70, tone: 'chime', custom: [] }) };
  const listeners = [];
  const sets = [];
  const unsets = [];
  return {
    sets,
    unsets,
    getValue: () => value,
    setValue(next) {
      value = { ...next };
      for (const listener of [...listeners]) listener();
    },
    getSnapshot: () => ({ status: 'ready', value, writable: true, mode: 'file', revision: 7, user: value }),
    subscribe: (listener) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
    set: (field, next) => {
      sets.push([field, next]);
      value = { ...value, [field]: next };
      for (const listener of [...listeners]) listener();
      return Promise.resolve(true);
    },
    unset: (field) => {
      unsets.push(field);
      const copy = { ...value };
      delete copy[field];
      value = copy;
      for (const listener of [...listeners]) listener();
      return Promise.resolve(true);
    },
  };
}

function applyBundle(bundle, options = {}) {
  const scope = makeScope(options.scope);
  const pending = makePendingSource();
  const effects = [];
  const ctx = {
    slots: {
      inject: (name, factory) => {
        bundle.slots.injects.push({ name, factory });
        return factory();
      },
      register: (entry, component) => {
        bundle.slots.entries.push({ entry, component });
        return () => {};
      },
    },
    settingsScope: { bind: () => scope },
    uiSession: { pendingInteractions: pending },
    locale: { register: () => () => {}, bind: () => (key) => key },
    effect: (fn) => {
      const disposer = fn();
      effects.push(disposer);
      return disposer;
    },
    logger: { info() {}, warn() {}, error() {} },
  };
  bundle.module.apply(ctx);
  return {
    scope,
    pending,
    ctx,
    entryFor: (name) => bundle.slots.entries.find((row) => row.entry.name === name) ?? null,
    dispose() {
      for (const disposer of effects) if (typeof disposer === 'function') disposer();
    },
  };
}

const flush = async (times = 6) => {
  for (let index = 0; index < times; index += 1) await new Promise((resolve) => setImmediate(resolve));
};

/* -------------------------------------------------------------- HTTP server */

/**
 * The profile's web server, reduced to the part this plugin uses. The route TABLE
 * and its duplicate rule mirror dsh-host-webserver/lib/index.js:176-183 exactly:
 * keyed by (kind, path); a second registration at the same (kind, path) throws.
 */
function makeWebServer() {
  const exact = new Map();
  const prefixes = new Map();
  const order = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const route = exact.get(url.pathname)
      ?? [...prefixes.entries()]
        .filter(([path]) => url.pathname === path || url.pathname.startsWith(path))
        .sort((a, b) => b[0].length - a[0].length)[0]?.[1];
    if (route === undefined) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'no route' }));
      return;
    }
    try {
      route.handler(req, res);
    } catch (error) {
      res.statusCode = 500;
      res.end(String(error));
    }
  });
  return {
    order,
    server,
    register(route) {
      const table = route.kind === 'exact' ? exact : prefixes;
      if (table.has(route.path)) throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`);
      table.set(route.path, route);
      order.push(`${route.kind} ${route.path}`);
      return () => table.delete(route.path);
    },
  };
}

async function request(base, path, options = {}) {
  const response = await fetch(base + path, options);
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body, text };
}

const json = (body, status = 200) => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
});

/* ----------------------------------------------------------------- mutations */

/**
 * Every mutation is a pure string edit of the SHIPPED source held in memory; the
 * client one is handed straight to the loader, the host one is imported through a
 * `data:` URL. Nothing is written to disk, so `lib/**` hashes cannot move.
 * `expect` lists the complete set of check ids that MUST go red — no more, no less.
 */
const MUTATIONS = [
  /* ---- r13v adversarial additions (verifier t3): NO declared red set, so probe-18 prints
     the red set it actually observes. These break the rev-14 bell claims in ways the round
     never declared. ---- */
  {
    name: "adv-muted-bell-filled",
    target: 'client',
    what: "rev-14 break: the blue fill moves from the AUDIBLE state to the plain .dacBell class, so a MUTED session is filled blue too",
    from: "'.dacBell[data-muted=\"false\"]{background:' + BELL_ON_BG + ';color:' + BELL_ON_FG + ';}'",
    to: "'.dacBell{background:' + BELL_ON_BG + ';color:' + BELL_ON_FG + ';}'",
    expect: [],
  },
  {
    name: "adv-bell-hover-dropped",
    target: 'client',
    what: "rev-14 break: the filled bell loses its own :hover rule (the generic .dacBell:hover then wipes the blue under the pointer)",
    from: "'.dacBell[data-muted=\"false\"]:hover{background:' + BELL_ON_BG_HOVER + ';}',",
    to: "",
    expect: [],
  },
  {
    name: "adv-bell-token-hardcoded",
    target: 'client',
    what: "rev-14 break: the fill copies the hex value instead of using the switch/slider design token",
    from: "'.dacBell[data-muted=\"false\"]{background:' + BELL_ON_BG + ';color:' + BELL_ON_FG + ';}'",
    to: "'.dacBell[data-muted=\"false\"]{background:#2563eb;color:#fff;}'",
    expect: [],
  },
  {
    name: "adv-muted-bell-recolored",
    target: 'client',
    what: "rev-14 break: the muted bell stops using the caption-grey token",
    from: "'.dacBell[data-muted=\"true\"]{color:var(--dsw-alias-label-caption,#71717a);}',",
    to: "'.dacBell[data-muted=\"true\"]{color:#000;}',",
    expect: [],
  },
  {
    name: 'mute-ignored',
    target: 'client',
    what: 'sessionSettings(): let the global switch win over the session override ("mute one session" quietly becomes "follow the global")',
    from: 'var enabled = record !== null && typeof record.enabled === \'boolean\' ? record.enabled : globals.enabled;',
    to: 'var enabled = globals.enabled;',
    expect: ['B3.label-both-languages-off', 'B3b.muted-state-attributes', 'B4.icon-two-states', 'C2.unmute-clears-override', 'C2c.local-table-back-to-follow', 'C6.mute-one-session-only', 'C6b.only-the-other-session-rings', 'C6c.suppressedSession-one', 'D3', 'E7.muted-session-does-not-sound', 'E8.gap-survives-mute', 'E9.suppressedSession-counted', 'E9b.batch-counters-after-mute', 'I1b.one-POST-per-click'],
  },
  {
    name: 'unmute-writes-true',
    target: 'client',
    what: 'toggleSession(): turning a muted session back on WRITES true instead of clearing the override',
    from: 'return writeSessionPatch(sessionId, view.enabled === true ? { enabled: false } : { enabled: null });',
    to: 'return writeSessionPatch(sessionId, view.enabled === true ? { enabled: false } : { enabled: true });',
    expect: ['C2.unmute-clears-override', 'C2b.never-writes-true', 'C2c.local-table-back-to-follow', 'C5.a-session-that-does-not-act-is-untouched', 'I1b.one-POST-per-click'],
  },
  {
    name: 'batch-gap-zero',
    target: 'client',
    what: 'BATCH_GAP_MS 180 -> 0 (the batch collapses into one louder sound)',
    from: 'var BATCH_GAP_MS = 180;',
    to: 'var BATCH_GAP_MS = 0;',
    expect: ['A4.diagnostics-surface', 'E1.three-sessions-three-chimes', 'E2.gaps-are-180', 'E3.snapshot-order', 'E7.muted-session-does-not-sound', 'E8.gap-survives-mute'],
  },
  {
    name: 'session-id-constant',
    target: 'client',
    what: 'the bell reads a constant instead of props.sessionId (the click stops writing THIS session)',
    from: "var sessionId = props !== null && props !== undefined && typeof props.sessionId === 'string' ? props.sessionId : '';",
    to: "var sessionId = 'constant-session';",
    expect: ['B1.props-session-id', 'B5.no-session-id-renders-nothing', 'B8.popover-opens', 'C1.mute-body', 'C2.unmute-clears-override', 'C6.mute-one-session-only', 'C6b.only-the-other-session-rings', 'C6c.suppressedSession-one'],
  },
  {
    name: 'custom-tone-no-fallback',
    target: 'client',
    what: 'a missing custom:<uuid> tone stops falling back to the global tone',
    from: 'if (customMissing) tone = globals.tone;',
    to: 'if (customMissing && false) tone = globals.tone;',
    expect: ['D11'],
  },
  {
    name: 'batch-merge-first-only',
    target: 'client',
    what: 'only the first session of a batch sounds (the pre-rev-10 single-chime behaviour)',
    from: 'schedule(playable[playIndex], playIndex * BATCH_GAP_MS);',
    to: 'if (playIndex === 0) schedule(playable[playIndex], playIndex * BATCH_GAP_MS);',
    expect: ['E1.three-sessions-three-chimes', 'E2.gaps-are-180', 'E3.snapshot-order', 'E4.batch-counters', 'E7.muted-session-does-not-sound', 'E8.gap-survives-mute'],
  },
  {
    name: 'evict-newest-first',
    target: 'host',
    what: 'evictSessions() sorts newest-first (the 200-record cap throws away the sessions just used)',
    from: 'const delta = stamp(left) - stamp(right);',
    to: 'const delta = stamp(right) - stamp(left);',
    expect: ['F7.cap-200-and-newest-survives', 'F8.a.odd-ids-survive', 'F8.c.newest-still-there', 'F8.d.evict-is-by-updatedAt', 'F9.d.payload-is-whole-json'],
  },
  {
    name: 'convergence-reread-removed',
    target: 'client',
    what: 'rev-11 regression: skip the convergence re-read after the last outstanding write settles (the pre-rev-11 behaviour — a late answer may leave the local table disagreeing with the store)',
    from: 'return refreshSessions().then(function (ok) {',
    to: 'return Promise.resolve(true).then(function (ok) {',
    expect: ['I2.late-answer-does-not-stick', 'I2b.convergence-reread-issued'],
  },
  {
    name: 'home-blank-accepted',
    target: 'host',
    what: 'a whitespace-only $DSH_HOME stops counting as unset (the store resolves to the current directory)',
    from: "if (typeof configured === 'string' && configured.trim().length > 0) return configured;",
    to: "if (typeof configured === 'string') return configured;",
    expect: ['F4.home-rule'],
  },
];

/**
 * Rewrite ONE occurrence of the anchor in memory. Measured, not assumed (t2 audit):
 *   0 occurrences  -> dead mutation, it would prove nothing;
 *   2+ occurrences -> `String.replace` would pick a spot the author did not mean;
 *   `to === from`  -> a no-op that would look like a caught mutant.
 * Each of the nine anchors is a SINGLE-LINE fragment (this worktree keeps `lib/*.js` CRLF,
 * so a bare `\n` inside an anchor can never match).
 */
function mutate(source, mutation) {
  const first = source.indexOf(mutation.from);
  if (first < 0) throw new Error(`mutation '${mutation.name}': anchor not found (0 occurrences)`);
  if (source.indexOf(mutation.from, first + mutation.from.length) >= 0) {
    throw new Error(`mutation '${mutation.name}': anchor is not unique (2+ occurrences)`);
  }
  const mutated = source.slice(0, first) + mutation.to + source.slice(first + mutation.from.length);
  if (mutated === source) throw new Error(`mutation '${mutation.name}': substitution was a no-op`);
  return mutated;
}

/* --------------------------------------------------------------------- main */

const SESSION_A = 'session-a';
const SESSION_B = 'session-b';
const CUSTOM_ID = 'abcdef01-2345-6789-abcd-ef0123456789';
const CUSTOM_TONE = `custom:${CUSTOM_ID}`;
const MISSING_TONE = 'custom:deadbeef-1234-5678-9abc-def012345678';

const close = (a, b, epsilon = 1e-9) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < epsilon;

async function main() {
  const clientSource = globalThis.__R10_CLIENT_SOURCE__ ?? readFileSync(CLIENT_PATH, 'utf8');
  const indexSource = globalThis.__R10_INDEX_SOURCE__ ?? readFileSync(INDEX_PATH, 'utf8');
  const clientBytes = Buffer.from(clientSource, 'utf8');
  const indexBytes = Buffer.from(indexSource, 'utf8');
  const mutatedRun = globalThis.__R10_CLIENT_SOURCE__ !== undefined || globalThis.__R10_INDEX_SOURCE__ !== undefined;

  console.log('dsh-approval-chime · independent probe 18 · rev-10 per-session chime');
  console.log(`lib/client.js ${clientBytes.length} B sha256 ${sha256(clientBytes)}`);
  console.log(`lib/index.js  ${indexBytes.length} B sha256 ${sha256(indexBytes)}`);
  console.log(`node ${process.version}`);

  /* ---------------------------------------------------------------- A · slot */

  startSection('A · the session-header slot this bundle registers into');
  {
    const bundle = loadClient(clientSource);
    const app = applyBundle(bundle);
    await flush();

    const injected = bundle.slots.injects.map((row) => row.name);
    check('A1.slot-injected', injected.includes(SESSIONS_SLOT), `slots.inject names = ${show(injected)}`);
    const bell = app.entryFor(SESSIONS_SLOT);
    check(
      'A2.entry-shape',
      bell !== null && eq(bell.entry, { name: SESSIONS_SLOT, id: 'approval-chime', order: 30, locale: NS }),
      bell === null ? 'no entry registered for the slot' : show(bell.entry),
    );
    const shippedOrders = [
      readOrderOf('dsh-client-ui-agent-preset', 'agent-preset'),
      readOrderOf('dsh-client-ui-schedule', 'schedule-catalog'),
      readOrderOf('dsh-client-ui-jobs', 'job-list'),
    ];
    check(
      'A3.order-free',
      bell !== null && shippedOrders.every((order) => order !== bell.entry.order) && shippedOrders.every((order) => typeof order === 'number'),
      `shipped orders read from the host packages = ${show(shippedOrders)}, ours = ${bell === null ? 'none' : bell.entry.order}`,
    );
    check(
      'A3b.order-last-of-the-cluster',
      bell !== null && shippedOrders.every((order) => bell.entry.order > order),
      show({ ours: bell?.entry.order, shipped: shippedOrders }),
    );
    check(
      'A4.diagnostics-surface',
      bundle.diagnostics.sessionSlot === SESSIONS_SLOT
        && bundle.diagnostics.sessionAction?.id === 'approval-chime'
        && bundle.diagnostics.sessionAction?.order === 30
        && bundle.diagnostics.batchGapMs === 180,
      show({ slot: bundle.diagnostics.sessionSlot, action: bundle.diagnostics.sessionAction, gap: bundle.diagnostics.batchGapMs }),
    );
    check('A5.bundle-contract', bundle.module.name === 'dsh-approval-chime' && eq(bundle.module.inject, ['slots', 'locale', 'settingsScope', 'uiSession']), show({ name: bundle.module.name, inject: bundle.module.inject }));
    app.dispose();
  }

  /* ---------------------------------------------------------------- B · bell */

  startSection('B · the bell component, rendered from the real bytes with props.sessionId');
  {
    const answeredBundle = loadClient(clientSource);
    const hostTables = new Map();
    answeredBundle.setFetch((url, init) => {
      if (init?.method !== 'POST') return json({ ok: true, revision: 0, sessions: Object.fromEntries(hostTables) });
      const parsed = JSON.parse(init.body);
      if (parsed.patch.enabled === false) hostTables.set(parsed.sessionId, { enabled: false, updatedAt: 1 });
      else if (parsed.patch.enabled === null) hostTables.delete(parsed.sessionId);
      else if (parsed.patch.enabled === true) hostTables.set(parsed.sessionId, { enabled: true, updatedAt: 1 });
      return json({ ok: true, revision: 1, sessions: Object.fromEntries(hostTables) });
    });
    const app = applyBundle(answeredBundle);
    await flush();

    const Component = app.entryFor(SESSIONS_SLOT).component;
    const audible = mount(Component, { sessionId: SESSION_A }, answeredBundle.runtime);
    const button = byClass(audible.tree, 'dacBell')[0];
    check('B1.props-session-id', button !== undefined && button !== null && button.props['data-session'] === SESSION_A, button === undefined || button === null ? 'no .dacBell button' : `data-session=${button.props['data-session']}`);
    check(
      'B1b.aria-pressed-follows-state',
      button !== undefined && button !== null && button.props['aria-pressed'] === true && button.props['data-muted'] === 'false',
      button === undefined ? 'no button' : show({ pressed: button.props['aria-pressed'], muted: button.props['data-muted'] }),
    );
    const labelOn = button === undefined || button === null ? '' : String(button.props.title ?? '');
    check(
      'B2.label-both-languages-on',
      labelOn.includes('本会话审批提示音：开') && labelOn.includes('Approval chime for this session: on') && button.props['aria-label'] === labelOn,
      `title=${labelOn}`,
    );

    const treeOn = audible.tree;
    button.props.onClick();
    await flush();
    const mutedButton = byClass(audible.rerender(), 'dacBell')[0];
    const treeOff = audible.tree;
    const labelOff = String(mutedButton.props.title ?? '');
    check(
      'B3.label-both-languages-off',
      labelOff.includes('本会话审批提示音：关') && labelOff.includes('Approval chime for this session: off') && mutedButton.props['aria-label'] === labelOff,
      `title=${labelOff}`,
    );
    check('B3b.muted-state-attributes', mutedButton.props['data-muted'] === 'true' && mutedButton.props['aria-pressed'] === false, show({ muted: mutedButton.props['data-muted'], pressed: mutedButton.props['aria-pressed'] }));

    const icons = (tree) => {
      const svg = findAll(tree, (node) => node.type === 'svg')[0];
      const paths = svg === undefined ? [] : svg.children.filter((child) => child !== null && typeof child === 'object' && child.type === 'path');
      return { pathCount: paths.length, hasSlash: paths.some((path) => path.props.className === 'dacSlash') };
    };
    const unmutedIcons = icons(treeOn);
    const mutedIcons = icons(treeOff);
    check(
      'B4.icon-two-states',
      unmutedIcons.pathCount === 2 && unmutedIcons.hasSlash === false && mutedIcons.pathCount === 3 && mutedIcons.hasSlash === true,
      `unmuted=${show(unmutedIcons)} muted=${show(mutedIcons)}`,
    );
    check('B5.no-session-id-renders-nothing', mount(Component, {}, answeredBundle.runtime).tree === null, 'props {} -> null');
    check('B6.wrapper-and-caret', byClass(audible.tree, 'dacCaret').length === 1 && byClass(audible.tree, 'dacBellWrap').length === 1, 'dacCaret + dacBellWrap present');
    check('B7.render-does-not-write', app.scope.sets.length === 0, `scope.sets=${show(app.scope.sets)}`);
    app.dispose();
  }

  /* ------------------------------------------------------- B · the popover */

  startSection('B · the caret popover (structure only — no rendering is claimed here)');
  {
    const emptyBundle = loadClient(clientSource);
    emptyBundle.setFetch(() => json({ ok: true, revision: 0, sessions: {} }));
    const app = applyBundle(emptyBundle);
    await flush();
    const Component = app.entryFor(SESSIONS_SLOT).component;
    const view = mount(Component, { sessionId: SESSION_A }, emptyBundle.runtime);
    const caret = byClass(view.tree, 'dacCaret')[0];
    caret.props.onClick();
    const withPopover = view.rerender();
    const pop = byClass(withPopover, 'dacPop')[0];
    check('B8.popover-opens', pop !== undefined && pop !== null && pop.props.role === 'dialog' && pop.props['data-session'] === SESSION_A, pop === undefined || pop === null ? 'no .dacPop' : show({ role: pop.props.role, session: pop.props['data-session'] }));
    check('B8b.position-is-fixed', pop !== undefined && pop !== null && pop.props.style?.position === 'fixed', show(pop?.props.style));
    const toneSelect = findBy(pop, (node) => node.type === 'select');
    const optionValues = toneSelect === null ? [] : toneSelect.children.map((child) => child.props.value);
    check('B8c.tone-options', toneSelect !== null && optionValues[0] === '' && optionValues.includes('chime') && optionValues.includes('bell') && optionValues.includes('beep'), show(optionValues));
    const followVolume = findBy(pop, (node) => node.type === 'input' && node.props['data-field'] === 'volume-follow');
    const volumeRange = findBy(pop, (node) => node.type === 'input' && node.props.type === 'range');
    check('B8d.volume-follow', followVolume !== null && followVolume.props.checked === true && volumeRange !== null && volumeRange.props.disabled === true && volumeRange.props.min === 0 && volumeRange.props.max === 100, show({ follow: followVolume?.props.checked, disabled: volumeRange?.props.disabled }));
    const resetButton = findBy(pop, (node) => node.type === 'button' && node.props['data-action'] === 'follow-global');
    check('B8e.reset-to-global-button', resetButton !== null && resetButton.props.disabled === true, resetButton === null ? 'missing' : show({ disabled: resetButton.props.disabled }));
    check('B8f.escape-listener-installed', (emptyBundle.documentListeners.get('keydown') ?? []).length >= 1, `keydown listeners=${(emptyBundle.documentListeners.get('keydown') ?? []).length}`);
    emptyBundle.document.dispatch('keydown', { key: 'Escape' });
    check('B8g.escape-closes', byClass(view.rerender(), 'dacPop').length === 0, 'the popover is gone after Escape');
    app.dispose();
  }

  /* ------------------------------------------------- C · click → POST payload */

  startSection('C · a click writes THIS session: the exact POST body');
  {
    const posts = [];
    const bundle = loadClient(clientSource);
    const hostTables = new Map();
    bundle.setFetch((url, init) => {
      if (init?.method !== 'POST') return json({ ok: true, revision: 0, sessions: Object.fromEntries(hostTables) });
      const parsed = JSON.parse(init.body);
      posts.push({ url, method: init.method, body: init.body, parsed });
      if (parsed.patch.enabled === false) hostTables.set(parsed.sessionId, { enabled: false, updatedAt: 1 });
      else if (parsed.patch.enabled === null) hostTables.delete(parsed.sessionId);
      else if (parsed.patch.enabled === true) hostTables.set(parsed.sessionId, { enabled: true, updatedAt: 1 });
      return json({ ok: true, revision: posts.length, sessions: Object.fromEntries(hostTables) });
    });
    const app = applyBundle(bundle);
    await flush();
    const bootReads = bundle.fetchLog.filter((row) => row.url === SESSIONS_ROUTE && (row.init?.method ?? 'GET') === 'GET');
    check('C0.exactly-one-boot-read', bootReads.length === 1, `${bootReads.length} GET ${SESSIONS_ROUTE} at mount — the read kit/rev4.mjs's makeFetch keeps out of its audio ledger`);
    const Component = app.entryFor(SESSIONS_SLOT).component;
    const view = mount(Component, { sessionId: SESSION_A }, bundle.runtime);
    byClass(view.tree, 'dacBell')[0].props.onClick();
    await flush();
    const first = posts[0] ?? null;
    check('C1.mute-body', first !== null && first.parsed.sessionId === SESSION_A && first.parsed.patch.enabled === false && eq(Object.keys(first.parsed.patch), ['enabled']), show(first?.parsed));
    check('C1b.mute-is-a-json-post', posts.length === 1 && first.url === SESSIONS_ROUTE && first.method === 'POST' && posts.length === 1, show(posts.map((row) => [row.url, row.method])));
    byClass(view.rerender(), 'dacBell')[0].props.onClick();
    await flush();
    const second = posts[1] ?? null;
    check('C2.unmute-clears-override', second !== null && second.parsed.sessionId === SESSION_A && second.parsed.patch.enabled === null && eq(Object.keys(second.parsed.patch), ['enabled']), show(second?.parsed));
    check('C2b.never-writes-true', posts.every((row) => row.parsed.patch.enabled !== true), show(posts.map((row) => row.parsed.patch)));
    check('C2c.local-table-back-to-follow', bundle.diagnostics.sessionSettings(SESSION_A).overridden.enabled === false, show(bundle.diagnostics.sessions().sessions));
    app.dispose();
  }

  /* ------------------------------- C · the global switch is never touched */

  startSection('C · "mute this session" never becomes "turn the global switch off"');
  {
    const bundle = loadClient(clientSource);
    const hostTables = new Map();
    bundle.setFetch((url, init) => {
      if (init?.method !== 'POST') return json({ ok: true, revision: 0, sessions: Object.fromEntries(hostTables) });
      const parsed = JSON.parse(init.body);
      if (parsed.patch.enabled === false) hostTables.set(parsed.sessionId, { enabled: false, updatedAt: 1 });
      else if (parsed.patch.enabled === null) hostTables.delete(parsed.sessionId);
      else if (parsed.patch.enabled === true) hostTables.set(parsed.sessionId, { enabled: true, updatedAt: 1 });
      return json({ ok: true, revision: 1, sessions: Object.fromEntries(hostTables) });
    });
    const app = applyBundle(bundle, { scope: { enabled: false, volume: 70, tone: 'chime', custom: [] } });
    await flush();
    const Component = app.entryFor(SESSIONS_SLOT).component;
    const view = mount(Component, { sessionId: SESSION_A }, bundle.runtime);
    byClass(view.tree, 'dacBell')[0].props.onClick();
    await flush();
    byClass(view.rerender(), 'dacBell')[0].props.onClick();
    await flush();
    check('C3.global-switch-untouched', app.scope.sets.length === 0 && app.scope.getValue().enabled === false, `scope.sets=${show(app.scope.sets)}`);
    bundle.audio.reset();
    app.pending.emit(new Map([[SESSION_A, { kind: 'approval', key: 'k1', sessionId: SESSION_A }]]));
    bundle.clock.drain();
    await flush();
    check('C4.unmute-after-global-off-stays-silent', bundle.audio.chimes().length === 0, `chimes=${show(bundle.audio.chimes())}`);
    check('C4b.still-follows-global', bundle.diagnostics.sessionSettings(SESSION_A).enabled === false, show(bundle.diagnostics.sessionSettings(SESSION_A)));

    const other = mount(Component, { sessionId: SESSION_B }, bundle.runtime);
    byClass(other.tree, 'dacBell')[0].props.onClick();
    await flush();
    const settingsA = bundle.diagnostics.sessionSettings(SESSION_A);
    const settingsB = bundle.diagnostics.sessionSettings(SESSION_B);
    check(
      'C5.a-session-that-does-not-act-is-untouched',
      settingsB.overridden.enabled === false && settingsA.overridden.enabled === false && eq(bundle.diagnostics.sessions().sessions, {}),
      show({ a: settingsA.overridden, b: settingsB.overridden, table: bundle.diagnostics.sessions().sessions }),
    );
    app.dispose();
  }

  {
    // The discriminating case: the GLOBAL switch is ON, so the bell is audible and a
    // click must mute exactly one session.
    const bundle = loadClient(clientSource);
    const hostTables = new Map();
    bundle.setFetch((url, init) => {
      if (init?.method !== 'POST') return json({ ok: true, revision: 0, sessions: Object.fromEntries(hostTables) });
      const parsed = JSON.parse(init.body);
      if (parsed.patch.enabled === false) hostTables.set(parsed.sessionId, { enabled: false, updatedAt: 1 });
      else if (parsed.patch.enabled === null) hostTables.delete(parsed.sessionId);
      else if (parsed.patch.enabled === true) hostTables.set(parsed.sessionId, { enabled: true, updatedAt: 1 });
      return json({ ok: true, revision: 1, sessions: Object.fromEntries(hostTables) });
    });
    const app = applyBundle(bundle, { scope: { enabled: true, volume: 70, tone: 'chime', custom: [] } });
    await flush();
    const Component = app.entryFor(SESSIONS_SLOT).component;
    const view = mount(Component, { sessionId: SESSION_A }, bundle.runtime);
    byClass(view.tree, 'dacBell')[0].props.onClick();
    await flush();
    const settingsA = bundle.diagnostics.sessionSettings(SESSION_A);
    const settingsB = bundle.diagnostics.sessionSettings(SESSION_B);
    check(
      'C6.mute-one-session-only',
      settingsA.overridden.enabled === true && settingsA.enabled === false
        && settingsB.overridden.enabled === false && settingsB.enabled === true,
      show({ a: { enabled: settingsA.enabled, o: settingsA.overridden }, b: { enabled: settingsB.enabled, o: settingsB.overridden }, table: bundle.diagnostics.sessions().sessions }),
    );
    bundle.audio.reset();
    app.pending.emit(new Map([
      [SESSION_A, { kind: 'approval', key: 'c6a', sessionId: SESSION_A }],
      [SESSION_B, { kind: 'approval', key: 'c6b', sessionId: SESSION_B }],
    ]));
    bundle.clock.drain();
    await flush();
    const chimes = bundle.audio.chimes();
    check('C6b.only-the-other-session-rings', chimes.length === 1, `chimes=${show(chimes)}`);
    check('C6c.suppressedSession-one', bundle.diagnostics.stats().suppressedSession === 1, show(bundle.diagnostics.stats().suppressedSession));
    app.dispose();
  }

  /* --------------------------------- D · the effective truth table (audio graph) */

  startSection('D · effective value = override ?? global, asserted on the AUDIO GRAPH');
  const tempRoot = join(tmpdir(), `r10-probe18-${process.pid}-${randomUUID()}`);
  mkdirSync(tempRoot, { recursive: true });
  const realHome = join(homedir(), '.dsh');
  const savedHome = process.env.DSH_HOME;
  process.env.DSH_HOME = tempRoot;
  const host = mutatedRun && globalThis.__R10_INDEX_SOURCE__ !== undefined
    ? await import(`data:text/javascript;base64,${Buffer.from(indexSource, 'utf8').toString('base64')}`)
    : await import(pathToFileURL(INDEX_PATH).href);
  const web = makeWebServer();
  host.registerSessionRoutes({
    get: (key) => (key === 'webServer' ? web : undefined),
    effect: (fn) => fn(),
    logger: { info() {}, warn() {}, error() {} },
  });
  await new Promise((resolve) => web.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${web.server.address().port}`;
  const sessionsFile = host.sessionsFile();
  check('D0.path-under-DSH_HOME', sessionsFile === join(tempRoot, 'approval-chime', 'sessions.json') && !sessionsFile.startsWith(realHome), sessionsFile);  check(
    'D0b.host-exports',
    host.MAX_SESSIONS === 200 && host.SESSION_ID_LIMIT === 200 && host.SESSION_BODY_LIMIT === 64 * 1024 && host.SESSIONS_ROUTE === SESSIONS_ROUTE,
    show({ cap: host.MAX_SESSIONS, idLimit: host.SESSION_ID_LIMIT, body: host.SESSION_BODY_LIMIT, route: host.SESSIONS_ROUTE }),
  );

  const truthCases = [
    { id: 'D1', globals: { enabled: true, volume: 70, tone: 'chime', custom: [] }, record: null, expect: { audible: true, gain: 0.42, wave: 'sine', freq: 880 } },
    { id: 'D2', globals: { enabled: false, volume: 70, tone: 'chime', custom: [] }, record: null, expect: { audible: false, counter: 'suppressedDisabled' } },
    { id: 'D3', globals: { enabled: true, volume: 70, tone: 'chime', custom: [] }, record: { enabled: false }, expect: { audible: false, counter: 'suppressedSession' } },
    { id: 'D4', globals: { enabled: false, volume: 70, tone: 'chime', custom: [] }, record: { enabled: false }, expect: { audible: false, counter: 'suppressedSession' } },
    { id: 'D5', globals: { enabled: true, volume: 70, tone: 'chime', custom: [] }, record: { volume: 30 }, expect: { audible: true, gain: 0.18, wave: 'sine', freq: 880 } },
    { id: 'D6', globals: { enabled: true, volume: 70, tone: 'chime', custom: [] }, record: { tone: 'beep' }, expect: { audible: true, gain: 0.42, wave: 'square', freq: 440 } },
    { id: 'D7', globals: { enabled: true, volume: 70, tone: 'chime', custom: [] }, record: { volume: 30, tone: 'bell' }, expect: { audible: true, gain: 0.18, wave: 'triangle', freq: 659.25 } },
    { id: 'D8', globals: { enabled: false, volume: 70, tone: 'chime', custom: [] }, record: { volume: 30 }, expect: { audible: false, counter: 'suppressedDisabled' } },
    { id: 'D9', globals: { enabled: true, volume: 70, tone: 'chime', custom: [{ id: CUSTOM_ID, name: 'own.mp3' }] }, record: { tone: CUSTOM_TONE }, expect: { audible: true, gain: 0.42, sample: CUSTOM_ID } },
    { id: 'D10', globals: { enabled: true, volume: 100, tone: 'bell', custom: [] }, record: { volume: 0 }, expect: { audible: false, counter: 'suppressedSilent' } },
    { id: 'D11', globals: { enabled: true, volume: 70, tone: 'chime', custom: [] }, record: { tone: MISSING_TONE }, expect: { audible: true, gain: 0.42, wave: 'sine', freq: 880 } },
    { id: 'D12', globals: { enabled: true, volume: 40, tone: 'bell', custom: [] }, record: { enabled: true }, expect: { audible: true, gain: 0.24, wave: 'triangle', freq: 659.25 } },
  ];

  const truthBundle = loadClient(clientSource);
  truthBundle.setFetch((url, init) => {
    if (url.startsWith(AUDIO_ROUTE + '/')) {
      const id = url.slice(AUDIO_ROUTE.length + 1);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        arrayBuffer: () => Promise.resolve({ marker: id }),
      });
    }
    return fetch(base + url, init);
  });
  const truthApp = applyBundle(truthBundle);
  await flush();

  let caseIndex = 0;
  for (const testCase of truthCases) {
    const sessionId = `truth-${caseIndex}`;
    caseIndex += 1;
    if (testCase.record !== null) {
      await request(base, SESSIONS_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, patch: testCase.record }),
      });
    }
    truthApp.scope.setValue(testCase.globals);
    await truthBundle.diagnostics.refreshSessions();
    const view = truthBundle.diagnostics.sessionSettings(sessionId);
    truthBundle.audio.reset();
    truthApp.pending.emit(new Map([[sessionId, { kind: 'approval', key: `${testCase.id}-key`, sessionId }]]));
    truthBundle.clock.drain();
    await flush();
    const chimes = truthBundle.audio.chimes();
    const stats = truthBundle.diagnostics.stats();
    if (testCase.expect.audible === true) {
      const first = chimes[0];
      const ok = chimes.length === 1
        && first !== undefined
        && close(first.gain, testCase.expect.gain)
        && (testCase.expect.wave === undefined || first.wave === testCase.expect.wave)
        && (testCase.expect.freq === undefined || close(first.freqs[0], testCase.expect.freq))
        && (testCase.expect.sample === undefined || first.sample === testCase.expect.sample);
      check(testCase.id, ok, `${testCase.id} globals=${show(testCase.globals).slice(0, 90)} record=${show(testCase.record)} -> chime=${show(first)} view=${show({ e: view.enabled, v: view.volume, t: view.tone })}`);
    } else {
      const ok = chimes.length === 0 && stats[testCase.expect.counter] >= 1;
      check(testCase.id, ok, `${testCase.id} globals=${show(testCase.globals).slice(0, 60)} record=${show(testCase.record)} -> chimes=${show(chimes)} counters=${show({ session: stats.suppressedSession, disabled: stats.suppressedDisabled, silent: stats.suppressedSilent })}`);
    }
  }

  /* ------------------------------------------------------ E · batch / no merge */

  startSection('E · one batch of N sessions makes N sounds, 180 ms apart, mute respected');
  {
    const bundle = loadClient(clientSource);
    bundle.setFetch((url, init) => (init?.method === 'POST' ? json({ ok: true, revision: 1, sessions: {} }) : fetch(base + url, init)));
    const app = applyBundle(bundle);
    await flush();

    const three = new Map([
      ['batch-1', { kind: 'approval', key: 'bk1', sessionId: 'batch-1' }],
      ['batch-2', { kind: 'approval', key: 'bk2', sessionId: 'batch-2' }],
      ['batch-3', { kind: 'approval', key: 'bk3', sessionId: 'batch-3' }],
    ]);
    bundle.audio.reset();
    bundle.clock.reset();
    app.pending.emit(three);
    const scheduled = bundle.clock.pending();
    bundle.clock.drain();
    await flush();
    const chimes = bundle.audio.chimes();
    check('E1.three-sessions-three-chimes', chimes.length === 3, `chimes=${show(chimes)}`);
    check('E2.gaps-are-180', eq(scheduled, [180, 360]) && eq(chimes.map((row) => row.at), [0, 180, 360]), `pending before drain=${show(scheduled)} chime times=${show(chimes.map((row) => row.at))}`);
    check('E3.snapshot-order', eq(chimes.map((row) => row.freqs[0]), [880, 880, 880]) && chimes.every((row) => row.wave === 'sine'), show(chimes.map((row) => [row.wave, row.freqs])));
    const afterBatch = bundle.diagnostics.stats();
    check('E4.batch-counters', afterBatch.lastBatchSize === 3 && afterBatch.lastBatchPlayed === 3 && afterBatch.triggers === 3, show({ size: afterBatch.lastBatchSize, played: afterBatch.lastBatchPlayed, triggers: afterBatch.triggers }));

    bundle.audio.reset();
    bundle.clock.reset();
    app.pending.emit(three);
    bundle.clock.drain();
    await flush();
    check('E5.repeat-snapshot-no-double-count', bundle.audio.chimes().length === 0 && bundle.diagnostics.stats().approvalsSeen === 3, show({ chimes: bundle.audio.chimes().length, seen: bundle.diagnostics.stats().approvalsSeen }));

    bundle.audio.reset();
    bundle.clock.reset();
    app.pending.emit(new Map([['batch-1', { kind: 'approval', key: 'bk1b', sessionId: 'batch-1' }]]));
    bundle.clock.drain();
    await flush();
    check('E6.new-key-rings-once', bundle.audio.chimes().length === 1, `chimes=${bundle.audio.chimes().length}`);

    await request(base, SESSIONS_ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'batch-5', patch: { enabled: false } }) });
    await bundle.diagnostics.refreshSessions();
    const beforeMute = bundle.diagnostics.stats();
    bundle.audio.reset();
    bundle.clock.reset();
    app.pending.emit(new Map([
      ['batch-4', { kind: 'approval', key: 'bk4', sessionId: 'batch-4' }],
      ['batch-5', { kind: 'approval', key: 'bk5', sessionId: 'batch-5' }],
      ['batch-6', { kind: 'approval', key: 'bk6', sessionId: 'batch-6' }],
    ]));
    const scheduled2 = bundle.clock.pending();
    bundle.clock.drain();
    await flush();
    const chimes2 = bundle.audio.chimes();
    const afterMute = bundle.diagnostics.stats();
    check('E7.muted-session-does-not-sound', chimes2.length === 2, `chimes=${show(chimes2.map((row) => row.at))}`);
    check('E8.gap-survives-mute', eq(scheduled2, [180]) && eq(chimes2.map((row) => row.at), [0, 180]), show({ scheduled: scheduled2, at: chimes2.map((row) => row.at) }));
    check('E9.suppressedSession-counted', afterMute.suppressedSession === beforeMute.suppressedSession + 1, `before=${beforeMute.suppressedSession} after=${afterMute.suppressedSession}`);
    check('E9b.batch-counters-after-mute', afterMute.lastBatchSize === 3 && afterMute.lastBatchPlayed === 2, show({ size: afterMute.lastBatchSize, played: afterMute.lastBatchPlayed }));

    await request(base, SESSIONS_ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'batch-7', patch: { enabled: false } }) });
    await bundle.diagnostics.refreshSessions();
    const beforeGlobal = bundle.diagnostics.stats();
    app.scope.setValue({ enabled: false, volume: 70, tone: 'chime', custom: [] });
    bundle.audio.reset();
    bundle.clock.reset();
    app.pending.emit(new Map([
      ['batch-7', { kind: 'approval', key: 'bk7', sessionId: 'batch-7' }],
      ['batch-8', { kind: 'approval', key: 'bk8', sessionId: 'batch-8' }],
    ]));
    bundle.clock.drain();
    await flush();
    const afterGlobal = bundle.diagnostics.stats();
    check(
      'E10.global-off-is-not-a-session-mute',
      afterGlobal.suppressedSession === beforeGlobal.suppressedSession + 1 && afterGlobal.suppressedDisabled === beforeGlobal.suppressedDisabled + 1,
      show({ session: [beforeGlobal.suppressedSession, afterGlobal.suppressedSession], disabled: [beforeGlobal.suppressedDisabled, afterGlobal.suppressedDisabled] }),
    );
    app.dispose();
  }

  /* -------------------------------------------------- F · the store over HTTP */

  startSection('F · the store really is a file under $DSH_HOME, over real HTTP');
  rmSync(sessionsFile, { force: true });
  const emptyGet = await request(base, SESSIONS_ROUTE);
  check('F1.get-empty', emptyGet.status === 200 && emptyGet.body.ok === true && eq(emptyGet.body.sessions, {}) && typeof emptyGet.body.revision === 'number', show(emptyGet.body));

  const created = await request(base, SESSIONS_ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: SESSION_A, patch: { enabled: false } }) });
  check('F2.post-answers-table', created.status === 200 && created.body.sessions?.[SESSION_A]?.enabled === false, show(created.body.sessions));
  const rawAfterFirst = readFileSync(sessionsFile, 'utf8');
  const parsedAfterFirst = JSON.parse(rawAfterFirst);
  check('F2b.file-on-disk', parsedAfterFirst.version === 1 && parsedAfterFirst.sessions[SESSION_A].enabled === false && typeof parsedAfterFirst.sessions[SESSION_A].updatedAt === 'number', rawAfterFirst.replace(/\s+/g, ' ').slice(0, 160));
  const roundTrip = await request(base, SESSIONS_ROUTE);
  check('F2c.reads-back', roundTrip.body.sessions?.[SESSION_A]?.enabled === false, show(roundTrip.body.sessions));
  check('F2d.not-the-settings-document', !existsSync(join(tempRoot, 'settings.yaml')) && !existsSync(join(tempRoot, 'approval-chime', 'settings.yaml')), `files under the temp home: ${show(readdirSync(join(tempRoot, 'approval-chime')))}`);

  delete process.env.DSH_HOME;
  const defaultFile = host.sessionsFile();
  process.env.DSH_HOME = '   ';
  const blankFile = host.sessionsFile();
  process.env.DSH_HOME = tempRoot;
  check(
    'F4.home-rule',
    defaultFile === join(homedir(), '.dsh', 'approval-chime', 'sessions.json')
      && blankFile === join(homedir(), '.dsh', 'approval-chime', 'sessions.json')
      && host.sessionsFile() === join(tempRoot, 'approval-chime', 'sessions.json'),
    show({ unset: defaultFile, blank: blankFile, override: host.sessionsFile() }),
  );
  check(
    'F4b.home-rule-matches-platform',
    readFileSync(HOME_PATHS_PATH, 'utf8').includes('fromEnv !== void 0 && fromEnv.trim().length > 0 ? fromEnv : defaultDshHome()'),
    'dsh-home-paths/lib/index.js:73-76 applies the same "a blank override counts as unset" rule',
  );

  const badPatches = [
    { id: 'F5a.missing-sessionId', body: { patch: { enabled: false } } },
    { id: 'F5b.blank-sessionId', body: { sessionId: '   ', patch: { enabled: false } } },
    { id: 'F5c.long-sessionId', body: { sessionId: 'x'.repeat(201), patch: { enabled: false } } },
    { id: 'F5d.numeric-sessionId', body: { sessionId: 7, patch: { enabled: false } } },
    { id: 'F5e.volume-float', body: { sessionId: SESSION_B, patch: { volume: 42.5 } } },
    { id: 'F5f.volume-out-of-range', body: { sessionId: SESSION_B, patch: { volume: 101 } } },
    { id: 'F5g.volume-string', body: { sessionId: SESSION_B, patch: { volume: '50' } } },
    { id: 'F5h.tone-unknown', body: { sessionId: SESSION_B, patch: { tone: 'noise' } } },
    { id: 'F5i.tone-uppercase-uuid', body: { sessionId: SESSION_B, patch: { tone: `custom:${CUSTOM_ID.toUpperCase()}` } } },
    { id: 'F5j.enabled-string', body: { sessionId: SESSION_B, patch: { enabled: 'false' } } },
    { id: 'F5k.unknown-field', body: { sessionId: SESSION_B, patch: { color: 'red' } } },
    { id: 'F5l.patch-missing', body: { sessionId: SESSION_B } },
    { id: 'F5m.patch-array', body: { sessionId: SESSION_B, patch: [] } },
    { id: 'F5n.body-array', body: [] },
    { id: 'F5o.body-string', body: 'nope' },
    { id: 'F5p.empty-body', rawBody: '' },
    { id: 'F5q.bad-json', rawBody: '{oops' },
  ];
  for (const bad of badPatches) {
    const beforeBytes = readFileSync(sessionsFile);
    const answer = await request(base, SESSIONS_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: bad.rawBody !== undefined ? bad.rawBody : JSON.stringify(bad.body),
    });
    const afterBytes = readFileSync(sessionsFile);
    check(bad.id, answer.status === 400 && answer.body.ok === false && sha256(beforeBytes) === sha256(afterBytes), `status=${answer.status} error=${show(answer.body.error)} bytes-unchanged=${sha256(beforeBytes) === sha256(afterBytes)}`);
  }

  const notFound = await request(base, `${SESSIONS_ROUTE}/extra`);
  check('F6a.unknown-path-404', notFound.status === 404 && notFound.body.ok === false, show(notFound.body));
  const wrongMethod = await request(base, SESSIONS_ROUTE, { method: 'PUT' });
  check('F6b.method-405', wrongMethod.status === 405 && wrongMethod.body.ok === false, show(wrongMethod.body));
  const head = await request(base, SESSIONS_ROUTE, { method: 'HEAD' });
  check('F6c.head-200', head.status === 200, `status=${head.status}`);

  startSection('F · the 200-record cap evicts the OLDEST, never the newest');
  const seeded = {};
  for (let index = 0; index < 200; index += 1) {
    const id = `seed-${String(199 - index).padStart(3, '0')}`;
    seeded[id] = { enabled: false, updatedAt: 1_000 + (199 - index) };
  }
  writeFileSync(sessionsFile, `${JSON.stringify({ version: 1, sessions: seeded }, null, 2)}\n`);
  const newestSeed = 'seed-199';
  const oldestSeed = 'seed-000';
  const added = await request(base, SESSIONS_ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'fresh-201', patch: { volume: 55 } }) });
  const tableAfterCap = added.body.sessions ?? {};
  const idsAfterCap = Object.keys(tableAfterCap);
  check(
    'F7.cap-200-and-newest-survives',
    added.status === 200 && idsAfterCap.length === 200
      && tableAfterCap['fresh-201'] !== undefined
      && tableAfterCap[newestSeed] !== undefined
      && tableAfterCap[oldestSeed] === undefined,
    `count=${idsAfterCap.length} fresh-201=${tableAfterCap['fresh-201'] !== undefined} ${newestSeed}=${tableAfterCap[newestSeed] !== undefined} ${oldestSeed}=${tableAfterCap[oldestSeed] !== undefined}`,
  );

  const oddIds = ['A-upper', 'a-lower', 'with space', 'unicode-会话-1', '__proto__', 'constructor', 'x'.repeat(200)];
  for (const id of oddIds) {
    await request(base, SESSIONS_ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: id, patch: { tone: 'bell' } }) });
  }
  const oddTable = (await request(base, SESSIONS_ROUTE)).body.sessions;
  check(
    'F8.a.odd-ids-survive',
    oddIds.every((id) => oddTable[id] !== undefined && oddTable[id].tone === 'bell') && Object.keys(oddTable).length === 200,
    `present=${show(oddIds.map((id) => oddTable[id] !== undefined))} count=${Object.keys(oddTable).length}`,
  );
  check(
    'F8.b.no-prototype-pollution',
    ({}).enabled === undefined && ({}).tone === undefined && Object.prototype.enabled === undefined,
    'Object.prototype untouched by the __proto__ / constructor rows',
  );
  check('F8.c.newest-still-there', oddTable['x'.repeat(200)] !== undefined && oddTable['fresh-201'] !== undefined, `x200=${oddTable['x'.repeat(200)] !== undefined} fresh-201=${oddTable['fresh-201'] !== undefined}`);

  const pureTable = Object.create(null);
  for (let index = 0; index < 201; index += 1) {
    pureTable[`p-${String(index).padStart(3, '0')}`] = { enabled: false, updatedAt: 5_000 - index };
  }
  host.evictSessions(pureTable);
  check(
    'F8.d.evict-is-by-updatedAt',
    Object.keys(pureTable).length === 200 && pureTable['p-000'] !== undefined && pureTable['p-200'] === undefined,
    `201 rows whose KEY order ascends while updatedAt DESCENDS (p-000 newest, p-200 oldest): count=${Object.keys(pureTable).length} newest-present=${pureTable['p-000'] !== undefined} oldest-present=${pureTable['p-200'] !== undefined}`,
  );

  startSection('F · atomic write: same-directory temp + rename, stray temp ignored');
  check(
    'F9.a.temp-in-same-directory',
    indexSource.includes('const temporary = join(directory, `.sessions.${process.pid}.${randomUUID()}.tmp`);') && indexSource.includes('await rename(temporary, target);'),
    'lib/index.js:888-892 (the temp file sits beside the target, then rename)',
  );
  const strayName = '.sessions.99999999-0000-0000-0000-000000000000.tmp';
  writeFileSync(join(tempRoot, 'approval-chime', strayName), '{ this is not the store ');
  const withStray = await request(base, SESSIONS_ROUTE);
  check('F9.b.stray-temp-ignored', withStray.status === 200 && Object.keys(withStray.body.sessions ?? {}).length === 200, `records read while a garbage .tmp sits in the directory = ${Object.keys(withStray.body.sessions ?? {}).length}`);
  await request(base, SESSIONS_ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: SESSION_B, patch: { enabled: false } }) });
  const leftovers = readdirSync(join(tempRoot, 'approval-chime')).filter((name) => name.endsWith('.tmp'));
  check('F9.c.no-temp-left-behind', eq(leftovers, [strayName]), `tmp files after a write = ${show(leftovers)} (only the one the probe planted)`);
  const parsedFinal = JSON.parse(readFileSync(sessionsFile, 'utf8'));
  check('F9.d.payload-is-whole-json', parsedFinal.version === 1 && parsedFinal.sessions[SESSION_B]?.enabled === false && Object.keys(parsedFinal.sessions).length === 200, `${Object.keys(parsedFinal.sessions).length} records, version=${parsedFinal.version}`);

  startSection('F · a missing or corrupt store degrades to an empty table and never throws');
  const corruptions = [
    { id: 'F10.a.missing-file', prepare: () => unlinkSync(sessionsFile) },
    { id: 'F10.b.not-json', prepare: () => writeFileSync(sessionsFile, 'not json at all') },
    { id: 'F10.c.json-array', prepare: () => writeFileSync(sessionsFile, '[]') },
    { id: 'F10.d.json-null', prepare: () => writeFileSync(sessionsFile, 'null') },
    { id: 'F10.e.no-sessions-key', prepare: () => writeFileSync(sessionsFile, '{"version":1}') },
    { id: 'F10.f.sessions-is-array', prepare: () => writeFileSync(sessionsFile, '{"sessions":[]}') },
    { id: 'F10.g.record-not-object', prepare: () => writeFileSync(sessionsFile, '{"sessions":{"a":"nope"}}') },
    { id: 'F10.h.bad-fields-dropped', prepare: () => writeFileSync(sessionsFile, '{"sessions":{"a":{"volume":"loud"},"b":{"volume":42.5},"c":{"enabled":false}}}') },
  ];
  for (const corruption of corruptions) {
    corruption.prepare();
    const answer = await request(base, SESSIONS_ROUTE);
    const expectedEmpty = corruption.id !== 'F10.h.bad-fields-dropped';
    const ok = answer.status === 200
      && answer.body.ok === true
      && (expectedEmpty
        ? eq(answer.body.sessions, {})
        : (answer.body.sessions?.a === undefined && answer.body.sessions?.b === undefined && answer.body.sessions?.c?.enabled === false));
    check(corruption.id, ok, `status=${answer.status} sessions=${show(answer.body.sessions)}`);
  }
  writeFileSync(sessionsFile, '{{{');
  const recovered = await request(base, SESSIONS_ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'after-corrupt', patch: { enabled: false } }) });
  check('F10.i.recovers-after-corruption', recovered.status === 200 && eq(Object.keys(recovered.body.sessions), ['after-corrupt']), show(recovered.body.sessions));

  startSection('F · a failed write answers 500 and leaves the target untouched');
  {
    const blockedHome = join(tmpdir(), `r10-probe18-blocked-${process.pid}-${randomUUID()}`);
    mkdirSync(blockedHome, { recursive: true });
    const blockedDir = join(blockedHome, 'approval-chime');
    writeFileSync(blockedDir, 'this path is a FILE, so the store cannot be created');
    const beforeBlocked = readFileSync(blockedDir, 'utf8');
    process.env.DSH_HOME = blockedHome;
    const answer = await request(base, SESSIONS_ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'never', patch: { enabled: false } }) });
    const afterBlocked = readFileSync(blockedDir, 'utf8');
    process.env.DSH_HOME = tempRoot;
    check('F11.write-failure-500', answer.status === 500 && answer.body.ok === false, show(answer.body));
    check('F11b.target-untouched', beforeBlocked === afterBlocked, 'the path the store could not occupy is byte-identical');
    rmSync(blockedHome, { recursive: true, force: true });
  }

  startSection('F · no web server degrades; the route table refuses a duplicate');
  {
    const warnings = [];
    const inertCtx = { get: () => undefined, effect: (fn) => fn(), logger: { info() {}, warn: (line) => warnings.push(line), error() {} } };
    let threw = null;
    try {
      host.registerSessionRoutes(inertCtx);
    } catch (error) {
      threw = error;
    }
    check('F12.no-webServer-does-not-throw', threw === null && warnings.some((line) => /web server unavailable/i.test(line)), `warnings=${show(warnings)}`);
    let applyThrew = null;
    try {
      host.apply({ logger: { info() {}, warn() {}, error() {} } });
    } catch (error) {
      applyThrew = error;
    }
    check('F12b.apply-without-services-does-not-throw', applyThrew === null, String(applyThrew));
    let duplicateThrew = false;
    try {
      web.register({ kind: 'prefix', path: SESSIONS_ROUTE, handler: () => {} });
    } catch {
      duplicateThrew = true;
    }
    check('F13.duplicate-kind-path-rejected', duplicateThrew === true, 'the stub mirrors dsh-host-webserver/lib/index.js:176-183');
    check('F13b.route-registered-once', eq(web.order, [`prefix ${SESSIONS_ROUTE}`]), show(web.order));
    check('F13c.webserver-contract-read-first-hand', readFileSync(WEBSERVER_PATH, 'utf8').includes('throw new Error(`webserver: duplicate ${route.kind} route'), 'the profile server throws on a duplicate (kind, path)');
  }

  /* ------------------------------------------- I · client ⇄ host, real HTTP */

  startSection('I · client talks to the REAL host over REAL HTTP (double-click race)');
  {
    rmSync(sessionsFile, { force: true });
    // `realDate: true` on purpose. The local table's eviction orders records by
    // `updatedAt` (lib/client.js:929-942) and the local write stamps `Date.now()`
    // (lib/client.js:1136). A VIRTUAL clock would stamp 1.73e12 while the host
    // stamps ~1.79e12, so every freshly-written record would look like the OLDEST
    // and the client's own 200-record cap would drop the record it just wrote —
    // a probe artefact, not plugin behaviour.
    const bundle = loadClient(clientSource, { realDate: true });
    const raceRounds = Number((process.argv.find((value) => value.startsWith('--race-rounds=')) ?? '--race-rounds=30').slice('--race-rounds='.length));
    const sideChannel = process.argv.includes('--race-sidechannel');
    const instrumented = process.argv.includes('--race-instrument');
    /** Answers in the order the side channel resolved them (revision order = write order). */
    const consumed = [];
    const sent = [];
    bundle.setFetch(instrumented
      ? async (url, init) => {
        if (init?.method === 'POST') sent.push(JSON.parse(init.body));
        const response = await fetch(base + url, init);
        const text = await response.text();
        return {
          ok: response.ok,
          status: response.status,
          json: () => {
            consumed.push({ url, status: response.status, body: JSON.parse(text) });
            return Promise.resolve(JSON.parse(text));
          },
        };
      }
      : sideChannel
        ? async (url, init) => {
          if (init?.method === 'POST') sent.push(JSON.parse(init.body));
          const response = await fetch(base + url, init);
          // An independent consumer of a CLONE, so the real Response the client sees
          // is untouched: this records which answer resolved first and its revision.
          response.clone().json().then(
            (body) => consumed.push({ url, revision: body.revision, sessions: body.sessions }),
            () => {},
          );
          return response;
        }
        : (url, init) => {
          if (init?.method === 'POST') sent.push(JSON.parse(init.body));
          return fetch(base + url, init);
        });
    const app = applyBundle(bundle);
    await flush();
    await bundle.diagnostics.refreshSessions();

    const observed = [];
    for (let round = 0; round < raceRounds; round += 1) {
      const id = `race-${round}`;
      consumed.length = 0;
      sent.length = 0;
      const first = bundle.diagnostics.toggleSession(id);
      const second = bundle.diagnostics.toggleSession(id);
      await Promise.all([first, second]);
      await flush();
      const clientView = bundle.diagnostics.sessionSettings(id);
      const localTable = bundle.diagnostics.sessions().sessions;
      const fileTable = JSON.parse(readFileSync(sessionsFile, 'utf8')).sessions;
      const fileRecord = fileTable[id];
      const fileEnabled = fileRecord !== undefined && typeof fileRecord.enabled === 'boolean' ? fileRecord.enabled : bundle.diagnostics.settings().enabled;
      observed.push({
        round,
        client: clientView.enabled,
        file: fileEnabled,
        agreement: clientView.enabled === fileEnabled,
        fileRecord: fileRecord ?? null,
        localRecord: localTable[id] ?? null,
        localSize: Object.keys(localTable).length,
        fileSize: Object.keys(fileTable).length,
        patchesSent: sent.map((entry) => show(entry.patch)),
        revisionsInResolutionOrder: consumed.map((entry) => entry.revision ?? null),
        answerHasId: consumed.map((entry) => (entry.sessions !== undefined && entry.sessions !== null ? entry.sessions[id] !== undefined : null)),
      });
    }

    const disagreements = observed.filter((row) => row.agreement !== true);
    const legitimate = observed.every((row) => typeof row.client === 'boolean'
      && typeof row.file === 'boolean'
      && (row.fileRecord === null || typeof row.fileRecord.enabled === 'boolean'));
    check('I1.both-states-legitimate', legitimate, `${observed.length} rounds: the store only ever held {enabled:true|false} or no record, and the bell only ever resolved to a boolean`);
    const storeStuckMuted = observed.filter((row) => row.fileRecord !== null).length;
    note(`  I1 measurement (${instrumented ? 'instrumented wrapper' : sideChannel ? 'clone side channel' : 'raw passthrough fetch'}, ${raceRounds} rounds): `
      + `client-vs-store disagreements = ${disagreements.length}/${observed.length}; rounds where the store ended MUTED = ${storeStuckMuted}/${observed.length}`);
    if (disagreements.length > 0) {
      note(`  FINDING (measured, reproducible): the bell's final state disagreed with the store in ${disagreements.length} round(s): ${show(disagreements.slice(0, 4))}`);
      note('  The diverging rows carry the CORRECT patch pair ({enabled:false} then {enabled:null}) and no record was');
      note('  capped away (see localSize/fileSize), so this is the answer-ordering window, not the 200-record cap.');
      note('  Cause: lib/client.js:1153-1178 applies EVERY answer to the local table unconditionally, and it is the only');
      note('  writer of that table once the write is in flight; lib/client.js:1163 records `answer.revision` but nothing');
      note('  ever compares it, and nothing re-reads the store after a write settles. Two concurrent POSTs are two');
      note('  sockets, so the table ends as whichever answer\'s body the client finishes consuming last — which is not');
      note('  guaranteed to be the request whose rename landed last. The stale state then persists for the life of the');
      note('  page (the only other refreshSessions() call is the mount-time one at lib/client.js:2739) and drives both');
      note('  the bell and that session\'s chime decision (lib/client.js:983-1004).');
      note('  A single click, and any click that waits for the previous answer, always converges.');
    }
    check(
      'I1b.one-POST-per-click',
      observed.every((row) => row.patchesSent.length <= 2) && observed.some((row) => eq(row.patchesSent, ['{"enabled":false}', '{"enabled":null}'])),
      `every round leaves at most one POST per click, and the two-click pair is (mute, clear): ${show(observed.slice(0, 2).map((row) => row.patchesSent))}`,
    );
    app.dispose();
  }

  startSection('I · the adversarial window: answers delivered out of order');
  {
    const tables = [
      { ok: true, revision: 1, sessions: { 'adv-1': { enabled: false, updatedAt: 1 } } },
      { ok: true, revision: 2, sessions: {} },
    ];
    let postIndex = 0;
    let releaseFirst = null;
    const bundle = loadClient(clientSource);
    bundle.setFetch((url, init) => {
      if (init?.method !== 'POST') return json({ ok: true, revision: 0, sessions: {} });
      const table = tables[postIndex] ?? { ok: true, revision: 9, sessions: {} };
      postIndex += 1;
      if (postIndex === 1) return new Promise((resolve) => { releaseFirst = () => resolve(json(table)); });
      return json(table);
    });
    const app = applyBundle(bundle);
    await flush();
    const reads = () => bundle.fetchLog.filter((row) => row.url === SESSIONS_ROUTE && (row.init?.method ?? 'GET') === 'GET').length;
    const readsAtMount = reads();
    const first = bundle.diagnostics.toggleSession('adv-1');
    const second = bundle.diagnostics.toggleSession('adv-1');
    await second;
    await flush();
    const midway = bundle.diagnostics.sessionSettings('adv-1').enabled;
    const readsAfterSecond = reads();
    releaseFirst();
    await first;
    await flush();
    const final = bundle.diagnostics.sessionSettings('adv-1').enabled;
    const readsAfterFirst = reads();
    check('I2.late-answer-does-not-stick', midway === true && final === true, `mid-flight client.enabled=${midway}; after the LATE #1 answer (which carries the stale {enabled:false} table) client.enabled=${final} — the local table must equal the stub's store (empty => effective true)`);
    check('I2b.convergence-reread-issued', readsAfterSecond === readsAfterFirst - 1 && readsAfterFirst === readsAtMount + 1, `reads: mount=${readsAtMount}, after the 2nd answer=${readsAfterSecond}, after the late 1st answer=${readsAfterFirst} — exactly ONE extra read, issued when the last write settled`);
    note('  I2 drives the failure mode the rev-10 review filed as F-01: the #1 answer is released only after #2 has been consumed, so the answer carrying the STALE table arrives last.');
    note('  rev-11 answers it with a convergence re-read (lib/client.js:1234-1245, called from :1207 and :1216): once the last outstanding write of the table settles, the table is read back from the Host, so the local copy equals the store whatever order the answers arrived in.');
    note('  A `revision >` fence alone would NOT do this — with the answers reversed the fresh table rides the LATER answer and carries the LARGER revision (lib/client.js:1179-1182), which is why the fix is a re-read and not a fence.');
    note('  I2/I2b are the pair that keeps rev-11 honest: a version that drops the re-read fails BOTH (the table reverts AND the extra read disappears) — see the `convergence-reread-removed` mutation.');
    app.dispose();
  }

  /* -------------------------------------------------- G · no browser storage */

  startSection('G · no browser storage, and the pre-rev-10 page still renders');
  {
    const words = ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'window.name', 'caches.open'];
    const hits = words.filter((word) => clientSource.includes(word) || indexSource.includes(word));
    check('G1.no-web-storage-in-the-bytes', hits.length === 0, `hits=${show(hits)}`);
    const bundle = loadClient(clientSource);
    bundle.setFetch(() => json({ ok: true, revision: 0, sessions: {} }));
    const app = applyBundle(bundle);
    await flush();
    app.pending.emit(new Map([[SESSION_A, { kind: 'approval', key: 'g1', sessionId: SESSION_A }]]));
    bundle.clock.drain();
    await flush();
    check('G2.no-web-storage-at-runtime', bundle.storageTouches.length === 0, `touches=${show(bundle.storageTouches)}`);
    app.dispose();
  }

  startSection('H · the pre-rev-10 settings page still renders every control');
  {
    const bundle = loadClient(clientSource);
    bundle.setFetch(() => json({ ok: true, revision: 0, sessions: {} }));
    const app = applyBundle(bundle, { scope: { enabled: true, volume: 70, tone: 'chime', custom: [{ id: CUSTOM_ID, name: 'own.mp3' }] } });
    await flush();
    const Section = app.entryFor('settings.section').component;
    const view = mount(Section, {}, bundle.runtime);
    const tree = view.tree;
    const switchInput = findBy(tree, (node) => node.type === 'input' && node.props.role === 'switch');
    check('H1.global-switch', switchInput !== null && switchInput.props.type === 'checkbox' && switchInput.props.checked === true, switchInput === null ? 'missing' : show({ checked: switchInput.props.checked }));
    const range = findBy(tree, (node) => node.type === 'input' && node.props.type === 'range');
    check('H2.volume-range', range !== null && range.props.min === 0 && range.props.max === 100 && range.props.step === 1 && range.props.value === 70, range === null ? 'missing' : show({ min: range.props.min, max: range.props.max, step: range.props.step, value: range.props.value }));
    const select = findBy(tree, (node) => node.type === 'select');
    const optionValues = select === null ? [] : select.children.map((child) => child.props.value);
    check('H3.tone-picker', select !== null && eq(optionValues, [CUSTOM_TONE, 'chime', 'bell', 'beep']) && select.props.value === 'chime', show(optionValues));
    const fileInput = findBy(tree, (node) => node.type === 'input' && node.props.type === 'file');
    check('H4.import-input', fileInput !== null && fileInput.props.accept === 'audio/*' && fileInput.props.className === 'dacFile', fileInput === null ? 'missing' : show({ accept: fileInput.props.accept }));
    const labels = texts(tree).join(' | ');
    check('H5.buttons', labels.includes('导入音频') && labels.includes('试听') && labels.includes('恢复默认'), labels.slice(0, 120));
    // The stamp is asserted twice on purpose: against the LIVE diagnostics value
    // (so the badge must render what the bundle reports, whatever that is) and
    // against the expected rev-11 constant (so a stale/forgotten bump still goes
    // red once instead of silently passing).
    const EXPECTED_REVISION = 'rev-14 · blue session bell';
    check('H6.stats-and-revision', labels.includes('已触发') && labels.includes(bundle.diagnostics.revision) && bundle.diagnostics.revision === EXPECTED_REVISION, `revision=${show(bundle.diagnostics.revision)} rendered=${labels.includes(bundle.diagnostics.revision)} expected=${show(EXPECTED_REVISION)}`);
    check('H7.picker-select-css', bundle.styles().includes('::picker(select)') && bundle.styles().includes('appearance:base-select'), 'the @supports (appearance:base-select) block is still injected');
    check('H8.custom-limit-50', clientSource.includes('var CUSTOM_LIMIT = 50;') && labels.includes('导入音频'), 'CUSTOM_LIMIT = 50 at lib/client.js:193, import control rendered');
    check('H9.tone-rows-3', bundle.diagnostics.toneRows === 3, `toneRows=${bundle.diagnostics.toneRows}`);
    const resetButton = findBy(tree, (node) => node.type === 'button' && node.children.includes('恢复默认'));
    check('H10.reset-button-present', resetButton !== null, resetButton === null ? 'missing' : 'button with 恢复默认');
    resetButton.props.onClick();
    await flush(10);
    check('H11.reset-clears-three-fields', eq(app.scope.unsets, ['enabled', 'volume', 'tone']), show(app.scope.unsets));
    app.dispose();
  }

  /* ------------------------------------------------------ Z · frozen bytes */

  startSection('Z · the frozen paths are byte-identical to the recorded baseline');
  if (mutatedRun) {
    note('  (mutation mode: the source is the mutated in-memory copy, so the hash comparison is skipped here)');
  } else {
    check('Z1.client-hash-unchanged', sha256(readFileSync(CLIENT_PATH)) === sha256(clientBytes), sha256(clientBytes));
    check('Z2.index-hash-unchanged', sha256(readFileSync(INDEX_PATH)) === sha256(indexBytes), sha256(indexBytes));
  }

  /* ------------------------------------------------------------------ teardown */

  await new Promise((resolve) => web.server.close(resolve));
  if (savedHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = savedHome;
  rmSync(tempRoot, { recursive: true, force: true });

  console.log(`\n### probe-18-r10-sessions · assertions passed=${passed} failed=${failures.length}`);
  for (const failure of failures) console.log(`  - [${failure.section}] ${failure.id} :: ${failure.detail}`);
  return failures.length === 0 ? 0 : 1;
}

/* ------------------------------------------------------------------ helpers */

/** Read the `order:` of a shipped header-action registration, from the host bytes. */
function readOrderOf(packageName, id) {
  const source = readFileSync(join(HOST_ROOT, packageName, 'lib', 'client.js'), 'utf8');
  const index = source.indexOf(`id: "${id}"`);
  if (index < 0) return null;
  const match = /order:\s*(-?\d+)/.exec(source.slice(index, index + 200));
  return match === null ? null : Number(match[1]);
}

/* --------------------------------------------------------------- entry point */

const argument = process.argv.find((value) => value.startsWith('--mutate='));

if (process.argv.includes('--list-mutations')) {
  for (const mutation of MUTATIONS) {
    console.log(`${mutation.name} (${mutation.target}) — ${mutation.what}`);
    console.log(`    declared red set: ${mutation.expect.length === 0 ? '(to be filled from the measured run)' : mutation.expect.join(', ')}`);
  }
  process.exit(0);
}

if (argument !== undefined) {
  const requested = argument.slice('--mutate='.length);
  const chosen = requested === 'all' ? MUTATIONS : MUTATIONS.filter((mutation) => mutation.name === requested);
  if (chosen.length === 0) {
    console.error(`unknown mutation '${requested}'`);
    process.exit(2);
  }
  const originalClient = readFileSync(CLIENT_PATH, 'utf8');
  const originalIndex = readFileSync(INDEX_PATH, 'utf8');
  const clientDigest = sha256(readFileSync(CLIENT_PATH));
  const indexDigest = sha256(readFileSync(INDEX_PATH));
  let missed = 0;
  for (const mutation of chosen) {
    console.log(`\n############ mutation '${mutation.name}' (${mutation.target})`);
    console.log(`############ ${mutation.what}`);
    console.log(`############ declared red set: ${mutation.expect.length === 0 ? '(measurement run)' : mutation.expect.join(', ')}`);
    const shippedSource = mutation.target === 'client' ? originalClient : originalIndex;
    const shippedDigest = mutation.target === 'client' ? clientDigest : indexDigest;
    const anchorOccurrences = shippedSource.split(mutation.from).length - 1;
    const clientMutated = mutation.target === 'client' ? mutate(originalClient, mutation) : originalClient;
    const indexMutated = mutation.target === 'host' ? mutate(originalIndex, mutation) : originalIndex;
    const mutatedSource = mutation.target === 'client' ? clientMutated : indexMutated;
    const mutatedDigest = sha256(Buffer.from(mutatedSource, 'utf8'));
    const sourceChanged = mutatedDigest !== shippedDigest;
    console.log(`############ anchor occurrences in the shipped bytes: ${anchorOccurrences} (must be exactly 1)`);
    console.log(`############ mutant source sha256 ${mutatedDigest} vs shipped ${shippedDigest} changed=${sourceChanged}`);
    passed = 0;
    failures.length = 0;
    globalThis.__R10_CLIENT_SOURCE__ = clientMutated;
    globalThis.__R10_INDEX_SOURCE__ = indexMutated;
    await main();
    const observed = failures.map((failure) => failure.id);
    const matched = mutation.expect.filter((expected) => observed.some((id) => id === expected || id.startsWith(`${expected}.`)));
    const extra = observed.filter((id) => !mutation.expect.some((expected) => id === expected || id.startsWith(`${expected}.`)));
    const detected = matched.length === mutation.expect.length && extra.length === 0 && sourceChanged && anchorOccurrences === 1;
    console.log(`############ observed red set (${observed.length}): ${observed.join(', ') || '(none)'}`);
    console.log(`############ extra reds beyond the declaration: ${extra.join(', ') || '(none)'}`);
    if (mutation.expect.length === 0) {
      console.log(`############ MEASUREMENT RUN — paste this red set into the mutation declaration`);
      missed += 1;
    } else if (detected) {
      console.log('############ DETECTED (exactly the declared red set, and the mutant source provably changed)');
    } else {
      console.log('############ NOT DETECTED as declared');
      if (!sourceChanged) console.log('############   reason: the mutant source is byte-identical to the shipped source (DEAD MUTATION)');
      if (anchorOccurrences !== 1) console.log(`############   reason: the anchor occurs ${anchorOccurrences} times in the shipped bytes`);
      missed += 1;
    }
  }
  const clientAfter = sha256(readFileSync(CLIENT_PATH));
  const indexAfter = sha256(readFileSync(INDEX_PATH));
  console.log(`\n### lib/client.js sha256 before=${clientDigest} after=${clientAfter} unchanged=${clientDigest === clientAfter}`);
  console.log(`### lib/index.js  sha256 before=${indexDigest} after=${indexAfter} unchanged=${indexDigest === indexAfter}`);
  console.log(`\n### mutation summary: ${chosen.length - missed}/${chosen.length} mutations detected exactly as declared`);
  process.exit(missed === 0 && clientDigest === clientAfter && indexDigest === indexAfter ? 0 : 1);
}

process.exit(await main());
