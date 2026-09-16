/**
 * Independent probe kit — rev-4 (task t1, verifier).
 *
 * Everything here is written for the adversarial pass over the rev-4 browser
 * half. It imports the reporter / classic-script loader / React hook driver /
 * fake plugin context from `kit/platform.mjs` — the verifier's OWN kit from the
 * earlier independent pass — and NEVER from `dsh-approval-chime/verify/`, so the
 * implementation's self-test scaffolding cannot make these probes pass.
 *
 * What rev-4 adds on top of the base kit:
 *   - a WebAudio recorder that also knows `decodeAudioData` and
 *     `createBufferSource`, with the master gain still identifiable per chime;
 *   - a scriptable `fetch` stub (ok / 404 / reject / SYNCHRONOUS throw / hang /
 *     absent) that records every call, so "fetched exactly once" is measurable;
 *   - a boot helper that runs the REAL `lib/client.js` factory + `apply` inside
 *     a fresh `node:vm` context and hands back the registered card component.
 */

import { suite, settle, watchRejections, allText, findAll, mount, loadBundle, makeCtx, CLIENT_SOURCE } from './platform.mjs';

export { suite, settle, watchRejections, allText, findAll, loadBundle, makeCtx, mount, CLIENT_SOURCE };

export const PREFIX = 'custom:';
export const AUDIO_ROUTE = '/api/approval-chime/audio';
export const CUSTOM_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Deterministic UUID-shaped ids: `00000001-aaaa-4aaa-8aaa-bbbbbbbbbbbb`. */
export function uuid(index, tail = 'b') {
  return `${String(index).padStart(8, '0')}-aaaa-4aaa-8aaa-${String(tail).slice(0, 1).repeat(12)}`;
}

/** A roster entry as the Host half stores it. */
export function entry(index, name, tail = 'b') {
  const id = uuid(index, tail);
  return name === undefined ? { id } : { id, name };
}

/* ------------------------------------------------------------- WebAudio stub */

/**
 * Records the audio graph the plugin really built. `masterGains()` is the set of
 * gain nodes wired straight into `destination` — one per chime in rev-4 (both
 * the synthesized and the imported path use exactly one).
 */
export function makeSampleRecorder(options = {}) {
  const record = {
    contexts: [],
    gains: [],
    oscillators: [],
    bufferSources: [],
    links: [],
    starts: [],
    decodeCalls: [],
    resumeCalls: 0,
    constructErrors: 0,
    decodeMissing: options.noDecode === true,
    decodeError: typeof options.decodeError === 'string' ? options.decodeError : null,
    /** `(index, bytes) => spec` — `{ reject }`, `{ buffer }`, `{ hang }`, `{ throw }`. */
    decodePlan: typeof options.decodePlan === 'function' ? options.decodePlan : null,
  };
  let sequence = 0;

  function AudioContext() {
    if (options.constructThrows === true) {
      record.constructErrors += 1;
      throw new Error('probe: AudioContext construction refused');
    }
    const context = this;
    context.state = options.state === undefined ? 'running' : options.state;
    context.currentTime = options.currentTime === undefined ? 7.25 : options.currentTime;
    context.destination = { kind: 'destination', id: 'destination' };
    record.contexts.push(context);

    context.resume = function resume() {
      record.resumeCalls += 1;
      if (options.resumeKeepsSuspended !== true) context.state = 'running';
      return Promise.resolve();
    };

    context.createGain = function createGain() {
      sequence += 1;
      const gain = {
        kind: 'gain',
        id: `gain-${sequence}`,
        outputs: [],
        value: 1,
        history: [],
        connect(target) {
          gain.outputs.push(target);
          record.links.push({ from: gain.id, to: target === null || target === undefined ? null : target.kind });
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
          gain.history.push(next);
        },
        setValueAtTime(next) {
          gain.value = next;
          gain.history.push(next);
        },
        exponentialRampToValueAtTime(next) {
          gain.history.push({ ramp: next });
        },
        linearRampToValueAtTime(next) {
          gain.history.push({ ramp: next });
        },
      };
      record.gains.push(gain);
      return gain;
    };

    context.createOscillator = function createOscillator() {
      sequence += 1;
      const oscillator = {
        kind: 'oscillator',
        id: `osc-${sequence}`,
        type: 'sine',
        frequency: { value: 0 },
        outputs: [],
        connect(target) {
          oscillator.outputs.push(target);
          record.links.push({ from: oscillator.id, to: target === null || target === undefined ? null : target.kind });
          return target;
        },
        disconnect() {},
        start(at) {
          record.starts.push({ node: oscillator.id, kind: 'oscillator', at });
        },
        stop() {},
      };
      record.oscillators.push(oscillator);
      return oscillator;
    };

    context.createBufferSource = function createBufferSource() {
      sequence += 1;
      const source = {
        kind: 'bufferSource',
        id: `src-${sequence}`,
        buffer: null,
        outputs: [],
        startedAt: null,
        connect(target) {
          source.outputs.push(target);
          record.links.push({ from: source.id, to: target === null || target === undefined ? null : target.kind });
          return target;
        },
        disconnect() {},
        start(at) {
          source.startedAt = at;
          record.starts.push({ node: source.id, kind: 'bufferSource', at });
        },
        stop() {},
      };
      record.bufferSources.push(source);
      return source;
    };

    if (options.noDecode !== true) {
      context.decodeAudioData = function decodeAudioData(bytes) {
        const index = record.decodeCalls.push({ bytes, context }) - 1;
        const buffer = { kind: 'audioBuffer', id: `buffer-${index + 1}`, bytes, sampleRate: 48000, length: 44100 };
        if (record.decodePlan !== null) {
          const step = record.decodePlan(index, bytes, buffer);
          if (step !== null && step !== undefined) {
            if (step.throw === true) throw new Error('probe: decodeAudioData threw synchronously');
            if (typeof step.reject === 'string') return Promise.reject(new Error(step.reject));
            if (step.hang === true) return new Promise(() => {});
            return Promise.resolve(step.buffer === undefined ? buffer : step.buffer);
          }
        }
        if (record.decodeError !== null) return Promise.reject(new Error(record.decodeError));
        return Promise.resolve(buffer);
      };
    }
  }

  record.masterGains = () => record.gains.filter((gain) => gain.outputs.some((target) => target !== null && target !== undefined && target.kind === 'destination'));
  record.masterGainValues = () => record.masterGains().map((gain) => gain.value);
  return { Ctor: AudioContext, record };
}

