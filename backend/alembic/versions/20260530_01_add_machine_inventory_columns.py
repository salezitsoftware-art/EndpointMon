"""add machine inventory columns

Revision ID: 20260530_01
Revises: 20260529_01
Create Date: 2026-05-30 10:40:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260530_01"
down_revision: Union[str, None] = "20260529_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "machines" in tables:
        op.add_column("machines", sa.Column("username", sa.String(), nullable=True))
        op.add_column("machines", sa.Column("manufacturer", sa.String(), nullable=True))
        op.add_column("machines", sa.Column("model", sa.String(), nullable=True))
        op.add_column("machines", sa.Column("serial_number", sa.String(), nullable=True))
        op.add_column("machines", sa.Column("cpu_name", sa.String(), nullable=True))
        op.add_column("machines", sa.Column("cpu_cores", sa.Integer(), nullable=True))
        op.add_column("machines", sa.Column("cpu_threads", sa.Integer(), nullable=True))
        op.add_column("machines", sa.Column("ram_total_bytes", sa.BigInteger(), nullable=True))
        op.add_column("machines", sa.Column("gpu_name", sa.String(), nullable=True))
        op.add_column("machines", sa.Column("gpu_driver", sa.String(), nullable=True))
        op.add_column("machines", sa.Column("gpu_memory_bytes", sa.BigInteger(), nullable=True))
        op.add_column("machines", sa.Column("windows_version", sa.String(), nullable=True))
        op.add_column("machines", sa.Column("primary_disk", sa.String(), nullable=True))
        op.add_column("machines", sa.Column("disk_size_bytes", sa.BigInteger(), nullable=True))
        op.add_column("machines", sa.Column("network_adapter", sa.String(), nullable=True))
        op.add_column("machines", sa.Column("inventory", sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "machines" in tables:
        op.drop_column("machines", "inventory")
        op.drop_column("machines", "network_adapter")
        op.drop_column("machines", "disk_size_bytes")
        op.drop_column("machines", "primary_disk")
        op.drop_column("machines", "windows_version")
        op.drop_column("machines", "gpu_memory_bytes")
        op.drop_column("machines", "gpu_driver")
        op.drop_column("machines", "gpu_name")
        op.drop_column("machines", "ram_total_bytes")
        op.drop_column("machines", "cpu_threads")
        op.drop_column("machines", "cpu_cores")
        op.drop_column("machines", "cpu_name")
        op.drop_column("machines", "serial_number")
        op.drop_column("machines", "model")
        op.drop_column("machines", "manufacturer")
        op.drop_column("machines", "username")
