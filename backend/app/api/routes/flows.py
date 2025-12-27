from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_serializer
from datetime import datetime
from app.core.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import User
from app.models.flow import Flow
from app.models.file import File
from app.services.file_reference_service import file_reference_service
from app.storage.local_storage import storage

router = APIRouter(prefix="/flows", tags=["flows"])

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
        new_file_ids = file_reference_service.extract_file_ids_from_flow_data(flow_update.flow_data)
        
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
    """Delete a flow and clean up associated files that are no longer referenced"""
    flow = db.query(Flow).filter(
        Flow.id == flow_id,
        Flow.user_id == current_user.id
    ).first()

    if not flow:
        raise HTTPException(status_code=404, detail=FLOW_NOT_FOUND_MESSAGE)

    # Get all file IDs referenced by this flow
    file_ids = file_reference_service.get_files_for_flow(flow)
    
    # Delete the flow first
    db.delete(flow)
    db.commit()

    # Clean up files that are no longer referenced by any flow
    deleted_files = []
    for file_id in file_ids:
        # Check if file is still referenced by any other flow
        if not file_reference_service.is_file_referenced(file_id, current_user.id, db):
            # File is orphaned, safe to delete
            db_file = db.query(File).filter(
                File.id == file_id,
                File.user_id == current_user.id
            ).first()
            
            if db_file:
                # Delete from disk
                storage.delete_file(current_user.id, db_file.filename)
                # Delete from database
                db.delete(db_file)
                deleted_files.append(file_id)
    
    if deleted_files:
        db.commit()
        return {
            "message": "Flow deleted successfully",
            "deleted_files": deleted_files,
            "files_cleaned_up": len(deleted_files)
        }
    
    return {"message": "Flow deleted successfully"}
