import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import ObjectDeletedError
from sqlalchemy.exc import NoResultFound
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_serializer
from datetime import datetime
from app.core.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import User
from app.models.flow import Flow
from app.models.file import File
from app.models.file_batch import FileBatch
from app.services.file_reference_service import file_reference_service
from app.services.file_service import file_service
from app.storage.local_storage import storage

router = APIRouter(prefix="/flows", tags=["flows"])
logger = logging.getLogger(__name__)

# Constants
# Constant is used in all 3 locations (lines 94, 113, 167) - linter warning is false positive
FLOW_NOT_FOUND_MESSAGE = "Flow not found"  # noqa: S105, RUF001


class FlowCreate(BaseModel):
    name: str
    description: Optional[str] = None
    flow_data: dict


class FlowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    flow_data: Optional[dict] = None


class FlowResponse(BaseModel):
    id: int
    user_id: int
    name: str
    description: Optional[str]
    flow_data: dict
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)

    @field_serializer('created_at')
    def serialize_created_at(self, value: datetime, _info):
        return value.isoformat() if value else None

    @field_serializer('updated_at')
    def serialize_updated_at(self, value: Optional[datetime], _info):
        return value.isoformat() if value else None


@router.post("/", response_model=FlowResponse, status_code=201)
async def create_flow(
    flow: FlowCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new flow"""
    db_flow = Flow(
        user_id=current_user.id,
        name=flow.name,
        description=flow.description,
        flow_data=flow.flow_data
    )
    db.add(db_flow)
    db.commit()
    db.refresh(db_flow)
    return db_flow


@router.get("/", response_model=List[FlowResponse])
async def list_flows(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all flows for current user"""
    flows = db.query(Flow).filter(Flow.user_id == current_user.id).all()
    return flows


@router.get("/{flow_id}", response_model=FlowResponse)
async def get_flow(
    flow_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific flow"""
    flow = db.query(Flow).filter(
        Flow.id == flow_id,
        Flow.user_id == current_user.id
    ).first()

    if not flow:
        raise HTTPException(status_code=404, detail=FLOW_NOT_FOUND_MESSAGE)

    return flow


@router.put("/{flow_id}", response_model=FlowResponse)
async def update_flow(
    flow_id: int,
    flow_update: FlowUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a flow"""
    flow = db.query(Flow).filter(
        Flow.id == flow_id,
        Flow.user_id == current_user.id
    ).first()

    if not flow:
        raise HTTPException(status_code=404, detail=FLOW_NOT_FOUND_MESSAGE)

    # If flow_data is being updated, check for orphaned files
    if flow_update.flow_data is not None:
        # Get old file IDs before update
        old_file_ids = file_reference_service.get_files_for_flow(flow)

        # Update flow data
        flow.flow_data = flow_update.flow_data

        # Get new file IDs after update
        new_file_ids = file_reference_service.extract_file_ids_from_flow_data(
            flow_update.flow_data)

        # Find files that are no longer referenced by this flow
        removed_file_ids = old_file_ids - new_file_ids

        # Delete files that are no longer referenced by any flow
        for file_id in removed_file_ids:
            if not file_reference_service.is_file_referenced(file_id, current_user.id, db, exclude_flow_id=flow_id):
                # File is not referenced by any other flow, safe to delete
                db_file = db.query(File).filter(
                    File.id == file_id,
                    File.user_id == current_user.id
                ).first()

                if db_file:
                    # Delete from disk
                    storage.delete_file(current_user.id, db_file.filename)
                    # Delete from database
                    db.delete(db_file)

    if flow_update.name is not None:
        flow.name = flow_update.name
    if flow_update.description is not None:
        flow.description = flow_update.description

    db.commit()
    db.refresh(flow)
    return flow


@router.delete("/{flow_id}")
async def delete_flow(
    flow_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a flow and clean up associated files and batches that are no longer referenced"""
    flow = db.query(Flow).filter(
        Flow.id == flow_id,
        Flow.user_id == current_user.id
    ).first()

    if not flow:
        raise HTTPException(status_code=404, detail=FLOW_NOT_FOUND_MESSAGE)

    # 1. Get all file IDs and associated batch IDs from this flow
    file_ids_in_flow = file_reference_service.get_files_for_flow(flow)
    batch_ids_in_flow = set()
    if file_ids_in_flow:
        files_with_batches = db.query(File).filter(
            File.id.in_(file_ids_in_flow),
            File.batch_id.isnot(None)
        ).all()
        batch_ids_in_flow = {file.batch_id for file in files_with_batches}

    # 1.5 Delete batches strictly belonging to this flow
    # These are groups created specifically within this flow
    deleted_batches = []
    # Use a fresh query to ensure we get current state
    flow_batches = db.query(FileBatch).filter(
        FileBatch.flow_id == flow_id).all()

    # We need to collect IDs first to avoid issues if iteration and deletion conflict
    flow_batch_ids = [b.id for b in flow_batches]

    for batch_id in flow_batch_ids:
        # Re-query precisely to ensure object is attached and valid
        batch_to_delete = db.query(FileBatch).filter(
            FileBatch.id == batch_id).first()
        if batch_to_delete:
            file_service.delete_batch(db, current_user.id, batch_to_delete.id)
            deleted_batches.append(batch_to_delete.id)

    # 2. Delete the flow
    db.delete(flow)
    db.commit()

    # 3. Clean up orphaned batches (referenced by files in the flow but not OF the flow)
    # Note: The flow has already been deleted and committed above, so no need to exclude it
    # from reference checks - it no longer exists in the database.
    for batch_id in batch_ids_in_flow:
        if batch_id in deleted_batches:
            continue

        batch = db.query(FileBatch).filter(FileBatch.id == batch_id).first()
        if not batch:
            continue

        is_batch_referenced_elsewhere = False
        # Check if any file in this batch is still referenced by any remaining flow
        for file_in_batch in batch.files:
            if file_reference_service.is_file_referenced(file_in_batch.id, current_user.id, db):
                is_batch_referenced_elsewhere = True
                break

        if not is_batch_referenced_elsewhere:
            file_service.delete_batch(db, current_user.id, batch_id)
            deleted_batches.append(batch_id)

    # 4. Clean up individual orphaned files
    deleted_files = []
    had_rollback = False
    for file_id in file_ids_in_flow:
        if had_rollback:
            # After a rollback, we cannot safely continue with more deletions
            break

        if not file_reference_service.is_file_referenced(file_id, current_user.id, db):
            db_file = db.query(File).filter(
                File.id == file_id,
                File.user_id == current_user.id
            ).first()

            if db_file:
                try:
                    storage.delete_file(current_user.id, db_file.filename)
                    db.delete(db_file)
                    deleted_files.append(file_id)
                except (ObjectDeletedError, NoResultFound, FileNotFoundError) as e:
                    # Expected: file was already deleted with its batch or storage file missing
                    logger.info(
                        f"File {file_id} already deleted or not found: {e}")
                    db.expunge(db_file) if db_file in db else None
                except Exception as e:
                    # Unexpected error - log and abort to prevent inconsistent state
                    logger.error(
                        f"Unexpected error deleting file {file_id}: {e}")
                    db.rollback()
                    had_rollback = True

    if not had_rollback:
        db.commit()

    return {
        "message": "Flow deleted successfully",
        "deleted_files": deleted_files,
        "deleted_batches": deleted_batches
    }
