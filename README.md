# SheetPilot

## What this is

SheetPilot is a low-code Excel automation platform that lets users upload Excel/CSV files and build data transformation workflows using a visual drag-and-drop interface. Users can filter rows, rename columns, remove duplicates, join data, and more - all without writing code. The platform saves automation flows for reuse and exports transformed data back to Excel.

## Tech

- **Frontend:** React, TypeScript, Zustand, React Flow, Tailwind CSS
- **Backend:** FastAPI (Python), SQLAlchemy, Pandas
- **Database:** PostgreSQL
- **Deployment:** Docker Compose

## Run locally

**With Docker (recommended):**
```bash
./start.sh
```

**Without Docker:**
```bash
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

Access at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Where to look

- `docs/ARCHITECTURE.md` – how things fit together
- `docs/DATA_FLOW.md` – where data comes from and goes
- `docs/FILES.md` – what each file does
- `docs/STATE.md` – state management
- `docs/API.md` – API endpoints
- `docs/DECISIONS.md` – why choices were made
- `docs/LEARNING.md` – learning resources
