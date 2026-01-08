# Data Flow

This document explains how data moves through the SheetPilot system. Local development runs the services via Docker Compose (v2+), which does not change the runtime data flow described below.

## Authentication Flow

### User Login

```
1. User enters email/password in Login.tsx
   ↓
2. Component calls authStore.login(credentials)
   ↓
3. Store calls authApi.login() → POST /api/auth/login
   ↓
4. Backend auth.py route:
   - Validates credentials (verify_password)
   - Creates JWT token with user ID
   - Returns token
   ↓
5. Frontend stores token in localStorage
   ↓
6. Store fetches user data via authApi.getCurrentUser()
   ↓
7. Store updates state: { user, token, isAuthenticated: true }
   ↓
8. User redirected to dashboard
```

**Dev bypass (optional):**

If backend `DISABLE_AUTH=true`, `authStore.checkAuth()` can call `/auth/me` without a token.
The store sets `isAuthenticated=true` and marks the session as bypassed when the backend
returns the dev user, which skips the login screen during local development.

**Step 1: User enters credentials**

```typescript
// frontend/src/components/Auth/Login.tsx (lines 12-28)
const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  setError(null);

  try {
    // OAuth2PasswordRequestForm expects 'username' field, but we use email
    // This mapping allows compatibility with backend OAuth2 endpoint
    await login({ username: email, password });
    // Navigate to dashboard on successful login
    navigate('/');
  } catch (err: unknown) {
    // Extract error message from API response
    // Backend returns errors in format: { response: { data: { detail: string } } }
    const error = err as { response?: { data?: { detail?: string } } };
    setError(error.response?.data?.detail || 'Login failed');
  }
};
```

**Step 2: Store login function**

```typescript
// frontend/src/store/authStore.ts (lines 26-45)
login: async (credentials: LoginCredentials) => {
  set({ isLoading: true });
  try {
    const response = await authApi.login(credentials);
    // Store token in localStorage for persistence across page refreshes
    // Token is used by API client interceptor to authenticate requests
    localStorage.setItem('access_token', response.access_token);
    // Fetch user data after login to populate user info in store
    const user = await authApi.getCurrentUser();
    set({
      user,
      token: response.access_token,
      isAuthenticated: true,
      isLoading: false,
    });
  } catch (error) {
    set({ isLoading: false });
    // Re-throw error so component can handle it (show error message)
    throw error;
  }
},
```

**Step 3: API call**

```typescript
// frontend/src/api/auth.ts (lines 21-32)
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

**Step 4: Backend route validates and creates token**

```python
# backend/app/api/routes/auth.py (lines 92-127)
@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Login and get access token"""
    # OAuth2PasswordRequestForm uses 'username' field, but we store emails
    # This mapping allows OAuth2 compatibility while using email as identifier
    user = db.query(User).filter(User.email == form_data.username).first()

    # Verify password using constant-time comparison to prevent timing attacks
    # Generic error message prevents email enumeration (can't tell if email exists)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check account status before issuing token - prevents disabled accounts from accessing system
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    # Create JWT token with user ID in 'sub' claim (JWT standard)
    # Token expiration prevents indefinite access if token is compromised
    access_token_expires = timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}
```

**Step 5: Token stored in localStorage**

```typescript
// frontend/src/store/authStore.ts (line 32)
localStorage.setItem('access_token', response.access_token);
```

**Step 6: Fetch user data**

```typescript
// frontend/src/store/authStore.ts (line 34)
const user = await authApi.getCurrentUser();
```

**Step 7: Update store state**

```typescript
// frontend/src/store/authStore.ts (lines 35-40)
set({
  user,
  token: response.access_token,
  isAuthenticated: true,
  isLoading: false,
});
```

### Token Usage

```
Every API Request:
1. apiClient interceptor reads token from localStorage
   ↓
2. Adds Authorization: Bearer {token} header
   ↓
3. Backend dependencies.py get_current_user():
   - Extracts token from header
   - Decodes and validates token
   - Looks up user in database
   - Returns user object
   ↓
4. Route handler receives authenticated user
```

**Step 1-2: Request interceptor adds token**

```typescript
// frontend/src/api/client.ts (lines 19-30)
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    // Add Bearer token to Authorization header (JWT standard)
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Don't set Content-Type for FormData - browser needs to set it with boundary
  // If we set it manually, file uploads will fail
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});
```

**Step 3: Backend validates token**

```python
# backend/app/api/dependencies.py (lines 13-66)
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    Get current authenticated user from JWT token.
    
    This is a FastAPI dependency used in route handlers to require authentication.
    Extracts token from Authorization header, validates it, and returns the user.
    If token is invalid or user doesn't exist, raises 401 Unauthorized.
    """
    # Reusable exception for invalid credentials
    # Consistent error format across all auth failures
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Decode and verify JWT token
    # Returns None if token is invalid, expired, or tampered with
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    # Extract user ID from token payload
    # JWT standard uses 'sub' (subject) claim for user identifier
    user_id_str = payload.get("sub")
    if user_id_str is None:
        raise credentials_exception

    # Convert user ID string to integer
    # Token stores ID as string, but database uses integer
    try:
        user_id: int = int(user_id_str)
    except (ValueError, TypeError):
        # Invalid user ID format - token might be corrupted
        raise credentials_exception

    # Look up user in database
    # If user was deleted after token was issued, this will be None
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    # Check if user account is active
    # Prevents disabled accounts from accessing the system
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    return user
```

## File Upload Flow

```
1. User selects a group or single upload in DataUploadModal.tsx
   ↓
2. Modal calls filesApi.upload(file, batchId?) → POST /api/files/upload?batch_id=...
   ↓
3. Backend validates batch ownership (when provided) and saves the file
   ↓
4. Service stores file metadata with optional batch_id
   ↓
6. If no flow is selected, Modal calls onEnsureFlowSaved() to auto-save as "Untitled"
    ↓
7. Backend creates new flow and returns its ID
    ↓
8. Modal recomputes the flow's file IDs from all groups + single files
    ↓
