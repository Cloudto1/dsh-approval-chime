/**
 * Native Windows toast layer for dsh-approval-chime (rev-25).
 *
 * This file IMPLEMENTS `docs/native-toast-接口冻结.md`. Every literal below is
 * copied from that page (§0/§1/§4/§5/§7/§10); when this file and the page ever
 * disagree, the page is right and this file is the bug. The page is frozen — a
 * contract change is a captain decision, not an edit here.
 *
 * WHAT THIS FILE IS: the platform layer only.
 *   - the frozen constants (AUMID, app name, scheme, route, TTL, tag/group),
 *   - the frozen toast XML (§10),
 *   - the one-shot answer files under `<home>/approval-chime/native-toast/` (§4),
 *   - the PowerShell child that raises / dismisses a toast (§5.1, §7, §10),
 *   - the install-marker reader that decides "is the native layer installed" (§5.4).
 * It owns NO route and NO trigger: `lib/native-bridge.js` turns HTTP requests
 * into calls here and nothing else calls it. The Host must have **no
 * self-triggering path** — no approval-event subscription, no listener on the
 * client's pending-interaction registry, no timer that raises anything. The only
 * thing that can ever raise a toast is one request from the client half (§12(a)).
 *
 * WHY THE WORK LIVES IN POWERSHELL SCRIPTS: a Windows toast needs WinRT
 * (`Windows.UI.Notifications`), which Node cannot reach without a native module
 * or a dependency — both forbidden this round. The scripts under
 * `deploy/native-toast/` are therefore DATA-FREE wrappers around one WinRT call
 * each; every string that matters (title, body, button copy, token, port) is
 * passed to them as a file or an argument, never compiled into them. They are
 * also ASCII-only on purpose: Windows PowerShell 5.1 decodes a BOM-less UTF-8
 * script as ANSI, so a Chinese literal inside a `.ps1` becomes mojibake and the
 * toast XML then fails `LoadXml` with `0xC00CE56D` (measured; §0 of the page).
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { link, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The product AUMID the toast is raised under (§0). Never a system AUMID. */
export const NATIVE_TOAST_AUMID = 'Dsh.ApprovalChime.NativeToast';

/** What the notification header shows (§1.2). Fixed, not localized (§15.6). */
export const NATIVE_TOAST_APP_NAME = 'DSH 通知提醒';

/** The `dsh-approval-chime:` protocol the toast buttons activate (§0, §2). */
export const NATIVE_TOAST_SCHEME = 'dsh-approval-chime';

/** The one prefix route this feature owns on the profile's web server (§0, §5). */
export const NATIVE_TOAST_ROUTE = '/api/approval-chime/native-toast';

/** The settings field, in the EXISTING `approval-chime` namespace (§0, §6). */
export const NATIVE_TOAST_FIELD = 'nativeToast';

/** Toast `group`; the same string is the protocol scheme and the route prefix owner (§0). */
export const NATIVE_TOAST_GROUP = 'dsh-approval-chime';

/** One TTL for the token, the toast and the answer file: 10 minutes (§0, §4). */
export const NATIVE_TOAST_TTL_MS = 600000;

/**
 * Client poll interval (§0). The Host half never schedules this — the page does, and it keeps
 * its OWN copy of the same value (`lib/client.js`). t10 T1-F07 #6 · this export stays because
 * two readers outside the host half depend on it: the page's contract and the frozen suite
 * (`verify/native-toast.test.mjs` reads it). It is not a Host-side knob.
 */
export const NATIVE_TOAST_POLL_MS = 1000;

/** Largest accepted request body (§5). */
export const NATIVE_TOAST_BODY_LIMIT = 16384;

/** How long the Host waits for the raise child before calling it failed (§5.1). */
export const NATIVE_TOAST_RAISE_TIMEOUT_MS = 5000;

/** How long the Host waits for a best-effort dismiss (§7). */
export const NATIVE_TOAST_DISMISS_TIMEOUT_MS = 5000;

