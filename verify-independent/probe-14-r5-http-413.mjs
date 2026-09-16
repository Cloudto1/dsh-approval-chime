/**
 * Independent rev-5 probe 14 — D1 (the 413 that never reached the client) and a
 * dedicated attack on the new `refuseOversized` drain path.
 *
 * Everything here goes through a REAL `node:http` server and a RAW TCP socket, so
 * framing, pacing and abrupt disconnects are controlled by the probe and the
 * answer is judged on the bytes that really came back.
 *
 * Scenarios:
 *   1. content-length overflow          → readable 413 JSON
 *   2. chunked overflow (fast)          → readable 413 JSON
 *   3. chunked overflow (4 ms / frame)  → 413 before the 3 s deadline (drained by `end`)
 *   4a. cap tripped, then the sender halts forever → 413 at the 3 s deadline
 *   4b. sender NEVER trips the cap and never finishes → measured pre-cap stall
 *   5.  cap tripped, then a slow endless stream → 413 at the deadline, read bounded
 *   6.  grace sweep: how much extra body is drained before the socket is cut
 *   7.  disconnects (mid-body / after the cap / before reading the answer) → no crash, no leak
 *   8.  oversized + normal upload concurrently → both answered correctly
 */

import { suite } from './kit/rev4.mjs';
import { startServer, httpJson, rawExchange, instrumentTimers, snapshotAudioDir, readAudio, removePlanted } from './kit/hostserver.mjs';

const S = suite('probe-14 rev-5 HTTP 413 / refuseOversized attack (independent, real socket)');

const CAP = 5 * 1024 * 1024;
const ROUTE = '/api/approval-chime/audio';
const NAME = 'over.wav';
const planted = [];
const crash = [];
process.on('uncaughtException', (error) => crash.push(`uncaughtException: ${String(error && error.message ? error.message : error)}`));
process.on('unhandledRejection', (reason) => crash.push(`unhandledRejection: ${String(reason && reason.message ? reason.message : reason)}`));

const dirBefore = snapshotAudioDir();

const head = (extra, length) =>
  [`POST ${ROUTE} HTTP/1.1`, 'Host: 127.0.0.1', `x-chime-name: ${NAME}`, 'content-type: audio/wav', ...extra, 'connection: close', length === undefined ? null : `content-length: ${length}`, '', '']
    .filter((line) => line !== null)
    .join('\r\n');

const describe = (result) => `status=${result.status} body=${JSON.stringify(result.body.slice(0, 90))} elapsed=${result.elapsedMs}ms finishedBy=${result.finishedBy} error=${result.error} closedByServer=${result.closedByServer}`;
const parsedBody = (result) => {
  try {
    return JSON.parse(result.body);
  } catch {
    return null;
  }
};
/** Only the timers the plugin itself arms: the 3000 ms deadline. */
const deadlineTimers = (records) => records.filter((item) => item.delay === 3000);

/** Build chunked frames totalling `total` bytes. */
function chunkedFrames(total, frameSize, delayMs) {
  const frames = [];
  for (let sent = 0; sent < total; sent += frameSize) {
    frames.push({ bytes: Math.min(frameSize, total - sent), delayMs });
  }
  return frames;
}

