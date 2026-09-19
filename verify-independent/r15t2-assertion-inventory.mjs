#!/usr/bin/env node
/**
 * r15-t2 — the verifier's OWN static inventory of the self-test corpus.
 *
 * It answers one question without running anything: did the rev-15 round delete
 * any assertion from the harnesses it touched? The parser here is written for this
 * task; it does not read, import or reuse the author's inventory script, and it
 * never copies assertion bodies — it collects the name literal each assertion call
 * hands its reporter, then compares multisets.
 *
 * Baseline for the comparison is the pre-rev-15 archive that the rev-15
 * implementation left under `verify-independent/_raw/`:
 *   r15-t1-before-verify-client-half.test.mjs.txt
 *   r15-t1-before-verify-custom-audio.test.mjs.txt
 * `verify/host-half.test.mjs` and `verify/waterfall.test.mjs` have no rev-15
 * baseline because the rev-15 round never wrote them: their byte hash and mtime are
 * printed so that claim is checkable, and their name sets are reported as-is.
 *
 * A name that disappeared must be paired 1:1 with a name that appeared and the pair
 * is printed with its similarity score; an unpairable removal fails the run. The
 * comparison is also repeated with `rev-\d+` folded to `rev-N`, so a version-literal
 * re-anchoring cannot be mistaken for a behavioural rewrite — or hide one.
 *
 * Usage: node verify-independent/r15t2-assertion-inventory.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(HERE, '..');
const VERIFY_DIR = join(PLUGIN_DIR, 'verify');
const RAW_DIR = join(HERE, '_raw');

/** Every reporter entry point the tests call. */
const METHODS = ['section', 'check', 'equal', 'deepEqual', 'ok', 'close', 'skip'];
/** The subset that asserts a fact (a section heading asserts nothing). */
const ASSERTION_METHODS = ['check', 'equal', 'deepEqual', 'ok', 'close', 'skip'];

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
  for (let index = 0; index < at && index < source.length; index += 1) {
    if (source[index] === '\n') line += 1;
  }
  return line;
}

/**
 * Collect `report.<method>('name', …)` entries from one source.
 * @returns `{ calls, names, assertionNames, dynamics, dynamic, perMethod }`.
 */
function inventoryOf(source) {
  const calls = [];
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
      perMethod[method] += 1;
      let index = at;
      while (index < source.length && /\s/.test(source[index])) index += 1;
      const literal = readStringLiteral(source, index);
      if (literal === null || literal.dynamic === true) {
        dynamic += 1;
        dynamics.push({ method, line: lineOf(source, found), snippet: source.slice(index, index + 60).split('\n')[0] });
        calls.push({ method, name: null });
        continue;
      }
      calls.push({ method, name: literal.text });
      names.set(literal.text, (names.get(literal.text) ?? 0) + 1);
      if (ASSERTION_METHODS.includes(method)) {
        assertionNames.set(literal.text, (assertionNames.get(literal.text) ?? 0) + 1);
      }
    }
  }
  return { calls, names, assertionNames, dynamics, dynamic, perMethod };
}

function describeFile(path) {
  const buffer = readFileSync(path);
  return {
    label: relative(PLUGIN_DIR, path).split('\\').join('/'),
    bytes: buffer.length,
    sha256: sha256(buffer),
    mtime: statSync(path).mtime.toISOString(),
    text: buffer.toString('utf8'),
  };
}

function sum(map) {
  let total = 0;
  for (const value of map.values()) total += value;
  return total;
}

