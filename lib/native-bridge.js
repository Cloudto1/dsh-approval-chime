/**
 * The HTTP bridge for dsh-approval-chime's native toast (rev-25).
 *
 * This file IMPLEMENTS `docs/native-toast-接口冻结.md` §5 (the route contract),
 * §7 (token/tag lifecycle) and §8 (the fail-closed matrix). It owns the ONE
 * prefix route the feature claims on the profile's web server, the in-memory
 * token ledger, and every status code the page froze.
 *
 * WHY A SEPARATE FILE FROM `lib/native-toast.js`: that file is the platform
 * (WinRT via PowerShell, the backfill files, the marker); this file is the wire.
 * Keeping them apart is what makes the two hard criteria checkable — the wire can
 * be driven with a fake platform (no process, no filesystem), and the platform
 * can be tested without a server. Neither file subscribes to anything: the ONLY
 * way a toast is ever raised is a request arriving here (hard criterion 2,
 * §12(a)). There is no timer that raises, no approval-event listener, and no
 * listener on the client's pending-interaction registry anywhere in the host half.
 * The two files also name none of those APIs, so a plain text check stays a valid
 * check (the same convention `lib/client.js:71-74` uses for the event chain).
 *
 * TRIGGER INVARIANT (asserted by `verify/native-toast.test.mjs`): importing this
 * module and registering the route start nothing at all. Off the switch, a
 * request is answered `skipped/disabled` without touching the marker file, the
 * backfill directory, or a child process.
 */

import {
  NATIVE_TOAST_AUMID,
  NATIVE_TOAST_ANSWER_ALLOW,
  NATIVE_TOAST_ANSWER_DENY,
  NATIVE_TOAST_BODY_LIMIT,
  NATIVE_TOAST_FIELD,
  NATIVE_TOAST_GROUP,
  NATIVE_TOAST_ROUTE,
  NATIVE_TOAST_TOKEN_PATTERN,
  NATIVE_TOAST_TTL_MS,
  createNativeToastPlatform,
  describeError,
  nativeToastTagOf,
} from './native-toast.js';

/** How often the backfill directory may be swept while the feature is on (§4, throttled). */
export const NATIVE_TOAST_SWEEP_INTERVAL_MS = 60000;

/** Most tokens one `revoke` call may carry (§5). */
export const NATIVE_TOAST_REVOKE_LIMIT = 32;

/** The one error text an unsupported method gets, shared with the other two routes. */
function methodError(method) {
  return `method ${method} is not supported on this route`;
}

/** One JSON answer. Every response goes through here, so none can hang. */
function respondJson(res, status, body, headOnly) {
  try {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(headOnly === true ? undefined : JSON.stringify(body));
  } catch {
    /* the socket may already be gone; there is nothing left to answer */
  }
}

/** Methods are case-insensitive on the wire; a missing one reads as GET, like Node does. */
function readMethod(req) {
  const raw = req === null || req === undefined ? undefined : req.method;
  return typeof raw === 'string' && raw.length > 0 ? raw.toUpperCase() : 'GET';
}

/** Parse `req.url` against a dummy base, exactly like the other two routes. */
function readUrl(req) {
  const raw = req === null || req === undefined ? undefined : req.url;
  return new URL(typeof raw === 'string' && raw.length > 0 ? raw : '/', 'http://localhost');
}

/**
 * Read one JSON body, bounded (§5).
 *
 * The whole body is drained even when it is already over the cap: answering
 * before the sender finished is what turns a 413 into an ECONNRESET
 * (`docs/rev4-独立验证.md` D1, and `lib/index.js` does the same for uploads).
 *
 * @param req - the incoming request.
 * @param limit - largest accepted body in bytes.
 * @returns `{ ok, tooLarge, value, error }`.
 */
function readJsonBody(req, limit) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (chunk === null || chunk === undefined) return;
      // Chunks are Buffers on a real socket; the self-test's fake request hands
      // back strings. Same guard as `lib/index.js:1004`, so both shapes work.
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      size += bytes.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(bytes);
    });
    req.on('end', () => {
      if (tooLarge === true) {
        resolve({ ok: false, tooLarge: true, value: null, error: 'too large' });
        return;
      }
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.trim().length === 0) {
        resolve({ ok: false, tooLarge: false, value: null, error: 'empty body' });
        return;
      }
      try {
        resolve({ ok: true, tooLarge: false, value: JSON.parse(text), error: null });
      } catch (error) {
        resolve({ ok: false, tooLarge: false, value: null, error: describeError(error) });
      }
    });
    req.on('error', (error) => resolve({ ok: false, tooLarge: false, value: null, error: describeError(error) }));
  });
}

