# Codebase Learning Guide - SheetPilot

A practical guide to understanding how your Excel automation platform works.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [How Data Flows Through the System](#how-data-flows-through-the-system)
3. [Frontend Deep Dive](#frontend-deep-dive)
4. [Backend Deep Dive](#backend-deep-dive)
5. [Key Concepts & Patterns](#key-concepts--patterns)
6. [Feature Walkthroughs](#feature-walkthroughs)
7. [How to Read the Code](#how-to-read-the-code)

---

## Architecture Overview

### The Big Picture

Your application is a **full-stack web application** with three main parts:

```
┌─────────────┐      HTTP Requests      ┌─────────────┐
│   Frontend  │ ◄─────────────────────► │   Backend   │
│  (React)    │                          │  (FastAPI)  │
└─────────────┘                          └──────┬──────┘
                                                │
                                                ▼
                                         ┌─────────────┐
                                         │  PostgreSQL │
                                         │  Database   │
                                         └─────────────┘
```

### Technology Stack

**Frontend:**
- **React** - UI framework
- **TypeScript** - Type safety
- **Zustand** - State management (lightweight Redux alternative)
- **React Flow** - Drag-and-drop flow builder
- **Axios** - HTTP client for API calls
- **Vite** - Build tool and dev server

**Backend:**
- **FastAPI** - Python web framework (like Express.js but for Python)
- **SQLAlchemy** - Database ORM (Object-Relational Mapping)
- **PostgreSQL** - Database
- **Pandas** - Data manipulation (Excel/CSV processing)
- **Pydantic** - Data validation

### Project Structure

```
Excel-automation/
├── frontend/              # React application
│   └── src/
│       ├── main.tsx      # Entry point
│       ├── App.tsx       # Main app component with routes
│       ├── components/   # React components
│       ├── api/          # API client functions
│       ├── store/        # Zustand state stores
│       └── types/        # TypeScript type definitions
│
└── backend/              # FastAPI application
    └── app/
        ├── main.py       # Entry point, creates FastAPI app
        ├── api/routes/   # API endpoints (like controllers)
        ├── core/         # Configuration, database setup
        ├── models/       # Database models (like database schemas)
        ├── services/     # Business logic
        ├── transforms/   # Data transformation operations
        └── storage/      # File storage handling
```

---

## How Data Flows Through the System

### Example: User Uploads a File

Let's trace what happens when a user uploads an Excel file:

```
1. User clicks "Upload" in browser
   ↓
2. Frontend: FileUploader.tsx
   - User selects file
   - Creates FormData object
   - Calls filesApi.upload()
   ↓
3. Frontend: src/api/files.ts
   - Uses apiClient (axios) to send POST request
   - Includes auth token in header
   ↓
4. Backend: api/routes/files.py
   - Receives POST /api/files/upload
   - Validates request
   - Calls file_service.upload_file()
   ↓
5. Backend: services/file_service.py
   - Saves file to disk (uploads/ folder)
   - Creates database record
   - Returns file info
   ↓
6. Backend: models/file.py
   - SQLAlchemy model saves to PostgreSQL
   ↓
7. Response flows back:
   Backend → Frontend API → Component → UI updates
```

### Key Points:
- **Frontend** handles user interaction and displays data
- **Backend** handles business logic and data storage
- **Database** persists data permanently
- **API** is the bridge between frontend and backend

---

## Frontend Deep Dive

### Entry Point: `main.tsx`

```typescript
// This is the FIRST file that runs when your app starts
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

**What it does:**
- Finds the HTML element with id="root"
- Renders the `<App />` component into it
- React StrictMode helps catch bugs during development

### Main App: `App.tsx`

This file sets up **routing** - it decides which component to show based on the URL:

```typescript
<Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
  <Route path="/flow-builder" element={<ProtectedRoute><FlowBuilder /></ProtectedRoute>} />
</Routes>
```

**Key Concepts:**
- `/login` → Shows login page
- `/` → Shows dashboard (but only if authenticated)
- `ProtectedRoute` checks if user is logged in before showing the page

### State Management: Zustand Stores

**What is Zustand?**
A simple state management library. Think of it as a global JavaScript object that any component can read/write.

**Example: `authStore.ts`**

```typescript
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('access_token'),
  isAuthenticated: !!localStorage.getItem('access_token'),
  
  login: async (credentials) => {
    // 1. Call API to login
    // 2. Save token to localStorage
    // 3. Update state
    set({ user, token, isAuthenticated: true });
  }
}));
```

**How to use it in a component:**
```typescript
const { user, login, isAuthenticated } = useAuthStore();
// Now you can use user, call login(), check isAuthenticated
```

**Why use stores?**
- Share data between components without "prop drilling"
- Keep authentication state available everywhere
- Manage complex state (like flow builder nodes/edges)

### API Client: `api/client.ts`

This is your **HTTP request handler**:

```typescript
const apiClient = axios.create({
  baseURL: 'http://localhost:8000/api',
});

// Automatically adds auth token to every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

**What it does:**
- Creates an axios instance with base URL
- **Interceptor**: Automatically adds auth token to every request
- **Interceptor**: Handles 401 errors (logs user out if token invalid)

**Usage in API files:**
```typescript
// src/api/files.ts
export const filesApi = {
  upload: (file: File) => apiClient.post('/files/upload', formData)
}
```

### Components Structure

**Component Types:**
1. **Pages** - Full page components (Dashboard, FlowBuilder)
2. **Blocks** - Reusable UI pieces (BaseBlock, FilterBlock)
3. **Modals** - Popup dialogs (DataUploadModal, OperationSelectionModal)
4. **Common** - Shared components (ConfirmationModal)

**Component Pattern:**
```typescript
// 1. Import dependencies
import { useState } from 'react';
import { useAuthStore } from '../store/authStore';

// 2. Define component
export const MyComponent = () => {
  // 3. Use hooks (state, stores, etc.)
  const [count, setCount] = useState(0);
  const { user } = useAuthStore();
  
  // 4. Return JSX
  return <div>Hello {user?.email}</div>;
};
```

---

## Backend Deep Dive

### Entry Point: `main.py`

This creates your FastAPI application:

```python
app = FastAPI(title="SheetPilot API")

# Add CORS middleware (allows frontend to call backend)
app.add_middleware(CORSMiddleware, ...)

# Register routes
app.include_router(auth.router, prefix="/api")
app.include_router(files.router, prefix="/api")
```

**What happens:**
- Creates FastAPI app instance
- Sets up CORS (Cross-Origin Resource Sharing) so frontend can call it
- Registers all route modules
- Creates database tables on startup

### Database Models: `models/`

These define your **database schema**:

```python
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
```

**What it does:**
- SQLAlchemy converts this Python class into a database table
- `Base` comes from `database.py` - it's the base class for all models
- Columns define the table structure

**How it works:**
- When you create a `User` object and save it, SQLAlchemy generates SQL
- Example: `db.add(user); db.commit()` → `INSERT INTO users ...`

### API Routes: `api/routes/`

These are your **endpoints** (like REST API endpoints):

```python
@router.post("/files/upload")
async def upload_file(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Validate user is authenticated (get_current_user)
    # 2. Get database session (get_db)
    # 3. Process the file
    # 4. Return response
    return {"file_id": file_id, "filename": filename}
```

**Key Concepts:**
- `@router.post()` - HTTP POST endpoint
- `Depends()` - Dependency injection (gets current user, database session)
- `async def` - Async function (can handle multiple requests concurrently)

### Services: `services/`

**Business logic layer** - where the actual work happens:

```python
# services/file_service.py
def upload_file(db: Session, user_id: int, file: UploadFile):
    # 1. Validate file
    # 2. Save to disk
    # 3. Create database record
    # 4. Return file info
```

**Why separate services from routes?**
- Routes handle HTTP (request/response)
- Services handle business logic (can be reused, tested separately)

### Transforms: `transforms/`

These are your **data transformation operations**:

```python
# transforms/base.py
class BaseTransform(ABC):
    @abstractmethod
    def validate(self, df: pd.DataFrame, config: Dict) -> bool:
        pass
    
    @abstractmethod
    def execute(self, df: pd.DataFrame, config: Dict) -> pd.DataFrame:
        pass
```

**How it works:**
- Each transform (Filter, RenameColumn, etc.) inherits from `BaseTransform`
- `validate()` checks if the config is valid
- `execute()` performs the transformation on a pandas DataFrame
- Registry pattern keeps track of all available transforms

**Example Transform:**
```python
@register_transform("filter_rows")
class FilterRowsTransform(BaseTransform):
    def execute(self, df: pd.DataFrame, config: Dict) -> pd.DataFrame:
        column = config['column']
        operator = config['operator']
        value = config['value']
        
        if operator == 'equals':
            return df[df[column] == value]
        # ... more operators
```

---

## Key Concepts & Patterns

### 1. Dependency Injection (Backend)

**What it is:**
Instead of creating objects inside functions, you "inject" them as parameters.

```python
# ❌ Bad: Creating dependencies inside
def upload_file():
    db = SessionLocal()  # Created here
    # ...

# ✅ Good: Injecting dependencies
def upload_file(db: Session = Depends(get_db)):
    # db is provided by FastAPI
    # ...
```

**Why?**
- Easier to test (can pass mock database)
- Reusable (same function, different database)
- FastAPI handles lifecycle (opens/closes database connection)

### 2. Registry Pattern (Backend)

**What it is:**
A way to register and look up classes by name/ID.

```python
# Register
@register_transform("filter_rows")
class FilterRowsTransform(BaseTransform):
    pass

# Look up later
transform_class = get_transform("filter_rows")
transform = transform_class()
```

**Why?**
- Dynamic: Can add new transforms without changing core code
- Flexible: Frontend can request transforms by name
- Extensible: Easy to add new transformation types

### 3. Store Pattern (Frontend)

**What it is:**
Centralized state that multiple components can access.

```typescript
// Define store
const useAuthStore = create((set) => ({
  user: null,
  login: async (creds) => { /* ... */ }
}));

// Use in any component
const { user, login } = useAuthStore();
```

**Why?**
- Avoid prop drilling (passing data through many components)
- Single source of truth
- Easy to update from anywhere

### 4. Interceptor Pattern (Frontend)

**What it is:**
Code that runs automatically before/after requests.

```typescript
// Runs before every request
apiClient.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

**Why?**
- DRY (Don't Repeat Yourself): Add auth token once, not in every API call
- Centralized error handling
- Automatic token refresh, etc.

---

## Feature Walkthroughs

### Feature 1: User Authentication

**Flow:**
1. User enters email/password in `Login.tsx`
2. Component calls `authStore.login(credentials)`
3. Store calls `authApi.login()` → sends POST to `/api/auth/login`
4. Backend `auth.py` route validates credentials
5. Backend generates JWT token, returns it
6. Frontend saves token to `localStorage`
7. Frontend updates `authStore` with user data
8. User is redirected to dashboard

**Key Files:**
- Frontend: `components/Auth/Login.tsx`, `store/authStore.ts`, `api/auth.ts`
- Backend: `api/routes/auth.py`, `core/security.py`

**Learn This First:** This is the simplest feature - good starting point!

### Feature 2: File Upload

**Flow:**
1. User selects file in `FileUploader.tsx`
2. Component creates `FormData`, calls `filesApi.upload(file)`
3. API client sends POST with file to `/api/files/upload`
4. Backend `files.py` route receives file
5. `file_service.py` saves file to `uploads/` folder
6. Service creates database record in `File` model
7. Returns file ID and metadata
8. Frontend updates UI with uploaded file info

**Key Files:**
- Frontend: `components/FileUpload/FileUploader.tsx`, `api/files.ts`
- Backend: `api/routes/files.py`, `services/file_service.py`, `models/file.py`, `storage/local_storage.py`

### Feature 3: Flow Builder

**This is the most complex feature!**

**Flow:**
1. User opens `FlowBuilder.tsx`
2. Component uses `React Flow` library for drag-and-drop
3. User drags blocks from `BlockPalette.tsx` onto `FlowCanvas.tsx`
4. Each block is a React component (SourceBlock, FilterBlock, etc.)
5. User connects blocks with edges (arrows)
6. Flow state stored in `flowStore.ts` (nodes + edges)
7. When user clicks "Execute":
   - Frontend converts flow to JSON
   - Sends to `/api/transform/execute`
   - Backend `transform.py` route receives flow
   - Backend executes each transform in order
   - Returns result data
   - Frontend shows preview in `DataPreview.tsx`

**Key Files:**
- Frontend: `components/FlowBuilder/FlowBuilder.tsx`, `FlowCanvas.tsx`, `store/flowStore.ts`
- Backend: `api/routes/transform.py`, `services/transform_service.py`, `transforms/`

**Learn This Last:** Most complex, builds on other concepts

---

## How to Read the Code

### Step-by-Step Process

When you want to understand a feature:

1. **Start with the UI**
   - Find the component that shows the feature
   - Look at what user interactions it handles (buttons, forms, etc.)

2. **Follow the data flow**
   - Where does user input go? (state, API call, etc.)
   - What API endpoint does it call?
   - What does the backend do with it?

3. **Understand the backend**
   - What route handles the request?
   - What service does the work?
   - What models/database tables are involved?

4. **Trace the response back**
   - How does data come back?
   - How does the UI update?

### Reading Tips

**For Frontend Files:**
- Look for `useState`, `useEffect` - these manage component state
- Look for store usage (`useAuthStore`, `useFlowStore`) - shared state
- Look for API calls - these talk to backend
- Follow imports to see dependencies

**For Backend Files:**
- Look for `@router.get/post` - these are API endpoints
- Look for `Depends()` - these are dependencies (database, auth)
- Follow function calls to services
- Check models to understand data structure

**Common Patterns:**
- `async/await` - asynchronous operations (API calls, database)
- `try/except` (Python) or `try/catch` (TypeScript) - error handling
- Type hints (Python) or TypeScript types - tells you what data looks like

### Example: Reading a Route File

```python
@router.post("/files/upload")  # ← This is the endpoint URL
async def upload_file(          # ← Function name
    file: UploadFile,            # ← Request parameter (the file)
    current_user: User = Depends(get_current_user),  # ← Auth check
    db: Session = Depends(get_db)  # ← Database session
):
    # Function body - what happens when this endpoint is called
    return {"file_id": 123}      # ← Response sent back to frontend
```

**Questions to ask:**
- What URL does this handle? (`POST /api/files/upload`)
- What data does it need? (`file`, authenticated `user`)
- What does it do? (Read the function body)
- What does it return? (The return statement)

---

## Learning Path Recommendations

### Week 1: Basics
1. ✅ Understand the architecture (this guide)
2. ✅ Trace authentication flow end-to-end
3. ✅ Understand how frontend and backend communicate
4. ✅ Learn how to read route files and components

### Week 2: Core Features
1. ✅ Understand file upload flow
2. ✅ Learn how database models work
3. ✅ Understand services pattern
4. ✅ Learn how API client works

### Week 3: Advanced
1. ✅ Understand flow builder architecture
2. ✅ Learn transform system
3. ✅ Understand state management (stores)
4. ✅ Learn how to add new features

### Week 4: Mastery
1. ✅ Be able to add new transforms
2. ✅ Be able to add new API endpoints
3. ✅ Be able to add new UI components
4. ✅ Understand the full stack flow

---

## Quick Reference

### Frontend → Backend Communication

```typescript
// Frontend: src/api/files.ts
export const filesApi = {
  upload: (file: File) => 
    apiClient.post('/files/upload', formData)
}

// Backend: api/routes/files.py
@router.post("/files/upload")
async def upload_file(file: UploadFile):
    return {"file_id": 123}
```

### Database Operations

```python
# Create
user = User(email="test@example.com", ...)
db.add(user)
db.commit()

# Read
user = db.query(User).filter(User.email == "test@example.com").first()

# Update
user.email = "new@example.com"
db.commit()

# Delete
db.delete(user)
db.commit()
```

### State Management

```typescript
// In store
const useMyStore = create((set) => ({
  data: null,
  setData: (newData) => set({ data: newData })
}));

// In component
const { data, setData } = useMyStore();
```

---

## Next Steps

1. **Start the application** and use it
2. **Pick one feature** and trace it through the code
3. **Make a small change** (change a label, add a console.log)
4. **Ask questions** - I can explain any file or concept!

Remember: You don't need to understand everything at once. Learn incrementally, and focus on what you need to modify.

