#!/bin/bash

# SheetPilot Restart Script
# This script restarts the entire application

set -e

echo "🔄 Restarting SheetPilot..."

# Stop any local Vite dev server for this repo that could shadow Docker on localhost.
./scripts/stop-vite.sh

# Stop first
./stop.sh

# Wait a moment
sleep 2

# Start again
./start.sh
