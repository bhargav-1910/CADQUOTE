"""workspace brand accent color on users

Revision ID: 20260708_0014
Revises: 20260708_0013
Create Date: 2026-07-08 14:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260708_0014"
down_revision = "20260708_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "users" in inspector.get_table_names():
        existing = {col["name"] for col in inspector.get_columns("users")}
        if "brand_color" not in existing:
            op.add_column("users", sa.Column("brand_color", sa.String(7), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "users" in inspector.get_table_names():
        existing = {col["name"] for col in inspector.get_columns("users")}
        if "brand_color" in existing:
            op.drop_column("users", "brand_color")
