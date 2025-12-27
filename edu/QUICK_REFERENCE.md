# Quick Reference Cheat Sheet

A quick lookup guide for common tasks and concepts.

---

## File Locations

### Frontend Entry Points
- **App Entry**: `frontend/src/main.tsx`
- **Routes**: `frontend/src/App.tsx`
- **API Client**: `frontend/src/api/client.ts`

### Backend Entry Points
- **App Entry**: `backend/app/main.py`
- **Routes**: `backend/app/api/routes/`
- **Database**: `backend/app/core/database.py`

### Key Components
- **Login**: `frontend/src/components/Auth/Login.tsx`
- **Dashboard**: `frontend/src/components/Dashboard/Dashboard.tsx`
- **Flow Builder**: `frontend/src/components/FlowBuilder/FlowBuilder.tsx`
- **File Upload**: `frontend/src/components/FileUpload/FileUploader.tsx`

### Key Backend Files
- **Auth Routes**: `backend/app/api/routes/auth.py`
- **File Routes**: `backend/app/api/routes/files.py`
- **Transform Routes**: `backend/app/api/routes/transform.py`
- **File Service**: `backend/app/services/file_service.py`
- **Transform Service**: `backend/app/services/transform_service.py`

---

## Common Patterns

### Frontend: API Call Pattern
```typescript
// 1. In api/ file
export const myApi = {
  doSomething: (data: MyData) => 
    apiClient.post('/endpoint', data)
};

// 2. In component
const handleClick = async () => {
  try {
    const result = await myApi.doSomething(data);
    // Handle success
  } catch (error) {
    // Handle error
  }
};
```

### Frontend: Using Store
```typescript
// Get store
const { data, setData } = useMyStore();

// Update store
setData(newData);
```

### Backend: Route Pattern
```python
@router.post("/endpoint")
async def my_endpoint(
    data: MyModel,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Do something
    return {"result": "success"}
```

### Backend: Database Operation
```python
# Create
item = Model(field=value)
db.add(item)
db.commit()

# Read
item = db.query(Model).filter(Model.id == id).first()

# Update
item.field = new_value
db.commit()

# Delete
db.delete(item)
db.commit()
```

---

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Files
- `POST /api/files/upload` - Upload file
- `GET /api/files` - List user's files
- `GET /api/files/{id}/preview` - Preview file data

### Flows
- `POST /api/flows` - Create/save flow
- `GET /api/flows` - List user's flows
- `GET /api/flows/{id}` - Get flow by ID
- `DELETE /api/flows/{id}` - Delete flow

### Transform
- `POST /api/transform/execute` - Execute flow
- `POST /api/transform/export` - Export result

---

## State Stores

### Auth Store (`useAuthStore`)
```typescript
{
  user: User | null,
  token: string | null,
  isAuthenticated: boolean,
  login: (creds) => Promise<void>,
  register: (data) => Promise<void>,
  logout: () => void,
  checkAuth: () => Promise<void>
}
```

### Flow Store (`useFlowStore`)
```typescript
{
  nodes: Node[],
  edges: Edge[],
  selectedNode: Node | null,
  addNode: (node) => void,
  updateNode: (id, updates) => void,
  deleteNode: (id) => void,
  addEdge: (edge) => void,
  setSelectedNode: (node) => void,
  getFlowData: () => FlowData,
  loadFlowData: (data) => void
}
```

---

## Database Models

### User
```python
id: int (primary key)
email: str (unique)
hashed_password: str
full_name: str | None
is_active: bool
created_at: datetime
updated_at: datetime
```

### File
```python
id: int (primary key)
user_id: int (foreign key → User)
filename: str
file_path: str
file_size: int
mime_type: str
created_at: datetime
```

### Flow
```python
id: int (primary key)
user_id: int (foreign key → User)
name: str
description: str | None
flow_data: dict (JSON)
created_at: datetime
updated_at: datetime
```

---

## Transform Types

Available transforms (from registry):
- `filter_rows` - Filter rows by condition
- `rename_column` - Rename a column
- `remove_duplicates` - Remove duplicate rows
- `select_columns` - Keep only specified columns
- `sort_rows` - Sort by column
- `join` - Join two dataframes
- `lookup` - Lookup values from another dataframe

---

## Common Tasks

### Add a New API Endpoint

**Backend:**
1. Add route in `backend/app/api/routes/[module].py`
2. Add service function in `backend/app/services/[module]_service.py`
3. Test at `http://localhost:8000/docs`

