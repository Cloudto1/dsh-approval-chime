/**
 * Independent rev-5 probe 15 — D2 (uuid case), D3 (exact basename + known
 * extension), D4/F5 (code-point name clamp on both halves), F6 (extension and
 * MIME fallback), plus degenerate names.
 *
 * Part 1 drives the REAL route over a real HTTP server; part 2 drives the REAL
 * browser half in a vm sandbox; part 3 posts the header the browser half really
 * builds to the real route, so "the client can always produce a name the host
 * accepts" is measured end to end rather than argued.
 */

import { boot, entry, uuid, optionRows, selectOf, chooseFile, makeFile, makeFetch, suite, settle } from './kit/rev4.mjs';
import { startServer, httpJson, waitFor, snapshotAudioDir, plantAudio, readAudio, removePlanted, ensureAudioDir, AUDIO_DIR } from './kit/hostserver.mjs';
import { join } from 'node:path';

const S = suite('probe-15 rev-5 names / ids / files (independent)');
const ROUTE = '/api/approval-chime/audio';
const LOWER = uuid(61);
const UPPER = LOWER.toUpperCase();
const crash = [];
process.on('uncaughtException', (error) => crash.push(`uncaughtException: ${String(error && error.message ? error.message : error)}`));
process.on('unhandledRejection', (reason) => crash.push(`unhandledRejection: ${String(reason && reason.message ? reason.message : reason)}`));

const dirBefore = snapshotAudioDir();
const plantedIds = [LOWER];
const plantedDirs = [];

/** A short, distinctive payload so "which file was served" is unambiguous. */
const bytesFor = (tag) => Buffer.from(`probe-${tag}-payload`, 'utf8');

