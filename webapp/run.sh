#!/bin/bash

cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║     Class Assignment Optimizer - Web App                ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Check if Flask is installed
if ! python3 -c "import flask" 2>/dev/null; then
    echo "Installing dependencies..."
    pip3 install -r requirements.txt
fi

echo "Starting server on http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop"
echo ""

python3 app.py
