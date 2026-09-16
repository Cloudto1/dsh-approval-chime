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
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
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
 * Route serving the per-session overrides (rev-10).
 *
 * One prefix route carries BOTH methods, exactly like {@link AUDIO_ROUTE}: the
 * profile's web server keys its route table by `(kind, path)` and throws on a
 * duplicate, so registering `GET` and `POST` as two rows at the same path would
 * fail the second registration (`dsh-host-webserver/lib/index.js:176-183`).
 */
export const SESSIONS_ROUTE = '/api/approval-chime/sessions';

/**
 * Most session records kept in the file. A session id is arbitrary user data
 * (hundreds of sessions over a year), so the table is bounded and evicted by
 * `updatedAt`: the file must not grow forever just because sessions come and go.
 */
export const MAX_SESSIONS = 200;

/** Longest accepted session id, so a runaway client cannot grow the file without bound. */
export const SESSION_ID_LIMIT = 200;

/** The three fields a session record may override. Everything else is refused. */
export const SESSION_FIELDS = Object.freeze(['enabled', 'volume', 'tone']);

/** Largest accepted POST body. A patch is tiny; the cap only stops unbounded reads. */
export const SESSION_BODY_LIMIT = 64 * 1024;

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

/**
 * `$DSH_HOME`, falling back to the documented default under the user's home.
 *
 * The same rule the platform itself applies (`@deepseek-ai/dsh-home-paths/lib/index.js:73-76`):
 * a whitespace-only `$DSH_HOME` counts as UNSET, so a blank override can never
 * resolve the store to the current working directory. The package is deliberately
 * NOT imported — a `link:`-mounted plugin cannot resolve its bare specifier — so
 * the rule is re-implemented here, in one place, for both users of it.
 */
