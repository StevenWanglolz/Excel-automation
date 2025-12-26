import os
import uuid
from pathlib import Path
from typing import Optional
from fastapi import UploadFile
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
        
        # Save file
        with open(file_path, "wb") as f:
            content = await file.read()
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

