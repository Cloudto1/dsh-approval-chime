/**
 * Host half of dsh-approval-chime.
 *
 * This half has exactly one job: register the `approval-chime` settings
 * namespace so the user document can carry the chime preference and the browser
 * half can bind a settings scope to it. The Host has no audio device and no
 * approval surface of its own, so everything about *making* the sound lives in
 * `lib/client.js`.
 *
 * WHY THE SCHEMA NEEDS A REAL SCHEMA PACKAGE (docs/契约调研.md §B): `dsh-settings`
 * calls the schema to resolve defaults (`schema(mergeLayers(base, section))`) and
 * walks `toJSON()` / `type` / `dict` when it describes the namespace, so a
 * hand-rolled stand-in would blow up later, inside `describe()` — far from the
 * root cause. The schema must therefore be a real
 * `@deepseek-ai/schemastery` object.
 *
 * WHY RESOLUTION IS LAZY AND CANDIDATE-BASED: this package is mounted with a
 * `link:` dependency, and Node resolves a linked package's own bare imports
 * through its REAL path (`D:\...\dsh-approval-chime\lib`), never through the
 * profile directory. That is why this package ships
 * `node_modules/@deepseek-ai/schemastery` as a junction to the copy the Host
 * maintains under `$DSH_HOME/profiles/node_modules` (see README, and
 * docs/契约调研.md §B.6 path ① — measured, not assumed).
 *
 * The candidates below are tried in order, and a total failure is reported and
 * swallowed: a missing link must degrade this plugin, never break `dsh web`
 * boot. A top-level `import '@deepseek-ai/schemastery'` would do the opposite —
 * it turns a missing link into a loader entry failure for the whole profile.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const name = 'dsh-approval-chime';

/** The only Host-side dependency: namespace registration is this half's whole job. */
export const inject = ['settings'];

/** Settings namespace. Must match /^[a-z][a-z0-9-]*$/ (dsh-settings:82-86). */
export const NS = 'approval-chime';

/** The package the schema object must come from. */
export const SCHEMA_PACKAGE = '@deepseek-ai/schemastery';

/** Tone ids; mirrored in lib/client.js (the browser half cannot import this module). */
export const TONES = Object.freeze(['chime', 'bell', 'beep']);

/** Schema defaults; mirrored in lib/client.js as its own pre-describe fallback. */
export const DEFAULTS = Object.freeze({ enabled: true, volume: 70, tone: 'chime', custom: Object.freeze([]) });

/**
 * Tone ids a user-imported audio file can be selected as. The stored value is
 * `custom:<uuid>`; the built-in ids above stay untouched so an old document keeps
 * validating after this feature lands.
 */
export const CUSTOM_TONE_PREFIX = 'custom:';

/** Route prefix serving imported audio. Registered on the profile's web server. */
export const AUDIO_ROUTE = '/api/approval-chime/audio';

/**
 * Largest accepted upload. A notification chime is a short sound; the cap keeps a
 * mistaken multi-minute file from turning `settings.yaml` and the plugin
 * directory into a media store, and lets the reader refuse early instead of
 * buffering without bound.
 */
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

/** Extension allow-list; the value is the content type served back on GET. */
export const AUDIO_TYPES = Object.freeze({
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  webm: 'audio/webm',
});

/**
 * Upload ids are UUIDs: validating the shape is what keeps a path out of the URL.
 *
 * Deliberately case-SENSITIVE, matching the filesystem and the stored file names:
 * `randomUUID()` is lowercase, and an id this module accepted in mixed case could
 * never be found again because the lookup compares bytes. See docs/rev4-独立验证.md D2.
 */
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const LOG_PREFIX = '[dsh-approval-chime]';

/** One line of diagnostic text from anything thrown. */
function describeError(error) {
  if (error === null || error === undefined) return 'unknown error';
  if (typeof error === 'string') return error;
  const message = error.message;
  return typeof message === 'string' && message.length > 0 ? message : String(error);
}

/**
 * Report through the Host logger when there is one, through the console
 * otherwise, and never throw: diagnostics must not be able to fail a boot.
 */
