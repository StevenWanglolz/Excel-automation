# SheetPilot

## What this is

SheetPilot is a low-code Excel automation platform that lets users upload Excel/CSV files and build sequential data transformation pipelines with drag-and-drop reordering. Users can filter rows, rename columns, remove duplicates, join data, and more - all without writing code. Each step targets a specific file + sheet, and an Output block maps those tables into one or many export sheets. The pipeline canvas supports pan/zoom with a compact floating undo/redo/zoom reset bar, and each step can render a preview on demand.

## Tech

- **Frontend:** React, TypeScript, Zustand, Tailwind CSS, @dnd-kit
- **Backend:** FastAPI (Python), SQLAlchemy, Pandas
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
- `docs/STATE.md` – state management
- `docs/API.md` – API endpoints
- `docs/DECISIONS.md` – why choices were made
- `docs/LEARNING.md` – learning resources
