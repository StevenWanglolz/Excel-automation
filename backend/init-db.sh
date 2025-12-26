#!/bin/bash
# Wait for PostgreSQL to be ready and create tables

echo "Waiting for PostgreSQL to be ready..."

# Wait for PostgreSQL to accept connections
until PGPASSWORD=postgres psql -h postgres -U postgres -d sheetpilot -c "SELECT 1" > /dev/null 2>&1; do
  echo "Waiting for PostgreSQL..."
  sleep 2
done

echo "PostgreSQL is ready. Creating tables..."
python -c "from app.core.database import engine, Base; Base.metadata.create_all(bind=engine)"
echo "✅ Database initialized!"