function report(ctx, level, message) {
  const line = `${LOG_PREFIX} ${message}`;
  try {
    const logger = ctx === null || ctx === undefined ? undefined : ctx.logger;
    if (logger !== null && logger !== undefined && typeof logger[level] === 'function') {
      logger[level](line);
      return;
    }
  } catch {
    /* a broken logger must not break registration */
  }
  try {
    if (level === 'warn') console.warn(line);
    else console.log(line);
  } catch {
    /* no console at all: staying silent is the only remaining option */
  }
}

/** `$DSH_HOME`, falling back to the documented default under the user's home. */
function dshHome() {
  try {
    const configured = process.env.DSH_HOME;
    if (typeof configured === 'string' && configured.length > 0) return configured;
  } catch {
    /* no process env: use the default below */
  }
  return join(homedir(), '.dsh');
}

/**
 * Package-manifest anchors a `require()` can resolve the schema package from,
 * best first. Each entry is a file URL of a `package.json`, because that is the
 * shape `createRequire` accepts.
 *
 * @param ctx - the plugin context, used only for its anchors when present.
 * @returns the anchor URLs, de-duplicated and in resolution order.
 */
export function schemaAnchors(ctx) {
  const anchors = [];
  const seen = new Set();
  const add = (href) => {
    if (typeof href !== 'string' || href.length === 0 || seen.has(href)) return;
    seen.add(href);
    anchors.push(href);
  };
  const addDirectory = (directory) => {
    try {
      add(pathToFileURL(join(directory, 'package.json')).href);
    } catch {
      /* an unusable directory is simply not a candidate */
    }
  };

  // 1. This package itself: the shipped junction lives here.
  add(import.meta.url);
  // 2. The profile directory (dsh-app-boot sets ctx.baseUrl to it at boot).
  const baseUrl = ctx === null || ctx === undefined ? undefined : ctx.baseUrl;
  if (typeof baseUrl === 'string' && baseUrl.length > 0) {
    try {
      add(new URL('package.json', baseUrl).href);
    } catch {
      /* a malformed baseUrl is not a candidate */
    }
  }
  // 3. The loader's own anchor, when it exposes one.
  const loader = ctx === null || ctx === undefined ? undefined : ctx.loader;
  const loaderBaseUrl = loader === null || loader === undefined ? undefined : loader.baseUrl;
  if (typeof loaderBaseUrl === 'string' && loaderBaseUrl.length > 0) {
    try {
      add(new URL('package.json', loaderBaseUrl).href);
    } catch {
      /* ignore */
    }
  }
  // 4. The Host-maintained shared dependency closure and the profile root.
  const home = dshHome();
  addDirectory(join(home, 'profiles', 'web'));
  addDirectory(join(home, 'profiles'));
  return anchors;
}

/** Accept both `module.exports = z` and a transpiled `{ default: z }` shape. */
function pickSchema(loaded) {
  if (typeof loaded === 'function') return loaded;
  if (loaded !== null && loaded !== undefined && typeof loaded.default === 'function') return loaded.default;
  return null;
}

/**
 * Every schema-package path the anchors can see, plus why the others failed.
 *
 * @param ctx - the plugin context.
 * @returns `{ candidates, failures }`; `candidates` is never reordered.
 */
export function schemaCandidates(ctx) {
  const candidates = [];
  const failures = [];
  for (const anchor of schemaAnchors(ctx)) {
    try {
      candidates.push({ anchor, path: createRequire(anchor).resolve(SCHEMA_PACKAGE) });
    } catch (error) {
      failures.push(`${anchor}: ${describeError(error)}`);
    }
  }
  return { candidates, failures };
}

/**
 * Synchronous fast path: `require()` the first candidate that loads and exports
 * a schema factory. Kept synchronous on purpose — the namespace must be
 * registered in the same tick as `apply` so the settings UI can see it on its
 * very first `describe`.
 *
 * @param ctx - the plugin context.
 * @returns `{ z, path, mode, failures, candidates }`; `z` is null when nothing loaded.
 */
export function loadSchemastery(ctx) {
  const attempts = schemaCandidates(ctx);
  for (const candidate of attempts.candidates) {
    let loaded;
    try {
      loaded = createRequire(candidate.anchor)(SCHEMA_PACKAGE);
    } catch (error) {
      attempts.failures.push(`${candidate.path}: require() failed (${describeError(error)})`);
      continue;
    }
    const z = pickSchema(loaded);
    if (z !== null) return { z, path: candidate.path, mode: 'require', failures: attempts.failures };
    attempts.failures.push(`${candidate.path}: no schema factory export`);
  }
  return { z: null, path: null, mode: null, failures: attempts.failures, candidates: attempts.candidates };
}

