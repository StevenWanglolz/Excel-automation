# API Documentation

Complete API reference for SheetPilot backend.

## Base URL

```
http://localhost:8000/api
```

## Authentication

Most endpoints require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

Tokens are obtained via `/api/auth/login` and expire after 30 minutes.

## Authentication Endpoints

### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "full_name": "John Doe"  // optional
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "email": "user@example.com",
  "full_name": "John Doe",
  "is_active": true
}
```

### Login
```http
POST /api/auth/login
Content-Type: application/x-www-form-urlencoded

username=user@example.com&password=password123
```

**Response:** `200 OK`
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer"
}
```

**Notes:**
- `preview_target` is optional and lets the backend choose a specific file/sheet (or output sheet via `virtual_id`) for the preview response.
- If the Output block defines multiple files, `/transform/export` returns a `.zip` with one Excel file per output.

### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "id": 1,
  "email": "user@example.com",
  "full_name": "John Doe",
  "is_active": true
}
```

## File Endpoints

### Upload File
```http
POST /api/files/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <binary file data>
```

**Supported formats:** `.xlsx`, `.xls`, `.csv`

**File size limit:** 50MB (52428800 bytes). Files exceeding this limit will be rejected with a `413 Payload Too Large` error.

**Error Response (413):** `413 Payload Too Large`
```json
{
  "detail": "File size (75.00MB) exceeds maximum allowed size (50MB)"
}
```

**Response:** `201 Created`
```json
{
  "id": 123,
  "filename": "abc123.xlsx",
  "original_filename": "data.xlsx",
  "file_size": 45678,
  "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "created_at": "2024-01-01T12:00:00Z"
}
```

### List Files
```http
GET /api/files
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
[
  {
    "id": 123,
    "filename": "abc123.xlsx",
    "original_filename": "data.xlsx",
    "file_size": 45678,
    "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "created_at": "2024-01-01T12:00:00Z"
  }
]
```

### Get File
```http
GET /api/files/{file_id}
Authorization: Bearer <token>
```

**Response:** `200 OK` - Same as upload response

### Preview File
```http
GET /api/files/{file_id}/preview?sheet_name=Sheet1
Authorization: Bearer <token>
```

**Query Parameters:**
- `sheet_name` (optional) - Excel sheet name to preview

**Response:** `200 OK`
```json
{
  "columns": ["Name", "Age", "City"],
  "row_count": 100,
  "preview_rows": [
    { "Name": "Alice", "Age": 25, "City": "NYC" },
    { "Name": "Bob", "Age": 30, "City": "LA" }
  ],
  "dtypes": {
    "Name": "object",
    "Age": "int64",
    "City": "object"
  },
  "sheets": ["Sheet1", "Sheet2"],  // Excel only
  "current_sheet": "Sheet1"        // Excel only
}
```

### List File Sheets
```http
GET /api/files/{file_id}/sheets
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
["Sheet1", "Sheet2"]
```

### Download File
```http
GET /api/files/{file_id}/download
Authorization: Bearer <token>
```

**Response:** `200 OK`
- Content-Type: File MIME type
- Content-Disposition: attachment; filename=original_filename
- Body: Binary file data

### Delete File
```http
DELETE /api/files/{file_id}
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "message": "File deleted successfully",
  "flows_updated": 2
}
```

Notes:
- Deleting a file also strips it from any flow definitions that referenced it.
- Use `flows_updated` to confirm how many flow records were cleaned.

### Cleanup Orphaned Files
```http
POST /api/files/cleanup-orphaned
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "message": "Cleaned up 3 orphaned file(s)",
  "deleted_count": 3,
  "deleted_files": [
    { "id": 1, "filename": "old.xlsx" },
    { "id": 2, "filename": "unused.csv" }
  ]
}
```

## Flow Endpoints

### Create Flow
```http
POST /api/flows
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My Automation",
  "description": "Filters and cleans data",
  "flow_data": {
    "nodes": [...],
    "edges": [...]
  }
}
```

**Response:** `201 Created`
```json
{
  "id": 456,
  "user_id": 1,
  "name": "My Automation",
  "description": "Filters and cleans data",
  "flow_data": { "nodes": [...], "edges": [...] },
  "created_at": "2024-01-01T12:00:00Z",
  "updated_at": null
}
```

### List Flows
```http
GET /api/flows
Authorization: Bearer <token>
```

**Response:** `200 OK` - Array of flow objects

### Get Flow
```http
GET /api/flows/{flow_id}
Authorization: Bearer <token>
```

**Response:** `200 OK` - Flow object

### Update Flow
```http
PUT /api/flows/{flow_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",           // optional
  "description": "New description", // optional
  "flow_data": { ... }              // optional
}
```

**Response:** `200 OK` - Updated flow object

**Note:** Updating `flow_data` triggers file cleanup - files no longer referenced are deleted.

### Delete Flow
```http
DELETE /api/flows/{flow_id}
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "message": "Flow deleted successfully",
  "deleted_files": [1, 2, 3],
  "files_cleaned_up": 3
}
```

## Transform Endpoints

### Execute Flow
```http
POST /api/transform/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "file_id": 123,
  "file_ids": [123, 456],
  "preview_target": {
    "file_id": 123,
    "sheet_name": "Sheet1",
    "virtual_id": "output:Summary"
  },
  "flow_data": {
    "nodes": [
      {
        "id": "1",
        "type": "upload",
        "data": { "fileIds": [123, 456] }
      },
      {
        "id": "2",
        "type": "filter_rows",
        "data": {
          "blockType": "filter_rows",
          "target": { "fileId": 123, "sheetName": "Sheet1" },
          "config": {
            "column": "Age",
            "operator": "greater_than",
            "value": 18
          }
        }
      }
    ],
    "edges": [
      { "id": "e1", "source": "1", "target": "2" }
    ]
  }
}
```

**Response:** `200 OK`
```json
{
  "preview": {
    "columns": ["Name", "Age", "City"],
    "row_count": 50,
    "preview_rows": [...],
    "dtypes": {...}
  },
  "row_count": 50,
  "column_count": 3
}
```

### Preview Step
```http
POST /api/transform/preview-step
Authorization: Bearer <token>
Content-Type: application/json

{
  "file_id": 123,
  "step_config": {
    "blockType": "filter_rows",
    "config": {
      "column": "Age",
      "operator": "greater_than",
      "value": 18
    }
  }
}
```

**Response:** `200 OK` - Same format as file preview

### Export Result
```http
POST /api/transform/export
Authorization: Bearer <token>
Content-Type: application/json

{
  "file_id": 123,
  "file_ids": [123, 456],
  "flow_data": { ... }
}
```

**Notes:**
- If the flow includes an Output block, its sheet mapping is used to build the Excel file.
- Without an Output block, the last modified table is exported as `Sheet1`.

**Response:** `200 OK`
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename=result.xlsx`
- Body: Binary Excel file data

## Error Responses

All endpoints return errors in this format:

```json
{
  "detail": "Error message here"
}
```

### Common Status Codes

- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - User account inactive
- `404 Not Found` - Resource doesn't exist
- `413 Payload Too Large` - File size exceeds maximum allowed (50MB)
- `500 Internal Server Error` - Server error

## Rate Limiting

Currently no rate limiting implemented. Consider adding for production.

## CORS

CORS is configured to allow requests from:
- `http://localhost:5173` (Vite dev server)
- `http://localhost:3000` (alternative frontend port)

Configured in `app/core/config.py` via `CORS_ORIGINS` setting.

## API Documentation (Swagger)

Interactive API documentation available at:
```
http://localhost:8000/docs
```

Generated automatically by FastAPI from route definitions.
