"""
- Responsible for:
- - Defining row filtering and deletion logic for DataFrames
-
- Key assumptions:
- - Input values from frontend are often strings and require type coercion
-
- Be careful:
- - Mismatched types between filter value and column data will result in empty selections
"""
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

        # Type coercion: Convert value to match column dtype if needed
        # This handles cases where frontend sends "30" (str) for an integer column
        if column in df.columns and value is not None:
            col_dtype = df[column].dtype
            try:
                if pd.api.types.is_integer_dtype(col_dtype):
                    value = int(value)
                elif pd.api.types.is_float_dtype(col_dtype):
                    value = float(value)
                elif pd.api.types.is_bool_dtype(col_dtype):
                    if isinstance(value, str):
                        value = value.lower() == "true"
            except (ValueError, TypeError):
                # If conversion fails, keep original value (best effort)
                pass

        # Apply filter based on operator type
        # Each operator handles different data types and edge cases
        if operator == "equals":
            # For strings, we do case-insensitive and whitespace-insensitive comparison
            if pd.api.types.is_string_dtype(df[column]):
                # Normalize whitespace: replace any sequence of whitespace (including NBSP) with single space
                col_normalized = df[column].astype(str).str.replace(
                    r'\s+', ' ', regex=True).str.strip().str.lower()
                val_normalized = str(value).strip().replace(
                    r'\s+', ' ')  # simpler for value
                # Use regex check for value too if needed, but simple strip/replace usually enough for single string
                import re
                val_normalized = re.sub(
                    r'\s+', ' ', str(value)).strip().lower()
                return df[col_normalized == val_normalized]
            return df[df[column] == value]
        elif operator == "not_equals":
            if pd.api.types.is_string_dtype(df[column]):
                import re
                col_normalized = df[column].astype(str).str.replace(
                    r'\s+', ' ', regex=True).str.strip().str.lower()
                val_normalized = re.sub(
                    r'\s+', ' ', str(value)).strip().lower()
                return df[col_normalized != val_normalized]
            return df[df[column] != value]
        elif operator == "contains":
            # Convert to string for text search - handles numeric columns with text search
            # na=False excludes NaN values from results (they would cause errors)
            # case=False makes it case-insensitive
            val_str = str(value).strip()
            return df[df[column].astype(str).str.contains(val_str, case=False, na=False)]
        elif operator == "not_contains":
            # Use ~ to negate the contains condition
            val_str = str(value).strip()
            return df[~df[column].astype(str).str.contains(val_str, case=False, na=False)]
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
