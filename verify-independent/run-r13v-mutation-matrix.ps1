# r13v — independent mutation matrix (task t3, verifier).
#
# Runs ALL 18 declared mutants, each in its OWN node process, and archives the raw output
# under verify-independent/_raw/r13v-*.txt. Nothing here trusts t2's table: the declarations
# are re-parsed from the probe bytes (r13v-declaration-parse.mjs) and the observed red sets
# are re-read from these logs (r13v-check-matrix.mjs).
#
# Frozen-path hashes are sampled before and after so the matrix itself is provably read-only.
#
#   powershell -ExecutionPolicy Bypass -File verify-independent/run-r13v-mutation-matrix.ps1

$ErrorActionPreference = 'Continue'

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
try { [Console]::OutputEncoding = $utf8NoBom } catch { }

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$plugin = Split-Path -Parent $here
$raw = Join-Path $here '_raw'
New-Item -ItemType Directory -Force -Path $raw | Out-Null

function Invoke-Logged {
  param([scriptblock]$Body, [string]$LogPath)
  $text = & $Body 2>&1 | Out-String
  [System.IO.File]::WriteAllText($LogPath, $text, $utf8NoBom)
  return $LASTEXITCODE
}

function Get-Sha {
  param([string]$Path)
  return (Get-FileHash $Path -Algorithm SHA256).Hash
}

$guardPaths = @(
  (Join-Path $plugin 'lib\client.js'),
  (Join-Path $plugin 'lib\index.js'),
  (Join-Path $here 'probe-11-r4-css-rows.mjs'),
  (Join-Path $here 'probe-17-r7-section.mjs'),
  (Join-Path $here 'probe-18-r10-sessions.mjs'),
  (Join-Path $here 'probe-19-r12-select-parity.mjs')
)
$before = @{}
foreach ($path in $guardPaths) { $before[$path] = Get-Sha $path }

$cases = @(
  @{ probe = 'probe-11-r4-css-rows.mjs';   mutation = 'card-cap-92px' },
  @{ probe = 'probe-17-r7-section.mjs';    mutation = 'slot' },
  @{ probe = 'probe-17-r7-section.mjs';    mutation = 'order' },
  @{ probe = 'probe-17-r7-section.mjs';    mutation = 'heading' },
  @{ probe = 'probe-17-r7-section.mjs';    mutation = 'picker' },
  @{ probe = 'probe-17-r7-section.mjs';    mutation = 'rogue' },
  @{ probe = 'probe-18-r10-sessions.mjs';  mutation = 'mute-ignored' },
  @{ probe = 'probe-18-r10-sessions.mjs';  mutation = 'unmute-writes-true' },
  @{ probe = 'probe-18-r10-sessions.mjs';  mutation = 'batch-gap-zero' },
  @{ probe = 'probe-18-r10-sessions.mjs';  mutation = 'session-id-constant' },
  @{ probe = 'probe-18-r10-sessions.mjs';  mutation = 'custom-tone-no-fallback' },
  @{ probe = 'probe-18-r10-sessions.mjs';  mutation = 'batch-merge-first-only' },
  @{ probe = 'probe-18-r10-sessions.mjs';  mutation = 'evict-newest-first' },
  @{ probe = 'probe-18-r10-sessions.mjs';  mutation = 'convergence-reread-removed' },
  @{ probe = 'probe-18-r10-sessions.mjs';  mutation = 'home-blank-accepted' },
  @{ probe = 'probe-19-r12-select-parity.mjs'; mutation = 'popover-dropped-from-shared-picker' },
  @{ probe = 'probe-19-r12-select-parity.mjs'; mutation = 'popover-list-resplit-12px' },
  @{ probe = 'probe-19-r12-select-parity.mjs'; mutation = 'popover-cap-loses-one-row' }
)

