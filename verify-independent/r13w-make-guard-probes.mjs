/**
 * r13w (task t6, verifier) — build three DELIBERATELY BROKEN copies of probe-20.
 *
 * The acceptance for this round asks for proof that the mutant driver of probe-20 cannot lie:
 *   1. a dead anchor          -> non-zero + "anchor not found (0 occurrences)" / DEAD MUTATION
 *   2. a declaration too narrow -> non-zero + "UNDECLARED red"
 *   3. a declaration too wide   -> non-zero + "NOT DETECTED (declared but still green)"
 *
 * Copies live in verify-independent/ so their relative paths (`../lib/client.js`) still resolve.
 * Each patch must apply to exactly one spot, asserted here, so a mis-applied patch cannot exist.
 *
 *     node verify-independent/r13w-make-guard-probes.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'probe-20-r14-bell-appearance.mjs'), 'utf8');
const sha = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').toUpperCase();
const lines = [`probe-20-r14-bell-appearance.mjs  ${Buffer.byteLength(source, 'utf8')} B  ${sha(source)}`];

function patchOnce(text, label, anchor, replacement) {
  const occurrences = text.split(anchor).length - 1;
  if (occurrences !== 1) throw new Error(`${label}: anchor occurs ${occurrences} times, expected 1`);
  lines.push(`  ${label}: anchor x1`);
  return text.split(anchor).join(replacement);
}

function emit(name, text) {
  writeFileSync(join(here, name), text, 'utf8');
  lines.push(`  wrote ${name}  ${Buffer.byteLength(text, 'utf8')} B  ${sha(text)}`);
}

/* 1. dead anchor: the shared fill-rule constant gets a prefix that matches nothing. */
emit('r13w-guard-probe-20-deadanchor.mjs', patchOnce(
  source,
  'dead anchor',
  'const BELL_FILL_RULE = "',
  'const BELL_FILL_RULE = "DEAD-ANCHOR-NOT-IN-SHIPPED-BYTES-" + "',
));

/* 2. declaration too narrow: one declared check is dropped, so the mutant reddens MORE than it declares. */
emit('r13w-guard-probe-20-narrow.mjs', patchOnce(
  source,
  'too-narrow declaration',
  "      'the resolved fill of the audible state is exactly sessionIcon.onBackground',\n      'that fill is a design token, never a literal colour',\n",
  "      'the resolved fill of the audible state is exactly sessionIcon.onBackground',\n",
));

/* 3. declaration too wide: a declared check that no mutation can redden. */
emit('r13w-guard-probe-20-wide.mjs', patchOnce(
  source,
  'too-wide declaration',
  "      'the muted glyph keeps a caption-grey token, not the paint',\n    ],",
  "      'the muted glyph keeps a caption-grey token, not the paint',\n      'a check that no mutation can redden (deliberately too wide)',\n    ],",
));

const report = lines.join('\n');
console.log(report);
writeFileSync(join(here, '_raw', 'r13w-guard-probes-build.txt'), `${report}\n`, 'utf8');
