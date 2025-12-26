from typing import Set, List, Dict, Any
from sqlalchemy.orm import Session
from app.models.flow import Flow
from app.models.file import File


class FileReferenceService:
    """Service for managing file references in flows"""

    @staticmethod
    def extract_file_ids_from_flow_data(flow_data: Dict[str, Any]) -> Set[int]:
        """
        Extract all file IDs from flow_data structure.
        Flow data structure:
        {
            "nodes": [
                {
                    "id": "...",
                    "data": {
                        "fileIds": [1, 2, 3]
                    }
                }
            ],
            "edges": [...]
        }
        """
        file_ids = set()
        
        if not isinstance(flow_data, dict):
            return file_ids
        
        nodes = flow_data.get("nodes", [])
        if not isinstance(nodes, list):
            return file_ids
        
        for node in nodes:
            if not isinstance(node, dict):
                continue
            
            data = node.get("data", {})
            if not isinstance(data, dict):
                continue
            
            file_ids_list = data.get("fileIds", [])
            if isinstance(file_ids_list, list):
                for file_id in file_ids_list:
                    if isinstance(file_id, int):
                        file_ids.add(file_id)
        
        return file_ids

    @staticmethod
    def get_file_references(file_id: int, user_id: int, db: Session) -> List[int]:
        """
        Get list of flow IDs that reference a given file.
        Returns empty list if file is not referenced by any flow.
        """
        referencing_flows = []
        
        flows = db.query(Flow).filter(Flow.user_id == user_id).all()
        
        for flow in flows:
            if not flow.flow_data:
                continue
            
            file_ids = FileReferenceService.extract_file_ids_from_flow_data(flow.flow_data)
            if file_id in file_ids:
                referencing_flows.append(flow.id)
        
        return referencing_flows

    @staticmethod
    def is_file_referenced(file_id: int, user_id: int, db: Session, exclude_flow_id: int = None) -> bool:
        """
        Check if a file is referenced by any flow.
        Optionally exclude a specific flow ID (useful when checking before deleting a flow).
        """
        flows = db.query(Flow).filter(Flow.user_id == user_id).all()
        
        for flow in flows:
            if exclude_flow_id and flow.id == exclude_flow_id:
                continue
            
            if not flow.flow_data:
                continue
            
            file_ids = FileReferenceService.extract_file_ids_from_flow_data(flow.flow_data)
            if file_id in file_ids:
                return True
        
        return False

    @staticmethod
    def get_orphaned_files(user_id: int, db: Session) -> List[File]:
        """
        Find all files that are not referenced by any flow.
        These are orphaned files that can be safely deleted.
        """
        # Get all files for the user
        all_files = db.query(File).filter(File.user_id == user_id).all()
        
        # Get all flows for the user
        flows = db.query(Flow).filter(Flow.user_id == user_id).all()
        
        # Build set of all referenced file IDs
        referenced_file_ids = set()
        for flow in flows:
            if flow.flow_data:
                file_ids = FileReferenceService.extract_file_ids_from_flow_data(flow.flow_data)
                referenced_file_ids.update(file_ids)
        
        # Find files that are not referenced
        orphaned_files = [
            file for file in all_files
            if file.id not in referenced_file_ids
        ]
        
        return orphaned_files

    @staticmethod
    def get_files_for_flow(flow: Flow) -> Set[int]:
        """
        Get all file IDs referenced by a specific flow.
        """
        if not flow.flow_data:
            return set()
        
        return FileReferenceService.extract_file_ids_from_flow_data(flow.flow_data)


file_reference_service = FileReferenceService()

