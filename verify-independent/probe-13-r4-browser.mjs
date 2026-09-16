/**
 * Independent adversarial probe 13 (rev-4, task t1) — the checks that need a real
 * browser, and what could be measured instead.
 *
 * The intended work here was: open a real Edge window, apply the plugin's exact
 * stylesheet, open the <select> picker, and MEASURE the three-row window and the
 * option row height; plus a positive control that the injection payload really
 * executes when inserted as HTML in that engine.
 *
 * That turned out to be impossible in this sandbox, and the probe records the
 * evidence rather than quietly skipping: Chromium's Mojo IPC needs NAMED PIPES,
 * and the file sandbox denies them ("platform_channel.cc:183 Check failed: . :
 * 拒绝访问 (0x5)"), so every browser process dies during startup. Section A is
 * that attempt, with the raw log kept under _raw/.
 *
 * Section B tries the forensic substitute — read the UA stylesheet for
 * `::picker(select)` straight out of the installed Edge binary — and reports
 * honestly that it is inconclusive (the control string is not found either, so
 * the stylesheet is not stored verbatim and the box model stays unknown).
 *
 * Section C measures what an independent DOM implementation (domino, the HTML
 * parser turndown uses) does with the payload: it becomes a live <img> element
 * through innerHTML, and a pure TEXT node through textContent.
 *
 * Everything that stays unmeasured is listed in section D. Nothing here is
 * reported as a pass.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, mkdirSync, openSync, readFileSync, closeSync, rmSync } from 'node:fs';
import { open as fsOpen } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { suite } from './kit/rev4.mjs';
import { findBrowser } from './kit/cdp.mjs';

const S = suite('probe-13 rev-4 real-browser attempt + substitutes (independent)');
const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(HERE, '_raw');
mkdirSync(RAW_DIR, { recursive: true });
const PAYLOAD = '<img src=x onerror="window.__XSS__=1">.wav';

/* ------------------------------------------- A: the browser attempt, with the log */

S.group('A — can a real browser engine be driven from this sandbox?');
{
  const executable = findBrowser();
  S.check('a browser binary exists on this machine', executable !== null, executable === null ? 'none found' : executable);
  if (executable !== null) {
    const profileDir = mkdtempSync(join(tmpdir(), 'probe13-browser-'));
    const logPath = join(RAW_DIR, 'ind-probe-13-browser-launch.log');
    const logFd = openSync(logPath, 'w');
    const child = spawn(
      executable,
      [
        '--headless=new',
        '--single-process',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-crash-reporter',
        '--no-first-run',
        `--user-data-dir=${profileDir}`,
        '--remote-debugging-port=0',
        'about:blank',
      ],
      { stdio: ['ignore', logFd, logFd], windowsHide: true },
    );
    await new Promise((tick) => setTimeout(tick, 9000));
    closeSync(logFd);
    const portFile = join(profileDir, 'DevToolsActivePort');
    const published = existsSync(portFile);
    const log = readFileSync(logPath, 'utf8');
    S.note('launch log (tail)', log.split(/\r?\n/).filter((line) => line.length > 0).slice(-7));
    let cdpReachable = false;
    let cdpDetail = 'no DevToolsActivePort was published';
    if (published) {
      const port = Number(readFileSync(portFile, 'utf8').split(/\r?\n/)[0]);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(4000) });
        const body = await response.json();
        cdpReachable = true;
        cdpDetail = `CDP answered on port ${port}: ${body.Browser}`;
      } catch (error) {
        cdpDetail = `port ${port} was published, but nothing answers: ${String(error.message)}`;
      }
    }
    S.check('a real browser engine could be driven (CDP reachable)', cdpReachable === true, cdpDetail);
    S.check('the log shows the sandbox denying Chromium its IPC channel', /platform_channel\.cc:\d+\] Check failed/.test(log) && /拒绝访问|Access is denied/.test(log), `log: ${logPath}`);
    S.note('consequence', 'no engine-level measurement of the picker layout, of <select> rendering, or of script execution is possible in this environment; sections B/C substitute, section D lists what stays open.');
    try {
      child.kill();
    } catch {
      /* the process already died from the Mojo failure */
    }
    await new Promise((tick) => setTimeout(tick, 300));
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* a leftover temp profile is not a failure */
    }
  }
}

/* --------------------------- B: the UA stylesheet, read out of the browser binary */

