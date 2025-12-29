from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, BigInteger
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class File(Base):
    """
    File model representing uploaded Excel/CSV files.
    
    Stores metadata about files and links them to users.
    Actual file content is stored on disk, not in database.
    """
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    # Foreign key to user - ensures files are user-specific
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # filename is the generated unique filename on disk
    filename = Column(String, nullable=False)
    # original_filename is what the user uploaded (for display purposes)
    original_filename = Column(String, nullable=False)
    # Full path to file on disk - used to read file content
    file_path = Column(String, nullable=False)
    # File size in bytes - BigInteger handles large files (>2GB)
    file_size = Column(BigInteger, nullable=False)
    # MIME type for proper HTTP headers when serving files
    mime_type = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship allows accessing user from file: file.user
    # backref creates reverse relationship: user.files (list of user's files)
    user = relationship("User", backref="files")

