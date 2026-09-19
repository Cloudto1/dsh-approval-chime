/**
 * r15 / t6, re-anchored by r16 / t1, by r17 / t1, by r18 / t1, by r18b / t5, by r18c / t7, by r19 / t2 and now by r20 / t1 -- the MUTATION TABLE:
 * every declared mutation re-measured on the rev-20 bytes. The instrument is the r15 round's;
 * only its fingerprints and its row list move, round after round.
 *
 * Derived from _raw/r13c-mutation-table.mjs (the round that first made this table machine-readable).
 * The differences are deliberate and few:
 *   - it REFUSES to run unless lib/client.js is the rev-20 bytes (sha256 + size asserted), so a
 *     table for another revision can never be mislabelled as this one;
 *   - its logs are `_raw/r20-evidence/r20-mut-*.txt`, so the r13c, r15, r16, r17, r18, r18b, r18c AND r19 logs stay untouched;
 *   - it adds the r15 failure-path mutant (`r15t2-independent-probe.mjs --mutant`, t2's probe) as
 *     one row with declared=observed=its ten declared red checks;
 *   - the same three questions are answered per row as before: did the mutation really rewrite the
 *     evaluated source, was the anchor unique (exactly 1 occurrence), and is the observed red set
 *     exactly the declared one with exit 0?
 *
 *     node verify-independent/r15t6-mutation-table.mjs
 *
 * exits 0 only when every row is ok and the row count is the declared 45.
 */
import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, '_raw');
/* r20/t1: this round's logs and its table live in their own directory under _raw/, so a later
 * round's prefix row cannot overwrite them and this round's scope stays one directory deep. */
const EVIDENCE = join(RAW, 'r20-evidence');
mkdirSync(EVIDENCE, { recursive: true });
const PLUGIN = join(HERE, '..');
const CLIENT = join(PLUGIN, 'lib', 'client.js');
const FROZEN = { sha256: '4B6C8B91F0C294A0E2C561934C8ED627C7D3F937CFF33904A8FACA651A5949F3', bytes: 158549 };
const EXPECTED_ROWS = 45;

const digest = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase();

/** The 29 mutations the r13c table declared + the 2 r16/t1 gap mutants + the 7 r17/t2 caret-turn
 * mutants + the 6 r18/t2 reduce-motion mutants, re-run on the rev-20 bytes. */
const MUTATIONS = [
  ['probe-11-r4-css-rows', 'card-cap-92px'],
  ['probe-17-r7-section', 'slot'],
  ['probe-17-r7-section', 'order'],
  ['probe-17-r7-section', 'heading'],
  ['probe-17-r7-section', 'picker'],
  ['probe-17-r7-section', 'rogue'],
  ['probe-18-r10-sessions', 'mute-ignored'],
  ['probe-18-r10-sessions', 'unmute-writes-true'],
  ['probe-18-r10-sessions', 'batch-gap-zero'],
  ['probe-18-r10-sessions', 'session-id-constant'],
  ['probe-18-r10-sessions', 'custom-tone-no-fallback'],
  ['probe-18-r10-sessions', 'batch-merge-first-only'],
  ['probe-18-r10-sessions', 'evict-newest-first'],
  ['probe-18-r10-sessions', 'convergence-reread-removed'],
  ['probe-18-r10-sessions', 'home-blank-accepted'],
  ['probe-19-r12-select-parity', 'popover-dropped-from-shared-picker'],
  ['probe-19-r12-select-parity', 'popover-list-resplit-12px'],
  ['probe-19-r12-select-parity', 'popover-cap-loses-one-row'],
  ['probe-20-r14-bell-appearance', 'muted-bell-filled'],
  ['probe-20-r14-bell-appearance', 'audible-hover-dropped'],
  ['probe-20-r14-bell-appearance', 'fill-hardcoded-hex'],
  ['probe-20-r14-bell-appearance', 'muted-icon-recolored'],
  ['probe-20-r14-bell-appearance', 'bell-glyph-shrunk-to-14'],
  ['probe-20-r14-bell-appearance', 'bell-svg-hardcoded-14'],
  ['probe-20-r14-bell-appearance', 'caret-css-hardcoded-12'],
  ['probe-20-r14-bell-appearance', 'bell-css-hardcoded-20'],
  ['probe-20-r14-bell-appearance', 'audible-foreground-recoloured'],
  ['probe-20-r14-bell-appearance', 'muted-rule-declares-fill'],
  ['probe-20-r14-bell-appearance', 'caret-svg-hardcoded-9'],
  ['probe-20-r14-bell-appearance', 'bell-caret-gap-removed'],
  ['probe-20-r14-bell-appearance', 'bell-caret-gap-constant-zeroed'],
  ['probe-20-r14-bell-appearance', 'caret-turn-transition-dropped'],
  ['probe-20-r14-bell-appearance', 'caret-turn-rule-dropped'],
  ['probe-20-r14-bell-appearance', 'caret-turn-angle-45-deg'],
  ['probe-20-r14-bell-appearance', 'caret-turn-ms-250'],
  ['probe-20-r14-bell-appearance', 'caret-turn-reduced-motion-restored'],
  ['probe-20-r14-bell-appearance', 'caret-turn-moved-to-button'],
  ['probe-20-r14-bell-appearance', 'caret-turn-also-when-closed'],
  ['probe-20-r14-bell-appearance', 'reduce-motion-boolean-snapshot'],
  ['probe-20-r14-bell-appearance', 'reduce-motion-always-false'],
  ['probe-20-r14-bell-appearance', 'reduce-motion-always-true'],
  ['probe-20-r14-bell-appearance', 'reduce-motion-cached-after-first-call'],
  ['probe-20-r14-bell-appearance', 'reduce-motion-asks-the-wrong-query'],
  ['probe-20-r14-bell-appearance', 'reduce-motion-snapshotted-into-sessionIcon'],
];

