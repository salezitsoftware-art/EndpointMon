from __future__ import annotations

import json
import math
import os
from threading import Lock
from typing import Any, Dict, List, Tuple


def _cosine(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


class InMemoryVectorStore:
    def __init__(self, path: str | None = None):
        self._lock = Lock()
        self.path = path or os.path.join(os.getcwd(), ".vector_store.json")
        self._data: Dict[str, Dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        try:
            if os.path.exists(self.path):
                with open(self.path, "r", encoding="utf-8") as fh:
                    self._data = json.load(fh)
        except Exception:
            self._data = {}

    def _save(self) -> None:
        try:
            with open(self.path, "w", encoding="utf-8") as fh:
                json.dump(self._data, fh)
        except Exception:
            pass

    def upsert(self, key: str, vector: List[float], text: str, metadata: Dict[str, Any] | None = None) -> None:
        with self._lock:
            self._data[str(key)] = {"vector": vector, "text": text, "metadata": metadata or {}}
            self._save()

    def query(self, vector: List[float], top_k: int = 5) -> List[Tuple[str, float, Dict[str, Any]]]:
        with self._lock:
            results: List[Tuple[str, float, Dict[str, Any]]] = []
            for k, v in self._data.items():
                score = _cosine(vector, v.get("vector", []))
                results.append((k, float(score), v))
            results.sort(key=lambda x: x[1], reverse=True)
            return results[:top_k]


_DEFAULT_STORE: InMemoryVectorStore | None = None


def get_default_store() -> InMemoryVectorStore:
    global _DEFAULT_STORE
    if _DEFAULT_STORE is None:
        _DEFAULT_STORE = InMemoryVectorStore()
    return _DEFAULT_STORE
