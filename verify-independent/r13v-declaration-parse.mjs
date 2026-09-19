/**
 * r13v (independent verifier, task t3) — statically extract the DECLARED red set of every
 * mutation from the probe files on disk.
 *
 * Why this exists: t2's table (verify-independent/_raw/r13c-mutation-table.md) is a claim.
 * The verifier must not compare "what the probe printed" against "what t2 wrote down"; it
 * compares "what the probe source declares" against "what the probe actually reddened",
 * both read independently of t2.
 *
 * The `MUTATIONS` literal is located by brace matching and evaluated in a bare vm context
 * (no probe module state). `apply()` bodies are never called here, so identifiers they
 * mention (replaceOnce, TONE_ROWS, ...) do not need to exist.
 *
 *     node verify-independent/r13v-declaration-parse.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));

const PROBES = [
  'probe-11-r4-css-rows.mjs',
  'probe-17-r7-section.mjs',
  'probe-18-r10-sessions.mjs',
  'probe-19-r12-select-parity.mjs',
];

/**
 * Return the balanced literal that follows `const MUTATIONS = `.
 * Braces/brackets inside string literals, template literals and comments do NOT count —
 * the probe sources contain anchors like `inject('settings.section', function () {`.
 */
function extractLiteral(source, file) {
  const marker = 'const MUTATIONS = ';
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`${file}: no "const MUTATIONS = " declaration`);
  const start = at + marker.length;
  const open = source[start];
  if (open !== '{' && open !== '[') throw new Error(`${file}: MUTATIONS literal starts with ${JSON.stringify(open)}`);
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let quote = null;
  let comment = null;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (comment === 'line') {
      if (char === '\n') comment = null;
      continue;
    }
    if (comment === 'block') {
      if (char === '*' && next === '/') { comment = null; index += 1; }
      continue;
    }
    if (quote !== null) {
      if (char === '\\') { index += 1; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') { comment = 'line'; index += 1; continue; }
    if (char === '/' && next === '*') { comment = 'block'; index += 1; continue; }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) {
        if (char !== close) throw new Error(`${file}: unbalanced MUTATIONS literal`);
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`${file}: MUTATIONS literal is not closed`);
}

/** Parse the declared red set of every mutation out of one probe source text. */
export function parseDeclarations(source, file) {
  const literal = extractLiteral(source, file);
  const value = vm.runInNewContext(`(${literal})`);
  const entries = Array.isArray(value) ? value.map((entry) => [entry.name, entry]) : Object.entries(value);
  const parsed = {};
  for (const [name, entry] of entries) {
    const declared = Array.isArray(entry.expectFail) ? entry.expectFail : entry.expect;
    parsed[name] = {
      declared: declared ?? [],
      // probe-17 also carries an `always` list (invariants that must fail for that mutant).
      always: Array.isArray(entry.always) ? entry.always : [],
      target: entry.target ?? null,
      what: entry.what ?? null,
    };
  }
  return parsed;
}

const out = {};
const report = [];
for (const probe of PROBES) {
  const source = readFileSync(join(here, probe), 'utf8');
  report.push(`${probe}: ${Object.entries(parseDeclarations(source, probe)).map(([name, entry]) => `${name}=${entry.declared.length}${entry.always.length ? `+${entry.always.length}always` : ''}`).join(' ')}`);
  out[probe] = parseDeclarations(source, probe);
}

// Written by node itself (a PowerShell `>` redirect would produce UTF-16 + BOM here).
const json = `${JSON.stringify(out, null, 2)}\n`;
writeFileSync(join(here, '_raw', 'r13v-declared.json'), json, 'utf8');
console.log(json);
console.error(report.join('\n'));
