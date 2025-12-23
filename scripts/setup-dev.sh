#!/bin/bash
#
# Local Development Setup Script
# Builds and links Atomize for local testing
#

set -e

echo "Building Atomize..."

if command -v bun &> /dev/null; then
    echo "Using Bun for build..."
    bun install
    bun run build:bun
    PACKAGE_MANAGER="bun"
elif command -v npm &> /dev/null; then
    echo "Using NPM for build..."
    npm install
    npm run build
    PACKAGE_MANAGER="npm"
else
    echo "Error: Neither bun nor npm found"
    echo "Please install Node.js or Bun first"
    exit 1
fi

echo ""
echo "Linking globally..."

if [ "$PACKAGE_MANAGER" = "bun" ]; then
    bun link
else
    npm link
fi

echo ""
echo "Setup complete!"
echo ""
echo "You can now use 'atomize' from anywhere:"
echo "  atomize --version"
echo "  atomize validate templates/backend-api.yaml"
echo "  atomize generate templates/backend-api.yaml --dry-run"
echo ""
echo "To unlink later, run:"
if [ "$PACKAGE_MANAGER" = "bun" ]; then
    echo "  bun unlink"
else
    echo "  npm unlink -g @sppg2001/atomize"
fi
echo ""