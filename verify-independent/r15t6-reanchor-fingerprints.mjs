/**
 * r15 / t6 (integration close-out) -- step 1: re-anchor the frozen FACTORY FINGERPRINTS that the
 * independent probes hard-code, from rev-14 to rev-15, and prove that nothing else moved.
 *
 * rev-15 changed `lib/client.js` (149196 B / 32F0E31F...) and `verify/client-half.test.mjs`
 * (88005 B / BB2C1A34...), so every probe literal that pins those bytes is stale. The probes are
 * the independent half of the evidence: re-anchoring them is allowed, softening them is not. So
 * this script
 *   1. refuses to run unless each probe is still the recorded rev-14 artifact (sha256 asserted);
 *   2. archives those exact pre-edit bytes under _raw/r15-t6-archive/<name>.<OLD_SHA>.txt;
 *   3. applies ONLY the literal substitutions listed below, asserting the expected occurrence
 *      count for each one (a missing or doubled anchor aborts the run -- no silent no-op);
 *   4. proves step 3 changed nothing else by REVERSING the substitutions on the produced bytes
 *      and requiring the result to hash back to the recorded pre-edit sha256, byte for byte;
 *   5. writes the changed-line evidence to _raw/r15-t6-reverse-substitution.txt.
 *
 * probe-11 and probe-20 are asserted to carry NO factory fingerprint at all (they anchor to the
 * injected stylesheet / the console geometry surface, not to client.js bytes), so they are
 * verified untouched instead of edited -- "needed nothing" is a measurement here, not a claim.
 *
 *     node verify-independent/r15t6-reanchor-fingerprints.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, '_raw');
const ARCHIVE = join(RAW, 'r15-t6-archive');

const REV14_SHA = '730D1C2F7F58E19471D4B77EE43A221B4FD255BC06AD2AE3752A2C4443466BD5';
const REV15_SHA = '32F0E31FB5ABE1BE7B5C14746213C29EA75896CD54A88401FD70925D6D67BD55';
const REV14_STAMP = 'rev-14 · blue session bell';
const REV15_STAMP = 'rev-15 · a failed re-read keeps the mutes';

const sha = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').toUpperCase();

/**
 * One probe: its recorded pre-edit sha256 plus the exact substitutions that re-anchor it. Every
 * substitution is a full literal (never a bare number), and `count` is asserted.
 */
const PLAN = [
  {
    file: 'probe-17-r7-section.mjs',
    recorded: '9C331EBCC0C46672B6D13726822114FD522E1C35EB2F1E2477DACCCB20CC2F90',
    edits: [
      { from: "'lib/client.js byte count is what rev-14 claims'", to: "'lib/client.js byte count is what rev-15 claims'", count: 1, what: 'assertion name (rev-14 -> rev-15)' },
      { from: 'CLIENT_BYTES, 147062', to: 'CLIENT_BYTES, 149196', count: 1, what: 'frozen client byte count 147062 -> 149196' },
      { from: `'${REV14_SHA}'`, to: `'${REV15_SHA}'`, count: 1, what: 'frozen client sha256 730D1C2F... -> 32F0E31F...' },
      { from: "'the bundleRevision badge shows the rev-14 stamp'", to: "'the bundleRevision badge shows the rev-15 stamp'", count: 1, what: 'assertion name (rev-14 -> rev-15)' },
      { from: "'the revision stamp is the rev-14 one'", to: "'the revision stamp is the rev-15 one'", count: 1, what: 'assertion name (rev-14 -> rev-15), so the name cannot outlive the value it guards' },
      { from: '/rev-14/.test(diagnostics.revision)', to: '/rev-15/.test(diagnostics.revision)', count: 1, what: 'stamp regex rev-14 -> rev-15' },
    ],
  },
  {
    file: 'probe-18-r10-sessions.mjs',
    recorded: 'F0EF23032FC93E13BDC59A76AFD11AB2B87303204AA1BE653F00E9CB845B8FDE',
    edits: [
      { from: `'${REV14_STAMP}'`, to: `'${REV15_STAMP}'`, count: 1, what: 'EXPECTED_REVISION (the only fingerprint in this probe)' },
    ],
  },
  {
    file: 'probe-19-r12-select-parity.mjs',
    recorded: '6C3B251815D19579D8087A9571D49EF2216BD78B9DD8980147A76B40F8CC645C',
    edits: [
      { from: 'bytes: 147062,', to: 'bytes: 149196,', count: 1, what: 'FROZEN.bytes 147062 -> 149196' },
      { from: `sha256: '${REV14_SHA}',`, to: `sha256: '${REV15_SHA}',`, count: 1, what: 'FROZEN.sha256 730D1C2F... -> 32F0E31F...' },
      { from: `revision: '${REV14_STAMP}',`, to: `revision: '${REV15_STAMP}',`, count: 1, what: 'FROZEN.revision -> the rev-15 stamp' },
    ],
  },
];

