#!/usr/bin/env node
/**
 * probe-23 · the native-toast COMMAND LINE contract, asserted independently.
 *
 * WHY THIS FILE EXISTS (r30 residual gap): the r30 batch tightened `tools/native-toast.mjs` —
 *
 *   (a) an unknown COMMAND and an unknown ARGUMENT are usage errors, exit 2;
 *   (b) `install` / `uninstall` accept `--dry-run` in both spellings (`--dry-run`, `-DryRun`)
 *       and hand the flag to the deploy script;
 *   (c) `selftest` has NO dry-run mode: `selftest --dry-run` is REFUSED with exit 2. This is
 *       the one that matters — `deploy/native-toast/selftest.ps1` declares no `-DryRun`
 *       parameter and Windows PowerShell 5.1 silently DROPS an undeclared switch, so the
 *       pre-r30 build raised a REAL notification while the user believed they had asked for
 *       a rehearsal.
 *
 * The frozen suite asserts (a) for `bogus` only (`verify/native-toast.test.mjs:1188`, "an
 * unknown command is a usage error"). Nothing asserted (b)'s spelling or (c) at all; that hole
 * is what the r30 verification round recorded as a residual gap. This probe pins all of it.
 *
 * FALSIFIABLE WITHOUT A TOAST: `--mutant=<name>` runs the same checks against a byte copy of
 * the CLI whose REFUSAL has been weakened (exit code, wording) or whose unknown-argument gate
 * has been opened. None of the three mutants touches a path that spawns `selftest.ps1`, so a
 * mutant run can never put a notification on the screen. `--mutant=all` runs all three and
 * requires each to redden EXACTLY the checks it declares.
 *
 * Read-only: the probe never installs, never uninstalls and never writes the registry. The one
 * deploy call it makes is `install -DryRun`, which prints a plan and is asserted to say
 * `[dry-run]`.
 *
 * Run:  node verify-independent/probe-23-cli-args.mjs            (shipped: all checks must pass)
 *       node verify-independent/probe-23-cli-args.mjs --mutant=all
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = resolve(HERE, '..');
const CLI_RELATIVE = join('tools', 'native-toast.mjs');
const SHIPPED_CLI = join(PLUGIN, CLI_RELATIVE);
const POWERSHELL = 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
/** The self-test's own output banner: its presence means the real run happened. */
const SELFTEST_BANNER = '=== the toast platform ===';

const platform = await import(new URL('../lib/native-toast.js', import.meta.url).href);
const AUMID = platform.NATIVE_TOAST_AUMID;
const APP_NAME = platform.NATIVE_TOAST_APP_NAME;

const SANDBOX = mkdtempSync(join(tmpdir(), 'dsh-probe-23-'));

/* ------------------------------------------------------------------- reporter */

