#!/bin/bash

# SheetPilot Restart Script
# This script restarts the entire application

set -e

echo "🔄 Restarting SheetPilot..."

# Stop first
./stop.sh

# Wait a moment
sleep 2

# Start again
./start.sh

