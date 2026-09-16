/**
 * A minimal Chrome-DevTools-Protocol client for the independent rev-4 pass.
 *
 * Written from scratch on Node's built-in `WebSocket` + `child_process`: no
 * puppeteer, no playwright, nothing installed. It launches a throwaway headless
 * Edge/Chrome profile under the OS temp directory and evaluates expressions in a
 * page, so the layout and DOM claims can be measured in a REAL browser engine
 * instead of being reasoned about from CSS text.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

export function findBrowser() {
  for (const path of BROWSER_CANDIDATES) if (existsSync(path)) return path;
  return null;
}

const sleep = (ms) => new Promise((tick) => setTimeout(tick, ms));

/** Open a CDP WebSocket and return `{ send, close }`. */
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let nextId = 1;
    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.id === undefined) return; // an event, not a reply
      const waiter = pending.get(message.id);
      if (waiter === undefined) return;
      pending.delete(message.id);
      if (message.error !== undefined) waiter.reject(new Error(`probe CDP error: ${JSON.stringify(message.error)}`));
      else waiter.resolve(message.result);
    });
    socket.addEventListener('error', (event) => reject(new Error(`probe CDP socket error: ${String(event && event.message ? event.message : event)}`)));
    socket.addEventListener('open', () => {
      resolve({
        send(method, params = {}, sessionId) {
          const id = nextId;
          nextId += 1;
          const payload = sessionId === undefined ? { id, method, params } : { id, method, params, sessionId };
          return new Promise((res, rej) => {
            pending.set(id, { resolve: res, reject: rej });
            socket.send(JSON.stringify(payload));
          });
        },
        close() {
          try {
            socket.close();
          } catch {
            /* already gone */
          }
        },
      });
    });
  });
}

/**
 * Launch a headless browser with a throwaway profile and attach one page.
 *
 * @param options.executablePath - override the browser binary.
 * @param options.windowSize - the viewport to lay out in.
 * @returns `{ evaluate, click, screenshot, close, browserVersion, profileDir }`
 */
export async function launchBrowser(options = {}) {
  const executable = options.executablePath === undefined ? findBrowser() : options.executablePath;
  if (executable === null) throw new Error('probe: no Edge/Chrome binary found');
  const profileDir = mkdtempSync(join(tmpdir(), 'dsh-verify-browser-'));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-sync',
    '--mute-audio',
    '--disable-features=Translate,MediaRouter',
    `--window-size=${options.windowSize === undefined ? '1200,1000' : options.windowSize}`,
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-port=0',
    'about:blank',
  ];
  const child = spawn(executable, args, { stdio: 'ignore', windowsHide: true });
  const portFile = join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + 25_000;
  let port = null;
  let wsPath = null;
  // NOTE: the launcher process hands off to the real browser and exits at once
  // (measured: exit code -2147483645 while DevToolsActivePort is still written),
  // so the loop must NOT stop on `child.exitCode !== null`.
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const [first, second] = readFileSync(portFile, 'utf8').split(/\r?\n/);
      if (first !== undefined && second !== undefined && first.length > 0 && second.length > 0) {
        port = Number(first);
        wsPath = second;
        break;
      }
    }
    await sleep(150);
  }
  if (port === null || wsPath === null) {
    try {
      child.kill();
    } catch {
      /* nothing to kill */
    }
    throw new Error('probe: the browser never published DevToolsActivePort');
  }

  const browserSocket = await connect(`ws://127.0.0.1:${port}${wsPath}`);
  const version = await browserSocket.send('Browser.getVersion');
  const { targetId } = await browserSocket.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browserSocket.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params = {}) => browserSocket.send(method, params, sessionId);
  await send('Page.enable');
  await send('Runtime.enable');

  const api = {
    browserVersion: version,
    profileDir,
    executable,
    /** Evaluate an expression in the page; throws with the page's own stack. */
    async evaluate(expression, awaitPromise = true) {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise,
        returnByValue: true,
        userGesture: true,
        includeCommandLineAPI: true,
      });
      if (result.exceptionDetails !== undefined) {
        const text = result.exceptionDetails.exception === undefined ? result.exceptionDetails.text : result.exceptionDetails.exception.description;
        throw new Error(`probe: page exception: ${String(text)}`);
      }
      return result.result === undefined ? undefined : result.result.value;
    },
    /** A trusted click (real user activation) at viewport coordinates. */
    async click(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
      return true;
    },
    async key(key, code) {
      const common = { key, code, windowsVirtualKeyCode: 0, nativeVirtualKeyCode: 0 };
      await send('Input.dispatchKeyEvent', { type: 'keyDown', ...common });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
      return true;
    },
    screenshot() {
      return send('Page.captureScreenshot', { format: 'png' });
    },
    async close() {
      try {
        await browserSocket.send('Browser.close');
      } catch {
        /* the browser may already be gone */
      }
      browserSocket.close();
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      await sleep(250);
      try {
        rmSync(profileDir, { recursive: true, force: true });
      } catch {
        /* a leftover temp profile is not a failure */
      }
    },
    process: child,
  };
  return api;
}