9. UI reflects saved state (Update Flow button enabled, Flow name as "Untitled")
```

**Step 6: Ensure flow is saved before creating group**

```typescript
// frontend/src/components/FlowBuilder/DataUploadModal.tsx (lines 313-331)
if (!currentFlowId) {
  if (onEnsureFlowSaved) {
    try {
      setIsLoadingBatches(true);
      // Calls the auto-save handler in FlowBuilder
      currentFlowId = await onEnsureFlowSaved();
    } catch (saveErr) {
      // ... error handling
    }
  }
}
```

**Step 7: Auto-save implementation**

```typescript
// frontend/src/components/FlowBuilder/FlowBuilder.tsx (lines 2032-2078)
const handleAutoSave = async (): Promise<number> => {
  if (selectedFlowId) return selectedFlowId;
  if (creatingFlowRef.current) return creatingFlowRef.current;

  setIsSaving(true);
  const createPromise = (async () => {
    try {
      const flowData = getFlowData();
      const defaultName = flowName.trim() || 'Untitled';
      const createdFlow = await flowsApi.create({
        name: defaultName,
        flow_data: flowData,
      });
      // ... update state and refs
      return createdFlow.id;
    } finally {
      setIsSaving(false);
      creatingFlowRef.current = null;
    }
  })();
  creatingFlowRef.current = createPromise;
  return createPromise;
};
```

**Step 8: Modal recomputes the flow's file IDs**

```typescript
// frontend/src/components/FlowBuilder/DataUploadModal.tsx (lines 140-205)
const handleBatchFileChange = async (
  batchId: number,
  e: React.ChangeEvent<HTMLInputElement>
) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;
  if (!validateFiles(files)) return;

  setIsUploading(true);
  setError(null);
  if (onUploadStart) onUploadStart();

  try {
    const newFiles = await uploadFiles(files, batchId);
    setBatchFilesById((prev) => ({
      ...prev,
      [batchId]: [...(prev[batchId] || []), ...newFiles],
    }));
    emitFileIds(getIncludedFileIds(individualFiles, {
      ...batchFilesById,
      [batchId]: [...(batchFilesById[batchId] || []), ...newFiles],
    }));
  } finally {
    setIsUploading(false);
  }
};
```

**Step 2: Create FormData and call API (optional batch_id)**

```typescript
// frontend/src/api/files.ts (lines 5-16)
upload: async (file: File, batchId?: number | null): Promise<File> => {
  const formData = new FormData();
  formData.append('file', file);
  const params = batchId ? `?batch_id=${batchId}` : '';
  
  // Content-Type will be set automatically by axios for FormData
  const response = await apiClient.post(`/files/upload${params}`, formData);
  return response.data;
},
```

**Step 3: Backend route validates batch and saves**

```python
# backend/app/api/routes/files.py (lines 66-88)
@router.post("/upload", response_model=FileResponse, status_code=201)
async def upload_file(
    batch_id: Optional[int] = Query(default=None),
    file: UploadFile = FastAPIFile(...),
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload a file (Excel or CSV)"""
    if batch_id is not None:
        batch = db.query(FileBatch).filter(
            FileBatch.user_id == current_user.id,
            FileBatch.id == batch_id
        ).first()
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
    db_file = await file_service.upload_file(db, current_user.id, file, batch_id=batch_id)
```

**Step 4: Service stores batch metadata**

```python
// backend/app/services/file_service.py (lines 31-61)
db_file = File(
    user_id=user_id,
    batch_id=batch_id,
    filename=filename,
    original_filename=file.filename,
    file_path=file_path,
    file_size=file_size,
    mime_type=mime_type
)
db.add(db_file)
db.commit()
db.refresh(db_file)
```

**Step 5: Modal updates the flow's file IDs**

```typescript
// frontend/src/components/FlowBuilder/DataUploadModal.tsx (lines 46-73)
const emitFileIds = useCallback((nextFileIds: number[]) => {
  if (!onFileUploaded) return;
  const normalized = [...new Set(nextFileIds)].sort((a, b) => a - b);
  const previous = lastEmittedFileIdsRef.current;
  if (
    previous.length === normalized.length &&
    previous.every((value, index) => value === normalized[index])
  ) {
    return;
  }
  lastEmittedFileIdsRef.current = normalized;
  onFileUploaded(normalized);
}, [onFileUploaded]);
```

## Initial File Resolution (Flow Builder)

```
1. User opens Data Upload modal for a node with saved file IDs
   ↓
2. Modal fetches files + groups from the API
   ↓
3. Modal groups files into groups + single lists
   ↓
4. Missing file IDs are removed from the node data (silent cleanup)
   ↓
5. Modal emits the recalculated file ID list
```

**Step 2-5: Resolve groups and emit cleaned file IDs**

```typescript
// frontend/src/components/FlowBuilder/DataUploadModal.tsx (lines 80-135)
const loadInitialFiles = async () => {
  setIsLoadingFiles(true);
  setIsLoadingBatches(true);
  try {
    const [allFiles, batchList] = await Promise.all([
      filesApi.list(),
      filesApi.listBatches(),
    ]);

    const filesById = new Map(allFiles.map((file) => [file.id, file]));
    const resolvedFiles = initialFileIds
      .map((id) => filesById.get(id))
      .filter((file): file is NonNullable<typeof file> => Boolean(file));

    const nextBatchFiles: Record<number, UploadedFile[]> = {};
    allFiles.forEach((file) => {
      if (!file.batch_id) return;
      if (!nextBatchFiles[file.batch_id]) {
        nextBatchFiles[file.batch_id] = [];
      }
      nextBatchFiles[file.batch_id].push({
        id: file.id,
        name: file.filename,
        originalName: file.original_filename,
        batchId: file.batch_id,
      });
    });

    const nextIndividuals = resolvedFiles
      .filter((file) => !file.batch_id)
      .map((file) => ({
        id: file.id,
        name: file.filename,
        originalName: file.original_filename,
        batchId: null,
      }));

    setBatches(batchList);
    emitFileIds(getIncludedFileIds(nextIndividuals, nextBatchFiles));
  } finally {
    setIsLoadingFiles(false);
    setIsLoadingBatches(false);
  }
};
```

**Note:** File previews are opened from the pipeline step preview icon, not from the upload modal.

## Group Source Selection (Operation Blocks)

```
1. User selects a file group in the Sources selector for an operation block
   ↓
2. PropertiesPanel expands the group into per-file targets and syncs destinations
   ↓
3. PropertiesPanel renders group sources + outputs as a grouped section to keep the UI compact
```

**Step 1: User chooses a file group**

```typescript
// frontend/src/components/FlowBuilder/PropertiesPanel.tsx (Sources section)
<select
  value={selectedBatchId ? String(selectedBatchId) : ''}
  onChange={(event) => {
    const nextBatchId = event.target.value ? Number(event.target.value) : null;
    if (nextBatchId) {
      // Group selection handled below.
    }
  }}
>
```

**Step 2: Group expands into per-file targets + destinations**

```typescript
// frontend/src/components/FlowBuilder/PropertiesPanel.tsx (file group handler)
const groupFiles = files.filter((file) => file.batch_id === nextBatchId);
const groupTargets = groupFiles.map((file) => ({
  fileId: file.id,
  sheetName: null,
  batchId: nextBatchId,
  virtualId: null,
  virtualName: null,
}));

if (groupTargets.length > 0) {
  nextSourceTargets.splice(index, 1, ...groupTargets);
}

updateNode(node.id, {
  data: {
    ...nodeData,
    sourceTargets: normalizedSources,
    destinationTargets: nextDestinationTargets,
  },
});
```

**Step 3: Grouped targets render as a single section**

```typescript
// frontend/src/components/FlowBuilder/PropertiesPanel.tsx (grouped UI)
const groupedSourceTargets = useMemo(() => {
  const grouped = new Map<number, Array<{ target: TableTarget; index: number }>>();
  sourceTargets.forEach((sourceTarget, index) => {
    if (!sourceTarget.batchId) return;
    const groupTargets = grouped.get(sourceTarget.batchId) ?? [];
    groupTargets.push({ target: sourceTarget, index });
    grouped.set(sourceTarget.batchId, groupTargets);
  });
  return Array.from(grouped.entries())
    .filter(([, targets]) => targets.length > 1)
    .map(([batchId, targets]) => ({ batchId, targets }));
}, [sourceTargets]);
```

## File Removal Cleanup

```
1. User removes a file from the upload modal
   ↓
2. Frontend calls DELETE /api/files/{file_id}
   ↓
3. Backend deletes the file on disk
   ↓
4. Backend strips the file ID from any flow_data that referenced it
   ↓
5. Database record is deleted and flows are updated in the same request
```

**Bulk delete note:** "Delete all" actions in the upload modal call the same delete endpoint for each file in the group or single list, then recompute the node's file IDs from the remaining files.

**Step 1-2: Remove file from the modal and call API**

```typescript
// frontend/src/components/FlowBuilder/DataUploadModal.tsx (lines 320-345)
const handleRemoveFile = async (fileId: number) => {
  await filesApi.delete(fileId);
  const nextIndividuals = individualFiles.filter((file) => file.id !== fileId);
  const nextBatchFiles = { ...batchFilesById };
  Object.entries(nextBatchFiles).forEach(([batchId, files]) => {
    const filtered = files.filter((file) => file.id !== fileId);
    if (filtered.length !== files.length) {
      nextBatchFiles[Number(batchId)] = filtered;
    }
  });

  setIndividualFiles(nextIndividuals);
  setBatchFilesById(nextBatchFiles);
  emitFileIds(getIncludedFileIds(nextIndividuals, nextBatchFiles));
};
```

**Step 3-4: Backend cleans up flow references before deleting**

```python
# backend/app/api/routes/files.py (delete_file)
updated_flow_data, changed = file_reference_service.remove_file_id_from_flow_data(
    flow.flow_data,
    file_id
)
if changed:
    flow.flow_data = updated_flow_data
```

## Flow Execution Flow

```
1. User builds a sequential pipeline in FlowBuilder.tsx
   - Nodes are stored in flowStore in execution order
   ↓
2. User executes the flow
   ↓
3. Component calls transformApi.execute()
   - Sends: { file_id, flow_data: { nodes, edges: [] } }
   ↓
4. Backend transform.py route:
   - Validates file belongs to user
   - Calls transform_service.execute_flow()
   ↓
5. Transform Service:
   - Parses file into DataFrame (pandas)
   - Iterates through flow nodes in order
   - For each transform node:
     a. Looks up transform class from registry
     b. Validates config
     c. Executes transform on DataFrame
     d. DataFrame becomes input for next transform
   ↓
6. Final DataFrame converted to preview format
   ↓
7. Preview returned to frontend
   ↓
8. Component displays results in DataPreview.tsx
```

## Remove Columns/Rows Block

```
1. User adds the Remove Columns/Rows block and selects a mode (columns or rows)
   ↓
2. PropertiesPanel stores selections in a draft config
   ↓
3. User clicks Save to persist the configuration to the node
   ↓
4. Backend transform uses the saved config to drop columns or rows
```

**Step 3: Config is saved on the node**

```typescript
// frontend/src/components/FlowBuilder/PropertiesPanel.tsx (Remove Columns/Rows section)
updateRemoveConfig(removeDraftConfig);
```

**Step 3: Backend applies the selection**

```python
# backend/app/transforms/remove.py (execute)
if mode == "columns":
    df = df.drop(columns=list(columns_to_drop), errors="ignore")
else:
    df = df.loc[~combined_mask]
```

**Step 1: Pipeline nodes stored in order**

```typescript
// frontend/src/components/FlowBuilder/FlowPipeline.tsx (lines 62-69)
const orderedNodes = useMemo(() => nodes, [nodes]);

// Steps render in the same order as the nodes array.
```

**UI note:** The first node is pinned in the pipeline so drag sorting only reorders downstream steps.

**Step 2: User executes the flow**

```typescript
// frontend/src/api/transform.ts (lines 15-20)
export interface FlowExecuteRequest {
  file_id: number;
  flow_data: FlowData;
}
```

**Step 3: Frontend API call**

```typescript
// frontend/src/api/transform.ts (lines 24-27)
execute: async (request: FlowExecuteRequest): Promise<FlowExecuteResponse> => {
  const response = await apiClient.post('/transform/execute', request);
  return response.data;
},
```

**Step 4: Backend route**

```python
// backend/app/api/routes/transform.py (lines 27-62)
@router.post("/execute")
async def execute_flow(
    request: FlowExecuteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Execute a flow on a file"""
    # Get file
    db_file = db.query(File).filter(
        File.id == request.file_id,
        File.user_id == current_user.id
    ).first()

    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    # Execute flow
    try:
        result_df = transform_service.execute_flow(
            db_file.file_path,
            request.flow_data
        )

        # Generate preview
        preview = file_service.get_file_preview(result_df)

        return {
            "preview": preview,
            "row_count": len(result_df),
            "column_count": len(result_df.columns)
        }
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error executing flow: {str(e)}"
        )
