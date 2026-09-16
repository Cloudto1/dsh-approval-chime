/**
 * probe-10 — "a plugin must never take the profile's boot down" (attack surface 8).
 *
 * `apply()` is called with every context shape the brief lists — no webServer,
 * `webServer.register` throwing, `ctx.get` throwing, `ctx.inject` throwing — plus
 * hostile extras (Proxy context, throwing getters, apply(null), a logger that
 * throws). Every shape must return without throwing and log warnings only.
 *
 * Faithfulness note: cordis's `effect(callback)` executes the callback
 * SYNCHRONOUSLY and rethrows a synchronous throw
 * (@deepseek-ai/cordis/lib/index.js:1249 `task = this._execute(runner)`,
 * :1261 `throw reason`), so an `effect: (cb) => cb()` stub is the real shape,
 * and the plugin's own try/catch around `webCtx.effect(...)` is what contains a
 * throwing `server.register`.
 *
 * Run: node dsh-approval-chime/verify-independent/probe-10-startup-resilience.mjs
 */

import { join } from 'node:path';

import { PLUGIN_DIR, createLog, failFastOnCrash, settle, sha256, trackHazards } from './kit/rev4-kit.mjs';

const plugin = await import('../lib/index.js');
const log = createLog('probe-10-startup-resilience');
const hazards = trackHazards();
failFastOnCrash(log, hazards);

log.note('command: node dsh-approval-chime/verify-independent/probe-10-startup-resilience.mjs');
log.note(`node ${process.version} / ${process.platform}`);
log.note(`lib/index.js sha256 ${sha256(join(PLUGIN_DIR, 'lib', 'index.js'))}`);

const ROUTE = plugin.AUDIO_ROUTE;
const allShapes = [];

function loggerInto(lines) {
  return {
    info: (line) => lines.push(['info', line]),
    warn: (line) => lines.push(['warn', line]),
    error: (line) => lines.push(['error', line]),
    debug: (line) => lines.push(['debug', line]),
  };
}

function workingServer(routes) {
  return {
    register(route) {
      routes.push(route);
      return () => {};
    },
  };
}

/**
 * Run one context shape through `apply()` and report what it did.
 * @param label - what the shape is.
 * @param build - builds the ctx, returning `{ ctx, routes }`.
 * @param expectations - `{ routes, warnIncludes }`.
 */
function shape(label, build, expectations = {}) {
  const lines = [];
  const consoleWarns = [];
  const previous = console.warn;
  console.warn = (...args) => {
    consoleWarns.push(args.map(String).join(' '));
  };
  const { ctx, routes } = build(lines);
  let threw = null;
  try {
    plugin.apply(ctx);
  } catch (error) {
    threw = error;
  }
  console.warn = previous;
  const warns = lines.filter(([level]) => level === 'warn').map(([, line]) => line);
  const errors = lines.filter(([level]) => level === 'error').map(([, line]) => line);
  const infos = lines.filter(([level]) => level === 'info').map(([, line]) => line);
  allShapes.push({ label, threw, warns, errors, infos, routes: routes.length, consoleWarns });

  log.raw(label, `threw=${threw === null ? 'no' : `YES (${threw.message})`} | routes=${routes.length} | warns=${warns.length} | errors=${errors.length} | console.warn=${consoleWarns.length}`);
  for (const line of warns) log.raw(`  ${label} warn`, line);
  for (const line of infos) log.raw(`  ${label} info`, line);
  log.check(`${label}: apply() does not throw`, threw === null, threw === null ? 'returned normally' : `${threw.name}: ${threw.message}`);
  log.check(`${label}: nothing is logged at error level`, errors.length === 0, errors.join(' | '));
  if (expectations.warnIncludes !== undefined) {
    log.check(
      `${label}: warns about it ("${expectations.warnIncludes}")`,
      warns.some((line) => line.includes(expectations.warnIncludes)),
      warns.join(' | ') || '(no warn lines)',
    );
  }
  if (expectations.warnCount) {
    log.check(`${label}: exactly ${expectations.warnCount} warn line(s)`, warns.length === expectations.warnCount, `got ${warns.length}: ${warns.join(' | ')}`);
  }
  if (expectations.routes !== undefined) {
    log.equal(`${label}: routes registered`, routes.length, expectations.routes);
  }
  return { lines, routes, warns, consoleWarns };
}

