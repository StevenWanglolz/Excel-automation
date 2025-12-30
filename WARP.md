# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Overview

SheetPilot is a low-code Excel automation platform that uses a visual drag-and-drop interface for building data transformation workflows. The system uses React Flow for the UI and FastAPI for data processing with Pandas.

## Development Commands

### Start/Stop Services

```bash
# Start entire stack (recommended)
./start.sh

# Or using Make
make start

# Stop services
./stop.sh
# Or: make stop

# Restart services
./restart.sh
# Or: make restart

# Clean everything (removes volumes and uploaded files)
make clean
```

### View Logs

```bash
# All services
docker-compose logs -f
# Or: make logs

# Specific service
make logs-backend
make logs-frontend
make logs-db
```

### Container Access

```bash
# Backend shell
make shell-backend
# Or: docker-compose exec backend /bin/bash

# Frontend shell
make shell-frontend
# Or: docker-compose exec frontend /bin/sh

# Database shell
make shell-db
# Or: docker-compose exec postgres psql -U postgres -d sheetpilot
```

### Local Development (without Docker)

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev

# Linting
npm run lint

# Build
npm run build

# Preview build
npm run preview
```

### Testing

**Frontend (Playwright):**
```bash
cd frontend
npx playwright test
npx playwright test --ui  # Interactive mode
```

**Backend:**
No test framework currently set up. When adding tests, use pytest.

## Architecture

### High-Level Structure

```
┌─────────────┐      REST API       ┌─────────────┐
│   React     │ ◄─────────────────► │   FastAPI   │
│  Frontend   │      JSON/HTTP      │   Backend   │
└─────────────┘                      └──────┬──────┘
                                            │
                                            ▼
                                     ┌─────────────┐
                                     │ PostgreSQL  │
                                     └─────────────┘
```

### Backend Architecture

**Registry Pattern for Transforms:**
All data transformations (filter, sort, join, etc.) are registered using the `@register_transform(id)` decorator. This allows dynamic loading without modifying core code. New transforms are automatically discovered when their module is imported in `app/main.py`.

**Layer Separation:**
- **Routes** (`app/api/routes/`) – HTTP handling, validation, authentication
- **Services** (`app/services/`) – Business logic, orchestration
- **Models** (`app/models/`) – SQLAlchemy database schema
- **Transforms** (`app/transforms/`) – Reusable data operations
- **Core** (`app/core/`) – Config, database, security, scheduler

**Background Jobs:**
APScheduler runs periodic cleanup every 6 hours to delete orphaned files (files not referenced by any flow). Managed in `app/core/scheduler.py`.

### Frontend Architecture

**State Management:**
Uses Zustand stores (not Redux):
- `authStore.ts` – Authentication state (user, token, login/logout)
- `flowStore.ts` – Flow builder state (nodes, edges, selections)

Use stores for global/shared state. Use `useState` for local component state (form inputs, modals).

**Component Structure:**
- `components/Auth/` – Login, Register, ProtectedRoute
- `components/Dashboard/` – Main dashboard view
- `components/FlowBuilder/` – Flow builder interface with React Flow
- `components/blocks/` – Transform block components
- `components/Common/` – Shared UI components

**API Client:**
Centralized in `src/api/`. Uses Axios with interceptors:
- Request interceptor adds JWT token to all requests
- Response interceptor handles 401 errors (auto-logout)
- File uploads use FormData (Content-Type removed by interceptor)

### Data Flow

**Authentication:**
1. User submits credentials → `authStore.login()`
2. API call → `POST /api/auth/login`
3. Backend validates, returns JWT token (30min expiry)
4. Token stored in localStorage
5. Token added to all subsequent requests via interceptor

**Flow Execution:**
1. User builds flow in React Flow UI → stored in `flowStore`
2. Click "Execute" → `POST /api/transform/execute`
3. Backend loads file into Pandas DataFrame
4. Iterates through flow nodes sequentially
5. Each transform validates config, then executes on DataFrame
6. Returns preview of final DataFrame to frontend

**File Upload:**
1. User selects file → creates FormData
2. Frontend validates file type (.xlsx/.xls/.csv)
3. Backend validates file size (50MB limit enforced before saving)
4. Saves to `uploads/{user_id}/{uuid}.{ext}`
5. Creates database record with metadata
6. Returns file metadata to frontend

### Key Patterns

**Transform Registry:**
```python
@register_transform("filter_rows")
class FilterRowsTransform(BaseTransform):
    def validate(self, df: pd.DataFrame, config: dict) -> bool:
        # Validate config before execution
        return "column" in config and config["column"] in df.columns
    
    def execute(self, df: pd.DataFrame, config: dict) -> pd.DataFrame:
        # Apply transformation
        return df[df[config["column"]] == config["value"]]