function dshHome() {
  try {
    const configured = process.env.DSH_HOME;
    if (typeof configured === 'string' && configured.trim().length > 0) return configured;
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
function respond(res, status, body, headers, headOnly) {
  try {
    res.writeHead(
      status,
      Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, headers === undefined ? {} : headers),
    );
    // `headOnly` (HEAD) answers the same status and headers with no body, exactly
    // like the audio route's HEAD arm. Every other caller passes four arguments
    // and keeps the body it always sent.
    res.end(headOnly === true ? undefined : JSON.stringify(body));
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

/* ------------------------------------------------------- per-session overrides */

/**
 * Where the per-session overrides live: the plugin's OWN file under the harness
 * home — `<DSH_HOME|~/.dsh>/approval-chime/sessions.json`.
 *
 * NOT the settings document: that document is the user's global preference file
 * (small, readable, mergeable, hand-edited) and a session id is not a preference
 * the user writes by hand. NOT browser storage either: that is per-browser and
 * evictable, while "this session is muted" has to survive a restart and follow
 * the Host process (`docs/契约调研.md` §L.3). The rule that resolves the home is
 * the platform's own (`@deepseek-ai/dsh-home-paths/lib/index.js:73-76`); the
 * package is not imported because a `link:`-mounted plugin cannot resolve its
 * bare specifier (the schemastery lesson, §B.6).
 */
function sessionsDirectory() {
  return join(dshHome(), 'approval-chime');
}

/** The one file holding the table: `<home>/approval-chime/sessions.json`. */
export function sessionsFile() {
  return join(sessionsDirectory(), 'sessions.json');
}

/**
 * Written revision counter, exposed as `revision` on both answers so a client can
 * tell "the table changed" without diffing it. Deliberately in-process: the file
 * itself stays exactly `{ version, sessions }` (no bookkeeping key the user would
 * have to read), and every mutation goes through this process' route.
 */
let sessionRevision = 0;

const SESSION_JSON_INDENT = 2;

/** Every key a JSON object carries, without ever walking a prototype. */
function ownKeys(value) {
  return Object.keys(value);
}

/** A session id is a non-empty, non-blank string of at most {@link SESSION_ID_LIMIT} units. */
export function validSessionId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= SESSION_ID_LIMIT && value.trim().length > 0;
}

/** A volume override is an INTEGER in 0..100 — 42.5 and '50' are refused, not rounded. */
export function validVolume(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
}

/** A tone override is a built-in id or `custom:<lowercase uuid>`, matching the schema. */
export function validTone(value) {
  if (typeof value !== 'string') return false;
  if (TONES.includes(value)) return true;
  return value.startsWith(CUSTOM_TONE_PREFIX) && ID_PATTERN.test(value.slice(CUSTOM_TONE_PREFIX.length));
}

/**
 * Drop the oldest records until at most {@link MAX_SESSIONS} remain.
 *
 * Sorted by `updatedAt` (ties broken by id so the outcome is deterministic rather
 * than dependent on key order), oldest evicted first.
 */
export function evictSessions(table) {
  const ids = ownKeys(table);
  if (ids.length <= MAX_SESSIONS) return table;
  const stamp = (id) => (typeof table[id].updatedAt === 'number' ? table[id].updatedAt : 0);
  ids.sort((left, right) => {
    const delta = stamp(left) - stamp(right);
    if (delta !== 0) return delta;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  for (const id of ids.slice(0, ids.length - MAX_SESSIONS)) delete table[id];
  return table;
}

/**
 * Fold whatever the file held into a usable table.
 *
 * A record this module cannot use is DROPPED rather than repaired: an entry with
 * no usable field would be an empty override that `POST { …: null }` is supposed
 * to remove, and a record whose volume is `"loud"` must not reach play time. The
 * null-prototype map is deliberate — `__proto__` is a legal JSON key and a plain
 * `{}` would take it as a prototype assignment (`docs/契约调研.md` §L.4).
 *
 * @param raw - the `sessions` value read from the file.
 * @returns a sanitized, evicted table.
 */
export function sanitizeSessions(raw) {
  const table = Object.create(null);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return table;
  for (const id of ownKeys(raw)) {
    if (!validSessionId(id)) continue;
    const record = raw[id];
    if (record === null || typeof record !== 'object' || Array.isArray(record)) continue;
    const entry = {};
    if (typeof record.enabled === 'boolean') entry.enabled = record.enabled;
    if (validVolume(record.volume)) entry.volume = record.volume;
    if (validTone(record.tone)) entry.tone = record.tone;
    if (ownKeys(entry).length === 0) continue;
    entry.updatedAt = typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : 0;
    table[id] = entry;
  }
  return evictSessions(table);
}

/**
 * Read the table, degrading to an EMPTY one on every failure.
 *
 * Missing file, unreadable file, broken JSON, a non-object document, a document
 * without a `sessions` object — all four answer "no overrides", which means every
 * session follows the global settings. That is the honest degraded state, and it
 * is reported through the logger rather than thrown: a corrupt override file must
 * cost the user the overrides, never the plugin.
 *
 * @param ctx - the plugin context, used only for its logger.
 * @returns the sanitized table (never null).
 */
async function readSessions(ctx) {
  let text;
  try {
    text = await readFile(sessionsFile(), 'utf8');
  } catch (error) {
    const code = error === null || error === undefined ? undefined : error.code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') {
      report(ctx, 'warn', `session overrides are unreadable (${describeError(error)}); falling back to an empty table`);
    }
    return Object.create(null);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    report(ctx, 'warn', `session overrides are not valid JSON (${describeError(error)}); falling back to an empty table`);
    return Object.create(null);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    report(ctx, 'warn', 'session overrides are not a JSON object; falling back to an empty table');
    return Object.create(null);
  }
  const raw = parsed.sessions;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    report(ctx, 'warn', 'session overrides carry no "sessions" object; falling back to an empty table');
    return Object.create(null);
  }
  return sanitizeSessions(raw);
}

/**
 * Replace the file atomically: write a temporary file in the SAME directory, then
 * `rename()` it over the target.
 *
 * Same directory is the whole trick — `rename` is only atomic within one
 * filesystem, and the target directory may itself have to be created first. A
 * partial write can therefore never be observed: a reader sees either the old file
 * or the new one, which matters because this file is read on every request.
 *
 * @param table - the table to store.
 * @returns the file path written.
 */
async function writeSessions(table) {
  const directory = sessionsDirectory();
  const target = sessionsFile();
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `.sessions.${process.pid}.${randomUUID()}.tmp`);
  const payload = `${JSON.stringify({ version: 1, sessions: table }, null, SESSION_JSON_INDENT)}\n`;
  try {
    await writeFile(temporary, payload, 'utf8');
    await rename(temporary, target);
  } catch (error) {
    try {
      await unlink(temporary);
    } catch {
      /* the temporary file may never have been created; nothing left to clean */
    }
    throw error;
  }
  return target;
}

/**
 * Apply one patch to one session, in place.
 *
 * `null` clears a field (back to following the global setting), a value sets it,
 * and an absent field is left alone. A record that ends up with no field at all is
 * DELETED rather than stored empty: "no overrides" and "follow global" must be the
 * same state on disk, or a session could keep a pointless row forever.
 *
 * @param table - the table to mutate.
 * @param sessionId - a validated session id.
 * @param patch - a validated patch (`enabled`/`volume`/`tone`, values or null).
 * @param now - the timestamp to stamp on a surviving record.
 * @returns the mutated table.
 */
export function applySessionPatch(table, sessionId, patch, now) {
  const previous = table[sessionId];
  const entry = previous !== null && previous !== undefined && typeof previous === 'object' ? { ...previous } : {};
  for (const field of SESSION_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    const value = patch[field];
    if (value === undefined) continue;
    if (value === null) delete entry[field];
    else entry[field] = value;
  }
  if (SESSION_FIELDS.every((field) => entry[field] === undefined)) {
    delete table[sessionId];
    return table;
  }
  entry.updatedAt = now;
  table[sessionId] = entry;
  return evictSessions(table);
}

/**
 * The message a patch is refused with, or null when every field is legal.
 *
 * Validated BEFORE the file is read or written, because "400 and nothing lands on
 * disk" is the contract: a refused patch must not even rewrite the file it did not
 * intend to change.
 */
function patchFailure(patch) {
  const unknown = ownKeys(patch).filter((field) => !SESSION_FIELDS.includes(field));
  if (unknown.length > 0) return `unknown patch field(s): ${unknown.join(', ')}`;
  for (const field of SESSION_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    const value = patch[field];
    if (value === null || value === undefined) continue;
    if (field === 'enabled' && typeof value !== 'boolean') return 'enabled must be a boolean or null';
    if (field === 'volume' && !validVolume(value)) return 'volume must be an integer in 0..100, or null';
    if (field === 'tone' && !validTone(value)) return `tone must be one of ${TONES.join('|')} or custom:<lowercase uuid>, or null`;
  }
  return null;
}

/** Buffer a small request body, refusing anything past `limit` instead of reading forever. */
function readBody(req, limit) {
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
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      size += bytes.length;
      if (size > limit) {
        settle(reject, Object.assign(new Error(`request body exceeds ${limit} bytes`), { code: 413 }));
        return;
      }
      chunks.push(bytes);
    }
    function onEnd() {
      settle(resolve, Buffer.concat(chunks).toString('utf8'));
    }
    function onError(error) {
      settle(reject, error);
    }
    try {
      if (req.readableEnded === true && chunks.length === 0) {
        settle(resolve, '');
        return;
      }
      req.on('data', onData);
      req.on('end', onEnd);
      req.on('error', onError);
    } catch (error) {
      settle(reject, error);
    }
  });
}