```

**Step 5: Transform service executes flow**

```python
# backend/app/services/transform_service.py (lines 8-48)
@staticmethod
def execute_flow(
    file_path: str,
    flow_data: Dict[str, Any]
) -> pd.DataFrame:
    """Execute a flow on a file"""
    # Parse the file into a DataFrame - starting point for all transformations
    df = file_service.parse_file(file_path)
    
    # Execute each transformation step in sequence
    # Flow data structure: nodes array where each node represents a transformation block
    nodes = flow_data.get("nodes", [])
    
    # Process nodes in order - transformations are applied sequentially
    # Each transformation modifies the DataFrame, which becomes input for the next step
    for node in nodes:
        block_type = node.get("data", {}).get("blockType")
        config = node.get("data", {}).get("config", {})
        
        # Skip upload nodes - they're just data sources, not transformations
        # Upload nodes are handled when parsing the file initially
        if block_type == "upload":
            continue
        
        # Look up transform class from registry using block type
        # Registry pattern allows dynamic transform loading without hardcoding
        transform_class = get_transform(block_type)
        if not transform_class:
            # Fallback: try using node type directly (for compatibility with different data structures)
            node_type = node.get("type")
            transform_class = get_transform(node_type)
        
        if transform_class:
            transform = transform_class()
            # Validate config before executing - prevents errors from invalid configurations
            # If validation fails, skip this transform (don't break entire flow)
            if transform.validate(df, config):
        # Execute transform - modifies DataFrame in place or returns new one
        df = transform.execute(df, config)
        
    return df
