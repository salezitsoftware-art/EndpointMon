from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx
import logging
import traceback

from ..core.config import get_settings


def _latest_metric(metrics: dict[str, Any] | None, key: str) -> float:
    if not metrics:
        return 0.0
    try:
        return float(metrics.get(key) or 0)
    except Exception:
        return 0.0


def _severity_from_metrics(cpu: float, ram: float, disk: float, latency: float, last_seen_minutes: float, alerts: int) -> tuple[str, int]:
    score = 100
    score -= min(int(cpu * 0.25), 25)
    score -= min(int(ram * 0.25), 25)
    score -= min(int(disk * 0.25), 25)
    score -= min(int(latency / 10), 15)
    score -= min(alerts * 5, 20)
    score -= 20 if last_seen_minutes > 60 else 10 if last_seen_minutes > 15 else 0
    score = max(0, score)

    if cpu > 95 or ram > 95 or disk > 95 or latency > 250 or last_seen_minutes > 60:
        severity = "critical"
    elif cpu > 80 or ram > 85 or disk > 85 or latency > 150 or alerts >= 3:
        severity = "warning"
    else:
        severity = "normal"

    return severity, score


def _build_local_analysis(hostname: str, latest_metrics: dict[str, Any] | None, inventory: dict[str, Any] | None, alerts: list[str], last_seen_minutes: float) -> dict[str, Any]:
    cpu = _latest_metric(latest_metrics, "cpu")
    ram = _latest_metric(latest_metrics, "ram")
    disk = _latest_metric(latest_metrics, "disk")
    latency = _latest_metric(latest_metrics, "latency_ms")
    severity, confidence = _severity_from_metrics(cpu, ram, disk, latency, last_seen_minutes, len(alerts))

    signals = []
    recommendations = []

    if cpu >= 80:
        signals.append(f"CPU is elevated at {cpu:.0f}%")
        recommendations.append("Check for runaway processes or scheduled jobs.")
    if ram >= 80:
        signals.append(f"RAM usage is elevated at {ram:.0f}%")
        recommendations.append("Inspect memory pressure and paging activity.")
    if disk >= 85:
        signals.append(f"Disk usage is high at {disk:.0f}%")
        recommendations.append("Free space or expand the primary volume.")
    if latency >= 150:
        signals.append(f"Latency is high at {latency:.0f} ms")
        recommendations.append("Check disk, network, or RDP contention.")
    if last_seen_minutes > 60:
        signals.append(f"Last telemetry is stale by about {last_seen_minutes:.0f} minutes")
        recommendations.append("Verify the agent is still running on the endpoint.")
    if alerts:
        signals.append(f"There are {len(alerts)} unresolved alerts")
        recommendations.append("Review the recent alert history for repeat failures.")

    if not signals:
        signals.append("No strong anomaly detected in the current sample window")
        recommendations.append("Continue monitoring; no immediate intervention is required.")

    if severity == "critical":
        summary = f"{hostname} shows a critical performance issue requiring immediate attention."
    elif severity == "warning":
        summary = f"{hostname} has a developing performance problem that should be reviewed soon."
    else:
        summary = f"{hostname} looks stable based on the latest telemetry sample."

    if inventory:
        disk_type = inventory.get("disk_type") or inventory.get("primary_disk") or "unknown disk"
        gpu_type = inventory.get("gpu_type") or inventory.get("gpu_name") or "unknown GPU"
        signals.append(f"Hardware context: {disk_type}, {gpu_type}")

    return {
        "provider": "rules",
        "model": None,
        "summary": summary,
        "severity": severity,
        "confidence": confidence,
        "signals": signals,
        "recommendations": recommendations,
        "ai_enabled": False,
    }


