/**
 * r13v (independent verifier, task t3) — build the ADVERSARIAL probes.
 *
 * These are deliberately BROKEN variants of the shipped probes, plus a variant of probe-18
 * carrying product mutations the round never declared. They exist to answer two questions t2
 * cannot answer about itself:
 *
 *   A. Does the shipped independent probe set catch a semantic break in the rev-13/rev-14
 *      session bell that NOBODY declared? (r13v-adv-probe-18.mjs, `expect: []` = measurement
 *      mode: the probe prints the red set it actually observed.)
 *   B. Do the t2 "a mutant can no longer lie" guards really bite? (dead anchor, declaration
 *      drift, non-unique anchor, no-op substitution -> each must exit non-zero.)
 *
 * Every variant is produced by ONE textual patch whose anchor must occur exactly once in the
 * source; the patch count is asserted here, so a silently-misapplied patch cannot exist.
 *
 *     node verify-independent/r13v-make-adversarial-probes.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADVERSARIAL_MUTATIONS } from './r13v-adv-mutations.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');
const sha = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').toUpperCase();
const lines = [];

/** Apply `patch` to `text`, asserting the anchor occurs exactly `count` times. */
function patchOnce(text, name, anchor, to, count = 1) {
  const occurrences = text.split(anchor).length - 1;
  if (occurrences !== count) {
    throw new Error(`${name}: anchor occurs ${occurrences} times, expected ${count}: ${JSON.stringify(anchor.slice(0, 90))}`);
  }
  lines.push(`  patch ${name}: anchor x${occurrences} -> ${JSON.stringify(to.slice(0, 60))}`);
  return text.split(anchor).join(to);
}

function emit(name, text) {
  const path = join(here, name);
  writeFileSync(path, text, 'utf8');
  lines.push(`  wrote ${name}  ${Buffer.byteLength(text, 'utf8')} B  ${sha(text)}`);
}

const CLIENT = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');

/* ----------------------------------------------------------------- A. product mutants */

const probe18 = read('probe-18-r10-sessions.mjs');

/**
 * The adversarial product mutants (shared with r13v-adv-bell-checker.mjs): `from`/`to` are the
 * LITERAL source text of lib/client.js (probe-18's driver does plain string substitution, so
 * these must stay string literals -- an expression like BELL_ON_BG would be a ReferenceError
 * in the probe module, and a dropped leading quote would make the anchor dead).
 */
const ADV = ADVERSARIAL_MUTATIONS;

const ADV_MUTATIONS = [
  '  /* ---- r13v adversarial additions (verifier t3): NO declared red set, so probe-18 prints',
  '     the red set it actually observes. These break the rev-14 bell claims in ways the round',
  '     never declared. ---- */',
  ...ADV.map((entry) => [
    '  {',
    `    name: ${JSON.stringify(entry.name)},`,
    "    target: 'client',",
    `    what: ${JSON.stringify(entry.what)},`,
    `    from: ${JSON.stringify(entry.from)},`,
    `    to: ${JSON.stringify(entry.to)},`,
    '    expect: [],',
    '  },',
  ].join('\n')),
  '',
].join('\n');

let variant = patchOnce(probe18, 'probe-18 MUTATIONS open', 'const MUTATIONS = [\n', `const MUTATIONS = [\n${ADV_MUTATIONS}`);
emit('r13v-adv-probe-18.mjs', variant);

/* source-anchor sanity: every adversarial `from` must occur exactly once in lib/client.js */
for (const entry of ADV) {
  const occurrences = CLIENT.split(entry.from).length - 1;
  lines.push(`  lib/client.js anchor x${occurrences}: ${entry.name} ${JSON.stringify(entry.from.slice(0, 70))}`);
  if (occurrences !== 1) throw new Error(`adversarial anchor is not unique in lib/client.js: ${entry.from}`);
}

/* ------------------------------------------------------- B. harness guard self-tests */

// B1: a dead anchor (0 occurrences) must make the mutant driver throw, never report "caught".
variant = patchOnce(probe18, 'probe-18 dead anchor',
  "    from: 'var enabled = record !== null && typeof record.enabled === \\'boolean\\' ? record.enabled : globals.enabled;',",
  "    from: 'DEAD-ANCHOR-var enabled = record !== null && typeof record.enabled === \\'boolean\\' ? record.enabled : globals.enabled;',");
variant = variant.replace('r13v-adv', 'r13v-adv'); // no-op, keeps this patch textually isolated
emit('r13v-adv-probe-18-deadanchor.mjs', variant);

// B2: declaration drift -- one declared id removed must make the mutant "NOT DETECTED".
const driftAnchor = "expect: ['B3.label-both-languages-off', 'B3b.muted-state-attributes', 'B4.icon-two-states', 'C2.unmute-clears-override', 'C2c.local-table-back-to-follow', 'C6.mute-one-session-only', 'C6b.only-the-other-session-rings', 'C6c.suppressedSession-one', 'D3', 'E7.muted-session-does-not-sound', 'E8.gap-survives-mute', 'E9.suppressedSession-counted', 'E9b.batch-counters-after-mute', 'I1b.one-POST-per-click'],";
const driftTo = driftAnchor.replace(" 'D3',", '');
variant = patchOnce(probe18, 'probe-18 declaration drift', driftAnchor, driftTo);
emit('r13v-adv-probe-18-drift.mjs', variant);

// B3: a no-op substitution in probe-11 (to === from) must report DEAD MUTATION, not a catch.
const probe11 = read('probe-11-r4-css-rows.mjs');
variant = patchOnce(probe11, 'probe-11 no-op substitution',
  "      const to = '.dacCard select::picker(select){max-height:92px;}';",
  "      const to = '.dacCard select::picker(select){max-height:84px;}';");
emit('r13v-adv-probe-11-noop.mjs', variant);

// B4: a non-unique anchor in probe-17 must throw (anchor uniqueness is measured, not assumed).
const probe17 = read('probe-17-r7-section.mjs');
variant = patchOnce(probe17, 'probe-17 non-unique anchor',
  "      return replaceOnce(source, \"order: 16,\", 'order: 99,', 'order');",
  "      return replaceOnce(source, \"order: \", 'order: 99,', 'order');");
emit('r13v-adv-probe-17-nonunique.mjs', variant);
const orderOccurrences = CLIENT.split('order: ').length - 1;
lines.push(`  lib/client.js 'order: ' occurs x${orderOccurrences} (must be >= 2 for the non-unique test)`);
if (orderOccurrences < 2) throw new Error('the non-unique-anchor test needs >= 2 occurrences of "order: "');

// B5: a dead anchor in probe-19.
const probe19 = read('probe-19-r12-select-parity.mjs');
variant = patchOnce(probe19, 'probe-19 dead anchor',
  "      return replaceOnce(source, \"'.dacCard select::picker(select),.dacPop select::picker(select){' + pickerBox + '}',\", \"'.dacCard select::picker(select){' + pickerBox + '}',\");",
  "      return replaceOnce(source, \"DEAD-ANCHOR::picker(select),.dacPop select::picker(select){' + pickerBox + '}',\", \"'.dacCard select::picker(select){' + pickerBox + '}',\");");
emit('r13v-adv-probe-19-deadanchor.mjs', variant);

const report = ['r13v adversarial probe generation', ...lines].join('\n');
console.log(report);
writeFileSync(join(here, '_raw', 'r13v-adversarial-build.txt'), `${report}\n`, 'utf8');
