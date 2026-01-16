#!/bin/bash

# SheetPilot Startup Script
# This script starts the entire application using Docker Compose

set -e

echo "🚀 Starting SheetPilot..."
echo ""

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

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Error: docker-compose is not installed. Please install Docker Compose."
    exit 1
fi

# Use docker compose (newer) or docker-compose (older)
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cat > .env << EOF
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/sheetpilot
SECRET_KEY=$(openssl rand -hex 32)
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
EOF
    echo "✅ .env file created"
fi

# Create uploads directory if it doesn't exist
mkdir -p backend/uploads

# Stop any existing containers
echo "🛑 Stopping existing containers..."
$COMPOSE_CMD down

# Build and start containers
echo "🔨 Building and starting containers..."
$COMPOSE_CMD up --build -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check if services are running
if docker ps | grep -q sheetpilot-postgres && \
   docker ps | grep -q sheetpilot-backend && \
   docker ps | grep -q sheetpilot-frontend; then
    echo ""
    echo "✅ SheetPilot is running!"
    echo ""
    echo "📍 Services:"
    echo "   - Frontend:  http://localhost:5173"
    echo "   - Backend:   http://localhost:8000"
    echo "   - API Docs:  http://localhost:8000/docs"
    echo "   - PostgreSQL: localhost:5432"
    echo ""
    echo "📋 To view logs: docker-compose logs -f"
    echo "🛑 To stop: docker-compose down"
    echo ""
else
    echo "❌ Error: Some services failed to start. Check logs with: docker-compose logs"
    exit 1
fi
