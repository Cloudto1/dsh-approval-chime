# dsh-approval-chime native toast: install the per-user registration. ASCII only.
#
# WHAT THIS DOES (rev-25 interface freeze page sections 1.4, 2, 4 and 5.4), all
# under HKEY_CURRENT_USER so it needs no administrator rights:
#
#   1. the protocol the toast buttons activate, + its shell\open\command, which
#      starts wscript.exe (GUI subsystem: no console window) with activate.vbs;
#   2. the product AUMID's DisplayName, which is what the notification header
#      shows - without it Windows renders the raw AUMID string (forbidden);
#   3. the install marker <DSH_HOME>\approval-chime\native-toast\installed.json,
#      which is the ONLY thing the Host reads to decide "installed".
#
# WHY NATIVE POWERSHELL AND NOT reg.exe (rev-25 repair H2, 2026-09-24):
# the third write carries a command line with embedded double quotes. PowerShell
# 5.1 re-quotes every argument it hands to a native program, so the value arrived
# at reg.exe mangled - on the user's real machine that one write FAILED with
# "ERROR: Invalid syntax." and the protocol handler ended up half registered
# (clicking the accept/reject buttons did nothing).
# `New-ItemProperty -Value $string` passes the string through untouched, because
# no command line is involved at all. NOTHING in this file shells out any more.
#
# It creates NO Start Menu shortcut: measured on Windows 11 25H2, an AUMID
# without any shortcut still delivers and still enters Action Center, and the
# header name comes from the AppUserModelId key written below.
#
# IDEMPOTENT: every write uses -Force (same value overwrites the same value) and
# the marker file is rewritten in place. Running this twice changes nothing.
#
# ASCII-only on purpose: Windows PowerShell 5.1 decodes a BOM-less UTF-8 script as
# ANSI, so the Chinese copy below is built from code points instead of literals.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1           # write it
#   powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -DryRun   # show it, write nothing
#   node tools/native-activate.mjs install [--dry-run]                       # same, from Node

param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Continue'

# "tong zhi ti xing" = the notification-reminder name the settings page shows.
$appName = 'DSH ' + (-join (@(0x901A, 0x77E5, 0x63D0, 0x9192) | ForEach-Object { [char]$_ }))
# "hui tian xie yi" = backfill protocol (the scheme's human-readable label).
$schemeLabel = 'URL:' + $appName + ' ' + (-join (@(0x56DE, 0x586B, 0x534F, 0x8BAE) | ForEach-Object { [char]$_ }))

$scheme = 'dsh-approval-chime'
$aumid = 'Dsh.ApprovalChime.NativeToast'
$appIdVersion = 1

if ([string]::IsNullOrEmpty($env:USERPROFILE)) {
    Write-Output '[FAIL] USERPROFILE is not set; cannot resolve the marker directory'
    exit 1
}

$pluginRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$shim = Join-Path $pluginRoot 'deploy\native-toast\activate.vbs'
if (-not (Test-Path -LiteralPath $wscript)) {
    Write-Output ('[FAIL] wscript.exe not found at ' + $wscript)
    exit 1
}
if (-not (Test-Path -LiteralPath $shim)) {
    Write-Output ('[FAIL] activation shim not found at ' + $shim)
    exit 1
}

# "%1" must stay quoted: the plugin directory contains a space. This exact string
# is what selftest.ps1 checks byte for byte, and what the freeze page section 2
# freezes.
$command = '"' + $wscript + '" "' + $shim + '" "%1"'
$schemeKey = 'HKCU:\Software\Classes\' + $scheme
$schemeQuery = 'HKCU\Software\Classes\' + $scheme
$aumidKey = 'HKCU:\Software\Classes\AppUserModelId\' + $aumid
$aumidQuery = 'HKCU\Software\Classes\AppUserModelId\' + $aumid
$dshHome = if ([string]::IsNullOrEmpty($env:DSH_HOME)) { Join-Path $env:USERPROFILE '.dsh' } else { $env:DSH_HOME }
$markerDir = Join-Path $dshHome 'approval-chime\native-toast'
$markerPath = Join-Path $markerDir 'installed.json'

# Failures are counted in a script-scoped variable, NEVER through a function's
# return value: in PowerShell everything a function writes to the success stream
# becomes its return value, so `$status += Do-Step` would swallow every plan line
# instead of printing it (this file's own self-test caught exactly that).
$script:failures = 0

# The default (unnamed) registry value, in the two spellings PowerShell needs:
# '(default)' addresses it through the provider, '' addresses it through .NET.
$defaultName = '(default)'

# CREATE-ONCE. `New-Item -Force` on a key that ALREADY EXISTS WIPES EVERY VALUE IT
# HOLDS (measured on the real machine by the captain, 2026-09-24: default +
# named value + subkey all gone, `reg query /s` empty afterwards). That is exactly
# how H3 shipped: the first write put the (default) value in, then the SECOND write
# to the same scheme key ran `New-Item -Force` again and erased it, so the final key
# held only `URL Protocol`. This helper therefore creates a key at most ONCE, and
# only when Test-Path says it is not there - never with -Force on an existing key.
$script:ensuredKeys = @()

