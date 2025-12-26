from app.transforms.base import BaseTransform
from app.transforms.registry import register_transform
from typing import Dict, Any
import pandas as pd


@register_transform("rename_columns")
class RenameColumnsTransform(BaseTransform):
    """Rename columns"""
    
    def validate(self, df: pd.DataFrame, config: Dict[str, Any]) -> bool:
        if "mapping" not in config:
            return False
        mapping = config["mapping"]
        if not isinstance(mapping, dict):
            return False
        # Check that all old column names exist
        for old_name in mapping.keys():
            if old_name not in df.columns:
                return False
        return True
    
    def execute(self, df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        mapping = config["mapping"]
        return df.rename(columns=mapping)


@register_transform("rearrange_columns")
class RearrangeColumnsTransform(BaseTransform):
    """Rearrange column order"""
    
    def validate(self, df: pd.DataFrame, config: Dict[str, Any]) -> bool:
        if "column_order" not in config:
            return False
        column_order = config["column_order"]
        if not isinstance(column_order, list):
            return False
        # Check that all columns exist
        for col in column_order:
            if col not in df.columns:
                return False
        return True
    
    def execute(self, df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        column_order = config["column_order"]
        # Include any columns not in the order list at the end
        other_cols = [col for col in df.columns if col not in column_order]
        final_order = column_order + other_cols
        return df[final_order]


@register_transform("remove_duplicates")
class RemoveDuplicatesTransform(BaseTransform):
    """Remove duplicate rows"""
    
    def validate(self, df: pd.DataFrame, config: Dict[str, Any]) -> bool:
        if "columns" in config:
            columns = config["columns"]
            if not isinstance(columns, list):
                return False
            for col in columns:
                if col not in df.columns:
                    return False
        return True
    
    def execute(self, df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        columns = config.get("columns", None)
        keep = config.get("keep", "first")
        return df.drop_duplicates(subset=columns, keep=keep)

