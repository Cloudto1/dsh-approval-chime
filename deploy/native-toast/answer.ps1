# dsh-approval-chime native toast activator worker. ASCII only.
#
# WHAT THIS IS: the worker the activate.vbs shim starts (hidden) with the full
# activation URI. It parses and validates that URI, then records the user's
# answer through the Host's own route (rev-25 interface freeze page, sections
# 3.2 and 3.3). It prints nothing, opens no window, writes no file and keeps no
# log: the exit code is the only record.
#
#   -Uri "dsh-approval-chime://answer/?t=<32 lowercase hex>&a=<allow|reject>&p=<1..65535>"
#
# Exit codes (section 3.3):
#   0 = the Host answered 200 and recorded the answer
#   2 = the arguments are not a well-formed activation URI
#   3 = the Host refused (404 unknown/expired token, 409 already answered, ...)
#   4 = the request never reached the Host
#
# This file is ASCII-only on purpose: Windows PowerShell 5.1 decodes a BOM-less
# UTF-8 script as ANSI, so any non-ASCII literal here would arrive mojibake.

param(
    [string]$Uri = ''
)

$ErrorActionPreference = 'Stop'

if ($Uri -eq '') { exit 2 }

try {
    $parsed = [System.Uri]$Uri
} catch {
    exit 2
}

if ($parsed.Scheme -cne 'dsh-approval-chime') { exit 2 }
if ($parsed.Host -cne 'answer') { exit 2 }

# Parse the query by hand: no System.Web dependency, and the token vocabulary is
# deliberately tiny (section 3.2).
$query = @{}
$raw = $parsed.Query
if ($raw.StartsWith('?')) { $raw = $raw.Substring(1) }
foreach ($pair in $raw.Split('&')) {
    if ($pair -eq '') { continue }
    $split = $pair.Split('=', 2)
    if ($split.Length -ne 2) { continue }
    $query[$split[0]] = [System.Uri]::UnescapeDataString($split[1])
}

$token = [string]$query['t']
$action = [string]$query['a']
$portText = [string]$query['p']

if ($token -cnotmatch '^[0-9a-f]{32}$') { exit 2 }
if ($action -cne 'allow' -and $action -cne 'reject') { exit 2 }

$port = 0
if (-not [int]::TryParse($portText, [ref]$port)) { exit 2 }
if ($port -lt 1 -or $port -gt 65535) { exit 2 }

# The click means exactly what the in-page button means: allow -> allowed-once.
if ($action -eq 'allow') { $answer = 'allowed-once' } else { $answer = 'rejected' }

# Loopback only, hard-coded: the URI carries a port, never a host.
$url = 'http://127.0.0.1:' + [string]$port + '/api/approval-chime/native-toast/answer'
$body = '{"token":"' + $token + '","answer":"' + $answer + '"}'
$bytes = [System.Text.Encoding]::UTF8.GetBytes($body)

try {
    $request = [System.Net.HttpWebRequest]::Create($url)
    $request.Method = 'POST'
    $request.ContentType = 'application/json'
    $request.Timeout = 3000
    $request.ContentLength = $bytes.Length
    $stream = $request.GetRequestStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
    $response = $request.GetResponse()
    $code = [int]$response.StatusCode
    $response.Close()
    if ($code -eq 200) { exit 0 }
    exit 3
} catch {
    # A 404/409 arrives as a WebException that still carries a response.
    if ($_.Exception.Response -ne $null) { exit 3 }
    exit 4
}
