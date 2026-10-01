/**
 * Host half of dsh-approval-chime.
 *
 * This half's job is to declare the plugin's settings Config so the browser half
 * has a form to bind, and to serve the routes that half cannot serve itself. The
 * Host has no audio device and no approval surface of its own, so everything
 * about *making* the sound lives in `lib/client.js`.
 *
 * DSH 0.1.7 SETTINGS MODEL (migrated rev-26): the settings namespace is the
 * profile ENTRY ID (`dsh-approval-chime`) and the settings form IS this module's
 * `Config`. The old `ctx.settings.register(ns, schema, { applies: 'live' })` API
 * is gone (dsh-settings 0.1.7 exposes only
 * `configure`/`prepareDocument`/`describe`/`update`/`replace`/`mutate`), and with
 * it went the whole runtime schema-resolution machinery this file used to carry:
 * a namespace can no longer be registered from code, so the schema has to be a
 * module-level `Config` export. `settings.describe()` keys entries by
 * `entry.options.id` (dsh-settings:426), which is why `SETTINGS_NS` below is the
 * entry id and not the old hand-picked `'approval-chime'`.
 *
 * WHY THE SCHEMA NEEDS A REAL SCHEMA PACKAGE (docs/契约调研.md §B): `dsh-settings`
 * calls the schema to resolve defaults (`schema(mergeLayers(base, section))`) and
 * walks `toJSON()` / `type` / `dict` when it describes the namespace, so a
 * hand-rolled stand-in would blow up later, inside `describe()` — far from the
 * root cause. The schema must therefore be a real
 * `@deepseek-ai/schemastery` object.
 *
 * WHY THE SCHEMA IMPORT IS NOW STATIC: the schema used to be resolved lazily
 * from a candidate list precisely so a dangling link could never break
 * `dsh web` boot — a missing link must degrade this plugin, never the profile.
 * The `Config` export makes that impossible: the loader reads it at import time.
 * This package is mounted with a `link:` dependency, and Node resolves a linked
 * package's bare imports through its REAL path
 * (`D:\...\dsh-approval-chime\lib`), never through the profile directory — which
 * is why the package ships `node_modules/@deepseek-ai/schemastery` as a junction
 * to the copy the Host maintains under `$DSH_HOME/profiles/node_modules` (see
 * README, and docs/契约调研.md §B.6 path ① — measured, not assumed; re-verified
 * on 0.1.7-rc.2: `import z from '@deepseek-ai/schemastery'` resolves and
 * `z.object({...})({})` applies `.default()`).
 *
 * THE JUNCTION IS NOW A HARD PREREQUISITE. If it dangles, this entry fails to
 * load. That is a genuine regression in robustness against a broken install, and
 * it is the price of the new model — a Config cannot be declared lazily.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Static on purpose: DSH 0.1.7 needs `Config` at IMPORT time (see the header).
// This resolves through the junction the package ships next to itself.
import z from '@deepseek-ai/schemastery';

export const name = 'dsh-approval-chime';

/**
 * `settings` is still the only Host-side dependency, but its job changed: a
 * namespace can no longer be registered from code, so all this half needs the
 * service for is the instance page policy (`configure({ auto: false })`).
 */
export const inject = ['settings'];

/**
 * The settings namespace under the DSH 0.1.7 model — the profile ENTRY ID.
 * `settings.describe()` keys every descriptor by `entry.options.id`
 * (dsh-settings:426), so the browser half must bind this exact string.
 */
export const SETTINGS_NS = 'dsh-approval-chime';

/**
 * The LOCALE namespace, unrelated to settings: the copy dictionary this bundle
 * registers, and the `locale:` prop on its `settings.section` and header-action
 * slot entries. Deliberately NOT renamed — existing dictionaries and slot
 * registrations keep resolving, and the browser half already uses this string
 * for exactly those two purposes.
 */
export const NS = 'approval-chime';

/** Tone ids; mirrored in lib/client.js (the browser half cannot import this module). */
export const TONES = Object.freeze(['chime', 'bell', 'beep']);

/** Schema defaults; mirrored in lib/client.js as its own pre-describe fallback. */
export const DEFAULTS = Object.freeze({ enabled: true, volume: 70, tone: 'chime', custom: Object.freeze([]), nativeToast: false });

/**
 * The settings field the native-toast switch writes (rev-25, freeze page §6).
 *
 * Declared here as well as in `lib/native-toast.js` on purpose: this file may not
 * statically import a sibling (see {@link registerNativeToast}), and the switch
 * has to exist in the schema even when that sibling cannot be resolved.
 * `verify/native-toast.test.mjs` pins the two declarations to the same string, so
 * they cannot drift apart silently.
 */
export const NATIVE_TOAST_FIELD = 'nativeToast';

