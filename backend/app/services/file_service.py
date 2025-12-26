import pandas as pd
from pathlib import Path
from typing import Optional, Dict, Any
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session
from app.models.file import File
from app.storage.local_storage import storage


class FileService:
    @staticmethod
    async def upload_file(
        db: Session,
        user_id: int,
        file: UploadFile
    ) -> File:
        """Upload and parse a file"""
        # Validate file type
        if not file.filename:
            raise HTTPException(status_code=400, detail="Filename is required")
        
        allowed_extensions = {".xlsx", ".xls", ".csv"}
        file_ext = Path(file.filename).suffix.lower()
        
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"File type not supported. Allowed: {', '.join(allowed_extensions)}"
            )
        
        # Save file
        file_path, filename = await storage.save_file(file, user_id)
        
        # Get file size
        file_size = Path(file_path).stat().st_size
        
        # Determine MIME type
        mime_type_map = {
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".xls": "application/vnd.ms-excel",
            ".csv": "text/csv"
        }
        mime_type = mime_type_map.get(file_ext, "application/octet-stream")
        
        # Create database record
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
        db.refresh(db_file)
        
        return db_file

    @staticmethod
    def parse_file(file_path: str) -> pd.DataFrame:
        """Parse Excel or CSV file into pandas DataFrame"""
        path = Path(file_path)
        
        if not path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        try:
            if path.suffix.lower() == ".csv":
                df = pd.read_csv(file_path)
            else:
                df = pd.read_excel(file_path, engine="openpyxl")
            
            return df
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Error parsing file: {str(e)}"
            )

    @staticmethod
    def get_file_preview(df: pd.DataFrame, rows: int = 20) -> Dict[str, Any]:
        """Get preview of DataFrame"""
        preview_df = df.head(rows)
        
        return {
            "columns": list(df.columns),
            "row_count": len(df),
            "preview_rows": preview_df.to_dict(orient="records"),
            "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()}
        }


file_service = FileService()

