<#
.SYNOPSIS
One-command script to launch Benjamin Norbom's website live on GitHub Pages
(`https://bennorbom.github.io/`) and publish the standalone Black Hole Wallpaper
installer (`Black-Hole-Wallpaper-1.0.0-setup.exe`) on GitHub Releases for free.

Run this ONLY when you are ready to publish publicly!
#>

$ErrorActionPreference = "Stop"
$repoName = "BenNorbom.github.io"
$fullRepo = "BenNorbom/$repoName"
$exeAsset = Join-Path $PSScriptRoot "release-assets\Black-Hole-Wallpaper-1.0.0-setup.exe"
$releaseTag = "v1.0.0"
$releaseDownloadUrl = "https://github.com/$fullRepo/releases/download/$releaseTag/Black-Hole-Wallpaper-1.0.0-setup.exe"

if (-not (Test-Path $exeAsset)) {
    throw "Wallpaper installer not found at $exeAsset"
}

Write-Host "1. Updating downloadUrl in src/siteContent.ts to GitHub Release URL..." -ForegroundColor Cyan
$contentFile = Join-Path $PSScriptRoot "src\siteContent.ts"
$raw = Get-Content $contentFile -Raw
$updated = $raw -replace "downloadUrl:\s*'[^']*'", "downloadUrl: '$releaseDownloadUrl'"
Set-Content -Path $contentFile -Value $updated -Encoding UTF8

Write-Host "2. Initializing Git repository and committing source + synthetic DBS atlas..." -ForegroundColor Cyan
Push-Location $PSScriptRoot
if (-not (Test-Path ".git")) {
    git init -b main
}
git add .
git commit -m "Launch Benjamin Norbom interactive portfolio website" --allow-empty

Write-Host "3. Creating public GitHub repository $fullRepo (if not already created)..." -ForegroundColor Cyan
$exists = gh repo view $fullRepo 2>$null
if ($LASTEXITCODE -ne 0) {
    gh repo create $fullRepo --public --source=. --remote=origin --push
} else {
    git remote set-url origin "https://github.com/$fullRepo.git" 2>$null
    if ($LASTEXITCODE -ne 0) { git remote add origin "https://github.com/$fullRepo.git" }
    git push -u origin main
}

Write-Host "4. Enabling GitHub Actions Pages deployment..." -ForegroundColor Cyan
gh api -X POST "repos/$fullRepo/pages" -f build_type=workflow 2>$null
if ($LASTEXITCODE -ne 0) {
    gh api -X PUT "repos/$fullRepo/pages" -f build_type=workflow | Out-Null
}

Write-Host "5. Uploading Black-Hole-Wallpaper-1.0.0-setup.exe to GitHub Release $releaseTag..." -ForegroundColor Cyan
gh release view $releaseTag --repo $fullRepo 2>$null
if ($LASTEXITCODE -ne 0) {
    gh release create $releaseTag "$exeAsset" --repo $fullRepo --title "Black Hole Live Wallpaper v1.0.0" --notes "Standalone Windows 10/11 (x64) Kerr Black Hole desktop live wallpaper."
} else {
    gh release upload $releaseTag "$exeAsset" --repo $fullRepo --clobber
}

Pop-Location
Write-Host "`nDeployment triggered! Your site will be live shortly at: https://bennorbom.github.io/" -ForegroundColor Green
