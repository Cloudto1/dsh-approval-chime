#!/usr/bin/env node
/**
 * The native-toast command line: `status`, `install`, `uninstall`, `selftest`.
 *
 * ⚠️ REBUILT 2026-10-02 — THIS IS NOT THE ORIGINAL FILE.
 *
 * The 2026-10-01 `robocopy /MIR` write-through destroyed the plugin's `tools\`
 * directory, and the handoff records it as unrecoverable: it was never committed
 * to git and no copy exists on this machine (verified: the directory is absent and
 * a name search over the workspace and `~/.dsh` finds nothing). What survives is
 * the BEHAVIOURAL CONTRACT the rev-29 suite exercised, pinned line by line in
 * `.scratch/r29-release/suite-native-toast.txt` §13:
 *
 *   - `status` exits 0 and prints the frozen identity, starting with the line
 *     `plugin home      : <DSH_HOME>` and naming the AUMID and the app name as the
 *     PLUGIN itself declares them (not as literals of this file);
 *   - an unknown command is a usage error: exit 2;
 *   - `install`/`uninstall` (optionally `--dry-run`) run the deploy script and
 *     EXIT WITH ITS STATUS, so a dry run that succeeds is 0 and a real run that
 *     fails is non-zero.
 *
 * Those three points are the acceptance criteria for this reconstruction. Anything
 * beyond them (extra subcommands, formatting) is this rebuild's own choice, and
 * the original's exact wording for them is unknowable.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  NATIVE_TOAST_APP_NAME,
  NATIVE_TOAST_AUMID,
  NATIVE_TOAST_MARKER,
  NATIVE_TOAST_SCHEME,
  nativeToastDirectory,
  nativeToastHome,
  nativeToastMarkerPath,
  nativeToastScriptPath,
  windowsPowerShellPath,
} from '../lib/native-toast.js';

const [command, ...rest] = process.argv.slice(2);

/**
 * t8 items 11/12 · the CLI refuses what it does not understand instead of guessing.
 *
 * "-DryRun" is PowerShell's own spelling and means the same thing here: a flag that was
 * meant to make a run harmless must never be the reason a REAL run happens (that was the
 * finding: "install -DryRun" really wrote the registry). An argument this file does not
 * know is listed and answered with exit 2.
 *
 * "selftest" is the one command with NO dry-run mode: selftest.ps1 declares no -DryRun
 * parameter, and Windows PowerShell 5.1 silently DROPS an undeclared switch — so promising
 * a rehearsal and delivering a real toast is exactly what used to happen. It is refused
 * here, with the two ways to get what the user actually wanted.
 */
const DRY_RUN_FLAGS = ['--dry-run', '-DryRun'];
const KNOWN_COMMANDS = ['status', 'install', 'uninstall', 'selftest'];
const dryRun = rest.some((flag) => DRY_RUN_FLAGS.includes(flag));
const unknownFlags = rest.filter((flag) => !DRY_RUN_FLAGS.includes(flag));
const home = nativeToastHome();

/** The identity block: every value comes from the plugin, never from a literal here. */
function printIdentity() {
  console.log(`plugin home      : ${home}`);
  console.log(`backfill dir     : ${nativeToastDirectory(home)}`);
  console.log(`aumid            : ${NATIVE_TOAST_AUMID}`);
  console.log(`app name         : ${NATIVE_TOAST_APP_NAME}`);
  console.log(`scheme           : ${NATIVE_TOAST_SCHEME}`);
  console.log(`marker           : ${nativeToastMarkerPath(home)}`);
  console.log(`installed        : ${existsSync(nativeToastMarkerPath(home)) ? `yes (${NATIVE_TOAST_MARKER})` : 'no'}`);
}

function usage() {
  console.error('usage: native-toast.mjs <status|install|uninstall|selftest> [--dry-run]');
  console.error('       --dry-run (also accepted as -DryRun) is handed to install.ps1 / uninstall.ps1');
  console.error('       selftest has NO dry-run mode: it always raises one real test notification');
  console.error('       deploy scripts live in ' + dirname(nativeToastScriptPath('install.ps1')));
}

if (typeof command !== 'string' || command.length === 0 || !KNOWN_COMMANDS.includes(command)) {
  if (typeof command === 'string' && command.length > 0) console.error('unknown command: ' + command);
  usage();
  process.exit(2);
}
if (unknownFlags.length > 0) {
  console.error('unknown argument(s): ' + unknownFlags.join(', '));
  usage();
  process.exit(2);
}
if (command === 'selftest' && dryRun) {
  console.error('selftest has NO dry-run mode: it always raises one real test notification.');
  console.error('deploy/native-toast/selftest.ps1 declares no -DryRun parameter, and Windows PowerShell');
  console.error('silently drops an undeclared switch — passing it would raise the toast anyway.');
  console.error('Run "node tools/native-toast.mjs selftest" to do it for real, or');
  console.error('"node tools/native-toast.mjs status" for a read-only check that raises nothing.');
  process.exit(2);
}

/** Run one deploy script and hand its exit status back to the caller. */
function runScript(name) {
  const powershell = windowsPowerShellPath();
  if (typeof powershell !== 'string' || powershell.length === 0 || !existsSync(powershell)) {
    console.error(`no PowerShell interpreter found; run ${nativeToastScriptPath(name)} by hand`);
    return 1;
  }
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', nativeToastScriptPath(name)];
  if (dryRun) args.push('-DryRun');
  // `inherit` on purpose: the CLI is a pass-through, and a Windows PowerShell child
  // writing into a pipe is what the deploy scripts avoid by design (native powershell
  // provider, no `reg.exe`). The suite that drives this reads the plan from a file.
  const result = spawnSync(powershell, args, { stdio: 'inherit' });
  return typeof result.status === 'number' ? result.status : 1;
}

switch (command) {
  case 'status':
    printIdentity();
    process.exit(0);
    break;
  case 'install':
    process.exit(runScript('install.ps1'));
    break;
  case 'uninstall':
    process.exit(runScript('uninstall.ps1'));
    break;
  case 'selftest':
    process.exit(runScript('selftest.ps1'));
    break;
  default:
    // Unreachable: the command is validated above. Kept so a future edit that adds a case
    // without extending KNOWN_COMMANDS still fails loudly instead of falling through.
    usage();
    process.exit(2);
}