```

## Per-Step Preview Flow (Pipeline)

```
1. User clicks "Preview" on a step in FlowPipeline
   ↓
2. FlowBuilder detects active preview steps + node/order/config changes
   - Uses the selected source file as the file source
   - Each step reads its source (original file or output sheet) and writes to its destination output sheet
   ↓
3. Source step preview loads from filesApi.preview()
   ↓
4. Each downstream step preview runs transformApi.execute() with nodes up to that step
   - Preview target (file/sheet or output sheet) is passed so the backend can select the correct table
   - If a step has no source selected, preview returns a clear error message
   - Source preview requires a file + sheet when the file has multiple sheets
   - Output preview requires a selected source file
   - Cached previews render immediately, then revalidate in the background (SWR)
   - Source file is not auto-selected; users must choose explicitly
   ↓
5. DataPreview renders the preview table in a full-screen modal
   - Empty output sheets render a placeholder grid (columns visible, no data)
   - Output preview uses an output-file selector + per-sheet tabs
   - Source preview uses a "File group" selector to filter to a group or single files
   - "Use as source" copies the preview selection into the block target
```

### Cache Warming (Output Preview)

```
1. User saves an operation block configuration or opens Preview (or uploads files)
   ↓
2. PropertiesPanel / FlowBuilder calls /transform/precompute in the background
   ↓
3. Backend executes the flow once and caches output sheet previews
   ↓
4. First preview open can reuse the warmed cache
```

**Step 1: Save triggers precompute**

```typescript
// frontend/src/components/FlowBuilder/PropertiesPanel.tsx (lines 1320-1334)
onClick={() => {
  updateRemoveConfig(removeDraftConfig);
  setIsRemoveDirty(false);
  triggerPrecompute();
}}
```

**Step 1b: Preview open + file upload also trigger precompute**

```typescript
// frontend/src/components/FlowBuilder/FlowBuilder.tsx (lines 1470-1505)
if (!isCurrentlyOpen) {
  queuePreviewPrecompute();
}
```

```typescript
// frontend/src/components/FlowBuilder/FlowBuilder.tsx (lines 730-750)
if (hasFileIdChanges) {
  hasUnsavedChangesRef.current = true;
  setHasUnsavedChanges(true);
  queuePreviewPrecompute();
}
```

**Step 2: Backend warms previews**

```python
# backend/app/api/routes/transform.py (lines 120-176)
@router.post("/precompute")
async def precompute_flow(...):
    table_map, _ = transform_service.execute_flow(file_paths_by_id, request.flow_data)
    # Build per-output-sheet previews and store in preview_cache
    # Cache key includes virtual output id and sheet name to match /transform/execute preview lookups
```

**Step 1: Pipeline toggles preview on demand**

```typescript
// frontend/src/components/FlowBuilder/FlowPipeline.tsx (lines 121-130)
<button
  type="button"
  onClick={() => onTogglePreview(node.id)}
>
  {isPreviewOpen ? 'Hide preview' : 'Preview'}
