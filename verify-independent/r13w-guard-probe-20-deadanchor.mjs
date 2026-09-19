/**
 * Independent probe 20 (task t6, verifier) -- the rev-13 / rev-14 session-bell APPEARANCE.
 *
 * WHY THIS PROBE EXISTS
 *   t3 (the independent review round) ran four UNDECLARED appearance mutations of the session
 *   bell against every existing independent probe and measured an EMPTY red set: the bell's
 *   look had no mutation coverage outside the author suite. probe-18's 131 assertions are about
 *   behaviour (attributes, requests, audio), and probe-11/17/19 read lib/client.js from disk and
 *   never name `.dacBell`. This probe closes that hole.
 *
 * WHY A NEW PROBE INSTEAD OF EXTENDING probe-11
 *   probe-11 is anchored on the card's `::picker(select)` box arithmetic and its shipped hash is
 *   quoted in three rounds of evidence (r13, r13v, r13-final). A separate probe keeps that
 *   artifact untouched, makes this round's addition a pure ADDITION in the assertion inventory,
 *   and lets the mutations be SOURCE-level (geometry constants and the rendered SVG), which
 *   probe-11's "mutate the injected stylesheet string" shape cannot express.
 *
 * WHAT IT READS (no author-harness assertion text is reused)
 *   - the REAL lib/client.js, evaluated as a classic script in this probe's own vm sandbox;
 *   - the stylesheet the bundle itself appended (`<style id="dsh-approval-chime/styles">`);
 *   - the console surface `window.__DSH_APPROVAL_CHIME__.sessionIcon`;
 *   - the rendered bell/caret, via this probe's own minimal function-component driver.
 *   Rules are resolved with this probe's own cascade model (specificity, then written order),
 *   not with a first-match lookup -- a first-match lookup is what let the "fill the muted state
 *   as well" class of defect through in an earlier round.
 *
 * DISCIPLINE (same as probe-11/17/18/19 since the t2 audit)
 *   `--mutate=<name>` rewrites an IN-MEMORY copy of the source (the file on disk is never
 *   touched), and the mutant is caught exactly when: every declared check went red, NOTHING else
 *   did, the mutant source digest differs from the shipped one, and the anchor occurred exactly
 *   once in the shipped bytes. A caught mutant exits 0; a dead mutation, an anchor that is not
 *   unique, a declaration that is too narrow ("UNDECLARED red") or too wide ("NOT DETECTED")
 *   exits non-zero.
 *
 *       node verify-independent/probe-20-r14-bell-appearance.mjs
 *       node verify-independent/probe-20-r14-bell-appearance.mjs --mutate=all
 *       node verify-independent/probe-20-r14-bell-appearance.mjs --mutate=muted-bell-filled
 *       node verify-independent/probe-20-r14-bell-appearance.mjs --list-mutations
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT_PATH = join(here, '..', 'lib', 'client.js');
const SHIPPED = readFileSync(CLIENT_PATH, 'utf8');
const sha256 = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').toUpperCase();

const BELL_FILL_RULE = "DEAD-ANCHOR-NOT-IN-SHIPPED-BYTES-" + "'.dacBell[data-muted=\"false\"]{background:' + BELL_ON_BG + ';color:' + BELL_ON_FG + ';}'";
const BELL_HOVER_RULE = "'.dacBell[data-muted=\"false\"]:hover{background:' + BELL_ON_BG_HOVER + ';}',";
const MUTED_COLOUR_RULE = "'.dacBell[data-muted=\"true\"]{color:var(--dsw-alias-label-caption,#71717a);}',";

/* ============================================================ the mutations */

/**
 * One textual rewrite of the shipped source, kept in memory. `anchor` is the exact shipped text
 * (its occurrence count is measured at run time, never assumed) and `expectFail` is the COMPLETE
 * set of check names that must go red -- an incomplete declaration is a bug in this probe, not a
 * detail.
 */