async def analyze_machine(
    *,
    hostname: str,
    latest_metrics: dict[str, Any] | None,
    inventory: dict[str, Any] | None,
    alerts: list[str],
    last_seen_minutes: float,
) -> dict[str, Any]:
    settings = get_settings()
    provider = (getattr(settings, "ai_provider", "auto") or "auto").lower()
    model = getattr(settings, "ai_model", "gpt-4o-mini")
    api_key = getattr(settings, "openai_api_key", "") or ""
    base_url = getattr(settings, "openai_base_url", "https://api.openai.com/v1")
    gemini_key = getattr(settings, "gemini_api_key", "") or ""
    gemini_base = getattr(settings, "gemini_base_url", "") or ""

    # OpenAI-compatible providers (including proxies)
    if provider in {"auto", "openai", "openai-compatible"} and api_key:
        try:
            prompt_payload = {
                "hostname": hostname,
                "latest_metrics": latest_metrics or {},
                "inventory": inventory or {},
                "alerts": alerts,
                "last_seen_minutes": last_seen_minutes,
            }
            system_prompt = (
                "You are an endpoint telemetry analyst. "
                "Summarize the likely issue, severity, confidence, key signals, and next actions. "
                "Return concise JSON with keys summary, severity, confidence, signals, recommendations. "
                "Severity must be one of critical, warning, normal. Confidence is 0-100."
            )

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{base_url.rstrip('/')}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": model,
                        "temperature": 0.2,
                        "response_format": {"type": "json_object"},
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": f"Analyze this endpoint:\n{prompt_payload}"},
                        ],
                    },
                )
                response.raise_for_status()
                content = response.json()["choices"][0]["message"]["content"]

            import json

            parsed = json.loads(content)
            signals = parsed.get("signals") if isinstance(parsed.get("signals"), list) else []
            recommendations = parsed.get("recommendations") if isinstance(parsed.get("recommendations"), list) else []
            confidence = int(parsed.get("confidence") or 0)
            return {
                "provider": "openai-compatible",
                "model": model,
                "summary": str(parsed.get("summary") or f"{hostname} was analyzed by the AI service."),
                "severity": str(parsed.get("severity") or "warning"),
                "confidence": max(0, min(100, confidence)),
                "signals": [str(item) for item in signals] or ["AI analysis returned no explicit signals."],
                "recommendations": [str(item) for item in recommendations] or ["Review the telemetry window manually."],
                "ai_enabled": True,
            }
        except Exception as e:
            logging.getLogger(__name__).exception("OpenAI-compatible analysis failed: %s", e)
            return _build_local_analysis(hostname, latest_metrics, inventory, alerts, last_seen_minutes)

    # Gemini / Google generative APIs (uses provided base URL)
    if provider in {"auto", "gemini", "google", "google-gemini"} and gemini_key and gemini_base:
        try:
            prompt_payload = {
                "hostname": hostname,
                "latest_metrics": latest_metrics or {},
                "inventory": inventory or {},
                "alerts": alerts,
                "last_seen_minutes": last_seen_minutes,
            }
            system_prompt = (
                "You are an endpoint telemetry analyst. "
                "Summarize the likely issue, severity, confidence, key signals, and next actions. "
                "Return concise JSON with keys summary, severity, confidence, signals, recommendations. "
                "Severity must be one of critical, warning, normal. Confidence is 0-100."
            )
            # Use Google Generative Language REST API (API key via query param)
            # Use modern gemini-2.5-flash for content generation
            if model in ("gpt-4o-mini", "gpt-4o", "gpt-4o-mini-preview", "chat-bison-001", "gemini-1.5-flash"):
                model = "gemini-2.5-flash"

            if "generativelanguage.googleapis.com" in gemini_base and "/v1" in gemini_base and not "/v1beta" in gemini_base:
                gemini_base = gemini_base.replace("/v1", "/v1beta")

            url = f"{gemini_base.rstrip('/')}/models/{model}:generateContent?key={gemini_key}"
            import json
            payload = {
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {"text": f"System Instructions: {system_prompt}\n\nAnalyze this endpoint:\n{json.dumps(prompt_payload)}"}
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.2
                }
            }

            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json=payload)
                try:
                    body_text = (await resp.aread()).decode('utf-8', errors='replace') if hasattr(resp, 'aread') else resp.text
                except Exception:
                    body_text = resp.text if hasattr(resp, 'text') else ''
                logging.getLogger(__name__).warning("Gemini HTTP %s response: %.800s", resp.status_code, body_text)
                resp.raise_for_status()
                j = resp.json()

            # Robustly extract text from generateContent response
            content = None
            if isinstance(j, dict):
                try:
                    candidates = j.get("candidates", [])
                    if candidates:
                        content = candidates[0].get("content", {}).get("parts", [])[0].get("text")
                except Exception:
                    content = None

                if not content:
                    try:
                        content = j.get("candidates", [])[0].get("content", [])[0].get("text")
                    except Exception:
                        content = None
                if not content:
                    content = j.get("output", {}).get("text") or j.get("message", {}).get("content", {}).get("text")

            if not content:
                raise ValueError("No usable content from Gemini response")


            # Content may be JSON text or plain text. Try to parse JSON, otherwise search for JSON substring.
            import json
            parsed = None
            if isinstance(content, str):
                s = content.strip()
                if s.startswith("{"):
                    parsed = json.loads(s)
                else:
                    # try to find a JSON object inside the text
                    import re

                    m = re.search(r"\{[\s\S]*\}", s)
                    if m:
                        parsed = json.loads(m.group(0))
            if parsed is None:
                # fallback to local analysis
                return _build_local_analysis(hostname, latest_metrics, inventory, alerts, last_seen_minutes)

            signals = parsed.get("signals") if isinstance(parsed.get("signals"), list) else []
            recommendations = parsed.get("recommendations") if isinstance(parsed.get("recommendations"), list) else []
            confidence = int(parsed.get("confidence") or 0)
            return {
                "provider": "gemini",
                "model": model,
                "summary": str(parsed.get("summary") or f"{hostname} was analyzed by the AI service."),
                "severity": str(parsed.get("severity") or "warning"),
                "confidence": max(0, min(100, confidence)),
                "signals": [str(item) for item in signals] or ["AI analysis returned no explicit signals."],
                "recommendations": [str(item) for item in recommendations] or ["Review the telemetry window manually."],
                "ai_enabled": True,
            }
        except Exception as e:
            logging.getLogger(__name__).exception("Gemini analysis failed: %s\n%s", e, traceback.format_exc())
            return _build_local_analysis(hostname, latest_metrics, inventory, alerts, last_seen_minutes)

    return _build_local_analysis(hostname, latest_metrics, inventory, alerts, last_seen_minutes)



def minutes_since_last_seen(last_seen: datetime | None) -> float:
    if not last_seen:
        return float("inf")
    now = datetime.now(timezone.utc)
    last_seen_utc = last_seen if last_seen.tzinfo else last_seen.replace(tzinfo=timezone.utc)
    return max(0.0, (now - last_seen_utc).total_seconds() / 60.0)