/**
 * r13w (task t6, verifier) — closes the loop on t3's adversarial finding (V1).
 *
 * t3 measured that four UNDECLARED bell mutants passed probe-18 with an EMPTY red set. This
 * script proves, from raw evidence, that those very four mutants are now caught by probe-20:
 *   - the mutant source digest printed by t3's run (probe-18 measurement mode, _raw/r13v-*)
 *     must EQUAL the digest probe-20 prints for its corresponding declared mutation
 *     (same bytes under test => the same mutant, not a lookalike);
 *   - probe-18's observed red set for it was 0; probe-20's observed red set is non-empty and
 *     exactly the declared one.
 *
 *     node verify-independent/r13w-close-t3-gap.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const raw = join(here, '_raw');

const PAIRS = [
  { t3name: 'adv-muted-bell-filled', p20name: 'muted-bell-filled' },
  { t3name: 'adv-bell-hover-dropped', p20name: 'audible-hover-dropped' },
  { t3name: 'adv-bell-token-hardcoded', p20name: 'fill-hardcoded-hex' },
  { t3name: 'adv-muted-bell-recolored', p20name: 'muted-icon-recolored' },
];

const PROBE18_LOG = {
  'adv-muted-bell-filled': 'r13v-adversarial-A1.txt',
  'adv-bell-hover-dropped': 'r13v-adversarial-A2.txt',
  'adv-bell-token-hardcoded': 'r13v-adversarial-A3.txt',
  'adv-muted-bell-recolored': 'r13v-adversarial-A4.txt',
};

const digestOf = (text) => {
  const match = text.match(/mutant source sha256 ([0-9A-Fa-f]{64})/);
  return match === null ? null : match[1].toUpperCase();
};
const observedCount = (text) => {
  const match = text.match(/observed red set \((\d+)\)/);
  return match === null ? null : Number(match[1]);
};

const lines = ['t3 adversarial mutants (probe-18, undeclared) -> probe-20 declared mutations'];
let bad = 0;
for (const pair of PAIRS) {
  const t3text = readFileSync(join(raw, PROBE18_LOG[pair.t3name]), 'utf8');
  const p20text = readFileSync(join(raw, `r13w-ind-probe-20-mut-${pair.p20name}.txt`), 'utf8');
  const t3digest = digestOf(t3text);
  const p20digest = digestOf(p20text);
  const sameBytes = t3digest !== null && t3digest === p20digest;
  const t3reds = observedCount(t3text);
  const p20reds = observedCount(p20text);
  const declared = (p20text.match(/declared red set \((\d+)\)/) ?? [])[1];
  const p20verdict = /DETECTED \(exactly the declared red set/.test(p20text);
  const ok = sameBytes && t3reds === 0 && p20reds !== null && p20reds > 0 && p20reds === Number(declared) && p20verdict;
  if (!ok) bad += 1;
  lines.push('');
  lines.push(`  ${pair.t3name}  ->  probe-20 --mutate=${pair.p20name}`);
  lines.push(`    mutant source sha256: t3 ${t3digest} | probe-20 ${p20digest} | identical bytes: ${sameBytes}`);
  lines.push(`    red set: probe-18 ${t3reds} -> probe-20 ${p20reds} (declared ${declared}) | verdict DETECTED: ${p20verdict}`);
  lines.push(`    ${ok ? 'CLOSED: the mutant t3 could not catch is now caught exactly as declared' : 'STILL OPEN -- investigate'}`);
}

lines.push('');
lines.push(bad === 0
  ? `RESULT: all ${PAIRS.length} of t3's undeclared bell mutants are byte-identical to a declared probe-20 mutation, and each is now reddened exactly as declared.`
  : `RESULT: ${bad} of t3's mutants are still not covered by probe-20.`);
lines.push('');
lines.push('NOT covered by these four (and not claimed to be): appearance facts reachable only through');
lines.push('rendering -- real pixels, colour-mix resolution, dark/light themes, focus-visible shape.');

const report = lines.join('\n');
console.log(report);
writeFileSync(join(raw, 'r13w-close-t3-gap.txt'), `${report}\n`, 'utf8');
process.exit(bad === 0 ? 0 : 1);
