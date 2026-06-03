from __future__ import annotations

import hashlib
import json
import requests
from typing import List

from ..core.config import get_settings


def _fallback_embedding(text: str, dim: int = 64) -> List[float]:
    # Deterministic lightweight embedding: hash chunks to floats in [-1,1]
    if not text:
        return [0.0] * dim
    h = hashlib.sha256(text.encode("utf-8")).digest()
    out = []
    for i in range(dim):
        b = h[i % len(h)]
        out.append(((b / 255.0) * 2.0) - 1.0)
    return out


def get_embedding(text: str, model: str | None = None) -> List[float]:
    settings = get_settings()
    api_key = getattr(settings, "openai_api_key", "") or ""
    base = getattr(settings, "openai_base_url", "https://api.openai.com/v1") or "https://api.openai.com/v1"
    model = model or "text-embedding-3-small"

    if api_key:
        try:
            url = f"{base.rstrip('/')}/embeddings"
            resp = requests.post(
                url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": model, "input": text},
                timeout=15,
            )
            resp.raise_for_status()
            j = resp.json()
            # supports single input
            data = j.get("data")
            if isinstance(data, list) and data:
                return list(data[0].get("embedding", []))
        except Exception:
            # Fall through to fallback embedding
            pass

    return _fallback_embedding(text, dim=64)
