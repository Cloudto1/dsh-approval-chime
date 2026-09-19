/**
 * r13v (independent verifier, task t3) — "no assertion was deleted" inventory, recomputed
 * with the verifier's own counter (t2's numbers are only used for comparison, never as input).
 *
 * Per file:
 *   callSites  assertion-emitting call sites:  .check(  .same(  .deep(  .ok(
 *              (`(?!s\))` keeps prose like "check(s)" out of the count)
 *   names      DISTINCT first-argument string literals = the assertion NAME vocabulary
 *   dynamic    first argument is a template literal / expression (no literal name)
 *
 * Names are compared twice: raw, and with `rev-N` normalised, because a re-anchoring round
 * legitimately renames "…rev-12 claims" to "…rev-14 claims" without deleting anything.
 *
 * BEFORE side:
 *   - probe-17/18/19: the byte-exact pre-t1 copies archived as _raw/r13-reverse-probe-*.mjs,
 *     whose sha256 is re-verified here against _raw/r13-reverse-substitution.txt. t1 changed
 *     only literals (proved by that same file), so their assertion set is also the pre-t2 set.
 *   - probe-11: no pre-edit byte copy exists anywhere in the workspace, so the before side is
 *     the current file minus the three insertions t2 documents. The script FAILS if any of
 *     those blocks is not present verbatim. The independent cross-check for this file is the
 *     runtime total in the pre-final-edit log (r13b, 1:34) vs the post-edit log (r13c, 1:43).
 *
 *     node verify-independent/r13v-assertion-inventory.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const raw = join(here, '_raw');
const sha256 = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').toUpperCase();

const CALL = /\b(?:check|same|deep|ok)\((?!s\))/g;
const NAME = /\b(?:check|same|deep|ok)\((?!s\))\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
const normalise = (name) => name.replace(/rev-\d+/g, 'rev-N');

function inventory(text) {
  const callSites = (text.match(CALL) ?? []).length;
  const names = new Set();
  let dynamic = 0;
  for (const match of text.matchAll(NAME)) {
    if (match[1].startsWith('`')) dynamic += 1;
    else names.add(match[1]);
  }
  return { callSites, names, normalised: new Set([...names].map(normalise)), dynamic };
}

/* --------------------------------------------------------------- before sources */

const reverseEvidence = readFileSync(join(raw, 'r13-reverse-substitution.txt'), 'utf8');
const reverseSha = (probe) => {
  const at = reverseEvidence.indexOf(`=== ${probe}`);
  const block = reverseEvidence.slice(at);
  const match = block.match(/\n\s*reversed\s*:\s*\d+ B\s+([0-9A-F]{64})/);
  if (match === null) throw new Error(`r13-reverse-substitution.txt has no reversed sha for ${probe}`);
  return match[1];
};

const before = new Map();
for (const probe of ['probe-17-r7-section.mjs', 'probe-18-r10-sessions.mjs', 'probe-19-r12-select-parity.mjs']) {
  const text = readFileSync(join(raw, `r13-reverse-${probe}`), 'utf8');
  const expected = reverseSha(probe);
  if (sha256(text) !== expected) throw new Error(`${probe}: archived reverse copy does not match the recorded sha256`);
  before.set(probe, text);
}

// probe-11: current minus the three t2 insertions (each must be present verbatim exactly once).
const probe11 = readFileSync(join(here, 'probe-11-r4-css-rows.mjs'), 'utf8');
const EOL = probe11.includes('\r\n') ? '\r\n' : '\n';
const T2_INSERTIONS = [
  "import { createHash } from 'node:crypto';\n",
  "/** sha256 of a string, so \"the mutation really changed something\" is a digest, not a length. */\nconst sha = (text) => (text === null || text === undefined ? 'null' : createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').toUpperCase());\n",
  "  // The red set must be EXACTLY the declaration: an extra red means the declaration and the\n  // probe disagree, and one of them is wrong (t2 audit: measured red == declared, 3 == 3).\n  const surprise = [...failing].filter((name) => !MUTATION.expectFail.includes(name));\n  S.check(\n    `no undeclared check turned red under \"${MUTATION.what}\"`,\n    surprise.length === 0,\n    surprise.length === 0 ? `the red set is exactly the ${MUTATION.expectFail.length} declared check(s)` : `UNDECLARED red: ${JSON.stringify(surprise)}`,\n  );\n",
].map((block) => block.split('\n').join(EOL));
let probe11Before = probe11;
for (const block of T2_INSERTIONS) {
  const occurrences = probe11Before.split(block).length - 1;
  if (occurrences !== 1) throw new Error(`probe-11 reconstruction: documented insertion occurs ${occurrences} times, expected 1\n${block.slice(0, 90)}`);
  probe11Before = probe11Before.split(block).join('');
}
before.set('probe-11-r4-css-rows.mjs', probe11Before);

/* ------------------------------------------------------------------- comparison */

const FILES = [
  'probe-11-r4-css-rows.mjs',
  'probe-17-r7-section.mjs',
  'probe-18-r10-sessions.mjs',
  'probe-19-r12-select-parity.mjs',
];

