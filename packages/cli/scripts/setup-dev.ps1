[Console]::OutputEncoding = [System.Text.Encoding]::UTF8


Write-Host ""
Write-Host "Building Atomize..."
Write-Host ""


# Check if npm is available
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Error: npm not found"
    Write-Host "Please install Node.js first from https://nodejs.org/"
    exit 1
}

Write-Host "Installing dependencies..."
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "Installation failed"; exit 1 }

Write-Host ""
Write-Host "Building project..."
# This runs: tsc, then postbuild automatically (because it's npm)
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed"; exit 1 }

Write-Host ""
Write-Host "Linking globally..."
npm link
if ($LASTEXITCODE -ne 0) { Write-Host "Linking failed"; exit 1 }

Write-Host ""
Write-Host "Setup complete!"
Write-Host ""
Write-Host "Try:"
Write-Host "  atomize --version"
Write-Host "  atomize validate templates\backend-api.yaml"
Write-Host ""
Write-Host "To unlink later:"
Write-Host "  npm unlink -g @sppg2001/atomize"
Write-Host ""
exit 0