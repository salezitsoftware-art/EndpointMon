from datetime import datetime, timezone
import logging
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.security import verify_api_key
from ..db.session import get_db
from ..models import Machine, Telemetry, Alert
from ..services.llm_client import generate_text

router = APIRouter(prefix="/ai", tags=["AI"])

class ChatReq(BaseModel):
    message: str

class ChatResp(BaseModel):
    reply: str

class CleanReq(BaseModel):
    text: str
    tone: str | None = "formal business"
    grammar_only: bool | None = False

class CleanResp(BaseModel):
    cleaned_text: str


@router.post("/chat", response_model=ChatResp)
async def chat(req: ChatReq, x_gemini_api_key: str | None = Header(None)):
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="No message provided")
    try:
        prompt = f"You are an assistant. Answer concisely.\n\n{req.message}"
        txt = generate_text(prompt, api_key=x_gemini_api_key)
        return {"reply": txt}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clean", response_model=CleanResp)
async def clean(req: CleanReq, x_gemini_api_key: str | None = Header(None)):
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")
    prompt = f"You are a professional editor. Tone: {req.tone}. Grammar only: {req.grammar_only}. Rewrite the text:\n{req.text[:12000]}"
    try:
        txt = generate_text(prompt, api_key=x_gemini_api_key)
        return {"cleaned_text": txt}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fleet-chat", response_model=ChatResp)
async def fleet_chat(
    req: ChatReq,
    db: AsyncSession = Depends(get_db),
    _=Depends(verify_api_key),
    x_gemini_api_key: str | None = Header(None)
):
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="No message provided")

    try:
        # 1. Fetch all machines
        machines_result = await db.execute(select(Machine).order_by(Machine.hostname.asc()))
        machines = machines_result.scalars().all()

        fleet_data = []
        for m in machines:
            # Get latest telemetry
            latest_result = await db.execute(
                select(Telemetry)
                .where(Telemetry.machine_id == m.id)
                .order_by(Telemetry.created_at.desc())
                .limit(1)
            )
            latest = latest_result.scalars().first()
            
            # Get unresolved alerts
            alert_result = await db.execute(
                select(Alert)
                .where(Alert.machine_id == m.id)
                .where(Alert.is_resolved == False)
            )
            unresolved_alerts = alert_result.scalars().all()
            alert_messages = [a.message for a in unresolved_alerts]

            # Get historical telemetry aggregates (last 24 points)
            history_result = await db.execute(
                select(Telemetry)
                .where(Telemetry.machine_id == m.id)
                .order_by(Telemetry.created_at.desc())
                .limit(24)
            )
            history_points = history_result.scalars().all()
            
            cpu_vals = []
            ram_vals = []
            latency_vals = []
            for hp in history_points:
                h_metrics = hp.metrics or {}
                c = h_metrics.get("cpu") or h_metrics.get("cpu_percent") or h_metrics.get("cpu_usage")
                r = h_metrics.get("ram") or h_metrics.get("memory") or h_metrics.get("memory_percent") or h_metrics.get("ram_usage")
                lat = h_metrics.get("latency_ms") or h_metrics.get("latency")
                try:
                    if c is not None:
                        cpu_vals.append(float(c))
                except (ValueError, TypeError):
                    pass
                try:
                    if r is not None:
                        ram_vals.append(float(r))
                except (ValueError, TypeError):
                    pass
                try:
                    if lat is not None:
                        latency_vals.append(float(lat))
                except (ValueError, TypeError):
                    pass
            
            cpu_avg = round(sum(cpu_vals) / len(cpu_vals), 1) if cpu_vals else None
            cpu_peak = round(max(cpu_vals), 1) if cpu_vals else None
            ram_avg = round(sum(ram_vals) / len(ram_vals), 1) if ram_vals else None
            ram_peak = round(max(ram_vals), 1) if ram_vals else None
            latency_avg = round(sum(latency_vals) / len(latency_vals), 1) if latency_vals else None

            # Construct machine summary object
            metrics = latest.metrics if latest else {}
            
            fleet_data.append({
                "hostname": m.hostname,
                "status": "online" if m.last_seen and (datetime.now(timezone.utc) - (m.last_seen if m.last_seen.tzinfo else m.last_seen.replace(tzinfo=timezone.utc))).total_seconds() < 900 else "offline",
                "cpu_usage_pct": metrics.get("cpu"),
                "cpu_usage_avg_24pt": cpu_avg,
                "cpu_usage_peak_24pt": cpu_peak,
                "ram_usage_pct": metrics.get("ram"),
                "ram_usage_avg_24pt": ram_avg,
                "ram_usage_peak_24pt": ram_peak,
                "disk_usage_pct": metrics.get("disk"),
                "network_latency_ms": metrics.get("latency_ms"),
                "network_latency_avg_24pt": latency_avg,
                "wifi_signal_pct": metrics.get("wifi_signal"),
                "rdp_active": metrics.get("rdp_active"),
                "monitor_count": metrics.get("monitor_count"),
                "primary_resolution": metrics.get("primary_resolution"),
                "unresolved_alerts": alert_messages,
                "last_seen": m.last_seen.isoformat() if m.last_seen else None
            })

        # 2. Format context for prompt
        import json
        fleet_context = json.dumps(fleet_data, indent=2)

        system_instruction = (
            "You are the EndpointWatch Fleet AI Analyst. Below is the current telemetry status "
            "of all registered workstations in our endpoint monitoring system. "
            "Use this telemetry context to answer the user's questions. "
            "CRITICAL CONTEXTUAL FOCUS: If the user asks about a specific machine or asks to analyze alerts "
            "on a particular machine (such as 'IT-SALEAMLAK-M'), you MUST focus your analysis, metrics breakdown, "
            "and recommendations primarily on that specific machine. Do not dilute the analysis with detailed "
            "bullet points or metrics of other machines in the fleet unless explicitly requested or for brief "
            "comparative context. "
            "Highlight bottleneck areas (such as high CPU, RAM, or latency), identify RDP performance "
            "concerns, and provide actionable recommendations. Be concise, professional, and clear.\n\n"
            f"FLEET CURRENT TELEMETRY CONTEXT:\n{fleet_context}\n\n"
        )

        prompt = f"{system_instruction}User Inquiry: {req.message}\n\nAssistant Response:"

        # 3. Call generate_text
        reply = generate_text(prompt, api_key=x_gemini_api_key)
        return {"reply": reply}

    except Exception as e:
        import traceback
        logging.getLogger(__name__).error("Fleet AI Chat error: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Fleet AI Chat error: {str(e)}")
