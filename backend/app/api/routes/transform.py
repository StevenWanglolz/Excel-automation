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
from app.services.file_reference_service import file_reference_service
from app.services.preview_cache import preview_cache, stable_hash
import pandas as pd
import io

router = APIRouter(prefix="/transform", tags=["transform"])


class FlowExecuteRequest(BaseModel):
    file_id: int
    file_ids: list[int] | None = None
    flow_data: Dict[str, Any]
    preview_target: Dict[str, Any] | None = None


class FlowPrecomputeRequest(BaseModel):
    file_id: int | None = None
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
    requested_ids = [file_id for file_id in requested_ids if isinstance(file_id, int) and file_id > 0]
    referenced_ids = list(file_reference_service.extract_file_ids_from_flow_data(request.flow_data))
    effective_ids = requested_ids or referenced_ids
    # Load all referenced files (multi-file flows need more than one).
    db_files = []
    if effective_ids:
        db_files = db.query(File).filter(
            File.user_id == current_user.id,
            File.id.in_(effective_ids)
        ).all()

    if effective_ids and not db_files:
        raise HTTPException(status_code=404, detail="File not found")

    file_paths_by_id = {db_file.id: db_file.file_path for db_file in db_files}
    file_fingerprints = [{"id": db_file.id, "size": db_file.file_size} for db_file in db_files]

    # Execute flow
    try:
        # Cache preview results to avoid re-running transforms on repeated previews.
        preview_target_payload = request.preview_target or {}
        preview_cache_key = stable_hash({
            "user_id": current_user.id,
            "files": file_fingerprints,
            "flow_data": request.flow_data,
            "preview_target": preview_target_payload,
        })
        cached_preview = preview_cache.get(preview_cache_key)
        if cached_preview is not None:
            return cached_preview

        table_map, last_table_key = transform_service.execute_flow(
            file_paths_by_id,
            request.flow_data
        )

        preview_target = preview_target_payload
        target_file_id = preview_target.get("file_id")
        target_sheet_name = preview_target.get("sheet_name")
        target_virtual_id = preview_target.get("virtual_id")

        if not target_file_id and isinstance(target_virtual_id, str):
            table_key = f"virtual:{target_virtual_id}"
            result_df = table_map.get(table_key)
            if result_df is None:
                result_df = pd.DataFrame()
            preview = file_service.get_file_preview(result_df)
            response_payload = {
                "preview": preview,
                "row_count": len(result_df),
                "column_count": len(result_df.columns)
            }
            preview_cache.set(preview_cache_key, response_payload)
            return response_payload

        if target_file_id:
            table_key = f"{target_file_id}:{target_sheet_name or '__default__'}"
            result_df = table_map.get(table_key)
            if result_df is None and target_file_id in file_paths_by_id:
                result_df = file_service.parse_file(
                    file_paths_by_id[target_file_id],
                    sheet_name=target_sheet_name
                )
            if result_df is None:
                result_df = pd.DataFrame()
        elif last_table_key and last_table_key in table_map:
            result_df = table_map[last_table_key]
        elif effective_ids:
            # Fallback to the first file in case no transforms ran.
            fallback_file_id = effective_ids[0]
            result_df = file_service.parse_file(file_paths_by_id[fallback_file_id])
        else:
            result_df = pd.DataFrame()

        preview = file_service.get_file_preview(result_df)

        response_payload = {
            "preview": preview,
            "row_count": len(result_df),
            "column_count": len(result_df.columns)
        }
        preview_cache.set(preview_cache_key, response_payload)
        return response_payload
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error executing flow: {str(e)}"
        )


