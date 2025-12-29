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

**Persistence:**
- Token stored in `localStorage` for persistence across page refreshes
- Token automatically added to API requests via interceptor
- If token is invalid, user is logged out automatically

**Usage:**
```typescript
const { user, isAuthenticated, login } = useAuthStore();
```

### Flow Store (`src/store/flowStore.ts`)

**Purpose:** Manages flow builder state (nodes, edges, selections).

**State:**
```typescript
{
  nodes: Node[],              // Flow nodes (blocks)
  edges: Edge[],              // Connections between nodes
  selectedNode: Node | null   // Currently selected node
}
```

**Key Operations:**
- `addNode(node)` - Add a new node to the flow
- `updateNode(id, updates)` - Update node configuration
- `deleteNode(id)` - Remove node and its connections
- `addEdge(edge)` - Connect two nodes
- `deleteEdge(id)` - Remove connection
- `getFlowData()` - Convert to format for API (save flow)
- `loadFlowData(data)` - Load flow from API (edit existing flow)
- `clearFlow()` - Reset flow to empty state

**Usage:**
```typescript
const { nodes, edges, addNode, updateNode } = useFlowStore();
```

## State Flow Patterns

### Reading State
```typescript
// In any component
const { user, isAuthenticated } = useAuthStore();
const { nodes, edges } = useFlowStore();
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

