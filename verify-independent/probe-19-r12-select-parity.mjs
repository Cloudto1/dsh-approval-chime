#!/usr/bin/env node
/**
 * probe-19-r12-select-parity.mjs — t2 独立验证 · rev-12「两份音色列表 = 一份设计」
 *
 * 要证伪的断言（rev-12）：设置页卡片里的音色下拉与会话头部铃铛 popover 里的音色下拉，
 * **按构造**是同一份设计，而不是两份手工保持一致的副本：
 *   1. 两个 select 都 opt-in `appearance:base-select`；
 *   2. 两套 `::picker(select)` 声明来自**同一条**共享规则
 *      （`.dacCard select::picker(select),.dacPop select::picker(select){...}`），
 *      所以两者只可能在「行数上限」上不同；
 *   3. popover 的上限 = 它的四行默认项 + 一点 slack；卡片仍是精确三行（84px）；
 *   4. 两份列表共用一条 option 行规则（radius 7 / `padding:4px 9px` / 定死 `line-height:20px`）
 *      与一条高亮规则；
 *   5. 列表自带字号（`font-size:13px`，卡片自己的字号），popover 的 12px 面板不会把列表缩小。
 *
 * 与 probe-17/18 不同的地方（这是本探针存在的理由）：探针**不比对样式表字符串**，而是
 *   a) 用 `__ModuleLoader__.load({id,factory})` 真跑一遍 `lib/client.js`（classic script 的加载
 *      方式），把 bundle 真正注入的那个 `<style>` 取出来；
 *   b) 从**真实渲染出来的 React 树**里取这两个 `select` 的祖先链（不是我在源码里读出来的
 *      选择器），再把样式表当 CSS 解析、按 (specificity, 书写顺序) 做一遍层叠，
 *      分别算出「卡片 picker」「popover picker」两张属性表，然后逐属性比对。
 * 于是「两条规则其实不一样」「有人又抄了一份」这类缺陷会在**属性表**这一层暴露，
 * 而不是只在字面层。
 *
 * 用法：
 *       node verify-independent/probe-19-r12-select-parity.mjs
 *       node verify-independent/probe-19-r12-select-parity.mjs --mutate=popover-dropped-from-shared-picker
 *       node verify-independent/probe-19-r12-select-parity.mjs --mutate=popover-list-resplit-12px
 *       node verify-independent/probe-19-r12-select-parity.mjs --mutate=popover-cap-loses-one-row
 *       node verify-independent/probe-19-r12-select-parity.mjs --mutate=all
 *       node verify-independent/probe-19-r12-select-parity.mjs --list-mutations
 *
 * 退出码：0 = 每条断言都过（变异模式下还要求每个变异都被它**声明**的那些断言抓到，
 * 且三个变异抓红的集合两两不同）；否则非 0。
 *
 * 能力边界（照实说，不掩饰）：本机没有可用的浏览器引擎，所以本探针**不能**测量真实渲染 ——
 * picker 的真实像素高度、popover 四行是否真的不出滚动条、高亮**画出来**的颜色、
 * 对勾字形、收起态控件的样子，全部无法在此验证。这里能证的是：**注入的 CSS 与渲染出来的
 * 元素关系**，即「有且只有一处规则源 + 两张属性表只差 max-height」。
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/* ------------------------------------------------------------------ locations */

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = resolve(HERE, '..');
const CLIENT_PATH = join(PLUGIN, 'lib', 'client.js');
const HOST_PATH = join(PLUGIN, 'lib', 'index.js');

/* --------------------------------------------------------------- 冻结指纹（rev-12） */

/**
 * rev-12 的锚定字节。client 半被改动；host 半**必须**仍是 rev-11 的那一对字节 ——
 * 这次改动是 client-only，`lib/index.js` 的哈希一旦移动就是发现。
 *
 * 注意：任务书上给 client.js 的字面大小是 137331 B，与本机实测的 142330 B 不符
 * （sha256 与任务书一致）。哈希是权威值，行 0 会把这件事故意摆出来。
 */
const FROZEN = {
  client: {
    bytes: 158549,
    sha256: '4B6C8B91F0C294A0E2C561934C8ED627C7D3F937CFF33904A8FACA651A5949F3',
  },
  host: {
    bytes: 46638,
    sha256: '03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938',
  },
  revision: 'rev-20 · the caret turn takes 160 ms',
  /** 任务书里写的 client 字节数（用于把「字面值过期」和「产品回归」分开）。 */
  briefClientBytes: 137331,
};

/* ------------------------------------------------------------------ reporter */

