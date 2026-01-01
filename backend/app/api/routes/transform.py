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
    file_ids: list[int] | None = None
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
    requested_ids = request.file_ids if request.file_ids else [request.file_id]
    # Load all referenced files (multi-file flows need more than one).
    db_files = db.query(File).filter(
        File.user_id == current_user.id,
        File.id.in_(requested_ids)
    ).all()

    if not db_files:
        raise HTTPException(status_code=404, detail="File not found")

    file_paths_by_id = {db_file.id: db_file.file_path for db_file in db_files}

    # Execute flow
    try:
        table_map, last_table_key = transform_service.execute_flow(
            file_paths_by_id,
            request.flow_data
        )

        # Choose a preview table (last modified or first available).
        if last_table_key and last_table_key in table_map:
            result_df = table_map[last_table_key]
        else:
            # Fallback to the first file in case no transforms ran.
            fallback_file_id = requested_ids[0]
            result_df = file_service.parse_file(file_paths_by_id[fallback_file_id])

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
    requested_ids = request.file_ids if request.file_ids else [request.file_id]
    db_files = db.query(File).filter(
        File.user_id == current_user.id,
        File.id.in_(requested_ids)
    ).all()

    if not db_files:
        raise HTTPException(status_code=404, detail="File not found")

    file_paths_by_id = {db_file.id: db_file.file_path for db_file in db_files}

    # Execute flow
    try:
        table_map, last_table_key = transform_service.execute_flow(
            file_paths_by_id,
            request.flow_data
        )

        nodes = request.flow_data.get("nodes", [])
        output_node = next(
            (node for node in nodes if node.get("data", {}).get("blockType") == "output"),
            None
        )
        output_config = output_node.get("data", {}).get("output", {}) if output_node else {}
        output_name = output_config.get("fileName") or "output.xlsx"
        output_sheets = output_config.get("sheets") if isinstance(output_config, dict) else []

        # Convert to Excel bytes
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            if output_sheets:
                for sheet in output_sheets:
                    source = sheet.get("source", {}) if isinstance(sheet, dict) else {}
                    source_file_id = source.get("fileId")
                    source_sheet_name = source.get("sheetName")
                    if source_file_id not in file_paths_by_id:
                        continue
                    table_key = f"{source_file_id}:{source_sheet_name or '__default__'}"
                    df = table_map.get(table_key)
                    if df is None:
                        df = file_service.parse_file(
                            file_paths_by_id[source_file_id],
                            sheet_name=source_sheet_name
                        )
                    sheet_name = sheet.get("sheetName") or "Sheet1"
                    df.to_excel(writer, index=False, sheet_name=sheet_name)
            else:
                if last_table_key and last_table_key in table_map:
                    result_df = table_map[last_table_key]
                else:
                    fallback_file_id = requested_ids[0]
                    result_df = file_service.parse_file(file_paths_by_id[fallback_file_id])
                result_df.to_excel(writer, index=False, sheet_name="Sheet1")
        output.seek(0)

        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            io.BytesIO(output.read()),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename={output_name}"
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error exporting result: {str(e)}"
        )