const MUTATIONS = {
  'muted-bell-filled': {
    what: 'rev-14 regression: move the blue fill onto the bare .dacBell class, so a MUTED session is filled too',
    anchor: BELL_FILL_RULE,
    to: "'.dacBell{background:' + BELL_ON_BG + ';color:' + BELL_ON_FG + ';}'",
    expectFail: [
      'the resolved fill of the audible state is declared by the audible selector',
      'a muted bell resolves to no fill (transparent)',
      'the bare .dacBell class resolves to no fill (transparent)',
    ],
  },
  'audible-hover-dropped': {
    what: 'rev-14 regression: delete the audible bell\'s own :hover rule (the generic grey hover then wins under the pointer)',
    anchor: BELL_HOVER_RULE,
    to: '',
    expectFail: [
      'the audible state declares its own :hover paint',
      'the resolved audible hover is exactly sessionIcon.onBackgroundHover',
      'the audible hover paint is derived from the same token',
      'the audible hover is not the generic grey hover',
    ],
  },
  'fill-hardcoded-hex': {
    what: 'rev-14 regression: copy the hex value into the fill instead of using the design token the switch and slider share',
    anchor: BELL_FILL_RULE,
    to: "'.dacBell[data-muted=\"false\"]{background:#2563eb;color:#fff;}'",
    expectFail: [
      'the resolved fill of the audible state is exactly sessionIcon.onBackground',
      'that fill is a design token, never a literal colour',
    ],
  },
  'muted-icon-recolored': {
    what: 'rev-14 regression: the muted bell stops using the caption-grey token',
    anchor: MUTED_COLOUR_RULE,
    to: "'.dacBell[data-muted=\"true\"]{color:#000;}',",
    expectFail: [
      'the muted glyph keeps a caption-grey token, not the paint',
    ],
  },
  'bell-glyph-shrunk-to-14': {
    what: 'rev-13 regression: the bell glyph constant falls back to the pre-rev-13 14px',
    anchor: 'var BELL_GLYPH_PX = 22;',
    to: 'var BELL_GLYPH_PX = 14;',
    expectFail: [
      'sessionIcon reports the rev-13 geometry 28/16/22/11x16',
    ],
  },
  'bell-svg-hardcoded-14': {
    what: 'rev-13 regression: the rendered bell glyph is hard-coded to 14px instead of the constant the console surface reports',
    anchor: 'width: BELL_GLYPH_PX,',
    to: 'width: 14,',
    expectFail: [
      'the rendered bell glyph is bellGlyphPx x bellGlyphPx',
    ],
  },
  'caret-css-hardcoded-12': {
    what: 'rev-13 regression: the caret box in the CSS is hard-coded to 12px while the console surface still reports caretBoxPx',
    anchor: "'.dacCaret{width:' + String(CARET_BOX_PX) + 'px;height:' + String(BELL_BOX_PX) + 'px;}',",
    to: "'.dacCaret{width:12px;height:' + String(BELL_BOX_PX) + 'px;}',",
    expectFail: [
      'the caret box in the CSS is caretBoxPx wide and bellBoxPx tall',
    ],
  },
  'bell-css-hardcoded-20': {
    what: 'rev-13 regression: the bell box in the CSS falls back to the pre-rev-13 20px while the console surface still reports bellBoxPx',
    anchor: "'.dacBell{width:' + String(BELL_BOX_PX) + 'px;height:' + String(BELL_BOX_PX) + 'px;}',",
    to: "'.dacBell{width:20px;height:20px;}',",
    expectFail: [
      'the bell box in the CSS is bellBoxPx square',
    ],
  },
  'audible-foreground-recoloured': {
    what: 'rev-14 regression: the glyph on the blue fill is no longer the white the console surface reports',
    anchor: BELL_FILL_RULE,
    to: "'.dacBell[data-muted=\"false\"]{background:' + BELL_ON_BG + ';color:#000;}'",
    expectFail: [
      'the glyph on that fill is exactly sessionIcon.onForeground',
    ],
  },
  'muted-rule-declares-fill': {
    what: 'rev-14 regression: the muted rule itself carries a background (the "muted stays unfilled" claim fails at the rule, not just in the cascade)',
    anchor: MUTED_COLOUR_RULE,
    to: "'.dacBell[data-muted=\"true\"]{color:var(--dsw-alias-label-caption,#71717a);background:var(--dsw-alias-state-business-primary,#2563eb);}',",
    expectFail: [
      'a muted bell resolves to no fill (transparent)',
      'no rule naming the muted state declares a background',
    ],
  },
  'caret-svg-hardcoded-9': {
    what: 'rev-13 regression: the rendered caret glyph is hard-coded to 9px wide instead of the constant the console surface reports',
    anchor: 'width: CARET_GLYPH_W,',
    to: 'width: 9,',
    expectFail: [
      'the rendered caret glyph is caretGlyph',
    ],
  },
};

