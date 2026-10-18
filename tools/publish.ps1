# Publishes the latest app + data to GitHub Pages (https://jbernasconif.github.io/efootball-meta-lab/).
# Usage: powershell -ExecutionPolicy Bypass -File tools\publish.ps1 ["optional message"]
param([string]$Message = "Update data $(Get-Date -Format 'yyyy-MM-dd HH:mm')")
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')
Set-Location (Split-Path -Parent $PSScriptRoot)
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" tools\build_tiers.py | Out-Null  # refresh link-only tiers
git add -A
if (-not (git status --porcelain)) { Write-Host 'Nothing new to publish.'; exit 0 }
git commit -q -m $Message
git push -q
Write-Host "Pushed. GitHub Pages rebuilds in 1-2 minutes: https://jbernasconif.github.io/efootball-meta-lab/"
