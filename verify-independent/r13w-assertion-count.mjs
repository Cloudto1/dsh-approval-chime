/**
 * r13w (task t6, verifier) — the "no assertion was deleted or relaxed" ledger for this round.
 *
 * This round adds ONE probe (probe-20) and edits ONE runner (run-r13.ps1: log prefix + section 2e
 * + comments). It must not touch any existing assertion. Measured here:
 *   1. the four existing mutation probes are byte-identical to the hashes recorded by t2/t5, so
 *      their call-site and assertion-name counts cannot have moved;
 *   2. their counts are re-printed with this script's own counter (same rule as r13v);
 *   3. probe-20's own counts are printed, with every name listed once.
 *
 *     node verify-independent/r13w-assertion-count.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sha = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').toUpperCase();

const CALL = /\b(?:check|same|deep|ok)\((?!s\))/g;
const NAME = /\b(?:check|same|deep|ok)\((?!s\))\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;

function inventory(text) {
  const callSites = (text.match(CALL) ?? []).length;
  const names = new Set();
  let dynamic = 0;
  for (const match of text.matchAll(NAME)) {
    if (match[1].startsWith('`')) dynamic += 1;
    else names.add(match[1]);
  }
  return { callSites, names: [...names], dynamic };
}

/** Hashes as recorded by t2 (verify-independent probes) and t5 (the same, re-verified). */
const RECORDED = {
  'probe-11-r4-css-rows.mjs': '8F044EA6FE26DCA3828642E4642F8F605A0A9D08EAA211E5709CD58B40AC048F',
  'probe-17-r7-section.mjs': '9C331EBCC0C46672B6D13726822114FD522E1C35EB2F1E2477DACCCB20CC2F90',
  'probe-18-r10-sessions.mjs': 'F0EF23032FC93E13BDC59A76AFD11AB2B87303204AA1BE653F00E9CB845B8FDE',
  'probe-19-r12-select-parity.mjs': '6C3B251815D19579D8087A9571D49EF2216BD78B9DD8980147A76B40F8CC645C',
};

const lines = [];
let bad = 0;

lines.push('existing mutation probes, this round (t2/t5 recorded hash -> now):');
for (const [file, recorded] of Object.entries(RECORDED)) {
  const text = readFileSync(join(here, file), 'utf8');
  const now = sha(text);
  const same = now === recorded;
  if (!same) bad += 1;
  const inv = inventory(text);
  lines.push(`  ${file.padEnd(34)} ${same ? 'byte-identical' : 'CHANGED'}  calls=${inv.callSites} distinct names=${inv.names.length} dynamic=${inv.dynamic}`);
  if (!same) lines.push(`      recorded ${recorded}\n      now      ${now}`);
}

const probe20 = readFileSync(join(here, 'probe-20-r14-bell-appearance.mjs'), 'utf8');
const inv20 = inventory(probe20);
lines.push('');
lines.push(`probe-20-r14-bell-appearance.mjs  ${Buffer.byteLength(probe20, 'utf8')} B  ${sha(probe20)}`);
lines.push(`  call sites=${inv20.callSites}  distinct name literals=${inv20.names.length}  template names=${inv20.dynamic}`);
lines.push('  the distinct name literals (the mutation declarations must name only these):');
for (const name of inv20.names) lines.push(`    - ${JSON.stringify(name)}`);

/* Declaration/assertion cross-check: every declared expectation must be an existing check name,
 * and every non-control check must be reddened by at least one declared mutant (no decorative
 * checks). The control block at the top of inspect() is listed explicitly -- it must stay green
 * under every mutant, so no declaration may name it. */
const CONTROL_NAMES = [
  'the bundle evaluated without a load error',
  'the bundle produced a module contract and registered both slots',
  'the bundle injected exactly one stylesheet element',
  'the injected stylesheet carries the bell rules',
  'the console surface exposes sessionIcon',
];

const declared = new Set();
for (const match of probe20.matchAll(/expectFail: \[([\s\S]*?)\n    \],/g)) {
  for (const entry of match[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)) declared.add(entry[1]);
}

const known = new Set(inv20.names.map((literal) => literal.slice(1, -1)));
const declaredNotACheck = [...declared].filter((name) => !known.has(name));
const claimChecks = inv20.names.map((literal) => literal.slice(1, -1)).filter((name) => !CONTROL_NAMES.includes(name));
const undeclaredChecks = claimChecks.filter((name) => !declared.has(name));
lines.push('');
lines.push(`declared expectations: ${declared.size}; declared names that are NOT a check name: ${declaredNotACheck.length}`);
if (declaredNotACheck.length > 0) { bad += 1; lines.push(`  ORPHAN DECLARATIONS: ${JSON.stringify(declaredNotACheck)}`); }
lines.push(`claim checks: ${claimChecks.length}; never reddened by any declared mutant: ${undeclaredChecks.length}`);
for (const name of undeclaredChecks) lines.push(`  (no mutant declares it) ${JSON.stringify(name)}`);
if (undeclaredChecks.length > 0) bad += 1;
if (inv20.dynamic !== 0) lines.push(`  note: ${inv20.dynamic} template-literal check name(s) cannot be compared textually`);

lines.push('');
lines.push(bad === 0
  ? 'RESULT: no existing probe changed, and every probe-20 claim is named by at least one mutation declaration.'
  : `RESULT: ${bad} problem(s) -- investigate.`);

const report = lines.join('\n');
console.log(report);
writeFileSync(join(here, '_raw', 'r13w-assertion-count.txt'), `${report}\n`, 'utf8');
process.exit(bad === 0 ? 0 : 1);
