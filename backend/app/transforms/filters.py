from app.transforms.base import BaseTransform
from app.transforms.registry import register_transform
from typing import Dict, Any
import pandas as pd


@register_transform("filter_rows")
class FilterRowsTransform(BaseTransform):
    """Filter rows based on column value and operator"""
    
    def validate(self, df: pd.DataFrame, config: Dict[str, Any]) -> bool:
        if "column" not in config:
            return False
        if config["column"] not in df.columns:
            return False
        if "operator" not in config:
            return False
        return True
    
    def execute(self, df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        column = config["column"]
        operator = config.get("operator", "equals")
        value = config.get("value")
        
        if operator == "equals":
            return df[df[column] == value]
        elif operator == "not_equals":
            return df[df[column] != value]
        elif operator == "contains":
            return df[df[column].astype(str).str.contains(str(value), na=False)]
        elif operator == "not_contains":
            return df[~df[column].astype(str).str.contains(str(value), na=False)]
        elif operator == "greater_than":
            return df[df[column] > value]
        elif operator == "less_than":
            return df[df[column] < value]
        elif operator == "is_blank":
            return df[df[column].isna() | (df[column] == "")]
        elif operator == "is_not_blank":
            return df[df[column].notna() & (df[column] != "")]
        else:
            return df


@register_transform("delete_rows")
class DeleteRowsTransform(BaseTransform):
    """Delete rows based on conditions"""
    
    def validate(self, df: pd.DataFrame, config: Dict[str, Any]) -> bool:
        return True  # Always valid
    
    def execute(self, df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        condition = config.get("condition", "blank_rows")
        
        if condition == "blank_rows":
            # Delete rows where all columns are blank
            return df.dropna(how="all")
        elif condition == "duplicates":
            subset = config.get("columns", None)
            keep = config.get("keep", "first")
            return df.drop_duplicates(subset=subset, keep=keep)
        else:
            return df