/**
 * Second chance for an ESM-only copy of the schema package: import the paths the
 * synchronous pass resolved but could not `require()`.
 *
 * @param ctx - the plugin context.
 * @returns the same shape as {@link loadSchemastery}.
 */
export async function loadSchemasteryAsync(ctx) {
  const attempt = loadSchemastery(ctx);
  if (attempt.z !== null) return attempt;
  for (const candidate of attempt.candidates) {
    try {
      const loaded = await import(pathToFileURL(candidate.path).href);
      const z = pickSchema(loaded);
      if (z !== null) return { z, path: candidate.path, mode: 'import', failures: attempt.failures };
      attempt.failures.push(`${candidate.path}: no schema factory export (import)`);
    } catch (error) {
      attempt.failures.push(`${candidate.path}: import() failed (${describeError(error)})`);
    }
  }
  return attempt;
}

/**
 * Build the namespace schema.
 *
 * The value MUST be an object: the browser scope decodes by validating
 * `typeof value === 'object'` (dsh-client-ui-settings:1107-1117), so a scalar or
 * array schema would leave the card permanently unavailable.
 *
 * @param z - the schemastery module (or its callable export).
 * @returns `z.object({ enabled, volume, tone, custom })`.
 */
export function buildSchema(z) {
  return z.object({
    enabled: z.boolean().default(DEFAULTS.enabled),
    volume: z.number().min(0).max(100).default(DEFAULTS.volume),
    // Built-in ids OR one imported file's id (`custom:<uuid>`). Still a closed set:
    // widening this to a bare string would let any typo into the user document and
    // turn a real validation failure into a silent fallback at play time.
    tone: z
      .union([...TONES.map((tone) => z.const(tone)), z.string().pattern(new RegExp(`^${CUSTOM_TONE_PREFIX}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`))])
      .default(DEFAULTS.tone),
    // The ordered roster of imported tones. Order IS the meaning: the browser half
    // renders these before the built-ins, first imported first.
    custom: z
      .array(
        z.object({
          // The id carries the same closed shape as `tone`: a mixed-case id could be
          // stored but never found again (the route compares bytes), which would offer
          // the user a tone that always fails to play. N3, docs/rev5-复验.md.
          id: z.string().pattern(new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)),
          name: z.string(),
        }),
      )
      .default([]),
  });
}

/**
 * Read the namespaces the Host already serves.
 *
 * @param ctx - the plugin context.
 * @returns `{ names, error }`; `names` is null when the directory is unreadable.
 */
function describeNamespaces(ctx) {
  try {
    const descriptors = ctx.settings.describe();
    if (!Array.isArray(descriptors)) return { names: null, error: 'describe() did not return an array' };
    return {
      names: descriptors.map((descriptor) => (descriptor === null || descriptor === undefined ? undefined : descriptor.ns)).filter((ns) => typeof ns === 'string'),
      error: null,
    };
  } catch (error) {
    return { names: null, error: describeError(error) };
  }
}

/** Register the namespace, swallowing (and reporting) any failure. */
function registerNamespace(ctx, loaded) {
  try {
    const schema = buildSchema(loaded.z);
    const scope = ctx.settings.register(NS, schema, { applies: 'live' });
    report(ctx, 'info', `settings namespace "${NS}" registered (schema ${loaded.mode} from ${loaded.path})`);
    return scope;
  } catch (error) {
    report(ctx, 'warn', `settings namespace "${NS}" registration failed: ${describeError(error)}`);
    return undefined;
  }
}

/* --------------------------------------------------------------- audio store */

/**
 * Where imported audio lives: `<plugin>/audio`, inside the plugin's own
 * directory. Chosen over the settings document (which must stay small, readable
 * and mergeable) and over browser storage (per-browser, evictable, and invisible
 * to the Host).
 */
function audioDirectory() {
  return fileURLToPath(new URL('../audio/', import.meta.url));
}

/** One JSON answer. Every route response goes through here, so none can hang. */
function respond(res, status, body, headers) {
  try {
    res.writeHead(
      status,
      Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, headers === undefined ? {} : headers),
    );
    res.end(JSON.stringify(body));
  } catch {
    /* the socket may already be gone; there is nothing left to answer */
  }
}

