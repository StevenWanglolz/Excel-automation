# File Map

This document explains the purpose of each major file and folder. It is meant for quick re-orientation, not implementation details.

## Root Files

### README.md 🟢

- Project overview and quick start guide
- First file to read when returning to the project
- Links to deeper documentation

### docker-compose.yml 🟡

- Defines all services (database, backend, frontend)
- Configuration for local development
- Uses Docker Compose v2+ format (no version key)
- Changes here affect how the app runs

### frontend/Dockerfile 🟡

- Frontend container image definition
- Uses Node 20+ to satisfy Vite runtime requirements
- Changes affect `./start.sh` and Playwright webServer startup

### start.sh / stop.sh / restart.sh 🟢

- Convenience scripts for Docker operations
- Safe to modify for your workflow

### .vscode/tasks.json 🟢

- VS Code tasks to run start/restart/stop scripts
- Safe to adjust task labels or add new tasks

## docs/

### docs/ARCHITECTURE.md 🟢

- Big-picture system structure and major components
- Best starting point after the README

### docs/DATA_FLOW.md 🟢

- End-to-end data flow explanations with code snippets
- Use this when tracing UI or export issues

### docs/STREAM_ARCHITECTURE.md 🟢

- Design document for Stream-Centric data flow
- explains "Virtual Streams" and Source-Destination pairing

### docs/FILES.md 🟢

- This file map (orientation guide)

### docs/USER_MANUAL.md 🟢

- Step-by-step usage guide for common I/O scenarios
- Explains file groups and output behavior

### docs/API.md 🟡

- API endpoints and request/response shapes

### docs/STATE.md 🟡

- Frontend state ownership and update triggers

### docs/DECISIONS.md 🟡

- Why key architectural choices were made

### docs/LEARNING.md 🟢

- Personal learning notes and patterns to reuse

## backend/

### backend/app/main.py 🔴

- FastAPI application entry point
- Registers all routes and middleware
- Imports transforms to register them
- Changes here affect all API endpoints

### backend/app/core/

#### config.py 🟡

- Application settings (database, security, CORS)
- Loads from environment variables
- Changing defaults affects all features

#### database.py 🔴

- Database connection and session management
- Base class for all models
- Critical for all database operations

#### security.py 🔴

- Password hashing and JWT token creation/validation
- Security-critical - changes can break authentication

#### scheduler.py 🟡

- Background scheduler for periodic tasks
- Cleanup orphaned files every 6 hours
- Integrated with app lifecycle (startup/shutdown)

### backend/app/api/

#### dependencies.py 🔴

- FastAPI dependencies (get_db, get_current_user)
- Used by all protected routes
- Changes affect authentication flow

#### routes/

- **auth.py** 🟡 - User registration, login, get current user
- **files.py** 🟡 - File upload, list, preview, sheet list, download, delete
  - Caches file preview responses, manages file groups, warms sheet previews after upload
- **flows.py** 🟡 - Create, read, update, delete automation flows
- **transform.py** 🟡 - Execute flows and export results
  - Uses in-memory preview cache for /transform/execute responses
  - `/transform/precompute` warms cached previews for output sheets

### backend/app/models/

#### user.py 🟡

- User database model (email, password, profile)
- Changes require database migration

#### file.py 🟡

- File metadata model (filename, path, size, MIME type)
- Links files to users

#### file_batch.py 🟡

- Batch model for grouping related files
- Lets flows reuse named file groups

#### flow.py 🟡

- Flow model (name, description, flow_data JSON)
- Stores saved automation workflows

### backend/app/services/

#### file_service.py 🟡

- File upload, parsing, preview generation
- Handles Excel/CSV file operations
- Secondary file size validation (safety net after local_storage validation)
- Persists generated exports into groups with numbered filenames
- Used by file routes

#### transform_service.py 🟡

- Flow execution logic
- Orchestrates transform execution across targeted file/sheet tables
- Used by transform routes

#### preview_cache.py 🟢

- In-memory LRU cache for preview responses
- Keyed by user + file IDs + flow data + preview target
- Avoids re-running transforms on repeated previews

#### file_reference_service.py 🟡

- Tracks which files are used by which flows
- Handles file cleanup when flows are deleted

### backend/app/transforms/

#### base.py 🔴

- Base class for all transforms
- Defines validate() and execute() interface
- Changing interface breaks all transforms

#### registry.py 🔴

- Transform registration system
- Allows dynamic transform lookup
- Core to transform system

#### filters.py / columns.py / rows.py / joins.py 🟢

- Individual transform implementations
- Safe to add new transforms here
- Each transform is independent

#### remove.py 🟢

- Removes columns or rows using manual selections and rules
- Used by the Remove Columns/Rows block

### backend/app/storage/

#### local_storage.py 🟡

- File storage on local filesystem
- Saves files to user-specific directories
- Validates file size before saving (50MB limit, returns 413 if exceeded)
- Saves generated output bytes for group exports
- Changing paths affects file access

## frontend/

### frontend/src/main.tsx 🟢

- React app entry point
- Renders App component
- Rarely needs changes

### frontend/src/App.tsx 🟡

- Main app component with routing
- Defines all routes and navigation
- Adding routes requires changes here

### frontend/src/store/

