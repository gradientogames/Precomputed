$ErrorActionPreference = "Stop"
$testPath = Join-Path $PSScriptRoot "..\tests\smoke.ps1"
try {
  $output = & $testPath
} catch {
  Write-Error "Test script threw an exception: $($_.Exception.Message)"
  exit 1
}
if ($output -eq "OK") {
  Write-Output "PASS: smoke test returned expected output 'OK'"
  exit 0
} else {
  Write-Error "FAIL: unexpected output: '$output'"
  exit 1
}
