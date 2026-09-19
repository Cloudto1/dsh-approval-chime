#!/usr/bin/env node
/**
 * r15-t3 — the verifier's own inventory of the ten rebaselined legacy probes.
 *
 * It answers three questions about the rebaseline, statically:
 *   1. did any assertion NAME disappear? Every removed literal must be paired 1:1 with a
 *      literal that appeared, and each pair is printed with its similarity score;
 *   2. did the number of dynamic (template-built) assertion names change? Those cannot be
 *      compared textually, so the counts are printed and the case tables that move them
 *      are named in the evidence file;
 *   3. was any non-ASCII text damaged? The multiset of non-ASCII characters is compared
 *      before/after, so an encoding accident shows up as a character delta.
 *
 * Baseline: the byte-exact pre-edit copies this task archived under
 * `verify-independent/_raw/r15-t3-src-before-<probe>.mjs.txt`.
 *
 * Usage: node verify-independent/r15t3-legacy-inventory.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(HERE, '..');
const RAW_DIR = join(HERE, '_raw');

/** Every reporter entry point the two kits expose across these ten probes. */
const METHODS = [
  'check',
  'same',
  'near',
  'equal',
  'deep',
  'deepEqual',
  'ok',
  'group',
  'section',
  'note',
  'raw',
  'unproven',
  'fail',
  'done',
];
/** The subset that asserts a fact about the product. */
const ASSERTION_METHODS = ['check', 'same', 'near', 'equal', 'deep', 'deepEqual', 'ok', 'fail'];

const PROBES = [
  'probe-1-approval',
  'probe-2-gain-and-resources',
  'probe-3-card-and-scope',
  'probe-4-host-half',
  'probe-5-contract',
  'probe-6-autoplay-replay',
  'probe-7-host-audio-http',
  'probe-8-client-roster-render',
  'probe-9-client-playback',
  'probe-10-startup-resilience',
];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

function readStringLiteral(source, from) {
  const quote = source[from];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  let out = '';
  let index = from + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      out += source[index + 1] ?? '';
      index += 2;
      continue;
    }
    if (char === quote) return { text: out, dynamic: quote === '`' && out.includes('${') };
    out += char;
    index += 1;
  }
  return null;
}

function lineOf(source, at) {
  let line = 1;
  for (let index = 0; index < at && index < source.length; index += 1) if (source[index] === '\n') line += 1;
  return line;
}

/** `{ names, assertionNames, dynamic, perMethod, nonAscii }` for one source file. */
function inventoryOf(source) {
  const names = new Map();
  const assertionNames = new Map();
  const dynamics = [];
  const perMethod = {};
  let dynamic = 0;
  for (const method of METHODS) {
    perMethod[method] = 0;
    let at = 0;
    const needle = `.${method}(`;
    while (at < source.length) {
      const found = source.indexOf(needle, at);
      if (found < 0) break;
      at = found + needle.length;
      // Only the reporter objects count: `foo.check(` is how both kits are called.
      const receiver = source.slice(Math.max(0, found - 6), found).match(/([A-Za-z_$][\w$]*)$/);
      if (receiver === null || (receiver[1] !== 'report' && receiver[1] !== 'log')) continue;
      perMethod[method] += 1;
      let index = at;
      while (index < source.length && /\s/.test(source[index])) index += 1;
      const literal = readStringLiteral(source, index);
      if (literal === null || literal.dynamic === true) {
        dynamic += 1;
        dynamics.push({ method, line: lineOf(source, found), snippet: source.slice(index, index + 70).split('\n')[0] });
        continue;
      }
      names.set(literal.text, (names.get(literal.text) ?? 0) + 1);
      if (ASSERTION_METHODS.includes(method)) assertionNames.set(literal.text, (assertionNames.get(literal.text) ?? 0) + 1);
    }
  }
  const nonAscii = new Map();
  for (const char of source) {
    const code = char.codePointAt(0);
    if (code > 127) nonAscii.set(char, (nonAscii.get(char) ?? 0) + 1);
  }
  return { names, assertionNames, dynamics, dynamic, perMethod, nonAscii };
}

function sum(map) {
  let total = 0;
  for (const value of map.values()) total += value;
  return total;
}

function delta(beforeMap, afterMap) {
  const removed = [];
  const added = [];
  for (const [name, count] of beforeMap) {
    const now = afterMap.get(name) ?? 0;
    if (now < count) for (let index = 0; index < count - now; index += 1) removed.push(name);
  }
  for (const [name, count] of afterMap) {
    const was = beforeMap.get(name) ?? 0;
    if (was < count) for (let index = 0; index < count - was; index += 1) added.push(name);
  }
  return { removed, added };
}