/**
 * Sibling module that owns the native-toast route.
 *
 * Loaded LAZILY, never with a top-level `import`: a plugin must keep loading when
 * one of its own files is unreachable. The degradation child in
 * `_harness.mjs:646-677` copies THIS FILE ALONE into an empty directory and
 * requires `apply()` not to throw; a static sibling import would turn "our own
 * directory is incomplete" into a loader failure for the whole profile.
 *
 * NOTE (rev-26): this is NO LONGER the rule the schema package follows. The DSH
 * 0.1.7 settings model needs `Config` at import time, so
 * `import z from '@deepseek-ai/schemastery'` IS static now and the degradation
 * child can no longer load this file at all — that is the trade-off recorded in
 * the file header. The sibling import below stays lazy because nothing forces it.
 */
const NATIVE_BRIDGE_MODULE = './native-bridge.js';

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

/*
 * rev-26: the schema-resolution machinery that used to live here — schemaAnchors,
 * pickSchema, schemaCandidates, loadSchemastery and loadSchemasteryAsync — was
 * DELETED with the DSH 0.1.7 migration. It existed only so this half could register
 * a namespace at runtime through `ctx.settings.register`, an API 0.1.7 removed. The
 * schema is now the module-level `Config` below, resolved by a static import; see
 * the file header for the robustness trade-off that forced.
 */

/**
 * Build the settings schema — this is what {@link Config} exports.
 *
 * WHY EVERY FIELD IS `.volatile()`: `settings.describe()` DROPS any entry whose
 * schema has no volatile node (`dsh-settings:122-131` `volatileForm`, applied at
 * `:417-419`), so a NON-volatile Config produces ZERO descriptors and the browser
 * form stays `unavailable` forever — a silently dead settings page. Volatility is
 * also what makes live editing work: a volatile-only config change is committed
 * into the running fiber's references instead of re-applying the plugin
 * (`cordis-plugin-loader:380-383`), so readers must call `.get()` at USE time and
 * must never cache the value.
 *
 * The value MUST be an object: the browser form decodes by validating
 * `typeof value === 'object'` (dsh-client-ui-settings:1107-1117), so a scalar or
 * array schema would leave the card permanently unavailable.
 *
 * @param z - the schemastery module (static import at the top of this file).
 * @returns `z.object({ enabled, volume, tone, custom, nativeToast })`, all volatile.
 */
export function buildSchema(z) {
  return z.object({
    enabled: z.boolean().default(DEFAULTS.enabled).volatile(),
    volume: z.number().min(0).max(100).default(DEFAULTS.volume).volatile(),
    // Built-in ids OR one imported file's id (`custom:<uuid>`). Still a closed set:
    // widening this to a bare string would let any typo into the user document and
    // turn a real validation failure into a silent fallback at play time.
    tone: z
      .union([...TONES.map((tone) => z.const(tone)), z.string().pattern(new RegExp(`^${CUSTOM_TONE_PREFIX}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`))])
      .default(DEFAULTS.tone)
      .volatile(),
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
      .default([])
      .volatile(),
    // rev-25: the native-toast switch, in THIS namespace on purpose — the page
    // that renders it is the existing 「通知提醒」 `settings.section` entry, so the
    // value has to travel with the namespace that page already binds. Default
    // OFF: with the switch off nothing writes the registry, starts a child
    // process, opens the backfill directory or raises a notification (§6).
    [NATIVE_TOAST_FIELD]: z.boolean().default(DEFAULTS[NATIVE_TOAST_FIELD]).volatile(),
  });
}

/**
 * THE SETTINGS FORM (DSH 0.1.7). The loader validates every `config:` written to
 * this entry against this schema, and `settings.describe()` serves the resulting
 * values to the browser under the entry id `SETTINGS_NS`. Declaring it on top of
 * {@link buildSchema} keeps ONE definition of the fields.
 *
 * The value MUST be an object: the browser form decodes by validating
 * `typeof value === 'object'` (dsh-client-ui-settings:1107-1117), so a scalar or
 * array schema would leave the card permanently unavailable.
 */
export const Config = buildSchema(z);



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
 * Claim the native-toast route, lazily.
 *
 * @param ctx - the plugin context.
 * @returns a promise of the bridge, or of null when the module is unreachable —
 *   it never rejects: a missing sibling degrades this feature, nothing else.
 */
function registerNativeToast(ctx) {
  let href;
  try {
    href = new URL(NATIVE_BRIDGE_MODULE, import.meta.url).href;
  } catch (error) {
    report(ctx, 'warn', `native toast route skipped: ${describeError(error)}`);
    return Promise.resolve(null);
  }
  return Promise.resolve()
    .then(() => import(href))
    .then(
      (module) => {
        if (module === null || typeof module.registerNativeToastRoutes !== 'function') {
          report(ctx, 'warn', `${NATIVE_BRIDGE_MODULE} loaded but exports no registerNativeToastRoutes(); the page cannot request a native notification`);
          return null;
        }
        return module.registerNativeToastRoutes(ctx) ?? null;
      },
      (error) => {
        report(ctx, 'warn', `native toast modules are unreachable (${describeError(error)}); the page cannot request a native notification`);
        return null;
      },
    );
}

