import pandas as pd
import numpy as np
import os
from pathlib import Path
from typing import Optional, Dict, Any
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session
from app.models.file import File
from app.storage.local_storage import storage
from app.core.config import settings
from app.models.file_batch import FileBatch
from app.models.flow import Flow
from app.services.file_reference_service import file_reference_service


class FileService:
    @staticmethod
    def delete_batch(db: Session, user_id: int, batch_id: int):
        """Deletes a batch and all its associated files."""
        batch = db.query(FileBatch).filter(
            FileBatch.id == batch_id,
            FileBatch.user_id == user_id
        ).first()

        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")

        files = db.query(File).filter(File.batch_id == batch_id).all()
        file_ids = [f.id for f in files]

        # Optimization: Query only flows that might reference these files
        # Uses JSON containment to filter at the DB level instead of loading all flows
        flows_to_check = db.query(Flow).filter(
            Flow.user_id == user_id,
            Flow.flow_data.isnot(None)
        ).all()

        # Build a set of flows that actually reference any of our file IDs
        # This is more efficient than checking each file against each flow
        affected_flows = []
        for flow in flows_to_check:
            flow_changed = False
            current_flow_data = flow.flow_data
            for file_id in file_ids:
                updated_flow_data, changed = file_reference_service.remove_file_id_from_flow_data(
                    current_flow_data,
                    file_id
                )
                if changed:
                    current_flow_data = updated_flow_data
                    flow_changed = True
            if flow_changed:
                flow.flow_data = current_flow_data
                affected_flows.append(flow.id)

        for file in files:
            try:
                storage.delete_file(user_id, file.filename)
            except Exception as e:
                print(f"Error deleting file {file.id} from disk: {e}")

            db.delete(file)

        db.delete(batch)
        # The calling function will be responsible for the final db.commit()

    @staticmethod
    async def upload_file(
        db: Session,
        user_id: int,
        file: UploadFile,
        batch_id: int | None = None
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
            batch_id=batch_id,
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

    @staticmethod
    def resolve_unique_original_name(
        db: Session,
        user_id: int,
        batch_id: int | None,
        desired_name: str,
        reserved_names: Optional[set[str]] = None,
    ) -> str:
        """
        Resolve output name conflicts by appending a numbered suffix.

        This prevents overwriting or confusing duplicates in a batch.
        """
        reserved_names = reserved_names or set()
        base_name = desired_name.strip() or "output.xlsx"

        existing = db.query(File.original_filename).filter(
            File.user_id == user_id,
            File.batch_id == batch_id,
        ).all()
        existing_names = {row[0] for row in existing}.union(reserved_names)

        if base_name not in existing_names:
            return base_name

        stem, ext = os.path.splitext(base_name)
        counter = 1
        while True:
            candidate = f"{stem} ({counter}){ext}"
            if candidate not in existing_names:
                return candidate
            counter += 1

    @staticmethod
    def save_generated_file(
        db: Session,
        user_id: int,
        original_filename: str,
        content: bytes,
        batch_id: int | None = None,
    ) -> File:
        """
        Persist generated output files so they can be reused in other flows.

        Generated files are saved with a unique on-disk name while keeping
        a user-friendly original filename for display.
        """
        if not content:
            raise HTTPException(
                status_code=400, detail="Generated file is empty")

        if len(content) > settings.MAX_FILE_SIZE:
            max_size_mb = settings.MAX_FILE_SIZE / (1024 * 1024)
            file_size_mb = len(content) / (1024 * 1024)
            raise HTTPException(
                status_code=413,
                detail=f"File size ({file_size_mb:.2f}MB) exceeds maximum allowed size ({max_size_mb:.0f}MB)"
            )

        file_path, filename = storage.save_bytes(
            user_id=user_id,
            original_filename=original_filename,
            content=content,
        )

        file_ext = Path(original_filename).suffix.lower()
        mime_type_map = {
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".xls": "application/vnd.ms-excel",
            ".csv": "text/csv"
        }
        mime_type = mime_type_map.get(file_ext, "application/octet-stream")

        db_file = File(
            user_id=user_id,
            batch_id=batch_id,
            filename=filename,
            original_filename=original_filename,
            file_path=file_path,
            file_size=len(content),
            mime_type=mime_type
        )
        db.add(db_file)
        db.commit()
        db.refresh(db_file)
        return db_file

    @staticmethod
    def parse_file(file_path: str, sheet_name: Optional[str] = None) -> pd.DataFrame:
        """Parse Excel or CSV file into pandas DataFrame"""
        path = Path(file_path)

        if not path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        try:
            if path.suffix.lower() == ".csv":
                df = pd.read_csv(file_path)
            else:
                # Excel files can have multiple sheets - handle both single sheet and multi-sheet cases
                # If sheet_name is None, pd.read_excel returns a dict of all sheets
                # If sheet_name is specified, returns DataFrame directly (single sheet)
                result = pd.read_excel(
                    file_path, engine="openpyxl", sheet_name=sheet_name)

                # Handle case where Excel file has multiple sheets
                # pd.read_excel returns dict when sheet_name=None or when reading all sheets
                if isinstance(result, dict):
                    if sheet_name and sheet_name in result:
                        df = result[sheet_name]
                    else:
                        # Fallback to first sheet if requested sheet not found or not specified
                        # This prevents errors when user requests non-existent sheet
                        first_sheet_name = list(result.keys())[0]
                        df = result[first_sheet_name]
                else:
                    # Single sheet case - result is already a DataFrame
                    df = result

            return df
        except Exception as e:
            # Wrap parsing errors to provide user-friendly messages
            # Original pandas errors can be cryptic (e.g., "UnicodeDecodeError")
            raise HTTPException(
                status_code=400,
                detail=f"Error parsing file: {str(e)}"
            )

    @staticmethod
    def get_excel_sheets(file_path: str) -> list[str]:
        """Get list of sheet names from Excel file"""
        path = Path(file_path)

        if not path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        if path.suffix.lower() not in {".xlsx", ".xls"}:
            return []  # CSV files don't have sheets

        try:
            import openpyxl
            workbook = openpyxl.load_workbook(file_path, read_only=True)
            return workbook.sheetnames
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Error reading Excel sheets: {str(e)}"
            )

    @staticmethod
    def get_file_preview(df: pd.DataFrame, rows: int = 20) -> Dict[str, Any]:
        """Get preview of DataFrame"""
        preview_df = df.head(rows).copy()

        # Clean data for JSON serialization - pandas DataFrames contain values that JSON can't handle
        # Without this cleaning, API responses would fail with serialization errors
        for col in preview_df.columns:
            # Replace NaN with None - JSON doesn't support NaN, only null
            preview_df[col] = preview_df[col].replace([np.nan], None)

            # Replace infinity values with None - JSON doesn't support infinity
            preview_df[col] = preview_df[col].replace([np.inf, -np.inf], None)

            # Handle very large numbers that exceed JSON's safe integer range
            # JavaScript's Number.MAX_SAFE_INTEGER is 2^53 - 1
            # Values beyond this can lose precision when sent to frontend
            if preview_df[col].dtype in [np.float64, np.float32]:
                max_safe = 2**53 - 1
                min_safe = -(2**53 - 1)
                mask = (preview_df[col] > max_safe) | (
                    preview_df[col] < min_safe)
                preview_df.loc[mask, col] = None

        # Convert to dict format for JSON response
        # Use try/except because some edge cases (e.g., complex objects) can still fail
        try:
            preview_rows = preview_df.to_dict(orient="records")
        except (ValueError, OverflowError):
            # Fallback: manually convert each row to handle edge cases
            # This ensures we can always return preview data even with problematic values
            preview_rows = []
            for _, row in preview_df.iterrows():
                row_dict = {}
                for col in preview_df.columns:
                    val = row[col]
                    if pd.isna(val) or val in [np.inf, -np.inf]:
                        row_dict[col] = None
                    elif isinstance(val, (np.integer, np.floating)):
                        # Convert numpy types to Python native types for JSON serialization
                        # numpy types aren't directly JSON serializable
                        if np.isnan(val) or np.isinf(val):
                            row_dict[col] = None
                        else:
                            row_dict[col] = float(val) if isinstance(
                                val, np.floating) else int(val)
                    else:
                        row_dict[col] = val
                preview_rows.append(row_dict)

        return {
            "columns": list(df.columns),
            "row_count": len(df),
            "preview_rows": preview_rows,
            "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()}
        }


file_service = FileService()
