# dsh-approval-chime native toast worker: show one toast, or remove one. ASCII only.
#
# WHAT THIS IS: the only WinRT call in this feature. The Host starts it with
#   -NoProfile -NonInteractive -ExecutionPolicy Bypass -File raise.ps1 `
#     -Aumid <AUMID> -XmlPath <file> -Tag <appr-xxxxxxxxxxx> -Group dsh-approval-chime
# (windowsHide, stdio ignored) and waits at most 5 seconds (interface freeze page
# sections 5.1, 7 and 10).
#
# The toast XML - title, body, both button captions, both activation URIs, the
# token and the port - always arrives in a FILE. Nothing user-visible is compiled
# into this script, which is also why it can stay ASCII-only: Windows PowerShell
# 5.1 decodes a BOM-less UTF-8 script as ANSI, so a Chinese literal here would
# become mojibake and the toast XML would then fail LoadXml with 0xC00CE56D.
#
# Exit codes:
#   0 = the toast was accepted by the platform (or a removal succeeded)
#   5 = the platform call failed
#   6 = the arguments are unusable
#
# `-Remove` is the same script on purpose: the removal path needs exactly the
# same WinRT types, and one worker means one thing to review.

param(
    [string]$Aumid = 'Dsh.ApprovalChime.NativeToast',
    [string]$XmlPath = '',
    [string]$Tag = '',
    [string]$Group = 'dsh-approval-chime',
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'

try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
} catch {
    exit 5
}

if ($Remove) {
    if ($Tag -eq '') { exit 6 }
    # Best effort by contract: the answer that was already delivered does not
    # depend on this, so a failed removal is not a failure of anything.
    try {
        [Windows.UI.Notifications.ToastNotificationManager]::History.Remove($Tag, $Group, $Aumid)
    } catch {
        # ignored on purpose
    }
    exit 0
}

if ($XmlPath -eq '') { exit 6 }
if (-not (Test-Path -LiteralPath $XmlPath)) { exit 6 }
if ($Tag -eq '') { exit 6 }

try {
    $xmlText = [System.IO.File]::ReadAllText($XmlPath, [System.Text.Encoding]::UTF8)
} catch {
    exit 6
}

try {
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
    [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null

    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($xmlText)

    $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
    $toast.Tag = $Tag
    $toast.Group = $Group
    # The same 10 minutes the token and the answer file live (the one TTL).
    $toast.ExpirationTime = [DateTimeOffset]::Now.AddMinutes(10)

    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($Aumid).Show($toast)
    exit 0
} catch {
    exit 5
}
