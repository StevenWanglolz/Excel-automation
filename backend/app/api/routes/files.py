from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile, Query, Response, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_serializer
from datetime import datetime
from app.core.database import get_db
from app.core.config import settings
from app.api.dependencies import get_current_user
from app.models.user import User
from app.models.file import File
from app.models.file_batch import FileBatch
from app.models.flow import Flow
from app.services.file_service import file_service
from app.services.file_reference_service import file_reference_service
from app.services.preview_cache import preview_cache, stable_hash

router = APIRouter(prefix="/files", tags=["files"])


class FileResponse(BaseModel):
    id: int
    filename: str
    original_filename: str
    file_size: int
    mime_type: str
    batch_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_serializer('created_at')
    def serialize_created_at(self, value: datetime, _info):
        return value.isoformat() if value else None


class FilePreviewResponse(BaseModel):
    columns: List[str]
    row_count: int
    preview_rows: List[dict]
    dtypes: dict
    sheets: List[str] = []  # List of sheet names (empty for CSV)
    current_sheet: Optional[str] = None  # Current sheet being previewed


class BatchCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None


class BatchResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    file_count: int = 0
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_serializer('created_at')
    def serialize_created_at(self, value: datetime, _info):
        return value.isoformat() if value else None


@router.post("/upload", response_model=FileResponse, status_code=201)
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = FastAPIFile(...),
    batch_id: Optional[int] = Query(default=None),
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
    # Delegate to service layer - keeps route thin and business logic testable
    # Service handles validation, file storage, and database record creation
    db_file = await file_service.upload_file(db, current_user.id, file, batch_id=batch_id)
    # Warm file preview cache after upload so the first preview opens quickly.
    background_tasks.add_task(
        _precompute_file_previews, current_user.id, db_file)
    return db_file


