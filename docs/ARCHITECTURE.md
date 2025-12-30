# Architecture

## System Overview

SheetPilot follows a three-tier architecture:

```
┌─────────────┐      HTTP/JSON      ┌─────────────┐
│   Frontend  │ ◄─────────────────► │   Backend   │
│  (React)    │      (REST API)     │  (FastAPI)  │
└─────────────┘                      └──────┬──────┘
                                            │
                                            │ SQLAlchemy ORM
                                            ▼
                                     ┌─────────────┐
                                     │  PostgreSQL │
                                     │  Database   │
                                     └─────────────┘
```

Local development uses Docker Compose (v2+) to orchestrate the frontend, backend, and PostgreSQL services.

## Technology Stack

### Frontend

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Zustand** - State management (lightweight, no boilerplate)
- **React Flow** - Drag-and-drop flow builder
- **Axios** - HTTP client
- **React Router** - Client-side routing
- **Tailwind CSS** - Styling
- **Vite** - Build tool and dev server

### Backend

- **FastAPI** - Python web framework (async, auto-docs)
- **SQLAlchemy** - ORM for database operations
- **PostgreSQL** - Relational database
- **Pandas** - Data manipulation (Excel/CSV processing)
- **Pydantic** - Data validation
- **JWT** - Authentication tokens
- **bcrypt** - Password hashing

## Layer Responsibilities

### Backend Layers

#### Routes (`app/api/routes/`)

- Handle HTTP requests and responses
- Validate request data (Pydantic models)
- Authenticate users (via `get_current_user` dependency)
- Delegate business logic to services
- Return appropriate HTTP status codes

**Key Routes:**

- `auth.py` - Authentication (login, register, get current user)
- `files.py` - File operations (upload, list, preview, download, delete)
- `flows.py` - Flow management (create, read, update, delete)
- `transform.py` - Flow execution and data transformation

#### Services (`app/services/`)

- Contain business logic
- Coordinate between models, storage, and transforms
- Handle data processing and validation
- Can be tested independently of HTTP layer

**Key Services:**

- `file_service.py` - File upload, parsing, preview generation
- `transform_service.py` - Flow execution, transform orchestration
- `file_reference_service.py` - Track file usage across flows

#### Models (`app/models/`)

- Define database schema using SQLAlchemy
- Represent database tables as Python classes
- Define relationships between entities

**Key Models:**

- `User` - User accounts and authentication
- `File` - Uploaded file metadata
- `Flow` - Saved automation flows

#### Transforms (`app/transforms/`)

- Reusable data transformation operations
- Follow registry pattern for dynamic loading
- Each transform validates config and executes on DataFrame

**Transform Types:**

- `filters.py` - Row filtering operations
- `columns.py` - Column manipulation
- `rows.py` - Row operations (delete, sort)
- `joins.py` - Data joining/lookup operations

#### Core (`app/core/`)

- Application configuration
- Database connection management
- Security utilities (password hashing, JWT tokens)
- Shared dependencies

### Frontend Layers

#### Components (`src/components/`)

- React components for UI
- Organized by feature/domain
- Handle user interactions and display data

**Component Structure:**

- `Auth/` - Login, Register, ProtectedRoute
- `Dashboard/` - Main dashboard view
- `FlowBuilder/` - Flow builder interface
- `blocks/` - Individual transform blocks
- `Common/` - Shared components (modals, etc.)

#### Stores (`src/store/`)

- Zustand stores for global state
- Avoid prop drilling
- Single source of truth for shared data

**Stores:**

- `authStore.ts` - Authentication state (user, token, login/logout)
- `flowStore.ts` - Flow builder state (nodes, edges, selected node)

#### API (`src/api/`)

- API client functions
- Type-safe functions that call backend endpoints
- Use shared `apiClient` instance with interceptors

#### Types (`src/types/`)

- TypeScript type definitions
- Shared types across frontend
- Ensure type safety

## Key Patterns

### Registry Pattern (Backend)

Transforms are registered dynamically using decorators:

```python
@register_transform("filter_rows")
class FilterRowsTransform(BaseTransform):
    ...
```

This allows:

- Adding new transforms without modifying core code
- Dynamic lookup by name/ID
- Easy extensibility

### Dependency Injection (Backend)

FastAPI dependencies provide:

- Database sessions (`get_db`)
- Current user (`get_current_user`)
- Automatic cleanup and error handling

### Interceptor Pattern (Frontend)

Axios interceptors:

- Automatically add auth tokens to requests
- Handle 401 errors by redirecting to login
- Remove Content-Type for FormData uploads

### Store Pattern (Frontend)

Zustand stores:

- Centralized state management
- No context providers needed
- Simple API for reading/writing state

## Data Storage

### Database (PostgreSQL)

- Stores user accounts, file metadata, and flow definitions
- Uses SQLAlchemy ORM for type-safe queries
- Tables auto-created on startup (use migrations in production)

### File Storage (Local Disk)

- Files stored in `uploads/{user_id}/` directories
- Database stores metadata (path, size, MIME type)
- File size limit: 10MB (enforced by validation in `local_storage.py`)
- Files exceeding limit rejected with HTTP 413 error before saving
- Files cleaned up when no longer referenced by flows

## 
    Background Scheduler

### Periodic Cleanup

- **APScheduler** runs background jobs periodically
- **Orphaned file cleanup**: Runs every 6 hours
- Removes files not referenced by any flow
- Frees up disk space automatically
- Runs on app startup and shuts down gracefully on app stop

## Security Architecture

### Authentication

- JWT tokens stored in `localStorage`
- Tokens expire after 30 minutes
- Token contains user ID in `sub` claim
- Backend validates token on every protected request

### Authorization

- All routes except `/api/auth/login` and `/api/auth/register` require authentication
- Users can only access their own files and flows
- File paths include user ID to prevent cross-user access

### Password Security

- Passwords hashed with bcrypt (slow by design)
- Never stored or transmitted in plaintext
- Constant-time comparison prevents timing attacks

## Scalability Considerations

### Current Limitations

- File storage is local (not suitable for multiple servers)
- No caching layer
- Database queries are straightforward (no complex joins yet)

### Future Improvements

- Move file storage to S3/cloud storage
- Add Redis for caching
- Implement database connection pooling
- Add background job queue for large file processing