log.section('1. no web server at all (the shape a headless profile has)');
shape(
  'no get / no inject / no webServer',
  (lines) => ({ ctx: { logger: loggerInto(lines), effect: (callback) => callback() }, routes: [] }),
  { routes: 0, warnIncludes: 'web server unavailable' },
);
shape(
  'ctx.get("webServer") returns undefined, ctx.inject absent',
  (lines) => ({ ctx: { logger: loggerInto(lines), effect: (callback) => callback(), get: () => undefined }, routes: [] }),
  { routes: 0, warnIncludes: 'web server unavailable' },
);
shape(
  'ctx.get("webServer") returns null',
  (lines) => ({ ctx: { logger: loggerInto(lines), effect: (callback) => callback(), get: () => null }, routes: [] }),
  { routes: 0, warnIncludes: 'web server unavailable' },
);

log.section('2. webServer.register throws');
shape(
  'register throws (via ctx.get)',
  (lines) => ({
    ctx: {
      logger: loggerInto(lines),
      effect: (callback) => callback(),
      get: (name) => (name === 'webServer' ? { register: () => { throw new Error('duplicate route'); } } : undefined),
    },
    routes: [],
  }),
  { routes: 0, warnIncludes: 'audio route registration failed' },
);
shape(
  'register throws (via ctx.inject)',
  (lines) => ({
    ctx: {
      logger: loggerInto(lines),
      effect: (callback) => callback(),
      inject: (names, callback) => callback({ webServer: { register: () => { throw new Error('duplicate route'); } }, effect: (inner) => inner() }),
    },
    routes: [],
  }),
  { routes: 0, warnIncludes: 'audio route registration failed' },
);
shape(
  'ctx.effect itself throws when the route is registered',
  (lines) => ({
    ctx: {
      logger: loggerInto(lines),
      effect: () => {
        throw new Error('effect service is broken');
      },
      get: () => ({ register: () => () => {} }),
    },
    routes: [],
  }),
  { routes: 0, warnIncludes: 'audio route registration failed' },
);
shape(
  'the web server has no effect service (the plugin uses the CTX effect)',
  (lines) => {
    const routes = [];
    return { ctx: { logger: loggerInto(lines), effect: (callback) => callback(), get: () => workingServer(routes) }, routes };
  },
  { routes: 1 },
);

log.section('3. ctx.get throws');
shape(
  'get throws, inject available -> route still registered',
  (lines) => {
    const routes = [];
    return {
      ctx: {
        logger: loggerInto(lines),
        effect: (callback) => callback(),
        get: () => {
          throw new Error('no live cordis context');
        },
        inject: (names, callback) => callback({ webServer: workingServer(routes), effect: (inner) => inner() }),
      },
      routes,
    };
  },
  { routes: 1 },
);
shape(
  'get throws, no inject, ctx.webServer present -> route registered',
  (lines) => {
    const routes = [];
    return {
      ctx: { logger: loggerInto(lines), effect: (callback) => callback(), get: () => { throw new Error('boom'); }, webServer: workingServer(routes) },
      routes,
    };
  },
  { routes: 1 },
);
shape(
  'get throws, no inject, no webServer -> warn only',
  (lines) => ({ ctx: { logger: loggerInto(lines), effect: (callback) => callback(), get: () => { throw new Error('boom'); } }, routes: [] }),
  { routes: 0, warnIncludes: 'web server unavailable' },
);
shape(
  'get is a THROWING GETTER',
  (lines) => ({ ctx: { logger: loggerInto(lines), effect: (callback) => callback(), get get() { throw new Error('getter boom'); } }, routes: [] }),
  { routes: 0, warnIncludes: 'web server unavailable' },
);

log.section('4. ctx.inject throws');
shape(
  'inject throws',
  (lines) => ({
    ctx: {
      logger: loggerInto(lines),
      effect: (callback) => callback(),
      inject: () => {
        throw new Error('inject exploded');
      },
    },
    routes: [],
  }),
  { routes: 0, warnIncludes: 'audio route skipped' },
);
shape(
  'inject is a THROWING GETTER',
  (lines) => ({ ctx: { logger: loggerInto(lines), effect: (callback) => callback(), get get() { throw new Error('a'); }, get inject() { throw new Error('b'); } }, routes: [] }),
  { routes: 0, warnIncludes: 'audio route skipped' },
);
shape(
  'inject ignores the request (never calls back)',
  (lines) => ({ ctx: { logger: loggerInto(lines), effect: (callback) => callback(), inject: () => {} }, routes: [] }),
  { routes: 0 },
);

