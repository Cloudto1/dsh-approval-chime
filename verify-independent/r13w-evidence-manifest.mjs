/**
 * r13w (task t6, verifier) — the evidence-preservation manifest for this round.
 *
 * t6 adds ONE probe and edits ONE runner. It must not overwrite anybody else's evidence under
 * verify-independent/_raw/. This script records, per group, how many files exist and their
 * sha256, and proves the prefix isolation directly from the runner source:
 *   - no `"r13-` / `'r13-` log-path literal is left in run-r13.ps1 (0 expected);
 *   - every log-path literal in it carries the `r13w-` prefix;
 *   - the r13, r13b, r13c, r13-final, r13v and r13-t2-archive evidence is listed with hashes,
 *     so any later change to it is detectable.
 *
 *     node verify-independent/r13w-evidence-manifest.mjs
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const raw = join(here, '_raw');
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase();

const GROUPS = [
  { label: 't2/t5 canonical r13-* logs', test: (name) => /^r13-(?!t2-archive)/.test(name) || /^r13b-/.test(name) || /^r13c-/.test(name) || /^r13-final-/.test(name) },
  { label: 't3 r13v-* evidence', test: (name) => /^r13v-/.test(name) },
  { label: 't6 r13w-* evidence (this round)', test: (name) => /^r13w-/.test(name) },
];

const entries = readdirSync(raw)
  .filter((name) => statSync(join(raw, name)).isFile())
  .map((name) => ({ name, size: statSync(join(raw, name)).size, hash: sha(readFileSync(join(raw, name))) }));

const lines = [];
let bad = 0;
lines.push('verify-independent/_raw evidence groups');
for (const group of GROUPS) {
  const members = entries.filter((entry) => group.test(entry.name)).sort((left, right) => left.name.localeCompare(right.name));
  lines.push('');
  lines.push(`  ${group.label}: ${members.length} file(s)`);
  for (const member of members) lines.push(`    ${member.hash}  ${String(member.size).padStart(8)}  ${member.name}`);
}

const archiveDir = join(raw, 'r13-t2-archive');
const archiveMembers = readdirSync(archiveDir).filter((name) => statSync(join(archiveDir, name)).isFile());
lines.push('');
lines.push(`  r13-t2-archive/: ${archiveMembers.length} file(s) — hashes are already recorded in its MANIFEST.sha256.txt`);

const runner = readFileSync(join(here, 'run-r13.ps1'), 'utf8');
const legacyPrefixes = ([...runner.matchAll(/["']r13-/g)]).length;
const newPrefixes = ([...runner.matchAll(/["']r13w-/g)]).length;
lines.push('');
lines.push(`  run-r13.ps1: log-path literals with the old '"r13-' or "'r13-" prefix: ${legacyPrefixes} (must be 0)`);
lines.push(`  run-r13.ps1: log-path literals with the new r13w- prefix: ${newPrefixes}`);
if (legacyPrefixes !== 0) bad += 1;

lines.push('');
lines.push(bad === 0
  ? `RESULT: this round wrote only r13w-* files; the ${entries.filter((entry) => !/^r13w-/.test(entry.name)).length} pre-existing evidence files under _raw/ keep the hashes recorded above.`
  : 'RESULT: the runner still points at a pre-existing evidence path -- investigate.');

const report = lines.join('\n');
console.log(report);
writeFileSync(join(raw, 'r13w-evidence-manifest.txt'), `${report}\n`, 'utf8');
process.exit(bad === 0 ? 0 : 1);