/** Probes that must NOT carry a factory fingerprint: asserted, never edited. */
const UNTOUCHED = [
  { file: 'probe-11-r4-css-rows.mjs', recorded: '8F044EA6FE26DCA3828642E4642F8F605A0A9D08EAA211E5709CD58B40AC048F' },
  { file: 'probe-20-r14-bell-appearance.mjs', recorded: '7986539FC2465692A2E556AEA7788F01F9485C3367587DC265DAFE1C75FD0CCB' },
];
const FINGERPRINT = /147062|730D1C2F|EXPECTED_REVISION|FROZEN\s*=\s*\{/;

mkdirSync(ARCHIVE, { recursive: true });

const lines = [];
const problems = [];
lines.push('r15 / t6 -- re-anchoring of the independent probes\' FROZEN FACTORY FINGERPRINTS (rev-14 -> rev-15)');
lines.push(`when            ${new Date().toISOString()}`);
lines.push(`frozen rev-14   lib/client.js 147062 B / ${REV14_SHA}`);
lines.push(`frozen rev-15   lib/client.js 149196 B / ${REV15_SHA}`);
lines.push('method          pure literal substitution + REVERSE substitution back to the recorded sha256');
lines.push('');

for (const probe of PLAN) {
  const path = join(HERE, probe.file);
  const before = readFileSync(path, 'utf8');
  const beforeSha = sha(before);
  const beforeBytes = Buffer.byteLength(before, 'utf8');
  lines.push(`=== ${probe.file}`);
  lines.push(`  recorded    ${probe.recorded}`);
  lines.push(`  on disk     ${beforeSha}  ${beforeBytes} B`);
  if (beforeSha !== probe.recorded) {
    problems.push(`${probe.file}: on-disk sha256 ${beforeSha} is not the recorded pre-edit artifact`);
    lines.push('  ABORT       on-disk bytes are not the recorded artifact -- refusing to edit');
    continue;
  }
  const archiveName = `${probe.file}.${beforeSha}.txt`;
  writeFileSync(join(ARCHIVE, archiveName), before, 'utf8');
  lines.push(`  archived    _raw/r15-t6-archive/${archiveName}  ${beforeBytes} B`);

  let after = before;
  for (const edit of probe.edits) {
    const occurrences = after.split(edit.from).length - 1;
    const ok = occurrences === edit.count;
    lines.push(`  edit        ${ok ? 'OK  ' : 'FAIL'} x${occurrences} (expected ${edit.count})  ${edit.what}`);
    lines.push(`                from: ${JSON.stringify(edit.from.slice(0, 110))}`);
    lines.push(`                to  : ${JSON.stringify(edit.to.slice(0, 110))}`);
    if (!ok) problems.push(`${probe.file}: substitution "${edit.what}" occurred ${occurrences}x, expected ${edit.count}`);
    after = after.split(edit.from).join(edit.to);
  }

  if (after === before) {
    problems.push(`${probe.file}: nothing changed`);
    lines.push('  ABORT       the substitution produced identical bytes');
    continue;
  }

  // reverse substitution -- must reproduce the recorded sha256 exactly
  let reversed = after;
  for (const edit of probe.edits) reversed = reversed.split(edit.to).join(edit.from);
  const reversedSha = sha(reversed);
  const afterSha = sha(after);
  lines.push(`  new bytes   ${afterSha}  ${Buffer.byteLength(after, 'utf8')} B`);
  lines.push(`  reversed    ${reversedSha}  (== recorded: ${reversedSha === probe.recorded})`);
  if (reversedSha !== probe.recorded) {
    problems.push(`${probe.file}: reverse substitution does not reproduce the recorded sha256`);
    lines.push('  ABORT       the reverse substitution failed -- not writing');
    continue;
  }
  writeFileSync(path, after, 'utf8');
  lines.push(`  written     ${probe.file}  ${Buffer.byteLength(after, 'utf8')} B`);

  // changed lines, one by one (the diff the re-anchor actually is)
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  lines.push(`  lines       ${beforeLines.length} -> ${afterLines.length}`);
  let changed = 0;
  for (let index = 0; index < Math.max(beforeLines.length, afterLines.length); index += 1) {
    if (beforeLines[index] !== afterLines[index]) {
      changed += 1;
      lines.push(`  -${index + 1}  ${(beforeLines[index] ?? '').trim().slice(0, 150)}`);
      lines.push(`  +${index + 1}  ${(afterLines[index] ?? '').trim().slice(0, 150)}`);
    }
  }
  lines.push(`  changed lines: ${changed}`);
  lines.push('');
}

lines.push('=== probes that must NOT carry a factory fingerprint (untouched; asserted)');
for (const entry of UNTOUCHED) {
  const text = readFileSync(join(HERE, entry.file), 'utf8');
  const digest = sha(text);
  const hits = text.match(FINGERPRINT);
  const unchanged = digest === entry.recorded;
  lines.push(`  ${entry.file}`);
  lines.push(`    sha256 ${digest}  (recorded ${entry.recorded})  unchanged=${unchanged}`);
  lines.push(`    factory-fingerprint hits: ${hits === null ? 0 : 1}${hits === null ? ' -- nothing to re-anchor (measured, not assumed)' : ` (${hits[0]})`}`);
  if (hits !== null) problems.push(`${entry.file}: carries a fingerprint literal (${hits[0]}) and needs a decision`);
  if (!unchanged) problems.push(`${entry.file}: bytes changed unexpectedly`);
}
lines.push('');
lines.push(problems.length === 0
  ? 'RESULT: every re-anchored probe reversed back to its recorded pre-edit sha256 byte-for-byte; no other edit.'
  : `RESULT: ${problems.length} problem(s): ${problems.join(' ; ')}`);

const report = `${lines.join('\n')}\n`;
console.log(report);
writeFileSync(join(RAW, 'r15-t6-reverse-substitution.txt'), report, 'utf8');
process.exit(problems.length === 0 ? 0 : 1);