#### authStore.ts 🔴

- Authentication state (user, token, login/logout)
- Used by all protected components
- Changes affect authentication flow

#### flowStore.ts 🔴

- Flow builder state (nodes, edges, selected node)
- Central to flow builder functionality
- Changes affect flow builder behavior

### frontend/src/api/

#### client.ts 🔴

- Axios instance with interceptors
- Adds auth tokens to requests
- Handles 401 errors globally
- Changes affect all API calls

#### auth.ts / files.ts / flows.ts / transform.ts 🟢

- API client functions for each domain
- Type-safe functions that call backend
- Safe to add new endpoints here

### frontend/src/components/

#### Auth/

- **Login.tsx** 🟢 - Login form
- **Register.tsx** 🟢 - Registration form
- **ProtectedRoute.tsx** 🟡 - Wraps routes requiring authentication

#### Dashboard/

- **Dashboard.tsx** 🟡 - Main dashboard showing saved flows
- Lists user's flows and files

#### FlowBuilder/

- **FlowBuilder.tsx** 🔴 - Main flow builder component
- Orchestrates flow builder UI, previews, and export
- Export button uses Output block file + sheet structure (zips when multiple files)
- Auto-swaps placeholder output previews to real output sheets once they exist
- Changes affect entire flow builder

- **FlowPipeline.tsx** 🔴 - Sequential pipeline UI with @dnd-kit drag-and-drop and previews
  - Drag reorder lives here; drag end must not throw or drops will revert to original order
- **SortableNode.tsx** 🟢 - Wraps flow nodes with sortable drag handles and logic
- **PipelineNodeCard.tsx** 🟢 - Shared node card rendering for pipeline steps
  - Shows step label + config summary text
  - Hosts preview/export/delete buttons and forwards clicks to parent handlers
  - Safe to adjust styling; avoid adding stateful logic that affects flow execution
- **FlowCanvas.tsx** 🟡 - Legacy React Flow canvas (not used by pipeline UI)
  - Kept for backward compatibility and reference only
  - Not wired into current Flow Builder page
  - Changes here won’t affect the current UI unless it’s re-enabled
- **BlockPalette.tsx** 🟢 - Sidebar with available blocks
  - Defines which blocks are selectable and how they’re grouped
  - Highlights implemented blocks (for UI affordance only)
  - Changing block IDs impacts flow data and transform lookup
- **OperationSelectionModal.tsx** 🟡 - Modal for inserting new operation blocks
  - Lists available operations grouped by category
  - Highlighted operations are implemented; others are placeholders
- **FlowBuilder.tsx** 🟡 - Operation defaults + config skeletons for new blocks
- **PropertiesPanel.tsx** 🟡 - Panel for editing block config
  - Handles source file/sheet selection (with grouped sources in the UI), destination output sheet selection, and output file/sheet structure
  - Lets users choose an output group for saved exports
  - Output block can copy the selected source file or file group into output files
  - Selecting a file group in Sources expands into one source per file (rendered as a grouped section)
  - Auto-selects the first output sheet as destination when outputs exist and destination is empty
  - Writes block config into node.data.config; save/reset for Remove Columns/Rows lives here
  - Be careful: changes here directly affect preview execution and export output
- **DataUploadModal.tsx** 🟡 - Modal for file groups + single uploads tied to a flow
  - Creates file groups, uploads files into them, and syncs file IDs to the node
  - Provides delete-all actions for group and single file lists (with confirmation)
- **OperationSelectionModal.tsx** 🟡 - Modal for selecting transforms

#### blocks/

- **BaseBlock.tsx** 🟡 - Base component for all blocks
- **UploadBlock.tsx** / **FilterBlock.tsx** / etc. 🟢 - Individual block types
- Safe to add new block types here

#### FileUpload/

- **FileUploader.tsx** 🟢 - Legacy single-file uploader
- Safe to remove once no screens reference it

#### Preview/

- **DataPreview.tsx** 🟢 - Displays data preview in table
  - Keeps a placeholder grid visible even when sheets are empty

### frontend/src/types/

#### index.ts 🟡

- Shared TypeScript types
- Used across frontend
- Changing types requires updating usages

#### block.ts 🟡

- Block-related types
- Used by flow builder

### frontend/src/lib/

#### blockRegistry.ts 🟡

- Registry of available block types
- Maps block types to components
- Adding blocks requires registration here

### frontend/src/hooks/

#### useUndoRedo.ts 🟡

- Undo/redo functionality for flow builder
- Optional feature, safe to modify

## Configuration Files

### backend/requirements.txt 🟢

- Python dependencies
- Safe to update versions (test first)

### frontend/package.json 🟢

- Node.js dependencies
- Safe to update versions (test first)

### frontend/tests/ 🟢

- Playwright end-to-end tests for the UI flow
- Focus on file upload and flow builder interactions

### docker-compose.yml 🟡

- Docker service configuration
- Changes affect how services run

### .env (not in repo) 🔴

- Environment variables (database URL, secrets)
- Never commit to git
- Required for app to run

## Danger Levels

🟢 **Safe to edit** - UI components, individual transforms, config files
🟡 **Edit carefully** - Routes, services, stores, core logic
🔴 **Understand before touching** - Authentication, database, state management, core systems
