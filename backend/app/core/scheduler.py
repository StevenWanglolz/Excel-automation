"""
Background scheduler for periodic tasks.

This module manages background jobs that run on a schedule:
- Cleanup orphaned files: Runs every 6 hours
"""

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.services.file_reference_service import file_reference_service
from app.storage.local_storage import storage
import logging

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def cleanup_orphaned_files_job():
    """
    Background job to clean up orphaned files.
    
    Orphaned files are those not referenced by any flow.
    This runs periodically (every 6 hours by default).
    """
    db = SessionLocal()
    try:
        # Get all users by querying for unique user_ids from files
        # We need to check all users, so we get all orphaned files
        from app.models.file import File
        
        all_files = db.query(File).all()
        if not all_files:
            logger.info("No files to check for cleanup")
            return
        
        # Group files by user
        users = {}
        for file in all_files:
            if file.user_id not in users:
                users[file.user_id] = []
            users[file.user_id].append(file)
        
        total_deleted = 0
        
        # Check each user's files for orphaned ones
        for user_id, user_files in users.items():
            orphaned_files = file_reference_service.get_orphaned_files(user_id, db)
            
            if orphaned_files:
                logger.info(f"Found {len(orphaned_files)} orphaned files for user {user_id}")
                
                # Delete each orphaned file
                for file in orphaned_files:
                    try:
                        storage.delete_file(user_id, file.filename)
                        db.delete(file)
                        total_deleted += 1
                        logger.info(f"Deleted orphaned file: {file.original_filename} (ID: {file.id})")
                    except Exception as e:
                        logger.error(f"Error deleting orphaned file {file.id}: {str(e)}")
                
                db.commit()
        
        if total_deleted > 0:
            logger.info(f"Cleanup job completed: Deleted {total_deleted} orphaned files")
        else:
            logger.info("Cleanup job completed: No orphaned files found")
            
    except Exception as e:
        logger.error(f"Error in cleanup_orphaned_files_job: {str(e)}")
        db.rollback()
    finally:
        db.close()


def start_scheduler():
    """
    Start the background scheduler.
    
    This should be called when the FastAPI app starts.
    Schedules cleanup_orphaned_files_job to run every 6 hours.
    """
    if not scheduler.running:
        # Schedule cleanup job to run every 6 hours
        scheduler.add_job(
            cleanup_orphaned_files_job,
            trigger=IntervalTrigger(hours=6),
            id="cleanup_orphaned_files",
            name="Cleanup orphaned files",
            replace_existing=True
        )
        
        scheduler.start()
        logger.info("Background scheduler started. Cleanup job scheduled to run every 6 hours.")


def stop_scheduler():
    """
    Stop the background scheduler.
    
    This should be called when the FastAPI app shuts down.
    """
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Background scheduler stopped.")