const server = await startServer();
try {
  /* ------------------------------------------------------ 1. content-length */

  S.group('1 — content-length overflow (the D1 repro)');
  {
    const timers = instrumentTimers();
    const result = await rawExchange(server.port, { head: head([], CAP + 1), frames: [{ bytes: CAP + 1, chunked: false }], afterFrames: 'halt', idleMs: 5000, hardTimeoutMs: 9000 });
    timers.restore();
    const armed = deadlineTimers(timers.summary());
    S.note('raw response head', result.received.slice(0, 170));
    S.note('plugin deadline timers', armed);
    S.same('the client RECEIVES a response', result.status, 413);
    S.check('the 413 body is readable JSON naming the limit', parsedBody(result) !== null && parsedBody(result).ok === false && String(parsedBody(result).error).includes('5 MB limit'), JSON.stringify(result.body));
    S.same('the JSON content type survived', (result.headers['content-type'] || '').includes('application/json'), true);
    S.same('the answer asks the connection to close', result.headers.connection, 'close');
    S.same('exactly one 3 s deadline timer was armed', armed.length, 1);
    S.check('that timer was unref\'d (it can never hold the process open)', armed.length === 1 && armed[0].ref === false, JSON.stringify(armed));
    S.check('and it was cleared when the request completed', armed.length === 1 && armed[0].cleared === true, JSON.stringify(armed));
  }

  /* ------------------------------------------------------------ 2. chunked */

  S.group('2 — chunked overflow, fast sender');
  {
    const result = await rawExchange(server.port, { head: head(['transfer-encoding: chunked']), frames: chunkedFrames(CAP + 64 * 1024, 64 * 1024), afterFrames: 'finish', idleMs: 5000, hardTimeoutMs: 9000 });
    S.note('bytes written by the probe', result.wroteBytes);
    S.note('response', describe(result));
    S.same('chunked overflow also gets a readable 413', result.status, 413);
    S.check('with a parseable body', parsedBody(result) !== null && parsedBody(result).ok === false, JSON.stringify(result.body));
  }

  /* ------------------------------------------------------- 3. slow sender */

  S.group('3 — chunked overflow, 4 ms per 16 KB frame (slow but finishes)');
  {
    const timers = instrumentTimers();
    const result = await rawExchange(server.port, { head: head(['transfer-encoding: chunked']), frames: chunkedFrames(6 * 1024 * 1024, 16 * 1024, 4), afterFrames: 'finish', idleMs: 5000, hardTimeoutMs: 30000 });
    timers.restore();
    const armed = deadlineTimers(timers.summary());
    S.note('response', describe(result));
    S.note('plugin deadline timers', armed);
    S.same('a slow sender still receives the 413', result.status, 413);
    S.check('answered by the END path, before the 3 s deadline', result.elapsedMs < 3000, `elapsed=${result.elapsedMs}ms`);
    S.check('the deadline timer was cleared rather than left dangling', armed.length === 1 && armed[0].cleared === true, JSON.stringify(armed));
  }

  /* ------------------------------------------- 4a. cap tripped, sender halts */

  S.group('4a — cap trips, then the sender halts and never finishes');
  {
    const timers = instrumentTimers();
    const result = await rawExchange(server.port, { head: head(['transfer-encoding: chunked']), frames: chunkedFrames(CAP + 128 * 1024, 64 * 1024), afterFrames: 'halt', idleMs: 6000, hardTimeoutMs: 12000 });
    timers.restore();
    const armed = deadlineTimers(timers.summary());
    S.note('response', describe(result));
    S.note('plugin deadline timers', armed);
    S.same('the request is answered with 413 instead of hanging', result.status, 413);
    S.check('the answer comes from the 3 s deadline', result.elapsedMs >= 2500 && result.elapsedMs <= 6000, `elapsed=${result.elapsedMs}ms`);
    S.same('exactly one deadline timer was armed', armed.length, 1);
    S.check('it was unref\'d', armed.length === 1 && armed[0].ref === false, JSON.stringify(armed));
    S.check('the server closed the connection after the answer', result.closedByServer === true, describe(result));
  }

  /* --------------------------------------- 4b. never trips the cap, never ends */

  S.group('4b — sender stays UNDER the cap and never finishes (pre-cap stall)');
  {
    const timers = instrumentTimers();
    const result = await rawExchange(server.port, { head: head(['transfer-encoding: chunked']), frames: [{ bytes: 32 * 1024 }], afterFrames: 'halt', idleMs: 7000, hardTimeoutMs: 12000 });
    timers.restore();
    const armed = deadlineTimers(timers.summary());
    S.note('response', describe(result));
    S.note('plugin deadline timers', armed);
    S.note('carrier-level bound', 'dsh-host-webserver does not set requestTimeout/headersTimeout (grep: no matches), so Node\'s defaults apply (requestTimeout 300 s). Not exercised here.');
    S.check('MEASURED: a request that never crosses the cap is NOT answered by the plugin (no 413, no timeout of its own)', result.status === null && armed.length === 0, `${describe(result)}; plugin timers=${JSON.stringify(armed)}`);
    S.check('the probe had to end the exchange itself (nothing from the server)', result.finishedBy === 'idle-timeout', describe(result));
  }

  /* ------------------------------------- 5. cap tripped, then slow endless stream */

  S.group('5 — cap trips, then a slow endless stream');
  {
    const timers = instrumentTimers();
    const result = await rawExchange(server.port, {
      head: head(['transfer-encoding: chunked']),
      frames: [...chunkedFrames(CAP + 64 * 1024, 64 * 1024), ...chunkedFrames(2 * 1024 * 1024, 16 * 1024, 30)],
      afterFrames: 'halt',
      idleMs: 6000,
      hardTimeoutMs: 20000,
    });
    timers.restore();
    const armed = deadlineTimers(timers.summary());
    S.note('response', describe(result));
    S.note('plugin deadline timers', armed);
    S.same('the endless streamer still gets its 413', result.status, 413);
    S.check('answered at the deadline, not by draining 2 MB more', result.elapsedMs >= 2500 && result.elapsedMs <= 7000, `elapsed=${result.elapsedMs}ms`);
    S.check('the server stopped reading well before the probe ran out of frames', result.wroteBytes < CAP + 64 * 1024 + 2 * 1024 * 1024, `wroteBytes=${result.wroteBytes} of ${CAP + 64 * 1024 + 2 * 1024 * 1024}`);
  }

  /* ------------------------------------------------------- 6. grace sweep */

  S.group('6 — how much extra body is drained before the cut-off (grace sweep)');
  {
    for (const total of [CAP + Math.floor(CAP * 0.5), CAP + CAP, CAP + Math.floor(CAP * 1.25)]) {
      const result = await rawExchange(server.port, { head: head(['transfer-encoding: chunked']), frames: chunkedFrames(total, 64 * 1024), afterFrames: 'finish', idleMs: 4000, hardTimeoutMs: 15000 });
      S.note(`total=${(total / 1024 / 1024).toFixed(2)} MB`, describe(result));
      S.check(`total ${(total / 1024 / 1024).toFixed(2)} MB → ${result.status === 413 ? 'readable 413' : `cut off (${result.error === null ? result.finishedBy : result.error})`}`, result.status === 413 || result.status === null, describe(result));
    }
    S.note('boundary semantics', 'refuseOversized drains at most one extra MAX_AUDIO_BYTES after the cap trips; a faster/bigger stream is destroyed (RST) instead of answered. The plugin\'s own client never reaches this: it refuses file.size > 5 MB before sending (lib/client.js:1284).');
  }

  /* -------------------------------------------------------- 7. disconnects */

  S.group('7 — client disconnects (mid-body / right after the cap / before reading the answer)');
  {
    const before = await rawExchange(server.port, { head: head([], CAP * 4), frames: [{ bytes: 512 * 1024, chunked: false }], afterFrames: 'destroy', idleMs: 300, hardTimeoutMs: 8000 });
    S.note('disconnect mid-body', describe(before));
    await new Promise((tick) => setTimeout(tick, 3400));
    S.deep('no crash after a mid-body disconnect', crash, []);

    const afterCap = await rawExchange(server.port, { head: head(['transfer-encoding: chunked']), frames: chunkedFrames(CAP + 64 * 1024, 64 * 1024), afterFrames: 'destroy', idleMs: 300, hardTimeoutMs: 8000 });
    S.note('disconnect right after the cap tripped', describe(afterCap));
    await new Promise((tick) => setTimeout(tick, 3400));
    S.deep('no crash after a post-cap disconnect', crash, []);

    const answered = await rawExchange(server.port, { head: head([], CAP + 1), frames: [{ bytes: CAP + 1, chunked: false }], afterFrames: 'destroy', idleMs: 200, hardTimeoutMs: 8000 });
    S.note('client vanished instead of reading the answer', describe(answered));
    await new Promise((tick) => setTimeout(tick, 1200));
    S.deep('no crash when nobody reads the response', crash, []);

    const idle = await server.waitIdle(4000);
    S.check('every socket of these scenarios is gone (no leaked connection)', idle.idle === true, JSON.stringify(idle));
  }

  /* ------------------------------------------------------- 8. concurrency */

  S.group('8 — an oversized upload concurrent with a normal one');
  {
    const normalBytes = Buffer.alloc(100 * 1024, 0x42);
    const [over, normal] = await Promise.all([
      rawExchange(server.port, { head: head([], CAP + 1), frames: [{ bytes: CAP + 1, chunked: false }], afterFrames: 'halt', idleMs: 5000, hardTimeoutMs: 12000 }),
      httpJson(server.port, { method: 'POST', path: ROUTE, headers: { 'x-chime-name': 'normal.wav', 'content-type': 'audio/wav', connection: 'close' }, body: normalBytes, agent: false }),
    ]);
    S.note('oversized answer', describe(over));
    S.same('the oversized request still gets its 413', over.status, 413);
    S.same('the normal upload is accepted', normal.status, 200);
    S.same('the normal upload landed with a uuid id', typeof normal.json.id === 'string' && normal.json.id.length === 36, true);
    planted.push(normal.json.id);
    const stored = readAudio(normal.json.id, 'wav');
    S.same('the stored bytes are exactly the uploaded ones', stored === null ? null : stored.equals(normalBytes), true);
    const removed = await httpJson(server.port, { method: 'DELETE', path: `${ROUTE}/${normal.json.id}`, agent: false });
    S.same('the uploaded file was removed again', JSON.stringify([removed.status, removed.json.removed]), JSON.stringify([200, true]));
  }
} finally {
  removePlanted(planted);
  const idle = await server.waitIdle(3000);
  S.note('final socket state', idle);
  S.deep('no uncaught exception / unhandled rejection in the whole probe', crash, []);
  S.check('the audio directory is exactly as it was before the probe', snapshotAudioDir().join(',') === dirBefore.join(','), `before=[${dirBefore.join(',')}] after=[${snapshotAudioDir().join(',')}]`);
  await server.stop();
}

S.done();
