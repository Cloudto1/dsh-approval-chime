/**
 * Independent rev-5 kit — a REAL `node:http` carrier for the plugin's audio route.
 *
 * The D1 defect (an oversized upload's 413 never reaching the client) lives at the
 * SOCKET layer, so `Readable.from(...)` + a hand-written `res` object cannot see
 * it. This kit registers the plugin's own handler on a real server, mirrors the
 * carrier's dispatch rule (`new URL(req.url).pathname` + prefix match, as
 * `dsh-host-webserver` does), and speaks HTTP over a raw TCP socket so the probe
 * can control framing (content-length vs chunked), pacing (4 ms per frame) and
 * abrupt disconnects.
 */

import http from 'node:http';
import net from 'node:net';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HOST_PATH, PLUGIN_DIR } from './platform.mjs';

export const AUDIO_DIR = join(PLUGIN_DIR, 'audio');
export { HOST_PATH, PLUGIN_DIR };

/** Import the real host half (fresh module instance per call site is not needed). */
export function loadHost() {
  return import(pathToFileURL(HOST_PATH).href);
}

/**
 * Start a real HTTP server carrying the plugin's audio route.
 *
 * @returns `{ host, server, port, route, warnings, stop, connections, dirSnapshot }`
 */
export async function startServer() {
  const host = await loadHost();
  const registrations = [];
  const warnings = [];
  const fakeCtx = {
    logger: { info() {}, warn(message) { warnings.push(String(message)); }, error() {}, debug() {} },
    get(name) {
      if (name !== 'webServer') return undefined;
      return {
        register(spec) {
          registrations.push(spec);
          return () => {};
        },
      };
    },
    effect(callback, label) {
      void label;
      return callback();
    },
  };
  host.registerAudioRoutes(fakeCtx);
  if (registrations.length !== 1) throw new Error(`probe: the audio route registered ${registrations.length} times, expected 1`);
  const route = registrations[0];

  const server = http.createServer((req, res) => {
    let pathname = '/';
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      /* keep '/' */
    }
    if (pathname === route.path || pathname.startsWith(`${route.path}/`)) {
      route.handler(req, res);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('probe: not the audio route');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  return {
    host,
    server,
    port,
    route,
    registrations,
    warnings,
    /** Live socket count (leak check). Kept short by `server.close` in tests. */
    connections() {
      return new Promise((resolve) => server.getConnections((error, count) => resolve(error === null ? count : -1)));
    },
    async waitIdle(deadlineMs = 3000) {
      const started = Date.now();
      while (Date.now() - started < deadlineMs) {
        const count = await this.connections();
        if (count === 0) return { idle: true, waitedMs: Date.now() - started, count };
        await new Promise((tick) => setTimeout(tick, 50));
      }
      return { idle: false, waitedMs: Date.now() - started, count: await this.connections() };
    },
    stop() {
      return new Promise((resolve) => {
        server.closeAllConnections === undefined ? server.close(resolve) : (server.closeAllConnections(), server.close(resolve));
      });
    },
  };
}

/** Plain JSON request over `http.request` (content-length is set automatically). */
export function httpJson(port, options) {
  const body = options.body === undefined ? null : options.body;
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        method: options.method,
        path: options.path,
        headers: options.headers === undefined ? {} : options.headers,
        ...(options.agent === undefined ? {} : { agent: options.agent }),
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const raw = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(raw.toString('utf8'));
          } catch {
            json = null;
          }
          resolve({ status: response.statusCode, headers: response.headers, raw, json });
        });
      },
    );
    request.on('error', reject);
    if (body !== null) request.write(body);
    request.end();
  });
}

/** Parse a raw HTTP/1.1 response (content-length or chunked) into status/headers/body. */
export function parseRawResponse(text) {
  const split = text.indexOf('\r\n\r\n');
  if (split < 0) return { status: null, headers: {}, body: '', incomplete: true };
  const head = text.slice(0, split);
  const bodyPart = text.slice(split + 4);
  const lines = head.split('\r\n');
  const statusLine = lines[0];
  const match = /^HTTP\/1\.[01] (\d{3})/.exec(statusLine);
  const headers = {};
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  let body = bodyPart;
  if ((headers['transfer-encoding'] || '').includes('chunked')) {
    const decoded = [];
    let cursor = 0;
    while (cursor < bodyPart.length) {
      const sizeEnd = bodyPart.indexOf('\r\n', cursor);
      if (sizeEnd < 0) break;
      const size = Number.parseInt(bodyPart.slice(cursor, sizeEnd), 16);
      if (!Number.isFinite(size) || size === 0) break;
      decoded.push(bodyPart.slice(sizeEnd + 2, sizeEnd + 2 + size));
      cursor = sizeEnd + 2 + size + 2;
    }
    body = decoded.join('');
  }
  return { status: match === null ? null : Number(match[1]), headers, body, incomplete: false };
}

/**
 * One hand-driven HTTP exchange over a raw socket.
 *
 * @param port - server port.
 * @param plan.head - the request head INCLUDING the final CRLFCRLF.
 * @param plan.frames - `[{ bytes, delayMs, chunked }]` written in order.
 * @param plan.afterFrames - `'finish'` (write the chunked terminal), `'halt'`
 *   (stop writing and keep the socket open), `'destroy'` (reset the connection).
 * @param plan.idleMs - how long to keep reading after the last frame.
 * @returns a record with everything the probe needs to judge.
 */
