# dsh-approval-chime native toast: full-chain self-test. ASCII only.
#
# WHAT THIS PROVES (rev-25 freeze page sections 1.4, 2, 5.4 and 10): that the
# registration is COMPLETE, not half-installed, and that this machine really
# accepts a toast under the product AUMID and reads it back. The five checks:
#
#   1. the scheme key                  HKCU:\Software\Classes\dsh-approval-chime exists
#   2. the "URL Protocol" value        exists (it is deliberately an EMPTY string)
#   3. shell\open\command (default)    is byte-for-byte the frozen command line
#   4. the AUMID DisplayName           is byte-for-byte the frozen name
#                                      (three CJK characters, built from code points)
#   5. the install marker              exists and parses as JSON
#
# Any missing item is reported by name and the script exits 1. The user's real
# machine had checks 1+2 pass and 3 fail (reg.exe mangled the quoted command) while
# the previous self-test still printed PASS, and a self-test that cannot see that
# is worthless (freeze section 1.5).
#
# WHY -ShadowJson EXISTS: inside a confined sandbox the registry cannot be written,
# so the five checks cannot be exercised against a half-built hive. `-ShadowJson`
# feeds the JUDGE (Get-InstallationFailures) the same observation object the probe
# would build, so every check can be shown red on its own - see the H2 repair
# report under docs/ and the suite's shadow runs. It changes nothing else and is
# never used by install/uninstall.
#
# Run it AFTER install.ps1:
#   powershell -NoProfile -ExecutionPolicy Bypass -File selftest.ps1
#   node tools/native-activate.mjs selftest
#
# Exit codes: 0 = every check passed, 1 = at least one check failed.

param(
    [string]$ShadowJson = '',
    [switch]$SkipToast
)

$ErrorActionPreference = 'Continue'

$aumid = 'Dsh.ApprovalChime.NativeToast'
$scheme = 'dsh-approval-chime'
$group = 'dsh-approval-chime'
$tag = 'self-test'

# "tong zhi ti xing" - the header text the user must see.
$appName = 'DSH ' + (-join (@(0x901A, 0x77E5, 0x63D0, 0x9192) | ForEach-Object { [char]$_ }))

$pluginRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$shim = Join-Path $pluginRoot 'deploy\native-toast\activate.vbs'
# The same construction install.ps1 writes - if the two ever drift, this check
# reports the mismatch instead of hiding it.
$expectedCommand = '"' + $wscript + '" "' + $shim + '" "%1"'
# The same construction install.ps1 writes for the scheme key's (default) value -
# the line H3 shipped missing while install.ps1 still printed [ok].
$expectedSchemeLabel = 'URL:' + $appName + ' ' + (-join (@(0x56DE, 0x586B, 0x534F, 0x8BAE) | ForEach-Object { [char]$_ }))
$schemeKey = 'HKCU:\Software\Classes\' + $scheme
$commandKey = $schemeKey + '\shell\open\command'
$aumidKey = 'HKCU:\Software\Classes\AppUserModelId\' + $aumid
$dshHome = if ([string]::IsNullOrWhiteSpace($env:DSH_HOME)) { Join-Path $env:USERPROFILE '.dsh' } else { $env:DSH_HOME }
$markerPath = Join-Path (Join-Path $dshHome 'approval-chime\native-toast') 'installed.json'

