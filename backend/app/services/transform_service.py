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
        # Parse the file into a DataFrame - starting point for all transformations
        df = file_service.parse_file(file_path)
        
        # Execute each transformation step in sequence
        # Flow data structure: nodes array where each node represents a transformation block
        nodes = flow_data.get("nodes", [])
        
        # Process nodes in order - transformations are applied sequentially
        # Each transformation modifies the DataFrame, which becomes input for the next step
        for node in nodes:
            block_type = node.get("data", {}).get("blockType")
            config = node.get("data", {}).get("config", {})
            
            # Skip upload nodes - they're just data sources, not transformations
            # Upload nodes are handled when parsing the file initially
            if block_type == "upload":
                continue
            
            # Look up transform class from registry using block type
            # Registry pattern allows dynamic transform loading without hardcoding
            transform_class = get_transform(block_type)
            if not transform_class:
                # Fallback: try using node type directly (for compatibility with different data structures)
                node_type = node.get("type")
                transform_class = get_transform(node_type)
            
            if transform_class:
                transform = transform_class()
                # Validate config before executing - prevents errors from invalid configurations
                # If validation fails, skip this transform (don't break entire flow)
                if transform.validate(df, config):
                    # Execute transform - modifies DataFrame in place or returns new one
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