**Frontend:**
1. Add function in `frontend/src/api/[module].ts`
2. Use in component

### Add a New Transform

**Backend:**
1. Create class in `backend/app/transforms/[name].py`
2. Inherit from `BaseTransform`
3. Implement `validate()` and `execute()`
4. Register with `@register_transform("id")`
5. Import in `backend/app/main.py`

**Frontend:**
1. Create block component in `frontend/src/components/blocks/`
2. Add to `BlockPalette.tsx`
3. Register in `FlowCanvas.tsx` nodeTypes

### Add a New Component

1. Create file in `frontend/src/components/`
2. Export component
3. Import and use in parent component

### Debug Frontend

```typescript
// Add console.log
console.log('Variable:', variable);

// Use browser DevTools
// - Console tab: See logs
// - Network tab: See API calls
// - React DevTools: Inspect components
```

### Debug Backend

```python
# Add print statement
print(f"Variable: {variable}")

# Check logs
docker-compose logs -f backend

# Use FastAPI docs
# http://localhost:8000/docs
```

---

## Environment Variables

### Frontend (.env)
```
VITE_API_URL=http://localhost:8000/api
```

### Backend (.env)
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sheetpilot
SECRET_KEY=your-secret-key
CORS_ORIGINS=http://localhost:5173
UPLOAD_DIR=./uploads
```

---

## Common Commands

### Start Application
```bash
./start.sh
# or
docker-compose up --build
```

### Stop Application
```bash
./stop.sh
# or
docker-compose down
```

### View Logs
```bash
docker-compose logs -f
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Access Containers
```bash
docker-compose exec backend bash
docker-compose exec frontend sh
```

---

## TypeScript Types

### Common Types
```typescript
// User
interface User {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
}

// File
interface File {
  id: number;
  filename: string;
  file_size: number;
  created_at: string;
}

// Flow
interface FlowData {
  nodes: FlowNode[];
  edges: FlowEdge[];
}
```

---

## Python Types

### Common Imports
```python
from fastapi import FastAPI, Depends, UploadFile
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
```

---

## React Patterns

### Component with State
```typescript
const MyComponent = () => {
  const [state, setState] = useState(initial);
  
  const handleClick = () => {
    setState(newValue);
  };
  
  return <button onClick={handleClick}>Click</button>;
};
```

### Component with Store
```typescript
const MyComponent = () => {
  const { data, updateData } = useMyStore();
  
  return <div>{data}</div>;
};
```

### Component with API Call
```typescript
const MyComponent = () => {
  const [loading, setLoading] = useState(false);
  
  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await myApi.getData();
      // Use data
    } finally {
      setLoading(false);
    }
  };
  
  return <button onClick={fetchData}>Load</button>;
};
```

---

## FastAPI Patterns

### Basic Route
```python
@router.get("/items")
async def get_items(db: Session = Depends(get_db)):
    items = db.query(Item).all()
    return items
```

### Route with Auth
```python
@router.post("/items")
async def create_item(
    item: ItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    new_item = Item(**item.dict(), user_id=current_user.id)
    db.add(new_item)
    db.commit()
    return new_item
```

### Route with File Upload
```python
@router.post("/upload")
async def upload_file(
    file: UploadFile,
    current_user: User = Depends(get_current_user)
):
    # Process file
    return {"filename": file.filename}
```

---

## Debugging Tips

### Frontend Issues
1. Check browser console for errors
2. Check Network tab for failed requests
3. Add console.logs to trace execution
4. Use React DevTools to inspect state

### Backend Issues
1. Check backend logs: `docker-compose logs -f backend`
2. Check FastAPI docs: `http://localhost:8000/docs`
3. Add print statements
4. Check database: `docker-compose exec db psql -U postgres -d sheetpilot`

### Database Issues
1. Check connection string in `.env`
2. Verify database is running: `docker-compose ps`
3. Check tables: Connect to database and run `\dt`

---

## File Structure Quick Look

```
Frontend Request Flow:
Component → API Function → apiClient → Backend Route → Service → Database

Backend Request Flow:
Route → Dependencies (auth, db) → Service → Model → Database → Response
```

---

## Need Help?

1. Check `CODEBASE_LEARNING_GUIDE.md` for detailed explanations
2. Check `HANDS_ON_EXERCISES.md` for practice exercises
3. Ask me to explain any file or concept!
4. Use browser DevTools and backend logs to debug