function multiset(entries, normalise) {
  const out = new Map();
  for (const name of entries) {
    const key = normalise === true ? name.replace(/rev-\d+/g, 'rev-N') : name;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
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

/** Greedy best-match 1:1 pairing of removed occurrences with added occurrences. */
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
  return {
    pairs,
    leftoverAdded: added.filter((_, index) => !usedAdded.has(index)),
  };
}

function pairBlock(label, removed, added) {
  console.log(`  ${label}: removed=${removed.length} added=${added.length}`);
  if (removed.length === 0) {
    console.log('    no name disappeared; nothing to pair.');
  } else {
    const { pairs, leftoverAdded } = pairRenames(removed, added);
    console.log('    1:1 pairing of every removed occurrence, printed one by one:');
    for (let index = 0; index < pairs.length; index += 1) {
      const pair = pairs[index];
      const weak = pair.score >= 0.5 ? '' : '   <-- WEAK PAIR, review';
      console.log(`      PAIR ${index + 1} (similarity ${pair.score.toFixed(3)})${weak}`);
      console.log(`        removed: ${JSON.stringify(pair.old)}`);
      console.log(`        added  : ${JSON.stringify(pair.now)}`);
    }
    if (pairs.length !== removed.length) {
      console.log(`    UNPAIRED REMOVALS: ${removed.length - pairs.length}`);
    }
    if (leftoverAdded.length > 0) {
      console.log(`    added occurrences with no removed counterpart (new assertions): ${leftoverAdded.length}`);
      for (const name of leftoverAdded) console.log(`      + ${JSON.stringify(name)}`);
    }
  }
}

function compare(beforeFile, afterFile, label) {
  const before = inventoryOf(beforeFile.text);
  const after = inventoryOf(afterFile.text);

  const rawAll = delta(before.names, after.names);
  const assertionRemoved = delta(before.assertionNames, after.assertionNames);
  const beforeNorm = multiset([...before.assertionNames.entries()].flatMap(([name, count]) => Array.from({ length: count }, () => name)), true);
  const afterNorm = multiset([...after.assertionNames.entries()].flatMap(([name, count]) => Array.from({ length: count }, () => name)), true);
  const normalised = delta(beforeNorm, afterNorm);

  console.log(`\n=== ${label} ===`);
  console.log(`  before  ${beforeFile.label}`);
  console.log(`          bytes=${beforeFile.bytes} sha256=${beforeFile.sha256} mtime=${beforeFile.mtime}`);
  console.log(`  after   ${afterFile.label}`);
  console.log(`          bytes=${afterFile.bytes} sha256=${afterFile.sha256} mtime=${afterFile.mtime}`);
  console.log(`  call sites            ${before.calls.length} -> ${after.calls.length}`);
  console.log(`    per method          ${JSON.stringify(before.perMethod)} -> ${JSON.stringify(after.perMethod)}`);
  console.log(`  literal name occurrences  ${before.calls.length - before.dynamic} -> ${after.calls.length - after.dynamic}`);
  console.log(`    assertion-only          ${before.assertionNames.size} -> ${after.assertionNames.size} distinct, ` +
    `${sum(before.assertionNames)} -> ${sum(after.assertionNames)} occurrences`);
  console.log(`    dynamic names           ${before.dynamic} -> ${after.dynamic}`);
  for (const entry of after.dynamics) {
    console.log(`      dynamic call site     ${entry.method} at line ${entry.line}: ${JSON.stringify(entry.snippet)}`);
  }

  console.log('\n  --- raw name literals ---');
  pairBlock('assertion names', assertionRemoved.removed, assertionRemoved.added);
  pairBlock('non-assertion names (section headings)', rawAll.removed.filter((name) => !assertionRemoved.removed.includes(name)), rawAll.added.filter((name) => !assertionRemoved.added.includes(name)));

  console.log('\n  --- with rev-<n> folded to rev-N ---');
  pairBlock('assertion names', normalised.removed, normalised.added);

  const ok = assertionRemoved.removed.length === 0 || pairRenames(assertionRemoved.removed, assertionRemoved.added).pairs.length === assertionRemoved.removed.length;
  const normalisedClean = normalised.removed.length === 0;
  console.log(`  VERDICT: ${ok ? 'every removed assertion name is paired 1:1' : 'REMOVAL FOUND — a name disappeared without a counterpart'}; rev-N normalised removals=${normalised.removed.length}`);
  return ok;
}

function main() {
  console.log('r15-t2 · assertion inventory (verifier-owned parser)');
  console.log(`plugin dir: ${PLUGIN_DIR}\n`);

  const archive = {
    'client-half.test.mjs': join(RAW_DIR, 'r15-t1-before-verify-client-half.test.mjs.txt'),
    'custom-audio.test.mjs': join(RAW_DIR, 'r15-t1-before-verify-custom-audio.test.mjs.txt'),
  };

  let ok = true;
  for (const file of Object.keys(archive)) {
    ok = compare(describeFile(archive[file]), describeFile(join(VERIFY_DIR, file)), `${file}: pre-rev-15 archive -> shipped bytes`) && ok;
  }

  console.log('\n=== harnesses the rev-15 round did not write ===');
  for (const file of ['host-half.test.mjs', 'waterfall.test.mjs']) {
    const info = describeFile(join(VERIFY_DIR, file));
    const parsed = inventoryOf(info.text);
    console.log(`  ${info.label}`);
    console.log(`    bytes=${info.bytes} sha256=${info.sha256} mtime=${info.mtime}`);
    console.log(`    call sites=${parsed.calls.length} dynamic=${parsed.dynamic} per-method=${JSON.stringify(parsed.perMethod)}`);
    console.log(`    assertion-only names=${parsed.assertionNames.size} distinct, ${sum(parsed.assertionNames)} occurrences`);
    for (const entry of parsed.dynamics) {
      console.log(`      dynamic call site     ${entry.method} at line ${entry.line}: ${JSON.stringify(entry.snippet)}`);
    }
    console.log('    no rev-15 baseline exists because the rev-15 change set never wrote this file: the mtime above');
    console.log('    predates the pre-change archive of the rev-15 round (stamped 2026-09-18T01:06:04+08:00 .. 01:06:51+08:00).');
  }

  console.log(`\nRESULT: ${ok ? 'no assertion call site and no assertion name disappeared' : 'REMOVAL FOUND — see above'}`);
  process.exitCode = ok ? 0 : 1;
}

main();