/** One answer for the per-session route, carrying the table and its revision. */
function sessionAnswer(table) {
  return { ok: true, revision: sessionRevision, sessions: table };
}

/**
 * The one handler behind {@link SESSIONS_ROUTE}; never throws into the server.
 *
 * `GET` answers the table; `POST { sessionId, patch }` applies a patch and answers
 * the SAME structure, so a client never needs a second round trip to learn the new
 * state. Everything else on this prefix is a 404 (the route is a prefix, so
 * `/sessions/anything` arrives here too) or a 405.
 */
async function handleSessionsRoute(req, res, ctx) {
  try {
    const method = typeof req.method === 'string' && req.method.length > 0 ? req.method.toUpperCase() : 'GET';
    const url = new URL(typeof req.url === 'string' && req.url.length > 0 ? req.url : '/', 'http://localhost');
    if (url.pathname !== SESSIONS_ROUTE) {
      respond(res, 404, { ok: false, error: `unknown path ${url.pathname}` });
      return;
    }
    if (method === 'GET' || method === 'HEAD') {
      const table = await readSessions(ctx);
      respond(res, 200, sessionAnswer(table), undefined, method === 'HEAD');
      return;
    }
    if (method !== 'POST') {
      respond(res, 405, { ok: false, error: `method ${method} is not supported on this route` });
      return;
    }
    let raw;
    try {
      raw = await readBody(req, SESSION_BODY_LIMIT);
    } catch (error) {
      const tooLarge = error !== null && error !== undefined && error.code === 413;
      respond(res, tooLarge ? 413 : 400, { ok: false, error: describeError(error) });
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw.length > 0 ? raw : 'null');
    } catch (error) {
      respond(res, 400, { ok: false, error: `the request body is not valid JSON (${describeError(error)})` });
      return;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      respond(res, 400, { ok: false, error: 'the request body must be an object { sessionId, patch }' });
      return;
    }
    if (!validSessionId(parsed.sessionId)) {
      respond(res, 400, { ok: false, error: `sessionId must be a non-empty string of at most ${SESSION_ID_LIMIT} characters` });
      return;
    }
    const patch = parsed.patch;
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
      respond(res, 400, { ok: false, error: 'patch must be an object of enabled/volume/tone (null clears a field)' });
      return;
    }
    const failure = patchFailure(patch);
    if (failure !== null) {
      respond(res, 400, { ok: false, error: failure });
      return;
    }
    const table = await readSessions(ctx);
    applySessionPatch(table, parsed.sessionId, patch, Date.now());
    try {
      await writeSessions(table);
    } catch (error) {
      respond(res, 500, { ok: false, error: describeError(error) });
      return;
    }
    sessionRevision += 1;
    respond(res, 200, sessionAnswer(table));
  } catch (error) {
    respond(res, 500, { ok: false, error: describeError(error) });
  }
}