/**
 * Refuse an oversized upload — but answer only once the sender has finished.
 *
 * Three measured attempts shaped this (docs/rev4-独立验证.md D1). Answering at the
 * moment the cap tripped wrote into a dead socket; answering as soon as the response
 * was flushed still lost the bytes, because Node closes the socket the moment a
 * response finishes while its request is still incomplete — so a streaming client saw
 * ECONNRESET instead of 413. Draining first makes the request complete, and the answer
 * survives.
 *
 * A sender that keeps going past one extra cap, or an idle one past the deadline, is
 * cut off instead: robustness must not become an invitation to stream forever.
 */
function refuseOversized(req, res, error) {
  const message = { ok: false, error: describeError(error) };
  let extra = 0;
  let settled = false;
  let timer = null;
  const cleanup = () => {
    req.removeListener('data', onData);
    req.removeListener('end', onEnd);
    req.removeListener('error', onEnd);
    if (timer !== null) clearTimeout(timer);
  };
  const giveUp = () => {
    if (settled) return;
    settled = true;
    cleanup();
    try {
      req.destroy();
    } catch {
      /* already gone */
    }
  };
  const answer = () => {
    if (settled) return;
    settled = true;
    cleanup();
    // The request is complete here, so `connection: close` alone ends it — no destroy,
    // which is what would race the client's read of this very response.
    respond(res, 413, message, { connection: 'close' });
  };
  function onData(chunk) {
    extra += chunk.length;
    if (extra > MAX_AUDIO_BYTES) giveUp();
  }
  function onEnd() {
    answer();
  }
  try {
    // A body that has ALREADY been received (one big chunk, or a small overshoot) has
    // nothing left to drain: waiting for an `end` that already fired would hold the
    // refusal until the fallback deadline for no reason.
    if (req.readableEnded === true || req.complete === true) {
      answer();
      return;
    }
    req.resume();
    req.on('data', onData);
    req.once('end', onEnd);
    req.once('error', onEnd);
    timer = setTimeout(answer, 3000);
    if (typeof timer.unref === 'function') timer.unref();
  } catch {
    answer();
  }
}

/**
 * The extension a name advertises, by its LAST dot.
 *
 * Deliberately not `path.extname`: Node treats a leading-dot name (`.mp3`) as
 * extensionless, and refusing `  .mp3` told the user nothing useful about a file that
 * plainly claims to be an mp3 (found by the host-route probe).
 */
function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** The stored file for one id, or null when absent. Callers validate the id first. */
async function findAudioFile(id) {
  const directory = audioDirectory();
  let names;
  try {
    names = await readdir(directory);
  } catch {
    return null;
  }
  // EXACT base-name match against a known extension — never a prefix scan. With a
  // prefix scan a stray `<id>.aaa` would be served instead of `<id>.mp3`, and a
  // DELETE would remove the stray while leaving the real file behind (D3).
  const match = names.find((entry) => {
    const dot = entry.lastIndexOf('.');
    if (dot <= 0) return false;
    if (entry.slice(0, dot) !== id) return false;
    return AUDIO_TYPES[entry.slice(dot + 1).toLowerCase()] !== undefined;
  });
  if (match === undefined) return null;
  const ext = extname(match).slice(1).toLowerCase();
  return { path: join(directory, match), type: AUDIO_TYPES[ext] };
}

/**
 * Buffer one upload, REFUSING anything past the cap rather than truncating it: a
 * silently shortened audio file would decode into a wrong-sounding chime, which
 * is worse than a clear failure. Reading stops at the cap, but the socket is left
 * alive for the caller's answer.
 *
 * @param req - the request stream.
 * @returns the uploaded bytes.
 */
function readUpload(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      callback(value);
    };
    function onData(chunk) {
      size += chunk.length;
      if (size > MAX_AUDIO_BYTES) {
        req.pause();
        settle(reject, Object.assign(new Error(`file exceeds the ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)} MB limit`), { code: 413 }));
        return;
      }
      chunks.push(chunk);
    }
    function onEnd() {
      settle(resolve, Buffer.concat(chunks));
    }
    function onError(error) {
      settle(reject, error);
    }
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

