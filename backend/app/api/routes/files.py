from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile, Query, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_serializer
from datetime import datetime
from app.core.database import get_db
from app.core.config import settings
from app.api.dependencies import get_current_user
from app.models.user import User
from app.models.file import File
from app.services.file_service import file_service
from app.services.file_reference_service import file_reference_service

router = APIRouter(prefix="/files", tags=["files"])


class FileResponse(BaseModel):
    id: int
    filename: str
    original_filename: str
    file_size: int
    mime_type: str
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


@router.post("/upload", response_model=FileResponse, status_code=201)
async def upload_file(
    file: UploadFile = FastAPIFile(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload a file (Excel or CSV)"""
    db_file = await file_service.upload_file(db, current_user.id, file)
    return db_file


@router.get("/", response_model=List[FileResponse])
async def list_files(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all files for current user"""
    files = db.query(File).filter(File.user_id == current_user.id).all()
    return files


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

    for file in orphaned_files:
        try:
            # Delete from disk
            storage.delete_file(current_user.id, file.filename)
            # Delete from database
            db.delete(file)
            deleted_files.append({
                "id": file.id,
                "filename": file.original_filename
            })
        except Exception as e:
            # Log error but continue with other files
            print(f"Error deleting orphaned file {file.id}: {str(e)}")

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

    return preview


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

    # Delete file from disk
    from app.storage.local_storage import storage
    storage.delete_file(current_user.id, db_file.filename)

    # Delete file from database
    db.delete(db_file)
    db.commit()

    return {"message": "File deleted successfully"}