/**
 * Register the per-session route. Same optional `webServer` posture as
 * {@link registerAudioRoutes}, and for the same reason: a hard
 * `inject: ['webServer']` would leave this entry pending forever in a profile
 * with no web server — a boot-level failure. Without a web server the per-session
 * overrides simply cannot be stored, and every session keeps following the global
 * settings, which is exactly the pre-rev-10 behaviour.
 *
 * @param ctx - the plugin context.
 */
export function registerSessionRoutes(ctx) {
  const register = (webCtx, server) => {
    try {
      webCtx.effect(
        () => server.register({ kind: 'prefix', path: SESSIONS_ROUTE, handler: (req, res) => handleSessionsRoute(req, res, ctx) }),
        'approval-chime: per-session route',
      );
      report(ctx, 'info', `per-session override route registered at ${SESSIONS_ROUTE} (cap ${MAX_SESSIONS} sessions)`);
    } catch (error) {
      report(ctx, 'warn', `per-session route registration failed: ${describeError(error)}`);
    }
  };
  try {
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
    report(ctx, 'warn', 'web server unavailable — per-session overrides cannot be stored; every session follows the global settings');
  } catch (error) {
    report(ctx, 'warn', `per-session route skipped: ${describeError(error)}`);
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
  // the files it stored on a previous boot. Same for the per-session route: it
  // serves the overrides file, which has nothing to do with the namespace.
  registerAudioRoutes(ctx);
  registerSessionRoutes(ctx);
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