export function rawExchange(port, plan) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    const started = Date.now();
    const state = {
      plan,
      status: null,
      headers: null,
      body: '',
      received: '',
      receivedBytes: 0,
      wroteBytes: 0,
      error: null,
      closedByServer: false,
      finishedBy: null,
      elapsedMs: 0,
      timers: [],
    };
    let finished = false;
    const finish = (how) => {
      if (finished) return;
      finished = true;
      state.finishedBy = how;
      state.elapsedMs = Date.now() - started;
      const parsed = parseRawResponse(state.received);
      state.status = parsed.status;
      state.headers = parsed.headers;
      state.body = parsed.body;
      try {
        socket.destroy();
      } catch {
        /* already gone */
      }
      resolve(state);
    };

    socket.on('connect', async () => {
      try {
        socket.write(plan.head);
        state.wroteBytes += Buffer.byteLength(plan.head, 'latin1');
        for (const frame of plan.frames === undefined ? [] : plan.frames) {
          if (finished) return;
          const payload = Buffer.isBuffer(frame.bytes) ? frame.bytes : Buffer.alloc(frame.bytes, 0x61);
          const wire = frame.chunked === false ? payload : Buffer.concat([Buffer.from(`${payload.length.toString(16)}\r\n`), payload, Buffer.from('\r\n')]);
          socket.write(wire);
          state.wroteBytes += wire.length;
          if (frame.delayMs !== undefined && frame.delayMs > 0) await new Promise((tick) => setTimeout(tick, frame.delayMs));
        }
        const after = plan.afterFrames === undefined ? 'finish' : plan.afterFrames;
        if (after === 'finish') {
          socket.write('0\r\n\r\n');
          state.wroteBytes += 5;
        } else if (after === 'destroy') {
          finish('client-destroyed');
          return;
        }
        if (plan.idleMs !== undefined && plan.idleMs > 0) setTimeout(() => finish('idle-timeout'), plan.idleMs).unref?.();
      } catch (error) {
        state.error = error.code === undefined ? String(error.message) : error.code;
        finish('write-error');
      }
    });
    socket.on('data', (chunk) => {
      state.received += chunk.toString('latin1');
      state.receivedBytes += chunk.length;
    });
    socket.on('close', () => {
      state.closedByServer = true;
      finish('server-closed');
    });
    socket.on('error', (error) => {
      state.error = error.code === undefined ? String(error.message) : error.code;
      finish('socket-error');
    });
    if (plan.hardTimeoutMs !== undefined) {
      setTimeout(() => finish('hard-timeout'), plan.hardTimeoutMs).unref?.();
    }
  });
}

/**
 * Wait until `predicate()` is true, or the deadline expires.
 *
 * Real loopback I/O does not finish in a fixed number of event-loop turns, so a
 * probe that awaits `settle(n)` after a REAL request is timing-dependent (measured:
 * the same assertion passed and failed on consecutive runs). Every wait for
 * network work goes through here instead.
 *
 * @returns `{ ok, waitedMs, polls }`
 */
export async function waitFor(predicate, timeoutMs = 3000, stepMs = 5) {
  const started = Date.now();
  let polls = 0;
  for (;;) {
    polls += 1;
    let value = false;
    try {
      value = predicate() === true;
    } catch {
      value = false;
    }
    if (value) return { ok: true, waitedMs: Date.now() - started, polls };
    if (Date.now() - started >= timeoutMs) return { ok: false, waitedMs: Date.now() - started, polls };
    await new Promise((tick) => setTimeout(tick, stepMs));
  }
}

/** Wrap `setTimeout`/`clearTimeout` so a probe can see timer lifecycles. */
export function instrumentTimers() {
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const created = [];
  globalThis.setTimeout = function patchedSetTimeout(callback, delay, ...args) {
    const handle = realSet.call(globalThis, callback, delay, ...args);
    created.push({ delay, handle, ref: typeof handle.hasRef === 'function' ? handle.hasRef() : null, cleared: false });
    return handle;
  };
  globalThis.clearTimeout = function patchedClearTimeout(handle) {
    const record = created.find((item) => item.handle === handle);
    if (record !== undefined) record.cleared = true;
    return realClear.call(globalThis, handle);
  };
  return {
    created,
    summary() {
      return created.map((item) => {
        let ref = null;
        try {
          ref = typeof item.handle.hasRef === 'function' ? item.handle.hasRef() : null;
        } catch {
          ref = 'gone';
        }
        return { delay: item.delay, ref, cleared: item.cleared };
      });
    },
    restore() {
      globalThis.setTimeout = realSet;
      globalThis.clearTimeout = realClear;
    },
  };
}

/* ------------------------------------------------------------- audio store */

export function snapshotAudioDir() {
  try {
    return readdirSync(AUDIO_DIR).sort();
  } catch {
    return [];
  }
}

export function ensureAudioDir() {
  if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });
  return AUDIO_DIR;
}

/** Create `audio/<id>.<ext>` with deterministic bytes; returns the file path. */
export function plantAudio(id, ext, bytes) {
  ensureAudioDir();
  const path = join(AUDIO_DIR, `${id}.${ext}`);
  writeFileSync(path, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
  return path;
}

export function readAudio(id, ext) {
  const path = join(AUDIO_DIR, `${id}.${ext}`);
  return existsSync(path) ? readFileSync(path) : null;
}

/** Remove files this probe created (id-scoped, never a directory sweep). */
export function removePlanted(ids) {
  const removed = [];
  for (const entry of snapshotAudioDir()) {
    const base = entry.slice(0, entry.lastIndexOf('.'));
    if (ids.includes(base)) {
      try {
        rmSync(join(AUDIO_DIR, entry));
        removed.push(entry);
      } catch {
        /* already gone */
      }
    }
  }
  return removed;
}
