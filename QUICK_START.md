# Quick Start Guide

## 🚀 One-Command Start

### macOS/Linux

Simply double-click `start.sh` or run in terminal:

```bash
./start.sh
```

### Windows

Use Git Bash or WSL:

```bash
./start.sh
```

Or use Docker Desktop's GUI and open the `docker-compose.yml` file.

## 📋 What Gets Started

1. **PostgreSQL Database** - Stores user data and flows
2. **Backend API** - FastAPI server at http://localhost:8000
3. **Frontend App** - React app at http://localhost:5173

## 🌐 Access Points

After running `./start.sh`, access:

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

## 🛑 Stop Everything

```bash
./stop.sh
```

## 🔄 Restart

```bash
./restart.sh
```

## 📊 View Logs

```bash
docker-compose logs -f
```

## ✅ First Time Setup

The first time you run `./start.sh`, it will:

1. Create a `.env` file with default settings
2. Build Docker images (takes a few minutes)
3. Start all services
4. Initialize the database

Subsequent runs will be much faster!

## 🐛 Troubleshooting

### Port Already in Use

If you get port conflicts, stop other services using:
- Port 8000 (backend)
- Port 5173 (frontend)
- Port 5432 (PostgreSQL)

Or modify ports in `docker-compose.yml`.

### Docker Not Running

Make sure Docker Desktop is running before executing `./start.sh`.

### Permission Denied

If you get permission errors:

```bash
chmod +x start.sh stop.sh restart.sh
```

