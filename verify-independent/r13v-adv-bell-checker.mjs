/**
 * r13v (independent verifier, task t3) — does ANYTHING catch the adversarial bell mutants?
 *
 * Part 1 (measured): probe-18's 131 assertions are run against each adversarial mutant with
 *   `node verify-independent/r13v-adv-probe-18.mjs --mutate=<name>`; that probe prints the red
 *   set it actually observed. Run this file's companion commands; this file covers part 2.
 *
 * Part 2 (this file): the verifier's own replication of the rev-14 bell facts that
 *   verify/client-half.test.mjs asserts at lines 715-752. It loads the MUTATED client source in
 *   the SHIPPED harness's own vm sandbox (verify/_harness.mjs: createDocumentStub /
 *   createModuleLoaderStub / createClientCtx — imported, not copied), reads the `<style>`
 *   element the bundle injected, and re-evaluates the same five-to-eight facts.
 *
 * Why: "probe-18 did not catch it" is only half an answer. This half says whether the mutant is
 * a real semantic break with an existing check that bites -- and which check that is.
 *
 * lib/** is never written: the mutant exists only as an in-memory string.
 *
 *     node verify-independent/r13v-adv-bell-checker.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { ADVERSARIAL_MUTATIONS } from './r13v-adv-mutations.mjs';
import {
  createClientCtx,
  createDocumentStub,
  createModuleLoaderStub,
} from '../verify/_harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const plugin = join(here, '..');
const SHIPPED = readFileSync(join(plugin, 'lib', 'client.js'), 'utf8');

/** Load one source string and return the injected stylesheet + the console-surface facts. */
function styleFacts(source) {
  const sandbox = { console, setTimeout, clearTimeout, setInterval, clearInterval };
  const context = vm.createContext(sandbox);
  vm.runInContext('globalThis.window = globalThis;', context);
  const document = createDocumentStub();
  context.window.document = document;
  const loader = createModuleLoaderStub();
  context.window.__ModuleLoader__ = loader;
  vm.runInContext(source, context, { filename: 'lib/client.js(mutant, in memory)' });
  const registration = loader.registrations[0] ?? null;
  if (registration !== null) {
    const requires = [];
    const react = { createElement: (...args) => ({ type: args[0], props: args[1] ?? {}, children: args.slice(2) }) };
    const contract = registration.factory((specifier) => {
      requires.push(specifier);
      if (specifier === 'react') return react;
      throw new Error(`unexpected require(${JSON.stringify(specifier)})`);
    });
    contract.apply(createClientCtx().ctx);
  }
  const styleText = String(document.created.find((element) => element.id === 'dsh-approval-chime/styles')?.textContent ?? '');
  const diagnostics = context.window.__DSH_APPROVAL_CHIME__ ?? {};
  return { styleText, sessionIcon: diagnostics.sessionIcon, diagnostics };
}

/** Transcribed from verify/client-half.test.mjs:697-714 (every rule naming the selector, later wins). */
function mergedDecls(styleText, selector) {
  const props = {};
  let from = 0;
  for (;;) {
    const at = styleText.indexOf(selector, from);
    if (at < 0) break;
    from = at + selector.length;
    const before = at === 0 ? '' : styleText[at - 1];
    const after = styleText[at + selector.length];
    if (!(before === '' || before === ',' || before === '}' || before === '{')) continue;
    if (!(after === '{' || after === ',')) continue;
    const brace = after === '{' ? at + selector.length : styleText.indexOf('{', at);
    const end = styleText.indexOf('}', brace);
    for (const declaration of styleText.slice(brace + 1, end).split(';')) {
      const colon = declaration.indexOf(':');
      if (colon > 0) props[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
    }
  }
  return props;
}

/** The facts verify/client-half.test.mjs asserts (lines 721-752), re-evaluated here. */
function bellFacts({ styleText, sessionIcon }) {
  const on = sessionIcon.onBackground;
  const onFg = sessionIcon.onForeground;
  const bellOn = mergedDecls(styleText, '.dacBell[data-muted="false"]');
  const bellOnHover = mergedDecls(styleText, '.dacBell[data-muted="false"]:hover');
  const bellMuted = mergedDecls(styleText, '.dacBell[data-muted="true"]');
  const bellBase = mergedDecls(styleText, '.dacBell');
  const switchOn = mergedDecls(styleText, '.dacSwitch[data-on="true"]');
  const slider = mergedDecls(styleText, '.dacCard input[type=range]');
  return [
    ['C1 audible bell is filled with the reported paint (client-half:721)', `${bellOn.background}|${bellOn.color}`, `${on}|${onFg}`],
    ['C2 that paint is the switch token (client-half:726)', switchOn.background, on],
    ['C3 and the slider token (client-half:727)', slider['accent-color'], on],
    ['C4 the fill is the shipped rule verbatim (client-half:749)', String(styleText.includes(`.dacBell[data-muted="false"]{background:${on};color:${onFg};}`)), 'true'],
    ['C5 the filled bell has its OWN hover paint (client-half:729)', bellOnHover.background, `color-mix(in srgb,${on} 86%,#000)`],
    ['C6 a MUTED session is not filled (client-half:734)', String(bellMuted.background), 'undefined'],
    ['C7 the muted glyph keeps caption grey (client-half:739)', bellMuted.color, 'var(--dsw-alias-label-caption,#71717a)'],
    ['C8 the fill is never on the plain .dacBell class (client-half:744)', bellBase.background, 'transparent'],
  ];
}

const lines = [];
let bad = 0;

// Control: the shipped bytes must satisfy every fact, or this checker is measuring nothing.
const shipped = bellFacts(styleFacts(SHIPPED));
const shippedOk = shipped.every(([, actual, expected]) => actual === expected);
lines.push(`shipped lib/client.js: ${shippedOk ? 'all 8 bell facts hold (checker control passes)' : 'CHECKER BROKEN'}`);
if (!shippedOk) {
  bad += 1;
  for (const [name, actual, expected] of shipped) if (actual !== expected) lines.push(`    ${name}: got ${actual}, want ${expected}`);
}

for (const mutation of ADVERSARIAL_MUTATIONS) {
  const occurrences = SHIPPED.split(mutation.from).length - 1;
  if (occurrences !== 1) throw new Error(`${mutation.name}: anchor occurs ${occurrences} times`);
  const mutant = SHIPPED.split(mutation.from).join(mutation.to);
  const facts = bellFacts(styleFacts(mutant));
  const broken = facts.filter(([, actual, expected]) => actual !== expected);
  lines.push('');
  lines.push(`${mutation.name}  (${mutant === SHIPPED ? 'DEAD MUTATION' : 'source really changed'})`);
  lines.push(`    ${mutation.what}`);
  if (broken.length === 0) {
    lines.push('    NOT caught by the replicated client-half bell facts either -> nobody covers this');
  } else {
    for (const [name, actual, expected] of broken) lines.push(`    caught by ${name}: got ${actual}, want ${expected}`);
  }
}

const report = lines.join('\n');
console.log(report);
writeFileSync(join(here, '_raw', 'r13v-adv-bell-checker.txt'), `${report}\n`, 'utf8');
process.exit(bad === 0 ? 0 : 1);
