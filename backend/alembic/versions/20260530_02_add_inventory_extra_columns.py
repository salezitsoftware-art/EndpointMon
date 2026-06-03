"""add extra inventory columns

Revision ID: 20260530_02
Revises: 20260530_01
Create Date: 2026-05-30 11:30:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260530_02"
down_revision: Union[str, None] = "20260530_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "machines" in tables:
        op.add_column("machines", sa.Column("cpu_base_clock", sa.String(), nullable=True))
        op.add_column("machines", sa.Column("cpu_max_clock", sa.String(), nullable=True))
        op.add_column("machines", sa.Column("gpu_driver_date", sa.String(), nullable=True))
        op.add_column("machines", sa.Column("gpu_type", sa.String(), nullable=True))
        op.add_column("machines", sa.Column("disk_model", sa.String(), nullable=True))
        op.add_column("machines", sa.Column("disk_type", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "machines" in tables:
        op.drop_column("machines", "disk_type")
        op.drop_column("machines", "disk_model")
        op.drop_column("machines", "gpu_type")
        op.drop_column("machines", "gpu_driver_date")
        op.drop_column("machines", "cpu_max_clock")
        op.drop_column("machines", "cpu_base_clock")
