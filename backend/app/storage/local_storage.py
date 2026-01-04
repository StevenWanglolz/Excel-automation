import os
import uuid
from pathlib import Path
from typing import Optional
from fastapi import UploadFile, HTTPException
from app.core.config import settings


class LocalStorage:
    def __init__(self):
        self.upload_dir = Path(settings.UPLOAD_DIR)
        self.upload_dir.mkdir(parents=True, exist_ok=True)

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

    def save_bytes(self, user_id: int, original_filename: str, content: bytes) -> tuple[str, str]:
        """
        Save generated file content to disk and return (file_path, filename).

        This mirrors save_file but accepts bytes instead of an UploadFile.
        """
        file_ext = Path(original_filename).suffix
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        user_dir = self.upload_dir / str(user_id)
        user_dir.mkdir(parents=True, exist_ok=True)

        file_path = user_dir / unique_filename

        with open(file_path, "wb") as f:
            f.write(content)

        return str(file_path), unique_filename

    def get_file_path(self, user_id: int, filename: str) -> Path:
        """Get full path to a file"""
        return self.upload_dir / str(user_id) / filename

    def delete_file(self, user_id: int, filename: str) -> bool:
        """Delete a file"""
        file_path = self.get_file_path(user_id, filename)
        if file_path.exists():
            file_path.unlink()
            return True
        return False

    def file_exists(self, user_id: int, filename: str) -> bool:
        """Check if file exists"""
        return self.get_file_path(user_id, filename).exists()


storage = LocalStorage()
