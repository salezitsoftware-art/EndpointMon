"""add machine analysis table

Revision ID: 20260530_03
Revises: 20260530_02
Create Date: 2026-05-30 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20260530_03'
down_revision = '20260530_02'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'machine_analyses',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('machine_id', sa.Integer(), sa.ForeignKey('machines.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('provider', sa.String(), nullable=False),
        sa.Column('model', sa.String(), nullable=True),
        sa.Column('generated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('summary', sa.String(), nullable=True),
        sa.Column('severity', sa.String(), nullable=True),
        sa.Column('confidence', sa.Integer(), nullable=True),
        sa.Column('signals', sa.JSON(), nullable=True),
        sa.Column('recommendations', sa.JSON(), nullable=True),
        sa.Column('ai_enabled', sa.Boolean(), nullable=False, server_default=sa.text('0')),
    )


def downgrade():
    op.drop_table('machine_analyses')
