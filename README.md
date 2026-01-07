# SheetPilot

## What this is

SheetPilot is a low-code Excel automation platform that lets users upload Excel/CSV files (as single files or named groups) and build sequential data transformation pipelines with drag-and-drop reordering. Users can filter rows, rename columns, remove duplicates, join data, and more - all without writing code. Flows default to "Untitled" and now feature **Auto-Save on Batch Creation**, ensuring that new flows are automatically persisted when you create your first file group. Each step can select multiple sources and write to one or many output sheets depending on the output configuration, with group sources shown as a single section in the Properties panel to keep long lists manageable. The pipeline canvas supports pan/zoom with a compact floating undo/redo/zoom reset bar, and each step can render a preview on demand with file + sheet switching (preview selection doesn’t change targets). Source previews require selecting a sheet for multi-sheet files, and selecting a file group auto-picks the first file (even if the group list loads later) so previews never blank out or clear while files load. Switching files in a grouped preview keeps the active group selection so the dropdown stays in sync with the chosen batch. The preview toolbar now exposes batch/individual/all source toggles so the file selector only lists the sources added to the current block, keeping g2g/g2m/m2m previews aligned with the configured workflow. When multiple batches feed a block, the header additionally shows a File group dropdown with each batch name so you can pick which group to inspect. Preview selection changes force a refresh even if the same file stays selected. Previews are cached server-side and warmed after config saves, preview opens, or file uploads to keep sheet switching snappy, and warmed previews now keep sheet lists visible immediately after uploads. Output groups persist exports automatically with numbered filenames to avoid conflicts. Saving a flow requires a name, and file add/remove or configuration actions mark the flow as dirty for saving.

The Properties panel now relies on the grouped **Source** dropdown embedded in every source row: click **Add source**, pick the desired batch (with “Use all {Batch}”) or single file from that dropdown, then select the sheet below it. Each row still exposes **Create destination from this file**, which auto-inserts a paired destination and populates the new `Linked sources` multi-select, keeping g2g (one file per output), g2m (batch → append destination), and m2m (individual input → individual output) flows easy to configure without juggling separate selectors.

## Tech

- **Frontend:** React, TypeScript, Zustand, Tailwind CSS, @dnd-kit
- **Backend:** FastAPI (Python), SQLAlchemy, Pandas
- **DB Driver:** psycopg2-binary
- **Database:** PostgreSQL
- **Deployment:** Docker Compose (v2+)

## Run locally

**With Docker (recommended):**
```bash
./start.sh
```

**Auth bypass (dev only):**
```bash
# Backend (.env or exported env vars)
DISABLE_AUTH=true
DEV_AUTH_EMAIL=test@gmail.com
DEV_AUTH_PASSWORD=test
```

VS Code tasks are available in `.vscode/tasks.json` for `start`, `restart`, and `stop`.

**Without Docker:**
```bash
# Requires Node.js 20.19+ (Vite 7 requirement)
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

Dev note: if the Vite overlay appears, fix the reported compile error before the UI will load.

## Test

Playwright UI tests (auth bypass friendly):
```bash
cd frontend
npx playwright test
```

Access at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Test data

- Account: `test@gmail.com` / `test`
- Files: `Test Files/` (example: `Test Files/example data 1.xlsx`)

## Where to look

- `docs/ARCHITECTURE.md` – how things fit together
- `docs/DATA_FLOW.md` – where data comes from and goes (including upload/file resolution)
- `docs/FILES.md` – what each file does
- `docs/USER_MANUAL.md` – how to run each I/O scenario
- `docs/STATE.md` – state management
- `docs/API.md` – API endpoints
- `docs/DECISIONS.md` – why choices were made
- `docs/LEARNING.md` – learning resources
