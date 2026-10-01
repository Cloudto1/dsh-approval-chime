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
const dryRun = rest.includes('--dry-run');
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
    console.error('usage: native-toast.mjs <status|install|uninstall|selftest> [--dry-run]');
    console.error(`       deploy scripts live in ${dirname(nativeToastScriptPath('install.ps1'))}`);
    process.exit(2);
}
