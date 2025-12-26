#!/bin/bash

# SheetPilot Stop Script
# This script stops all running containers

set -e

echo "🛑 Stopping SheetPilot..."

# Use docker compose (newer) or docker-compose (older)
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

$COMPOSE_CMD down

echo "✅ SheetPilot stopped"