/** The original file name, as the browser sent it (URI-encoded header). */
function uploadName(req) {
  const raw = req.headers === undefined ? undefined : req.headers['x-chime-name'];
  if (typeof raw !== 'string' || raw.length === 0) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Longest stored display name; the browser half re-applies the same bound (D4). */
export const NAME_LIMIT = 120;

/**
 * A display name safe to store and echo back: no path, no control bytes, bounded by
 * CODE POINTS rather than UTF-16 units — a plain `slice` can cut a surrogate pair in
 * half and store a lone surrogate that renders as a replacement character (F5).
 */
function displayName(name, ext) {
  const base = name.split(/[\\/]/).pop();
  const cleaned = (base === undefined ? '' : base).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const points = Array.from(cleaned);
  const bounded = points.length <= NAME_LIMIT ? cleaned : points.slice(0, NAME_LIMIT).join('');
  return bounded.length > 0 ? bounded : `audio.${ext}`;
}

/** `POST <route>` — store one uploaded file and answer with its id. */
async function receiveAudio(req, res) {
  // Trimmed before the extension is derived: `ring.mp3 ` has no usable extension and
  // would be refused, which is a confusing answer for a file the user can plainly see
  // is an mp3 (F6).
  const name = uploadName(req).trim();
  const ext = extensionOf(name);
  if (AUDIO_TYPES[ext] === undefined) {
    respond(res, 415, {
      ok: false,
      error: `unsupported audio type "${ext.length > 0 ? ext : '(none)'}"; supported: ${Object.keys(AUDIO_TYPES).join(', ')}`,
    });
    return;
  }
  let body;
  try {
    body = await readUpload(req);
  } catch (error) {
    const tooLarge = error !== null && error !== undefined && error.code === 413;
    if (tooLarge) {
      refuseOversized(req, res, error);
      return;
    }
    respond(res, 400, { ok: false, error: describeError(error) });
    return;
  }
  if (body.length === 0) {
    respond(res, 400, { ok: false, error: 'the uploaded file is empty' });
    return;
  }
  const id = randomUUID();
  try {
    await mkdir(audioDirectory(), { recursive: true });
    await writeFile(join(audioDirectory(), `${id}.${ext}`), body);
  } catch (error) {
    respond(res, 500, { ok: false, error: describeError(error) });
    return;
  }
  respond(res, 200, { ok: true, id, name: displayName(name, ext), ext, type: AUDIO_TYPES[ext], bytes: body.length });
}

/** `GET|HEAD <route>/<id>` — send one stored file back. */
async function serveAudio(id, res, headOnly) {
  if (!ID_PATTERN.test(id)) {
    respond(res, 404, { ok: false, error: 'unknown audio id' });
    return;
  }
  const found = await findAudioFile(id);
  if (found === null) {
    respond(res, 404, { ok: false, error: 'audio not found' });
    return;
  }
  try {
    const body = await readFile(found.path);
    res.writeHead(200, { 'content-type': found.type, 'content-length': String(body.length), 'cache-control': 'no-store' });
    res.end(headOnly ? undefined : body);
  } catch (error) {
    respond(res, 500, { ok: false, error: describeError(error) });
  }
}

/** `DELETE <route>/<id>` — drop one stored file. Removing an absent file still succeeds. */
async function removeAudio(id, res) {
  if (!ID_PATTERN.test(id)) {
    respond(res, 404, { ok: false, error: 'unknown audio id' });
    return;
  }
  const found = await findAudioFile(id);
  if (found === null) {
    respond(res, 200, { ok: true, removed: false });
    return;
  }
  try {
    await unlink(found.path);
    respond(res, 200, { ok: true, removed: true });
  } catch (error) {
    respond(res, 500, { ok: false, error: describeError(error) });
  }
}

/** The one handler behind `AUDIO_ROUTE`; never throws into the server. */
async function handleAudioRoute(req, res) {
  try {
    const method = typeof req.method === 'string' && req.method.length > 0 ? req.method.toUpperCase() : 'GET';
    const url = new URL(typeof req.url === 'string' && req.url.length > 0 ? req.url : '/', 'http://localhost');
    const rest = url.pathname.slice(AUDIO_ROUTE.length).replace(/^\/+/, '');
    if (method === 'GET' || method === 'HEAD') {
      await serveAudio(rest, res, method === 'HEAD');
      return;
    }
    if (method === 'POST' && rest === '') {
      await receiveAudio(req, res);
      return;
    }
    if (method === 'DELETE' && rest.length > 0) {
      await removeAudio(rest, res);
      return;
    }
    respond(res, 405, { ok: false, error: `method ${method} is not supported on this route` });
  } catch (error) {
    respond(res, 500, { ok: false, error: describeError(error) });
  }
}

/**
 * Register the audio route. `webServer` is injected OPTIONALLY on purpose: a hard
 * `inject: ['webServer']` would leave this entry permanently pending in a profile
 * with no web server, which is a boot-level failure — the very thing this plugin
 * must never cause. Without a web server the plugin simply keeps its built-in
 * tones and stores nothing.
 *
 * @param ctx - the plugin context.
 */
export function registerAudioRoutes(ctx) {
  const register = (webCtx, server) => {
    try {
      // The server is passed in rather than re-read from `webCtx`: the two accessors
      // (`ctx.get(name)` and `ctx.webServer`) are not interchangeable on every context
      // shape, and a mismatch here would silently drop the route.
      webCtx.effect(
        () => server.register({ kind: 'prefix', path: AUDIO_ROUTE, handler: handleAudioRoute }),
        'approval-chime: audio route',
      );
      report(ctx, 'info', `audio route registered at ${AUDIO_ROUTE} (limit ${MAX_AUDIO_BYTES} bytes)`);
    } catch (error) {
      report(ctx, 'warn', `audio route registration failed: ${describeError(error)}`);
    }
  };
  try {
    // `ctx.get` itself can throw on a context that is not a live cordis Context
    // (the degradation harness builds exactly such a shape), so probing for the
    // service must never be able to abort the registration path.
    let webServer;
    try {
      webServer = typeof ctx.get === 'function' ? ctx.get('webServer') : undefined;
    } catch {
      webServer = undefined;
    }
    if (webServer !== undefined && webServer !== null) {
      register(ctx, webServer);
      return;
    }
    if (typeof ctx.inject === 'function') {
      ctx.inject(['webServer'], (webCtx) => register(webCtx, webCtx.webServer));
      return;
    }
    if (ctx.webServer !== undefined && ctx.webServer !== null) {
      register(ctx, ctx.webServer);
      return;
    }
    report(ctx, 'warn', 'web server unavailable — imported audio cannot be stored; built-in tones still work');
  } catch (error) {
    report(ctx, 'warn', `audio route skipped: ${describeError(error)}`);
  }
}

/**
 * Register the settings namespace. Never throws: a plugin that cannot register
 * a preference must stay inert, not take the profile's boot down with it.
 *
 * @param ctx - the plugin context.
 */
export function apply(ctx) {
  // The audio route is independent of the settings registration below, including
  // its "already registered" early return — a re-applied plugin must still serve
  // the files it stored on a previous boot.
  registerAudioRoutes(ctx);
  try {
    const settings = ctx === null || ctx === undefined ? undefined : ctx.settings;
    if (settings === null || settings === undefined || typeof settings.register !== 'function') {
      report(ctx, 'warn', 'settings service unavailable — the chime card will not appear (plugin stays inert)');
      return;
    }
    const described = describeNamespaces(ctx);
    if (described.names !== null && described.names.includes(NS)) {
      report(ctx, 'info', `settings namespace "${NS}" is already registered — nothing to do`);
      return;
    }
    if (described.names === null) {
      report(ctx, 'warn', `settings directory unreadable (${described.error}); attempting registration anyway`);
    }
    const loaded = loadSchemastery(ctx);
    if (loaded.z !== null) {
      registerNamespace(ctx, loaded);
      return;
    }
    report(ctx, 'warn', `${SCHEMA_PACKAGE} is not resolvable synchronously; retrying the ESM route. Failures: ${loaded.failures.join(' | ')}`);
    loadSchemasteryAsync(ctx).then(
      (asynchronous) => {
        if (asynchronous.z !== null) {
          registerNamespace(ctx, asynchronous);
          return;
        }
        report(ctx, 'warn', `could not load ${SCHEMA_PACKAGE}; settings namespace "${NS}" is not registered. Failures: ${asynchronous.failures.join(' | ')}`);
      },
      (error) => report(ctx, 'warn', `asynchronous schema load failed: ${describeError(error)}`),
    );
  } catch (error) {
    report(ctx, 'warn', `settings registration skipped: ${describeError(error)}`);
  }
}