const server = await startServer();
try {
  /* --------------------------------------------------- D2: uuid case asymmetry */

  S.group('D2 — the id pattern is case-sensitive, in the schema AND on the route');
  {
    const loaded = server.host.loadSchemastery({});
    S.check('the real schemastery module was resolvable', loaded.z !== null, loaded.z === null ? loaded.failures.join(' | ').slice(0, 300) : loaded.path);
    if (loaded.z !== null) {
      const schema = server.host.buildSchema(loaded.z);
      const base = { enabled: true, volume: 70, custom: [] };
      const accepts = (value) => {
        try {
          schema(value);
          return true;
        } catch {
          return false;
        }
      };
      S.same('a lowercase custom tone passes schema validation', accepts({ ...base, tone: `custom:${LOWER}` }), true);
      S.same('an UPPERCASE custom tone is REFUSED by the schema', accepts({ ...base, tone: `custom:${UPPER}` }), false);
      S.same('the three built-in tone ids still pass', accepts({ ...base, tone: 'chime' }) && accepts({ ...base, tone: 'bell' }) && accepts({ ...base, tone: 'beep' }), true);
      S.same('a junk tone id is still refused', accepts({ ...base, tone: 'nope' }), false);
      S.same('a mixed-case uuid inside the roster array is now REFUSED by the schema (rev-6 N3)', accepts({ ...base, tone: 'chime', custom: [{ id: UPPER, name: 'x' }] }), false);
      S.same('a lowercase uuid inside the roster array still passes (rev-6 N3 closure, positive side)', accepts({ ...base, tone: 'chime', custom: [{ id: LOWER, name: 'x' }] }), true);
      S.same('a non-uuid roster id is refused (as before)', accepts({ ...base, tone: 'chime', custom: [{ id: 'not-a-uuid', name: 'x' }] }), false);
      S.same('a roster entry with a legal id and any name is still accepted', accepts({ ...base, tone: 'chime', custom: [{ id: LOWER, name: '   ' }] }), true);
    }

    const getUpper = await httpJson(server.port, { method: 'GET', path: `${ROUTE}/${UPPER}`, agent: false });
    S.same('GET with an uppercase id is refused (404)', getUpper.status, 404);
    const getLower = await httpJson(server.port, { method: 'GET', path: `${ROUTE}/${LOWER}`, agent: false });
    S.same('GET with the lowercase id reaches the store (404 only because nothing is stored yet)', JSON.stringify([getLower.status, getLower.json.error]), JSON.stringify([404, 'audio not found']));
    const deleteUpper = await httpJson(server.port, { method: 'DELETE', path: `${ROUTE}/${UPPER}`, agent: false });
    S.same('DELETE with an uppercase id is refused (404)', deleteUpper.status, 404);
    S.check('the two refusals use the same "unknown audio id" wording as a malformed id', getUpper.json.error === 'unknown audio id' && deleteUpper.json.error === 'unknown audio id', JSON.stringify([getUpper.json.error, deleteUpper.json.error]));

    // rev-6 N3 ②③: the browser half must now DROP the hand-edited entry and fall back.
    const probeClient = boot({ scopeValue: { enabled: true, volume: 70, tone: `custom:${UPPER}`, custom: [{ id: UPPER, name: 'upper.wav' }] }, fetch: makeFetch({ get: { status: 404 } }) });
    const tree = probeClient.mountCard({}).render();
    S.note('browser half with an uppercase tone value and roster id', {
      tone: probeClient.diagnostics.settings().tone,
      roster: probeClient.diagnostics.custom(),
      rendered: optionRows(tree).map((row) => row.value),
    });
    S.same('② the uppercase roster entry is dropped (nothing rendered for it)', probeClient.diagnostics.custom().length, 0);
    S.deep('② only the three built-ins are rendered', optionRows(tree).map((row) => row.value), ['chime', 'bell', 'beep']);
    S.same('③ the uppercase tone value falls back to the default tone', probeClient.diagnostics.settings().tone, 'chime');
    S.same('③ the select shows the fallback tone', selectOf(tree).props.value, 'chime');

    // A control: the SAME document with the id in lowercase is kept (the drop is about case, not shape).
    const lowerControl = boot({ scopeValue: { enabled: true, volume: 70, tone: `custom:${LOWER}`, custom: [{ id: LOWER, name: 'upper.wav' }] }, fetch: makeFetch({ get: { status: 404 } }) });
    const lowerControlTree = lowerControl.mountCard({}).render();
    S.deep('② control: the lowercase twin of that document is kept', optionRows(lowerControlTree).map((row) => row.value), [`custom:${LOWER}`, 'chime', 'bell', 'beep']);

    // rev-6 N3 ②③ end to end against the REAL route: no dead row, no 404, no failure counter.
    plantAudio(LOWER, 'wav', bytesFor('real-file'));
    const closedSeen = [];
    const closed = boot({
      scopeValue: { enabled: true, volume: 70, tone: `custom:${UPPER}`, custom: [{ id: UPPER, name: 'upper.wav' }] },
      fetch: async (url, init) => {
        // rev-10: the bundle reads its per-session override table once at mount
        // (lib/client.js:2733-2745). This probe is about the AUDIO route, so that
        // read is answered locally and never counted in `closedSeen`.
        if (String(url) === '/api/approval-chime/sessions') return { ok: true, status: 200, json: async () => ({ ok: true, revision: 0, sessions: {} }) };
        const response = await fetch(`http://127.0.0.1:${server.port}${url}`, init);
        closedSeen.push({ url, status: response.status });
        return response;
      },
    });
    const closedTree = closed.mountCard({}).render();
    S.deep('② nothing named with the uppercase id renders', optionRows(closedTree).map((row) => row.value), ['chime', 'bell', 'beep']);
    closed.diagnostics.preview();
    await waitFor(() => closed.stats().previews > 0 || closed.stats().suppressedFailed > 0, 2000);
    S.note('previewing with the uppercase document against the real route', { requests: closedSeen, suppressedFailed: closed.stats().suppressedFailed, previews: closed.stats().previews, lastError: closed.audio().lastError, lastTone: closed.stats().lastTone });
    S.same('③ the fallback tone really plays (no 404, no suppressedFailed)', JSON.stringify([closed.stats().previews, closed.stats().suppressedFailed]), JSON.stringify([1, 0]));
    S.same('③ and the audio route was never contacted at all', JSON.stringify(closedSeen), JSON.stringify([]));
    S.same('③ the last played tone is the fallback', closed.stats().lastTone, 'chime');

    // rev-6 N3 ④: the lowercase path is untouched — real route, real file, real play.
    const lowerSeen = [];
    const lowerDoc = boot({
      scopeValue: { enabled: true, volume: 70, tone: `custom:${LOWER}`, custom: [{ id: LOWER, name: 'lower.wav' }] },
      fetch: async (url, init) => {
        // rev-10 boot read — see the note above.
        if (String(url) === '/api/approval-chime/sessions') return { ok: true, status: 200, json: async () => ({ ok: true, revision: 0, sessions: {} }) };
        const response = await fetch(`http://127.0.0.1:${server.port}${url}`, init);
        lowerSeen.push({ url, status: response.status, ok: response.ok });
        return response;
      },
    });
    const lowerTree = lowerDoc.mountCard({}).render();
    S.deep('④ the lowercase roster renders first, before the built-ins', optionRows(lowerTree).map((row) => row.value), [`custom:${LOWER}`, 'chime', 'bell', 'beep']);
    S.same('④ the stored lowercase tone is kept as-is', lowerDoc.diagnostics.settings().tone, `custom:${LOWER}`);
    const lowerPlayed = lowerDoc.diagnostics.preview();
    const lowerWait = await waitFor(() => lowerDoc.stats().previews > 0 || lowerDoc.stats().suppressedFailed > 0, 3000);
    await settle(6);
    S.note('previewing the lowercase tone against the real route', { played: lowerPlayed, wait: lowerWait, requests: lowerSeen, previews: lowerDoc.stats().previews, suppressedFailed: lowerDoc.stats().suppressedFailed, bufferSources: lowerDoc.recorder.bufferSources.length, lastError: lowerDoc.audio().lastError });
    S.deep('④ the real route answered 200 for that id', lowerSeen.map((entry) => entry.status), [200]);
    S.same('④ it plays through the real route (one fetch, one buffer source, no failure)', JSON.stringify([lowerDoc.stats().previews, lowerDoc.stats().suppressedFailed, lowerDoc.recorder.bufferSources.length]), JSON.stringify([1, 0, 1]));
    removePlanted([LOWER]);
  }

  /* ---------------------------------------------- D3: exact-name file lookup */

  S.group('D3 — exact basename + known extension, never a prefix scan');
  {
    plantAudio(LOWER, 'aaa', bytesFor('aaa'));
    plantAudio(LOWER, 'mp3', bytesFor('mp3'));
    const listing = snapshotAudioDir().filter((name) => name.startsWith(LOWER));
    S.note('planted files', listing);
    S.same('both files really exist', listing.length, 2);

    const served = await httpJson(server.port, { method: 'GET', path: `${ROUTE}/${LOWER}`, agent: false });
    S.same('GET answers 200', served.status, 200);
    S.same('GET serves the .mp3 content type (not the .aaa stray)', served.headers['content-type'], 'audio/mpeg');
    S.same('GET serves the .mp3 BYTES', served.raw.equals(bytesFor('mp3')), true);

    const head = await httpJson(server.port, { method: 'HEAD', path: `${ROUTE}/${LOWER}`, agent: false });
    S.same('HEAD reports the .mp3 length', JSON.stringify([head.status, head.headers['content-length'], head.raw.length]), JSON.stringify([200, String(bytesFor('mp3').length), 0]));

    const removed = await httpJson(server.port, { method: 'DELETE', path: `${ROUTE}/${LOWER}`, agent: false });
    S.same('DELETE answered removed:true', JSON.stringify([removed.status, removed.json.removed]), JSON.stringify([200, true]));
    S.same('the .mp3 is gone', readAudio(LOWER, 'mp3'), null);
    S.check('the .aaa stray is STILL there (nothing wrong was deleted)', readAudio(LOWER, 'aaa') !== null, JSON.stringify(snapshotAudioDir().filter((name) => name.startsWith(LOWER))));
    const again = await httpJson(server.port, { method: 'DELETE', path: `${ROUTE}/${LOWER}`, agent: false });
    S.same('a second DELETE is idempotent', JSON.stringify([again.status, again.json.removed]), JSON.stringify([200, false]));
    removePlanted(plantedIds);

    // A file with no extension is not a candidate; nor is a directory.
    plantAudio(LOWER, 'wav', bytesFor('bare'));
    const bare = await httpJson(server.port, { method: 'GET', path: `${ROUTE}/${LOWER}`, agent: false });
    S.same('a file with a known extension is still served after the sweep', bare.status, 200);
    removePlanted(plantedIds);

    const dirPath = join(ensureAudioDir(), `${LOWER}.mp3`);
    const { mkdirSync } = await import('node:fs');
    mkdirSync(dirPath, { recursive: true });
    plantedDirs.push(dirPath);
    const dirAnswer = await httpJson(server.port, { method: 'GET', path: `${ROUTE}/${LOWER}`, agent: false });
    S.note('a DIRECTORY named <id>.mp3 (only reachable by hand)', { status: dirAnswer.status, body: dirAnswer.json });
    S.check('OBSERVATION: a directory with a matching name yields a clean JSON error, not a crash', dirAnswer.status === 500 || dirAnswer.status === 404, JSON.stringify(dirAnswer.json));
  }

  /* ------------------------------------------------- D4/F5: code-point clamp */

  S.group('D4/F5 — the display name is bounded by CODE POINTS on both halves');
  {
    S.same('the host exports the bound it promises', server.host.NAME_LIMIT, 120);
    const loneSurrogate = (text) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);
    /** A request that dies at the socket layer is a result, not a crash. */
    const safeJson = async (options) => {
      try {
        return await httpJson(server.port, options);
      } catch (error) {
        return { status: null, headers: {}, raw: Buffer.alloc(0), json: null, networkError: error.code === undefined ? String(error.message) : error.code };
      }
    };
    const cases = [
      ['emoji sitting exactly on the old UTF-16 boundary', `${'x'.repeat(119)}😀tail.wav`],
      ['emoji one code point past the boundary', `${'x'.repeat(120)}😀tail.wav`],
      ['a 5 000-character name', `${'y'.repeat(5000)}.wav`],
      ['control bytes mixed in', 'a\u0007b\u001fc.wav'],
    ];
    for (const [label, name] of cases) {
      const answer = await safeJson({ method: 'POST', path: ROUTE, headers: { 'x-chime-name': encodeURIComponent(name), 'content-type': 'audio/wav', connection: 'close' }, body: bytesFor('clamp'), agent: false });
      if (answer.status !== 200) {
        S.fail(`${label}: expected 200`, JSON.stringify(answer.json === null ? answer.networkError : answer.json));
        continue;
      }
      plantedIds.push(answer.json.id);
      const points = Array.from(answer.json.name).length;
      const expected = Math.min(points, 120);
      S.same(`${label}: stored name is ≤ 120 code points`, points <= 120, true);
      const hostFormula = Array.from(name.replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, 120).join('');
      S.same(`${label}: equals strip-control-bytes + trim + code-point bound`, answer.json.name, hostFormula);
      S.same(`${label}: the bound really is applied (no unbounded name survives)`, Array.from(answer.json.name).length <= 120, true);
      S.check(`${label}: NO lone surrogate in the stored name`, loneSurrogate(answer.json.name) === false, `tail=${JSON.stringify(answer.json.name.slice(-12))}`);
      if (label === 'emoji sitting exactly on the old UTF-16 boundary') {
        S.same('the emoji survived the cut instead of becoming U+FFFD', Array.from(answer.json.name).at(-1), '😀');
        S.deep('UTF-16 length is 121 while code points are 120 (a UTF-16 slice would have cut here)', [answer.json.name.length, expected], [121, 120]);
      }
    }

    // How could a 200 000-character name ever reach the route at all?
    const overflow = await safeJson({ method: 'POST', path: ROUTE, headers: { 'x-chime-name': encodeURIComponent(`${'z'.repeat(20_000)}.wav`), 'content-type': 'audio/wav', connection: 'close' }, body: bytesFor('overflow'), agent: false });
    S.note('a 20 000-character header value (≈60 KB encoded)', { status: overflow.status, networkError: overflow.networkError, body: overflow.json });
    S.check('OBSERVATION: an over-long header never reaches the route (the carrier refuses it first), so a 200k name can only come from a hand-edited settings document', overflow.status !== 200, JSON.stringify(overflow.json === null ? overflow.networkError : overflow.json));

    // The browser half must apply the same bound, with the same code-point rule.
    const hostile = `${'x'.repeat(119)}😀tail.wav`;
    const huge = `${'h'.repeat(200_000)}.wav`;
    const clientProbe = boot({
      scopeValue: { enabled: true, volume: 70, tone: 'chime', custom: [{ id: uuid(62), name: hostile }, { id: uuid(63), name: 'a\u0007b.wav' }, { id: uuid(64), name: huge }] },
      fetch: makeFetch({}),
    });
    const rows = optionRows(clientProbe.mountCard({}).render());
    S.note('browser-half labels', [{ value: rows[0].value, points: Array.from(rows[0].label).length, tail: rows[0].label.slice(-6) }, rows[1], { value: rows[2].value, points: Array.from(rows[2].label).length }]);
    S.same('browser half: 120 code points for the emoji-boundary name', Array.from(rows[0].label).length, 120);
    S.same('browser half: identical to the host result for the same input', rows[0].label, Array.from(hostile).slice(0, 120).join(''));
    S.same('browser half: control bytes are stripped like the host does', rows[1].label, 'ab.wav');
    S.same('browser half: no lone surrogate', loneSurrogate(rows[0].label), false);
    S.same('browser half: a 200 000-character name is bounded to 120 code points', Array.from(rows[2].label).length, 120);
  }

  /* ------------------------------------------- R-RESID: blank names fall back */

  S.group('R-RESID (rev-6) — a name of nothing but whitespace falls back to the id');
  {
    const idBlank = uuid(65);
    const idTabs = uuid(66);
    const idEmpty = uuid(67);
    const idStripped = uuid(68);
    const client = boot({
      scopeValue: {
        enabled: true,
        volume: 70,
        tone: 'chime',
        custom: [
          { id: idBlank, name: '   ' },
          { id: idTabs, name: '\t \n ' },
          { id: idEmpty, name: '' },
          { id: idStripped, name: '\u0007\u0001' },
        ],
      },
      fetch: makeFetch({}),
    });
    const rendered = optionRows(client.mountCard({}).render());
    S.note('R-RESID rendered rows', rendered.map((row) => ({ value: row.value, label: row.label })));
    S.deep('all four entries still render (they are not dropped)', rendered.slice(0, 4).map((row) => row.value), [`custom:${idBlank}`, `custom:${idTabs}`, `custom:${idEmpty}`, `custom:${idStripped}`]);
    S.deep('every blank name now shows the id instead of an empty label', rendered.slice(0, 4).map((row) => row.label), [idBlank, idTabs, idEmpty, idStripped]);
    S.check('none of the four labels is blank (the empty-row bug is gone)', rendered.slice(0, 4).every((row) => row.label.trim().length > 0), JSON.stringify(rendered.slice(0, 4).map((row) => row.label)));

    // The HOST applies the same rule to a legitimate upload of a whitespace name.
    const hostBlank = await httpJson(server.port, { method: 'POST', path: ROUTE, headers: { 'x-chime-name': encodeURIComponent('   .wav'), 'content-type': 'audio/wav', connection: 'close' }, body: bytesFor('blank'), agent: false });
    S.same('the host accepts a whitespace-padded name', hostBlank.status, 200);
    if (hostBlank.status === 200) plantedIds.push(hostBlank.json.id);
    S.note('host-side name for "   .wav"', hostBlank.json === null ? null : hostBlank.json.name);
    S.check('the host trims it rather than storing blanks', typeof hostBlank.json.name === 'string' && hostBlank.json.name.trim().length > 0, JSON.stringify(hostBlank.json));
  }

  /* --------------------------------------------------------- F6: extensions */

  S.group('F6 — trimmed names, last-dot extension, MIME fallback');
  {
    const table = [
      ['ring.mp3', 200, 'mp3', 'ring.mp3'],
      ['ring.mp3 ', 200, 'mp3', 'ring.mp3'],
      [' .mp3', 200, 'mp3', '.mp3'],
      ['..mp3', 200, 'mp3', '..mp3'],
      ['x.MP3', 200, 'mp3', 'x.MP3'],
      ['C:\\music\\song.MP3', 200, 'mp3', 'song.MP3'],
      ['/etc/passwd.wav', 200, 'wav', 'passwd.wav'],
      ['ring .mp3', 200, 'mp3', 'ring .mp3'],
      ['a.', 415, null, null],
      ['a.aaa', 415, null, null],
      ['note txt', 415, null, null],
      ['ring. mp3', 415, null, null],
      ['   ', 415, null, null],
      ['', 415, null, null],
    ];
    for (const [raw, status, ext, name] of table) {
      const answer = await httpJson(server.port, { method: 'POST', path: ROUTE, headers: { 'x-chime-name': encodeURIComponent(raw), 'content-type': 'audio/wav', connection: 'close' }, body: bytesFor(raw), agent: false });
      if (status === 200) {
        plantedIds.push(answer.json.id);
        S.same(`"${raw}" → accepted as .${ext}`, JSON.stringify([answer.status, answer.json.ext, answer.json.name]), JSON.stringify([200, ext, name]));
        S.check(`"${raw}" → stored file is <id>.${ext}`, readAudio(answer.json.id, ext) !== null, JSON.stringify(snapshotAudioDir().filter((entry) => entry.startsWith(answer.json.id))));
      } else {
        S.same(`"${raw}" → refused with a readable 415`, JSON.stringify([answer.status, typeof answer.json.error]), JSON.stringify([415, 'string']));
      }
    }

    // Part 3: the browser half's own naming, measured through its real request,
    // and then accepted by the real route.
    const picks = [
      ['no extension, typed audio/mpeg', makeFile('recording', 4096, 'audio/mpeg'), 'recording.mp3'],
      ['empty name, typed audio/mpeg', makeFile('', 4096, 'audio/mpeg'), 'audio.mp3'],
      ['name has an extension already', makeFile('already.wav', 4096, 'audio/mpeg'), 'already.wav'],
      ['unknown type falls back to wav', makeFile('mystery', 4096, 'application/octet-stream'), 'mystery.wav'],
      ['ogg', makeFile('voice', 4096, 'audio/ogg'), 'voice.ogg'],
      ['padded name, no extension', makeFile('  spaced  ', 4096, 'audio/mpeg'), 'spaced.mp3'],
      ['dotted name with no real extension', makeFile('y.', 4096, 'audio/mpeg'), 'y..mp3'],
    ];
    for (const [label, file, expectedHeader] of picks) {
      let seenHeader = null;
      const stub = makeFetch({
        post: (call) => {
          seenHeader = call.init.headers['x-chime-name'];
          return { json: { ok: true, id: uuid(70), name: 'probe', ext: 'mp3', type: 'audio/mpeg', bytes: 4 } };
        },
        get: { bytes: new ArrayBuffer(4) },
      });
      const probe = boot({ scopeValue: { enabled: true, volume: 70, tone: 'chime', custom: [] }, fetch: stub });
      const driver = probe.mountCard({});
      chooseFile(driver.render(), file);
      await settle(8);
      const decoded = seenHeader === null ? null : decodeURIComponent(seenHeader);
      S.same(`${label}: the browser sends "${expectedHeader}"`, decoded, expectedHeader);
      const answer = await httpJson(server.port, { method: 'POST', path: ROUTE, headers: { 'x-chime-name': seenHeader === null ? '' : seenHeader, 'content-type': file.type, connection: 'close' }, body: bytesFor(label), agent: false });
      if (answer.status === 200) plantedIds.push(answer.json.id);
      S.same(`${label}: the real route accepts that header`, answer.status, 200);
    }
  }
} finally {
  const removed = removePlanted(plantedIds);
  for (const path of plantedDirs) {
    try {
      (await import('node:fs')).rmSync(path, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
  S.note('files removed by the probe', removed);
  const after = snapshotAudioDir();
  S.check('the audio directory is back to its pre-probe state', after.join(',') === dirBefore.join(','), `before=[${dirBefore.join(',')}] after=[${after.join(',')}]`);
  S.note('audio dir path', AUDIO_DIR);
  await new Promise((tick) => setTimeout(tick, 200));
  S.deep('no uncaught exception / unhandled rejection in the whole probe', crash, []);
  await server.stop();
}

S.done();
