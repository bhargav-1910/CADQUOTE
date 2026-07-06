"""add fitted hole diameters to geometry analyses

Revision ID: 20260706_0012
Revises: 20260414_0011
Create Date: 2026-07-06 12:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260706_0012"
down_revision = "20260414_0011"
branch_labels = None
depends_on = None


def _add_column_if_missing(inspector: sa.Inspector, table_name: str, column: sa.Column) -> None:
    if table_name not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns(table_name)}
    if column.name not in existing:
        op.add_column(table_name, column)


def _drop_column_if_exists(inspector: sa.Inspector, table_name: str, column_name: str) -> None:
    if table_name not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns(table_name)}
    if column_name in existing:
        op.drop_column(table_name, column_name)


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    _add_column_if_missing(
        inspector,
        "geometry_analyses",
        sa.Column("hole_diameters_mm", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    _drop_column_if_exists(inspector, "geometry_analyses", "hole_diameters_mm")
