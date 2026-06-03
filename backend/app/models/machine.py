from sqlalchemy import Column, Integer, BigInteger, String, DateTime, func, JSON
from .base import Base


class Machine(Base):
    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String, index=True, nullable=False)
    os_version = Column(String, nullable=True)
    last_seen = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    # Inventory fields
    username = Column(String, nullable=True)
    manufacturer = Column(String, nullable=True)
    model = Column(String, nullable=True)
    serial_number = Column(String, nullable=True)
    cpu_name = Column(String, nullable=True)
    cpu_cores = Column(Integer, nullable=True)
    cpu_threads = Column(Integer, nullable=True)
    cpu_base_clock = Column(String, nullable=True)
    cpu_max_clock = Column(String, nullable=True)
    ram_total_bytes = Column(BigInteger, nullable=True)
    gpu_name = Column(String, nullable=True)
    gpu_driver = Column(String, nullable=True)
    gpu_driver_date = Column(String, nullable=True)
    gpu_type = Column(String, nullable=True)
    gpu_memory_bytes = Column(BigInteger, nullable=True)
    windows_version = Column(String, nullable=True)
    primary_disk = Column(String, nullable=True)
    disk_size_bytes = Column(BigInteger, nullable=True)
    disk_model = Column(String, nullable=True)
    disk_type = Column(String, nullable=True)
    network_adapter = Column(String, nullable=True)
    inventory = Column(JSON, nullable=True)
