from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class FileBatch(Base):
    """
    File batch groups uploaded files under a user-defined name.

    Batches make it easier to manage and reuse related uploads across flows.
    """
    __tablename__ = "file_batches"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship to access files in this batch via batch.files
    files = relationship("File", backref="batch")