/**
 * Build the bridge.
 *
 * @param options - `{ platform, platformOptions, log, now, portSource }`.
 *   `platform` is injectable so the self-test can run the whole wire contract
 *   with no process and no real directory; `portSource` is the web server's
 *   listening port (`webServer.port`), needed for the activation URI (§5.1).
 * @returns the bridge handle.
 */
export function createNativeToastBridge(options = {}) {
  const platform = options.platform ?? createNativeToastPlatform(options.platformOptions ?? {});
  const log = typeof options.log === 'function' ? options.log : () => {};
  const now = typeof options.now === 'function' ? options.now : () => Date.now();

  /** The listening port the browser is on; 0 means "not known yet" (never a URI). */
  let portSource = typeof options.portSource === 'function' ? options.portSource : () => 0;

  /**
   * The live settings reader for the namespace that carries `nativeToast` (§6).
   *
   * NOT a `SettingsScope`: DSH 0.1.7 removed that service, and this bridge only
   * ever calls `get()` on whatever it is handed (see `isEnabled` below). The Host
   * half passes a config-backed adapter, which re-reads the entry's volatile
   * references on every call — a volatile-only edit is committed into those
   * references WITHOUT re-applying the plugin, so nothing here may cache a value.
   */
  let settingsScope = null;

  /** Live tokens: what this Host raised and has not consumed yet (§7). */
  const tokens = new Map();
  /** Tokens whose answer was already handed over, kept only to answer `consumed`/409 (§5.2, §5.3). */
  const consumed = new Map();

  const counters = { raised: 0, skipped: 0, answered: 0, recorded: 0, refused: 0, revoked: 0, consumed: 0 };

  let lastSweepAt = null;

  /**
   * Attach the live settings reader.
   *
   * Until this happens the feature reads as OFF, which is the fail-closed default
   * (§6): a bridge created at route-registration time answers `disabled` even if
   * the namespace is never registered at all.
   *
   * @param scope - any object with a `get()` returning the settings value; the
   *   Host half hands over the one from `lib/index.js:configReader`.
   */
  function setSettingsScope(scope) {
    settingsScope = scope === null || scope === undefined ? null : scope;
  }

  /** The current switch value. Anything but a literal `true` is off. */
  function isEnabled() {
    if (settingsScope === null || typeof settingsScope.get !== 'function') return false;
    try {
      const value = settingsScope.get();
      if (value === null || value === undefined) return false;
      return value[NATIVE_TOAST_FIELD] === true;
    } catch (error) {
      log('warn', `native toast setting is unreadable (${describeError(error)}); treating it as off`);
      return false;
    }
  }

  /** Forget tokens and consumed marks whose TTL is over (§4). */
  function prune() {
    const at = now();
    for (const [token, record] of [...tokens]) if (record.expiresAt <= at) tokens.delete(token);
    for (const [token, expiresAt] of [...consumed]) if (expiresAt <= at) consumed.delete(token);
  }

  /**
   * Token housekeeping, plus the throttled directory sweep of §4.
   *
   * The sweep is gated on the switch on purpose: when the feature is off this
   * must not read the backfill directory at all (§6.3 "off = zero side effects").
   */
  async function housekeeping() {
    prune();
    if (isEnabled() !== true) return;
    const at = now();
    // `null` rather than 0: with an injected clock a `0 - 0 < interval` comparison
    // would throttle the very first sweep forever.
    if (lastSweepAt !== null && at - lastSweepAt < NATIVE_TOAST_SWEEP_INTERVAL_MS) return;
    lastSweepAt = at;
    try {
      await platform.sweep();
    } catch (error) {
      log('warn', `native toast sweep failed: ${describeError(error)}`);
    }
  }

  /** The listening port, or 0 when the server has not exposed one. */
  function listeningPort() {
    try {
      const port = portSource();
      return typeof port === 'number' && Number.isInteger(port) && port > 0 && port <= 65535 ? port : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Take an answer that is already on disk, hand it over exactly once (§5.2).
   *
   * The answer FILE is the delivery layer and the only authority (captain's F1
   * ruling, 2026-09-24): the token ledger is just the write gate for
   * `POST /answer` and is lost on restart, so a file that was written before a
   * restart is still delivered. What the ledger does NOT do is authorize anything
   * by itself — it is only consulted when an answer is *recorded*, never when one
   * is handed out.
   *
   * `consumed` is marked BEFORE the read and rolled back when the read finds
   * nothing, so two concurrent callers (a poll and a revoke, or two tabs) can never
   * both hand the same answer over, and a token with no answer keeps reading as
   * `pending`. The platform's own rename-based claim makes the file itself
   * single-winner as well; either guard alone would do, both are cheap.
   *
   * @param token - a validated token.
   * @returns the answer string, or null when there is nothing to hand over.
   */
  async function consumeAnswer(token) {
    if (consumed.has(token)) return null;
    consumed.set(token, now() + NATIVE_TOAST_TTL_MS);
    const found = await platform.readAnswer(token);
    if (found === null) {
      // Nothing to deliver: undo the mark so the token keeps reading as `pending`.
      consumed.delete(token);
      return null;
    }
    const record = tokens.get(token);
    tokens.delete(token);
    consumed.set(token, now() + NATIVE_TOAST_TTL_MS);
    counters.answered += 1;
    if (record !== undefined) {
      Promise.resolve(platform.dismiss(record.tag)).then(
        (result) => {
          if (result !== null && result !== undefined && result.ok !== true) log('warn', `native toast was not removed: ${String(result.detail)}`);
        },
        (error) => log('warn', `native toast dismiss threw: ${describeError(error)}`),
      );
    }
    return found.answer;
  }

  /* ------------------------------------------------------------------ handlers */

  /** `GET|HEAD /` — which stage the native layer is in (§5). */
  async function handleStatus(res, headOnly) {
    // Off is answered without reading the marker: the disabled arm must touch
    // nothing at all (§6.3).
    const state = isEnabled() === true ? await platform.stage() : 'disabled';
    respondJson(res, 200, { ok: true, state }, headOnly);
  }

  /** `POST /` — raise one toast for one approval (§5.1). */
  async function handleRaise(req, res) {
    // t10 T1-F03 · the frozen gate order (§5.1; the page pins it at §328 and §334-337): the
    // switch, then the installation, THEN the body. This route used to parse the body first, so
    // while the feature was off a broken body answered 400 while its three sibling routes
    // answered "skipped/disabled" — the one answer a client cannot act on. `refusedWhileDisabled`
    // is the shared off-switch gate, and putting it first also keeps "off = read nothing".
    if (refusedWhileDisabled(res)) return;
    const stage = await platform.stage();
    if (stage !== 'ready') {
      counters.skipped += 1;
      respondJson(res, 200, { ok: true, state: 'skipped', reason: stage });
      return;
    }
    const body = await readJsonBody(req, NATIVE_TOAST_BODY_LIMIT);
    if (body.tooLarge === true) {
      respondJson(res, 413, { ok: false, error: 'the request body is too large' });
      return;
    }
    if (body.ok !== true) {
      respondJson(res, 400, { ok: false, error: `the request body is not valid JSON (${body.error})` });
      return;
    }
    const value = body.value;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      respondJson(res, 400, { ok: false, error: 'the request body must be a JSON object' });
      return;
    }
    const token = typeof value.token === 'string' ? value.token : '';
    if (NATIVE_TOAST_TOKEN_PATTERN.test(token) !== true) {
      respondJson(res, 400, { ok: false, error: 'token must be 32 lowercase hex characters' });
      return;
    }
    const live = tokens.get(token);
    if (live !== undefined && live.expiresAt > now()) {
      // A duplicate raise for a token that is already on screen: same answer, no second toast.
      respondJson(res, 200, { ok: true, state: 'raised', tag: live.tag, duplicate: true });
      return;
    }
    const port = listeningPort();
    if (port === 0) {
      counters.skipped += 1;
      respondJson(res, 200, { ok: true, state: 'skipped', reason: 'raise-failed', detail: 'no listening port' });
      return;
    }
    // t10 T1-F04 · register the token BEFORE awaiting the spawn. `platform.raise` starts a real
    // PowerShell child and waits up to 5 s for it, and with the ledger written only AFTER that
    // await a second request for the same token inside the window found no entry and spawned a
    // SECOND toast for one approval. The provisional entry carries the tag the raise is about to
    // use (`nativeToastTagOf`), so even a duplicate answered inside that window gets the real
    // tag; a raise that fails removes the entry again.
    const provisional = {
      key: typeof value.key === 'string' ? value.key : '',
      sessionId: typeof value.sessionId === 'string' ? value.sessionId : '',
      tag: nativeToastTagOf(token),
      group: NATIVE_TOAST_GROUP,
      createdAt: now(),
      expiresAt: now() + NATIVE_TOAST_TTL_MS,
    };
    tokens.set(token, provisional);
    const raised = await platform.raise({
      token,
      port,
      toolName: typeof value.toolName === 'string' ? value.toolName : '',
      reason: typeof value.reason === 'string' ? value.reason : undefined,
    });
    if (raised.state !== 'raised') {
      tokens.delete(token);
      counters.skipped += 1;
      respondJson(res, 200, { ok: true, state: 'skipped', reason: raised.reason, detail: raised.detail });
      return;
    }
    provisional.tag = raised.tag;
    counters.raised += 1;
    respondJson(res, 200, { ok: true, state: 'raised', tag: raised.tag });
  }

  /**
   * The off-switch gate every handler except the read-only status route shares.
   *
   * Same shape as the raise path's first gate (§5.1) and the same answer: when the
   * feature is off, the route must be inert — no answer file read, no dismissal, no
   * directory access. It sits BEFORE body parsing on purpose, because "inert" also
   * means "never read an attacker-sized body for a feature that is switched off".
   *
   * @param res - the response to own.
   * @returns true when the request was answered and the caller must stop.
   */
  function refusedWhileDisabled(res) {
    if (isEnabled() === true) return false;
    counters.skipped += 1;
    respondJson(res, 200, { ok: true, state: 'skipped', reason: 'disabled' });
    return true;
  }

  /** `GET /answer?token=` — hand the client an answer, once (§5.2). */
  async function handlePoll(url, res) {
    if (refusedWhileDisabled(res)) return;
    const token = url.searchParams.get('token') ?? '';
    if (NATIVE_TOAST_TOKEN_PATTERN.test(token) !== true) {
      respondJson(res, 400, { ok: false, error: 'token must be 32 lowercase hex characters' });
      return;
    }
    const answer = await consumeAnswer(token);
    if (answer !== null) {
      respondJson(res, 200, { ok: true, state: 'answered', answer });
      return;
    }
    if (consumed.has(token)) {
      counters.consumed += 1;
      respondJson(res, 200, { ok: true, state: 'consumed' });
      return;
    }
    if (tokens.has(token)) {
      respondJson(res, 200, { ok: true, state: 'pending' });
      return;
    }
    // Unknown, never issued, or past its TTL — and every one of those reads the same.
    respondJson(res, 404, { ok: false, error: 'unknown token' });
  }

  /** `POST /answer` — the activator records what the user clicked (§5.3). */
  async function handleRecord(req, res) {
    if (refusedWhileDisabled(res)) return;
    const body = await readJsonBody(req, NATIVE_TOAST_BODY_LIMIT);
    if (body.tooLarge === true) {
      respondJson(res, 413, { ok: false, error: 'the request body is too large' });
      return;
    }
    if (body.ok !== true) {
      respondJson(res, 400, { ok: false, error: `the request body is not valid JSON (${body.error})` });
      return;
    }
    const value = body.value;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      respondJson(res, 400, { ok: false, error: 'the request body must be a JSON object' });
      return;
    }
    const token = typeof value.token === 'string' ? value.token : '';
    if (NATIVE_TOAST_TOKEN_PATTERN.test(token) !== true) {
      respondJson(res, 400, { ok: false, error: 'token must be 32 lowercase hex characters' });
      return;
    }
    const answer = value.answer;
    if (answer !== NATIVE_TOAST_ANSWER_ALLOW && answer !== NATIVE_TOAST_ANSWER_DENY) {
      respondJson(res, 400, { ok: false, error: 'answer must be allowed-once or rejected' });
      return;
    }
    const live = tokens.get(token);
    const known = (live !== undefined && live.expiresAt > now()) || consumed.has(token);
    if (known !== true) {
      counters.refused += 1;
      respondJson(res, 404, { ok: false, error: 'unknown token' });
      return;
    }
    // A second click must not replace the first answer, and must not overwrite a
    // file the client has not read yet (§8 "重复答案"). Sweep first: the frozen
    // page lists "before a write" as one of the three times housekeeping runs.
    await platform.sweep();
    // `answerExists` is an OPTIMIZATION (it saves a pointless write), NOT the
    // correctness basis: two same-tick clicks can both pass this check and the
    // answer is still safe, because the write itself publishes with `link` and the
    // loser gets EEXIST → `exists` → 409 (see `writeAnswer`).
    if (consumed.has(token) || platform.answerExists(token) === true) {
      counters.refused += 1;
      respondJson(res, 409, { ok: false, state: 'already-answered' });
      return;
    }
    const written = await platform.writeAnswer(token, answer);
    if (written.ok !== true) {
      if (written.reason === 'exists') {
        counters.refused += 1;
        respondJson(res, 409, { ok: false, state: 'already-answered' });
        return;
      }
      respondJson(res, 500, { ok: false, error: String(written.reason) });
      return;
    }
    counters.recorded += 1;
    respondJson(res, 200, { ok: true, state: 'recorded' });
  }

  /** `POST /revoke` — the window is back in front, drop the toasts (§7, §12(c)). */
  async function handleRevoke(req, res) {
    if (refusedWhileDisabled(res)) return;
    const body = await readJsonBody(req, NATIVE_TOAST_BODY_LIMIT);
    if (body.tooLarge === true) {
      respondJson(res, 413, { ok: false, error: 'the request body is too large' });
      return;
    }
    if (body.ok !== true) {
      respondJson(res, 400, { ok: false, error: `the request body is not valid JSON (${body.error})` });
      return;
    }
    const value = body.value;
    if (value === null || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.tokens)) {
      respondJson(res, 400, { ok: false, error: 'the request body must be { tokens: [...] }' });
      return;
    }
    const list = value.tokens;
    if (list.length > NATIVE_TOAST_REVOKE_LIMIT) {
      respondJson(res, 400, { ok: false, error: `at most ${String(NATIVE_TOAST_REVOKE_LIMIT)} tokens per call` });
      return;
    }
    for (const token of list) {
      if (typeof token !== 'string' || NATIVE_TOAST_TOKEN_PATTERN.test(token) !== true) {
        respondJson(res, 400, { ok: false, error: 'every token must be 32 lowercase hex characters' });
        return;
      }
    }
    const results = [];
    for (const token of list) {
      // Revoke doubles as the last read: an answer that arrived while the window
      // was still hidden must reach the client, not be thrown away with the toast.
      const answer = await consumeAnswer(token);
      if (answer !== null) {
        results.push({ token, state: 'answered', answer });
        continue;
      }
      if (consumed.has(token)) {
        results.push({ token, state: 'consumed' });
        continue;
      }
      const live = tokens.get(token);
      if (live === undefined || live.expiresAt <= now()) {
        results.push({ token, state: 'unknown' });
        continue;
      }
      tokens.delete(token);
      counters.revoked += 1;
      Promise.resolve(platform.dismiss(live.tag)).catch((error) => log('warn', `native toast dismiss threw: ${describeError(error)}`));
      results.push({ token, state: 'pending' });
    }
    respondJson(res, 200, { ok: true, results });
  }

  /**
   * The one handler behind the prefix route. It never throws into the server.
   *
   * @param req - the incoming request.
   * @param res - the response to own.
   */
  async function handler(req, res) {
    try {
      const method = readMethod(req);
      const url = readUrl(req);
      const rest = url.pathname.slice(NATIVE_TOAST_ROUTE.length).replace(/^\/+/, '').replace(/\/+$/, '');
      await housekeeping();
      if (rest === '') {
        if (method === 'GET' || method === 'HEAD') {
          await handleStatus(res, method === 'HEAD');
          return;
        }
        if (method === 'POST') {
          await handleRaise(req, res);
          return;
        }
        respondJson(res, 405, { ok: false, error: methodError(method) });
        return;
      }
      if (rest === 'answer') {
        if (method === 'GET') {
          await handlePoll(url, res);
          return;
        }
        if (method === 'POST') {
          await handleRecord(req, res);
          return;
        }
        // HEAD is refused on purpose: a HEAD must never consume a one-shot answer.
        respondJson(res, 405, { ok: false, error: methodError(method) });
        return;
      }
      if (rest === 'revoke') {
        if (method === 'POST') {
          await handleRevoke(req, res);
          return;
        }
        respondJson(res, 405, { ok: false, error: methodError(method) });
        return;
      }
      respondJson(res, 404, { ok: false, error: `unknown path ${url.pathname}` });
    } catch (error) {
      log('warn', `native toast route failed: ${describeError(error)}`);
      respondJson(res, 500, { ok: false, error: describeError(error) });
    }
  }

  return Object.freeze({
    handler,
    setSettingsScope,
    setPortSource(source) {
      portSource = typeof source === 'function' ? source : () => 0;
    },
    isEnabled,
    tokens,
    consumed,
    counters,
    platform,
  });
}

