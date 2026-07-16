param(
  [string]$Version,
  [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$desktopRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repoRoot = (Resolve-Path (Join-Path $desktopRoot "..\..")).Path
$tauriRoot = Join-Path $desktopRoot "src-tauri"
$packageJsonPath = Join-Path $desktopRoot "package.json"
$manifestTemplatePath = Join-Path $tauriRoot "msix\AppxManifest.template.xml"
$sourceIconPath = Join-Path $tauriRoot "icons\icon.png"
$packageRoot = Join-Path $tauriRoot "target\msix\package"
$verificationRoot = Join-Path $tauriRoot "target\msix\unpacked"
$cargoTarget = Join-Path $tauriRoot "target"

if (-not $Version) {
  $Version = (Get-Content $packageJsonPath -Raw | ConvertFrom-Json).version
}

if ($Version -notmatch '^(\d+)\.(\d+)\.(\d+)$') {
  throw "Store version must use major.minor.patch format. Received: $Version"
}

$storeVersion = "$($Matches[1]).$($Matches[2]).$($Matches[3]).0"
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $repoRoot "downloads"
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$outputPath = Join-Path $OutputDirectory "M-Verify-$Version-x64.msix"

$windowsKitsBin = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
$makeAppx = Get-ChildItem $windowsKitsBin -Filter "makeappx.exe" -Recurse -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match '\\x64\\makeappx\.exe$' } |
  Sort-Object FullName -Descending |
  Select-Object -First 1
if (-not $makeAppx) {
  throw "MakeAppx.exe was not found. Install the Windows 10/11 SDK, then run this command again."
}

function Assert-LastCommand([string]$Step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE."
  }
}

function New-StoreAsset {
  param(
    [string]$Destination,
    [int]$Width,
    [int]$Height
  )

  $source = [System.Drawing.Image]::FromFile($sourceIconPath)
  try {
    $bitmap = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#00843D"))
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $side = [Math]::Min($Width, $Height)
        $left = [int](($Width - $side) / 2)
        $top = [int](($Height - $side) / 2)
        $graphics.DrawImage($source, $left, $top, $side, $side)
      } finally {
        $graphics.Dispose()
      }
      $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $bitmap.Dispose()
    }
  } finally {
    $source.Dispose()
  }
}

Write-Host "Building M-Verify $Version for the Microsoft Store..." -ForegroundColor Cyan
$env:VITE_MICROSOFT_STORE = "true"
if (-not $env:VITE_API_BASE_URL) {
  $env:VITE_API_BASE_URL = "https://m-verify.theleasemaster.com/api"
}
$env:CARGO_TARGET_DIR = $cargoTarget

Push-Location $repoRoot
try {
  & pnpm --filter "@m-verify/shared" build
  Assert-LastCommand "Shared package build"
  & pnpm --filter "@m-verify/desktop" exec tauri build --no-bundle
  Assert-LastCommand "Tauri release build"
} finally {
  Pop-Location
}

foreach ($path in @($packageRoot, $verificationRoot)) {
  if (Test-Path $path) {
    Remove-Item -LiteralPath $path -Recurse -Force
  }
}
New-Item -ItemType Directory -Path (Join-Path $packageRoot "Assets") -Force | Out-Null

$executablePath = Join-Path $cargoTarget "release\m-verify.exe"
if (-not (Test-Path $executablePath)) {
  throw "The Store executable was not produced at $executablePath."
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
$dumpbinPath = $null
if (Test-Path $vswhere) {
  $dumpbinPath = & $vswhere -latest -products * -find "VC\Tools\MSVC\*\bin\Hostx64\x64\dumpbin.exe" |
    Select-Object -First 1
}
if ($dumpbinPath) {
  $dependencies = (& $dumpbinPath /dependents $executablePath) -join "`n"
  if ($dependencies -match '(?im)^\s*(VCRUNTIME|MSVCP)\d[^\s]*\.dll\s*$') {
    throw "The Store executable still depends on a Visual C++ runtime DLL. Build it with the static CRT before packaging."
  }
} else {
  Write-Warning "DumpBin was not found, so executable runtime dependencies were not verified."
}

Copy-Item $executablePath (Join-Path $packageRoot "m-verify.exe")

$manifest = (Get-Content $manifestTemplatePath -Raw).Replace("{{VERSION}}", $storeVersion)
[System.IO.File]::WriteAllText(
  (Join-Path $packageRoot "AppxManifest.xml"),
  $manifest,
  (New-Object System.Text.UTF8Encoding($false))
)

Add-Type -AssemblyName System.Drawing
$assetsRoot = Join-Path $packageRoot "Assets"
New-StoreAsset (Join-Path $assetsRoot "StoreLogo.png") 50 50
New-StoreAsset (Join-Path $assetsRoot "Square44x44Logo.png") 44 44
New-StoreAsset (Join-Path $assetsRoot "Square150x150Logo.png") 150 150
New-StoreAsset (Join-Path $assetsRoot "Wide310x150Logo.png") 310 150
New-StoreAsset (Join-Path $assetsRoot "Square310x310Logo.png") 310 310

if (Test-Path $outputPath) {
  Remove-Item -LiteralPath $outputPath -Force
}
& $makeAppx.FullName pack /d $packageRoot /p $outputPath /o
Assert-LastCommand "MSIX packaging"

& $makeAppx.FullName unpack /p $outputPath /d $verificationRoot /o
Assert-LastCommand "MSIX verification unpack"

[xml]$packedManifest = Get-Content (Join-Path $verificationRoot "AppxManifest.xml") -Raw
$identity = $packedManifest.Package.Identity
if ($identity.Name -ne "PulseCloud.M-Verify" -or
    $identity.Publisher -ne "CN=5444A18A-5CD7-4EBC-BEF6-8730E6535F64" -or
    $identity.Version -ne $storeVersion) {
  throw "The packed MSIX identity does not match the Microsoft Store product identity."
}

$hash = (Get-FileHash $outputPath -Algorithm SHA256).Hash
Write-Host "Microsoft Store package ready:" -ForegroundColor Green
Write-Host "  $outputPath"
Write-Host "  Identity: PulseCloud.M-Verify"
Write-Host "  Version:  $storeVersion"
Write-Host "  SHA256:   $hash"
Write-Host "Upload this .msix file under Partner Center > Packages. The Store signs it after certification."