</button>
```

**Step 1a: Preview file/sheet selectors update preview overrides (no target changes)**

```typescript
// frontend/src/components/FlowBuilder/FlowPipeline.tsx (lines 390-405)
<DataPreview
  fileOptions={previewFileOptions}
  currentFileId={
    activePreviewNode.id === fileSourceNodeId || activePreviewNode.type === 'source'
      ? sourceFileId
      : previewOverride?.fileId ??
        (activePreviewNode.data?.target as TableTarget | undefined)?.fileId ??
        null
  }
  sheetOptions={previewSheetOptions}
  currentSheet={
    activePreviewNode.id === fileSourceNodeId || activePreviewNode.type === 'source'
      ? sourceSheetName
      : previewOverride?.sheetName ??
        (activePreviewNode.data?.target as TableTarget | undefined)?.sheetName ??
        null
  }
  onFileChange={(fileId) => {
    if (activePreviewNode.id === fileSourceNodeId || activePreviewNode.type === 'source') {
      const selectedFile = previewFiles.find((file) => file.id === fileId);
      const nextBatchId = selectedFile?.batch_id ?? sourceBatchId ?? null;
      onSourceFileChange(fileId, nextBatchId);
      return;
    }
    onPreviewFileChange(activePreviewNode.id, fileId);
  }}
  onSheetChange={(sheetName) => onPreviewSheetChange(activePreviewNode.id, sheetName)}
/>;
```

**Step 1b: Preview group selection auto-picks the first file**

```typescript
// frontend/src/components/FlowBuilder/FlowBuilder.tsx (lines 1697-1724)
// Selecting a group immediately picks a file so previews never go blank.
const firstBatchFile = previewFiles.find((file) => file.batch_id === batchId) ?? null;
applySourceTargetSelection(fileSourceNode.id, {
  fileId: firstBatchFile?.id ?? null,
  sheetName: firstBatchFile ? sourceSheetByFileId[firstBatchFile.id] ?? null : null,
  batchId,
});
```

```typescript
// frontend/src/components/FlowBuilder/FlowBuilder.tsx (lines 1726-1746)
// If files arrive after a group selection, backfill the first file once available.
if (!sourceTarget?.fileId && sourceTarget?.batchId) {
  const firstBatchFile = previewFiles.find((file) => file.batch_id === sourceTarget.batchId) ?? null;
  if (firstBatchFile) {
    applySourceTargetSelection(fileSourceNode.id, {
      fileId: firstBatchFile.id,
      sheetName: sourceSheetByFileId[firstBatchFile.id] ?? null,
      batchId: sourceTarget.batchId,
    });
  }
}
```

```typescript
// frontend/src/components/FlowBuilder/FlowBuilder.tsx (lines 980-1006)
// Don't clear group selections while the preview file list is still loading.
if (previewFiles.length === 0) {
  return;
}
```

```typescript
// frontend/src/components/FlowBuilder/FlowBuilder.tsx (lines 1670-1710)
// File/group changes bump a refresh token so previews re-run even when IDs stay the same.
setPreviewRefreshTokens((prev) => ({
  ...prev,
  [fileSourceNode.id]: (prev[fileSourceNode.id] ?? 0) + 1,
}));
```

```typescript
// frontend/src/components/FlowBuilder/FlowBuilder.tsx (lines 1180-1220)
const handlePreviewSheetChange = useCallback((nodeId: string, sheetName: string) => {
  const fallback = nodes.find((item) => item.id === nodeId)?.data?.target as TableTarget | undefined;
  setPreviewOverrides((prev) => ({
    ...prev,
    [nodeId]: {
      fileId: prev[nodeId]?.fileId ?? fallback?.fileId ?? null,
      sheetName,
    },
  }));
}, [nodes]);
```

**Step 2: FlowBuilder schedules preview updates for active steps**

```typescript
// frontend/src/components/FlowBuilder/FlowBuilder.tsx (lines 400-412)
previewUpdateTimeoutRef.current = setTimeout(() => {
  const runId = previewRunIdRef.current + 1;
  previewRunIdRef.current = runId;
  // recompute previews only for active steps
}, 400);
```

**Step 3: Source preview uses filesApi.preview**

```typescript
// frontend/src/components/FlowBuilder/FlowBuilder.tsx (lines 430-437)
const preview = await fetchFilePreview(targetFileId, targetSheetName);
setStepPreviews((prev) => ({ ...prev, [node.id]: preview }));
```

**Step 3a: Cache + prefetch sheet previews**

```typescript
// frontend/src/components/FlowBuilder/FlowBuilder.tsx (lines 520-560)
const fetchFilePreview = async (fileId: number, sheetName?: string) => {
  const cacheKey = `${fileId}:${sheetName ?? '__default__'}`;
  const cached = previewCacheRef.current.get(cacheKey);
  if (cached) return cached;
  const preview = await filesApi.preview(fileId, sheetName);
  previewCacheRef.current.set(cacheKey, preview);
  return preview;
};

// After fetching the active sheet, warm the cache for the rest.
if (preview.sheets?.length) {
  prefetchSheetPreviews(fileIdSnapshot, preview.sheets, preview.current_sheet ?? sheetSnapshot);
}
```

**Step 3b: Apply cached sheet immediately on switch**

```typescript
// frontend/src/components/FlowBuilder/FlowBuilder.tsx (lines 580-610)
const cached = getCachedPreview(resolvedSourceFileId, sourceSheetName || undefined);
if (cached) {
  setStepPreviews((prev) => ({ ...prev, [fileSourceNode.id]: cached }));
  setPreviewErrors((prev) => ({ ...prev, [fileSourceNode.id]: null }));
  setPreviewLoading((prev) => ({ ...prev, [fileSourceNode.id]: false }));
}
```

**Step 3c: In-flight preview requests are deduped**

```typescript
// frontend/src/components/FlowBuilder/FlowBuilder.tsx (lines 540-570)
const inFlight = previewInFlightRef.current.get(cacheKey);
if (inFlight) {
  return inFlight;
}
// Store the promise so rapid tab clicks reuse the same request.
previewInFlightRef.current.set(cacheKey, request);
```

**Step 4: Step preview executes flow up to the node**

```typescript
// frontend/src/components/FlowBuilder/FlowBuilder.tsx (lines 442-450)
const flowData = buildFlowData(nodesSnapshot.slice(0, index + 1));
const result = await transformApi.execute({
  file_id: fileIdsSnapshot[0] ?? fileIdSnapshot,
  file_ids: fileIdsSnapshot,
  flow_data: flowData,
});
setStepPreviews((prev) => ({ ...prev, [node.id]: result.preview }));
```

## Output Export Flow

```
1. User selects an output group in PropertiesPanel.tsx (optional)
   ↓
2. Frontend calls transformApi.export() with flow_data + file_ids + output_batch_id
   ↓