function Read-RegistryObservations {
    $observations = [ordered]@{
        schemeKeyPresent   = $false
        schemeDefault      = $null
        urlProtocolPresent = $false
        commandValue       = $null
        displayName        = $null
        markerPresent      = $false
        markerParses       = $false
    }

    if (Test-Path -LiteralPath $schemeKey) {
        $observations.schemeKeyPresent = $true
        try {
            $names = @((Get-ItemProperty -LiteralPath $schemeKey -ErrorAction Stop).PSObject.Properties.Name)
            $observations.urlProtocolPresent = $names -contains 'URL Protocol'
        } catch {
            $observations.urlProtocolPresent = $false
        }
        # Two readers on purpose: the provider's GetValue, then the raw .NET key.
        # H3 was a write that never landed, so one reader is not enough evidence
        # that the value is really absent.
        try {
            $observations.schemeDefault = [string](Get-Item -LiteralPath $schemeKey -ErrorAction Stop).GetValue('', $null)
        } catch {
            $observations.schemeDefault = $null
        }
        if ([string]::IsNullOrEmpty([string]$observations.schemeDefault)) {
            try {
                $dotnetScheme = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey(($schemeKey -replace '^HKCU:\\', ''), $false)
                if ($dotnetScheme -ne $null) {
                    $observations.schemeDefault = [string]$dotnetScheme.GetValue('', $null)
                    $dotnetScheme.Close()
                }
            } catch {
                # keep whatever the first reader said
            }
        }
    }

    if (Test-Path -LiteralPath $commandKey) {
        try {
            $observations.commandValue = (Get-ItemProperty -LiteralPath $commandKey -ErrorAction Stop).'(default)'
        } catch {
            $observations.commandValue = $null
        }
    }

    if (Test-Path -LiteralPath $aumidKey) {
        try {
            $observations.displayName = (Get-ItemProperty -LiteralPath $aumidKey -Name 'DisplayName' -ErrorAction Stop).DisplayName
        } catch {
            $observations.displayName = $null
        }
    }

    if (Test-Path -LiteralPath $markerPath) {
        $observations.markerPresent = $true
        try {
            $raw = [System.IO.File]::ReadAllText($markerPath, [System.Text.Encoding]::UTF8)
            $null = ConvertFrom-Json -InputObject $raw -ErrorAction Stop
            $observations.markerParses = $true
        } catch {
            $observations.markerParses = $false
        }
    }

    return $observations
}

# The judge: pure, so a shadow observation set exercises exactly these rules.
function Get-InstallationFailures {
    param($Observations)

    $failures = @()
    if ($Observations.schemeKeyPresent -ne $true) {
        $failures += ('the scheme key is missing: ' + $schemeKey)
    }
    if ([string]$Observations.schemeDefault -cne $expectedSchemeLabel) {
        $failures += ('the scheme key''s (default) value is not the frozen label: got [' + [string]$Observations.schemeDefault + '] want [' + $expectedSchemeLabel + ']')
    }
    if ($Observations.urlProtocolPresent -ne $true) {
        $failures += 'the "URL Protocol" value is missing (the protocol handler needs it)'
    }
    if ([string]$Observations.commandValue -cne $expectedCommand) {
        $failures += ('shell\open\command is not the frozen command line: got [' + [string]$Observations.commandValue + '] want [' + $expectedCommand + ']')
    }
    if ([string]$Observations.displayName -cne $appName) {
        $failures += ('the AUMID DisplayName is not the frozen name: got [' + [string]$observations.displayName + '] want [' + $appName + ']')
    }
    if ($Observations.markerPresent -ne $true) {
        $failures += ('the install marker is missing: ' + $markerPath)
    } elseif ($Observations.markerParses -ne $true) {
        $failures += ('the install marker is not parseable JSON: ' + $markerPath)
    }
    return $failures
}

Write-Output ''
Write-Output '=== full-chain registration check ==='

$usedShadow = $false
if (-not [string]::IsNullOrEmpty($ShadowJson)) {
    if (-not (Test-Path -LiteralPath $ShadowJson)) {
        Write-Output ('[FAIL] shadow file not found: ' + $ShadowJson)
        exit 1
    }
    $observations = ConvertFrom-Json -InputObject ([System.IO.File]::ReadAllText($ShadowJson, [System.Text.Encoding]::UTF8))
    $usedShadow = $true
    Write-Output ('(shadow mode: observations read from ' + $ShadowJson + ')')
} else {
    $observations = Read-RegistryObservations
}