function makeReport(title, options = {}) {
  const verbose = options.verbose !== false;
  const say = (line) => { if (verbose) console.log(line); };
  const rows = [];
  const report = {
    rows,
    group(name) {
      say(`\n--- ${name} ---`);
    },
    note(label, value) {
      say(`    · ${label} = ${typeof value === 'string' ? value : JSON.stringify(value)}`);
    },
    check(name, ok, detail) {
      const passed = ok === true;
      rows.push({ name, passed, detail });
      say(`${passed ? '[PASS]' : '[FAIL]'} ${name}${detail === undefined || detail === '' ? '' : ` — ${detail}`}`);
      return passed;
    },
    same(name, actual, expected) {
      return report.check(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    deep(name, actual, expected) {
      const left = JSON.stringify(actual);
      const right = JSON.stringify(expected);
      return report.check(name, left === right, `expected ${right}, got ${left}`);
    },
    done() {
      const bad = rows.filter((row) => !row.passed);
      say(`\n### ${title}: ${rows.length - bad.length}/${rows.length} independent checks passed`);
      for (const row of bad) say(`    FAILED: ${row.name}`);
      return { total: rows.length, failed: bad.length, failedNames: bad.map((row) => row.name) };
    },
  };
  return report;
}

/* ------------------------------------------------------------ CSS 解析器（自有） */

/**
 * 拆顶层选择器列表：只在**括号深度为 0** 的逗号上切，所以
 * `::picker(select),.dacPop select::picker(select)` 会切成两条而不是三条。
 */
function splitTopLevel(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      out.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter((entry) => entry !== '');
}

/** 把一个声明块拆成 `{prop, value}` 数组，保持书写顺序。 */
function parseDeclarations(body) {
  const out = [];
  for (const chunk of body.split(';')) {
    const text = chunk.trim();
    if (text === '') continue;
    const at = text.indexOf(':');
    if (at < 0) {
      out.push({ prop: text.toLowerCase(), value: '' });
      continue;
    }
    out.push({ prop: text.slice(0, at).trim().toLowerCase(), value: text.slice(at + 1).trim() });
  }
  return out;
}

/**
 * 把一个样式表拆成规则列表。嵌套 at-rule（`@supports`、`@media`）递归展开，
 * 每条规则都带上它的 at-rule 上下文，这样「这条声明在不在 base-select 块里」
 * 是解析出来的，不是我用正则在字符串里猜的。
 */
function parseRules(text, context = []) {
  const rules = [];
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf('{', index);
    if (open < 0) break;
    const prelude = text.slice(index, open).trim();
    let depth = 1;
    let cursor = open + 1;
    while (cursor < text.length && depth > 0) {
      if (text[cursor] === '{') depth += 1;
      else if (text[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    const body = text.slice(open + 1, cursor - 1);
    if (prelude.startsWith('@')) {
      for (const inner of parseRules(body, [...context, prelude])) {
        rules.push({ ...inner, index: rules.length });
      }
    } else if (prelude !== '') {
      rules.push({
        context,
        prelude,
        selectors: splitTopLevel(prelude),
        decls: parseDeclarations(body),
        index: rules.length,
      });
    }
    index = cursor;
  }
  return rules;
}

/**
 * 解析一个复合选择器（`compound`）。只建模后代组合符 —— 带 `>`/`+`/`~` 的整条选择器
 * 返回 null（被显式记为「未建模」），探针会断言与 select 有关的选择器一条都没被漏掉。
 */
function parseCompound(text) {
  const compound = { tag: null, classes: [], pseudoClasses: [], pseudoElement: null };
  let index = 0;
  const readIdent = () => {
    let name = '';
    while (index < text.length && /[A-Za-z0-9_\-*\\]/.test(text[index])) {
      name += text[index];
      index += 1;
    }
    return name;
  };
  const readParen = () => {
    let name = '';
    if (text[index] === '(') {
      let depth = 0;
      while (index < text.length) {
        const ch = text[index];
        name += ch;
        index += 1;
        if (ch === '(') depth += 1;
        else if (ch === ')') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
    }
    return name;
  };
  while (index < text.length) {
    const ch = text[index];
    if (ch === '.') {
      index += 1;
      compound.classes.push(readIdent());
    } else if (ch === ':') {
      if (text[index + 1] === ':') {
        index += 2;
        compound.pseudoElement = (readIdent() + readParen()).toLowerCase();
      } else {
        index += 1;
        compound.pseudoClasses.push((readIdent() + readParen()).toLowerCase());
      }
    } else if (ch === '*') {
      index += 1;
      compound.tag = '*';
    } else if (/[A-Za-z]/.test(ch)) {
      compound.tag = readIdent().toLowerCase();
    } else {
      index += 1;
    }
  }
  return compound;
}

/** 一条复杂选择器 → 复合选择器数组；带非后代组合符的返回 null（未建模）。 */
function parseComplex(selector) {
  const raw = selector.trim();
  if (raw === '' || /[>+~]/.test(raw)) return null;
  const parts = raw.split(/\s+/).filter((entry) => entry !== '');
  if (parts.length === 0) return null;
  return parts.map(parseCompound);
}

/** 特指度 (a,b,c)：id / class+pseudo-class / tag+pseudo-element。 */
function specificityOf(complex) {
  let a = 0;
  let b = 0;
  let c = 0;
  for (const compound of complex) {
    b += compound.classes.length + compound.pseudoClasses.length;
    if (compound.tag !== null && compound.tag !== '*') c += 1;
    if (compound.pseudoElement !== null) c += 1;
  }
  return [a, b, c];
}

function compoundMatches(element, compound) {
  if (compound.tag !== null && compound.tag !== '*' && compound.tag !== element.tag) return false;
  for (const name of compound.classes) if (!element.classes.includes(name)) return false;
  for (const name of compound.pseudoClasses) if (!element.pseudoClasses.includes(name)) return false;
  if ((compound.pseudoElement ?? null) !== (element.pseudoElement ?? null)) return false;
  return true;
}

/**
 * 目标元素链（chain[0] 最外层祖先 … chain[末尾] 主体）与一条复杂选择器是否匹配。
 * 主体必须**正好**匹配链尾；其左侧各复合选择器按后代组合符向左消化祖先。
 */
function matchesChain(chain, complex) {
  if (complex === null || chain.length === 0) return false;
  if (!compoundMatches(chain[chain.length - 1], complex[complex.length - 1])) return false;
  let cursor = chain.length - 2;
  for (let index = complex.length - 2; index >= 0; index -= 1) {
    let matched = false;
    for (; cursor >= 0; cursor -= 1) {
      if (compoundMatches(chain[cursor], complex[index])) {
        matched = true;
        cursor -= 1;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

function compareCascade(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left.specificity[index] !== right.specificity[index]) return left.specificity[index] - right.specificity[index];
  }
  return left.order - right.order;
}

/**
 * 对一个目标链做一遍层叠：返回 `prop -> {value, rule, selector}`。
 * 规则按 (specificity, 书写顺序) 取胜 —— 与浏览器一致（本块内无 `!important`，
 * 行 2 会断言这一点，所以这个模型对该块是完备的）。
 */
function cascade(rules, chain) {
  const winners = new Map();
  let order = 0;
  for (const rule of rules) {
    for (const selector of rule.selectors) {
      order += 1;
      const complex = parseComplex(selector);
      if (!matchesChain(chain, complex)) continue;
      const specificity = specificityOf(complex);
      for (const decl of rule.decls) {
        const next = { value: decl.value, rule, selector, specificity, order };
        const previous = winners.get(decl.prop);
        if (previous === undefined || compareCascade(previous, next) <= 0) winners.set(decl.prop, next);
      }
    }
  }
  return winners;
}

const plainMap = (winners) => {
  const out = {};
  for (const [prop, entry] of winners) out[prop] = entry.value;
  return out;
};

/** 除 max-height 之外的属性表，用来问「两张表是不是只差上限」。 */
function withoutMaxHeight(map) {
  const out = {};
  for (const [prop, value] of Object.entries(map)) if (prop !== 'max-height') out[prop] = value;
  return out;
}

/* ------------------------------------------------------------ vm 里的浏览器桩 */

/** 一个记录型的 document：真 id 台账、元素创建、监听器、以及注入的 `<style>`。 */
function makeDocument() {
  const elements = [];
  const listeners = new Map();
  const document = {
    elements,
    listeners,
    head: {
      appended: [],
      appendChild(node) {
        this.appended.push(node);
        return node;
      },
    },
    getElementById(id) {
      for (const element of elements) if (element.id === id) return element;
      return null;
    },
    createElement(tag) {
      const element = {
        tag,
        id: '',
        attributes: {},
        textContent: '',
        setAttribute(name, value) {
          element.attributes[name] = value;
        },
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
    /** bundle 真正注入的那段 CSS。 */
    stylesheet() {
      const style = elements.find((element) => element.tag === 'style' && element.id === 'dsh-approval-chime/styles');
      return style === undefined ? null : style.textContent;
    },
  };
  return document;
}

function makeAudioContext() {
  function AudioContext() {
    this.state = 'running';
    this.currentTime = 1;
    this.destination = { kind: 'destination' };
    this.resume = () => Promise.resolve();
    this.createGain = () => ({ gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (t) => t, disconnect() {} });
    this.createOscillator = () => ({ type: 'sine', frequency: { value: 0 }, connect: (t) => t, disconnect() {}, start() {}, stop() {} });
  }
  return AudioContext;
}

/**
 * 以 `<script src>` 的方式把一个 classic-script bundle 装进新的 vm context：
 * 抓 `window.__ModuleLoader__.load({id,factory})`，再用一个只认 `react` 的 require 调它。
 */
function loadClient(source) {
  const ledger = { console: [], registrations: [], requires: [], loadError: null, factoryError: null, fetches: [] };
  const document = makeDocument();
  const sandbox = {
    console: {
      log: (...args) => ledger.console.push(`log: ${args.join(' ')}`),
      info: (...args) => ledger.console.push(`info: ${args.join(' ')}`),
      warn: (...args) => ledger.console.push(`warn: ${args.join(' ')}`),
      error: (...args) => ledger.console.push(`error: ${args.join(' ')}`),
      debug: (...args) => ledger.console.push(`debug: ${args.join(' ')}`),
    },
    setTimeout,
    clearTimeout,
    queueMicrotask,
    document,
    AudioContext: makeAudioContext(),
    innerWidth: 1280,
    innerHeight: 800,
  };
  sandbox.fetch = (url, init) => {
    ledger.fetches.push({ url: String(url), method: (init ?? {}).method ?? 'GET' });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, revision: 1, sessions: {} }),
    });
  };
  for (const label of ['XMLHttpRequest', 'WebSocket', 'EventSource', 'Audio', 'Image']) {
    sandbox[label] = () => {
      throw new Error(`probe: ${label} is not available to this bundle`);
    };
  }
  sandbox.__ModuleLoader__ = { load: (registration) => ledger.registrations.push(registration) };
  sandbox.window = sandbox;
  sandbox.self = sandbox;

  const context = vm.createContext(sandbox);
  try {
    vm.runInContext(source, context, { filename: CLIENT_PATH });
  } catch (error) {
    ledger.loadError = error;
  }

  const react = makeReact();
  let contract = null;
  if (ledger.registrations.length > 0 && ledger.loadError === null) {
    try {
      contract = ledger.registrations[0].factory((specifier) => {
        ledger.requires.push(specifier);
        if (specifier === 'react') return react.api;
        throw new Error(`probe: unexpected require(${JSON.stringify(specifier)})`);
      });
    } catch (error) {
      ledger.factoryError = error;
    }
  }

  return {
    ledger,
    sandbox,
    document,
    react,
    contract,
    registration: ledger.registrations[0] ?? null,
    diagnostics: sandbox.__DSH_APPROVAL_CHIME__,
  };
}

/* ------------------------------------------------- 自有 React 桩（函数组件足够） */

function flatten(children) {
  const flat = [];
  const push = (child) => {
    if (Array.isArray(child)) {
      for (const item of child) push(item);
      return;
    }
    if (child === null || child === undefined || child === false || child === true) return;
    flat.push(child);
  };
  for (const child of children) push(child);
  return flat;
}

function makeReact() {
  const runtime = { hooks: [], effects: [] };
  let cursor = 0;
  const api = {
    createElement(type, props, ...children) {
      return { type, props: props === null || props === undefined ? {} : props, children: flatten(children) };
    },
    useState(initial) {
      const slot = cursor;
      cursor += 1;
      if (!(slot in runtime.hooks)) runtime.hooks[slot] = typeof initial === 'function' ? initial() : initial;
      return [runtime.hooks[slot], (next) => { runtime.hooks[slot] = typeof next === 'function' ? next(runtime.hooks[slot]) : next; }];
    },
    useEffect(callback) {
      const slot = cursor;
      cursor += 1;
      if (!runtime.effects.some((effect) => effect.slot === slot)) runtime.effects.push({ slot, callback, ran: false });
    },
    useRef(initial) {
      const slot = cursor;
      cursor += 1;
      if (!(slot in runtime.hooks)) runtime.hooks[slot] = { current: initial };
      return runtime.hooks[slot];
    },
    useMemo: (factory) => factory(),
    useCallback: (fn) => fn,
    useLayoutEffect() {},
  };
  return {
    api,
    runtime,
    draw(Component, props) {
      cursor = 0;
      return Component(props === undefined ? {} : props);
    },
    runEffects() {
      for (const effect of runtime.effects) {
        if (effect.ran) continue;
        effect.ran = true;
        try {
          effect.callback();
        } catch (error) {
          /* 探针不因某个 effect 抛错而中断；这里只取渲染树与 CSS */
        }
      }
    },
  };
}

/* --------------------------------------------------------------- 插件 ctx 桩 */

const NS = 'approval-chime';

function makeCtx() {
  const log = { slotInjects: [], registrations: [], boundNamespaces: [] };
  const scopeListeners = new Set();
  const scope = {
    getSnapshot: () => ({ status: 'ready', value: { enabled: true, volume: 70, tone: 'chime' }, user: {}, writable: true, mode: 'host', revision: 1 }),
    subscribe(listener) {
      scopeListeners.add(listener);
      return () => scopeListeners.delete(listener);
    },
    set: () => Promise.resolve(true),
    unset: () => Promise.resolve(true),
  };
  const ctx = {
    effect(callback) {
      try {
        return callback() ?? (() => {});
      } catch (error) {
        return () => {};
      }
    },
    slots: {
      inject(name, callback) {
        log.slotInjects.push(name);
        return callback();
      },
      register(entry, component) {
        log.registrations.push({ entry, component });
        return () => {};
      },
    },
    locale: {
      register: () => () => {},
      bind: () => (key) => key,
      subscribe: () => () => {},
      getSnapshot: () => ({ revision: 0, locale: 'zh' }),
    },
    settingsScope: {
      bind(spec) {
        log.boundNamespaces.push(spec === undefined ? undefined : spec.namespace);
        return scope;
      },
    },
    uiSession: {
      pendingInteractions: {
        getSnapshot: () => new Map(),
        subscribe: () => () => {},
      },
    },
  };
  return { ctx, log };
}

/* ------------------------------------------------------- 渲染树上的元素链回溯 */

/**
 * 在渲染树里找**每一个** `select`，连同它的祖先链（tag + class 列表）一起返回。
 * 「`.dacCard select` 到底命不命中 popover 的 select」这类问题因此是在真实树上问的。
 */
function selectChains(tree) {
  const found = [];
  const visit = (node, ancestors) => {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, ancestors);
      return;
    }
    if (typeof node !== 'object') return;
    const className = typeof node.props?.className === 'string' ? node.props.className : '';
    const classes = className.split(/\s+/).filter((entry) => entry !== '');
    if (node.type === 'select') {
      found.push({ ancestors, classes, props: node.props, children: node.children });
    }
    const next = classes.length === 0 ? ancestors : [...ancestors, { tag: String(node.type), classes, pseudoClasses: [], pseudoElement: null }];
    visit(node.children, next);
  };
  visit(tree, []);
  return found;
}

function withPseudo(chain, pseudoElement, pseudoClasses = []) {
  const copy = chain.map((entry) => ({ ...entry, pseudoClasses: [...entry.pseudoClasses] }));
  const subject = copy[copy.length - 1];
  subject.pseudoElement = pseudoElement;
  subject.pseudoClasses = [...subject.pseudoClasses, ...pseudoClasses];
  return copy;
}

const countOptions = (select) => select.children.filter((child) => child !== null && typeof child === 'object' && child.type === 'option').length;

/* ------------------------------------------------------------------- 变异体 */

/**
 * 只改内存里的字符串，磁盘文件一个字节都不动。`expectFail` 列出**必须**报红的断言名 ——
 * 变异体抓不到的断言说明那条断言是装饰品。三个变异必须抓红**两两不同**的集合
 * （`--mutate=all` 会验证这一点）：一个变异能被另一条断言顺便抓到，不等于它被那条断言覆盖。
 */
const MUTATIONS = {
  'popover-dropped-from-shared-picker': {
    what: '把 popover 从共享 picker 规则里删掉（回到 rev-12 之前：卡片有样式、popover 只有 UA 默认）',
    expectFail: [
      'the picker CSS has exactly one rule that names BOTH tone lists',
      'that one shared picker rule is literally `.dacCard select::picker(select),.dacPop select::picker(select)`',
      'every non-max-height property of the popover picker comes from ONE rule',
      'the card and the popover picker draw their non-max-height properties from the SAME rule',
      'the two picker property maps have the same property names',
      'the two picker property maps are identical except max-height',
      'the popover list states the same font-size:13px, not its 12px panel size',
      'the popover picker resolves the SAME box facts (the co-location probe-11-r4-css-rows assumed is gone; the facts are not)',
      'no rule styles only the CARD picker with more than max-height (the pre-rev-12 two-copy shape)',
    ],
    apply(source) {
      return replaceOnce(source, "'.dacCard select::picker(select),.dacPop select::picker(select){' + pickerBox + '}',", "'.dacCard select::picker(select){' + pickerBox + '}',");
    },
  },
  'popover-list-resplit-12px': {
    what: '把 popover 的列表在 12px 上重新拆出来（popover 面板是 12px，列表跟着缩小）',
    expectFail: [
      'the @supports block holds exactly three rules that can reach a ::picker(select) (one shared box + two caps)',
      'every non-max-height property of the popover picker comes from ONE rule',
      'the card and the popover picker draw their non-max-height properties from the SAME rule',
      'the two picker property maps are identical except max-height',
      'the popover list states the same font-size:13px, not its 12px panel size',
      'the popover picker resolves the SAME box facts (the co-location probe-11-r4-css-rows assumed is gone; the facts are not)',
      'no rule styles only the POPOVER picker with more than max-height',
    ],
    apply(source) {
      return replaceOnce(
        source,
        "'max-height:' + String(SESSION_TONE_ROWS * TONE_ROW_PX + TONE_PICKER_SLACK_PX) + 'px;}',",
        "'max-height:' + String(SESSION_TONE_ROWS * TONE_ROW_PX + TONE_PICKER_SLACK_PX) + 'px;}',\n            '.dacPop select::picker(select){font-size:12px;}',",
      );
    },
  },
  'popover-cap-loses-one-row': {
    what: 'popover 的上限掉回卡片的三行（忘了 +1 行 / slack）',
    expectFail: [
      'the popover picker cap is 120px',
      'the popover cap holds its four default rows plus the slack slack, and still less than five rows',
      'diagnostics.pickerMetrics agrees with the CSS that was actually injected',
    ],
    apply(source) {
      return replaceOnce(
        source,
        "'max-height:' + String(SESSION_TONE_ROWS * TONE_ROW_PX + TONE_PICKER_SLACK_PX) + 'px;}',",
        "'max-height:' + String(TONE_ROWS * TONE_ROW_PX) + 'px;}',",
      );
    },
  },
};

function replaceOnce(source, from, to) {
  const at = source.indexOf(from);
  if (at < 0) throw new Error(`mutation anchor not found: ${from}`);
  if (source.indexOf(from, at + from.length) >= 0) throw new Error(`mutation anchor is not unique: ${from}`);
  return source.slice(0, at) + to + source.slice(at + from.length);
}

/* =============================================================== 探针本体 */

const blocks = [];

/**
 * 跑一遍完整检查。返回 `{rows, verdict}`；`verbose` 决定是否打印每一步。
 * 变异模式复用同一个函数，所以「同一个断言」在 shipped 与 mutant 上是对等的。
 */
function inspect(source, { verbose, title, frozen }) {
  const report = makeReport(title, { verbose });

  const CLIENT_SOURCE = source;
  const clientHash = createHash('sha256').update(Buffer.from(CLIENT_SOURCE, 'utf8')).digest('hex').toUpperCase();
  const hostHash = createHash('sha256').update(readFileSync(HOST_PATH)).digest('hex').toUpperCase();
  const hostBytes = readFileSync(HOST_PATH).length;

  /* ---------------------------------------------------- 0. 手上的字节是不是 shipped */

  report.group('0. the bytes under test are the shipped rev-12 ones');
  report.note('file', CLIENT_PATH);
  report.note('bytes', Buffer.byteLength(CLIENT_SOURCE, 'utf8'));
  report.note('sha256', clientHash);
  report.note('brief said client bytes', FROZEN.briefClientBytes);
  if (frozen) {
    report.check(
      'lib/client.js byte count is the rev-12 frozen one (the brief\'s literal is 137331 and WRONG; the hash below is the authority)',
      Buffer.byteLength(CLIENT_SOURCE, 'utf8') === FROZEN.client.bytes,
      `frozen ${FROZEN.client.bytes}, brief ${FROZEN.briefClientBytes}`,
    );
    report.same('lib/client.js sha256 is the rev-12 frozen one', clientHash, FROZEN.client.sha256);
  } else {
    // 变异体必然改字节，所以冻结指纹那两条在变异模式下换成「变异真的改写了被求值的源」，
    // 免得每个变异都顺带把指纹断言打红、把「抓到什么」这件事淹没。
    report.check('the mutation really rewrote the evaluated source', CLIENT_SOURCE !== readFileSync(CLIENT_PATH, 'utf8'), `${Buffer.byteLength(CLIENT_SOURCE, 'utf8')} vs ${FROZEN.client.bytes} bytes`);
  }
  report.same('lib/index.js byte count is unchanged from rev-11 (this change is client-only)', hostBytes, FROZEN.host.bytes);
  report.same('lib/index.js sha256 is unchanged from rev-11 (this change is client-only)', hostHash, FROZEN.host.sha256);

  const boot = loadClient(CLIENT_SOURCE);
  report.check('the bundle evaluated without a load error', boot.ledger.loadError === null, String(boot.ledger.loadError ?? ''));
  report.check('the bundle evaluated without a factory error', boot.ledger.factoryError === null, String(boot.ledger.factoryError ?? ''));
  report.deep('it required only react', boot.ledger.requires, ['react']);
  report.same('lib/client.js has no top-level import/export (it is a classic script)', /^import |^export /m.test(CLIENT_SOURCE), false);

  const app = makeCtx();
  boot.contract.apply(app.ctx);
  boot.react.runEffects();

  const diagnostics = boot.sandbox.__DSH_APPROVAL_CHIME__;
  report.same('diagnostics.revision is the rev-12 stamp', diagnostics?.revision, FROZEN.revision);

  const stylesheet = boot.document.stylesheet();
  report.check('the bundle injected its stylesheet', typeof stylesheet === 'string' && stylesheet.length > 0, stylesheet === null ? 'null' : `${stylesheet.length} chars`);

  /* ------------------------------------------- 1. 真实渲染树里的两个 select */

  report.group('1. the two <select> elements, taken from the REAL rendered trees');

  const sectionEntry = app.log.registrations.find((row) => row.entry?.name === 'settings.section');
  report.check('the section component is registered', typeof sectionEntry?.component === 'function');
  const cardTree = sectionEntry === undefined ? null : boot.react.draw(sectionEntry.component, {});
  const cardSelects = cardTree === null ? [] : selectChains(cardTree);
  report.same('the settings card renders exactly one <select> (the tone menu)', cardSelects.length, 1);
  const cardSelect = cardSelects[0] ?? null;
  report.check(
    'the card select really sits under a .dacCard ancestor',
    cardSelect !== null && cardSelect.ancestors.some((entry) => entry.classes.includes('dacCard')),
    cardSelect === null ? 'no select' : JSON.stringify(cardSelect.ancestors.map((entry) => `${entry.tag}.${entry.classes.join('.')}`)),
  );
  report.same('the card\'s default list has exactly 3 rows', cardSelect === null ? -1 : countOptions(cardSelect), 3);

  const sessionEntry = app.log.registrations.find((row) => row.entry?.name === 'conversation.session.header.actions');
  report.check('the session-header bell component is registered', typeof sessionEntry?.component === 'function');
  const bell = sessionEntry === undefined ? null : boot.react.draw(sessionEntry.component, { sessionId: 'probe-session' });
  const caret = bell === null ? null : findAll(bell, (node) => node.type === 'button' && node.props.className === 'dacCaret')[0];
  report.check('the bell renders its caret (the popover trigger)', caret !== undefined && caret !== null);
  if (caret !== undefined && caret !== null && typeof caret.props.onClick === 'function') caret.props.onClick();
  const bellOpen = sessionEntry === undefined ? null : boot.react.draw(sessionEntry.component, { sessionId: 'probe-session' });
  const pop = bellOpen === null ? null : findAll(bellOpen, (node) => node.props?.className === 'dacPop')[0];
  report.check('the popover opens from the caret', pop !== undefined && pop !== null, pop === null ? 'no .dacPop' : `role=${pop.props.role}`);

  const popSelects = pop === undefined || pop === null ? [] : selectChains(pop);
  report.same('the popover renders exactly one <select> (the tone menu)', popSelects.length, 1);
  const popSelect = popSelects[0] ?? null;
  report.check(
    'the popover select really sits under a .dacPop ancestor',
    popSelect !== null && popSelect.ancestors.some((entry) => entry.classes.includes('dacPop')),
    popSelect === null ? 'no select' : JSON.stringify(popSelect.ancestors.map((entry) => `${entry.tag}.${entry.classes.join('.')}`)),
  );
  report.same('the popover\'s default list has exactly 4 rows (跟随全局 + 3 built-ins)', popSelect === null ? -1 : countOptions(popSelect), 4);
  if (popSelect !== null) {
    report.note('popover option values', popSelect.children.map((child) => child.props.value));
  }

  /* ------------------------------------------------- 2. 把样式表解析成规则 */

  report.group('2. the injected CSS, parsed as CSS (not string-matched)');

  const allRules = parseRules(stylesheet ?? '');
  const supportRules = allRules.filter((rule) => rule.context.some((entry) => entry.startsWith('@supports') && entry.includes('appearance:base-select')));
  report.check('the stylesheet carries an @supports (appearance:base-select) block', supportRules.length > 0, `${supportRules.length} rule(s) inside it`);
  report.check(
    'nothing inside that block uses !important, so (specificity, order) is the whole cascade model',
    !supportRules.some((rule) => rule.decls.some((decl) => /!important/i.test(decl.value))),
    JSON.stringify(supportRules.flatMap((rule) => rule.decls.filter((decl) => /!important/i.test(decl.value)).map((decl) => `${rule.prelude} { ${decl.prop} }`))),
  );
  const selectSelectors = allRules.flatMap((rule) => rule.selectors).filter((selector) => /select/.test(selector));
  const unmodeled = selectSelectors.filter((selector) => parseComplex(selector) === null);
  report.check('every select-bearing selector is descendant-only (my matcher models all of them)', unmodeled.length === 0, JSON.stringify(unmodeled));

  if (cardSelect === null || popSelect === null) {
    report.check('both real select elements were found, so the parity checks can run', false, 'aborting the parity section');
    return report.done();
  }

  /* --------------------------------- 3. 目标链：真实祖先链 + picker 伪元素 */

  const cardChain = cardSelect.ancestors.map((entry) => ({ ...entry, pseudoElement: null }));
  cardChain.push({ tag: 'select', classes: [], pseudoClasses: [], pseudoElement: null });
  const popChain = popSelect.ancestors.map((entry) => ({ ...entry, pseudoElement: null }));
  popChain.push({ tag: 'select', classes: [], pseudoClasses: [], pseudoElement: null });

  const CARD_PICKER = withPseudo(cardChain, 'picker(select)');
  const POP_PICKER = withPseudo(popChain, 'picker(select)');
  const CARD_SELECT_TARGET = cardChain;
  const POP_SELECT_TARGET = popChain;
  const CARD_OPTION = [...cardChain, { tag: 'option', classes: [], pseudoClasses: [], pseudoElement: null }];
  const POP_OPTION = [...popChain, { tag: 'option', classes: [], pseudoClasses: [], pseudoElement: null }];

  report.note('card chain', cardChain.map((entry) => `${entry.tag}.${entry.classes.join('.')}`));
  report.note('popover chain', popChain.map((entry) => `${entry.tag}.${entry.classes.join('.')}`));

  /* ------------------------------------------- 4. 一份共享的 picker 规则 */

  report.group('4. ONE shared ::picker(select) rule, and the two property maps differ only in max-height');

  const reachesCardPicker = (rule) => rule.selectors.some((selector) => matchesChain(CARD_PICKER, parseComplex(selector)));
  const reachesPopPicker = (rule) => rule.selectors.some((selector) => matchesChain(POP_PICKER, parseComplex(selector)));

  const sharedPickerRules = supportRules.filter((rule) => reachesCardPicker(rule) && reachesPopPicker(rule));
  report.same('the picker CSS has exactly one rule that names BOTH tone lists', sharedPickerRules.length, 1);
  report.same(
    'that one shared picker rule is literally `.dacCard select::picker(select),.dacPop select::picker(select)`',
    JSON.stringify(sharedPickerRules[0]?.selectors ?? []),
    JSON.stringify(['.dacCard select::picker(select)', '.dacPop select::picker(select)']),
  );

  const baseSelectOf = (chain) => cascade(supportRules, chain).get('appearance')?.value ?? null;
  report.same('the card select opts into appearance:base-select', baseSelectOf(CARD_SELECT_TARGET), 'base-select');
  report.same('the popover select opts into appearance:base-select', baseSelectOf(POP_SELECT_TARGET), 'base-select');
  report.same('the shared picker rule itself also states appearance:base-select', cascade(supportRules, CARD_PICKER).get('appearance')?.value ?? null, 'base-select');

  const cardWinners = cascade(supportRules, CARD_PICKER);
  const popWinners = cascade(supportRules, POP_PICKER);
  const cardMap = plainMap(cardWinners);
  const popMap = plainMap(popWinners);

  const nonMaxRules = (winners) => [...new Set([...winners.entries()].filter(([prop]) => prop !== 'max-height').map(([, entry]) => entry.rule))];
  const cardNonMaxRules = nonMaxRules(cardWinners);
  const popNonMaxRules = nonMaxRules(popWinners);
  report.same('every non-max-height property of the card picker comes from ONE rule', cardNonMaxRules.length, 1);
  report.same('every non-max-height property of the popover picker comes from ONE rule', popNonMaxRules.length, 1);
  report.check(
    'the card and the popover picker draw their non-max-height properties from the SAME rule',
    cardNonMaxRules.length === 1 && popNonMaxRules.length === 1 && cardNonMaxRules[0] === popNonMaxRules[0],
    `card=${cardNonMaxRules[0]?.prelude ?? 'none'} pop=${popNonMaxRules[0]?.prelude ?? 'none'}`,
  );

  report.deep('the two picker property maps have the same property names', Object.keys(cardMap).sort(), Object.keys(popMap).sort());
  report.deep('the two picker property maps are identical except max-height', withoutMaxHeight(cardMap), withoutMaxHeight(popMap));
  report.note('the shared picker property map', withoutMaxHeight(cardMap));
  report.same('the card picker cap is 84px', cardMap['max-height'], '84px');
  report.same('the popover picker cap is 120px', popMap['max-height'], '120px');

  report.same('both tone lists state font-size:13px (the card\'s own size)', cardMap['font-size'], '13px');
  report.same('the popover list states the same font-size:13px, not its 12px panel size', popMap['font-size'], '13px');

  report.deep(
    'the shared box keeps every rev-4/rev-5 fact (rounded, token colours, content-box, 4px padding, hairline border, vertical scroll)',
    {
      'border-radius': cardMap['border-radius'],
      border: cardMap.border,
      padding: cardMap.padding,
      'margin-top': cardMap['margin-top'],
      'box-sizing': cardMap['box-sizing'],
      'overflow-y': cardMap['overflow-y'],
      'overflow-x': cardMap['overflow-x'],
      background: cardMap.background,
      'box-shadow': cardMap['box-shadow'],
    },
    {
      'border-radius': '10px',
      border: '1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16))',
      padding: '4px',
      'margin-top': '4px',
      'box-sizing': 'content-box',
      'overflow-y': 'auto',
      'overflow-x': 'hidden',
      background: cardMap.background,
      'box-shadow': '0 10px 28px rgba(0,0,0,.28)',
    },
  );
  report.deep(
    'the popover picker resolves the SAME box facts (the co-location probe-11-r4-css-rows assumed is gone; the facts are not)',
    withoutMaxHeight(popMap),
    withoutMaxHeight(cardMap),
  );

  const pickerRules = supportRules.filter((rule) => reachesCardPicker(rule) || reachesPopPicker(rule));
  report.same('the @supports block holds exactly three rules that can reach a ::picker(select) (one shared box + two caps)', pickerRules.length, 3);
  report.check(
    'no rule styles only the CARD picker with more than max-height (the pre-rev-12 two-copy shape)',
    !supportRules.some((rule) => reachesCardPicker(rule) && !reachesPopPicker(rule) && rule.decls.some((decl) => decl.prop !== 'max-height')),
    JSON.stringify(supportRules.filter((rule) => reachesCardPicker(rule) && !reachesPopPicker(rule)).map((rule) => rule.prelude)),
  );
  report.check(
    'no rule styles only the POPOVER picker with more than max-height',
    !supportRules.some((rule) => reachesPopPicker(rule) && !reachesCardPicker(rule) && rule.decls.some((decl) => decl.prop !== 'max-height')),
    JSON.stringify(supportRules.filter((rule) => reachesPopPicker(rule) && !reachesCardPicker(rule)).map((rule) => rule.prelude)),
  );

  /* --------------------------------- 5. 一条共用行规则 + 一条共用高亮规则 */

  report.group('5. ONE shared option-row rule and ONE shared highlight rule');

  const optionRulesInBlock = supportRules.filter((rule) => rule.selectors.some((selector) => matchesChain(CARD_OPTION, parseComplex(selector))));
  const popOptionRulesInBlock = supportRules.filter((rule) => rule.selectors.some((selector) => matchesChain(POP_OPTION, parseComplex(selector))));
  report.same('exactly one rule in the block styles the card\'s option rows', optionRulesInBlock.length, 1);
  report.same('exactly one rule in the block styles the popover\'s option rows', popOptionRulesInBlock.length, 1);
  report.check(
    'it is the SAME rule for both lists',
    optionRulesInBlock.length === 1 && popOptionRulesInBlock.length === 1 && optionRulesInBlock[0] === popOptionRulesInBlock[0],
    `card=${optionRulesInBlock[0]?.prelude ?? 'none'} pop=${popOptionRulesInBlock[0]?.prelude ?? 'none'}`,
  );
  report.same(
    'that one row rule names both lists in one selector list',
    JSON.stringify(optionRulesInBlock[0]?.selectors ?? []),
    JSON.stringify(['.dacCard select option', '.dacPop select option']),
  );

  const cardOptionWinners = cascade(supportRules, CARD_OPTION);
  const popOptionWinners = cascade(supportRules, POP_OPTION);
  const cardOptionMap = plainMap(cardOptionWinners);
  const popOptionMap = plainMap(popOptionWinners);
  report.deep('the card and the popover option rows resolve to the same property map', cardOptionMap, popOptionMap);
  report.deep(
    'that shared row map is radius 7 / padding 4px 9px / pinned line-height 20px',
    cardOptionMap,
    { 'border-radius': '7px', padding: '4px 9px', 'line-height': '20px' },
  );

  /**
   * 「只在某个状态下才生效」的规则：能命中该状态的目标，但**命中不了**无状态的目标。
   * 这样行规则（不带伪类）不会被误算成高亮规则 —— 不带 `:hover` 的规则当然也作用于
   * 悬停中的元素，所以「有几条规则命中悬停目标」不是有意义的问题。
   */
  const stateOnlyRules = (chain, state) => supportRules.filter((rule) => rule.selectors.some((selector) => matchesChain(withPseudo(chain, null, [state]), parseComplex(selector)))
    && !rule.selectors.some((selector) => matchesChain(chain, parseComplex(selector))));
  const cardHover = stateOnlyRules(CARD_OPTION, 'hover');
  const popHover = stateOnlyRules(POP_OPTION, 'hover');
  const cardChecked = stateOnlyRules(CARD_OPTION, 'checked');
  const popChecked = stateOnlyRules(POP_OPTION, 'checked');
  report.same('exactly one rule is conditional on the card option :hover', cardHover.length, 1);
  report.same('exactly one rule is conditional on the popover option :hover', popHover.length, 1);
  report.same('exactly one rule is conditional on the card option :checked', cardChecked.length, 1);
  report.same('exactly one rule is conditional on the popover option :checked', popChecked.length, 1);
  const highlightSelectors = (cardHover[0]?.selectors ?? []).join(',');
  report.check(
    'the one highlight rule names BOTH lists in both states (four selectors, one rule)',
    cardHover[0] !== undefined && cardHover[0] === popHover[0] && cardHover[0] === cardChecked[0] && cardHover[0] === popChecked[0]
      && ['.dacCard select option:hover', '.dacCard select option:checked', '.dacPop select option:hover', '.dacPop select option:checked'].every((selector) => highlightSelectors.includes(selector)),
    JSON.stringify(cardHover[0]?.selectors ?? []),
  );
  const cardHighlight = plainMap(cascade(supportRules, withPseudo(CARD_OPTION, null, ['hover'])));
  const popHighlight = plainMap(cascade(supportRules, withPseudo(POP_OPTION, null, ['hover'])));
  report.deep('the card and the popover highlights resolve to the same painted declaration', cardHighlight, popHighlight);
  report.same('the highlight is the shared 14% currentColor tint', cardHighlight.background, 'color-mix(in srgb,currentColor 14%,transparent)');

  /* ---------------------------------------------------- 6. 几何算术 */

  report.group('6. the row arithmetic, and the bundle\'s own numbers');

  const rowPx = Number(String(cardOptionMap['line-height']).replace('px', '')) + 4 + 4;
  report.same('one option row box is 28px (20px line-height + 4px padding twice)', rowPx, 28);
  report.same('the card cap is EXACTLY three of those rows (84px)', Number(String(cardMap['max-height']).replace('px', '')), 3 * rowPx);

  const cardCapPx = Number(String(cardMap['max-height']).replace('px', ''));
  const popCapPx = Number(String(popMap['max-height']).replace('px', ''));
  const popRows = Number(diagnostics?.sessionToneRows);
  const slackPx = popCapPx - popRows * rowPx;
  report.same('the popover cap holds its four default rows plus the slack slack, and still less than five rows', true, popCapPx >= popRows * rowPx && popCapPx < (popRows + 1) * rowPx && slackPx > 0 && slackPx < rowPx);
  report.note('popover cap arithmetic', `${popCapPx}px = ${popRows} x ${rowPx}px + ${slackPx}px slack; a fifth row would need ${(popRows + 1) * rowPx}px`);
  report.same('the popover\'s four default rows equal the cap\'s row count', countOptions(popSelect), popRows);
  report.same('the card\'s three default rows equal its cap\'s row count', countOptions(cardSelect), Number(diagnostics?.toneRows));
  report.same('diagnostics.sessionToneRows is exactly toneRows + 1', Number(diagnostics?.sessionToneRows), Number(diagnostics?.toneRows) + 1);
  report.deep(
    'diagnostics.pickerMetrics agrees with the CSS that was actually injected',
    diagnostics?.pickerMetrics,
    { rowPx: 28, textPx: 13, slackPx: 8, cardMaxPx: cardCapPx, sessionMaxPx: popCapPx },
  );

  /* ---------------------------- 7. 不支持 base-select 时的兜底配色也共用一条规则 */

  report.group('7. the no-base-select fallback already names both lists too');

  const fallbackRules = allRules.filter((rule) => rule.context.length === 0);
  const cardFallbackOptionRules = fallbackRules.filter((rule) => rule.selectors.some((selector) => matchesChain(CARD_OPTION, parseComplex(selector))));
  const popFallbackOptionRules = fallbackRules.filter((rule) => rule.selectors.some((selector) => matchesChain(POP_OPTION, parseComplex(selector))));
  report.same('exactly one fallback rule names the card\'s option list', cardFallbackOptionRules.length, 1);
  report.check(
    'the fallback option-colour rule is ONE rule naming both lists',
    cardFallbackOptionRules.length === 1 && popFallbackOptionRules.length === 1 && cardFallbackOptionRules[0] === popFallbackOptionRules[0]
      && (cardFallbackOptionRules[0]?.selectors ?? []).length === 2,
    JSON.stringify(cardFallbackOptionRules[0]?.selectors ?? []),
  );
  const cardFallbackColors = plainMap(cascade(fallbackRules, CARD_OPTION));
  const popFallbackColors = plainMap(cascade(fallbackRules, POP_OPTION));
  report.deep('the fallback option colours resolve identically for both lists', cardFallbackColors, popFallbackColors);
  report.deep(
    'and they are the design-token pair (never a hard-coded dark palette)',
    cardFallbackColors,
    {
      'background-color': 'var(--dsw-alias-bg-layer-1,#fff)',
      color: 'var(--dsw-alias-label-primary,#1a1a1a)',
    },
  );

  return report.done();
}

function findAll(node, predicate) {
  const found = [];
  const visit = (current) => {
    if (current === null || current === undefined) return;
    if (Array.isArray(current)) {
      for (const child of current) visit(child);
      return;
    }
    if (typeof current !== 'object') return;
    if (predicate(current)) found.push(current);
    visit(current.children);
  };
  visit(node);
  return found;
}

/* ------------------------------------------------------------------- driver */

const mutateArg = process.argv.find((value) => value.startsWith('--mutate='));
const MUTATION_NAME = mutateArg === undefined ? null : mutateArg.slice('--mutate='.length);

if (process.argv.includes('--list-mutations')) {
  for (const [name, entry] of Object.entries(MUTATIONS)) console.log(`${name}: ${entry.what}`);
  process.exit(0);
}
if (MUTATION_NAME !== null && MUTATION_NAME !== 'all' && MUTATIONS[MUTATION_NAME] === undefined) {
  console.error(`unknown mutation ${mutateArg}; available: ${Object.keys(MUTATIONS).join(', ')}, all`);
  process.exit(2);
}

const SHIPPED = readFileSync(CLIENT_PATH, 'utf8');

/* ---- shipped 基线 ---- */

console.log('='.repeat(78));
console.log(`probe-19-r12-select-parity.mjs [${MUTATION_NAME === null ? 'shipped' : `mutant:${MUTATION_NAME}`}]`);
console.log('='.repeat(78));
const shippedVerdict = inspect(SHIPPED, { verbose: true, title: 'probe-19 · shipped rev-12', frozen: true });

let exitCode = shippedVerdict.failed === 0 ? 0 : 1;

/* ---- 变异 ---- */

const namesToRun = MUTATION_NAME === null
  ? []
  : (MUTATION_NAME === 'all' ? Object.keys(MUTATIONS) : [MUTATION_NAME]);

const observedSets = new Map();
for (const name of namesToRun) {
  const entry = MUTATIONS[name];
  const mutated = entry.apply(SHIPPED);
  const shippedDigest = createHash('sha256').update(Buffer.from(SHIPPED, 'utf8')).digest('hex').toUpperCase();
  const mutantDigest = createHash('sha256').update(Buffer.from(mutated, 'utf8')).digest('hex').toUpperCase();
  if (mutated === SHIPPED) {
    console.error(`mutation ${name} did not change the source (sha256 ${mutantDigest} == shipped ${shippedDigest}) — DEAD MUTATION`);
    exitCode = 1;
    continue;
  }
  const verbose = namesToRun.length === 1;
  if (verbose) {
    console.log('\n' + '='.repeat(78));
    console.log(`MUTANT: ${name} — ${entry.what}`);
    console.log('='.repeat(78));
  }
  const verdict = inspect(mutated, { verbose, title: `probe-19 · mutant:${name}`, frozen: false });
  const failing = new Set(verdict.failedNames);
  observedSets.set(name, failing);
  const missing = entry.expectFail.filter((check) => !failing.has(check));
  const surprise = verdict.failedNames.filter((check) => !entry.expectFail.includes(check));
  console.log(`\n### mutation ${name}: ${verdict.total - verdict.failed}/${verdict.total} still pass; ${failing.size} reddened`);
  console.log(`    what: ${entry.what}`);
  console.log(`    mutant source sha256 ${mutantDigest} vs shipped ${shippedDigest}`);
  console.log(`    declared red set (${entry.expectFail.length}): ${JSON.stringify(entry.expectFail)}`);
  console.log(`    reddened: ${JSON.stringify([...failing])}`);
  console.log(`    red set is EXACTLY the declaration: ${missing.length === 0 && surprise.length === 0}`);
  if (missing.length > 0) console.log(`    NOT CAUGHT (declared but still green): ${JSON.stringify(missing)}`);
  if (surprise.length > 0) console.log(`    UNDECLARED red (the declaration is wrong or the check is unstable): ${JSON.stringify(surprise)}`);
  // The mutant is caught EITHER exactly as declared, or not at all: a red set that is
  // missing a declared check, empty, or wider than the declaration fails this probe
  // (t2 audit — previously `surprise` was printed but did not affect the exit code).
  if (missing.length > 0 || surprise.length > 0 || failing.size === 0) exitCode = 1;
}

if (namesToRun.length > 1) {
  console.log('\n' + '='.repeat(78));
  console.log('### mutation summary — every mutant must redden a DIFFERENT non-empty subset');
  console.log('='.repeat(78));
  const entries = [...observedSets.entries()];
  for (const [name, failing] of entries) {
    const declared = MUTATIONS[name].expectFail;
    const exact = failing.size === declared.length && declared.every((check) => failing.has(check));
    console.log(`${exact ? '[PASS]' : '[FAIL]'} ${name}: reddens EXACTLY its ${declared.length} declared check(s) (measured ${failing.size})`);
    if (!exact) exitCode = 1;
  }
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [nameA, setA] = entries[i];
      const [nameB, setB] = entries[j];
      const same = setA.size === setB.size && [...setA].every((check) => setB.has(check));
      console.log(`${same ? '[FAIL]' : '[PASS]'} ${nameA} and ${nameB} redden different subsets`);
      if (same) exitCode = 1;
    }
  }
}

console.log('\n' + '='.repeat(78));
console.log(`probe-19 verdict: shipped ${shippedVerdict.failed === 0 ? 'GREEN' : `RED (${shippedVerdict.failed} failed)`}, ${namesToRun.length} mutation(s) exercised, exit=${exitCode}`);
console.log('NOT verifiable on this machine (no browser engine): real picker pixel height, whether the');
console.log('popover\'s four rows really fit without a scrollbar, the painted highlight colour, the');
console.log('checkmark glyph, and the closed control\'s look.');
console.log('='.repeat(78));

process.exitCode = exitCode;