@router.post("/precompute")
async def precompute_flow(
    request: FlowPrecomputeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Precompute previews for output sheets to warm the server cache."""
    requested_ids = request.file_ids if request.file_ids else []
    if request.file_id:
        requested_ids = requested_ids + [request.file_id]
    requested_ids = [file_id for file_id in requested_ids if isinstance(file_id, int) and file_id > 0]
    referenced_ids = list(file_reference_service.extract_file_ids_from_flow_data(request.flow_data))
    effective_ids = requested_ids or referenced_ids

    db_files = []
    if effective_ids:
        db_files = db.query(File).filter(
            File.user_id == current_user.id,
            File.id.in_(effective_ids)
        ).all()

    if effective_ids and not db_files:
        raise HTTPException(status_code=404, detail="File not found")

    file_paths_by_id = {db_file.id: db_file.file_path for db_file in db_files}
    file_fingerprints = [{"id": db_file.id, "size": db_file.file_size} for db_file in db_files]

    nodes = request.flow_data.get("nodes", [])
    output_node = next(
        (node for node in nodes if node.get("data", {}).get("blockType") == "output"),
        None
    )
    output_config = output_node.get("data", {}).get("output", {}) if output_node else {}
    output_files = output_config.get("outputs") if isinstance(output_config, dict) else []

    if not output_files:
        return {"status": "skipped", "precomputed": 0}

    try:
        # Execute once so we can reuse the resulting tables for all output sheets.
        table_map, _ = transform_service.execute_flow(
            file_paths_by_id,
            request.flow_data
        )

        precomputed = 0
        for index, output_file in enumerate(output_files):
            output_id = output_file.get("id") if isinstance(output_file, dict) else None
            if not output_id:
                output_id = f"output-{index + 1}"
            sheets = output_file.get("sheets") if isinstance(output_file, dict) else []
            if not sheets:
                sheets = [{"sheetName": "Sheet 1"}]
            for sheet in sheets:
                sheet_name = sheet.get("sheetName") or "Sheet 1"
                preview_target = {"virtual_id": f"output:{output_id}:{sheet_name}"}
                preview_cache_key = stable_hash({
                    "user_id": current_user.id,
                    "files": file_fingerprints,
                    "flow_data": request.flow_data,
                    "preview_target": preview_target,
                })
                if preview_cache.get(preview_cache_key) is not None:
                    continue
                table_key = f"virtual:{preview_target['virtual_id']}"
                result_df = table_map.get(table_key, pd.DataFrame())
                preview = file_service.get_file_preview(result_df)
                preview_cache.set(preview_cache_key, {
                    "preview": preview,
                    "row_count": len(result_df),
                    "column_count": len(result_df.columns)
                })
                precomputed += 1

        return {"status": "ok", "precomputed": precomputed}
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error precomputing previews: {str(e)}"
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
        output_files = output_config.get("outputs") if isinstance(output_config, dict) else []
        legacy_file_name = output_config.get("fileName") if isinstance(output_config, dict) else None
        legacy_sheets = output_config.get("sheets") if isinstance(output_config, dict) else None

        if last_table_key and last_table_key in table_map:
            result_df = table_map[last_table_key]
        elif effective_ids:
            fallback_file_id = effective_ids[0]
            result_df = file_service.parse_file(file_paths_by_id[fallback_file_id])
        else:
            result_df = pd.DataFrame()

        # Convert to Excel bytes
        outputs_to_write = output_files if isinstance(output_files, list) else []
        if not outputs_to_write and (legacy_file_name or legacy_sheets):
            outputs_to_write = [{
                "fileName": legacy_file_name or "output.xlsx",
                "sheets": legacy_sheets or [{"sheetName": "Sheet1"}],
            }]
        if not outputs_to_write:
            outputs_to_write = [{
                "fileName": "output.xlsx",
                "sheets": [{"sheetName": "Sheet1"}],
            }]

        files_payload = []
        for index, output_file in enumerate(outputs_to_write):
            file_name = output_file.get("fileName") or "output.xlsx"
            sheets = output_file.get("sheets") if isinstance(output_file, dict) else []
            output_id = output_file.get("id") if isinstance(output_file, dict) else None
            if not output_id:
                output_id = f"output-{index + 1}"
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine="openpyxl") as writer:
                if sheets:
                    for sheet in sheets:
                        sheet_name = sheet.get("sheetName") or "Sheet1"
                        virtual_key = f"virtual:output:{output_id}:{sheet_name}"
                        sheet_df = table_map.get(virtual_key, pd.DataFrame())
                        sheet_df.to_excel(writer, index=False, sheet_name=sheet_name)
                else:
                    result_df.to_excel(writer, index=False, sheet_name="Sheet1")
            output.seek(0)
            files_payload.append((file_name, output.read()))

        from fastapi.responses import StreamingResponse
        if len(files_payload) == 1:
            file_name, payload = files_payload[0]
            return StreamingResponse(
                io.BytesIO(payload),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": f"attachment; filename={file_name}"
                }
            )

        zip_output = io.BytesIO()
        import zipfile
        with zipfile.ZipFile(zip_output, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for file_name, payload in files_payload:
                zip_file.writestr(file_name, payload)
        zip_output.seek(0)
        return StreamingResponse(
            io.BytesIO(zip_output.read()),
            media_type="application/zip",
            headers={
                "Content-Disposition": "attachment; filename=outputs.zip"
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error exporting result: {str(e)}"
        )