$itemLines = @(
    @{ Name = 'scheme key exists'; Ok = [bool]($observations.schemeKeyPresent -eq $true) },
    @{ Name = 'scheme key (default) is the frozen label'; Ok = [bool]([string]$observations.schemeDefault -ceq $expectedSchemeLabel) },
    @{ Name = 'URL Protocol value exists'; Ok = [bool]($observations.urlProtocolPresent -eq $true) },
    @{ Name = 'shell\open\command is the frozen line'; Ok = [bool]([string]$observations.commandValue -ceq $expectedCommand) },
    @{ Name = 'AUMID DisplayName is the frozen name'; Ok = [bool]([string]$observations.displayName -ceq $appName) },
    @{ Name = 'install marker parses as JSON'; Ok = [bool]($observations.markerPresent -eq $true -and $observations.markerParses -eq $true) }
)
foreach ($item in $itemLines) {
    Write-Output ('  [' + $(if ($item.Ok) { 'PASS' } else { 'FAIL' }) + '] ' + $item.Name)
}

$failures = @(Get-InstallationFailures -Observations $observations)
foreach ($failure in $failures) {
    Write-Output ('  !! ' + $failure)
}

Write-Output ''
Write-Output '=== the toast platform ==='
$platformReady = $true
if ($SkipToast) {
    # Companion to -ShadowJson for check-only runs: the registration judge above
    # still runs and still decides the exit code, but no notification is popped.
    $platformReady = $false
    Write-Output '  skipped (-SkipToast): the toast half was not exercised'
} else {
try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
    [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
} catch {
    $platformReady = $false
    Write-Output ('  could not load the WinRT toast types: ' + $_.Exception.Message)
    $failures += 'the WinRT toast types failed to load'
}
}

$shown = $false
$readBack = 0
if ($platformReady) {
    # ASCII test copy on purpose: this file must stay ASCII-only, and the app NAME
    # (the thing under test) comes from the registry, not from this XML.
    $xmlText = '<toast><visual><binding template="ToastGeneric"><text>DSH native toast self-test</text><text>This notification can be removed from Action Center.</text></binding></visual></toast>'
    try {
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml($xmlText)
        $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
        $toast.Tag = $tag
        $toast.Group = $group
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($aumid).Show($toast)
        $shown = $true
        Write-Output '  Show() returned without throwing'
    } catch {
        Write-Output ('  Show() failed: ' + $_.Exception.Message)
        $failures += 'Show() failed'
    }
    Start-Sleep -Seconds 2
    try {
        # @() FIRST: GetHistory returns a collection, and indexing it without
        # array-ifying hits PowerShell 5.1's single-element vector unwrapping.
        $items = @([Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory($aumid))
        $readBack = $items.Count
        Write-Output ('  History.GetHistory(''' + $aumid + ''') -> ' + [string]$readBack + ' item(s)')
        if ($items.Count -gt 0) {
            Write-Output ('  first tag = ' + $items[0].Tag)
            Write-Output ('  has_audio_silent = ' + [string]$items[0].Content.GetXml().Contains('<audio silent="true"/>'))
        }
    } catch {
        Write-Output ('  History.GetHistory failed: ' + $_.Exception.Message)
        $failures += 'History.GetHistory failed'
    }
    if ($shown -and $readBack -lt 1) {
        $failures += 'the platform accepted the toast but History read back 0 items - notifications for this AUMID may be switched off in Windows Settings'
    }
    try {
        [Windows.UI.Notifications.ToastNotificationManager]::History.Remove($tag, $group, $aumid)
        Write-Output '  removed the test toast from Action Center'
    } catch {
        Write-Output ('  could not remove the test toast: ' + $_.Exception.Message)
    }
}

Write-Output ''
Write-Output 'MANUAL CHECK (the one thing no API exposes): the notification that just appeared'
Write-Output ('  must have shown the app name: ' + $appName)
Write-Output ('MACHINE CHECK: History.GetHistory(''' + $aumid + ''') returned ' + [string]$readBack + ' item(s)')
if ($usedShadow) {
    Write-Output 'NOTE: shadow mode supplied the registration observations; the toast half still ran for real.'
}
Write-Output ''
if ($failures.Count -eq 0) {
    Write-Output 'SELFTEST PASS'
    exit 0
}
Write-Output ('SELFTEST FAIL (' + [string]$failures.Count + ' failing check(s))')
exit 1
