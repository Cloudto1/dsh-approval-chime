/**
 * r13v (independent verifier, task t3) — verdict engine for the mutation matrix.
 *
 * Inputs (all produced by the verifier's own run, none taken from t2):
 *   _raw/r13v-declared.json          declarations statically parsed from the probe bytes
 *   _raw/r13v-mutation-matrix.tsv    probe / mutation / exit code / log path
 *   _raw/r13v-mut-*.txt              the raw stdout+stderr of every mutant process
 *
 * For every one of the 18 declared mutants it answers the three questions the round's
 * "done" criterion is about:
 *   1. did the evaluated source really change?   (sha256 pair read from the log, compared here)
 *   2. is the observed red set EXACTLY the declared one?  (declaration from source, red set
 *      from the log — never from t2's table)
 *   3. did the mutant exit 0?                    (caught-as-declared, not a red run)
 *
 *     node verify-independent/r13v-check-matrix.mjs [--markdown=<path>]
 * exit 0 = every mutant passed; 1 = at least one mismatch (printed with the raw log path).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const raw = join(here, '_raw');

const declarations = JSON.parse(readFileSync(join(raw, 'r13v-declared.json'), 'utf8'));
const tsv = readFileSync(join(raw, 'r13v-mutation-matrix.tsv'), 'utf8').trim().split(/\r?\n/)
  .map((line) => line.split('\t'))
  .map(([probe, mutation, exit, log]) => ({ probe, mutation, exit: Number(exit), log }));

const shaPair = /sha256 ([0-9A-Fa-f]{8,64}) vs (?:shipped )?([0-9A-Fa-f]{8,64})/;
const problems = [];
const rows = [];

/** Every JSON array assigned to `label = ` in the log (probe-11/17: "checks that turned red", probe-19: "reddened:"). */
function jsonArrayAfter(text, label) {
  const at = text.indexOf(label);
  if (at < 0) return null;
  const start = text.indexOf('[', at);
  if (start < 0) return null;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '[') depth += 1;
    else if (text[index] === ']') {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, index + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function exactMatch(declared, observed, prefixRule) {
  const matches = (expected, id) => (prefixRule ? id === expected || id.startsWith(`${expected}.`) : id === expected);
  const missing = declared.filter((expected) => !observed.some((id) => matches(expected, id)));
  const extra = observed.filter((id) => !declared.some((expected) => matches(expected, id)));
  return { missing, extra };
}

for (const row of tsv) {
  const text = readFileSync(row.log, 'utf8');
  const base = row.probe;

  if (row.mutation === 'shipped') {
    const summary = (text.match(/^### .*$/m) ?? ['(no summary line)'])[0].trim();
    rows.push({ ...row, kind: 'shipped', summary, ok: row.exit === 0 });
    if (row.exit !== 0) problems.push(`shipped ${base} exited ${row.exit}`);
    continue;
  }

  if (row.mutation === '--mutate=all') {
    const summary = (text.match(/^### mutation summary.*$/m) ?? ['(no summary line)'])[0].trim();
    const notDetected = [...text.matchAll(/^############ NOT DETECTED as declared$/gm)].length;
    const detected = [...text.matchAll(/^#############? ?DETECTED \(exactly the declared red set/gm)].length;
    const allExact = [...text.matchAll(/red set is EXACTLY the declaration: (true|false)/g)].map((m) => m[1]);
    const ok = row.exit === 0 && (base.startsWith('probe-18') ? notDetected === 0 : allExact.every((v) => v === 'true'));
    rows.push({ ...row, kind: 'group', summary, ok, detail: `${detected} detected / ${notDetected} not detected` });
    if (!ok) problems.push(`group run ${base} --mutate=all exit=${row.exit} (${summary})`);
    continue;
  }

  /* ---- one mutant ---- */
  const isProbe18 = base.startsWith('probe-18');
  let observed = null;
  let declared = [];
  let block = text;
  let sourceChanged = null;
  let anchorOccurrences = null;

  if (isProbe18) {
    const blocks = [...text.matchAll(/^############ mutation '([^']+)' \(/gm)];
    const mine = blocks.find((match) => match[1] === row.mutation);
    if (!mine) {
      problems.push(`${base} ${row.mutation}: no mutation block in ${row.log}`);
      rows.push({ ...row, kind: 'mutant', observed: [], declaredCount: null, ok: false, detail: 'no mutation block' });
      continue;
    }
    const from = mine.index;
    const next = blocks.find((match) => match.index > from);
    block = text.slice(from, next ? next.index : text.length);
    const observedLine = block.match(/^############ observed red set \((\d+)\): (.*)$/m);
    observed = observedLine ? (observedLine[2].trim() === '(none)' ? [] : observedLine[2].split(',').map((id) => id.trim()).filter(Boolean)) : null;
    const declaredLine = block.match(/^############ declared red set: (.*)$/m);
    declared = declaredLine ? declaredLine[1].split(',').map((id) => id.trim()).filter(Boolean) : [];
    const anchorLine = block.match(/^############ anchor occurrences in the shipped bytes: (\d+) /m);
    anchorOccurrences = anchorLine ? Number(anchorLine[1]) : null;
  } else {
    observed = jsonArrayAfter(block, 'checks that turned red =') ?? jsonArrayAfter(block, 'reddened:');
    declared = Object.keys(declarations[base] ?? {})
      .filter((name) => name === row.mutation)
      .flatMap((name) => declarations[base][name].declared);
  }

  const pair = block.match(shaPair);
  sourceChanged = pair ? pair[1].toLowerCase() !== pair[2].toLowerCase() : null;

  if (observed === null) problems.push(`${base} ${row.mutation}: could not read the observed red set from ${row.log}`);
  const { missing, extra } = observed === null
    ? { missing: ['(unreadable)'], extra: [] }
    : exactMatch(declared, observed, isProbe18);

  const ok = row.exit === 0 && observed !== null && missing.length === 0 && extra.length === 0
    && sourceChanged === true && (isProbe18 ? anchorOccurrences === 1 : true);
  if (!ok) {
    problems.push(`${base} ${row.mutation}: exit=${row.exit} declared=${declared.length} observed=${observed === null ? '?' : observed.length}`
      + ` missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)} sourceChanged=${sourceChanged} anchors=${anchorOccurrences} log=${row.log}`);
  }
  rows.push({
    ...row,
    kind: 'mutant',
    declaredCount: declared.length,
    observed,
    missing,
    extra,
    sourceChanged,
    anchorOccurrences,
    ok,
  });
}

/* ---------------------------------------------------------------- printing */

const mutants = rows.filter((row) => row.kind === 'mutant');
console.log(`r13v: ${mutants.length} declared mutants re-run independently`);
console.log('');
for (const row of mutants) {
  console.log(`[${row.ok ? 'PASS' : 'FAIL'}] ${row.probe.padEnd(30)} --mutate=${row.mutation.padEnd(36)} exit=${row.exit}`
    + ` declared=${row.declaredCount} observed=${row.observed === null ? '?' : row.observed.length}`
    + ` sourceChanged=${row.sourceChanged}${row.anchorOccurrences === null ? '' : ` anchors=${row.anchorOccurrences}`}`);
}
console.log('');
for (const row of rows.filter((entry) => entry.kind === 'shipped')) {
  console.log(`[${row.ok ? 'PASS' : 'FAIL'}] shipped ${row.probe} exit=${row.exit} :: ${row.summary}`);
}
for (const row of rows.filter((entry) => entry.kind === 'group')) {
  console.log(`[${row.ok ? 'PASS' : 'FAIL'}] ${row.probe} ${row.mutation} exit=${row.exit} :: ${row.summary} (${row.detail ?? ''})`);
}

/* A mutant nobody else duplicates is a stronger claim than "each mutant is exact": report how
 * many DISTINCT observed red sets each probe produced (probe-19 asserts pairwise distinctness
 * itself; this is the same measurement for all four, from the verifier's side). */
console.log('');
for (const probe of [...new Set(mutants.map((row) => row.probe))]) {
  const sets = mutants.filter((row) => row.probe === probe).map((row) => [...(row.observed ?? [])].sort().join('|'));
  console.log(`${probe}: ${sets.length} mutants, ${new Set(sets).size} distinct observed red sets`);
}

const markdownFlag = process.argv.find((value) => value.startsWith('--markdown='));
if (markdownFlag) {  const lines = [];
  lines.push('# r13v — independent re-run of the 18 declared mutants (verifier, task t3)');
  lines.push('');
  lines.push(`generated by \`node verify-independent/r13v-check-matrix.mjs\`; declarations re-parsed from the probe bytes, red sets re-read from \`_raw/r13v-mut-*.txt\`.`);
  lines.push('');
  lines.push('| # | probe | mutation | exit | declared | observed | missing | extra | source changed | anchor occurrences | verdict |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  mutants.forEach((row, index) => {
    lines.push(`| ${index + 1} | ${row.probe} | \`${row.mutation}\` | ${row.exit} | ${row.declaredCount} | ${row.observed === null ? '?' : row.observed.length} | ${row.missing.length} | ${row.extra.length} | ${row.sourceChanged} | ${row.anchorOccurrences ?? '-'} | ${row.ok ? 'caught exactly as declared' : 'MISMATCH'} |`);
  });
  lines.push('');
  lines.push(`RESULT: ${mutants.filter((row) => row.ok).length}/${mutants.length} mutants caught exactly as declared.`);
  writeFileSync(join(raw, 'r13v-mutation-matrix.md'), `${lines.join('\n')}\n`, 'utf8');
  console.log('');
  console.log(`markdown -> ${join(raw, 'r13v-mutation-matrix.md')}`);
}

if (problems.length > 0) {
  console.log('');
  console.log(`PROBLEMS (${problems.length}):`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exit(1);
}
console.log('');
console.log('every mutant: source really rewritten, red set exactly the declaration, exit 0');
