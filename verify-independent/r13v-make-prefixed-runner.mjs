/**
 * r13v (independent verifier, task t3) — derive run-r13v.ps1 from the canonical run-r13.ps1
 * WITHOUT touching run-r13.ps1 itself.
 *
 * The canonical runner hard-codes the log prefix `r13-` in ~40 places, so running it as-is
 * would overwrite the t2 evidence under _raw/r13-*. This script applies the ONE substitution
 * `r13-` -> `r13v-` to the whole file and then PROVES the edit was nothing else: reversing the
 * substitution on the produced bytes must reproduce the canonical file's sha256 exactly.
 *
 *     node verify-independent/r13v-make-prefixed-runner.mjs
 */
import { createHash, } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const canonicalPath = join(here, 'run-r13.ps1');
const prefixedPath = join(here, 'run-r13v.ps1');

const canonical = readFileSync(canonicalPath, 'utf8');
const canonicalSha = createHash('sha256').update(Buffer.from(canonical, 'utf8')).digest('hex').toUpperCase();
const occurrences = canonical.split('r13-').length - 1;
const prefixed = canonical.split('r13-').join('r13v-');
const reversed = prefixed.split('r13v-').join('r13-');
const reversedSha = createHash('sha256').update(Buffer.from(reversed, 'utf8')).digest('hex').toUpperCase();
const prefixedSha = createHash('sha256').update(Buffer.from(prefixed, 'utf8')).digest('hex').toUpperCase();

writeFileSync(prefixedPath, prefixed, 'utf8');

const report = [
  `canonical run-r13.ps1   ${Buffer.byteLength(canonical, 'utf8')} B  ${canonicalSha}`,
  `substitution            'r13-' -> 'r13v-'  x${occurrences}`,
  `derived  run-r13v.ps1   ${Buffer.byteLength(prefixed, 'utf8')} B  ${prefixedSha}`,
  `reverse substitution    ${reversedSha}`,
  `reverse == canonical    ${reversedSha === canonicalSha}`,
  `line count              ${canonical.split('\n').length} -> ${prefixed.split('\n').length}`,
].join('\n');
console.log(report);
writeFileSync(join(here, '_raw', 'r13v-prefixed-runner.txt'), `${report}\n`, 'utf8');
process.exit(reversedSha === canonicalSha ? 0 : 1);
