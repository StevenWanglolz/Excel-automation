from app.transforms.base import BaseTransform
from app.transforms.registry import register_transform
from typing import Dict, Any
import pandas as pd


@register_transform("sort_rows")
class SortRowsTransform(BaseTransform):
    """Sort rows by one or more columns"""
    
    def validate(self, df: pd.DataFrame, config: Dict[str, Any]) -> bool:
        if "columns" not in config:
            return False
        columns = config["columns"]
        if not isinstance(columns, list) or len(columns) == 0:
            return False
        for col in columns:
            if col not in df.columns:
                return False
        return True
    
    def execute(self, df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        columns = config["columns"]
        ascending = config.get("ascending", True)
        if isinstance(ascending, bool):
            ascending = [ascending] * len(columns)
        return df.sort_values(by=columns, ascending=ascending)

