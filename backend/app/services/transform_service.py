from typing import Dict, Any, List
import pandas as pd
from app.transforms.registry import get_transform
from app.services.file_service import file_service


class TransformService:
    @staticmethod
    def execute_flow(
        file_path: str,
        flow_data: Dict[str, Any]
    ) -> pd.DataFrame:
        """Execute a flow on a file"""
        # Parse the file
        df = file_service.parse_file(file_path)
        
        # Execute each step in the flow
        nodes = flow_data.get("nodes", [])
        
        # Sort nodes by position or execution order if available
        # For now, execute in order
        for node in nodes:
            block_type = node.get("data", {}).get("blockType")
            config = node.get("data", {}).get("config", {})
            
            if block_type == "upload":
                continue  # Skip upload node
            
            transform_class = get_transform(block_type)
            if not transform_class:
                # Try to get by type
                node_type = node.get("type")
                transform_class = get_transform(node_type)
            
            if transform_class:
                transform = transform_class()
                if transform.validate(df, config):
                    df = transform.execute(df, config)
        
        return df
    
    @staticmethod
    def preview_step(
        file_path: str,
        step_config: Dict[str, Any],
        step_index: int = 0
    ) -> Dict[str, Any]:
        """Preview a single transformation step"""
        df = file_service.parse_file(file_path)
        
        block_type = step_config.get("blockType")
        config = step_config.get("config", {})
        
        transform_class = get_transform(block_type)
        if transform_class:
            transform = transform_class()
            if transform.validate(df, config):
                preview_df = transform.preview(df, config)
                return file_service.get_file_preview(preview_df)
        
        return file_service.get_file_preview(df)


transform_service = TransformService()

