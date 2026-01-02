from __future__ import annotations

import hashlib
import json
import time
from collections import OrderedDict
from typing import Any, Dict, Tuple


class PreviewCache:
    """In-memory LRU cache for preview payloads.

    This avoids re-running full transforms when the same flow+target is previewed
    repeatedly (e.g., switching sheets). Cache is per-process and time-bounded.
    """

    def __init__(self, max_entries: int = 128, ttl_seconds: int = 120) -> None:
        self._max_entries = max_entries
        self._ttl_seconds = ttl_seconds
        self._entries: "OrderedDict[str, Tuple[float, Dict[str, Any]]]" = OrderedDict()

    def _purge_expired(self) -> None:
        now = time.time()
        keys_to_delete = [key for key, (ts, _) in self._entries.items() if now - ts > self._ttl_seconds]
        for key in keys_to_delete:
            self._entries.pop(key, None)

    def get(self, key: str) -> Dict[str, Any] | None:
        self._purge_expired()
        if key not in self._entries:
            return None
        ts, value = self._entries.pop(key)
        self._entries[key] = (ts, value)
        return value

    def set(self, key: str, value: Dict[str, Any]) -> None:
        self._purge_expired()
        if key in self._entries:
            self._entries.pop(key, None)
        self._entries[key] = (time.time(), value)
        while len(self._entries) > self._max_entries:
            self._entries.popitem(last=False)


def stable_hash(payload: Dict[str, Any]) -> str:
    """Create a stable hash for a JSON-serializable dict."""
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


preview_cache = PreviewCache()
