from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from app.core.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import User
from app.models.file import File
from app.services.file_service import file_service

router = APIRouter(prefix="/files", tags=["files"])


class FileResponse(BaseModel):
    id: int
    filename: str
    original_filename: str
    file_size: int
    mime_type: str
    created_at: str

    class Config:
        from_attributes = True


class FilePreviewResponse(BaseModel):
    columns: List[str]
    row_count: int
    preview_rows: List[dict]
    dtypes: dict


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


@router.get("/{file_id}/preview", response_model=FilePreviewResponse)
async def preview_file(
    file_id: int,
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

    df = file_service.parse_file(db_file.file_path)
    preview = file_service.get_file_preview(df)

    return preview


@router.delete("/{file_id}")
async def delete_file(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a file"""
    db_file = db.query(File).filter(
        File.id == file_id,
        File.user_id == current_user.id
    ).first()

    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    from app.storage.local_storage import storage
    storage.delete_file(current_user.id, db_file.filename)

    db.delete(db_file)
    db.commit()

    return {"message": "File deleted successfully"}
