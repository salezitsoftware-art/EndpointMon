from sqlalchemy import Column, Integer, ForeignKey, DateTime, func, JSON
from sqlalchemy.orm import relationship
from .base import Base


class Telemetry(Base):
    __tablename__ = "telemetry"

    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id", ondelete="CASCADE"), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), nullable=True)
    metrics = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    machine = relationship("Machine", backref="telemetry")