log.section('5. hostile extras');
shape('apply(null)', () => ({ ctx: null, routes: [] }), {});
shape('apply(undefined)', () => ({ ctx: undefined, routes: [] }), {});
shape(
  'a Proxy context whose every property getter throws',
  () => ({ ctx: new Proxy({}, { get() { throw new Error('hostile proxy'); }, has() { throw new Error('hostile proxy'); } }), routes: [] }),
  {},
);
shape(
  'a logger whose warn() throws',
  (lines) => ({
    ctx: {
      logger: {
        info: () => {},
        warn: () => {
          throw new Error('logger.warn broken');
        },
        error: () => {},
        debug: () => {},
      },
      effect: (callback) => callback(),
    },
    routes: [],
  }),
  {},
);
shape(
  'a logger that is only a getter that throws',
  () => ({ ctx: { get logger() { throw new Error('logger getter'); }, effect: (callback) => callback() }, routes: [] }),
  {},
);
shape(
  'no logger at all (console fallback)',
  () => ({ ctx: { effect: (callback) => callback() }, routes: [] }),
  {},
);
shape(
  'ctx.settings.register throws',
  (lines) => ({
    ctx: {
      logger: loggerInto(lines),
      effect: (callback) => callback(),
      get: () => undefined,
      settings: {
        register: () => {
          throw new Error('namespace taken');
        },
        describe: () => [],
      },
    },
    routes: [],
  }),
  { routes: 0, warnIncludes: 'settings namespace' },
);
shape(
  'ctx.settings.describe throws',
  (lines) => ({
    ctx: {
      logger: loggerInto(lines),
      effect: (callback) => callback(),
      get: () => undefined,
      settings: {
        register: () => ({ set: () => {}, unset: () => {} }),
        describe: () => {
          throw new Error('settings store offline');
        },
      },
    },
    routes: [],
  }),
  { routes: 0, warnIncludes: 'settings directory unreadable' },
);

log.section('6. the positive control and the deferred-effect caveat');
const control = shape(
  'a working webServer -> exactly one prefix route',
  (lines) => {
    const routes = [];
    return { ctx: { logger: loggerInto(lines), effect: (callback) => callback(), get: (name) => (name === 'webServer' ? workingServer(routes) : undefined) }, routes };
  },
  { routes: 1 },
);
log.equal('the claimed path is the audio route', control.routes[0]?.path, ROUTE);
log.equal('the claimed kind is prefix', control.routes[0]?.kind, 'prefix');
log.equal('the handler is callable', typeof control.routes[0]?.handler, 'function');
const deferred = shape(
  'effect stores the callback and never runs it',
  (lines) => {
    const pending = [];
    return { ctx: { logger: loggerInto(lines), effect: (callback) => pending.push(callback), get: () => ({ register: () => { throw new Error('too late'); } }) }, routes: [], pending };
  },
  { routes: 0 },
);
log.note(
  `deferred effect: apply() returned without throwing, but invoking the stored callback later throws (${deferred.routes.length === 0 ? 'the callback was never run' : 'ran'}) — not reachable on the real host: cordis effect() executes synchronously (lib/index.js:1249/1261)`,
);

log.section('7. summary of every shape');
for (const entry of allShapes) {
  log.raw(
    entry.label,
    `threw=${entry.threw === null ? 'no' : entry.threw.message} routes=${entry.routes} warns=${entry.warns.length} errors=${entry.errors.length} consoleFallback=${entry.consoleWarns.length}`,
  );
}
log.check(
  'no shape threw',
  allShapes.every((entry) => entry.threw === null),
  allShapes.filter((entry) => entry.threw !== null).map((entry) => entry.label).join(' | '),
);
log.check(
  'no shape logged at error level',
  allShapes.every((entry) => entry.errors.length === 0),
  allShapes.flatMap((entry) => entry.errors).join(' | '),
);
log.check(
  'every degraded shape that has no logger at all still reached console.warn',
  allShapes.every((entry) => entry.warns.length > 0 || entry.consoleWarns.length > 0 || entry.routes > 0 || entry.label.startsWith('apply(') || entry.label.includes('inject ignores')),
  allShapes.filter((entry) => entry.warns.length === 0 && entry.consoleWarns.length === 0).map((entry) => entry.label).join(' | '),
);
log.check('the positive control differs from the degraded shapes (the route IS the difference)', control.routes.length > 0, String(control.routes.length));

await settle(4);
log.equal('no unhandled rejection during the run', hazards.rejections.length, 0);
log.equal('no uncaught exception during the run', hazards.exceptions.length, 0);
if (hazards.rejections.length > 0) log.raw('rejections', hazards.rejections.join('\n'));
if (hazards.exceptions.length > 0) log.raw('exceptions', hazards.exceptions.join('\n'));

const failures = log.summary();
hazards.stop();
process.exitCode = failures === 0 ? 0 : 1;