const lines = [];
let bad = 0;
lines.push('file                            calls before -> after   names before -> after   (rev-N normalised)   dynamic   verdict');
for (const name of FILES) {
  const after = inventory(readFileSync(join(here, name), 'utf8'));
  const prior = inventory(before.get(name));
  const lost = [...prior.names].filter((entry) => !after.names.has(entry));
  const lostNormalised = [...prior.normalised].filter((entry) => !after.normalised.has(entry));
  const ok = after.callSites >= prior.callSites && lostNormalised.length === 0;
  if (!ok) bad += 1;
  lines.push(`${name.padEnd(32)} ${String(prior.callSites).padStart(4)} -> ${String(after.callSites).padEnd(5)}   `
    + `${String(prior.names.size).padStart(4)} -> ${String(after.names.size).padEnd(5)}   ${String(prior.normalised.size).padStart(4)} -> ${String(after.normalised.size).padEnd(5)}   `
    + `${String(prior.dynamic).padStart(4)} -> ${String(after.dynamic).padEnd(4)}   `
    + `${ok ? 'nothing removed' : `REGRESSION lost=${JSON.stringify(lostNormalised)}`}`);
  if (lost.length > 0 && lostNormalised.length === 0) {
    lines.push(`    (raw name drift only -- re-anchored literals: ${JSON.stringify(lost)})`);
  }
}

/* ------------------------------------- independent before/after from the pre-edit logs */

lines.push('');
lines.push('runtime totals, t2\'s PRE-final-edit run (1:34) -> post-edit run (1:43), same mutation:');
const RUNTIME = [
  ['probe-11-r4-css-rows-card-cap-92px', 'probe-11', /independent checks passed/],
  ['probe-17-r7-section-slot', 'probe-17', /\[mutant:slot\]/],
  ['probe-18-r10-sessions-custom-tone-no-fallback', 'probe-18', /assertions passed=/],
  ['probe-19-r12-select-parity-popover-cap-loses-one-row', 'probe-19', /### mutation popover-cap-loses-one-row:/],
];
for (const [tag, label, pattern] of RUNTIME) {
  const pick = (prefix) => {
    const text = readFileSync(join(raw, `${prefix}-mut-${tag}.txt`), 'utf8');
    return (text.split(/\r?\n/).filter((line) => line.startsWith('### ') && pattern.test(line)).pop() ?? '?').trim();
  };
  const beforeLine = pick('r13b');
  const afterLine = pick('r13c');
  lines.push(`  ${label.padEnd(10)} ${beforeLine}`);
  lines.push(`  ${''.padEnd(10)} ${afterLine}`);
  const total = (line) => {
    const ratio = line.match(/\d+\/(\d+) independent checks/);          // "31/34 independent checks passed"
    if (ratio !== null) return Number(ratio[1]);
    const still = line.match(/\d+\/(\d+) still pass;/);                  // "62/65 still pass; 3 reddened"
    if (still !== null) return Number(still[1]);
    const pair = line.match(/passed=(\d+) failed=(\d+)/);               // "passed=128 failed=1"
    return pair === null ? null : Number(pair[1]) + Number(pair[2]);
  };
  const prior = total(beforeLine);
  const now = total(afterLine);
  const ok = prior === null || now === null || now >= prior;
  if (!ok) { bad += 1; lines.push(`  ${''.padEnd(10)} REGRESSION: runtime check total dropped ${prior} -> ${now}`); }
  else lines.push(`  ${''.padEnd(10)} runtime check total ${prior} -> ${now} (${now - prior >= 0 ? '+' : ''}${now - prior})`);
}

/* ------------------------------- the .scratch reviewer probes (registered, never edited) */

lines.push('');
lines.push('the four .scratch reviewer probes this round only REGISTERED (never edited) -- bytes + count:');
for (const rel of ['.scratch/reviewer-r5/reqcheck-rev5.mjs', '.scratch/reviewer-r5/reqcheck.mjs', '.scratch/reviewer-r5/reqcheck-host-413.mjs', '.scratch/reviewer-r7/probe-r7-reqcheck.mjs']) {
  const path = join(here, '..', '..', rel);
  const text = readFileSync(path, 'utf8');
  const inv = inventory(text);
  const stat = statSync(path);
  lines.push(`  ${rel.padEnd(44)} calls=${String(inv.callSites).padStart(3)} names=${String(inv.names.size).padStart(3)} dynamic=${inv.dynamic}`
    + `  ${String(stat.size).padStart(6)} B  ${sha256(text).slice(0, 16)}  mtime=${stat.mtime.toISOString()}`);
}

lines.push('');
lines.push(bad === 0
  ? 'RESULT: no assertion call site and no assertion name disappeared from any of the four probes.'
  : `RESULT: ${bad} file(s) lost assertions -- investigate.`);

const report = lines.join('\n');
console.log(report);
writeFileSync(join(raw, 'r13v-assertion-inventory.txt'), `${report}\n`, 'utf8');
process.exit(bad === 0 ? 0 : 1);
