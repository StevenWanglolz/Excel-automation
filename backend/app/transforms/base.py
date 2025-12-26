from abc import ABC, abstractmethod
from typing import Dict, Any
import pandas as pd


class BaseTransform(ABC):
    """Base class for all transformation operations"""
    
    @abstractmethod
    def validate(self, df: pd.DataFrame, config: Dict[str, Any]) -> bool:
        """Validate the configuration before execution"""
        pass
    
    @abstractmethod
    def execute(self, df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        """Execute the transformation"""
        pass
    
    def preview(self, df: pd.DataFrame, config: Dict[str, Any], rows: int = 20) -> pd.DataFrame:
        """Generate a preview of the transformation without modifying the original"""
        result = self.execute(df.copy(), config)
        return result.head(rows)