function lcsLength(a, b) {
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      table[i][j] = a[i - 1] === b[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  return table[a.length][b.length];
}

function tokenOverlap(a, b) {
  const tokens = (value) => new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const left = tokens(a);
  const right = tokens(b);
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  return common / Math.max(left.size, right.size);
}

function similarity(a, b) {
  return Math.max(lcsLength(a, b) / Math.max(a.length, b.length), tokenOverlap(a, b));
}

function pairRenames(removed, added) {
  const candidates = [];
  for (let i = 0; i < removed.length; i += 1) {
    for (let j = 0; j < added.length; j += 1) candidates.push({ i, j, score: similarity(removed[i], added[j]) });
  }
  candidates.sort((left, right) => right.score - left.score);
  const usedRemoved = new Set();
  const usedAdded = new Set();
  const pairs = [];
  for (const candidate of candidates) {
    if (usedRemoved.has(candidate.i) || usedAdded.has(candidate.j)) continue;
    usedRemoved.add(candidate.i);
    usedAdded.add(candidate.j);
    pairs.push({ old: removed[candidate.i], now: added[candidate.j], score: candidate.score });
    if (usedRemoved.size === removed.length) break;
  }
  return { pairs, leftoverAdded: added.filter((_, index) => !usedAdded.has(index)) };
}

function main() {
  console.log('r15-t3 · legacy-probe assertion inventory (verifier-owned parser)');
  console.log(`plugin dir: ${PLUGIN_DIR}\n`);
  let ok = true;
  let totalRemoved = 0;
  let totalAdded = 0;

  for (const probe of PROBES) {
    const archivePath = join(RAW_DIR, `r15-t3-src-before-${probe}.mjs.txt`);
    const livePath = join(HERE, `${probe}.mjs`);
    const beforeBuffer = readFileSync(archivePath);
    const afterBuffer = readFileSync(livePath);
    const before = inventoryOf(beforeBuffer.toString('utf8'));
    const after = inventoryOf(afterBuffer.toString('utf8'));
    const all = delta(before.names, after.names);
    const assertions = delta(before.assertionNames, after.assertionNames);
    totalRemoved += assertions.removed.length;
    totalAdded += assertions.added.length;

    console.log(`=== ${probe}.mjs ===`);
    console.log(`  before  ${relative(PLUGIN_DIR, archivePath).split('\\').join('/')}  ${beforeBuffer.length} B  ${sha256(beforeBuffer)}`);
    console.log(`  after   ${relative(PLUGIN_DIR, livePath).split('\\').join('/')}  ${afterBuffer.length} B  ${sha256(afterBuffer)}`);
    console.log(`  mtime   ${statSync(livePath).mtime.toISOString()}`);
    console.log(`  reporter call sites     ${sum(new Map(Object.entries(before.perMethod)))} -> ${sum(new Map(Object.entries(after.perMethod)))}`);
    console.log(`    per method            ${JSON.stringify(before.perMethod)} -> ${JSON.stringify(after.perMethod)}`);
    console.log(`  static literal names    ${sum(before.names)} -> ${sum(after.names)} (assertion-only ${sum(before.assertionNames)} -> ${sum(after.assertionNames)})`);
    console.log(`  dynamic (template) names ${before.dynamic} -> ${after.dynamic}`);
    console.log(`  assertion removals=${assertions.removed.length} additions=${assertions.added.length}`);

    if (assertions.removed.length === 0) {
      console.log('  no assertion name disappeared; nothing to pair.');
    } else {
      const { pairs, leftoverAdded } = pairRenames(assertions.removed, assertions.added);
      console.log('  1:1 pairing of every removed assertion name, printed one by one:');
      for (let index = 0; index < pairs.length; index += 1) {
        const pair = pairs[index];
        console.log(`    PAIR ${index + 1} (similarity ${pair.score.toFixed(3)})`);
        console.log(`      removed: ${JSON.stringify(pair.old)}`);
        console.log(`      added  : ${JSON.stringify(pair.now)}`);
      }
      if (pairs.length !== assertions.removed.length) {
        console.log(`    UNPAIRED REMOVALS: ${assertions.removed.length - pairs.length}`);
        ok = false;
      }
      if (leftoverAdded.length > 0) {
        console.log(`    new assertions with no removed counterpart: ${leftoverAdded.length}`);
        for (const name of leftoverAdded) console.log(`      + ${JSON.stringify(name)}`);
      }
    }

    const charDelta = delta(before.nonAscii, after.nonAscii);
    console.log(`  non-ASCII characters    ${sum(before.nonAscii)} -> ${sum(after.nonAscii)} distinct ${before.nonAscii.size} -> ${after.nonAscii.size}`);
    if (charDelta.removed.length > 0 || charDelta.added.length > 0) {
      console.log(`    removed chars: ${JSON.stringify(charDelta.removed.map((char) => `${char} U+${char.codePointAt(0).toString(16).toUpperCase()}`))}`);
      console.log(`    added chars  : ${JSON.stringify(charDelta.added.map((char) => `${char} U+${char.codePointAt(0).toString(16).toUpperCase()}`))}`);
    } else {
      console.log('    identical non-ASCII character multiset (no encoding damage)');
    }
    const replacementChars = (afterBuffer.toString('utf8').match(/\uFFFD/g) ?? []).length;
    console.log(`  U+FFFD replacement characters in the edited file: ${replacementChars}`);
    if (replacementChars > 0) ok = false;
    console.log('');
  }

  console.log(`RESULT: ${ok ? 'every disappeared assertion name is paired 1:1' : 'UNPAIRED REMOVAL OR ENCODING DAMAGE — see above'}`);
  console.log(`        removed=${totalRemoved} added=${totalAdded} across ${PROBES.length} probes`);
  process.exitCode = ok ? 0 : 1;
}

main();