/**
 * Longest `toolName`/`reason` text that reaches the toast, in characters.
 *
 * The frozen page bounds the toast's second line to ONE line of text but does not
 * name a number; this is the implementation's bound, and
 * `verify/native-toast.test.mjs` pins it. Truncation is character-based (never
 * byte-based) so a Chinese reason cannot be cut mid-codepoint.
 */
export const NATIVE_TOAST_TEXT_LIMIT = 200;

/** The install marker filename inside the backfill directory (§4, §5.4). */
export const NATIVE_TOAST_MARKER = 'installed.json';

/** A token is exactly 32 lowercase hex characters (§4). Case matters, like every id here. */
export const NATIVE_TOAST_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

/** Every token-named file in the backfill directory matches this. */
const ANSWER_FILE_PATTERN = /^[0-9a-f]{32}\.json$/;

/** Toast first text line (§0). */
export const NATIVE_TOAST_TITLE = 'DSH 需要你的授权';

/** The two button captions, exactly as the user asked for them (§0). */
export const NATIVE_TOAST_BUTTON_ALLOW = '接受';
export const NATIVE_TOAST_BUTTON_DENY = '拒绝';

/** The two outcomes this feature can return, and the page's own vocabulary (§0, §5). */
export const NATIVE_TOAST_ANSWER_ALLOW = 'allowed-once';
export const NATIVE_TOAST_ANSWER_DENY = 'rejected';

/** The marker's `version`, and the only marker version accepted (§5.4). */
export const NATIVE_TOAST_MARKER_VERSION = 1;

/** The answer file's `version`, and the only one accepted (§4). */
export const NATIVE_TOAST_ANSWER_VERSION = 1;

/**
 * One line of diagnostic text from anything thrown.
 *
 * t10 T1-F07 #9 · kept in sync BY HAND with the copy in `lib/index.js` (which deliberately
 * does not import its siblings). `lib/native-bridge.js` imports THIS one. The two bodies are
 * identical today; a change to one belongs in the other.
 */
export function describeError(error) {
  if (error === null || error === undefined) return 'unknown error';
  if (typeof error === 'string') return error;
  const message = error.message;
  return typeof message === 'string' && message.length > 0 ? message : String(error);
}

/* --------------------------------------------------------------- constants & paths */

/**
 * The DSH home the Host uses, by the platform's own rule
 * (`@deepseek-ai/dsh-home-paths`: `$DSH_HOME`, else `~/.dsh`). The plugin does not
 * import that package — a `link:`-mounted plugin cannot resolve its bare
 * specifier (the schemastery lesson, `docs/契约调研.md` §B.6) — so the rule is
 * restated here, once, and the same rule is what `lib/index.js` uses for
 * `sessions.json`. A whitespace-only value counts as UNSET, exactly as the platform
 * reads it: without the `trim()` this half answered "the DSH home is a few spaces"
 * while the Host answered "~/.dsh", and the native-toast marker was looked for in a
 * directory that never existed (V-6 / T1-F02).
 *
 * @param env - environment to read `DSH_HOME` from.
 * @param fallbackHome - the user's home directory.
 * @returns the absolute DSH home.
 */
export function nativeToastHome(env = process.env, fallbackHome = homedir()) {
  const configured = env === null || env === undefined ? undefined : env.DSH_HOME;
  return typeof configured === 'string' && configured.trim().length > 0 ? configured : join(fallbackHome, '.dsh');
}

/** `<home>/approval-chime/native-toast/` — the backfill directory (§4). */
export function nativeToastDirectory(home) {
  return join(home, 'approval-chime', 'native-toast');
}

/** `<dir>/installed.json` — the install marker (§5.4). */
export function nativeToastMarkerPath(home) {
  return join(nativeToastDirectory(home), NATIVE_TOAST_MARKER);
}

/** `<dir>/<token>.json` — one answer file (§4). */
export function nativeToastAnswerPath(home, token) {
  return join(nativeToastDirectory(home), `${token}.json`);
}

/** `<dir>/raise-<token>.xml` — the toast XML handed to `raise.ps1` (§5.1). */
export function nativeToastXmlPath(home, token) {
  return join(nativeToastDirectory(home), `raise-${token}.xml`);
}

/** `appr-` + the first 11 characters of the token = exactly 16 (§7). */
export function nativeToastTagOf(token) {
  return `appr-${String(token).slice(0, 11)}`;
}