/** One diagnostic line, through the Host logger when there is one. */
function report(ctx, level, message) {
  const line = `[dsh-approval-chime] ${message}`;
  try {
    const logger = ctx === null || ctx === undefined ? undefined : ctx.logger;
    if (logger !== null && logger !== undefined && typeof logger[level] === 'function') {
      logger[level](line);
      return;
    }
  } catch {
    /* a broken logger must not break a route */
  }
  try {
    if (level === 'warn' || level === 'error') console.warn(line);
    else if (level === 'info') console.info(line);
  } catch {
    /* console can be absent too */
  }
}

/**
 * Register the native-toast route on the profile's web server, exactly the way
 * the audio and per-session routes are claimed (`lib/index.js:652` and
 * `lib/index.js:1139`).
 *
 * `webServer` is probed OPTIONALLY on purpose: without a web server the plugin
 * must stay inert instead of leaving this entry pending forever — a plugin may
 * never break `dsh web` boot.
 *
 * @param ctx - the plugin context.
 * @param options - `{ bridge, platformOptions }`; `bridge` is injectable for tests.
 * @returns the bridge (so `apply` can attach the settings scope), never null.
 */
export function registerNativeToastRoutes(ctx, options = {}) {
  const bridge =
    options.bridge ??
    createNativeToastBridge({
      platformOptions: options.platformOptions ?? {},
      log: (level, message) => report(ctx, level, message),
    });
  const register = (webCtx, server) => {
    try {
      // The server is passed in rather than re-read from `webCtx`: the two
      // accessors are not interchangeable on every context shape.
      webCtx.effect(
        () =>
          server.register({
            kind: 'prefix',
            path: NATIVE_TOAST_ROUTE,
            handler: (req, res) => bridge.handler(req, res),
          }),
        'approval-chime: native toast route',
      );
      bridge.setPortSource(() => server.port);
      report(ctx, 'info', `native toast route registered at ${NATIVE_TOAST_ROUTE} (aumid ${NATIVE_TOAST_AUMID})`);
    } catch (error) {
      report(ctx, 'warn', `native toast route registration failed: ${describeError(error)}`);
    }
  };
  try {
    // t10 T1-F07 #8 · the third of the three copies of this probe-and-degrade block (the other
    // two are in `lib/index.js`, for the audio and per-session routes). They are deliberately
    // not shared: this module already imports `./native-toast.js`, and index.js must not import
    // its siblings at all. Change all three together.
    let webServer;
    try {
      webServer = typeof ctx.get === 'function' ? ctx.get('webServer') : undefined;
    } catch {
      webServer = undefined;
    }
    if (webServer !== undefined && webServer !== null) {
      register(ctx, webServer);
      return bridge;
    }
    if (typeof ctx.inject === 'function') {
      ctx.inject(['webServer'], (webCtx) => register(webCtx, webCtx.webServer));
      return bridge;
    }
    if (ctx.webServer !== undefined && ctx.webServer !== null) {
      register(ctx, ctx.webServer);
      return bridge;
    }
    report(ctx, 'warn', 'web server unavailable — the native toast cannot be requested from the page');
  } catch (error) {
    report(ctx, 'warn', `native toast route skipped: ${describeError(error)}`);
  }
  return bridge;
}