3. Backend validates output batch and resolves output filenames
   ↓
4. Backend saves outputs to the batch (numbered if names conflict) and streams the response
   ↓
5. Backend chooses CSV vs Excel based on file extension
```

**Step 1: Output group selection**

```typescript
// frontend/src/components/FlowBuilder/PropertiesPanel.tsx (lines 1500-1519)
<select
  value={outputBatchId ? String(outputBatchId) : ''}
  onChange={(event) => {
    const nextBatchId = event.target.value ? Number(event.target.value) : null;
    updateOutputBatchId(nextBatchId);
  }}
>
  <option value="">Select group (optional)</option>
  {batches.map((batch) => (
    <option key={batch.id} value={String(batch.id)}>
      {batch.name}
    </option>
  ))}
</select>
```

**Step 2: Export call includes output_batch_id**

```typescript
// frontend/src/components/FlowBuilder/FlowBuilder.tsx (lines 2130-2146)
const blob = await transformApi.export({
  file_id: fileIds[0] ?? 0,
  file_ids: fileIds,
  flow_data: getFlowData(),
  output_batch_id: getOutputBatchId(),
});
```

**Step 3: Backend validates output batch**

```python
# backend/app/api/routes/transform.py (lines 287-302)
if request.output_batch_id is not None:
    output_batch = db.query(FileBatch).filter(
        FileBatch.user_id == current_user.id,
        FileBatch.id == request.output_batch_id
    ).first()
    if not output_batch:
        raise HTTPException(status_code=404, detail="Output batch not found")
```

**Step 4: Backend saves numbered outputs**

```python
# backend/app/api/routes/transform.py (lines 347-372)
file_name = file_service.resolve_unique_original_name(
    db=db,
    user_id=current_user.id,
    batch_id=output_batch.id,
    desired_name=file_name,
    reserved_names=reserved_output_names,
)
file_service.save_generated_file(
    db=db,
    user_id=current_user.id,
    original_filename=file_name,
    content=payload,
    batch_id=output_batch.id,
)
```

**Step 5: Resolve output format by extension**

```python
# backend/app/api/routes/transform.py (lines 332-370)
file_extension = Path(file_name).suffix.lower()
if file_extension == ".csv":
    result_for_file.to_csv(output, index=False)
    payload = output.getvalue().encode("utf-8")
else:
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        sheet_df.to_excel(writer, index=False, sheet_name=sheet_name)
    payload = output.read()
```

## Flow Save Flow

```
1. User clicks "Save Flow" in FlowBuilder (requires a non-empty flow name)
   ↓
2. Component gets flow data: flowStore.getFlowData()
   ↓
3. Calls flowsApi.createFlow({ name, description, flow_data })
   ↓
4. Backend flows.py route:
   - Creates Flow model instance
   - Extracts file IDs from flow_data
   - Creates file references (tracks which files flow uses)
   ↓
5. Flow saved to database
   ↓
6. Flow ID returned to frontend
   ↓
7. Component updates UI (shows in dashboard)
```

## New Flow Initialization

```
1. User selects an automation type
   ↓
2. Flow state is cleared immediately (before paint) to avoid flashing old nodes
   ↓
3. A `new=1` query param is added to force a clean init
   ↓
4. FlowBuilder detects `new=1`, inserts required source + output nodes, and removes the param
```

**Step 2-3: Reset to source + output nodes**

```typescript
// frontend/src/components/FlowBuilder/FlowBuilder.tsx (lines 529-590)
const clearFlowInternal = () => {
  const sourceNode: Node = {
    id: 'source-0',
    type: 'source',
    position: { x: 250, y: 250 },
    data: {
      blockType: 'source',
      config: {},
      label: 'Data',
    },
  };

  const outputNode: Node = {
    id: 'output-0',
    type: 'output',
    position: { x: 250, y: 350 },
    data: {
      blockType: 'output',
      config: {},
      label: 'Output',
      output: { outputs: [] },
    },
  };

  // Always reset to source + output nodes when starting a new flow.
  setNodes([sourceNode, outputNode]);
  setEdges([]);
  // ...reset other state
};

## Operation Destination Defaults

Legacy operation blocks that predate multi-source mapping will auto-select the first output sheet as their destination when outputs exist. New blocks start with empty destination lists so users explicitly pick their mapping.

Output blocks can copy the currently selected source file or file group into output files. This populates the output file list with matching filenames so one-to-one mappings stay aligned.

## Preview Defaults

When an operation block has an output destination, the preview opens on the output sheet by default (users can still toggle to the source file). Preview refreshes are debounced briefly to reduce request spam while editing.

If a source file is uploaded but the user has not selected a specific source file/sheet yet, previews show a "select a source file" prompt instead of auto-picking a file.

Uploads are triggered from the Source/Data node's Upload button so the properties panel remains visible while configuring source selection.
Source previews include a group selector so users can preview either a named group or single files, and then choose the specific file within that group.

## Multi-Source Mapping

Operation blocks can target multiple sources and multiple destination output sheets. Targets are stored as arrays on the node (`sourceTargets`, `destinationTargets`), and the first entry is mirrored into `target`/`destination` for previews and backward compatibility.

Selecting a file group in an operation source expands that group into multiple source targets (one per file) so each file can be routed to its own output file.
If there are more sources than destinations, the operation appends all source results into each destination file. If there is one source and multiple destinations, the operation fans out the same result to each destination. When counts match, the operation runs one-to-one.

Destinations now include a `Linked sources` multi-select, and clicking “Create destination from this file” automatically fills that list with the invoking source. These UI hooks drive the `sourceId`/`linkedSourceIds` metadata stored on each node so the backend knows whether a destination is tied to one source, several inputs, or a full batch when executing g2g/g2m/m2m flows.

When output sheets are created after a preview is already open, any placeholder output preview target is swapped to the first real output sheet so users see actual results without re-opening the preview.

Empty sheets still render a grid (with placeholder columns) so the preview area stays visually consistent even when no data is present.

Transform previews cache per-step signatures so switching between sheets reuses the last computed preview instead of re-running the full transform each time.