function makeReport(title) {
  const rows = [];
  return {
    rows,
    note(label, value) {
      console.log(`    · ${label} = ${value}`);
    },
    check(name, ok, detail) {
      const passed = ok === true;
      rows.push({ name, passed, detail });
      console.log(`${passed ? '[PASS]' : '[FAIL]'} ${name}${detail === undefined || detail === '' ? '' : ` — ${detail}`}`);
      return passed;
    },
    same(name, actual, expected) {
      return this.check(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    done() {
      const bad = rows.filter((row) => !row.passed);
      console.log(`\n### ${title}: ${rows.length - bad.length}/${rows.length} independent checks passed`);
      for (const row of bad) console.log(`    FAILED: ${row.name}`);
      return { total: rows.length, failed: bad.length, failedNames: bad.map((row) => row.name) };
    },
  };
}

/* ------------------------------------------------------------------ the runner */

const decode = (bytes) => (bytes.length > 1 && bytes[0] === 0xff && bytes[1] === 0xfe
  ? bytes.toString('utf16le').replace(/^\uFEFF/, '')
  : bytes.toString('utf8').replace(/^\uFEFF/, ''));

let runSeq = 0;
/**
 * Run the CLI and read back BOTH its exit status and its merged output. The output travels
 * through a file, never through a pipe: PowerShell does the redirect (`*> file`) and the child
 * is spawned with `stdio: 'ignore'`, which is the only capture path this sandbox allows (a
 * confined Windows sandbox refuses to open named pipes from Node). The encoding preamble is
 * load-bearing for the same reason it is in `verify/native-toast.test.mjs`: PowerShell decodes
 * a child's stdout with the console codepage (936 here) while node writes UTF-8.
 */
function runCli(cliPath, args) {
  runSeq += 1;
  const outFile = join(SANDBOX, `run-${runSeq}.txt`);
  const inner = `& node '${cliPath}' ${args.map((arg) => `'${arg}'`).join(' ')}`;
  const preamble = '[Console]::OutputEncoding = [Text.Encoding]::UTF8; $OutputEncoding = [Text.Encoding]::UTF8; ';
  const result = spawnSync(
    POWERSHELL,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `${preamble}& { ${inner} } *> "${outFile}"; exit $LASTEXITCODE`],
    { stdio: 'ignore', windowsHide: true, timeout: 180000 },
  );
  const text = existsSync(outFile) ? decode(readFileSync(outFile)) : '';
  return { status: typeof result.status === 'number' ? result.status : null, text };
}

/* ------------------------------------------------------------------- the checks */

/**
 * Every assertion the CLI contract needs, in one place, so the shipped run and the mutant runs
 * exercise the SAME code. `skipInstall` is for the mutant tree only: it carries no `deploy/`
 * directory, so the pass-through check (which needs the real deploy scripts) is not part of a
 * mutant run — the mutants weaken the argument gate, and the deploy pass-through is not one.
 */
function runContract(report, cliPath, options = {}) {
  const skipInstall = options.skipInstall === true;

  report.check('the CLI is where the contract says it is (tools/native-toast.mjs)', existsSync(cliPath), cliPath);

  const bogus = runCli(cliPath, ['bogus']);
  report.same('an unknown command is a usage error (exit 2)', bogus.status, 2);
  report.check('and the unknown command is named back', bogus.text.includes('unknown command: bogus'), (bogus.text.split(/\r?\n/)[0] ?? '').trim());

  const refusedLong = runCli(cliPath, ['selftest', '--dry-run']);
  report.same('selftest --dry-run is REFUSED with exit 2', refusedLong.status, 2);
  report.check('and the refusal says why (the wording is on the merged output)', refusedLong.text.includes('selftest has NO dry-run mode'), (refusedLong.text.split(/\r?\n/)[0] ?? '').trim());
  report.check('and the real self-test never ran (no toast was raised)', !refusedLong.text.includes(SELFTEST_BANNER), `absent marker: ${SELFTEST_BANNER}`);

  const refusedPowerShell = runCli(cliPath, ['selftest', '-DryRun']);
  report.same('selftest -DryRun (the PowerShell spelling) is refused the same way', refusedPowerShell.status, 2);
  report.check('and it also never ran the real self-test', !refusedPowerShell.text.includes(SELFTEST_BANNER), `absent marker: ${SELFTEST_BANNER}`);

  const unknownFlag = runCli(cliPath, ['status', '--verbose']);
  report.same('an unknown ARGUMENT is a usage error (exit 2)', unknownFlag.status, 2);
  report.check('and the unknown argument is listed', unknownFlag.text.includes('unknown argument(s): --verbose'), (unknownFlag.text.split(/\r?\n/)[0] ?? '').trim());

  const status = runCli(cliPath, ['status']);
  report.same('status exits 0', status.status, 0);
  report.check(
    'and prints the identity the PLUGIN declares (aumid + app name + plugin home)',
    status.text.includes(AUMID) && status.text.includes(APP_NAME) && status.text.includes('plugin home'),
    `aumid=${status.text.includes(AUMID)} appName=${status.text.includes(APP_NAME)}`,
  );

  if (!skipInstall) {
    const dryRun = runCli(cliPath, ['install', '-DryRun']);
    report.same('install -DryRun is accepted and exits with the deploy status (0)', dryRun.status, 0);
    report.check('and the flag really reached install.ps1 (the plan says [dry-run])', dryRun.text.includes('[dry-run]'), (dryRun.text.split(/\r?\n/).filter((line) => line.includes('[dry-run]'))[0] ?? '').trim());
  } else {
    report.note('mutant tree', 'the install pass-through check is not part of a mutant run (no deploy/ in the copy)');
  }
}

/* -------------------------------------------------------------- the three mutants */

/**
 * Each mutant is ONE byte-exact replacement on a copy of the CLI, and each declares the exact
 * set of checks it must redden. The anchor must occur exactly once, otherwise the mutant is
 * refused rather than applied to the wrong place.
 */
const MUTANTS = {
  'selftest-refusal-exit-0': {
    what: 'the refusal still prints but exits 0 (the guard is weakened, not removed)',
    find: "  console.error('\"node tools/native-toast.mjs status\" for a read-only check that raises nothing.');\n  process.exit(2);\n",
    replace: "  console.error('\"node tools/native-toast.mjs status\" for a read-only check that raises nothing.');\n  process.exit(0);\n",
    expectedRed: [
      'selftest --dry-run is REFUSED with exit 2',
      // The same guard is observed twice on purpose (both spellings reach it), so weakening it
      // reddens both readings. Measured, not assumed: the mutant was applied and run.
      'selftest -DryRun (the PowerShell spelling) is refused the same way',
    ],
  },
  'selftest-refusal-silent': {
    what: 'the refusal loses its explanation (exit code kept, wording dropped)',
    find: "  console.error('selftest has NO dry-run mode: it always raises one real test notification.');",
    replace: "  console.error('selftest dry-run: refused.');",
    expectedRed: ['and the refusal says why (the wording is on the merged output)'],
  },
  'unknown-flag-accepted': {
    what: 'the unknown-argument gate is opened (an unknown flag falls through to the verb)',
    find: 'if (unknownFlags.length > 0) {',
    replace: 'if (false) {',
    expectedRed: [
      'an unknown ARGUMENT is a usage error (exit 2)',
      // An open gate cannot list what it refused: the second reading is the same site observed
      // from the other side, and it reddens with the first (measured, not assumed).
      'and the unknown argument is listed',
    ],
  },
};

function buildMutant(name) {
  const spec = MUTANTS[name];
  if (spec === undefined) throw new Error(`unknown mutant: ${name}`);
  const root = join(SANDBOX, `mutant-${name}`);
  mkdirSync(join(root, 'tools'), { recursive: true });
  mkdirSync(join(root, 'lib'), { recursive: true });
  const source = readFileSync(SHIPPED_CLI, 'utf8');
  const sites = source.split(spec.find).length - 1;
  if (sites !== 1) throw new Error(`mutant ${name}: the anchor matches ${sites} site(s), expected exactly 1`);
  const mutated = source.replace(spec.find, spec.replace);
  writeFileSync(join(root, 'tools', 'native-toast.mjs'), mutated, 'utf8');
  copyFileSync(join(PLUGIN, 'lib', 'native-toast.js'), join(root, 'lib', 'native-toast.js'));
  return { path: join(root, 'tools', 'native-toast.mjs'), sites, mutated };
}

/* ------------------------------------------------------------------------ main */

const requested = process.argv.slice(2).filter((arg) => arg.startsWith('--mutant=')).map((arg) => arg.slice('--mutant='.length));
let exitCode = 0;

try {
  const cliBytes = readFileSync(SHIPPED_CLI);
  const cliSha = createHash('sha256').update(cliBytes).digest('hex');

  if (requested.length === 0 || requested.includes('all')) {
    console.log('### probe-23 · the native-toast CLI argument contract (shipped bytes)');
    console.log(`    · tools/native-toast.mjs = ${cliBytes.length} B / ${cliSha}`);
    const report = makeReport('probe-23 cli-args (shipped)');
    runContract(report, SHIPPED_CLI);
    const verdict = report.done();
    if (verdict.failed > 0) exitCode = 1;
    if (requested.length === 0) {
      console.log('    · 14 checks in the shipped run, 0 red expected. Falsifiability: --mutant=all (3 declared mutants)');
    }
  }

  const names = requested.includes('all') ? Object.keys(MUTANTS) : requested;
  for (const name of names) {
    console.log(`\n### probe-23 · MUTANT ${name}`);
    const mutant = buildMutant(name);
    console.log(`    · ${MUTANTS[name].what}`);
    console.log(`    · anchor matched exactly ${mutant.sites} site; copy = ${mutant.path}`);
    const report = makeReport(`probe-23 cli-args (mutant ${name})`);
    runContract(report, mutant.path, { skipInstall: true });
    const verdict = report.done();
    const declared = [...MUTANTS[name].expectedRed].sort();
    const observed = [...verdict.failedNames].sort();
    const exact = declared.length === observed.length && declared.every((item, index) => item === observed[index]);
    if (verdict.failed === 0) {
      console.log(`    MUTANT NOT CAUGHT: the mutation reddened nothing — these assertions are decoration.`);
      exitCode = 1;
    } else if (exact) {
      console.log(`    MUTANT CAUGHT exactly as declared (${observed.length} red, nothing else).`);
    } else {
      console.log(`    MUTANT CAUGHT, but the red set is NOT the declared one.`);
      console.log(`      declared: ${declared.join(' | ') || '(none)'}`);
      console.log(`      observed: ${observed.join(' | ') || '(none)'}`);
      exitCode = 1;
    }
  }
} finally {
  try { rmSync(SANDBOX, { recursive: true, force: true }); } catch { /* the sandbox is outside the plugin; a leftover copy is harmless */ }
}

console.log(`\nprobe-23 verdict: exit ${exitCode}`);
process.exit(exitCode);
