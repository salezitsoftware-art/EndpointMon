"""add api_keys table

Revision ID: 20260529_01
Revises: 
Create Date: 2026-05-29 22:40:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260529_01"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "api_keys" not in tables:
        op.create_table(
            "api_keys",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("key_prefix", sa.String(), nullable=False),
            sa.Column("key_hash", sa.String(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_api_keys_id", "api_keys", ["id"])
        op.create_index("ix_api_keys_name", "api_keys", ["name"])
        op.create_index("ix_api_keys_key_prefix", "api_keys", ["key_prefix"])
        op.create_unique_constraint("uq_api_keys_key_hash", "api_keys", ["key_hash"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "api_keys" in tables:
        op.drop_constraint("uq_api_keys_key_hash", "api_keys", type_="unique")
        op.drop_index("ix_api_keys_key_prefix", table_name="api_keys")
        op.drop_index("ix_api_keys_name", table_name="api_keys")
        op.drop_index("ix_api_keys_id", table_name="api_keys")
        op.drop_table("api_keys")
