from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, Any
from app.core.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import User
from app.models.file import File
from app.services.transform_service import transform_service
from app.services.file_service import file_service
import pandas as pd
import io

router = APIRouter(prefix="/transform", tags=["transform"])


class FlowExecuteRequest(BaseModel):
    file_id: int
    flow_data: Dict[str, Any]


class StepPreviewRequest(BaseModel):
    file_id: int
    step_config: Dict[str, Any]


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


@router.post("/preview-step")
async def preview_step(
    request: StepPreviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Preview a single transformation step"""
    # Get file
    db_file = db.query(File).filter(
        File.id == request.file_id,
        File.user_id == current_user.id
    ).first()

    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    # Preview step
    try:
        preview = transform_service.preview_step(
            db_file.file_path,
            request.step_config
        )
        return preview
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error previewing step: {str(e)}"
        )


@router.post("/export")
async def export_result(
    request: FlowExecuteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Execute flow and export result as Excel"""
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

        # Convert to Excel bytes
        output = io.BytesIO()
        result_df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)

        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            io.BytesIO(output.read()),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename=result.xlsx"
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error exporting result: {str(e)}"
        )
