# State Management

This document explains how state is managed in the SheetPilot application.

## Frontend State Architecture

SheetPilot uses **Zustand** for state management - a lightweight alternative to Redux with minimal boilerplate.

### Why Zustand?
- Simple API - no providers or context setup needed
- TypeScript support out of the box
- Small bundle size
- Easy to use - just import and call hooks

## State Stores

### Auth Store (`src/store/authStore.ts`)

**Purpose:** Manages authentication state across the application.

**State:**
```typescript
{
  user: User | null,           // Current user object
  token: string | null,        // JWT token
  isLoading: boolean,          // Loading state for async operations
  isAuthenticated: boolean      // Whether user is logged in
}
```

**Key Operations:**
- `login(credentials)` - Authenticate user, store token, fetch user data
- `register(data)` - Register new user, auto-login
- `logout()` - Clear token and user data
- `checkAuth()` - Verify stored token is still valid on app startup

**Dev Bypass:**
- Backend `DISABLE_AUTH=true` returns a dev user without validating JWTs.
- Optional `DEV_AUTH_EMAIL` / `DEV_AUTH_PASSWORD` control the dev user identity.

**Persistence:**
- Token stored in `localStorage` for persistence across page refreshes
- Token automatically added to API requests via interceptor
- If token is invalid, user is logged out automatically

**Usage:**
```typescript
const { user, isAuthenticated, login } = useAuthStore();
```

### Flow Store (`src/store/flowStore.ts`)

**Purpose:** Manages flow builder state (sequential nodes, optional edges, selections).

**Important:** Node order in the array defines execution order in the pipeline UI.

**State:**
```typescript
{
  nodes: Node[],              // Flow nodes (blocks)
  edges: Edge[],              // Legacy connections (pipeline ignores edges)
  selectedNode: Node | null   // Currently selected node
}
```

**Key Operations:**
- `addNode(node)` - Add a new node to the flow
- `updateNode(id, updates)` - Update node configuration
- `deleteNode(id)` - Remove node and its connections
- `addEdge(edge)` - Legacy; not used by sequential pipeline UI
- `deleteEdge(id)` - Remove connection
- `getFlowData()` - Convert to format for API (save flow)
- `loadFlowData(data)` - Load flow from API (edit existing flow)
- `clearFlow()` - Reset flow to empty state

**Usage:**
```typescript
const { nodes, edges, updateNode } = useFlowStore();
```

### FlowBuilder Local State (`src/components/FlowBuilder/FlowBuilder.tsx`)

**Purpose:** Manages UI-only state for the pipeline builder.

**State:**
```typescript
{
  stepPreviews: Record<string, FilePreview | null>, // Per-step preview cache
  previewLoading: Record<string, boolean>,          // Per-step loading flags
  previewErrors: Record<string, string | null>,     // Per-step error messages
  sourceSheetName: string | null,                   // Selected sheet for source preview
  lastTarget: { fileId: number | null, sheetName: string | null }, // Last-selected file+sheet target
  activePreviewNodeIds: Set<string>,                // Single active full-screen preview (stored as a set)
  viewAction: { type: 'fit' | 'reset'; id: number } | null // Pipeline view commands
}
```

**Triggers:**
- Node order or config changes → recompute previews from the changed step onward.
- Source file change → invalidates all previews.
- Target selection → updates the node's target and becomes the default for newly added steps.

**Preview caching (frontend-only):**
- File previews are cached by `fileId + sheetName` in-memory to speed up sheet switching.
- In-flight preview requests are deduped so rapid tab clicks reuse the same promise.
- After loading the active sheet, remaining sheets are prefetched in the background.
- Cached previews are applied immediately when the user switches sheets; the backend is only hit if the cache misses.

## State Flow Patterns

### Reading State
```typescript
// In any component
const { user, isAuthenticated } = useAuthStore();
const { nodes, edges } = useFlowStore(); // edges remain for stored flow compatibility
```

