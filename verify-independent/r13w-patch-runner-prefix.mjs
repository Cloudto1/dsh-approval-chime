/**
 * r13w (task t6, verifier) — step 1 of the canonical-runner integration.
 *
 * run-r13.ps1 hard-codes 12 log paths under _raw/ with the `r13-` prefix. t5 finished the round
 * by archiving its canonical run as r13-final-*; this round must NOT overwrite that evidence, so
 * the runner moves to the `r13w-` prefix before anything else is added to it.
 *
 * This script
 *   1. refuses to run unless run-r13.ps1 is still the recorded t1/t5 artifact (sha256 AAE3FDDA…);
 *   2. archives those exact bytes under _raw/ (evidence preservation);
 *   3. rewrites only the 12 log-path literals (`"r13-` and `'r13-` -> ...w-);
 *   4. proves step 3 changed nothing else by reversing the substitution and re-hashing.
 *
 *     node verify-independent/r13w-patch-runner-prefix.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const runnerPath = join(here, 'run-r13.ps1');
const recorded = 'AAE3FDDA51B5E5607602EFF6F6A795563CD47058E0B85AB8C276BF7315EB2BA5';
const sha = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').toUpperCase();

const before = readFileSync(runnerPath, 'utf8');
if (sha(before) !== recorded) {
  throw new Error(`run-r13.ps1 is not the recorded artifact: ${sha(before)} != ${recorded}`);
}

const archivePath = join(here, '_raw', `r13w-archive-run-r13-${recorded}.ps1`);
writeFileSync(archivePath, before, 'utf8');

let after = before;
const counts = {};
for (const [from, to] of [['"r13-', '"r13w-'], ["'r13-", "'r13w-"]]) {
  counts[from] = after.split(from).length - 1;
  if (counts[from] === 0) throw new Error(`no occurrence of ${from}`);
  after = after.split(from).join(to);
}
if (after.split('r13w-').length - 1 !== 12) throw new Error('expected exactly 12 rewritten log paths');
const reversed = after.split('r13w-').join('r13-');
if (sha(reversed) !== recorded) throw new Error('reverse substitution does not reproduce the artifact');

writeFileSync(runnerPath, after, 'utf8');

const report = [
  `archived   _raw/r13w-archive-run-r13-${recorded.slice(0, 8)}.ps1  ${Buffer.byteLength(before, 'utf8')} B  ${recorded}`,
  `rewritten  "r13- x${counts['"r13-']} + 'r13- x${counts["'r13-"]} = 12 log paths -> r13w-`,
  `reversed   ${sha(reversed)}  (equal to the artifact: ${sha(reversed) === recorded})`,
  `new        run-r13.ps1  ${Buffer.byteLength(after, 'utf8')} B  ${sha(after)}`,
  `lines      ${before.split('\n').length} -> ${after.split('\n').length}`,
].join('\n');
console.log(report);
writeFileSync(join(here, '_raw', 'r13w-runner-prefix-patch.txt'), `${report}\n`, 'utf8');
