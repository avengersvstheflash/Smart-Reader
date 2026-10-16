# scripts/build-sidecar.ps1
# Freezes sidecars/python into a standalone onedir bundle in dist-sidecar/omnitome-sidecar/
param(
    [switch]$SkipClean = $false
)

$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $PSScriptRoot
$pyinstallerExe = Join-Path $rootDir "sidecars\python\.venv\Scripts\pyinstaller.exe"
$specFile = Join-Path $rootDir "sidecars\python\sidecar.spec"
$distDir = Join-Path $rootDir "dist-sidecar"
$workDir = Join-Path $rootDir "build-sidecar"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  OMNITOME SIDECAR PYINSTALLER BUILD (S12a)" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Root:        $rootDir"
Write-Host "PyInstaller: $pyinstallerExe"
Write-Host "Spec:        $specFile"
Write-Host "Dist:        $distDir"
Write-Host "Workpath:    $workDir"

if (-not (Test-Path $pyinstallerExe)) {
    Write-Error "PyInstaller not found at $pyinstallerExe. Please ensure sidecars/python/.venv is configured."
}

if (-not (Test-Path $specFile)) {
    Write-Error "Spec file not found at $specFile."
}

if (-not $SkipClean) {
    Write-Host "`n[1/3] Cleaning previous build artifacts..." -ForegroundColor Yellow
    if (Test-Path $distDir) {
        Remove-Item -Recurse -Force $distDir
        Write-Host "  Removed $distDir"
    }
    if (Test-Path $workDir) {
        Remove-Item -Recurse -Force $workDir
        Write-Host "  Removed $workDir"
    }
}

Write-Host "`n[2/3] Executing PyInstaller build (this may take 10-20 minutes)..." -ForegroundColor Yellow
$sw = [System.Diagnostics.Stopwatch]::StartNew()

& $pyinstallerExe `
    --distpath $distDir `
    --workpath $workDir `
    --clean `
    --noconfirm `
    $specFile

$sw.Stop()
$elapsedMinutes = [Math]::Round($sw.Elapsed.TotalMinutes, 2)
Write-Host "`nPyInstaller finished in $elapsedMinutes minutes." -ForegroundColor Green

Write-Host "`n[3/3] Verifying output bundle..." -ForegroundColor Yellow
$outputExe = Join-Path $distDir "omnitome-sidecar\omnitome-sidecar.exe"

if (-not (Test-Path $outputExe)) {
    Write-Error "BUILD FAILED: Expected executable was not produced at $outputExe"
}

$exeItem = Get-Item $outputExe
$bundleFiles = Get-ChildItem -Recurse (Join-Path $distDir "omnitome-sidecar")
$totalBytes = ($bundleFiles | Measure-Object -Property Length -Sum).Sum
$totalMB = [Math]::Round($totalBytes / 1MB, 2)

Write-Host "================================================================" -ForegroundColor Green
Write-Host "  BUILD SUCCESSFUL!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host "Executable: $outputExe ($([Math]::Round($exeItem.Length / 1KB, 2)) KB)"
Write-Host "Bundle Total Files: $($bundleFiles.Count)"
Write-Host "Bundle Total Size:  $totalMB MB"

