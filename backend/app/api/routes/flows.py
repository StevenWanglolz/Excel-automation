from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_serializer
from datetime import datetime
from app.core.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import User
from app.models.flow import Flow

router = APIRouter(prefix="/flows", tags=["flows"])


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
        raise HTTPException(status_code=404, detail="Flow not found")

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
        raise HTTPException(status_code=404, detail="Flow not found")

    if flow_update.name is not None:
        flow.name = flow_update.name
    if flow_update.description is not None:
        flow.description = flow_update.description
    if flow_update.flow_data is not None:
        flow.flow_data = flow_update.flow_data

    db.commit()
    db.refresh(flow)
    return flow


@router.delete("/{flow_id}")
async def delete_flow(
    flow_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a flow"""
    flow = db.query(Flow).filter(
        Flow.id == flow_id,
        Flow.user_id == current_user.id
    ).first()

    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")

    db.delete(flow)
    db.commit()

    return {"message": "Flow deleted successfully"}
