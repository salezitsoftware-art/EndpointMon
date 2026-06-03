from datetime import datetime, timezone
import json

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.security import verify_api_key
from ..db.session import get_db
from ..models import Machine, Telemetry, Alert, MachineAnalysis
from ..schemas.machine import MachineAnalysisResponse
from ..schemas.analysis import MachineAnalysisInDB
from ..services.llm_client import generate_text
from ..services.embeddings import get_embedding
from ..services.vector_store import get_default_store
from ..services.ai_analysis import _build_local_analysis, minutes_since_last_seen

router = APIRouter(prefix="/ai", tags=["AI-Machines"])


@router.post("/machines/{machine_id}/analyze", response_model=MachineAnalysisResponse)
async def analyze_machine_llm(
    machine_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(verify_api_key),
    x_gemini_api_key: str | None = Header(None),
):
    result = await db.execute(select(Machine).where(Machine.id == machine_id))
    machine = result.scalars().first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    latest_result = await db.execute(
        select(Telemetry)
        .where(Telemetry.machine_id == machine_id)
        .order_by(Telemetry.created_at.desc())
        .limit(1)
    )
    latest = latest_result.scalars().first()

    alert_result = await db.execute(
        select(Alert.message)
        .where(Alert.machine_id == machine_id)
        .where(Alert.is_resolved.is_(False))
        .order_by(Alert.created_at.desc())
        .limit(10)
    )
    alerts = [row[0] for row in alert_result.all() if row and row[0]]

    # Build prompt with up to 48 recent history points and aggregates
    history_result = await db.execute(
        select(Telemetry)
        .where(Telemetry.machine_id == machine_id)
        .order_by(Telemetry.created_at.desc())
        .limit(48)
    )
    history_points = history_result.scalars().all()
    
    cpu_vals = []
    ram_vals = []
    gpu_vals = []
    latency_vals = []
    time_series = []
    
    for hp in history_points:
        h_metrics = hp.metrics or {}
        c = h_metrics.get("cpu") or h_metrics.get("cpu_percent") or h_metrics.get("cpu_usage")
        r = h_metrics.get("ram") or h_metrics.get("memory") or h_metrics.get("memory_percent") or h_metrics.get("ram_usage")
        g = h_metrics.get("gpu") or h_metrics.get("gpu_percent") or h_metrics.get("gpu_usage")
        lat = h_metrics.get("latency_ms") or h_metrics.get("latency")
        
        ts_str = hp.created_at.isoformat() if hp.created_at else None
        
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
            if g is not None:
                gpu_vals.append(float(g))
        except (ValueError, TypeError):
            pass
        try:
            if lat is not None:
                latency_vals.append(float(lat))
        except (ValueError, TypeError):
            pass
            
        time_series.append({
            "timestamp": ts_str,
            "cpu": c,
            "ram": r,
            "gpu": g,
            "latency": lat
        })
        
    time_series.reverse()
    
    history_stats = {
        "cpu_avg": round(sum(cpu_vals) / len(cpu_vals), 1) if cpu_vals else None,
        "cpu_peak": round(max(cpu_vals), 1) if cpu_vals else None,
        "ram_avg": round(sum(ram_vals) / len(ram_vals), 1) if ram_vals else None,
        "ram_peak": round(max(ram_vals), 1) if ram_vals else None,
        "gpu_avg": round(sum(gpu_vals) / len(gpu_vals), 1) if gpu_vals else None,
        "gpu_peak": round(max(gpu_vals), 1) if gpu_vals else None,
        "latency_avg": round(sum(latency_vals) / len(latency_vals), 1) if latency_vals else None,
        "latency_peak": round(max(latency_vals), 1) if latency_vals else None,
    }

    payload = {
        "hostname": machine.hostname,
        "latest_metrics": latest.metrics if latest else {},
        "inventory": machine.inventory if getattr(machine, "inventory", None) else {},
        "alerts": alerts,
        "last_seen_minutes": minutes_since_last_seen(machine.last_seen),
        "history_stats_48pt": history_stats,
        "recent_time_series_48pt": time_series
    }

    # Try to use embeddings + local vector store to retrieve similar past analyses.
    store = get_default_store()
    try:
        emb_query = get_embedding(json.dumps(payload))
        hits = store.query(emb_query, top_k=5)
        recent_history_lines = []
        for key, score, entry in hits:
            ts = entry.get("metadata", {}).get("generated_at") or ""
            txt = (entry.get("text") or "").strip()
            recent_history_lines.append(f"- [{ts}] (score={score:.3f}) {txt}")
    except Exception:
        recent_history_lines = []

    system = (
        "You are an endpoint telemetry analyst. Summarize the likely issue, severity, confidence, key signals, and next actions. "
        "Return ONLY a valid JSON object with keys: summary, severity (critical|warning|normal), confidence (0-100), signals (array), recommendations (array)."
    )

    recent_section = "\nRecent AI analyses (most recent first):\n" + "\n".join(recent_history_lines) if recent_history_lines else ""

    prompt = system + recent_section + "\n\nAnalyze this machine:\n" + json.dumps(payload)

    try:
        raw = generate_text(prompt, api_key=x_gemini_api_key)
        if raw.startswith("```"):
            parts = raw.split("```")
            if len(parts) >= 2:
                raw = parts[1]
                if raw.startswith("json"):
                    raw = raw[4:]
        raw = raw.strip()
        parsed = json.loads(raw)
        signals = parsed.get("signals") if isinstance(parsed.get("signals"), list) else []
        recommendations = parsed.get("recommendations") if isinstance(parsed.get("recommendations"), list) else []
        confidence = int(parsed.get("confidence") or 0)

        # Persist analysis to DB
        db_analysis = MachineAnalysis(
            machine_id=machine.id,
            provider="llm",
            model=None,
            summary=str(parsed.get("summary") or ""),
            severity=str(parsed.get("severity") or "warning"),
            confidence=max(0, min(100, confidence)),
            signals=signals,
            recommendations=recommendations,
            ai_enabled=True,
        )
        db.add(db_analysis)
        await db.commit()
        await db.refresh(db_analysis)

        # Index the new analysis summary in the local vector store for future retrieval
        try:
            emb = get_embedding(db_analysis.summary or "")
            store.upsert(str(db_analysis.id), emb, db_analysis.summary or "", metadata={"machine_id": machine.id, "generated_at": db_analysis.generated_at.isoformat() if db_analysis.generated_at else None})
        except Exception:
            pass

        return MachineAnalysisResponse(
            machine_id=machine.id,
            hostname=machine.hostname,
            provider=db_analysis.provider,
            model=db_analysis.model,
            generated_at=db_analysis.generated_at,
            summary=db_analysis.summary or "",
            severity=db_analysis.severity or "warning",
            confidence=db_analysis.confidence or 0,
            signals=db_analysis.signals or [],
            recommendations=db_analysis.recommendations or [],
            ai_enabled=bool(db_analysis.ai_enabled),
        )
    except Exception:
        # Fallback to deterministic rules and persist
        analysis = _build_local_analysis(machine.hostname, latest.metrics if latest else None, machine.inventory if getattr(machine, "inventory", None) else None, alerts, minutes_since_last_seen(machine.last_seen))
        db_analysis = MachineAnalysis(
            machine_id=machine.id,
            provider=analysis.get("provider", "rules"),
            model=analysis.get("model"),
            summary=analysis.get("summary"),
            severity=analysis.get("severity"),
            confidence=analysis.get("confidence"),
            signals=analysis.get("signals"),
            recommendations=analysis.get("recommendations"),
            ai_enabled=analysis.get("ai_enabled", False),
        )
        db.add(db_analysis)
        await db.commit()
        await db.refresh(db_analysis)

        return MachineAnalysisResponse(
            machine_id=machine.id,
            hostname=machine.hostname,
            provider=db_analysis.provider,
            model=db_analysis.model,
            generated_at=db_analysis.generated_at,
            summary=db_analysis.summary or "",
            severity=db_analysis.severity or "warning",
            confidence=db_analysis.confidence or 0,
            signals=db_analysis.signals or [],
            recommendations=db_analysis.recommendations or [],
            ai_enabled=bool(db_analysis.ai_enabled),
        )


@router.get("/machines/{machine_id}/analyses", response_model=list[MachineAnalysisInDB])
async def list_machine_analyses(
    machine_id: int,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    _=Depends(verify_api_key),
):
    safe_limit = min(max(limit, 1), 1000)
    result = await db.execute(
        select(MachineAnalysis)
        .where(MachineAnalysis.machine_id == machine_id)
        .order_by(MachineAnalysis.generated_at.desc())
        .limit(safe_limit)
    )
    rows = result.scalars().all()
    out = []
    for r in rows:
        out.append({
            "id": r.id,
            "machine_id": r.machine_id,
            "provider": r.provider,
            "model": r.model,
            "generated_at": r.generated_at.isoformat() if r.generated_at else None,
            "summary": r.summary,
            "severity": r.severity,
            "confidence": r.confidence,
            "signals": r.signals,
            "recommendations": r.recommendations,
            "ai_enabled": bool(r.ai_enabled),
        })
    return out


@router.get("/analyses/{analysis_id}", response_model=MachineAnalysisInDB)
async def get_analysis(
    analysis_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(verify_api_key),
):
    res = await db.execute(select(MachineAnalysis).where(MachineAnalysis.id == analysis_id))
    row = res.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return MachineAnalysisInDB.from_orm(row)