Write-Host ("r13v mutation matrix: {0} mutants, one node process each" -f $cases.Count)
Push-Location $here
$lines = @()
$index = 0
foreach ($case in $cases) {
  $index += 1
  $base = [System.IO.Path]::GetFileNameWithoutExtension($case.probe)
  $log = Join-Path $raw ("r13v-mut-{0}-{1}.txt" -f $base, $case.mutation)
  $code = Invoke-Logged -Body { & node $case.probe "--mutate=$($case.mutation)" } -LogPath $log
  Write-Host ("{0,2}. {1,-6} {2,-34} exit={3}" -f $index, ($case.probe -replace '^probe-([0-9]+).*', 'p$1'), $case.mutation, $code)
  $lines += ("{0}`t{1}`t{2}`t{3}" -f $case.probe, $case.mutation, $code, $log)
}

# The group modes the canonical runner uses, archived separately for comparison.
foreach ($group in @(
    @{ probe = 'probe-18-r10-sessions.mjs'; tag = 'all' },
    @{ probe = 'probe-19-r12-select-parity.mjs'; tag = 'all' },
    @{ probe = 'probe-11-r4-css-rows.mjs'; tag = 'list' })) {
  if ($group.tag -eq 'list') {
    $log = Join-Path $raw ("r13v-group-{0}-list.txt" -f [System.IO.Path]::GetFileNameWithoutExtension($group.probe))
    $code = Invoke-Logged -Body { & node $group.probe '--list-mutations' } -LogPath $log
    Write-Host ("      {0} --list-mutations exit={1}" -f $group.probe, $code)
    continue
  }
  $base = [System.IO.Path]::GetFileNameWithoutExtension($group.probe)
  $log = Join-Path $raw ("r13v-group-{0}-mutate-all.txt" -f $base)
  $code = Invoke-Logged -Body { & node $group.probe '--mutate=all' } -LogPath $log
  Write-Host ("      {0} --mutate=all exit={1}" -f $group.probe, $code)
  $lines += ("{0}`t{1}`t{2}`t{3}" -f $group.probe, '--mutate=all', $code, $log)
}

# probe-17 has no --mutate=all mode; run its shipped mode for the record.
$shipped = @(
  @{ probe = 'probe-11-r4-css-rows.mjs'; tag = 'shipped' },
  @{ probe = 'probe-17-r7-section.mjs'; tag = 'shipped' },
  @{ probe = 'probe-18-r10-sessions.mjs'; tag = 'shipped' },
  @{ probe = 'probe-19-r12-select-parity.mjs'; tag = 'shipped' })
foreach ($group in $shipped) {
  $base = [System.IO.Path]::GetFileNameWithoutExtension($group.probe)
  $log = Join-Path $raw ("r13v-shipped-{0}.txt" -f $base)
  $code = Invoke-Logged -Body { & node $group.probe } -LogPath $log
  $summary = (Select-String -Path $log -Pattern '^### ' -Encoding UTF8 | Select-Object -Last 1).Line
  Write-Host ("      {0} (shipped) exit={1} :: {2}" -f $group.probe, $code, $summary)
  $lines += ("{0}`t{1}`t{2}`t{3}" -f $group.probe, 'shipped', $code, $log)
}
Pop-Location

$tsv = Join-Path $raw 'r13v-mutation-matrix.tsv'
[System.IO.File]::WriteAllText($tsv, (($lines -join [Environment]::NewLine) + [Environment]::NewLine), $utf8NoBom)
Write-Host ("matrix -> {0}" -f $tsv)

Write-Host ''
Write-Host 'guard paths, before vs after the whole matrix:'
$drift = @()
foreach ($path in $guardPaths) {
  $now = Get-Sha $path
  $same = $now -eq $before[$path]
  Write-Host ("    {0,-28} {1}  {2}" -f (Split-Path -Leaf $path), $now.Substring(0, 16), $(if ($same) { 'identical' } else { 'CHANGED' }))
  if (-not $same) { $drift += $path }
}
if ($drift.Count -eq 0) { Write-Host '    all guard paths byte-identical before/after the matrix' }
exit ([int]($drift.Count -ne 0))