S.group('B — is the UA rule for ::picker(select) readable from the Edge install?');
{
  const binary = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\153.0.4234.32\\msedge.dll';
  const present = existsSync(binary);
  S.check('the Edge binary is readable', present, present ? binary : 'not found');
  if (present) {
    const scan = async (needle) => {
      const handle = await fsOpen(binary, 'r');
      const { size } = await handle.stat();
      const chunk = Buffer.allocUnsafe(8 * 1024 * 1024);
      const buffer = Buffer.from(needle, 'latin1');
      let offset = 0;
      let carry = Buffer.alloc(0);
      let found = -1;
      while (offset < size && found < 0) {
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, offset);
        if (bytesRead <= 0) break;
        const window = Buffer.concat([carry, chunk.subarray(0, bytesRead)]);
        const index = window.indexOf(buffer);
        if (index >= 0) found = offset - carry.length + index;
        carry = window.subarray(Math.max(0, window.length - buffer.length));
        offset += bytesRead;
      }
      await handle.close();
      return { found, size };
    };
    const control = await scan('input[type="checkbox"]');
    const uaProbe = await scan('picker(select)');
    S.note(`control needle "input[type='checkbox']" in a ${(control.size / 1024 / 1024).toFixed(0)} MB binary`, control.found >= 0 ? `found at ${control.found}` : 'NOT FOUND');
    S.note('needle "picker(select)"', uaProbe.found >= 0 ? `found at ${uaProbe.found}` : 'not found');
    S.check('the UA stylesheet is stored verbatim in the binary (control found)', control.found >= 0, control.found >= 0 ? 'yes' : 'no — the search method cannot decide the UA question at all, so the picker box model stays unknown');
    if (uaProbe.found >= 0) {
      const handle = await fsOpen(binary, 'r');
      const buffer = Buffer.allocUnsafe(1600);
      await handle.read(buffer, 0, 1600, Math.max(0, uaProbe.found - 800));
      await handle.close();
      const text = buffer.toString('latin1').replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '.');
      S.note('the window around that hit', text.slice(0, 400));
      S.check('the hit is CSS, not the pseudo-element name table', /box-sizing|max-height|padding:/.test(text), 'the window is a Blink name table ("-internal-option-slot", "select-options", …), so no box-sizing conclusion can be drawn from the binary');
    }
  }
}

/* ------------------------------ C: an independent DOM implementation, for the sink */

S.group('C — what a real HTML parser does with the payload (domino)');
{
  const roots = [process.env.DSH_DOMINO_ROOT, 'C:/Users/28779/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/'].filter((root) => typeof root === 'string' && root.length > 0);
  let domino = null;
  let loadedFrom = null;
  for (const root of roots) {
    try {
      domino = createRequire(root)('@mixmark-io/domino');
      loadedFrom = root;
      break;
    } catch {
      /* try the next root */
    }
  }
  S.check('an independent HTML parser / DOM implementation is available', domino !== null, domino === null ? 'domino not found — section C skipped' : `@mixmark-io/domino 2.2.0 from ${loadedFrom}`);
  if (domino !== null) {
    const window = domino.createWindow('<html><body></body></html>');
    const document = window.document;

    // The dangerous path: parse the payload as HTML.
    const host = document.createElement('div');
    host.innerHTML = PAYLOAD;
    const injected = host.querySelector('img');
    S.check('innerHTML turns the payload into a live <img> element with an onerror attribute', injected !== undefined && injected !== null && injected.getAttribute('onerror') === 'window.__XSS__=1', injected === undefined || injected === null ? 'no element' : `outerHTML=${injected.outerHTML}`);
    S.same('innerHTML keeps the payload as markup (1 element child)', host.children.length, 1);

    // The path a React text child takes: a text node.
    const textHost = document.createElement('div');
    const option = document.createElement('option');
    option.textContent = PAYLOAD;
    textHost.appendChild(option);
    S.same('textContent yields exactly one node, and it is a TEXT node (nodeType 3)', option.childNodes.length === 1 ? option.childNodes[0].nodeType : -1, 3);
    S.same('the text node carries the payload verbatim', option.textContent, PAYLOAD);
    const forbidden = textHost.querySelector('img');
    S.check('no element is created through the text path', forbidden === undefined || forbidden === null, forbidden === undefined || forbidden === null ? 'none' : String(forbidden.outerHTML));
    S.same('serialising that text node escapes it', option.outerHTML, '<option>&lt;img src=x onerror="window.__XSS__=1"&gt;.wav</option>');
    S.note('what this does NOT prove', 'domino does not execute scripts and is not a browser engine, and React DOM — not this probe — decides that a string child becomes a text node. The engine-level execution control could not be run (section A).');
  }
}

/* --------------------------------------------------------------- D: what stays open */

S.group('D — recorded as UNPROVEN (not as pass)');
{
  const unproven = [
    'the real rendered height of the `::picker(select)` box in an engine, i.e. whether `max-height:92px` gives 3 full rows (content-box: 84px inner = exactly 3 rows) or 2.93 rows (border-box: 82px inner → the 3rd row cut by 2px)',
    'that a <select> whose value matches a rendered option really shows that row instead of blank (the sufficient condition — a matching option exists — IS verified; the engine behaviour is not)',
    'that the payload does not execute when the card is rendered by React in a browser (the text-child structure and the absence of any HTML sink are verified; React\'s own escaping and script execution are not)',
    "whether an unsupported browser's native popup honours `option{background-color/color}` (the claim in lib/client.js:966-970)",
  ];
  for (const item of unproven) S.note('unproven', item);
  S.check('the probe does not claim any of the above as verified', true, 'see docs/rev4-浏览器半独立验证.md, the 未证实项 section');
}

S.done();