/** Replace exactly ONE occurrence, with the occurrence count measured (never assumed). */
function applyMutation(source, mutation) {
  const from = mutation.anchor;
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`anchor not found (0 occurrences): ${from}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`anchor is not unique (2+ occurrences): ${from}`);
  const mutated = source.slice(0, first) + mutation.to + source.slice(first + from.length);
  if (mutated === source) throw new Error(`substitution was a no-op: ${from}`);
  return mutated;
}

/* ============================================================ stylesheet model */

/** Split `a,b{c:d;e:f}` text into rules, descending into at-rules such as @supports. */
function collectRules(text, rules) {
  let buffer = '';
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char !== '{') {
      buffer += char;
      index += 1;
      continue;
    }
    const prelude = buffer.trim();
    buffer = '';
    const close = matchingBrace(text, index);
    const body = text.slice(index + 1, close);
    if (prelude.startsWith('@')) {
      collectRules(body, rules);
    } else if (prelude.length > 0) {
      rules.push({
        order: rules.length,
        prelude,
        selectors: prelude.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0),
        declarations: parseDeclarations(body),
      });
    }
    index = close + 1;
  }
}

function matchingBrace(text, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return text.length;
}

function parseDeclarations(body) {
  const declarations = new Map();
  for (const part of body.split(';')) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const name = part.slice(0, colon).trim();
    const value = part.slice(colon + 1).trim();
    if (name.length > 0 && value.length > 0) declarations.set(name, value);
  }
  return declarations;
}

/** (attributes + classes + pseudo-classes, element names) -- enough for a documented cascade. */
function specificity(selector) {
  const attributes = (selector.match(/\[[^\]]*\]/g) ?? []).length;
  const classes = (selector.match(/\.[A-Za-z0-9_-]+/g) ?? []).length;
  const pseudoClasses = (selector.match(/:(?!:)[A-Za-z-]+/g) ?? []).length;
  const elements = (selector.match(/(?:^|[\s>+~])[A-Za-z][A-Za-z0-9-]*/g) ?? []).length;
  return { b: attributes + classes + pseudoClasses, c: elements };
}

/**
 * Resolve one property for an element described by the selectors that MATCH it: the winning
 * declaration is the one with the highest specificity, and among equal specificity the last one
 * written -- what a browser does for a single origin.
 */
function resolveProperty(rules, matchingSelectors, property) {
  const candidates = [];
  for (const rule of rules) {
    const selector = rule.selectors.find((entry) => matchingSelectors.includes(entry));
    if (selector === undefined) continue;
    if (!rule.declarations.has(property)) continue;
    candidates.push({ selector, spec: specificity(selector), order: rule.order, value: rule.declarations.get(property) });
  }
  if (candidates.length === 0) return { value: null, selector: null, contributors: [] };
  candidates.sort((left, right) => (left.spec.b - right.spec.b) || (left.spec.c - right.spec.c) || (left.order - right.order));
  const winner = candidates[candidates.length - 1];
  return { value: winner.value, selector: winner.selector, contributors: candidates.map((entry) => entry.selector) };
}

/* ============================================================ vm sandbox */

/** A recording document: it keeps every element, so the injected <style> can be read back. */
function makeDocument() {
  const elements = [];
  const listeners = new Map();
  return {
    elements,
    head: { appendChild: (node) => node },
    body: { appendChild: (node) => node },
    getElementById: (id) => elements.find((element) => element.id === id) ?? null,
    createElement(tag) {
      const element = {
        tag,
        id: '',
        textContent: '',
        attributes: {},
        children: [],
        style: {},
        setAttribute(name, value) { element.attributes[name] = value; },
        removeAttribute(name) { delete element.attributes[name]; },
        appendChild(node) { element.children.push(node); return node; },
        addEventListener() {},
        removeEventListener() {},
        getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
      };
      elements.push(element);
      return element;
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      const set = listeners.get(type);
      if (set) set.delete(handler);
    },
    querySelectorAll: () => [],
    querySelector: () => null,
  };
}

function makeAudioContext() {
  function AudioContext() {
    this.state = 'running';
    this.currentTime = 1;
    this.destination = { kind: 'destination' };
    this.resume = () => Promise.resolve();
    this.createGain = () => ({ gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect: (target) => target, disconnect() {} });
    this.createOscillator = () => ({ type: 'sine', frequency: { value: 0 }, connect: (target) => target, disconnect() {}, start() {}, stop() {} });
    this.createBufferSource = () => ({ buffer: null, connect: (target) => target, disconnect() {}, start() {}, stop() {} });
    this.decodeAudioData = () => Promise.resolve({ duration: 1 });
  }
  return AudioContext;
}

/* ---- the smallest function-component driver this bundle needs (useState/useRef/useEffect) */

function makeRuntime() {
  const state = { hooks: [], cursor: 0, effects: [], renders: 0 };
  return {
    state,
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false) };
    },
    useState(initial) {
      const index = state.cursor;
      state.cursor += 1;
      if (state.hooks[index] === undefined) state.hooks[index] = { value: initial };
      const set = (next) => { state.hooks[index].value = typeof next === 'function' ? next(state.hooks[index].value) : next; };
      return [state.hooks[index].value, set];
    },
    useRef(initial) {
      const index = state.cursor;
      state.cursor += 1;
      if (state.hooks[index] === undefined) state.hooks[index] = { ref: { current: initial } };
      return state.hooks[index].ref;
    },
    useEffect(run, deps) {
      const index = state.cursor;
      state.cursor += 1;
      const previous = state.hooks[index];
      const changed = previous === undefined || deps === undefined || previous.deps === undefined
        || previous.deps.length !== deps.length
        || deps.some((entry, position) => entry !== previous.deps[position]);
      if (changed) {
        state.hooks[index] = { deps };
        state.effects.push(run);
      }
    },
    useMemo(factory) { return factory(); },
    useCallback(fn) { return fn; },
  };
}

/** Render one function component, then run the effects it scheduled. */
function renderComponent(runtime, Component, props) {
  runtime.state.cursor = 0;
  runtime.state.effects = [];
  runtime.state.renders += 1;
  const tree = Component(props);
  const errors = [];
  for (const effect of runtime.state.effects) {
    try {
      const cleanup = effect();
      if (typeof cleanup === 'function') cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  return { tree, errors };
}

function walk(node, visit) {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) { for (const child of node) walk(child, visit); return; }
  if (typeof node !== 'object') return;
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function svgOf(tree, className) {
  let container = null;
  walk(tree, (node) => { if (container === null && node.props && node.props.className === className) container = node; });
  let svg = null;
  walk(container, (node) => { if (svg === null && node.type === 'svg') svg = node; });
  return svg;
}

/**
 * Evaluate one client source: the module contract is applied to a stub context, the injected
 * stylesheet and the console surface are read back, and the session bell is rendered.
 */
function loadClient(source) {
  const ledger = { registrations: [], loadError: null, factoryError: null, applyErrors: [], renderErrors: [], entries: [], warnings: [] };
  const document = makeDocument();
  const sandbox = {
    console: { log() {}, info() {}, warn: (...args) => ledger.warnings.push(args.join(' ')), error() {}, debug() {} },
    setTimeout,
    clearTimeout,
    queueMicrotask,
    document,
    AudioContext: makeAudioContext(),
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener() {},
    removeEventListener() {},
  };
  sandbox.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, revision: 1, sessions: {} }) });
  for (const label of ['XMLHttpRequest', 'WebSocket', 'EventSource', 'Audio', 'Image', 'Worker']) {
    sandbox[label] = () => { throw new Error(`probe-20: ${label} is not available to this bundle`); };
  }
  sandbox.__ModuleLoader__ = { load: (registration) => ledger.registrations.push(registration) };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  try {
    vm.runInContext(source, context, { filename: CLIENT_PATH });
  } catch (error) {
    ledger.loadError = error;
  }

  const runtime = makeRuntime();
  let contract = null;
  if (ledger.loadError === null && ledger.registrations.length > 0) {
    try {
      contract = ledger.registrations[0].factory((specifier) => {
        if (specifier === 'react') return runtime;
        throw new Error(`probe-20: unexpected require(${JSON.stringify(specifier)})`);
      });
    } catch (error) {
      ledger.factoryError = error;
    }
  }

  if (contract !== null) {
    let currentSlot = null;
    const ctx = {
      slots: {
        inject(slot, factory) {
          const previous = currentSlot;
          currentSlot = slot;
          try { factory(); } catch (error) { ledger.applyErrors.push(error); } finally { currentSlot = previous; }
          return () => {};
        },
        register(entry, component) {
          ledger.entries.push({ slot: currentSlot, entry, component });
          return () => {};
        },
      },
      settingsScope: { bind() { throw new Error('probe-20: no settings scope in this sandbox'); } },
      locale: { register: () => ({ dispose() {} }) },
      effect(run) {
        try {
          const cleanup = run();
          return typeof cleanup === 'function' ? cleanup : () => {};
        } catch (error) {
          ledger.applyErrors.push(error);
          return () => {};
        }
      },
      logger: { warn() {}, info() {}, error() {}, debug() {} },
    };
    try {
      contract.apply(ctx);
    } catch (error) {
      ledger.applyErrors.push(error);
    }
  }

  const style = document.elements.find((element) => element.tag === 'style' && element.id === 'dsh-approval-chime/styles') ?? null;
  const diagnostics = sandbox.__DSH_APPROVAL_CHIME__ ?? null;

  let bell = null;
  const sessionEntry = ledger.entries.find((entry) => entry.slot === 'conversation.session.header.actions') ?? null;
  if (sessionEntry !== null) {
    try {
      const rendered = renderComponent(runtime, sessionEntry.component, { sessionId: 'session-a' });
      ledger.renderErrors.push(...rendered.errors);
      bell = rendered.tree;
    } catch (error) {
      ledger.renderErrors.push(error);
    }
  }

  return { ledger, styleText: style === null ? null : style.textContent, diagnostics, bell, styleCount: style === null ? 0 : 1 };
}

/* ============================================================ the checks */

/**
 * Evaluate every claim against one source. Returns the check names that went red.
 * `verbose` prints the passing lines too (shipped run and single-mutation runs).
 */
function inspect(source, options = {}) {
  const verbose = options.verbose !== false;
  const results = [];
  const check = (name, ok, detail) => {
    const entry = { name, ok: ok === true, detail: detail === undefined ? '' : String(detail) };
    results.push(entry);
    if (verbose) console.log(`[${entry.ok ? 'PASS' : 'FAIL'}] ${name}${entry.detail.length > 0 ? ` -- ${entry.detail}` : ''}`);
  };
  const note = (label, value) => {
    if (!verbose) return;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    console.log(`    . ${label} = ${text === undefined ? 'undefined' : text}`);
  };
  const group = (title) => { if (verbose) console.log(`\n--- ${title} ---`); };

  const loaded = loadClient(source);
  const { styleText, diagnostics, bell, ledger } = loaded;

  group('0 - controls: the bundle really is the one that produced this stylesheet');
  check('the bundle evaluated without a load error', ledger.loadError === null, ledger.loadError === null ? 'ok' : String(ledger.loadError));
  check('the bundle produced a module contract and registered both slots', ledger.factoryError === null && ledger.entries.length === 2, `factoryError=${ledger.factoryError === null ? 'none' : String(ledger.factoryError)}, slot entries=${ledger.entries.length}`);
  check('the bundle injected exactly one stylesheet element', loaded.styleCount === 1, `style elements=${loaded.styleCount}`);
  check('the injected stylesheet carries the bell rules', styleText !== null && styleText.includes('.dacBell') && styleText.includes('.dacCaret'), `length=${styleText === null ? 'null' : styleText.length}`);
  check('the console surface exposes sessionIcon', diagnostics !== null && typeof diagnostics.sessionIcon === 'object' && diagnostics.sessionIcon !== null, diagnostics === null ? 'no __DSH_APPROVAL_CHIME__' : Object.keys(diagnostics.sessionIcon ?? {}).join(','));
  note('stylesheet sha256', styleText === null ? 'null' : sha256(styleText).slice(0, 16));
  note('sessionIcon', diagnostics === null ? null : diagnostics.sessionIcon);

  const rules = styleText === null ? [] : (() => { const collected = []; collectRules(styleText, collected); return collected; })();
  const sessionIcon = (diagnostics === null ? {} : diagnostics.sessionIcon) ?? {};
  const onBackground = sessionIcon.onBackground;
  const onForeground = sessionIcon.onForeground;
  const onBackgroundHover = sessionIcon.onBackgroundHover;

  const audible = resolveProperty(rules, ['.dacBell', '.dacBell[data-muted="false"]'], 'background');
  const audibleForeground = resolveProperty(rules, ['.dacBell', '.dacBell[data-muted="false"]'], 'color');
  const audibleHover = resolveProperty(rules, ['.dacBell:hover', '.dacBell[data-muted="false"]:hover'], 'background');
  const muted = resolveProperty(rules, ['.dacBell', '.dacBell[data-muted="true"]'], 'background');
  const mutedForeground = resolveProperty(rules, ['.dacBell', '.dacBell[data-muted="true"]'], 'color');
  const bare = resolveProperty(rules, ['.dacBell'], 'background');
  const bellBoxWidth = resolveProperty(rules, ['.dacBell'], 'width');
  const bellBoxHeight = resolveProperty(rules, ['.dacBell'], 'height');
  const caretBoxWidth = resolveProperty(rules, ['.dacCaret'], 'width');
  const caretBoxHeight = resolveProperty(rules, ['.dacCaret'], 'height');

  group('1 - rev-13 geometry: the console surface and the CSS and the rendered glyph agree');
  check(
    'sessionIcon reports the rev-13 geometry 28/16/22/11x16',
    sessionIcon.bellBoxPx === 28 && sessionIcon.caretBoxPx === 16 && sessionIcon.bellGlyphPx === 22 && sessionIcon.caretGlyph === '11x16',
    `bellBoxPx=${sessionIcon.bellBoxPx} caretBoxPx=${sessionIcon.caretBoxPx} bellGlyphPx=${sessionIcon.bellGlyphPx} caretGlyph=${sessionIcon.caretGlyph}`,
  );
  check(
    'the bell box in the CSS is bellBoxPx square',
    bellBoxWidth.value === `${sessionIcon.bellBoxPx}px` && bellBoxHeight.value === `${sessionIcon.bellBoxPx}px`,
    `css=${bellBoxWidth.value}x${bellBoxHeight.value} diagnostics=${sessionIcon.bellBoxPx}px`,
  );
  check(
    'the caret box in the CSS is caretBoxPx wide and bellBoxPx tall',
    caretBoxWidth.value === `${sessionIcon.caretBoxPx}px` && caretBoxHeight.value === `${sessionIcon.bellBoxPx}px`,
    `css=${caretBoxWidth.value}x${caretBoxHeight.value} diagnostics=${sessionIcon.caretBoxPx}x${sessionIcon.bellBoxPx}`,
  );
  const bellSvg = svgOf(bell, 'dacBell');
  const caretSvg = svgOf(bell, 'dacCaret');
  const [caretGlyphWidth, caretGlyphHeight] = String(sessionIcon.caretGlyph ?? '').split('x');
  check(
    'the rendered bell glyph is bellGlyphPx x bellGlyphPx',
    bellSvg !== null && bellSvg.props.width === sessionIcon.bellGlyphPx && bellSvg.props.height === sessionIcon.bellGlyphPx,
    bellSvg === null ? `no bell svg rendered (${ledger.renderErrors.length} render error(s): ${String(ledger.renderErrors[0] ?? '')})` : `rendered=${bellSvg.props.width}x${bellSvg.props.height} diagnostics=${sessionIcon.bellGlyphPx}`,
  );
  check(
    'the rendered caret glyph is caretGlyph',
    caretSvg !== null && String(caretSvg.props.width) === caretGlyphWidth && String(caretSvg.props.height) === caretGlyphHeight,
    caretSvg === null ? 'no caret svg rendered' : `rendered=${caretSvg.props.width}x${caretSvg.props.height} diagnostics=${sessionIcon.caretGlyph}`,
  );

  group('2 - the audible fill is the shared design token, declared on the audible state');
  check(
    'the resolved fill of the audible state is exactly sessionIcon.onBackground',
    audible.value === onBackground && onBackground !== undefined,
    `resolved=${audible.value} sessionIcon.onBackground=${onBackground}`,
  );
  check(
    'that fill is a design token, never a literal colour',
    typeof audible.value === 'string' && /^var\(--./.test(audible.value),
    `resolved=${audible.value}`,
  );
  check(
    'the resolved fill of the audible state is declared by the audible selector',
    audible.selector === '.dacBell[data-muted="false"]',
    `winning selector=${audible.selector} contributors=${JSON.stringify(audible.contributors)}`,
  );
  check(
    'the glyph on that fill is exactly sessionIcon.onForeground',
    audibleForeground.value === onForeground,
    `resolved=${audibleForeground.value} sessionIcon.onForeground=${onForeground}`,
  );

  group('3 - the muted state keeps no fill and a caption-grey glyph');
  check(
    'a muted bell resolves to no fill (transparent)',
    muted.value === 'transparent',
    `resolved=${muted.value} (contributors ${JSON.stringify(muted.contributors)})`,
  );
  check(
    'the bare .dacBell class resolves to no fill (transparent)',
    bare.value === 'transparent',
    `resolved=${bare.value} (winner ${bare.selector})`,
  );
  const mutedBackgroundRules = rules.filter((rule) => rule.selectors.includes('.dacBell[data-muted="true"]') && rule.declarations.has('background'));
  check(
    'no rule naming the muted state declares a background',
    mutedBackgroundRules.length === 0,
    `${mutedBackgroundRules.length} rule(s): ${JSON.stringify(mutedBackgroundRules.map((rule) => rule.prelude))}`,
  );
  check(
    'the muted glyph keeps a caption-grey token, not the paint',
    typeof mutedForeground.value === 'string'
      && /var\(--dsw-alias-label-caption/.test(mutedForeground.value)
      && mutedForeground.value !== onBackground
      && mutedForeground.value !== onForeground,
    `resolved=${mutedForeground.value}`,
  );

  group('4 - the audible hover survives the generic .dacBell:hover');
  const audibleHoverRule = rules.find((rule) => rule.selectors.includes('.dacBell[data-muted="false"]:hover') && rule.declarations.has('background')) ?? null;
  check(
    'the audible state declares its own :hover paint',
    audibleHoverRule !== null,
    audibleHoverRule === null ? 'no rule names .dacBell[data-muted="false"]:hover with a background' : `${audibleHoverRule.prelude}{background:${audibleHoverRule.declarations.get('background')}}`,
  );
  check(
    'the resolved audible hover is exactly sessionIcon.onBackgroundHover',
    audibleHover.value === onBackgroundHover && onBackgroundHover !== undefined,
    `resolved=${audibleHover.value} sessionIcon.onBackgroundHover=${onBackgroundHover}`,
  );
  check(
    'the audible hover paint is derived from the same token',
    typeof audibleHover.value === 'string' && typeof onBackground === 'string'
      && audibleHover.value !== onBackground && audibleHover.value.includes(onBackground),
    `resolved hover=${audibleHover.value} token=${onBackground}`,
  );
  check(
    'the audible hover is not the generic grey hover',
    audibleHover.value !== 'var(--dsw-alias-interactive-bg-hover,rgba(120,120,128,.16))',
    `resolved=${audibleHover.value}`,
  );

  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n### ${options.title ?? 'probe-20-r14-bell-appearance.mjs'}: ${results.length - failed.length}/${results.length} independent checks passed`);
  for (const entry of failed) console.log(`    FAILED: ${entry.name}${entry.detail.length > 0 ? ` -- ${entry.detail}` : ''}`);
  return failed.map((entry) => entry.name);
}

