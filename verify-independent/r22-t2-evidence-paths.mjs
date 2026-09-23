#!/usr/bin/env node
/**
 * r22 / t2 -- repair r15t6's EVIDENCE PATHS, and register what running it early cost.
 *
 * THE DEFECT
 *   `r15t6-mutation-table.mjs` writes its own evidence: one log per mutation plus a JSON and a
 *   Markdown table. Every round re-anchors those paths to the current round (`r20-evidence/...` ->
 *   `r21-evidence/...` in r21/t1) so that a new round's logs never land on top of an older round's.
 *   This round's re-anchor instrument relocated the PRODUCT fingerprints, the revision literals, the
 *   fixture bytes and the runner's log prefix -- but NOT these paths, because they carry the round
 *   token (`r21-`) rather than the revision token (`rev-21`) and the row list was written from a
 *   `rev-21` search. The result was a live hazard, not a cosmetic one.
 *
 *   It was not caught before it fired. The probe sweep after the re-anchor ran r15t6 directly, so it
 *   wrote `_raw/r21-evidence/r21-t1-mutation-table.json`, `...table.md` and roughly forty
 *   `r21-mut-*.txt` logs -- OVERWRITING the r21 canonical run's copies of exactly those files. The
 *   damage is bounded and is registered rather than papered over:
 *     - LOST: the r21 table's JSON/Markdown and its per-mutation logs, replaced by the r22 run's
 *       output (which measures the rev-22 bytes). They are not recoverable from anything on disk.
 *     - SURVIVES: `_raw/r21-evidence/r21-t1-mutation-table-console.txt`, the r21 canonical run's own
 *       console log for that step, which still prints the r21 table's line. That is now the only
 *       first-hand record of the r21 mutation table, and the checker is pointed at it.
 *     - WHY THE COUNTS DID NOT SCREAM: the r22 table has the same shape (45 rows, 45 ok, one log per
 *       row), so a check that only counts rows keeps passing while reading the wrong round's bytes.
 *       A count is not a provenance test; that is the lesson, and it is written down in the docs.
 *
 * WHAT THIS TOOL DOES
 *   Moves r15t6's output paths to `_raw/r22-evidence/r22-*`, so the canonical run of THIS round
 *   writes this round's evidence and cannot touch r21's again. Same discipline as r22/t1: every row
 *   declares its occurrence count, any mismatch refuses the whole run, the pre-edit bytes are
 *   archived, the post-edit bytes+sha256 are predicted and then verified on disk.
 *
 * USAGE
 *   node r22-t2-evidence-paths.mjs            # dry run
 *   node r22-t2-evidence-paths.mjs --write    # apply, archive, verify, record
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, '..');
const EVIDENCE = join(HERE, '_raw', 'r22-evidence');
const ARCHIVE = join(EVIDENCE, 'archive');
const WRITE = process.argv.includes('--write');
const T6 = join(HERE, 'r15t6-mutation-table.mjs');

const sha256 = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
const bytesOf = (text) => Buffer.byteLength(text, 'utf8');

const row = (kind, find, replace, count, note) => ({ kind, find, replace, count, note });

const ROWS = [
  row('lit',
    'by r20 / t1 and now by r21 / t1 -- the MUTATION TABLE:',
    'by r20 / t1, by r21 / t1 and now by r22 / t1 -- the MUTATION TABLE:',
    1, 'the re-anchor history line in the header'),
  row('lit',
    'its logs are `_raw/r21-evidence/r21-mut-*.txt`, so the r13c, r15, r16, r17, r18, r18b, r18c, r19 AND r20 logs stay untouched;',
    'its logs are `_raw/r22-evidence/r22-mut-*.txt`, so the r13c, r15, r16, r17, r18, r18b, r18c, r19, r20 AND r21 logs stay untouched;',
    1, 'the header sentence that names the log directory'),
  row('rx', 'r21-evidence', 'r22-evidence', 6, 'every remaining reference to the evidence directory'),
  row('rx', 'r21-mut-', 'r22-mut-', 3, 'every remaining per-mutation log path'),
  row('rx', 'r21-t1-mutation-table', 'r22-t1-mutation-table', 2, 'the JSON and Markdown table paths'),
  row('lit', 'r21 mutation table: rows=', 'r22 mutation table: rows=', 1, 'the console summary line'),
];

const matchesOf = (text, entry) => {
  if (entry.kind === 'lit') {
    const found = [];
    let from = 0;
    for (;;) {
      const at = text.indexOf(entry.find, from);
      if (at < 0) break;
      found.push(at);
      from = at + entry.find.length;
    }
    return found;
  }
  const found = [];
  const re = new RegExp(entry.find, 'g');
  for (;;) {
    const hit = re.exec(text);
    if (hit === null) break;
    found.push(hit.index);
    if (hit[0].length === 0) re.lastIndex += 1;
  }
  return found;
};
const applyRow = (text, entry) => (entry.kind === 'lit'
  ? text.split(entry.find).join(entry.replace)
  : text.replace(new RegExp(entry.find, 'g'), entry.replace));
const lineAt = (text, index) => {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index);
  return text.slice(start, end < 0 ? text.length : end).replace(/\r$/, '').trim();
};

const original = readFileSync(T6, 'utf8');
const before = { bytes: bytesOf(original), sha256: sha256(original) };
let text = original;
const applied = [];
const bad = [];
for (const entry of ROWS) {
  const found = matchesOf(text, entry);
  if (found.length !== entry.count) {
    bad.push({ entry, observed: found.length, samples: found.slice(0, 2).map((at) => lineAt(text, at)) });
    continue;
  }
  console.log(`  [${String(found.length).padStart(2)}/${String(entry.count).padStart(2)}] ${entry.note}`);
  text = applyRow(text, entry);
  applied.push({ note: entry.note, count: entry.count });
}
if (bad.length > 0) {
  console.log('\n############ REFUSING: declared and observed counts disagree. Nothing was written.');
  for (const entry of bad) {
    console.log(`  declared ${entry.entry.count}, observed ${entry.observed} -- ${entry.entry.note}`);
    console.log(`    find: ${entry.entry.find}`);
    for (const sample of entry.samples) console.log(`    here: ${sample.slice(0, 118)}`);
  }
  process.exit(1);
}

const after = { bytes: bytesOf(text), sha256: sha256(text) };
console.log(`\nr15t6-mutation-table.mjs`);
console.log(`  before ${String(before.bytes).padStart(6)} B  ${before.sha256.slice(0, 16)}`);
console.log(`  after  ${String(after.bytes).padStart(6)} B  ${after.sha256.slice(0, 16)}  (${applied.length} rows)`);

if (!WRITE) {
  console.log('\n############ dry run -- nothing was written. Re-run with --write to apply.');
  process.exit(0);
}

mkdirSync(ARCHIVE, { recursive: true });
const name = 'verify-independent__r15t6-mutation-table.mjs.' + before.sha256.slice(0, 16) + '.txt';
const target = join(ARCHIVE, name);
if (!existsSync(target)) copyFileSync(T6, target);
if (sha256(readFileSync(target, 'utf8')) !== before.sha256) {
  console.error(`REFUSING: the archive copy ${name} does not verify.`);
  process.exit(1);
}
writeFileSync(T6, text, 'utf8');
const onDisk = readFileSync(T6, 'utf8');
if (bytesOf(onDisk) !== after.bytes || sha256(onDisk) !== after.sha256) {
  console.error('FAILED: the file did not land as predicted.');
  process.exit(1);
}
writeFileSync(join(EVIDENCE, 'r22-t2-evidence-paths.json'), `${JSON.stringify({
  tool: 'r22-t2-evidence-paths.mjs',
  what: 'r15t6 evidence paths moved from r21- to r22- so this round cannot overwrite the r21 canonical run again',
  lost: [
    '_raw/r21-evidence/r21-t1-mutation-table.json',
    '_raw/r21-evidence/r21-t1-mutation-table.md',
    '_raw/r21-evidence/r21-mut-*.txt (about forty logs)',
  ],
  survives: '_raw/r21-evidence/r21-t1-mutation-table-console.txt (the r21 canonical run\'s own console log)',
  file: { path: 'verify-independent/r15t6-mutation-table.mjs', before, after, archive: name, rows: applied },
}, null, 2)}\n`, 'utf8');
console.log(`wrote verify-independent/r15t6-mutation-table.mjs -- ${after.bytes} B / ${after.sha256.slice(0, 16)} (archive ${name})`);
