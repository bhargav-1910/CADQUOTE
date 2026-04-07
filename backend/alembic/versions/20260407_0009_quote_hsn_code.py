"""add hsn_code to quotes

Revision ID: 20260407_0009
Revises: 20260407_0008
Create Date: 2026-04-07 17:10:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260407_0009"
down_revision = "20260407_0008"
branch_labels = None
depends_on = None


def _add_column_if_missing(inspector: sa.Inspector, table_name: str, column: sa.Column) -> None:
    if table_name not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns(table_name)}
    if column.name not in existing:
        op.add_column(table_name, column)


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    _add_column_if_missing(inspector, "quotes", sa.Column("hsn_code", sa.String(length=50), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "quotes" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("quotes")}
    if "hsn_code" in existing:
        op.drop_column("quotes", "hsn_code")