/* ============================================================ entry point */

if (process.argv.includes('--list-mutations')) {
  for (const [name, entry] of Object.entries(MUTATIONS)) {
    console.log(`${name}: ${entry.what}`);
    console.log(`    declared red set (${entry.expectFail.length}): ${JSON.stringify(entry.expectFail)}`);
  }
  process.exit(0);
}

const mutateArg = process.argv.find((value) => value.startsWith('--mutate='));
const shippedDigest = sha256(SHIPPED);

if (mutateArg === undefined) {
  console.log('dsh-approval-chime · independent probe 20 · rev-13/rev-14 session-bell appearance');
  console.log(`lib/client.js ${Buffer.byteLength(SHIPPED, 'utf8')} B sha256 ${shippedDigest}`);
  const failed = inspect(SHIPPED, { verbose: true });
  process.exit(failed.length === 0 ? 0 : 1);
}

const requested = mutateArg.slice('--mutate='.length);
const chosen = requested === 'all' ? Object.keys(MUTATIONS) : [requested];
for (const name of chosen) {
  if (MUTATIONS[name] === undefined) {
    console.error(`unknown mutation '${name}'; available: ${Object.keys(MUTATIONS).join(', ')}, all`);
    process.exit(2);
  }
}

console.log('dsh-approval-chime · independent probe 20 · mutation mode');
console.log(`lib/client.js ${Buffer.byteLength(SHIPPED, 'utf8')} B sha256 ${shippedDigest}`);

