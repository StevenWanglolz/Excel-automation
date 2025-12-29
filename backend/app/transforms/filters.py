from app.transforms.base import BaseTransform
from app.transforms.registry import register_transform
from typing import Dict, Any
import pandas as pd


@register_transform("filter_rows")
class FilterRowsTransform(BaseTransform):
    """Filter rows based on column value and operator"""
    
    def validate(self, df: pd.DataFrame, config: Dict[str, Any]) -> bool:
        # Validate that required config keys exist
        # Without these, execute() would fail with KeyError or produce incorrect results
        if "column" not in config:
            return False
        # Check that column exists in DataFrame - prevents KeyError during execution
        if config["column"] not in df.columns:
            return False
        if "operator" not in config:
            return False
        return True
    
    def execute(self, df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        column = config["column"]
        operator = config.get("operator", "equals")
        value = config.get("value")
        
        # Apply filter based on operator type
        # Each operator handles different data types and edge cases
        if operator == "equals":
            return df[df[column] == value]
        elif operator == "not_equals":
            return df[df[column] != value]
        elif operator == "contains":
            # Convert to string for text search - handles numeric columns with text search
            # na=False excludes NaN values from results (they would cause errors)
            return df[df[column].astype(str).str.contains(str(value), na=False)]
        elif operator == "not_contains":
            # Use ~ to negate the contains condition
            return df[~df[column].astype(str).str.contains(str(value), na=False)]
        elif operator == "greater_than":
            return df[df[column] > value]
        elif operator == "less_than":
            return df[df[column] < value]
        elif operator == "is_blank":
            # Check both NaN and empty string - covers all "blank" cases
            return df[df[column].isna() | (df[column] == "")]
        elif operator == "is_not_blank":
            # Check that value is not NaN AND not empty string
            return df[df[column].notna() & (df[column] != "")]
        else:
            # Unknown operator - return original DataFrame unchanged
            # This prevents errors from invalid operator names
            return df


@register_transform("delete_rows")
class DeleteRowsTransform(BaseTransform):
    """Delete rows based on conditions"""
    
    def validate(self, df: pd.DataFrame, config: Dict[str, Any]) -> bool:
        # Always valid - this transform doesn't require specific config
        # It has sensible defaults for all operations
        return True
    
    def execute(self, df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        condition = config.get("condition", "blank_rows")
        
        if condition == "blank_rows":
            # Delete rows where all columns are blank (NaN or empty)
            # how="all" means row must have ALL columns blank to be deleted
            return df.dropna(how="all")
        elif condition == "duplicates":
            # Remove duplicate rows based on specified columns
            # subset=None means check all columns for duplicates
            # keep="first" keeps first occurrence, "last" keeps last, False keeps none
            subset = config.get("columns", None)
            keep = config.get("keep", "first")
            return df.drop_duplicates(subset=subset, keep=keep)
        else:
            # Unknown condition - return original DataFrame unchanged
            return df

