from typing import Dict, Type
from app.transforms.base import BaseTransform

_transform_registry: Dict[str, Type[BaseTransform]] = {}


def register_transform(transform_id: str):
    """Decorator to register a transform class"""
    def decorator(cls: Type[BaseTransform]):
        _transform_registry[transform_id] = cls
        return cls
    return decorator


def get_transform(transform_id: str) -> Type[BaseTransform] | None:
    """Get a transform class by ID"""
    return _transform_registry.get(transform_id)


def list_transforms() -> list[str]:
    """List all registered transform IDs"""
    return list(_transform_registry.keys())

