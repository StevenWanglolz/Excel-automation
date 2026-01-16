# File Map

This document explains the purpose of each major file and folder to help you re-orient quickly.

## Frontend

### src/components/FlowBuilder/

#### PropertiesPanel.tsx 🟡
- **Core Logic:** Handles the configuration UI for all nodes (Source, Transform, Output).
- **Key Responsibilities:**
    - Renders "Destinations" section where users configure output files.
    - Manages "Write Mode" (Create vs Append) and "Batch Output Mode".
    - Expands Batch Groups into individual file targets.
- **Recent Changes:** Output configuration moved here from dedicated Output nodes.

#### FlowBuilder.tsx 🟡
- **Core Logic:** Main canvas and flow state orchestrator.
- **Key Responsibilities:**
    - Manages nodes and edges (React Flow).
    - Handles auto-saving of flows.
    - Orchestrates flow execution via `transformApi`.

#### DataUploadModal.tsx
- **Core Logic:** Handles file uploads and grouping.
- **Key Responsibilities:**
    - Groups files into Batches.
    - Calls upload API and updates Flow state with file IDs.

## Backend

### app/api/routes/

#### transform.py 🟡
- **Core Logic:** Endpoint for executing flows (`/execute`) and exporting results (`/export`).
- **Key Responsibilities:**
    - Resolves output configuration (Write Mode, file naming) from Transform nodes.
    - Handles "Append to Existing" logic.
    - Delegates actual processing to `transform_service`.

#### files.py
- **Core Logic:** File management endpoints (upload, list, delete).

### app/services/

#### transform_service.py 🟡
- **Core Logic:** The engine that runs the transformation pipeline.
- **Key Responsibilities:**
    - Takes input DataFrame and applies operations (Row Filter, etc.).
    - Returns the final DataFrame for preview or export.

#### file_service.py
- **Core Logic:** File I/O and parsing.
- **Key Responsibilities:**
    - Reads Excel/CSV into Pandas DataFrames.
    - Generates JSON previews of data.
