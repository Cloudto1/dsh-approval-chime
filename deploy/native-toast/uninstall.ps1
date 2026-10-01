# dsh-approval-chime native toast: remove the per-user registration. ASCII only.
#
# WHAT THIS REMOVES (rev-25 interface freeze page sections 1.4, 2, 4, 6.6):
#   1. HKCU\Software\Classes\dsh-approval-chime              (the protocol + its command)
#   2. HKCU\Software\Classes\AppUserModelId\<the product AUMID>
#   3. <DSH_HOME>\approval-chime\native-toast\installed.json and that directory
#      (answer files and markers left over from a previous run)
#   4. our own toasts in Action Center, via History.Clear(AUMID)
#
# It leaves everything else alone: no Start Menu shortcut was ever created, no
# HKLM key was ever written, and the app name key it deletes is the product's own.
#
# IDEMPOTENT: deleting a key that is not there is not an error. Running this twice
# exits 0 both times.
#
# ASCII-only on purpose: Windows PowerShell 5.1 decodes a BOM-less UTF-8 script as
# ANSI, so non-ASCII literals here would arrive as mojibake.
#
# reg.exe AUDIT (rev-25 repair H2, 2026-09-24): install.ps1 had to stop using
# reg.exe because PowerShell re-quotes every argument it hands to a native program,
# which mangled the one value that contains double quotes and made reg.exe answer
# "Invalid syntax" (the user's real machine). THIS FILE IS NOT EXPOSED TO THAT:
# it only ever passes reg.exe a KEY PATH - `reg query <key>` and `reg delete <key>
# /f` - and never writes a VALUE, so there is no quoted data to mangle. The paths
# carry no spaces or quotes. Switching it to the provider (`Remove-Item`) would
# work too, but the probe-then-delete pair is what the read-only evidence and the
# "deleting an absent key is not an error" guarantee are built on, so it stays.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File uninstall.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File uninstall.ps1 -DryRun
#   node tools/native-activate.mjs uninstall [--dry-run]

param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Continue'

$aumid = 'Dsh.ApprovalChime.NativeToast'
$schemeKey = 'HKCU\Software\Classes\dsh-approval-chime'
$aumidKey = 'HKCU\Software\Classes\AppUserModelId\' + $aumid
$dshHome = if ([string]::IsNullOrEmpty($env:DSH_HOME)) { Join-Path $env:USERPROFILE '.dsh' } else { $env:DSH_HOME }
$markerDir = Join-Path $dshHome 'approval-chime\native-toast'
$markerPath = Join-Path $markerDir 'installed.json'

# Failures are counted in a script-scoped variable, NEVER through a function's
# return value: everything a PowerShell function writes to the success stream
# becomes its return value, so `$status += Do-Step` would swallow the script's own
# output (install.ps1's self-test caught exactly that bug).
$script:failures = 0

function Remove-RegKey {
    param([string]$Key)
    if ($DryRun) {
        Write-Output ('[dry-run] reg.exe query "' + $Key + '"  &&  reg.exe delete "' + $Key + '" /f   (deletes only if present)')
        return
    }
    & reg.exe query $Key 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        # Absent is the desired end state, not a failure.
        Write-Output ('[skip] already absent: ' + $Key)
        return
    }
    & reg.exe delete $Key /f | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Output ('[ok] deleted ' + $Key)
        return
    }
    Write-Output ('[FAIL] reg.exe delete ' + $Key)
    $script:failures = $script:failures + 1
}

Remove-RegKey $schemeKey
Remove-RegKey $aumidKey

if ($DryRun) {
    Write-Output ('[dry-run] remove ' + $markerPath + ' and the directory ' + $markerDir)
    Write-Output ('[dry-run] History.Clear("' + $aumid + '") for our own toasts only')
    Write-Output ''
    Write-Output 'Dry run only: nothing was removed.'
    exit 0
}

# The marker directory holds only our own files (installed.json, <token>.json,
# raise-<token>.xml): the Host owns it end to end.
if (Test-Path -LiteralPath $markerPath) {
    Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $markerPath) {
        Write-Output ('[FAIL] could not remove ' + $markerPath)
        $script:failures = $script:failures + 1
    } else {
        Write-Output ('[ok] removed ' + $markerPath)
    }
} else {
    Write-Output ('[skip] already absent: ' + $markerPath)
}
if (Test-Path -LiteralPath $markerDir) {
    Remove-Item -LiteralPath $markerDir -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $markerDir) {
        Write-Output ('[warn] directory not empty yet: ' + $markerDir)
    } else {
        Write-Output ('[ok] removed directory ' + $markerDir)
    }
}

# Our own notifications only: History.Clear is scoped by application id.
try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.UI.Notifications.ToastNotificationManager]::History.Clear($aumid)
    Write-Output ('[ok] cleared Action Center history for ' + $aumid)
} catch {
    Write-Output ('[warn] could not clear Action Center history: ' + $_.Exception.Message)
}

Write-Output ''
Write-Output 'Read-only check (both must report that the key does not exist):'
Write-Output ('  reg.exe query "' + $schemeKey + '"')
Write-Output ('  reg.exe query "' + $aumidKey + '"')
if ($script:failures -eq 0) {
    exit 0
}
exit 1
