# SheetPilot - Excel Automation Platform

An AI-assisted, low-code Excel automation platform with a drag-and-drop flow builder interface.

## Features

- **File Upload**: Upload Excel (.xlsx, .xls) or CSV files
- **Flow Builder**: Visual drag-and-drop interface to build automation workflows
- **Transformations**: Filter rows, rename columns, remove duplicates, join/lookup, and more
- **Live Preview**: See results after each transformation step
- **Save & Reuse**: Save automation flows and apply them to new files
- **Export**: Download cleaned/transformed files

## Quick Start with Docker (Recommended)

The easiest way to run SheetPilot is using Docker:

### Prerequisites

- Docker Desktop installed and running
- Docker Compose (usually included with Docker Desktop)

### Start the Application

**Option 1: Using the shell script (easiest)**

```bash
./start.sh
```

**Option 2: Using Make (if available)**

```bash
make start
```f

**Option 3: Using Docker Compose directly**

```bash
docker-compose up --build
```

This will start:

- PostgreSQL database
- Backend API (FastAPI)
- Frontend (React)

### Access the Application

- **Frontend**: <http://localhost:5173>
- **Backend API**: <http://localhost:8000>
- **API Documentation**: <http://localhost:8000/docs>
- **PostgreSQL**: localhost:5432

### Stop the Application

```bash
./stop.sh
# or
make stop
# or
docker-compose down
```

### Restart the Application

```bash
./restart.sh
# or
make restart
```

### View Logs

```bash
# All services
docker-compose logs -f
# or
make logs

# Specific service
make logs-backend
make logs-frontend
make logs-db
```

### Other Useful Commands

```bash
# Show running containers
make ps

# Open shell in container
make shell-backend
make shell-frontend
make shell-db

# Clean everything (removes volumes)
make clean
```

## Manual Setup (Without Docker)

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL

### Backend Setup

1. Create a virtual environment:

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

1. Install dependencies:

```bash
pip install -r requirements.txt
```

1. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your database credentials
```

1. Create PostgreSQL database:

```sql
CREATE DATABASE sheetpilot;
```

1. Run migrations (tables are auto-created on first run):

```bash
# The app will create tables automatically on startup
```

1. Start the server:

```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`

### Frontend Setup

1. Install dependencies:

```bash
cd frontend
npm install
```

1. Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Project Structure

```
Excel-automation/
├── backend/
│   ├── app/
│   │   ├── api/routes/     # API endpoints
│   │   ├── core/           # Configuration, database, security
│   │   ├── models/         # Database models
│   │   ├── services/       # Business logic
│   │   ├── transforms/     # Transformation operations
│   │   └── storage/        # File storage
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── api/            # API client
│   │   ├── store/          # Zustand stores
│   │   └── lib/            # Utilities
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── start.sh                # Start script
├── stop.sh                 # Stop script
└── restart.sh              # Restart script
```

## Adding New Transform Blocks

### Backend

1. Create a transform class in `backend/app/transforms/`:

```python
from app.transforms.base import BaseTransform
from app.transforms.registry import register_transform

@register_transform("my_transform")
class MyTransform(BaseTransform):
    def validate(self, df, config):
        # Validation logic
        return True
    
    def execute(self, df, config):
        # Transformation logic
        return df
```

1. Import the transform in `backend/app/main.py` to register it.

### Frontend

1. Create a block component in `frontend/src/components/blocks/`
2. Register it in the FlowCanvas nodeTypes
3. Add it to BlockPalette templates

## API Endpoints

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `POST /api/files/upload` - Upload file
- `GET /api/files` - List files
- `GET /api/files/{id}/preview` - Preview file
- `POST /api/flows` - Create flow
- `GET /api/flows` - List flows
- `POST /api/transform/execute` - Execute flow
- `POST /api/transform/export` - Export result

## Development

The project follows a modular architecture designed for extensibility. New transformation blocks can be added easily by following the registry pattern.

## Troubleshooting

### Docker Issues

If containers fail to start:

```bash
# Check logs
docker-compose logs

# Rebuild from scratch
docker-compose down -v
docker-compose up --build
```

### Database Connection Issues

Make sure PostgreSQL is running and accessible. Check the connection string in your `.env` file or docker-compose.yml.

### Port Conflicts

If ports 8000, 5173, or 5432 are already in use, you can change them in `docker-compose.yml`.

## License

MIT