let bad = 0;
const observedSets = new Map();
for (const name of chosen) {
  const mutation = MUTATIONS[name];
  console.log(`\n############ mutation '${name}'`);
  console.log(`############ ${mutation.what}`);
  const anchorOccurrences = SHIPPED.split(mutation.anchor).length - 1;
  console.log(`############ anchor occurrences in the shipped bytes: ${anchorOccurrences} (must be exactly 1)`);
  let mutated = null;
  try {
    mutated = applyMutation(SHIPPED, mutation);
  } catch (error) {
    console.log('############ observed red set (n/a): the mutant could not be built');
    console.log('############ NOT DETECTED as declared');
    console.log(`############   DEAD MUTATION / broken anchor: ${error.message}`);
    bad += 1;
    continue;
  }
  const changed = mutated !== SHIPPED && sha256(mutated) !== shippedDigest;
  console.log(`############ mutant source sha256 ${sha256(mutated)} vs shipped ${shippedDigest} changed=${changed}`);
  console.log(`############ declared red set (${mutation.expectFail.length}): ${mutation.expectFail.join(', ') || '(measurement run)'}`);
  const failed = inspect(mutated, { verbose: chosen.length === 1, title: `probe-20 mutation:${name}` });
  const failing = new Set(failed);
  observedSets.set(name, failing);
  console.log(`############ observed red set (${failing.size}): ${failed.join(', ') || '(none)'}`);
  const missing = mutation.expectFail.filter((entry) => !failing.has(entry));
  const extra = failed.filter((entry) => !mutation.expectFail.includes(entry));
  console.log(`############ extra reds beyond the declaration: ${extra.join(', ') || '(none)'}`);
  if (missing.length > 0) console.log(`############ NOT DETECTED (declared but still green): ${JSON.stringify(missing)}`);
  if (extra.length > 0) console.log(`############ UNDECLARED red (the declaration is too narrow): ${JSON.stringify(extra)}`);
  if (!changed) console.log('############   reason: the mutant source is byte-identical to the shipped source (DEAD MUTATION)');
  if (anchorOccurrences !== 1) console.log(`############   reason: the anchor occurs ${anchorOccurrences} times in the shipped bytes`);
  if (failing.size === 0) console.log('############   reason: no check went red (DEAD MUTATION)');
  const caught = missing.length === 0 && extra.length === 0 && failing.size > 0 && changed && anchorOccurrences === 1;
  console.log(caught ? '############ DETECTED (exactly the declared red set, and the mutant source provably changed)' : '############ NOT DETECTED as declared');
  if (!caught) bad += 1;
}

if (chosen.length > 1) {
  console.log('\n### mutation summary -- every mutant must redden a DIFFERENT non-empty subset');
  const entries = [...observedSets.entries()];
  let exactCount = 0;
  for (const [name, failing] of entries) {
    const declared = MUTATIONS[name].expectFail;
    const exact = failing.size === declared.length && declared.every((entry) => failing.has(entry));
    console.log(`${exact ? '[PASS]' : '[FAIL]'} ${name}: reddens EXACTLY its ${declared.length} declared check(s) (measured ${failing.size})`);
    if (exact) exactCount += 1;
    else bad += 1;
  }
  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      const [nameA, setA] = entries[left];
      const [nameB, setB] = entries[right];
      const same = setA.size === setB.size && [...setA].every((entry) => setB.has(entry));
      console.log(`${same ? '[FAIL]' : '[PASS]'} ${nameA} and ${nameB} redden ${same ? 'the SAME' : 'different'} check sets`);
      if (same) bad += 1;
    }
  }
  console.log(`\n### mutation summary: ${exactCount}/${entries.length} mutations detected exactly as declared`);
}

process.exit(bad === 0 ? 0 : 1);
