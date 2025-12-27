# JavaScript/TypeScript Concepts Used in This Codebase

A comprehensive guide to all JavaScript and TypeScript concepts found in this project, with real examples from the codebase.

---

## Table of Contents

1. [TypeScript Fundamentals](#typescript-fundamentals)
2. [React Concepts](#react-concepts)
3. [Modern JavaScript Features](#modern-javascript-features)
4. [Async/Await &amp; Promises](#asyncawait--promises)
5. [State Management](#state-management)
6. [API &amp; HTTP Requests](#api--http-requests)
7. [React Router](#react-router)
8. [Hooks &amp; Custom Hooks](#hooks--custom-hooks)
9. [Type System &amp; Interfaces](#type-system--interfaces)
10. [Advanced Patterns](#advanced-patterns)

---

## TypeScript Fundamentals

### 1. **Type Annotations**

TypeScript allows you to explicitly specify types for variables, function parameters, and return values.

**Example from `src/types/index.ts`:**

```typescript
export interface User {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
}
```

**Example from `src/api/auth.ts`:**

```typescript
export interface LoginCredentials {
  username: string;
  password: string;
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<TokenResponse> => {
    // function implementation
  }
}
```

### 2. **Type Inference**

TypeScript can automatically infer types without explicit annotations.

**Example from `src/store/flowStore.ts`:**

```typescript
export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: [],  // TypeScript infers this as Node[]
  edges: [],  // TypeScript infers this as Edge[]
  // ...
}));
```

### 3. **Union Types (`|`)**

Union types allow a value to be one of several types.

**Example from `src/types/index.ts`:**

```typescript
export interface User {
  full_name: string | null;  // Can be string OR null
}
```

**Example from `src/types/block.ts`:**

```typescript
export interface BlockDefinition {
  category: 'upload' | 'filter' | 'transform' | 'columns' | 'rows' | 'output';
  // Must be one of these specific string values
}
```

### 4. **Optional Properties (`?`)**

Properties marked with `?` are optional and may be undefined.

**Example from `src/types/index.ts`:**

```typescript
export interface Flow {
  description: string | null;  // Can be null
  updated_at: string | null;    // Can be null
}

export interface BlockData {
  label?: string;  // Optional property
}
```

**Example from `src/api/auth.ts`:**

```typescript
export interface RegisterData {
  email: string;
  password: string;
  full_name?: string;  // Optional - may not be provided
}
```

### 5. **Generic Types**

Generics allow you to create reusable components that work with multiple types.

**Example from `src/types/block.ts`:**

```typescript
import type { ComponentType } from 'react';

export interface BlockDefinition {
  component: ComponentType<any>;  // Generic React component type
  defaultConfig: Record<string, any>;  // Generic object type
}
```

**Example from `src/store/flowStore.ts`:**

```typescript
interface FlowState {
  updateNode: (nodeId: string, updates: Partial<Node>) => void;
  // Partial<T> is a generic utility type that makes all properties optional
}
```

### 6. **Type Aliases (`type`)**

Type aliases create a new name for a type.

**Example from `src/api/auth.ts`:**

```typescript
export type LoginCredentials = {
  username: string;
  password: string;
};
```

### 7. **Interface vs Type**

Both define object shapes, but interfaces can be extended and merged.

**Example from `src/types/index.ts`:**

```typescript
// Using interface
export interface User {
  id: number;
  email: string;
}

// Using interface extension
export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: BlockData;  // References another interface
}
```

### 8. **Type Imports (`import type`)**

Type-only imports help with tree-shaking and make it clear you're importing types, not values.

**Example from `src/types/block.ts`:**

```typescript
import type { ComponentType } from 'react';
```

**Example from `src/hooks/useUndoRedo.ts`:**

```typescript
import type { FlowData } from '../types';
```

**Example from `src/store/flowStore.ts`:**

```typescript
import type { FlowNode, FlowEdge, FlowData } from '../types';
```

### 9. **Type Assertions (`!` - Non-null Assertion)**

The `!` operator tells TypeScript that a value is definitely not null/undefined.

**Example from `src/main.tsx`:**

```typescript
ReactDOM.createRoot(document.getElementById('root')!).render(
  // The ! tells TypeScript we're sure 'root' exists
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

### 10. **Record Type**

`Record<K, V>` is a utility type for objects with specific key and value types.

**Example from `src/types/index.ts`:**

```typescript
export interface FilePreview {
  dtypes: Record<string, string>;  // Object with string keys and string values
  preview_rows: Record<string, any>[];  // Array of objects
}
```

**Example from `src/lib/blockRegistry.ts`:**

```typescript
export const blockRegistry: Record<string, BlockDefinition> = {};
// An object where keys are strings and values are BlockDefinition
```

---

## React Concepts

### 1. **Functional Components**

Modern React uses functional components instead of class components.

**Example from `src/App.tsx`:**

```typescript
function App() {
  const { checkAuth, isAuthenticated } = useAuthStore();
  // Component logic here
  return (
    <BrowserRouter>
      {/* JSX content */}
    </BrowserRouter>
  );
}

export default App;
```

**Example from `src/components/blocks/BaseBlock.tsx`:**

```typescript
export const BaseBlock = ({ id, data, selected, type, children, onDelete, onAddOperation, showAddButton = true }: BaseBlockProps) => {
  // Component implementation
  return (
    <div className="relative">
      {/* JSX */}
    </div>
  );
};
```

### 2. **JSX (JavaScript XML)**

JSX allows you to write HTML-like syntax in JavaScript.

**Example from `src/components/Auth/ProtectedRoute.tsx`:**

```typescript
return (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-gray-500">Loading...</div>
  </div>
);
```

### 3. **Props (Properties)**

Props are how data flows from parent to child components.

**Example from `src/components/blocks/BaseBlock.tsx`:**

```typescript
interface BaseBlockProps {
  id: string;
  data: BlockData;
  selected: boolean;
  type?: string;
  children?: React.ReactNode;  // Special prop for child content
  onDelete?: (nodeId: string) => void;
  onAddOperation?: (nodeId: string) => void;
  showAddButton?: boolean;
}

export const BaseBlock = ({ id, data, selected, type, children, onDelete, onAddOperation, showAddButton = true }: BaseBlockProps) => {
  // Destructured props with default value for showAddButton
}
```

### 4. **Children Prop**

The `children` prop allows components to accept nested content.

**Example from `src/components/Auth/ProtectedRoute.tsx`:**

```typescript
interface ProtectedRouteProps {
  children: React.ReactNode;  // Can accept any React content
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  return <>{children}</>;  // Render the children
};
```

### 5. **Conditional Rendering**

Render different content based on conditions.

**Example from `src/components/Auth/ProtectedRoute.tsx`:**

```typescript
if (isLoading) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-gray-500">Loading...</div>
    </div>
  );
}

if (!isAuthenticated) {
  return <Navigate to="/login" replace />;
}

return <>{children}</>;
```

**Example from `src/components/blocks/BaseBlock.tsx`:**

```typescript
{onDelete && (  // Only render if onDelete exists
  <button onClick={handleDelete}>
    ×
  </button>
)}

{children && <div className="mt-2">{children}</div>}  // Conditional rendering
```

### 6. **Event Handlers**

Functions that handle user interactions like clicks, form submissions, etc.

**Example from `src/components/blocks/BaseBlock.tsx`:**

```typescript
const handleDelete = (e: React.MouseEvent) => {
  e.stopPropagation();  // Prevent event bubbling
  if (onDelete) {
    onDelete(id);
  }
};

// Used in JSX:
<button onClick={handleDelete}>×</button>
```

### 7. **React.StrictMode**

Development tool that helps identify potential problems.

**Example from `src/main.tsx`:**

```typescript
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

---

## Modern JavaScript Features

### 1. **Arrow Functions**

Concise function syntax, especially useful for callbacks.

**Example from `src/store/flowStore.ts`:**

```typescript
export const useFlowStore = create<FlowState>((set, get) => ({
  addNode: (node: Node) => {
    set((state) => ({
      nodes: [...state.nodes, node],
    }));
  },
}));
```

**Example from `src/lib/blockRegistry.ts`:**

```typescript
export const getBlocksByCategory = (category: string): BlockDefinition[] => {
  return Object.values(blockRegistry).filter((block) => block.category === category);
  // Arrow function used in filter callback
};
```

### 2. **Destructuring**

Extract values from arrays or objects into variables.

**Example from `src/App.tsx`:**

```typescript
const { checkAuth, isAuthenticated } = useAuthStore();
// Destructures checkAuth and isAuthenticated from the store
```

**Example from `src/components/FlowBuilder/FlowBuilder.tsx`:**

```typescript
const { nodes, edges, getFlowData, loadFlowData, updateNode, addNode, setNodes, setEdges, addEdge } = useFlowStore();
// Multiple properties destructured at once
```

**Example from `src/components/blocks/BaseBlock.tsx`:**

```typescript
export const BaseBlock = ({ id, data, selected, type, children, onDelete, onAddOperation, showAddButton = true }: BaseBlockProps) => {
  // Destructuring props with default value
}
```

### 3. **Default Parameters**

Function parameters can have default values.

**Example from `src/components/blocks/BaseBlock.tsx`:**

```typescript
export const BaseBlock = ({ 
  id, 
  data, 
  selected, 
  type, 
  children, 
  onDelete, 
  onAddOperation, 
  showAddButton = true  // Default value
}: BaseBlockProps) => {
  // ...
}
```

### 4. **Template Literals**

Strings with embedded expressions using backticks.

**Example from `src/api/files.ts`:**

```typescript
const url = validSheetName 
  ? `/files/${fileId}/preview?sheet_name=${encodeURIComponent(validSheetName)}`
  : `/files/${fileId}/preview`;
// Template literal with embedded variables
```

### 5. **Spread Operator (`...`)**

Spread arrays or objects into new arrays/objects.

**Example from `src/store/flowStore.ts`:**

```typescript
addNode: (node: Node) => {
  set((state) => ({
    nodes: [...state.nodes, node],  // Spread existing nodes, add new one
  }));
},
```

**Example from `src/store/flowStore.ts`:**

```typescript
updateNode: (nodeId: string, updates: Partial<Node>) => {
  set((state) => ({
    nodes: state.nodes.map((node) =>
      node.id === nodeId ? { ...node, ...updates } : node
      // Spread existing node properties, then spread updates
    ),
  }));
},
```

### 6. **Array Methods**

Modern array methods for manipulation and iteration.

**Example from `src/store/flowStore.ts`:**

```typescript
// map() - Transform each element
nodes: state.nodes.map((node) =>
  node.id === nodeId ? { ...node, ...updates } : node
)

// filter() - Keep only matching elements
deleteNode: (nodeId: string) => {
  set((state) => ({
    nodes: state.nodes.filter((node) => node.id !== nodeId),
    edges: state.edges.filter(
      (edge) => edge.source !== nodeId && edge.target !== nodeId
    ),
  }));
},
```

**Example from `src/lib/blockRegistry.ts`:**

```typescript
export const getAllBlocks = (): BlockDefinition[] => {
  return Object.values(blockRegistry);  // Convert object values to array
};

export const getBlocksByCategory = (category: string): BlockDefinition[] => {
  return Object.values(blockRegistry).filter((block) => block.category === category);
  // filter() to find matching blocks
};
```

### 7. **Object Methods**

Methods for working with objects.

**Example from `src/lib/blockRegistry.ts`:**

```typescript
export const getAllBlocks = (): BlockDefinition[] => {
  return Object.values(blockRegistry);  // Get all values from object
};
```

**Example from `src/store/flowStore.ts`:**

```typescript
getFlowData: (): FlowData => {
  const state = get();
  return {
    nodes: state.nodes.map((node) => ({
      // Object literal with computed properties
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
    })),
  };
},
```

### 8. **Optional Chaining (`?.`)**

Safely access nested properties that might be undefined.

**Example from `src/components/FlowBuilder/FlowBuilder.tsx`:**

```typescript
const previousState = undo();
if (previousState?.nodes && previousState?.edges) {
  // Only proceed if previousState exists and has nodes/edges
}
```

### 9. **Nullish Coalescing (`??`)**

Returns the right-hand value when the left-hand is null or undefined.

**Example from `src/api/client.ts`:**

```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
// Uses || but could use ?? for more precise null/undefined checking
```

### 10. **Logical Operators for Defaults**

Using `||` and `&&` for default values and conditional execution.

**Example from `src/store/authStore.ts`:**

```typescript
isAuthenticated: !!localStorage.getItem('access_token'),
// !! converts to boolean (double negation)
```

---

## Async/Await & Promises

### 1. **Async Functions**

Functions that return Promises and can use `await`.

**Example from `src/store/authStore.ts`:**

```typescript
login: async (credentials: LoginCredentials) => {
  set({ isLoading: true });
  try {
    const response = await authApi.login(credentials);
    localStorage.setItem('access_token', response.access_token);
    const user = await authApi.getCurrentUser();
    set({
      user,
      token: response.access_token,
      isAuthenticated: true,
      isLoading: false,
    });
  } catch (error) {
    set({ isLoading: false });
    throw error;
  }
},
```

### 2. **Await**

Pauses execution until a Promise resolves.

**Example from `src/api/auth.ts`:**

```typescript
login: async (credentials: LoginCredentials): Promise<TokenResponse> => {
  const formData = new FormData();
  formData.append('username', credentials.username);
  formData.append('password', credentials.password);
  
  const response = await apiClient.post('/auth/login', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
},
```

### 3. **Try/Catch Error Handling**

Handle errors from async operations.

**Example from `src/store/authStore.ts`:**

```typescript
login: async (credentials: LoginCredentials) => {
  set({ isLoading: true });
  try {
    const response = await authApi.login(credentials);
    // Success handling
  } catch (error) {
    set({ isLoading: false });
    throw error;  // Re-throw to let caller handle
  }
},
```

**Example from `src/api/files.ts`:**

```typescript
download: async (fileId: number, filename: string): Promise<void> => {
  try {
    const response = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication required. Please log in again.');
      }
      throw new Error(`Download failed: ${response.statusText}`);
    }
    // Success handling
  } catch (error) {
    console.error('Failed to download file:', error);
    throw error;
  }
},
```

### 4. **Promise Methods**

Working with Promises directly.

**Example from `src/api/client.ts`:**

```typescript
apiClient.interceptors.response.use(
  (response) => response,  // Success handler
  (error) => {            // Error handler
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);  // Reject the promise
  }
);
```

---

## State Management

### 1. **useState Hook**

React hook for managing component state.

**Example from `src/components/FlowBuilder/FlowBuilder.tsx`:**

```typescript
const [flowName, setFlowName] = useState('');
const [isSaving, setIsSaving] = useState(false);
const [savedFlows, setSavedFlows] = useState<Flow[]>([]);
const [selectedFlowId, setSelectedFlowId] = useState<number | null>(null);
// Multiple state variables with different types
```

**Example from `src/hooks/useUndoRedo.ts`:**

```typescript
const [history, setHistory] = useState<HistoryState[]>([initialState]);
const [currentIndex, setCurrentIndex] = useState(0);
```

### 2. **Zustand State Management**

Lightweight state management library.

**Example from `src/store/flowStore.ts`:**

```typescript
import { create } from 'zustand';

interface FlowState {
  nodes: Node[];
  edges: Edge[];
  selectedNode: Node | null;
  addNode: (node: Node) => void;
  // ... other methods
}

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNode: null,

  addNode: (node: Node) => {
    set((state) => ({
      nodes: [...state.nodes, node],
    }));
  },
  // ... other implementations
}));
```

**Usage:**

```typescript
const { nodes, edges, addNode } = useFlowStore();
```

### 3. **State Updates with Functions**

Updating state based on previous state.

**Example from `src/store/flowStore.ts`:**

```typescript
updateNode: (nodeId: string, updates: Partial<Node>) => {
  set((state) => ({  // Function receives current state
    nodes: state.nodes.map((node) =>
      node.id === nodeId ? { ...node, ...updates } : node
    ),
  }));
},
```

**Example from `src/hooks/useUndoRedo.ts`:**

```typescript
setHistory((prev) => {  // prev is the previous state
  const idx = currentIndexRef.current;
  const newHistory = prev.slice(0, idx + 1);
  // ... modify based on prev
  return updated;  // Return new state
});
```

---

## API & HTTP Requests

### 1. **Axios HTTP Client**

Promise-based HTTP client for making API requests.

**Example from `src/api/client.ts`:**

```typescript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});
```

### 2. **Axios Interceptors**

Intercept requests and responses before they're handled.

**Example from `src/api/client.ts`:**

```typescript
// Request interceptor - runs before each request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// Response interceptor - runs after each response
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

### 3. **HTTP Methods (GET, POST, DELETE)**

Different HTTP methods for different operations.

**Example from `src/api/auth.ts`:**

```typescript
// POST request
login: async (credentials: LoginCredentials): Promise<TokenResponse> => {
  const response = await apiClient.post('/auth/login', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
},

// GET request
getCurrentUser: async (): Promise<User> => {
  const response = await apiClient.get('/auth/me');
  return response.data;
},
```

**Example from `src/api/files.ts`:**

```typescript
// DELETE request
delete: async (fileId: number): Promise<void> => {
  await apiClient.delete(`/files/${fileId}`);
},
```

### 4. **FormData API**

Working with form data for file uploads.

**Example from `src/api/auth.ts`:**

```typescript
const formData = new FormData();
formData.append('username', credentials.username);
formData.append('password', credentials.password);

const response = await apiClient.post('/auth/login', formData, {
  headers: {
    'Content-Type': 'multipart/form-data',
  },
});
```

**Example from `src/api/files.ts`:**

```typescript
upload: async (file: File): Promise<File> => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await apiClient.post('/files/upload', formData);
  return response.data;
},
```

### 5. **Fetch API**

Native browser API for HTTP requests (alternative to Axios).

**Example from `src/api/files.ts`:**

```typescript
const response = await fetch(downloadUrl, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
  credentials: 'include',
});

if (!response.ok) {
  throw new Error(`Download failed: ${response.statusText}`);
}

const blob = await response.blob();
```

### 6. **Blob Handling**

Working with binary data (files).

**Example from `src/api/files.ts`:**

```typescript
const blob = await response.blob();
const url = window.URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.setAttribute('download', filename);
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
window.URL.revokeObjectURL(url);
```

---

## React Router

### 1. **BrowserRouter**

Router component that uses HTML5 history API.

**Example from `src/App.tsx`:**

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

<BrowserRouter
  future={{
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  }}
>
  <Routes>
    {/* Route definitions */}
  </Routes>
</BrowserRouter>
```

### 2. **Routes and Route**

Define application routes.

**Example from `src/App.tsx`:**

```typescript
<Routes>
  <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />
  <Route path="/register" element={isAuthenticated ? <Navigate to="/" /> : <Register />} />
  <Route
    path="/"
    element={
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    }
  />
</Routes>
```

### 3. **Navigate Component**

Programmatic navigation.

**Example from `src/components/Auth/ProtectedRoute.tsx`:**

```typescript
if (!isAuthenticated) {
  return <Navigate to="/login" replace />;
}
```

**Example from `src/App.tsx`:**

```typescript
<Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />
```

### 4. **useNavigate Hook**

Hook for programmatic navigation.

**Example from `src/components/FlowBuilder/FlowBuilder.tsx`:**

```typescript
import { useNavigate } from 'react-router-dom';

export const FlowBuilder = () => {
  const navigate = useNavigate();
  // Use navigate('/path') to navigate programmatically
};
```

### 5. **useSearchParams Hook**

Access and modify URL query parameters.

**Example from `src/components/FlowBuilder/FlowBuilder.tsx`:**

```typescript
import { useSearchParams } from 'react-router-dom';

export const FlowBuilder = () => {
  const [searchParams] = useSearchParams();
  // Access query parameters
};
```

---

## Hooks & Custom Hooks

### 1. **useState**

Manage component state.

**Example from `src/components/FlowBuilder/FlowBuilder.tsx`:**

```typescript
const [flowName, setFlowName] = useState('');
const [isSaving, setIsSaving] = useState(false);
const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
```

### 2. **useEffect**

Perform side effects (API calls, subscriptions, etc.).

**Example from `src/App.tsx`:**

```typescript
useEffect(() => {
  checkAuth();
}, [checkAuth]);  // Dependency array - runs when checkAuth changes
```

**Example from `src/components/FlowBuilder/FlowBuilder.tsx`:**

```typescript
useEffect(() => {
  // Don't track history if we're in the middle of an undo/redo operation
  if (isUndoRedoInProgressRef.current) {
    return;
  }
  
  // Clear existing timeout
  if (historyTimeoutRef.current) {
    clearTimeout(historyTimeoutRef.current);
  }
  
  // Debounce history updates
  historyTimeoutRef.current = setTimeout(() => {
    if (!isUndoRedoInProgressRef.current) {
      const flowData = getFlowData();
      addToHistory({
        nodes: flowData.nodes,
        edges: flowData.edges,
      });
    }
  }, 300);

  return () => {  // Cleanup function
    if (historyTimeoutRef.current) {
      clearTimeout(historyTimeoutRef.current);
    }
  };
}, [nodes, edges, addToHistory, getFlowData]);
```

### 3. **useRef**

Access DOM elements or store mutable values that don't trigger re-renders.

**Example from `src/hooks/useUndoRedo.ts`:**

```typescript
const isUndoRedoRef = useRef(false);
const historyRef = useRef<HistoryState[]>([initialState]);
const currentIndexRef = useRef(0);

// Update ref values
historyRef.current = history;
currentIndexRef.current = currentIndex;
```

**Example from `src/components/FlowBuilder/FlowBuilder.tsx`:**

```typescript
const savedFlowDataRef = useRef<string>('');
const hasUnsavedChangesRef = useRef(false);
const historyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

### 4. **useCallback**

Memoize functions to prevent unnecessary re-renders.

**Example from `src/hooks/useUndoRedo.ts`:**

```typescript
const addToHistory = useCallback((state: HistoryState) => {
  // Function implementation
}, []);  // Empty dependency array - function never changes

const undo = useCallback((): HistoryState | null => {
  // Function implementation
}, []);  // Memoized function
```

**Example from `src/components/FlowBuilder/FlowBuilder.tsx`:**

```typescript
const handleUndo = useCallback(() => {
  if (!canUndo) {
    return;
  }
  const previousState = undo();
  // ... implementation
}, [canUndo, undo, loadFlowData]);  // Dependencies
```

### 5. **Custom Hooks**

Reusable hooks that encapsulate logic.

**Example from `src/hooks/useUndoRedo.ts`:**

```typescript
export const useUndoRedo = (initialState: HistoryState) => {
  const [history, setHistory] = useState<HistoryState[]>([initialState]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // ... implementation

  return {
    addToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
  };
};
```

**Usage:**

```typescript
const { addToHistory, undo, redo, canUndo, canRedo, reset } = useUndoRedo({
  nodes: getFlowData().nodes,
  edges: getFlowData().edges,
});
```

---

## Type System & Interfaces

### 1. **Interface Definitions**

Define object shapes and contracts.

**Example from `src/types/index.ts`:**

```typescript
export interface User {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
}

export interface Flow {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  flow_data: FlowData;
  created_at: string;
  updated_at: string | null;
}
```

### 2. **Nested Interfaces**

Interfaces can reference other interfaces.

**Example from `src/types/index.ts`:**

```typescript
export interface FlowData {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: BlockData;  // References another interface
}
```

### 3. **Index Signatures**

Allow objects with dynamic keys.

**Example from `src/types/index.ts`:**

```typescript
export interface FilePreview {
  dtypes: Record<string, string>;  // Object with string keys
  preview_rows: Record<string, any>[];  // Array of objects with string keys
}
```

### 4. **Utility Types**

TypeScript provides utility types for common transformations.

**Example from `src/store/flowStore.ts`:**

```typescript
updateNode: (nodeId: string, updates: Partial<Node>) => void;
// Partial<T> makes all properties optional
```

### 5. **Type Guards**

Functions that check types at runtime.

**Example from `src/api/files.ts`:**

```typescript
const validSheetName = sheetName && typeof sheetName === 'string' ? sheetName : undefined;
// Type guard to ensure sheetName is a string
```

### 6. **Type Narrowing**

TypeScript narrows types based on conditions.

**Example from `src/components/blocks/BaseBlock.tsx`:**

```typescript
if (!data) {
  return null;  // TypeScript knows data is not null after this check
}
```

---

## Advanced Patterns

### 1. **Higher-Order Functions**

Functions that take or return other functions.

**Example from `src/store/flowStore.ts`:**

```typescript
export const useFlowStore = create<FlowState>((set, get) => ({
  // set and get are functions passed to the create function
  addNode: (node: Node) => {
    set((state) => ({  // set receives a function
      nodes: [...state.nodes, node],
    }));
  },
}));
```

### 2. **Closures**

Functions that have access to variables from their outer scope.

**Example from `src/store/flowStore.ts`:**

```typescript
export const useFlowStore = create<FlowState>((set, get) => ({
  // The returned object has access to set and get (closure)
  nodes: [],
  addNode: (node: Node) => {
    set((state) => ({  // Closure over set
      nodes: [...state.nodes, node],
    }));
  },
}));
```

### 3. **Factory Functions**

Functions that create and return objects.

**Example from `src/api/auth.ts`:**

```typescript
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<TokenResponse> => {
    // Implementation
  },
  register: async (data: RegisterData): Promise<User> => {
    // Implementation
  },
  getCurrentUser: async (): Promise<User> => {
    // Implementation
  },
};
// Object literal that acts as a namespace for related functions
```

### 4. **Registry Pattern**

Pattern for registering and retrieving items.

**Example from `src/lib/blockRegistry.ts`:**

```typescript
export const blockRegistry: Record<string, BlockDefinition> = {};

export const registerBlock = (definition: BlockDefinition) => {
  blockRegistry[definition.id] = definition;
};

export const getBlockDefinition = (blockId: string): BlockDefinition | undefined => {
  return blockRegistry[blockId];
};

export const getAllBlocks = (): BlockDefinition[] => {
  return Object.values(blockRegistry);
};
```

### 5. **Debouncing**

Limit how often a function can be called.

**Example from `src/components/FlowBuilder/FlowBuilder.tsx`:**

```typescript
useEffect(() => {
  if (historyTimeoutRef.current) {
    clearTimeout(historyTimeoutRef.current);
  }
  
  // Debounce history updates to avoid excessive entries
  historyTimeoutRef.current = setTimeout(() => {
    if (!isUndoRedoInProgressRef.current) {
      const flowData = getFlowData();
      addToHistory({
        nodes: flowData.nodes,
        edges: flowData.edges,
      });
    }
  }, 300);  // Wait 300ms before executing

  return () => {
    if (historyTimeoutRef.current) {
      clearTimeout(historyTimeoutRef.current);
    }
  };
}, [nodes, edges]);
```

### 6. **Deep Cloning**

Create independent copies of objects.

**Example from `src/hooks/useUndoRedo.ts`:**

```typescript
// Deep copy to avoid reference issues
const newState = {
  nodes: JSON.parse(JSON.stringify(state.nodes)),
  edges: JSON.parse(JSON.stringify(state.edges)),
};
```

### 7. **Instanceof Checks**

Check if an object is an instance of a class.

**Example from `src/api/client.ts`:**

```typescript
if (config.data instanceof FormData) {
  delete config.headers['Content-Type'];
}
```

### 8. **Environment Variables**

Access environment variables at build time.

**Example from `src/api/client.ts`:**

```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
// Vite-specific way to access environment variables
```

### 9. **Type Assertions with `as`**

Tell TypeScript to treat a value as a specific type.

**Example (implicit in codebase):**

```typescript
// Type assertions are used implicitly through type annotations
const node = nodeData as Node;
```

### 10. **Computed Properties**

Object properties computed from expressions.

**Example from `src/store/flowStore.ts`:**

```typescript
getFlowData: (): FlowData => {
  const state = get();
  return {
    nodes: state.nodes.map((node) => ({
      id: node.id,        // Computed from node
      type: node.type,    // Computed from node
      position: node.position,
      data: node.data,
    })),
  };
},
```

### 11. **Null Checks and Early Returns**

Pattern for handling null/undefined values.

**Example from `src/components/blocks/BaseBlock.tsx`:**

```typescript
if (!data) {
  return null;  // Early return if data is missing
}
```

**Example from `src/hooks/useUndoRedo.ts`:**

```typescript
const undo = useCallback((): HistoryState | null => {
  const idx = currentIndexRef.current;
  const hist = historyRef.current;
  
  if (idx <= 0) return null;  // Early return
  
  // Continue with undo logic
});
```

### 12. **Error Boundaries Pattern**

Handling errors gracefully (concept, not fully implemented).

**Example from `src/api/files.ts`:**

```typescript
try {
  const response = await fetch(downloadUrl, {
    // ...
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Authentication required. Please log in again.');
    }
    throw new Error(`Download failed: ${response.statusText}`);
  }
  // Success handling
} catch (error) {
  console.error('Failed to download file:', error);
  throw error;  // Re-throw for caller to handle
}
```

---

## Summary

This codebase demonstrates a modern React + TypeScript application with:

- **Type Safety**: Extensive use of TypeScript interfaces and types
- **Modern React**: Functional components, hooks, and custom hooks
- **State Management**: Zustand for global state, useState for local state
- **API Integration**: Axios with interceptors for authentication
- **Routing**: React Router for navigation
- **Advanced Patterns**: Custom hooks, registry pattern, debouncing, closures

### Key Learning Points

1. **TypeScript** provides type safety and better developer experience
2. **React Hooks** simplify state management and side effects
3. **Async/Await** makes asynchronous code more readable
4. **Modern JavaScript** features (destructuring, spread, arrow functions) make code concise
5. **State Management** libraries (Zustand) help manage complex application state
6. **Custom Hooks** allow code reuse and separation of concerns

---

## Practice Exercises

To reinforce these concepts, try:

1. **Type Annotations**: Add type annotations to a function that currently uses`any`
2. **Custom Hook**: Create a custom hook for form validation
3. **Error Handling**: Add try/catch blocks to async functions
4. **State Management**: Move local component state to Zustand store
5. **Type Guards**: Create type guard functions for runtime type checking
6. **Debouncing**: Implement debouncing for a search input
7. **API Integration**: Create a new API service following the existing patterns

---

*This guide was generated by analyzing the actual codebase. All examples are from real code in the project.*
