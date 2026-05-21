"""add common_names to materials

Revision ID: 20260414_0011
Revises: 20260414_0010
Create Date: 2026-04-14 13:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260414_0011"
down_revision = "20260414_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "materials" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("materials")}
    if "common_names" not in existing:
        op.add_column("materials", sa.Column("common_names", sa.String(length=255), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "materials" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("materials")}
    if "common_names" in existing:
        op.drop_column("materials", "common_names")
