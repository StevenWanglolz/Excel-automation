from abc import ABC, abstractmethod
from typing import Dict, Any
import pandas as pd


class BaseTransform(ABC):
    """
    Base class for all transformation operations.
    
    All transforms must implement validate() and execute() methods.
    The preview() method is provided by default but can be overridden for custom preview behavior.
    """
    
    @abstractmethod
    def validate(self, df: pd.DataFrame, config: Dict[str, Any]) -> bool:
        """
        Validate the configuration before execution.
        
        This prevents errors during execution by catching invalid configs early.
        Should check that required config keys exist and values are valid for the DataFrame.
        """
        pass
    
    @abstractmethod
    def execute(self, df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        """
        Execute the transformation on the DataFrame.
        
        Should return a new DataFrame (don't modify the original).
        The returned DataFrame becomes input for the next transform in the flow.
        """
        pass
    
    def preview(self, df: pd.DataFrame, config: Dict[str, Any], rows: int = 20) -> pd.DataFrame:
        """
        Generate a preview of the transformation without modifying the original.
        
        Default implementation executes on a copy and returns first N rows.
        Override this if you need custom preview behavior (e.g., sampling instead of head).
        """
        # Use copy() to avoid modifying original DataFrame - previews should be non-destructive
        result = self.execute(df.copy(), config)
        return result.head(rows)