/**
 * The live settings value the native-toast bridge reads.
 *
 * Under the old model this was the `settings.register` scope. That scope no
 * longer exists; the values now come from this entry's `Config`, which the loader
 * hands to {@link apply}. The bridge only ever calls `get()`
 * (lib/native-bridge.js:171), so this is a config-backed adapter exposing that one
 * method — deliberately NOT called a `settingsScope`, because it is not one.
 *
 * Every read unwraps the volatile references at USE time. That is not belt-and-
 * braces: a volatile-only config edit is committed into the running fiber's
 * references WITHOUT re-applying this plugin (cordis-plugin-loader:380-383), so
 * the bridge would keep answering with a stale value if this object cached them.
 * The reference identity is stable across such edits; only `.get()` moves.
 *
 * `DEFAULTS` fills any field a hand-written profile patch omitted. The loader
 * applies the schema's `.default()`s (verified on 0.1.7-rc.2), but a missing or
 * unreadable reference must still read as the documented default.
 *
 * @param config - this entry's Config, as passed to {@link apply}.
 * @returns `{ get() }` — the reader the bridge consumes.
 */
export function configReader(config) {
  return Object.freeze({
    get() {
      const value = { ...DEFAULTS };
      if (config === null || config === undefined) return value;
      for (const field of Object.keys(value)) {
        const reference = config[field];
        if (reference === null || reference === undefined) continue;
        try {
          value[field] = typeof reference.get === 'function' ? reference.get() : reference;
        } catch {
          /* an unreadable reference keeps the documented default */
        }
      }
      return value;
    },
  });
}

/**
 * Bind this entry's Config to the native-toast bridge.
 *
 * The bridge reads `nativeToast` on every request; until it is attached the
 * feature reads as OFF, which is the fail-closed default (§6). The bridge import
 * settles asynchronously, so this joins the two.
 *
 * @param ctx - the plugin context (for diagnostics).
 * @param bridgePromise - the promise returned by {@link registerNativeToast}.
 * @param reader - the config-backed reader from {@link configReader}, always defined.
 */
function attachNativeToastScope(ctx, bridgePromise, reader) {
  Promise.resolve(bridgePromise).then(
    (bridge) => {
      if (bridge === null || bridge === undefined) return;
      try {
        // `reader`, NOT a `settingsScope` — see {@link configReader}. A
        // ReferenceError here (the shape this line had while the parameter was
        // being renamed) is swallowed by the catch below and silently leaves the
        // switch off forever, with only a warn line to show for it. That is why
        // verify/settings-model.test.mjs asserts this warning was never emitted.
        bridge.setSettingsScope(reader);
      } catch (error) {
        report(ctx, 'warn', `native toast switch could not be bound: ${describeError(error)}`);
      }
    },
    (error) => report(ctx, 'warn', `native toast switch could not be bound: ${describeError(error)}`),
  );
}

/**
 * Declare the settings form and serve the routes this half owns. Never throws: a
 * plugin that cannot bind a preference must stay inert, not take the profile's
 * boot down with it.
 *
 * @param ctx - the plugin context.
 * @param config - this entry's validated `Config`. DSH applies the schema's
 *   `.default()`s, but a hand-written profile patch may omit the key entirely, so
 *   every read goes through `DEFAULTS` (see {@link configReader}).
 */
export function apply(ctx, config) {
  // Every route is registered BEFORE anything that can bail out. The audio route
  // must survive a re-apply so the files stored on a previous boot stay served;
  // the per-session route serves the overrides file, which has nothing to do with
  // the settings form; and the native-toast route is the ONLY way a toast can ever
  // be raised, so an early return that skipped it would silently disable the
  // feature after a reload (§12(a)).
  registerAudioRoutes(ctx);
  registerSessionRoutes(ctx);
  const nativeToast = registerNativeToast(ctx);

  try {
    // This bundle draws its OWN page under `settings.section`, so it must
    // suppress the form the settings shell would otherwise generate for this
    // entry: `auto` defaults to true (dsh-settings:365, and :426
    // `presentations.get(fiber)?.auto ?? true`), which would render a second,
    // auto-generated page beside the hand-drawn one.
    const settings = ctx === null || ctx === undefined ? undefined : ctx.settings;
    if (settings !== null && settings !== undefined && typeof settings.configure === 'function') {
      // `owner` defaults to the SETTINGS SERVICE's own fiber, not the caller's
      // (`dsh-settings:370` — `configure(presentation, owner = this.ctx.fiber)`),
      // while the policy map is keyed by the ENTRY's fiber (`:426`
      // `presentations.get(entry.fiber)`). Passing `ctx.fiber` explicitly is
      // therefore required, not a nicety; the official
      // `dsh-client-ui-settings-general/lib/index.js:4-12` does the same.
      ctx.effect(() => settings.configure({ auto: false }, ctx.fiber), 'approval-chime: settings page policy');
    } else {
      report(ctx, 'warn', 'settings service unavailable — the chime page will not be reachable (plugin stays inert)');
    }
  } catch (error) {
    report(ctx, 'warn', `settings page policy could not be registered: ${describeError(error)}`);
  }

  attachNativeToastScope(ctx, nativeToast, configReader(config));
}
