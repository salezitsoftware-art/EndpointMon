"""LLM client helper: choose provider and return text output.

Similar to DocuForge's `api/llm.py` but simplified for EndpointWatch.
"""
import os
from typing import Optional

import requests

# Try importing Google GenAI client if available
try:
    from google import genai
except Exception:
    genai = None


def generate_text(prompt: str, provider: Optional[str] = None, model: Optional[str] = None, timeout: int = 30, api_key: Optional[str] = None) -> str:
    try:
        from ..core.config import get_settings
        settings = get_settings()
        provider = (provider or os.getenv("AI_PROVIDER") or getattr(settings, "ai_provider", "gemini")).lower()
        model = model or os.getenv("AI_MODEL") or getattr(settings, "ai_model", "gemini-2.5-flash")
        gemini_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or getattr(settings, "gemini_api_key", "")
        gemini_base = os.getenv("GEMINI_BASE_URL") or getattr(settings, "gemini_base_url", "https://generativelanguage.googleapis.com/v1beta")
        openai_key = api_key or os.getenv("OPENAI_API_KEY") or getattr(settings, "openai_api_key", "")
        openai_base = os.getenv("OPENAI_BASE_URL") or getattr(settings, "openai_base_url", "https://api.openai.com/v1")
    except Exception:
        provider = (provider or os.getenv("AI_PROVIDER", "gemini")).lower()
        model = model or os.getenv("AI_MODEL", "gemini-2.5-flash")
        gemini_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        gemini_base = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")
        openai_key = api_key or os.getenv("OPENAI_API_KEY")
        openai_base = os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1"

    if provider != "openai":
        if model in ("gpt-4o-mini", "gpt-4o", "gpt-4o-mini-preview", "chat-bison-001", "chat-bison", "gemini-1.5-flash"):
            model = "gemini-2.5-flash"

    if provider == "openai":
        if not openai_key:
            raise RuntimeError("OpenAI API key not configured")
        resp = requests.post(
            f"{openai_base.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": 0.2},
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()

    # Default to Gemini/Google
    if not gemini_key:
        raise RuntimeError("Gemini/Google API key not configured")

    if genai is not None:
        client = genai.Client(api_key=gemini_key)
        try:
            response = client.models.generate_content(model=model, contents=prompt)
            return (response.text or "").strip()
        except Exception:
            # fallthrough to HTTP path
            pass

    # Fallback to REST call using modern generateContent format
    base = gemini_base
    if "generativelanguage.googleapis.com" in base and "/v1" in base and not "/v1beta" in base:
        base = base.replace("/v1", "/v1beta")

    # If it is a modern gemini model, use generateContent, otherwise fallback to legacy generate
    if model.startswith("gemini-"):
        url = f"{base.rstrip('/')}/models/{model}:generateContent?key={gemini_key}"
        payload = {
            "contents": [{
                "parts": [{
                    "text": prompt
                }]
            }],
            "generationConfig": {
                "temperature": 0.2
            }
        }
    else:
        url = f"{base.rstrip('/')}/models/{model}:generate?key={gemini_key}"
        payload = {"prompt": {"text": prompt}, "temperature": 0.2}

    resp = requests.post(url, json=payload, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()

    text = None
    if isinstance(data, dict):
        try:
            # Modern generateContent schema: candidates -> content -> parts -> text
            candidates = data.get("candidates", [])
            if candidates:
                content = candidates[0].get("content", {})
                parts = content.get("parts", [])
                if parts:
                    text = parts[0].get("text")
        except Exception:
            text = None

        if not text:
            # Legacy candidate schema: candidates -> content -> text
            try:
                text = data.get("candidates", [])[0].get("content", [])[0].get("text")
            except Exception:
                text = None

        if not text:
            text = data.get("output", {}).get("text") or data.get("message", {}).get("content", {}).get("text")

    if not text:
        raise RuntimeError("No text returned from Gemini REST API")
    return text.strip()