### Updating State
```typescript
// Direct update
const { setNodes } = useFlowStore();
setNodes(newNodes);

// Functional update (for complex logic)
const { updateNode } = useFlowStore();
updateNode(nodeId, { data: { ...node.data, config: newConfig } });
```

### Async Operations
```typescript
// Store handles async operations internally
const { login, isLoading } = useAuthStore();

const handleLogin = async () => {
  try {
    await login(credentials);
    // State automatically updated after successful login
  } catch (error) {
    // Handle error
  }
};
```

## Component State vs Store State

### When to Use Component State (`useState`)
- **Local UI state** - form inputs, modal open/close, temporary values
- **Component-specific** - doesn't need to be shared
- **Example:** Input field value, dropdown open state

```typescript
const [email, setEmail] = useState('');
const [isModalOpen, setIsModalOpen] = useState(false);
```

### Dashboard Local State

- `flows` and `isLoadingFlows` live in `frontend/src/components/Dashboard/Dashboard.tsx`.
- The dashboard uses a stale-while-revalidate pattern:
  - Reads cached flows from `localStorage` (`sheetpilot_flows_cache`) for instant render.
  - Refreshes from the API in the background and updates the cache.

### Properties Panel Local State

- `expandedSourceGroups` and `showGroupedDestinations` live in `frontend/src/components/FlowBuilder/PropertiesPanel.tsx`.
- These only affect UI presentation (grouped lists expanded/collapsed) and do not change flow data.

### When to Use Store State (Zustand)
- **Global state** - needed by multiple components
- **Persistent state** - should survive component unmount
- **Shared state** - multiple components need to read/write
- **Example:** User authentication, flow builder state

```typescript
const { user } = useAuthStore();  // Used in many components
const { nodes } = useFlowStore(); // Shared across flow builder
```

## State Initialization

### Auth Store
- On app startup: Reads token from `localStorage`
- Sets `isAuthenticated` based on token presence
- Calls `checkAuth()` to verify token is valid
- If token invalid, clears state and logs user out

### Flow Store
- Starts empty: `nodes: []`, `edges: []`
- Loaded from API when editing existing flow
- Cleared when starting new flow

## State Updates and Re-renders

### Automatic Re-renders
- Components using store hooks automatically re-render when state changes
- No need for `useEffect` or manual subscriptions
- Zustand handles optimization internally

### Example:
```typescript
function MyComponent() {
  const { user } = useAuthStore();
  // Component re-renders automatically when user changes
  return <div>Hello {user?.email}</div>;
}
```

## State Persistence

### Auth State
- **Token:** Persisted in `localStorage`
- **User data:** Fetched on login, not persisted (always fresh)
- **On refresh:** Token loaded from `localStorage`, user data fetched from API

### Flow State
- **Not persisted locally** - flows are saved to backend
- **On refresh:** Flow state is lost unless loaded from saved flow
- **Save flow:** Converts state to JSON, sends to backend

### Unsaved Changes (Flow Builder)

- New flows prompt on any meaningful edit, including name changes.
- Existing flows compare against the last saved snapshot including the name.

## State Synchronization

### Frontend → Backend
- State changes trigger API calls
- API responses update store state
- Example: Login updates `user` and `token` after API success

### Backend → Frontend
- API responses update store state
- No real-time sync (polling or WebSockets would be needed)
- State refreshed on user actions (refresh, navigate)

## Best Practices

### 1. Keep Stores Focused
- Each store handles one domain (auth, flow, etc.)
- Don't mix unrelated state in one store

### 2. Use TypeScript
- Define interfaces for store state
- Get type safety and autocomplete

### 3. Handle Loading States
- Use `isLoading` flag for async operations
- Show loading indicators in UI

### 4. Error Handling
- Stores can throw errors (caught by components)
- Components display error messages to users

### 5. Avoid Over-fetching
- Only store what's needed
- Fetch additional data when needed, not upfront

## Future Improvements

### Potential Additions
- **Undo/Redo store** - Track flow builder history
- **UI preferences store** - Theme, layout settings
- **Cache store** - Store API responses temporarily
- **Optimistic updates** - Update UI before API confirms
