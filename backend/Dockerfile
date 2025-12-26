FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/
COPY init-db.sh ./

# Create uploads directory
RUN mkdir -p /app/uploads && \
    chmod +x /app/init-db.sh

# Expose port
EXPOSE 8000

# Run initialization and start server
CMD ["sh", "-c", "./init-db.sh && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]

