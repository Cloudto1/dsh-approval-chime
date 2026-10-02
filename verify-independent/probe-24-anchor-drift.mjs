#!/usr/bin/env node
/**
 * probe-24 · the anchor-drift guard for an instrument the run does NOT execute.
 *
 * WHY THIS EXISTS (user decision 甲, r30 tail round): `probe-21-native-toast.mjs` pins the bytes of
 * eleven files, but it is deliberately NOT in `run-r13.ps1`'s probe list — it needs `_raw` records no
 * clone has and a live notification platform. That made its eleven rows INVISIBLE: r30's deploy batch
 * rewrote four of those files, nobody updated the rows, and no run ever noticed. This probe closes
 * that hole without running probe-21 and without raising a toast: it PARSES probe-21's
 * `REVISION_ANCHORS` literal, hashes the files on disk, and fails the run on any drift.
 *
 * It is a real gate, not a report: one changed byte in one of those eleven files turns this probe
 * (and therefore the canonical run) red until the row is re-anchored in the same commit.
 *
 * Falsifiability: `--table=<path>` points the same checks at a COPY of probe-21's table, so an
 * altered copy (one hex digit flipped, one byte count wrong, one row removed) must be reported as
 * drift. The run uses the shipped path and asserts it parsed all eleven rows.
 *
 * Run:  node verify-independent/probe-24-anchor-drift.mjs
 *       node verify-independent/probe-24-anchor-drift.mjs --table=<copy.mjs>
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = resolve(HERE, '..');
const TABLE_OWNER = 'verify-independent/probe-21-native-toast.mjs';
/** One row looks like:  'path/to/file': { sha256: '<64 hex>', bytes: 1234, note: '…' }, */
const ROW = /'([^']+)':\s*\{\s*sha256:\s*'([0-9a-f]{64})',\s*bytes:\s*(\d+),/g;

const tableArg = process.argv.slice(2).find((arg) => arg.startsWith('--table='));
const ownerPath = tableArg === undefined ? join(PLUGIN, TABLE_OWNER) : resolve(tableArg.slice('--table='.length));

function makeReport(title) {
  const rows = [];
  return {
    rows,
    check(name, ok, detail) {
      const passed = ok === true;
      rows.push({ name, passed, detail });
      console.log(`${passed ? '[PASS]' : '[FAIL]'} ${name}${detail === undefined || detail === '' ? '' : ` — ${detail}`}`);
      return passed;
    },
    done() {
      const bad = rows.filter((row) => !row.passed);
      console.log(`\n### ${title}: ${rows.length - bad.length}/${rows.length} independent checks passed`);
      for (const row of bad) console.log(`    FAILED: ${row.name}`);
      return { total: rows.length, failed: bad.length };
    },
  };
}

console.log(`### probe-24 · anchor drift of the instrument the run does not execute`);
console.log(`    · table read from ${ownerPath}`);

const report = makeReport('probe-24 anchor-drift');
const source = existsSync(ownerPath) ? readFileSync(ownerPath, 'utf8') : null;
const parsed = source === null ? [] : [...source.matchAll(ROW)].map((match) => ({ path: match[1].split('\\').join('/'), sha256: match[2], bytes: Number(match[3]) }));

report.check(`the anchor table exists and parses (${TABLE_OWNER})`, source !== null, ownerPath);
report.check('the table parses to exactly ELEVEN rows', parsed.length === 11, `rows=${parsed.length}`);
report.check('every row names a file that is on disk', parsed.every((row) => existsSync(join(PLUGIN, row.path))), parsed.filter((row) => !existsSync(join(PLUGIN, row.path))).map((row) => row.path).join(', '));

const drifted = [];
for (const row of parsed) {
  const full = join(PLUGIN, row.path);
  if (!existsSync(full)) {
    drifted.push(`${row.path}: MISSING`);
    continue;
  }
  const bytes = readFileSync(full);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const size = statSync(full).size;
  const ok = sha256 === row.sha256 && size === row.bytes;
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${row.path} — table ${row.bytes} B/${row.sha256.slice(0, 16)} vs disk ${size} B/${sha256.slice(0, 16)}`);
  if (!ok) drifted.push(`${row.path}: table ${row.bytes} B/${row.sha256.slice(0, 16)} vs disk ${size} B/${sha256.slice(0, 16)}`);
}
report.check('no pinned file drifted away from its recorded bytes', drifted.length === 0, drifted.join(' | '));
report.check(
  'and the recorded image is the one this probe just measured (no drift may be "accepted" silently)',
  drifted.length === 0,
  `${parsed.length} rows compared`,
);

const verdict = report.done();
console.log(`\nprobe-24 verdict: exit ${verdict.failed === 0 ? 0 : 1}`);
process.exit(verdict.failed === 0 ? 0 : 1);
