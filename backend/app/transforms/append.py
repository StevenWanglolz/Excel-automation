from app.transforms.base import BaseTransform
from app.transforms.registry import register_transform
from typing import Dict, Any
import pandas as pd


@register_transform("append_files")
class AppendFilesTransform(BaseTransform):
    """
    Append multiple files together.
    
    The actual appending logic is handled in the TransformService when it detects
    multiple source targets mapping to a single destination target (N:1).
    
    This transform acts as a pass-through (identity) operation, allowing the
    service to execute it on each chunk and then concatenate the results.
    """

    def validate(self, df: pd.DataFrame, config: Dict[str, Any]) -> bool:
        return True

    def execute(self, df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        return df