@router.get("/", response_model=List[FileResponse])
async def list_files(
    batch_id: Optional[int] = Query(default=None),
    unbatched: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all files for current user"""
    if batch_id is not None and unbatched:
        raise HTTPException(
            status_code=400, detail="Choose batch_id or unbatched, not both")

    query = db.query(File).filter(File.user_id == current_user.id)
    if batch_id is not None:
        query = query.filter(File.batch_id == batch_id)
    elif unbatched:
        query = query.filter(File.batch_id.is_(None))
    files = query.all()
    return files


@router.get("/batches", response_model=List[BatchResponse])
async def list_batches(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List file batches for the current user"""
    counts_subquery = (
        db.query(File.batch_id, func.count(File.id).label("file_count"))
        .filter(File.user_id == current_user.id)
        .group_by(File.batch_id)
        .subquery()
    )
    batches = (
        db.query(FileBatch, func.coalesce(counts_subquery.c.file_count, 0))
        .outerjoin(counts_subquery, FileBatch.id == counts_subquery.c.batch_id)
        .filter(FileBatch.user_id == current_user.id)
        .all()
    )

    response = []
    for batch, file_count in batches:
        response.append(BatchResponse(
            id=batch.id,
            name=batch.name,
            description=batch.description,
            file_count=file_count or 0,
            created_at=batch.created_at
        ))
    return response


@router.post("/batches", response_model=BatchResponse, status_code=201)
async def create_batch(
    payload: BatchCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new file batch for grouping uploads"""
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Batch name is required")

    existing = db.query(FileBatch).filter(
        FileBatch.user_id == current_user.id,
        func.lower(FileBatch.name) == name.lower()
    ).first()
    if existing:
        raise HTTPException(
            status_code=400, detail="Batch name already exists")

    batch = FileBatch(
        user_id=current_user.id,
        name=name,
        description=payload.description.strip() if payload.description else None
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    return BatchResponse(
        id=batch.id,
        name=batch.name,
        description=batch.description,
        file_count=0,
        created_at=batch.created_at
    )


@router.delete("/batches/{batch_id}")
async def delete_batch(
    batch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a file batch and all its files.
    """
    batch = db.query(FileBatch).filter(
        FileBatch.id == batch_id,
        FileBatch.user_id == current_user.id
    ).first()

    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Get all files in the batch
    files = db.query(File).filter(File.batch_id == batch_id).all()

    # Track cleanup stats
    deleted_files = 0
    flows_updated = 0

    # Delete files first (reusing deletion logic would be ideal but circular imports risk)
    # We'll do it explicitly here for safety
    from app.storage.local_storage import storage

    # Get all flows to update references once
    flows = db.query(Flow).filter(Flow.user_id == current_user.id).all()

    for file in files:
        # Update flow references
        for flow in flows:
            if not flow.flow_data:
                continue
            updated_flow_data, changed = file_reference_service.remove_file_id_from_flow_data(
                flow.flow_data,
                file.id
            )
            if changed:
                flow.flow_data = updated_flow_data
                flows_updated += 1

        # Delete from disk
        try:
            storage.delete_file(current_user.id, file.filename)
        except Exception as e:
            print(f"Error deleting file {file.id} from disk: {e}")

        # Delete from DB
        db.delete(file)
        deleted_files += 1

    # Delete the batch itself
    db.delete(batch)
    db.commit()

    return {
        "message": "Batch deleted successfully",
        "deleted_files": deleted_files,
        "flows_updated": flows_updated
    }


@router.post("/cleanup-orphaned", status_code=200)
async def cleanup_orphaned_files(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Cleanup endpoint to find and delete orphaned files.
    Orphaned files are files that are not referenced by any flow.
    This is useful for cleaning up files that may have been orphaned
    before reference tracking was implemented.
    """
    # Find files that aren't referenced by any flow
    # These accumulate when flows are deleted or files are removed from flows
    orphaned_files = file_reference_service.get_orphaned_files(
        current_user.id, db)

    if not orphaned_files:
        return {
            "message": "No orphaned files found",
            "deleted_count": 0,
            "deleted_files": []
        }

    deleted_files = []
    from app.storage.local_storage import storage

    # Delete each orphaned file from both disk and database
    # Use try/except to continue even if one file fails (prevents partial cleanup)
    for file in orphaned_files:
        try:
            # Delete from disk first - if this fails, we don't want orphaned DB records
            storage.delete_file(current_user.id, file.filename)
            # Delete from database - removes the record
            db.delete(file)
            deleted_files.append({
                "id": file.id,
                "filename": file.original_filename
            })
        except Exception as e:
            # Log error but continue with other files
            # Prevents one bad file from blocking cleanup of others
            print(f"Error deleting orphaned file {file.id}: {str(e)}")

    # Commit all deletions at once - more efficient than committing per file
    db.commit()

    return {
        "message": f"Cleaned up {len(deleted_files)} orphaned file(s)",
        "deleted_count": len(deleted_files),
        "deleted_files": deleted_files
    }


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

    # Add sheet information to preview
    preview["sheets"] = sheets
    preview["current_sheet"] = sheet_name if sheet_name else (
        sheets[0] if sheets else None)

    preview_cache.set(cache_key, preview)
    return preview


def _precompute_file_previews(user_id: int, db_file: File) -> None:
    """Build previews for all sheets in a file and cache them."""
    sheets = []
    if db_file.mime_type in [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel"
    ]:
        try:
            sheets = file_service.get_excel_sheets(db_file.file_path)
        except Exception:
            sheets = []

    if not sheets:
        sheets = [None]

    sheet_options = [sheet for sheet in sheets if sheet is not None]

    for sheet_name in sheets:
        cache_key = stable_hash({
            "type": "file_preview",
            "user_id": user_id,
            "file_id": db_file.id,
            "file_size": db_file.file_size,
            "sheet_name": sheet_name or "__default__",
        })
        if preview_cache.get(cache_key) is not None:
            continue
        df = file_service.parse_file(db_file.file_path, sheet_name=sheet_name)
        preview = file_service.get_file_preview(df)
        preview["sheets"] = sheet_options
        preview["current_sheet"] = sheet_name if sheet_name is not None else (
            sheet_options[0] if sheet_options else None
        )
        preview_cache.set(cache_key, preview)


@router.get("/{file_id}/sheets", response_model=List[str])
async def list_file_sheets(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List sheet names for an Excel file (empty for CSV)."""
    db_file = db.query(File).filter(
        File.id == file_id,
        File.user_id == current_user.id
    ).first()

    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    if db_file.mime_type not in [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel"
    ]:
        return []

    return file_service.get_excel_sheets(db_file.file_path)


@router.options("/{file_id}/download")
async def download_file_options(file_id: int):
    """Handle OPTIONS preflight request for file download"""
    cors_origins = settings.get_cors_origins()
    origin_header = cors_origins[0] if cors_origins else "*"

    return Response(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": origin_header,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        }
    )


@router.get("/{file_id}/download")
async def download_file(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download a file"""
    db_file = db.query(File).filter(
        File.id == file_id,
        File.user_id == current_user.id
    ).first()

    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    from pathlib import Path
    file_path = Path(db_file.file_path)

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    cors_origins = settings.get_cors_origins()
    # Use the first origin or allow all if none specified
    origin_header = cors_origins[0] if cors_origins else "*"

    # Read file content
    with open(file_path, "rb") as f:
        file_content = f.read()

    # Create response with CORS headers
    headers = {
        "Content-Disposition": f"attachment; filename={db_file.original_filename}",
        "Access-Control-Allow-Origin": origin_header,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
    }

    return Response(
        content=file_content,
        media_type=db_file.mime_type,
        headers=headers
    )


@router.get("/{file_id}", response_model=FileResponse)
async def get_file(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a single file by ID"""
    db_file = db.query(File).filter(
        File.id == file_id,
        File.user_id == current_user.id
    ).first()

    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    return db_file


@router.delete("/{file_id}")
async def delete_file(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a file.
    Files can be deleted even if they are referenced by flows.
    The file will be removed from disk and database.
    """
    db_file = db.query(File).filter(
        File.id == file_id,
        File.user_id == current_user.id
    ).first()

    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    # Remove file references from any flows before deleting.
    flows = db.query(Flow).filter(Flow.user_id == current_user.id).all()
    flows_updated = 0
    for flow in flows:
        if not flow.flow_data:
            continue
        updated_flow_data, changed = file_reference_service.remove_file_id_from_flow_data(
            flow.flow_data,
            file_id
        )
        if changed:
            flow.flow_data = updated_flow_data
            flows_updated += 1

    # Delete file from disk
    from app.storage.local_storage import storage
    storage.delete_file(current_user.id, db_file.filename)

    # Delete file from database
    db.delete(db_file)
    db.commit()

    return {
        "message": "File deleted successfully",
        "flows_updated": flows_updated,
    }