const first = (lines, pattern) => {
  const match = lines.find((line) => pattern.test(line));
  return match === undefined ? null : match.trim();
};
const countDeclared = (text) => {
  const parenthesised = /declared red set \((\d+)\)/.exec(text);
  if (parenthesised !== null) return Number(parenthesised[1]);
  const exact = /exactly the (\d+) declared check\(s\)/.exec(text);
  if (exact !== null) return Number(exact[1]);
  const header = /declared red set[^:]*: (.+)$/m.exec(text);
  if (header !== null) return header[1].trim() === '(measurement run)' ? null : header[1].split(',').length;
  return null;
};
const countRed = (text) => {
  const marker = /checks that turned red = (\[.*\])/.exec(text);
  if (marker !== null) return JSON.parse(marker[1]).length;
  const dropped = /reddened: (\[.*\])/.exec(text);
  if (dropped !== null) return JSON.parse(dropped[1]).length;
  const observed = /observed red set \((\d+)\)/.exec(text);
  if (observed !== null) return Number(observed[1]);
  return null;
};
const scrub = (text) => (text === null ? null : text.replace(/\s+/g, ' ').trim().slice(0, 200));

const shipped = readFileSync(CLIENT);
const shippedSha = digest(shipped);
if (shippedSha !== FROZEN.sha256 || shipped.length !== FROZEN.bytes) {
  console.error(`REFUSING: lib/client.js is ${shipped.length} B / ${shippedSha}, not the rev-20 artifact ${FROZEN.bytes} B / ${FROZEN.sha256}`);
  process.exit(1);
}

const rows = [];
let bad = 0;

