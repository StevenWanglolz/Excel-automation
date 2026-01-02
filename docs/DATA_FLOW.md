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
1. User selects file in FileUploader.tsx
   ↓
2. Component creates FormData with file
   ↓
3. Calls filesApi.upload(file) → POST /api/files/upload
   ↓
4. Backend files.py route:
   - Validates user (get_current_user)
   - Calls file_service.upload_file()
   - Queues background cache warmup for file previews
   ↓
5. Service layer:
   - Validates file type (.xlsx, .xls, .csv)
   - Calls storage.save_file() which validates file size (50MB limit)
   - If size exceeds limit: returns HTTP 413 error, file not saved
   - If valid: saves file to disk
   - Secondary size check in file_service (safety net)
   - Creates database record in File model
   ↓
6. File stored at: uploads/{user_id}/{generated_filename}
   ↓
7. Database record created with metadata
   ↓
8. File metadata returned to frontend
   ↓
9. Component updates UI with uploaded file
```

**Step 1: User selects file**

```typescript
// frontend/src/components/FileUpload/FileUploader.tsx (lines 12-44)
const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  // Validate file type
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
  ];
  const allowedExtensions = ['.xlsx', '.xls', '.csv'];
  const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

  if (
    !allowedTypes.includes(file.type) &&
    !allowedExtensions.includes(fileExtension)
  ) {
    setError('Please upload a valid Excel (.xlsx, .xls) or CSV file');
    return;
  }

  setIsUploading(true);
  setError(null);

  try {
    const uploadedFile = await filesApi.upload(file);
    onUploadSuccess(uploadedFile.id);
  } catch (err: any) {
    setError(err.response?.data?.detail || 'Failed to upload file');
  } finally {
    setIsUploading(false);
  }
};
```

**Step 2-3: Create FormData and call API**

```typescript
// frontend/src/api/files.ts (lines 5-12)
upload: async (file: File): Promise<File> => {
  const formData = new FormData();
  formData.append('file', file);
  
  // Content-Type will be set automatically by axios for FormData
  const response = await apiClient.post('/files/upload', formData);
  return response.data;
},
```

**Step 4: Backend route**

```python
# backend/app/api/routes/files.py (lines 42-55)
@router.post("/upload", response_model=FileResponse, status_code=201)
async def upload_file(
    file: UploadFile = FastAPIFile(...),
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload a file (Excel or CSV)"""
    # Delegate to service layer - keeps route thin and business logic testable
    # Service handles validation, file storage, and database record creation
    db_file = await file_service.upload_file(db, current_user.id, file)
    # Warm file preview cache after upload so the first preview opens quickly.
    background_tasks.add_task(_precompute_file_previews, current_user.id, db_file)
    return db_file
```

**Step 4a: Background cache warmup**

```python
# backend/app/api/routes/files.py (lines 167-210)
def _precompute_file_previews(user_id: int, db_file: File) -> None:
    """Build previews for all sheets in a file and cache them."""
    sheets = file_service.get_excel_sheets(db_file.file_path)
    sheets = sheets or [None]
    sheet_options = [sheet for sheet in sheets if sheet is not None]
    for sheet_name in sheets:
        cache_key = stable_hash({
            "type": "file_preview",
            "user_id": user_id,
            "file_id": db_file.id,
            "file_size": db_file.file_size,
            "sheet_name": sheet_name or "__default__",
        })
        df = file_service.parse_file(db_file.file_path, sheet_name=sheet_name)
        preview = file_service.get_file_preview(df)
        preview["sheets"] = sheet_options
        preview["current_sheet"] = sheet_name if sheet_name is not None else (
            sheet_options[0] if sheet_options else None
        )
        preview_cache.set(cache_key, preview)
```

**Step 5: Service validates and saves**

```python
# backend/app/services/file_service.py (lines 13-59)
async def upload_file(
    db: Session,
    user_id: int,
    file: UploadFile
) -> File:
    """Upload and parse a file"""
    # Validate file type - prevents malicious file uploads and ensures we can process the file
    # Without this check, users could upload arbitrary files that break our parsing logic
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    
    allowed_extensions = {".xlsx", ".xls", ".csv"}
    file_ext = Path(file.filename).suffix.lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"File type not supported. Allowed: {', '.join(allowed_extensions)}"
        )
    
    # Save file to disk with user-specific directory structure
    # Returns both the full path and the generated filename (for uniqueness)
    # Note: save_file() already validates file size before saving
    file_path, filename = await storage.save_file(file, user_id)
    
    # Get file size after saving - needed for database record
    # Double-check size as safety net (though save_file already validated)
    file_size = Path(file_path).stat().st_size
    
    # Additional validation check (safety net in case size check was bypassed)
    # If file somehow exceeds limit, delete it and raise error
    if file_size > settings.MAX_FILE_SIZE:
        # Clean up: delete the file we just saved
        storage.delete_file(user_id, filename)
        max_size_mb = settings.MAX_FILE_SIZE / (1024 * 1024)
        file_size_mb = file_size / (1024 * 1024)
        raise HTTPException(
            status_code=413,  # 413 = Payload Too Large
            detail=f"File size ({file_size_mb:.2f}MB) exceeds maximum allowed size ({max_size_mb:.0f}MB)"
        )
    
    # Map file extension to MIME type for proper HTTP headers
    # Used when serving files back to clients
    mime_type_map = {
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xls": "application/vnd.ms-excel",
        ".csv": "text/csv"
    }
    mime_type = mime_type_map.get(file_ext, "application/octet-stream")
    
    # Create database record linking file to user
    # Stores both generated filename (for disk lookup) and original filename (for user display)
    db_file = File(
        user_id=user_id,
        filename=filename,
        original_filename=file.filename,
        file_path=file_path,
        file_size=file_size,
        mime_type=mime_type
    )
    db.add(db_file)
    db.commit()
    # Refresh to load auto-generated fields (id, created_at) from database
    db.refresh(db_file)
    
    return db_file
```

**Step 5a: Storage validates size and saves**

```python
# backend/app/storage/local_storage.py (lines 14-43)
async def save_file(self, file: UploadFile, user_id: int) -> tuple[str, str]:
    """Save uploaded file and return (file_path, filename)"""
    # Generate unique filename
    file_ext = Path(file.filename).suffix
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    user_dir = self.upload_dir / str(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)

    file_path = user_dir / unique_filename

    # Read file content and check size before saving
    # This prevents saving large files that exceed the limit
    content = await file.read()
    file_size = len(content)

    # Validate file size - prevents disk space issues and ensures reasonable processing times
    # MAX_FILE_SIZE is defined in config.py (default: 10MB)
    if file_size > settings.MAX_FILE_SIZE:
        max_size_mb = settings.MAX_FILE_SIZE / (1024 * 1024)
        file_size_mb = file_size / (1024 * 1024)
        raise HTTPException(
            status_code=413,  # 413 = Payload Too Large
            detail=f"File size ({file_size_mb:.2f}MB) exceeds maximum allowed size ({max_size_mb:.0f}MB)"
        )

    # Save file to disk
    with open(file_path, "wb") as f:
        f.write(content)

    return str(file_path), unique_filename
```

## Initial File Resolution (Flow Builder)

```
1. User opens Data Upload modal for a node with saved file IDs
   ↓
2. Modal fetches the current file list from the API (once per open)
   ↓
3. Modal filters to the saved file IDs
   ↓
4. Missing file IDs are removed from the node data (silent cleanup)
   ↓
5. Modal shows remaining files without 404s
```

**Step 2-4: Resolve file IDs and remove missing entries**

```typescript
// frontend/src/components/FlowBuilder/DataUploadModal.tsx (lines 40-64)
const loadInitialFiles = async () => {
  setIsLoadingFiles(true);
  try {
    const allFiles = await filesApi.list();
    const filesById = new Map(allFiles.map((file) => [file.id, file]));
    const resolvedFiles = initialFileIds
      .map((id) => filesById.get(id))
      .filter((file): file is NonNullable<typeof file> => Boolean(file));

    setUploadedFiles(
      resolvedFiles.map((file) => ({
        id: file.id,
        name: file.filename,
        originalName: file.original_filename,
      }))
    );

    if (onFileUploaded && resolvedFiles.length !== initialFileIds.length) {
      onFileUploaded(resolvedFiles.map((file) => file.id));
    }
  } finally {
    setIsLoadingFiles(false);
  }
};
```

**Note:** File previews are opened from the pipeline step preview icon, not from the upload modal.

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

**Step 1-2: Remove file from the modal and call API**

```typescript
// frontend/src/components/FlowBuilder/DataUploadModal.tsx (lines 140-165)
const handleRemoveFile = async (fileId: number) => {
  await filesApi.delete(fileId);
  const remainingFiles = uploadedFiles.filter(file => file.id !== fileId);
  setUploadedFiles(remainingFiles);
  if (onFileUploaded) {
    onFileUploaded(remainingFiles.map(file => file.id));
  }
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
      onSourceFileChange(fileId);
      return;
    }
    onPreviewFileChange(activePreviewNode.id, fileId);
  }}
  onSheetChange={(sheetName) => onPreviewSheetChange(activePreviewNode.id, sheetName)}
/>;
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
1. User adds an Output block and defines the output files + sheet names (can be empty)
   ↓
2. Frontend calls transformApi.export() with flow_data + file_ids
   ↓
3. Backend executes the pipeline across all targeted file/sheet tables
   ↓
4. Export uses the output files + sheet names to build workbooks (zips when multiple files)
   ↓
5. Server streams an Excel file with one or many sheets
```

**Step 5: DataPreview renders the table**

```typescript
// frontend/src/components/Preview/DataPreview.tsx (lines 53-84)
{preview.preview_rows.map((row, idx) => (
  <tr key={idx} className="hover:bg-gray-50">
    {preview.columns.map((column) => (
      <td key={column} className="px-4 py-3 text-sm text-gray-900">
        {row[column] !== null && row[column] !== undefined
          ? String(row[column])
          : ''}
      </td>
    ))}
  </tr>
))}
```

**Step 5a: Transform validation**

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

**Step 5b: Transform execution**

```python
// backend/app/transforms/filters.py (lines 23-54)
def execute(self, df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
    column = config["column"]
    operator = config.get("operator", "equals")
    value = config.get("value")
    
    # Apply filter based on operator type
    # Each operator handles different data types and edge cases
    if operator == "equals":
        return df[df[column] == value]
    elif operator == "not_equals":
        return df[df[column] != value]
    elif operator == "contains":
        # Convert to string for text search - handles numeric columns with text search
        # na=False excludes NaN values from results (they would cause errors)
        return df[df[column].astype(str).str.contains(str(value), na=False)]
    elif operator == "not_contains":
        # Use ~ to negate the contains condition
        return df[~df[column].astype(str).str.contains(str(value), na=False)]
    elif operator == "greater_than":
        return df[df[column] > value]
    elif operator == "less_than":
        return df[df[column] < value]
    elif operator == "is_blank":
        # Check both NaN and empty string - covers all "blank" cases
        return df[df[column].isna() | (df[column] == "")]
    elif operator == "is_not_blank":
        # Check that value is not NaN AND not empty string
        return df[df[column].notna() & (df[column] != "")]
    else:
        # Unknown operator - return original DataFrame unchanged
        # This prevents errors from invalid operator names
        return df
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

When output files exist, operation blocks auto-select the first output sheet as their destination unless the user has already picked one. This keeps the UI and backend aligned so previewing output sheets reflects the latest operation results.

## Preview Defaults

When an operation block has an output destination, the preview opens on the output sheet by default (users can still toggle to the source file). Preview refreshes are debounced briefly to reduce request spam while editing.

If a source file is uploaded but the user has not selected a specific source file/sheet yet, previews fall back to the first uploaded file so the Data block can still render a preview immediately.
When the user switches a sheet in preview without a pinned source file, the selected sheet is stored against the first uploaded file and the source file selection is set automatically so sheet tabs remain interactive.

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
