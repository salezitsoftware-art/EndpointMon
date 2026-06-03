from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON, ForeignKey, func
from .base import Base


class MachineAnalysis(Base):
    __tablename__ = "machine_analyses"

    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id", ondelete="CASCADE"), index=True, nullable=False)
    provider = Column(String, nullable=False)
    model = Column(String, nullable=True)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
    summary = Column(String, nullable=True)
    severity = Column(String, nullable=True)
    confidence = Column(Integer, nullable=True)
    signals = Column(JSON, nullable=True)
    recommendations = Column(JSON, nullable=True)
    ai_enabled = Column(Boolean, nullable=False, default=False)
