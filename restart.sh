#!/bin/bash

# SheetPilot Restart Script
# This script restarts the entire application

set -e

echo "🔄 Restarting SheetPilot..."

# Stop any local Vite dev server for this repo that could shadow Docker on localhost.
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
VITE_PATH="$REPO_ROOT/frontend/node_modules/.bin/vite"
VITE_PIDS="$(pgrep -f "node .*vite" || true)"
if [ -n "$VITE_PIDS" ]; then
    echo "⚠️  Checking for local Vite dev servers..."
    for pid in $VITE_PIDS; do
        CMD="$(ps -p "$pid" -o command= 2>/dev/null || true)"
        if echo "$CMD" | grep -q "$VITE_PATH"; then
            echo "   - Stopping local Vite for this repo (PID $pid)"
            kill "$pid" || true
        fi
    done
    sleep 1
    for pid in $VITE_PIDS; do
        if ps -p "$pid" > /dev/null 2>&1; then
            CMD="$(ps -p "$pid" -o command= 2>/dev/null || true)"
            if echo "$CMD" | grep -q "$VITE_PATH"; then
                echo "   - Force stopping local Vite for this repo (PID $pid)"
                kill -9 "$pid" || true
            fi
        fi
    done
fi

# Stop first
./stop.sh

# Wait a moment
sleep 2

# Start again
./start.sh