/** A script under `deploy/native-toast/`, resolved from THIS file (§3.1, §5.1). */
export function nativeToastScriptPath(name) {
  return fileURLToPath(new URL(`../deploy/native-toast/${name}`, import.meta.url));
}

/** The Windows PowerShell 5.1 interpreter the frozen page pins (§0). */
export function windowsPowerShellPath(env = process.env) {
  const root = typeof env?.SystemRoot === 'string' && env.SystemRoot.length > 0 ? env.SystemRoot : 'C:\\Windows';
  return join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/** `wscript.exe` — the GUI-subsystem host the protocol entry uses (§2.1). */
export function windowsWscriptPath(env = process.env) {
  const root = typeof env?.SystemRoot === 'string' && env.SystemRoot.length > 0 ? env.SystemRoot : 'C:\\Windows';
  return join(root, 'System32', 'wscript.exe');
}

/* ------------------------------------------------------------------ toast XML */

/** Escape one value for XML text/attribute use. Unknown data never breaks the toast. */
export function escapeXmlText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Cut to `NATIVE_TOAST_TEXT_LIMIT` CODE POINTS (never bytes) and drop control characters.
 *
 * t10 T1-F05 · by code points, exactly as `lib/index.js` bounds an uploaded file's name
 * (`displayName()`). A plain `.slice()` counts UTF-16 units, so cutting inside a surrogate
 * pair kept a lone surrogate and the toast rendered a "�" (repro: `repro/04`).
 */
export function truncateToastText(value) {
  const text = typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
  // Control characters (newlines, tabs, NUL) are not renderable in one toast line.
  const cleaned = text.replace(/[\u0000-\u001f\u007f]/g, ' ');
  const points = Array.from(cleaned);
  return points.length > NATIVE_TOAST_TEXT_LIMIT ? points.slice(0, NATIVE_TOAST_TEXT_LIMIT).join('') : cleaned;
}

/**
 * The toast's second text line (§0): the asker's `reason` when it supplied one,
 * otherwise the same escalation sentence the in-page approval panel shows
 * (`dsh-client-ui-approval/lib/client.js` locale `escalation`).
 *
 * @param request - `{ toolName, reason }` as sent by the client half.
 * @returns the exact second line.
 */
export function nativeToastSecondLine(request) {
  const reason = request === null || request === undefined ? undefined : request.reason;
  const trimmed = typeof reason === 'string' ? truncateToastText(reason).trim() : '';
  if (trimmed.length > 0) return trimmed;
  const toolName = request === null || request === undefined ? undefined : request.toolName;
  const name = truncateToastText(toolName).trim();
  return `工具 ${name.length > 0 ? name : 'unknown'} 请求越权执行`;
}

/**
 * The toast XML, byte-for-byte as frozen in §10.
 *
 * Three things are load-bearing and asserted by `verify/native-toast.test.mjs`:
 * exactly two `<action>` elements with `activationType="protocol"` whose
 * `arguments` are the frozen URI shape, exactly one `<audio silent="true"/>`
 * (this feature must not add a second sound to one approval), and NO `scenario` /
 * NO `launch` on `<toast>` (the body click must stay inert, §15.5). `<toast>` must
 * not carry an `activationType` attribute either — the schema rejects it and
 * `LoadXml` throws.
 *
 * @param request - `{ token, port, toolName, reason }`.
 * @returns the XML string, UTF-8, no BOM.
 */
export function buildNativeToastXml(request) {
  const token = String(request.token);
  const port = String(request.port);
  const first = escapeXmlText(NATIVE_TOAST_TITLE);
  const second = escapeXmlText(nativeToastSecondLine(request));
  const allow = escapeXmlText(`${NATIVE_TOAST_SCHEME}://answer/?t=${token}&a=allow&p=${port}`);
  const deny = escapeXmlText(`${NATIVE_TOAST_SCHEME}://answer/?t=${token}&a=reject&p=${port}`);
  return (
    // `<audio silent="true"/>` is what keeps this feature from adding a SECOND
    // sound to one approval: without it Windows plays its own notification sound
    // on top of the plugin's chime. Measured on this machine (25H2): the element
    // is accepted by LoadXml and Show, the toast still lands in Action Center, and
    // the stored content still carries the element. All three child orders are
    // accepted; the frozen block puts it directly after the opening tag.
    '<toast useButtonStyle="true"><audio silent="true"/>' +
    `<visual><binding template="ToastGeneric"><text>${first}</text><text>${second}</text></binding></visual>` +
    '<actions>' +
    `<action content="${escapeXmlText(NATIVE_TOAST_BUTTON_ALLOW)}" arguments="${allow}" activationType="protocol" hint-buttonStyle="Success"/>` +
    `<action content="${escapeXmlText(NATIVE_TOAST_BUTTON_DENY)}" arguments="${deny}" activationType="protocol" hint-buttonStyle="Critical"/>` +
    '</actions></toast>'
  );
}

/* ------------------------------------------------------------- platform layer */

/** Drop a leading BOM so a hand-edited JSON file still parses (PowerShell writes one by default). */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** `unlink` that never throws: a missing file is the state we wanted anyway. */
async function unlinkQuiet(path) {
  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the platform layer.
 *
 * Every knob exists so the self-test can run this module WITHOUT a Windows box,
 * without touching the real `~/.dsh`, and without ever starting a process:
 * `home`, `spawn`, `exists`, `now` are all injectable, and the defaults are the
 * real thing. The module itself starts nothing at import time.
 *
 * @param options - `{ home, spawn, exists, now, powershell, env, logger }`.
 * @returns the platform handle used by `lib/native-bridge.js`.
 */
export function createNativeToastPlatform(options = {}) {
  const env = options.env ?? process.env;
  const home = options.home ?? nativeToastHome(env);
  const spawnChild = typeof options.spawn === 'function' ? options.spawn : spawn;
  const exists = typeof options.exists === 'function' ? options.exists : existsSync;
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const powershell = 'powershell' in options ? options.powershell : windowsPowerShellPath(env);
  const log = typeof options.log === 'function' ? options.log : () => {};
  /** Tokens whose answer is being read right now: a second reader must not also take it. */
  const inFlight = new Set();
  /** Per-process counter for unique temporary names in {@link writeAnswer}. */
  let writerCounter = 0;
  // Injectable so the self-test can exercise the timeout arm without waiting 5 s.
  const raiseTimeoutMs = typeof options.raiseTimeoutMs === 'number' ? options.raiseTimeoutMs : NATIVE_TOAST_RAISE_TIMEOUT_MS;
  const dismissTimeoutMs = typeof options.dismissTimeoutMs === 'number' ? options.dismissTimeoutMs : NATIVE_TOAST_DISMISS_TIMEOUT_MS;

  const directory = () => nativeToastDirectory(home);

  /**
   * Read the install marker (§5.4).
   *
   * The marker is the ONLY thing that decides "installed": the Host reads a file
   * in its own home and never touches the registry (no dependency, no spawn, and
   * nothing to fail when the user is not on Windows).
   *
   * @returns `{ installed, marker, reason }`.
   */
  async function readMarker() {
    let text;
    try {
      text = await readFile(nativeToastMarkerPath(home), 'utf8');
    } catch {
      return { installed: false, marker: null, reason: 'missing' };
    }
    let marker;
    try {
      marker = JSON.parse(stripBom(text));
    } catch {
      return { installed: false, marker: null, reason: 'unreadable' };
    }
    if (marker === null || typeof marker !== 'object') return { installed: false, marker: null, reason: 'unreadable' };
    if (marker.version !== NATIVE_TOAST_MARKER_VERSION) return { installed: false, marker, reason: 'version' };
    if (marker.aumid !== NATIVE_TOAST_AUMID) return { installed: false, marker, reason: 'aumid' };
    return { installed: true, marker, reason: null };
  }

  /**
   * Which stage the native layer is in, ignoring the settings switch (the caller
   * checks that first, because "disabled" outranks everything, §5.1).
   *
   * @returns `'not-installed' | 'no-powershell' | 'ready'`.
   */
  async function stage() {
    const marker = await readMarker();
    if (marker.installed !== true) return 'not-installed';
    if (typeof powershell !== 'string' || powershell.length === 0) return 'no-powershell';
    try {
      if (exists(powershell) !== true) return 'no-powershell';
    } catch {
      return 'no-powershell';
    }
    return 'ready';
  }

  /**
   * Start `powershell.exe` on one script and wait for it, bounded.
   *
   * `windowsHide: true` is the no-black-box rule for the raise path (§2.1): the
   * child never gets a console window, whether or not the DSH host itself was
   * started from a terminal. `stdio: 'ignore'` keeps the ChildProcess from
   * holding pipes open (a plugin must not leak a handle per approval).
   *
   * @param args - the full argument vector after the interpreter.
   * @param timeoutMs - upper bound before the child is killed.
   * @returns `{ code, timedOut, error }`; `code` is null when it never ran.
   */
  function runPowerShell(args, timeoutMs) {
    return new Promise((resolve) => {
      let settled = false;
      let timer = null;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        resolve(value);
      };
      let child;
      try {
        child = spawnChild(powershell, args, { windowsHide: true, stdio: 'ignore' });
      } catch (error) {
        finish({ code: null, timedOut: false, error: describeError(error) });
        return;
      }
      if (child === null || child === undefined || typeof child.once !== 'function') {
        finish({ code: null, timedOut: false, error: 'the spawn hook returned no child process' });
        return;
      }
      child.once('error', (error) => finish({ code: null, timedOut: false, error: describeError(error) }));
      child.once('exit', (code) => finish({ code: typeof code === 'number' ? code : null, timedOut: false }));
      timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* the child is already gone; the timeout still stands */
        }
        finish({ code: null, timedOut: true });
      }, timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
    });
  }

  /** The shared preamble every script invocation uses (§3.1). */
  function scriptArgs(script) {
    return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', nativeToastScriptPath(script)];
  }

  /**
   * Raise one toast and wait for the script (§5.1).
   *
   * The XML travels in a FILE, never on the command line: it carries Chinese
   * copy plus the asker's own `toolName`/`reason`, and a command line would put
   * both through one more layer of quoting and encoding. The file is deleted
   * afterwards whether the raise worked or not.
   *
   * @param request - `{ token, port, toolName, reason }`.
   * @returns `{ state: 'raised', tag }` or `{ state: 'skipped', reason, detail }`.
   */
  async function raise(request) {
    const token = String(request.token);
    const tag = nativeToastTagOf(token);
    const xmlPath = nativeToastXmlPath(home, token);
    try {
      await mkdir(directory(), { recursive: true });
      await writeFile(xmlPath, buildNativeToastXml(request), 'utf8');
    } catch (error) {
      return { state: 'skipped', reason: 'raise-failed', detail: `xml: ${describeError(error)}` };
    }
    const result = await runPowerShell(
      [
        ...scriptArgs('raise.ps1'),
        '-Aumid',
        NATIVE_TOAST_AUMID,
        '-XmlPath',
        xmlPath,
        '-Tag',
        tag,
        '-Group',
        NATIVE_TOAST_GROUP,
      ],
      raiseTimeoutMs,
    );
    // t10 T1-F07 #2 · two statements, two lines (they used to share one).
    await unlinkQuiet(xmlPath);
    if (result.code === 0) return { state: 'raised', tag };
    const detail = result.timedOut === true ? 'timeout' : result.error !== undefined ? result.error : `exit ${String(result.code)}`;
    log('warn', `native toast raise failed: ${detail}`);
    return { state: 'skipped', reason: 'raise-failed', detail };
  }

  /**
   * Take one toast off the screen. Best effort by contract (§8): a dismiss that
   * fails changes nothing about the answer that was already delivered.
   *
   * @param tag - the toast tag (`appr-<11hex>`).
   * @returns `{ ok, detail }`.
   */
  async function dismiss(tag) {
    const result = await runPowerShell(
      [...scriptArgs('raise.ps1'), '-Remove', '-Aumid', NATIVE_TOAST_AUMID, '-Tag', tag, '-Group', NATIVE_TOAST_GROUP],
      dismissTimeoutMs,
    );
    if (result.code === 0) return { ok: true, detail: null };
    const detail = result.timedOut === true ? 'timeout' : result.error !== undefined ? result.error : `exit ${String(result.code)}`;
    log('warn', `native toast dismiss failed (best effort): ${detail}`);
    return { ok: false, detail };
  }

  /**
   * Write one answer file (§4), atomically and without ever overwriting.
   *
   * The no-overwrite rule is the first gate of the one-shot contract: the answer
   * that arrived first is the answer, and a second click cannot replace it.
   *
   * PUBLICATION IS SINGLE-WINNER, and it cannot be done with `rename`: on Windows
   * `rename` silently REPLACES its destination, so two same-tick writers would both
   * "succeed" and the second would overwrite the first — 本机实测，读数见
   * `.scratch/native-toast-probe/r25-t14-evidence.out` 的 E1 行（E1a rename 两次两次都成功、
   * 目标被后者覆盖；E1b link 第二次抛 EEXIST）。So each writer uses its OWN temporary
   * name and publishes with `link`, which fails with EEXIST when the answer is
   * already there; the loser deletes its own temporary and reports `exists`, which
   * the bridge maps to `409 already-answered`.
   *
   * A volume that cannot hard-link (EPERM/ENOSYS/EXDEV, e.g. FAT) falls back to
   * `rename`: that is the LAST RESORT and it is not concurrency-safe — it is only
   * there so the feature keeps working on such a volume at all.
   *
   * @param token - validated 32-hex token.
   * @param answer - `allowed-once` or `rejected`.
   * @returns `{ ok: true }` or `{ ok: false, reason }`.
   */
  async function writeAnswer(token, answer) {
    const target = nativeToastAnswerPath(home, token);
    if (exists(target) === true) return { ok: false, reason: 'exists' };
    // One temporary name per writer: a shared `${target}.tmp` is itself a race.
    // The suffix is pid + a per-process counter, so two writers in the same tick
    // (and two Host processes) never collide, and no import is needed for it.
    writerCounter += 1;
    const temporary = `${target}.${process.pid}-${writerCounter}.tmp`;
    const payload = `${JSON.stringify({
      version: NATIVE_TOAST_ANSWER_VERSION,
      token,
      answer,
      answeredAt: new Date(now()).toISOString(),
    })}\n`;
    try {
      await mkdir(directory(), { recursive: true });
      // UTF-8 without BOM on purpose: the Host parses this file with JSON.parse,
      // and a BOM would make that throw (measured in review of the deploy scripts).
      await writeFile(temporary, payload, 'utf8');
      if (exists(target) === true) {
        await unlinkQuiet(temporary);
        return { ok: false, reason: 'exists' };
      }
      try {
        await link(temporary, target);
      } catch (error) {
        const code = error?.code;
        if (code === 'EEXIST') {
          await unlinkQuiet(temporary);
          return { ok: false, reason: 'exists' };
        }
        if (code === 'EPERM' || code === 'ENOSYS' || code === 'EXDEV' || code === 'ENOTSUP') {
          // Last resort on a volume without hard links; not concurrency-safe.
          await rename(temporary, target);
          return { ok: true, reason: null };
        }
        throw error;
      }
      await unlinkQuiet(temporary);
      return { ok: true, reason: null };
    } catch (error) {
      await unlinkQuiet(temporary);
      return { ok: false, reason: describeError(error) };
    }
  }

  /**
   * Read and CONSUME one answer file (§4): validate the schema, delete the file,
   * then answer. A file that is malformed or older than the TTL is deleted and
   * reported as absent — an expired answer is not an answer.
   *
   * @param token - validated 32-hex token.
   * @returns `{ answer, answeredAt }` or null.
   */
  async function readAnswer(token) {
    // Two guards, because the platform's own one is not enough on Windows:
    //   - `inFlight` serialises readers inside this process (the Host is one
    //     process; two tabs polling at once is the real case);
    //   - a hard-link claim serialises across processes, because `link` fails with
    //     EEXIST when the claim is already there — MEASURED: `rename` does NOT
    //     work here, on Windows it silently REPLACES the destination, so both
    //     concurrent readers won.
    if (inFlight.has(token)) return null;
    inFlight.add(token);
    try {
      const file = nativeToastAnswerPath(home, token);
      const claim = `${file}.claim`;
      let source = claim;
      try {
        await link(file, claim);
      } catch (error) {
        if (error?.code === 'ENOENT') return null;
        if (error?.code === 'EEXIST') return null;
        // The volume cannot hard-link (EPERM/ENOSYS/EXDEV): fall back to reading
        // the file itself; the in-process guard still serialises this Host.
        source = file;
      }
      let text;
      try {
        text = await readFile(source, 'utf8');
      } catch {
        return null;
      }
      const cleanup = async () => {
        await unlinkQuiet(source);
        if (source !== file) await unlinkQuiet(file);
      };
      let parsed;
      try {
        parsed = JSON.parse(stripBom(text));
      } catch {
        await cleanup();
        return null;
      }
      const shapeOk =
        parsed !== null &&
        typeof parsed === 'object' &&
        parsed.version === NATIVE_TOAST_ANSWER_VERSION &&
        parsed.token === token &&
        (parsed.answer === NATIVE_TOAST_ANSWER_ALLOW || parsed.answer === NATIVE_TOAST_ANSWER_DENY) &&
        typeof parsed.answeredAt === 'string';
      if (shapeOk !== true) {
        await cleanup();
        return null;
      }
      const answeredAt = Date.parse(parsed.answeredAt);
      if (!Number.isFinite(answeredAt) || now() - answeredAt > NATIVE_TOAST_TTL_MS) {
        await cleanup();
        return null;
      }
      await cleanup();
      return { answer: parsed.answer, answeredAt: parsed.answeredAt };
    } finally {
      inFlight.delete(token);
    }
  }

  /**
   * Delete what the TTL has made meaningless: expired `<token>.json`, abandoned
   * `raise-<token>.xml`, `*.tmp` files and `<token>.json.claim` leftovers (a claim
   * whose reader crashed). `installed.json` is never touched, and neither is any
   * name this feature does not own (§4).
   *
   * @returns `{ removed }` — the number of files deleted.
   */
  async function sweep() {
    let entries;
    try {
      entries = await readdir(directory(), { withFileTypes: true });
    } catch {
      return { removed: 0 };
    }
    let removed = 0;
    for (const entry of entries) {
      if (entry.isFile() !== true) continue;
      const name = entry.name;
      if (name === NATIVE_TOAST_MARKER) continue;
      const path = join(directory(), name);
      const isAnswer = ANSWER_FILE_PATTERN.test(name);
      const isClaim = /^[0-9a-f]{32}\.json\.claim$/.test(name);
      const isRaiseXml = /^raise-[0-9a-f]{32}\.xml$/.test(name);
      const isTemp = name.endsWith('.tmp');
      if (isAnswer !== true && isClaim !== true && isRaiseXml !== true && isTemp !== true) continue;
      let expired = true;
      try {
        if (isAnswer === true) {
          const parsed = JSON.parse(stripBom(await readFile(path, 'utf8')));
          const answeredAt = Date.parse(parsed?.answeredAt);
          expired = !Number.isFinite(answeredAt) || now() - answeredAt > NATIVE_TOAST_TTL_MS;
        } else {
          const info = await stat(path);
          expired = now() - info.mtimeMs > NATIVE_TOAST_TTL_MS;
        }
      } catch {
        expired = true;
      }
      if (expired === true && (await unlinkQuiet(path)) === true) removed += 1;
    }
    return { removed };
  }

  /** Is there already an unconsumed answer file for this token? (§5.3) */
  function answerExists(token) {
    try {
      return exists(nativeToastAnswerPath(home, token)) === true;
    } catch {
      return false;
    }
  }

  return Object.freeze({
    home,
    powershell,
    directory,
    markerPath: () => nativeToastMarkerPath(home),
    answerPath: (token) => nativeToastAnswerPath(home, token),
    tagOf: nativeToastTagOf,
    readMarker,
    stage,
    raise,
    dismiss,
    writeAnswer,
    readAnswer,
    answerExists,
    sweep,
    runPowerShell,
  });
}
