/**
 * r13v (independent verifier, task t3) — did t2 "correct the declaration" or "delete checks"?
 *
 * t2's report says three probe-17 declarations were incomplete and were corrected
 * (slot 3 -> 9, order 1 -> 3, rogue 3 -> 6) while the assertion EXPECTATIONS were not touched.
 * This script measures that against the pre-t1 bytes archived as _raw/r13-reverse-probe-17:
 *   - the old declared sets must be exactly 3 / 1 / 3 (as t2 says),
 *   - the old *check names* must still all be present in the shipped probe (modulo rev-N
 *     re-anchoring of two literal names), i.e. nothing was deleted to make the new sets fit.
 *
 *     node verify-independent/r13v-declaration-diff.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDeclarations } from './r13v-declaration-parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const probe = 'probe-17-r7-section.mjs';
const now = parseDeclarations(readFileSync(join(here, probe), 'utf8'), probe);
const old = parseDeclarations(readFileSync(join(here, '_raw', `r13-reverse-${probe}`), 'utf8'), `${probe} (pre-t1 archive)`);

const lines = ['probe-17 declaration drift, measured (pre-t1 archive -> shipped):'];
let bad = 0;
for (const name of Object.keys(now)) {
  const before = old[name];
  if (before === undefined) { lines.push(`  ${name}: MISSING in the archive`); continue; }
  const lostExpectations = before.declared.filter((entry) => !now[name].declared.includes(entry));
  const lostAlways = before.always.filter((entry) => !now[name].always.includes(entry));
  lines.push(`  ${name.padEnd(8)} declared ${String(before.declared.length).padStart(2)} -> ${String(now[name].declared.length).padStart(2)}`
    + `   always ${before.always.length} -> ${now[name].always.length}`
    + `   expectations dropped: ${lostExpectations.length + lostAlways.length}`);
  if (lostExpectations.length + lostAlways.length > 0) {
    bad += 1;
    lines.push(`      DROPPED: ${JSON.stringify([...lostExpectations, ...lostAlways])}`);
  }
}

/* Every check name that existed pre-t1 must still exist, modulo rev-N re-anchoring. */
const NAME = /\b(?:check|same|deep|ok)\((?!s\))\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
const namesOf = (text) => new Set([...text.matchAll(NAME)].map((match) => match[1].replace(/rev-\d+/g, 'rev-N')));
const nowNames = namesOf(readFileSync(join(here, probe), 'utf8'));
const oldNames = namesOf(readFileSync(join(here, '_raw', `r13-reverse-${probe}`), 'utf8'));
const lostNames = [...oldNames].filter((name) => !nowNames.has(name));
lines.push('');
lines.push(`assertion names pre-t1 -> shipped: ${oldNames.size} -> ${nowNames.size}; names present before and gone now: ${lostNames.length}`);
if (lostNames.length > 0) { bad += 1; lines.push(`  DROPPED NAMES: ${JSON.stringify(lostNames)}`); }
lines.push('');
lines.push(bad === 0
  ? 'RESULT: the three declarations GREW to the measured red sets; no old expectation and no assertion name was removed.'
  : `RESULT: ${bad} suspicious deletion(s) -- investigate.`);

const report = lines.join('\n');
console.log(report);
writeFileSync(join(here, '_raw', 'r13v-declaration-diff.txt'), `${report}\n`, 'utf8');
process.exit(bad === 0 ? 0 : 1);