function Ensure-RegKey {
    param([string]$Path)
    if ($script:ensuredKeys -contains $Path) { return $true }
    if (Test-Path -LiteralPath $Path) {
        $script:ensuredKeys += $Path
        return $true
    }
    if ($DryRun) {
        Write-Output ("[dry-run] New-Item -Path '" + $Path + "' -Force   (key does not exist yet; created once)")
        $script:ensuredKeys += $Path
        return $true
    }
    try {
        New-Item -Path $Path -Force -ErrorAction Stop | Out-Null
        $script:ensuredKeys += $Path
        return $true
    } catch {
        return $false
    }
}

# Read one value back with the SAME readers selftest.ps1 has: the provider's
# (default)/named property, and the raw .NET key. Returns a string, or $null when
# the value is not there. A false $null here is what turns a fake [ok] into a [FAIL].
function Read-RegValue {
    param(
        [string]$Path,
        [string]$Name
    )
    $lookup = if ($Name -eq '(default)') { '' } else { $Name }
    try {
        $providerKey = Get-Item -LiteralPath $Path -ErrorAction Stop
        $viaProvider = [string]$providerKey.GetValue($lookup, $null)
    } catch {
        $viaProvider = $null
    }
    try {
        $sub = $Path -replace '^HKCU:\\', ''
        $dotnetKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($sub, $false)
        if ($dotnetKey -eq $null) {
            $viaDotNet = $null
        } else {
            $viaDotNet = [string]$dotnetKey.GetValue($lookup, $null)
            $dotnetKey.Close()
        }
    } catch {
        $viaDotNet = $null
    }
    if ($viaProvider -ne $null) { return $viaProvider }
    return $viaDotNet
}

