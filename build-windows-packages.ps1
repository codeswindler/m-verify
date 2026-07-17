# Builds both Windows packages for the current desktop version (0.1.21).
# Run from repo root: powershell -ExecutionPolicy Bypass -File .\build-windows-packages.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

$version = (Get-Content "$root\apps\desktop\package.json" -Raw | ConvertFrom-Json).version
Write-Host "=== M-Verify Windows release build v$version ===" -ForegroundColor Cyan

# 1. Dependencies
Write-Host "`n[1/4] pnpm install" -ForegroundColor Yellow
pnpm install
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

# 2. NSIS installer (website download + auto-updater)
Write-Host "`n[2/4] NSIS installer build" -ForegroundColor Yellow
$keyPath = "$env:USERPROFILE\.tauri\m-verify.key"
if (-not (Test-Path $keyPath)) { throw "Updater signing key not found at $keyPath" }
$env:TAURI_SIGNING_PRIVATE_KEY = $keyPath  # Tauri v2 reads TAURI_SIGNING_PRIVATE_KEY (path or key content)
if (-not $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
  # Prevents an invisible interactive password prompt; empty works for --ci keys.
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
}
pnpm --filter "@m-verify/desktop" tauri:build
if ($LASTEXITCODE -ne 0) { throw "NSIS build failed" }

# 3. Microsoft Store MSIX
Write-Host "`n[3/4] Microsoft Store MSIX build" -ForegroundColor Yellow
pnpm --filter "@m-verify/desktop" tauri:build:store
if ($LASTEXITCODE -ne 0) { throw "MSIX build failed" }

# 4. Collect artifacts into downloads/
Write-Host "`n[4/4] Collecting artifacts" -ForegroundColor Yellow
$nsisDir = "$root\apps\desktop\src-tauri\target\release\bundle\nsis"
$setup = Get-ChildItem $nsisDir -Filter "*-setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$sig   = Get-ChildItem $nsisDir -Filter "*-setup.exe.sig" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup -or -not $sig) { throw "NSIS setup.exe or .sig not found in $nsisDir" }
Copy-Item $setup.FullName "$root\downloads\M-Verify-$version-Setup.exe" -Force
Copy-Item $setup.FullName "$root\downloads\M-Verify_${version}_x64-setup.exe" -Force
Copy-Item $sig.FullName   "$root\downloads\M-Verify_${version}_x64-setup.exe.sig" -Force

Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "NSIS installer : downloads\M-Verify-$version-Setup.exe"
Write-Host "Updater exe    : downloads\M-Verify_${version}_x64-setup.exe (+ .sig)"
Write-Host "Store package  : downloads\M-Verify-$version-x64.msix"
Write-Host "`nUpdater signature for DESKTOP_UPDATER_SIGNATURE:" -ForegroundColor Cyan
Get-Content "$root\downloads\M-Verify_${version}_x64-setup.exe.sig" -Raw
Write-Host "`nNext: upload the updater exe to the server /downloads, set DESKTOP_LATEST_VERSION=$version and DESKTOP_UPDATER_SIGNATURE (above) in the API env, recreate the API container, then upload the .msix in Partner Center."