/* ----------------------------------------------------------------- fetch stub */

/**
 * A scriptable `fetch`:
 *   `get`  — spec for `GET <route>/<id>`, or `(id, call) => spec`
 *   `post` — spec for `POST <route>`
 *   `del`  — spec for `DELETE <route>/<id>`
 * A spec is one of:
 *   `{ bytes }`        → 200/ok response with `arrayBuffer()`
 *   `{ json, status }` → response with `json()`
 *   `{ reject: 'msg' }`→ returned rejected promise (a normal network failure)
 *   `{ throw: 'msg' }` → thrown SYNCHRONOUSLY out of `fetch(...)`
 *   `{ hang: true }`   → a promise that never settles
 *   `{ noResponse: true }` → resolves with `null`
 */
export function makeFetch(plan = {}) {
  const calls = [];
  const deferred = [];
  const responseLike = (status, spec) => ({
    ok: spec.ok === undefined ? status >= 200 && status < 300 : spec.ok,
    status,
    arrayBuffer: async () => (spec.bytes === undefined ? new ArrayBuffer(4) : spec.bytes),
    json: async () => {
      if (spec.json === undefined) throw new Error('probe: body is not JSON');
      return spec.json;
    },
  });
  const build = (spec) => {
    if (spec === null || spec === undefined) return Promise.reject(new Error('probe: unrouted fetch'));
    if (spec.throw !== undefined) throw new Error(spec.throw);
    if (spec.reject !== undefined) return Promise.reject(new Error(spec.reject));
    if (spec.hang === true) return new Promise(() => {});
    if (spec.noResponse === true) return Promise.resolve(null);
    const status = spec.status === undefined ? 200 : spec.status;
    if (spec.defer === true) {
      const inner = spec.response === undefined ? {} : spec.response;
      const innerStatus = inner.status === undefined ? status : inner.status;
      let release;
      const promise = new Promise((resolvePending) => {
        release = resolvePending;
      });
      deferred.push({
        spec,
        resolve: () => release(responseLike(innerStatus, inner)),
        response: () => responseLike(innerStatus, inner),
      });
      return promise;
    }
    return Promise.resolve(responseLike(status, spec));
  };
  const fetchFn = (url, init) => {
    const method = String((init === undefined || init === null ? undefined : init.method) === undefined ? 'GET' : init.method).toUpperCase();
    const call = { url: String(url), method, init: init === undefined ? null : init };
    calls.push(call);
    if (method === 'POST') return build(typeof plan.post === 'function' ? plan.post(call) : plan.post);
    if (method === 'DELETE') return build(typeof plan.del === 'function' ? plan.del(call) : plan.del);
    const id = String(url).slice(String(url).lastIndexOf('/') + 1);
    const spec = typeof plan.get === 'function' ? plan.get(decodeURIComponent(id), call) : plan.get;
    return build(spec);
  };
  fetchFn.calls = calls;
  fetchFn.deferred = deferred;
  fetchFn.audioCalls = () => calls.filter((call) => call.method === 'GET' && call.url.startsWith(AUDIO_ROUTE + '/'));
  fetchFn.uploadCalls = () => calls.filter((call) => call.method === 'POST');
  return fetchFn;
}