```

**Adding New Transforms:**
1. Create class in `app/transforms/` that inherits from `BaseTransform`
2. Add `@register_transform("your_id")` decorator
3. Implement `validate()` and `execute()` methods
4. Import module in `app/main.py` (bottom of file)
5. Add corresponding frontend block in `src/components/blocks/`
6. Register block in `src/lib/blockRegistry.ts`

**Dependency Injection (Backend):**
FastAPI dependencies provide:
- Database sessions: `db: Session = Depends(get_db)`
- Current user: `current_user: User = Depends(get_current_user)`
- Automatic cleanup and error handling

**Zustand Store Pattern (Frontend):**
```typescript
const { user, isAuthenticated, login } = useAuthStore();
const { nodes, edges, addNode, updateNode } = useFlowStore();
```

## File Organization

### Backend Key Files

- `app/main.py` – FastAPI app initialization, CORS, route registration
- `app/api/routes/` – HTTP endpoints (auth, files, flows, transform)
- `app/api/dependencies.py` – FastAPI dependencies (get_db, get_current_user)
- `app/services/file_service.py` – File upload, parsing, preview generation
- `app/services/transform_service.py` – Flow execution engine
- `app/transforms/registry.py` – Transform registration system
- `app/core/config.py` – Environment configuration (SECRET_KEY, DATABASE_URL, etc.)
- `app/core/security.py` – Password hashing, JWT token creation/validation
- `app/core/scheduler.py` – Background job scheduler (file cleanup)
- `app/storage/local_storage.py` – Local file storage with size validation

### Frontend Key Files

- `src/App.tsx` – Main app component, routing
- `src/store/authStore.ts` – Authentication state management
- `src/store/flowStore.ts` – Flow builder state management
- `src/api/client.ts` – Axios client with interceptors
- `src/api/` – Type-safe API functions (auth, files, flows, transform)
- `src/components/FlowBuilder/FlowBuilder.tsx` – Main flow builder component
- `src/lib/blockRegistry.ts` – Frontend block registration

## Important Details

### Authentication

- JWT tokens stored in localStorage (30min expiry)
- All routes except `/api/auth/login` and `/api/auth/register` require authentication
- Token automatically added to requests via Axios interceptor
- 401 errors trigger automatic logout and redirect to login
- Users can only access their own files and flows (validated in backend)

### File Storage

- Files stored at `backend/uploads/{user_id}/{uuid}.{ext}`
- 50MB size limit enforced in `local_storage.py` before saving
- Returns HTTP 413 if size exceeded
- Metadata stored in PostgreSQL (File model)
- Orphaned files automatically cleaned up every 6 hours via APScheduler
- Files also cleaned up immediately when flows referencing them are deleted

### Transform System

- Transforms execute sequentially (not parallel)
- Each transform receives output of previous transform
- Validation runs before execution (prevents errors)
- Invalid transforms are skipped (don't break flow)
- All transforms work on Pandas DataFrames

### Database

- PostgreSQL 15 via Docker
- Tables auto-created on startup using `Base.metadata.create_all()` (not using Alembic migrations yet)
- Connection string: `postgresql://postgres:postgres@postgres:5432/sheetpilot`
- Models: User, File, Flow

### Security

- Passwords hashed with bcrypt (slow by design, includes salt)
- JWT tokens contain user ID in `sub` claim
- File paths include user ID to prevent cross-user access
- No rate limiting implemented (consider adding for production)

### Development Workflow

1. Make code changes in `backend/` or `frontend/`
2. Docker volumes mount source code, so changes are reflected immediately
3. Backend auto-reloads on change (uvicorn --reload)
4. Frontend auto-reloads via Vite HMR
5. View logs with `docker-compose logs -f`
6. Access services at:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API Docs (Swagger): http://localhost:8000/docs

### Environment Variables

Stored in `.env` (auto-generated by `start.sh`):
- `DATABASE_URL` – PostgreSQL connection string
- `SECRET_KEY` – JWT signing key (auto-generated)
- `ACCESS_TOKEN_EXPIRE_MINUTES` – Token expiry (default: 30)
- `MAX_FILE_SIZE` – Max file size in bytes (default: 52428800 = 50MB)
- `CORS_ORIGINS` – Allowed frontend URLs

### Common Issues

**Port Conflicts:**
If ports 5432 (postgres), 8000 (backend), or 5173 (frontend) are in use, stop conflicting services or modify ports in `docker-compose.yml`.

**Docker Not Running:**
Ensure Docker Desktop is running before executing `./start.sh`.

**Permission Errors:**
Make scripts executable: `chmod +x start.sh stop.sh restart.sh`

**File Upload Fails:**
Check file size (must be ≤50MB) and type (.xlsx/.xls/.csv only).

## Documentation

For detailed information, see:
- `docs/ARCHITECTURE.md` – System design, technology stack, patterns
- `docs/DATA_FLOW.md` – How data moves through the system
- `docs/STATE.md` – Frontend state management details
- `docs/API.md` – Complete API endpoint reference
- `docs/DECISIONS.md` – Why architectural choices were made
