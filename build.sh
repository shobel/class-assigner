#!/bin/bash
# Build Classify for macOS
# Requirements: pip install pyinstaller, npm install (in electron/)

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "=== Step 1: Bundle Flask backend with PyInstaller ==="
pyinstaller classify.spec --noconfirm --clean

echo ""
echo "=== Step 2: Install Electron dependencies ==="
cd "$ROOT/electron"
npm install

echo ""
echo "=== Step 3: Build macOS app with electron-builder ==="
npm run dist:mac

echo ""
echo "=== Done! ==="
echo "App:      $ROOT/dist/mac/Classify.app"
echo "Installer: $ROOT/dist/Classify-*.dmg"