for (const [probe, mutation] of MUTATIONS) {
  const logPath = join(RAW, `r20-evidence/r20-mut-${probe}-${mutation}.txt`);
  const fd = openSync(logPath, 'w');
  let result;
  try {
    result = spawnSync('node', [join('verify-independent', `${probe}.mjs`), `--mutate=${mutation}`], {
      cwd: PLUGIN,
      stdio: ['ignore', fd, fd],
    });
  } finally {
    closeSync(fd);
  }
  const exitCode = result.error === undefined && result.signal === null ? result.status : null;
  const text = readFileSync(logPath, 'utf8');
  const lines = text.split(/\r?\n/);

  const marker = first(lines, /(no undeclared check turned red|reddens EXACTLY its|red set is EXACTLY the declaration|DETECTED \(exactly the declared red set)/);
  const exactHolds = marker !== null && !/\[FAIL\]/.test(marker) && !/red set is EXACTLY the declaration: false/.test(marker) && !/NOT DETECTED/.test(text);
  const changedLine = first(lines, /the mutation really rewrote|mutant source sha256/);
  const changed = changedLine !== null && !/DEAD MUTATION|changed=false/.test(changedLine);
  const anchorLine = first(lines, /anchor occurrences in the shipped bytes: (\d+)/);
  const anchorCount = anchorLine === null ? 1 : Number(/anchor occurrences in the shipped bytes: (\d+)/.exec(anchorLine)[1]);
  const declared = countDeclared(text);
  const observed = countRed(text);
  const exitZero = exitCode === 0;
  const exact = exactHolds && declared !== null && observed !== null && declared === observed;
  const ok = exact && changed && anchorCount === 1 && observed !== null && observed > 0 && exitZero;
  if (!ok) bad += 1;
  rows.push({
    probe,
    mutation,
    exitCode,
    declared,
    observed,
    exact,
    changed,
    anchorCount,
    ok,
    evidence: {
      mutantSource: scrub(changedLine),
      verdict: scrub(marker),
      anchor: scrub(anchorLine),
    },
  });
}

/* ---- the r15 failure-path mutant (t2's probe): one run, ten declared red checks ---- */

const r15t2Log = join(RAW, 'r20-evidence/r20-mut-r15t2-independent-probe-sessionsreadfailed-reverted.txt');
const r15t2Fd = openSync(r15t2Log, 'w');
let r15t2Result;
try {
  r15t2Result = spawnSync('node', [join('verify-independent', 'r15t2-independent-probe.mjs'), '--mutant'], {
    cwd: PLUGIN,
    stdio: ['ignore', r15t2Fd, r15t2Fd],
  });
} finally {
  closeSync(r15t2Fd);
}
const r15t2Exit = r15t2Result.error === undefined && r15t2Result.signal === null ? r15t2Result.status : null;
const r15t2Text = readFileSync(r15t2Log, 'utf8');
const r15t2Lines = r15t2Text.split(/\r?\n/);
const declaredNames = [...r15t2Text.matchAll(/^ {2}- (.+)$/gm)].map((match) => match[1].trim());
const declaredCount = Number((/declared red set \((\d+)\)/.exec(r15t2Text) ?? [0, 0])[1]);
const observedCount = Number((/actual red set \((\d+)\)/.exec(r15t2Text) ?? [0, 0])[1]);
const nonEmpty = /M1: the red set is non-empty: yes/.test(r15t2Text);
const identical = /M2: the red set equals the declared set exactly: yes/.test(r15t2Text);
const anchorOk = first(r15t2Lines, /A2: the mutation anchor matches exactly one site/)?.startsWith('[ ok ]') === true;
const changedOk = first(r15t2Lines, /A4: the mutant is not the shipped byte sequence/)?.startsWith('[ ok ]') === true
  && first(r15t2Lines, /A5: only the anchor span differs between shipped bytes and mutant/)?.startsWith('[ ok ]') === true;
const r15t2Ok = r15t2Exit === 0 && declaredCount === 10 && observedCount === 10 && nonEmpty && identical && anchorOk && changedOk;
if (!r15t2Ok) bad += 1;
rows.push({
  probe: 'r15t2-independent-probe',
  mutation: 'sessionsReadFailed-body-reverted-to-rev-14',
  exitCode: r15t2Exit,
  declared: declaredCount,
  observed: observedCount,
  exact: identical,
  changed: changedOk,
  anchorCount: anchorOk ? 1 : 0,
  ok: r15t2Ok,
  evidence: {
    mutantSource: scrub(first(r15t2Lines, /A5: only the anchor span differs/)),
    verdict: scrub(first(r15t2Lines, /^=== mutant run:/)),
    anchor: scrub(first(r15t2Lines, /A2: the mutation anchor matches exactly one site/)),
    declaredRedSet: declaredNames,
  },
});

if (rows.length !== EXPECTED_ROWS) {
  console.error(`ROW COUNT: ${rows.length}, declared ${EXPECTED_ROWS}`);
  bad += 1;
}

const table = {
  generatedBy: 'r15t6-mutation-table.mjs',
  revision: 'rev-20',
  clientSha256: shippedSha,
  clientBytes: shipped.length,
  exitCodesMeasuredLive: true,
  rowCount: rows.length,
  okCount: rows.filter((row) => row.ok).length,
  rows,
};
writeFileSync(join(RAW, 'r20-evidence/r20-t1-mutation-table.json'), `${JSON.stringify(table, null, 2)}\n`, 'utf8');

const md = [
  '# r20 · the rev-20 mutation table (every declared mutation re-measured on the rev-20 bytes)',
  '',
  `client.js under test : ${shipped.length} B / ${shippedSha}`,
  `mutations            : ${rows.length} rows, ${table.okCount} ok`,
  `generated by         : verify-independent/r15t6-mutation-table.mjs (raw logs: _raw/r20-evidence/r20-mut-*.txt)`,
  '',
  '| # | probe | mutation | declared | observed | exact | changed | anchor | exit | ok |',
  '|---|-------|----------|---------:|---------:|:-----:|:-------:|-------:|-----:|:--:|',
  ...rows.map((row, index) => `| ${index + 1} | ${row.probe} | ${row.mutation} | ${row.declared} | ${row.observed} | ${row.exact} | ${row.changed} | ${row.anchorCount} | ${row.exitCode} | ${row.ok} |`),
  '',
  bad === 0
    ? `RESULT: all ${rows.length} declared mutations on the rev-20 bytes rewrite the evaluated source, match their anchor exactly once, redden exactly their declared checks and exit 0.`
    : `RESULT: ${bad} row(s) are NOT ok -- see the table above.`,
  '',
].join('\n');
writeFileSync(join(RAW, 'r20-evidence/r20-t1-mutation-table.md'), md, 'utf8');

console.log(`r20 mutation table: rows=${rows.length} ok=${table.okCount} client.js=${shipped.length} B / ${shippedSha.slice(0, 16)}...`);
for (const row of rows) {
  if (row.ok) continue;
  console.log(`  NOT OK  ${row.probe} --mutate=${row.mutation}  exit=${row.exitCode} declared=${row.declared} observed=${row.observed} exact=${row.exact} changed=${row.changed} anchor=${row.anchorCount}`);
}
console.log(bad === 0
  ? `RESULT: every one of the ${rows.length} declared mutations is ok on the rev-20 bytes.`
  : `RESULT: ${bad} problem(s).`);
process.exit(bad === 0 ? 0 : 1);