/* ------------------------------------------------------------------- booting */

/**
 * Run the REAL `lib/client.js` as a classic script, call its factory and `apply`
 * with a stub plugin context, and return everything a probe needs.
 *
 * @param options.scopeValue - the settings document the fake scope serves.
 * @param options.fetch - a stub from {@link makeFetch}, or `'absent'` to remove
 *   the global entirely (`typeof fetch === 'undefined'`).
 * @param options.audio - options for {@link makeSampleRecorder}.
 */
export function boot(options = {}) {
  const bundle = loadBundle();
  const recorder = makeSampleRecorder(options.audio === undefined ? {} : options.audio);
  bundle.sandbox.AudioContext = recorder.Ctor;

  if (options.fetch === 'absent') delete bundle.sandbox.fetch;
  else if (typeof options.fetch === 'function') bundle.sandbox.fetch = options.fetch;

  const fake = makeCtx({ scopeValue: options.scopeValue === undefined ? { enabled: true, volume: 70, tone: 'chime', custom: [] } : options.scopeValue });
  let applyError = null;
  try {
    bundle.contract.apply(fake.ctx);
  } catch (error) {
    applyError = error;
  }
  const registration = fake.log.slotRegistrations.length > 0 ? fake.log.slotRegistrations[0] : null;

  const api = {
    bundle,
    document: bundle.document,
    recorder: recorder.record,
    sandbox: bundle.sandbox,
    ctx: fake.ctx,
    scope: fake.scope,
    scopeState: fake.api.scopeState,
    log: fake.log,
    fakeApi: fake.api,
    applyError,
    registration,
    card: registration === null ? null : registration.component,
    diagnostics: bundle.diagnostics(),
    /** The CSS the bundle injected, verbatim. */
    cssText() {
      const style = bundle.document.elements.find((element) => element.tag === 'style');
      return style === undefined ? null : style.textContent;
    },
    /** Set one settings field the way a Host revision would. */
    setSetting(field, value) {
      fake.api.scopeState.value = { ...(fake.api.scopeState.value === undefined ? {} : fake.api.scopeState.value), [field]: value };
      fake.api.scopeState.revision += 1;
      if (value === undefined) delete fake.api.scopeState.value[field];
      fake.api.notifyScope();
    },
    /**
     * Mount the card over a fresh hook runtime: renders once and runs the
     * effects (which is what subscribes the card to its own snapshot store), so
     * `render()` after a settings write sees the new snapshot. Calling
     * `runEffects()` again is a no-op.
     */
    mountCard(props) {
      const driver = mount(bundle.reactRuntime, api.card, props === undefined ? {} : props);
      driver.render();
      driver.runEffects();
      return driver;
    },
    /** Re-render a mounted card and return its tree. */
    renderCard(driver) {
      return driver.render();
    },
    stats() {
      return api.diagnostics.stats();
    },
    audio() {
      return api.diagnostics.audio();
    },
    snapshot() {
      return api.diagnostics.snapshot();
    },
  };
  return api;
}

/* --------------------------------------------------------------- tree helpers */

/** The `<select>` the card renders (there is exactly one). */
export function selectOf(tree) {
  const found = findAll(tree, (node) => node.type === 'select');
  return found.length > 0 ? found[0] : null;
}

/** Rendered option rows, in render order: `[{ value, label }]`. */
export function optionRows(tree) {
  const select = selectOf(tree);
  if (select === null) return [];
  const options = [];
  for (const child of select.children) {
    if (child === null || typeof child !== 'object' || child.type !== 'option') continue;
    options.push({ value: child.props.value, label: child.children.join('') });
  }
  return options;
}

/** Rendered option values only. */
export function optionValues(tree) {
  return optionRows(tree).map((option) => option.value);
}

/** Every element type present in the tree (to prove no surprise element exists). */
export function elementTypes(tree) {
  const types = new Set();
  findAll(tree, (node) => types.add(node.type));
  return [...types];
}

/** The card's `<input type="file">`. */
export function fileInputOf(tree) {
  const found = findAll(tree, (node) => node.type === 'input' && node.props.type === 'file');
  return found.length > 0 ? found[0] : null;
}

/** Drive the file input the way a real file choice does. */
export function chooseFile(tree, file) {
  const input = fileInputOf(tree);
  if (input === null) throw new Error('probe: the card renders no file input');
  const target = { files: file === null ? [] : [file], value: 'C:\\fakepath\\probe.bin' };
  input.props.onChange({ target });
  return target;
}

/** A `File`-like object (the (fake) shape `onImport` reads). */
export function makeFile(name, size = 1024, type = 'audio/wav') {
  return { name, size, type };
}