Backend preview responses are cached in-memory per user + flow + preview target to avoid redundant transform execution during sheet switches.
```


**Step 2: Get flow data from store**

```typescript
// frontend/src/store/flowStore.ts (lines 78-95)
getFlowData: (): FlowData => {
  const state = get();
  return {
    nodes: state.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
    })),
    edges: state.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    })),
  };
},
```

**Step 3: API call**

```typescript
// frontend/src/api/flows.ts (lines 17-20)
create: async (data: FlowCreate): Promise<Flow> => {
  const response = await apiClient.post('/flows', data);
  return response.data;
},
```

**Step 4: Backend creates flow**

```python
// backend/app/api/routes/flows.py (lines 53-69)
@router.post("/", response_model=FlowResponse, status_code=201)
async def create_flow(
    flow: FlowCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new flow"""
    db_flow = Flow(
        user_id=current_user.id,
        name=flow.name,
        description=flow.description,
        flow_data=flow.flow_data
    )
    db.add(db_flow)
    db.commit()
    db.refresh(db_flow)
    return db_flow
```

## File Cleanup Flow

```
When Flow is Deleted:
1. User deletes flow via flowsApi.deleteFlow(id)
   ↓
2. Backend flows.py delete_flow():
   - Gets all file IDs referenced by flow
   - Deletes flow from database
   - For each file:
     a. Checks if file is referenced by other flows
     b. If not referenced → deletes file from disk
     c. Deletes file record from database
   ↓
3. Returns list of deleted files
```

**Step 1: Frontend API call**

```typescript
// frontend/src/api/flows.ts (lines 37-39)
delete: async (flowId: number): Promise<void> => {
  await apiClient.delete(`/flows/${flowId}`);
},
```

**Step 2: Backend deletes flow and cleans up files**

```python
// backend/app/api/routes/flows.py (lines 155-203)
@router.delete("/{flow_id}")
async def delete_flow(
    flow_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a flow and clean up associated files that are no longer referenced"""
    flow = db.query(Flow).filter(
        Flow.id == flow_id,
        Flow.user_id == current_user.id
    ).first()

    if not flow:
        raise HTTPException(status_code=404, detail=FLOW_NOT_FOUND_MESSAGE)

    # Get all file IDs referenced by this flow
    file_ids = file_reference_service.get_files_for_flow(flow)
    
    # Delete the flow first
    db.delete(flow)
    db.commit()

    # Clean up files that are no longer referenced by any flow
    deleted_files = []
    for file_id in file_ids:
        # Check if file is still referenced by any other flow
        if not file_reference_service.is_file_referenced(file_id, current_user.id, db):
            # File is orphaned, safe to delete
            db_file = db.query(File).filter(
                File.id == file_id,
                File.user_id == current_user.id
            ).first()
            
            if db_file:
                # Delete from disk
                storage.delete_file(current_user.id, db_file.filename)
                # Delete from database
                db.delete(db_file)
                deleted_files.append(file_id)
    
    if deleted_files:
        db.commit()
        return {
            "message": "Flow deleted successfully",
            "deleted_files": deleted_files,
            "files_cleaned_up": len(deleted_files)
        }
    
    return {"message": "Flow deleted successfully"}
```

## Data Transformation Flow

### Single Transform Execution

```
1. Transform receives DataFrame and config
   ↓
2. validate() checks:
   - Required config keys exist
   - Column names exist in DataFrame
   - Values are valid
   ↓
3. If valid, execute() runs:
   - Applies transformation logic
   - Returns new DataFrame (doesn't modify original)
   ↓
4. Result becomes input for next transform
```

**Step 2: Validation**

```python
// backend/app/transforms/filters.py (lines 11-21)
def validate(self, df: pd.DataFrame, config: Dict[str, Any]) -> bool:
    # Validate that required config keys exist
    # Without these, execute() would fail with KeyError or produce incorrect results
    if "column" not in config:
        return False
    # Check that column exists in DataFrame - prevents KeyError during execution
    if config["column"] not in df.columns:
        return False
    if "operator" not in config:
        return False
    return True
```

**Step 3: Execution**

```python
// backend/app/transforms/filters.py (lines 23-31)
def execute(self, df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
    column = config["column"]
    operator = config.get("operator", "equals")
    value = config.get("value")
    
    # Apply filter based on operator type
    # Each operator handles different data types and edge cases
    if operator == "equals":
        return df[df[column] == value]
```

### Example: Filter Rows Transform

```
Input DataFrame:
| Name  | Age | City    |
|-------|-----|---------|
| Alice | 25  | NYC     |
| Bob   | 30  | LA      |
| Carol | 25  | NYC     |

Config: { column: "Age", operator: "equals", value: 25 }

Execute:
df[df["Age"] == 25]

Output DataFrame:
| Name  | Age | City |
|-------|-----|------|
| Alice | 25  | NYC  |
| Carol | 25  | NYC  |
```

### Row Filter Sources & Destinations

1. **Source selection:** Every row in the row filter properties panel now includes the grouped `Source` dropdown (`renderSourceOptions`). It lists every batch (with a “Use all {Batch}” option), the standalone files, and the processed streams that upstream nodes expose (`flowSourceTargets`). Selecting `file:<id>` binds that entry to `filesById.get(<id>)`, selecting `group:<batchId>` expands the entry into one target per batch file, and choosing a processed stream applies the virtual target.

    ```typescript
    const handleSourceEntrySelect = useCallback(
      (index: number, optionValue: string) => {
        if (!optionValue) {
          return;
        }
        const [type, rawId] = optionValue.split(':');
        const nextTargets = [...sourceTargets];
        if (type === 'file') {
          const fileId = Number(rawId);
          const file = filesById.get(fileId);
          nextTargets[index] = {
            ...nextTargets[index],
            fileId,
            batchId: file?.batch_id ?? nextTargets[index].batchId ?? null,
            sheetName: null,
            virtualId: null,
            virtualName: file?.original_filename ?? null,
          };
        } else if (type === 'group') {
          const batchId = Number(rawId);
          const groupTargets = files
            .filter((file) => file.batch_id === batchId)
            .map((file) => ({
              fileId: file.id,
              sheetName: null,
              batchId,
              virtualId: null,
              virtualName: file.original_filename,
            }));
          nextTargets.splice(index, 1, ...groupTargets);
        } else if (type === 'stream') {
          const streamIndex = Number(rawId);
          const streamTarget = flowSourceTargets[streamIndex];
          if (streamTarget) {
            nextTargets[index] = streamTarget;
          }
        }
        updateSourceTargets(nextTargets);
      },
      [files, filesById, flowSourceTargets, sourceTargets, updateSourceTargets]
    );
    ```

2. **Sheet loading & row previews:** Once a file is bound to a source entry, the panel fetches sheet names via `filesApi.sheets` and previews via `filesApi.preview`. The sheet select is disabled until those calls resolve, preventing empty previews from wiping the list.

3. **Preview filtering:** The operation preview header exposes batch/individual/all toggles so the `DataPreview` file dropdown only lists the files that were explicitly added to the block. This keeps g2g/g2m/m2m previews aligned with the configured sources even when the global file list contains additional uploads. When multiple batches feed the block, the header also exposes a File group dropdown (labelled by batch name) so you can zoom in on just one group at a time while keeping the toggle state intact.

4. **Linked destinations:** Every destination row renders `renderLinkedSourcesControl`, which surfaces a multi-select bound to `destinationTargets[index].linkedSourceIds`. The `Create destination from this file` helper pre-populates the destination’s `sourceId` and linked sources so run-time execution can map inputs to outputs with g2g, g2m, or m2m semantics.

    ```tsx
    <select multiple value={linkedSources} onChange={(event) => handleLinkedSourcesChange(index, event)}>
      {sourceLinkOptions.map((option) => (
        <option key={option.value} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
    ```

5. **Execution contract:** The backend receives the normalized `sourceTargets` and `destinationTargets` arrays in the flow payload. Linked source IDs propagate through the transform APIs so each destination can apply the correct filtered stream (batch-preserving, append, or one-to-one as configured in the UI).

## State Synchronization

### Frontend → Backend

- User actions trigger API calls
- State updates after successful API response
- Errors handled and displayed to user

### Backend → Frontend

- API responses update component state
- Stores update when data changes
- UI re-renders automatically (React)

## Data Formats

### API Request/Response

- JSON format for most requests
- FormData for file uploads
- JWT tokens in Authorization header

### Database Storage

- User: email, hashed_password, metadata
- File: filename, path, size, MIME type, timestamps
- Flow: name, description, flow_data (JSON), timestamps

### Flow Data Structure

```json
{
  "nodes": [
    {
      "id": "1",
      "type": "upload",
      "data": { "fileId": 123 }
    },
    {
      "id": "2",
      "type": "filter_rows",
      "data": {
        "blockType": "filter_rows",
        "config": { "column": "Age", "operator": ">", "value": 18 }
      }
    }
  ],
  "edges": [
    { "id": "e1", "source": "1", "target": "2" }
  ]
}
```

## Error Handling Flow

```
1. Error occurs (validation, network, server)
   ↓
2. Backend returns HTTP error status + detail message
   ↓
3. Frontend API client interceptor catches error
   ↓
4. If 401: Clear token, redirect to login
   ↓
5. Otherwise: Error passed to component
   ↓
6. Component displays error message to user
```

**Step 3-4: Error interceptor**

```typescript
// frontend/src/api/client.ts (lines 35-48)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 means token is invalid/expired - user needs to login again
    if (error.response?.status === 401) {
      // Clear invalid token
      localStorage.removeItem('access_token');
      // Redirect to login page
      // Using window.location instead of navigate() because this runs outside React context
      window.location.href = '/login';
    }
    // Re-throw error so calling code can handle it
    return Promise.reject(error);
  }
);
```

## File Preview Flow

```
1. User requests file preview
   ↓
2. Frontend calls filesApi.preview(fileId, sheetName?)
   ↓
3. Backend files.py preview_file():
   - Checks preview cache for file+sheet
   - Loads file from disk
   - Parses into DataFrame (pandas)
   - Gets first 20 rows
   ↓
4. Service cleans data for JSON:
   - Replaces NaN with null
   - Replaces infinity with null
   - Converts numpy types to Python types
   ↓
5. Returns: { columns, row_count, preview_rows, dtypes }
   ↓
6. Frontend displays preview in table
```

**Step 2: Frontend API call**

```typescript
// frontend/src/api/files.ts (lines 19-27)
preview: async (fileId: number, sheetName?: string): Promise<FilePreview> => {
  // Ensure sheetName is a valid string before using it
  const validSheetName = sheetName && typeof sheetName === 'string' ? sheetName : undefined;
  const url = validSheetName 
    ? `/files/${fileId}/preview?sheet_name=${encodeURIComponent(validSheetName)}`
    : `/files/${fileId}/preview`;
  const response = await apiClient.get(url);
  return response.data;
},
```

**Step 3: Backend route**

```python
// backend/app/api/routes/files.py (lines 118-158)
@router.get("/{file_id}/preview", response_model=FilePreviewResponse)
async def preview_file(
    file_id: int,
    sheet_name: Optional[str] = Query(
        None, description="Sheet name to preview (for Excel files)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get preview of a file"""
    db_file = db.query(File).filter(
        File.id == file_id,
        File.user_id == current_user.id
    ).first()

    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    cache_key = stable_hash({
        "type": "file_preview",
        "user_id": current_user.id,
        "file_id": db_file.id,
        "file_size": db_file.file_size,
        "sheet_name": sheet_name or "__default__",
    })
    cached_preview = preview_cache.get(cache_key)
    if cached_preview is not None:
        return cached_preview

    # Get list of sheets if Excel file
    sheets = []
    if db_file.mime_type in [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel"
    ]:
        sheets = file_service.get_excel_sheets(db_file.file_path)

    # Parse the file (with optional sheet selection)
    df = file_service.parse_file(db_file.file_path, sheet_name=sheet_name)
    preview = file_service.get_file_preview(df)
    preview_cache.set(cache_key, preview)
```