# Write ONE value and PROVE it landed by reading it back. The candidate chain is
# the point: a machine-independent implementation cannot be built on "no exception
# was thrown", because `New-ItemProperty` reports non-terminating errors that never
# enter a catch block - that is exactly how the H2 and H3 false [ok] lines shipped.
#
# The DEFAULT value is the hard one: on the user's real machine
# `New-ItemProperty -Name '(default)'` returned without throwing and left nothing
# behind (H3). So the default value is attempted in this order and each attempt is
# verified by read-back:
#   1. `Set-Item -Path <key> -Value <label>`   (the provider's own default-value setter)
#   2. `[Microsoft.Win32.Registry]` `SetValue('', ...)` (raw .NET, provider bypassed)
#   3. `New-ItemProperty -Name '(default)'`    (what H3 proved insufficient on its own)
# Named values use New-ItemProperty first, then the same raw .NET call.
# The chosen mechanism is therefore the FIRST ONE THAT READS BACK - decided on the
# machine that runs it, which is the only place the question can be answered.
function Set-RegValue {
    param(
        [string]$Path,
        [string]$Name,
        [string]$Value,
        [string]$Type = 'String'
    )
    # One line that carries all four things the freeze page pins - key path, value
    # name, type and data - AND the mechanism that will really run. It must not
    # describe something else: an output that misreports what happens is the same
    # class of defect as the false [ok] lines of H2/H3 (this text used to print a
    # bare `New-Item -Force`, which is exactly the call that wiped the key).
    $line = "Ensure-RegKey '" + $Path + "' (creates it ONLY if absent; never touches an existing key) ; write value: Name='" + $Name + "' Value='" + $Value + "' Type=" + $Type
    if ($DryRun) {
        Write-Output ('[dry-run] ' + $line)
        return
    }

    $lookup = if ($Name -eq '(default)') { '' } else { $Name }
    $sub = $Path -replace '^HKCU:\\', ''

    $setByProviderDefault = {
        Set-Item -Path $Path -Value $Value -ErrorAction Stop
    }
    $setByDotNet = {
        $dotnetKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($sub)
        $kind = if ($Type -eq 'String') { [Microsoft.Win32.RegistryValueKind]::String } else { [Microsoft.Win32.RegistryValueKind]::String }
        $dotnetKey.SetValue($lookup, $Value, $kind)
        $dotnetKey.Close()
    }
    $setByNewItemProperty = {
        New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType $Type -Force -ErrorAction Stop | Out-Null
    }

    if ((Ensure-RegKey -Path $Path) -ne $true) {
        Write-Output ('[FAIL] ' + $line)
        Write-Output ('       the key does not exist and could not be created: ' + $Path)
        $script:failures = $script:failures + 1
        return
    }

    if ($Name -eq '(default)') {
        $candidates = @(
            @{ Name = 'Set-Item -Value'; Write = $setByProviderDefault },
            @{ Name = 'Registry::SetValue('''')'; Write = $setByDotNet },
            @{ Name = 'New-ItemProperty (default)'; Write = $setByNewItemProperty }
        )
    } else {
        $candidates = @(
            @{ Name = 'New-ItemProperty'; Write = $setByNewItemProperty },
            @{ Name = 'Registry::SetValue'; Write = $setByDotNet }
        )
    }

    $used = $null
    foreach ($candidate in $candidates) {
        try {
            & $candidate.Write
        } catch {
            # a terminating error only rules this candidate out
        }
        if ((Read-RegValue -Path $Path -Name $Name) -ceq $Value) {
            $used = $candidate.Name
            break
        }
    }

    $actual = Read-RegValue -Path $Path -Name $Name
    if ($used -eq $null) {
        Write-Output ('[FAIL] ' + $line)
        Write-Output ('       write did not land: value [' + $Name + '] reads back as [' + [string]$actual + '] (tried: ' + (($candidates | ForEach-Object { $_.Name }) -join ', ') + ')')
        $script:failures = $script:failures + 1
        return
    }
    Write-Output ('[ok] ' + $line)
    Write-Output ('       read back via ' + $used + ': [' + [string]$actual + ']')
}

# 1. the protocol handler (freeze page section 2)
Set-RegValue -Path $schemeKey -Name $defaultName -Value $schemeLabel
Set-RegValue -Path $schemeKey -Name 'URL Protocol' -Value ''
Set-RegValue -Path ($schemeKey + '\shell\open\command') -Name $defaultName -Value $command

# 2. the AUMID's readable name (sections 1.4 and 15)
Set-RegValue -Path $aumidKey -Name 'DisplayName' -Value $appName

# 3. FINAL FULL CHECK (H3, captain's ruling 2026-09-24): read every value back
#    again, with TWO independent readers each, after all writes are done.
#    Row-by-row read-back is not enough: the H3 wipe happened on the NEXT line
#    (the second `New-Item -Force` on the same key), so only this pass can see it.
if (-not $DryRun) {
    Write-Output ''
    Write-Output '=== final full check (two readers per value, after all writes) ==='
    $expected = @(
        @{ Key = $schemeKey; Name = $defaultName; Value = $schemeLabel; Label = 'scheme (default)' },
        @{ Key = $schemeKey; Name = 'URL Protocol'; Value = ''; Label = 'scheme URL Protocol' },
        @{ Key = ($schemeKey + '\shell\open\command'); Name = $defaultName; Value = $command; Label = 'shell\open\command (default)' },
        @{ Key = $aumidKey; Name = 'DisplayName'; Value = $appName; Label = 'AUMID DisplayName' }
    )
    foreach ($item in $expected) {
        $lookup = if ($item.Name -eq $defaultName) { '' } else { $item.Name }
        $viaProvider = $null
        $viaDotNet = $null
        try {
            $viaProvider = [string](Get-Item -LiteralPath $item.Key -ErrorAction Stop).GetValue($lookup, $null)
        } catch {
            $viaProvider = $null
        }
        try {
            $dotnetKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey(($item.Key -replace '^HKCU:\\', ''), $false)
            if ($dotnetKey -ne $null) {
                $viaDotNet = [string]$dotnetKey.GetValue($lookup, $null)
                $dotnetKey.Close()
            }
        } catch {
            $viaDotNet = $null
        }
        $ok = ($viaProvider -ceq $item.Value) -and ($viaDotNet -ceq $item.Value)
        if ($ok) {
            Write-Output ('  [PASS] ' + $item.Label + ' = [' + $viaProvider + ']')
        } else {
            Write-Output ('  [FAIL] ' + $item.Label + ' expected [' + $item.Value + '] but provider reads [' + [string]$viaProvider + '] and .NET reads [' + [string]$viaDotNet + ']')
            $script:failures = $script:failures + 1
        }
    }
}

# 3. the install marker (section 5.4). Written WITHOUT a BOM: the Host parses it
#    with JSON.parse, and a BOM would make that throw.
$installedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
$marker = [ordered]@{
    version     = $appIdVersion
    aumid       = $aumid
    displayName = $appName
    scheme      = $scheme
    wscript     = $wscript
    powershell  = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')
    pluginDir   = $pluginRoot
    installedAt = $installedAt
}
$markerJson = ($marker | ConvertTo-Json -Compress)

if ($DryRun) {
    Write-Output ('[dry-run] write ' + $markerPath)
    Write-Output ('[dry-run]   ' + $markerJson)
    Write-Output ''
    Write-Output 'Dry run only: nothing was written.'
    exit 0
}

try {
    if (-not (Test-Path -LiteralPath $markerDir)) {
        New-Item -ItemType Directory -Path $markerDir -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($markerPath, $markerJson, (New-Object System.Text.UTF8Encoding($false)))
    Write-Output ('[ok] wrote ' + $markerPath)
} catch {
    Write-Output ('[FAIL] could not write ' + $markerPath + ': ' + $_.Exception.Message)
    $script:failures = $script:failures + 1
}

Write-Output ''
Write-Output 'Read-only check (paste it anywhere; it writes nothing):'
Write-Output ('  reg.exe query "' + $schemeQuery + '" /s')
Write-Output ('  reg.exe query "' + $aumidQuery + '"')
Write-Output ('  powershell -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $pluginRoot 'deploy\native-toast\selftest.ps1') + '"')
if ($script:failures -eq 0) {
    Write-Output 'Installed. The notification header must read: ' + $appName
    exit 0
}
Write-Output 'Finished with failures; see the [FAIL] lines above.'
exit 1
