from app.transforms.base import BaseTransform
from app.transforms.registry import register_transform
from typing import Dict, Any
import pandas as pd


@register_transform("join_lookup")
class JoinLookupTransform(BaseTransform):
    """Join/lookup with another DataFrame"""
    
    def validate(self, df: pd.DataFrame, config: Dict[str, Any]) -> bool:
        if "lookup_df" not in config:
            return False
        if "on" not in config:
            return False
        on = config["on"]
        if on not in df.columns:
            return False
        lookup_df = config["lookup_df"]
        if not isinstance(lookup_df, pd.DataFrame):
            return False
        if on not in lookup_df.columns:
            return False
        return True
    
    def execute(self, df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        lookup_df = config["lookup_df"]
        on = config["on"]
        how = config.get("how", "left")
        columns = config.get("columns", None)  # Which columns to include from lookup
        
        result = df.merge(
            lookup_df,
            on=on,
            how=how,
            suffixes=("", "_lookup")
        )
        
        if columns:
            # Only include specified columns from lookup
            cols_to_keep = list(df.columns) + [col for col in columns if col in lookup_df.columns]
            result = result[cols_to_keep]
        
        return result

