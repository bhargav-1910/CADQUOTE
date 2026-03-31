"""add user phone number column

Revision ID: 20260325_0003
Revises: 20260325_0002
Create Date: 2026-03-25 00:30:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260325_0003"
down_revision = "20260325_0002"
branch_labels = None
depends_on = None


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    columns = [col["name"] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "users" in inspector.get_table_names() and not _has_column(inspector, "users", "phone_number"):
        op.add_column("users", sa.Column("phone_number", sa.String(length=30), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "users" in inspector.get_table_names() and _has_column(inspector, "users", "phone_number"):
        op.drop_column("users", "phone_number")
