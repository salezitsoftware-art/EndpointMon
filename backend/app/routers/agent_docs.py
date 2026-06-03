from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse

from ..core.security import verify_api_key


router = APIRouter()


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _read_script(script_name: str) -> str:
    script_path = _repo_root() / "agent" / "scripts" / script_name
    if not script_path.exists():
        raise HTTPException(status_code=404, detail=f"Script not found: {script_name}")
    return script_path.read_text(encoding="utf-8")


@router.get("/agent/scripts/collector", response_class=PlainTextResponse)
async def get_collector_script(_=Depends(verify_api_key)) -> str:
    return _read_script("collect-and-send.ps1")


@router.get("/agent/scripts/installer", response_class=PlainTextResponse)
async def get_installer_script(_=Depends(verify_api_key)) -> str:
    return _read_script("install-task.ps1")
