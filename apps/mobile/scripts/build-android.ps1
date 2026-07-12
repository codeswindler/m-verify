param(
  [ValidateSet("all", "debug", "release", "bundle")]
  [string]$Mode = "all"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

pnpm build
pnpm cap:sync

if ($Mode -eq "debug" -or $Mode -eq "all") {
  Push-Location android
  ./gradlew assembleDebug
  Pop-Location
}

if ($Mode -eq "release" -or $Mode -eq "all") {
  Push-Location android
  ./gradlew assembleRelease
  Pop-Location
}

if ($Mode -eq "bundle" -or $Mode -eq "all") {
  Push-Location android
  ./gradlew bundleRelease
  Pop-Location
}
