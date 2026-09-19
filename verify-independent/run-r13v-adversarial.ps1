# r13v — adversarial cases (task t3, verifier).
#
# A1..A4: four product mutants that NOBODY declared, each evaluated by probe-18's 131 assertions
#         (r13v-adv-probe-18.mjs, `expect: []` = measurement mode, so the probe prints the red
#         set it actually observed). A measurement run exits 1 BY DESIGN -- read the red set.
# B1..B5: deliberately broken copies of the shipped probes, to test the t2 claim that a dead
#         mutation, a drifted declaration, a non-unique anchor or a no-op substitution can no
#         longer be reported as "caught". Each of those MUST exit non-zero.
#
#   powershell -ExecutionPolicy Bypass -File verify-independent/run-r13v-adversarial.ps1
$ErrorActionPreference = 'Continue'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
try { [Console]::OutputEncoding = $utf8NoBom } catch { }

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$raw = Join-Path $here '_raw'

function Invoke-Logged {
  param([scriptblock]$Body, [string]$LogPath)
  $text = & $Body 2>&1 | Out-String
  [System.IO.File]::WriteAllText($LogPath, $text, $utf8NoBom)
  return $LASTEXITCODE
}

$cases = @(
  @{ id = 'A1'; want = 'measured'; probe = 'r13v-adv-probe-18.mjs'; args = @('--mutate=adv-muted-bell-filled') },
  @{ id = 'A2'; want = 'measured'; probe = 'r13v-adv-probe-18.mjs'; args = @('--mutate=adv-bell-hover-dropped') },
  @{ id = 'A3'; want = 'measured'; probe = 'r13v-adv-probe-18.mjs'; args = @('--mutate=adv-bell-token-hardcoded') },
  @{ id = 'A4'; want = 'measured'; probe = 'r13v-adv-probe-18.mjs'; args = @('--mutate=adv-muted-bell-recolored') },
  @{ id = 'B1'; want = 'nonzero'; probe = 'r13v-adv-probe-18-deadanchor.mjs'; args = @('--mutate=mute-ignored') },
  @{ id = 'B2'; want = 'nonzero'; probe = 'r13v-adv-probe-18-drift.mjs'; args = @('--mutate=mute-ignored') },
  @{ id = 'B3'; want = 'nonzero'; probe = 'r13v-adv-probe-11-noop.mjs'; args = @('--mutate=card-cap-92px') },
  @{ id = 'B4'; want = 'nonzero'; probe = 'r13v-adv-probe-17-nonunique.mjs'; args = @('--mutate=order') },
  @{ id = 'B5'; want = 'nonzero'; probe = 'r13v-adv-probe-19-deadanchor.mjs'; args = @('--mutate=popover-dropped-from-shared-picker') }
)

Push-Location $here
$rows = @()
$exitByCase = @{}
foreach ($case in $cases) {
  $log = Join-Path $raw ("r13v-adversarial-{0}.txt" -f $case.id)
  $code = Invoke-Logged -Body { & node $case.probe @($case.args) } -LogPath $log
  $exitByCase[$case.id] = $code
  $verdict = if ($case.want -eq 'measured') { 'exit is informational (measurement mode)' } elseif ($code -ne 0) { 'guard bit' } else { 'GUARD DID NOT BITE' }
  Write-Host ("{0}  {1,-34} {2,-46} exit={3}  {4}" -f $case.id, $case.probe, ($case.args -join ' '), $code, $verdict)
  $rows += ("{0}`t{1}`t{2}`t{3}`t{4}" -f $case.id, $case.probe, ($case.args -join ' '), $code, $log)
}
Pop-Location

$tsv = Join-Path $raw 'r13v-adversarial.tsv'
[System.IO.File]::WriteAllText($tsv, (($rows -join [Environment]::NewLine) + [Environment]::NewLine), $utf8NoBom)
Write-Host ("adversarial matrix -> {0}" -f $tsv)

# the four guard cases must all be non-zero; the four measurements are allowed any code
$guardFailed = @($cases | Where-Object { $_.want -eq 'nonzero' } | Where-Object { $exitByCase[$_.id] -eq 0 })
Write-Host ''
Write-Host ("guard cases that failed to bite: {0} ({1})" -f $guardFailed.Count, (@($guardFailed | ForEach-Object { $_.id }) -join ', '))
exit ([int]($guardFailed.Count -ne 0))
