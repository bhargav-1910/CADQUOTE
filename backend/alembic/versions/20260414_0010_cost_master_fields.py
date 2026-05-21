"""add cost master fields for material, finish, and machine rates

Revision ID: 20260414_0010
Revises: 20260407_0009
Create Date: 2026-04-14 12:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260414_0010"
down_revision = "20260407_0009"
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
        "materials",
        sa.Column("scrap_cost_per_kg", sa.Numeric(10, 2), nullable=False, server_default="30.00"),
    )

    _add_column_if_missing(
        inspector,
        "surface_finishes",
        sa.Column("rate_per_kg", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
    )
    _add_column_if_missing(
        inspector,
        "surface_finishes",
        sa.Column("rate_per_sq_inch", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
    )
    _add_column_if_missing(
        inspector,
        "surface_finishes",
        sa.Column("rate_per_sq_ft", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
    )
    _add_column_if_missing(
        inspector,
        "surface_finishes",
        sa.Column("rate_per_piece", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
    )

    _add_column_if_missing(
        inspector,
        "machine_rates",
        sa.Column("setup_hour_rate", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
    )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    _drop_column_if_exists(inspector, "machine_rates", "setup_hour_rate")
    _drop_column_if_exists(inspector, "surface_finishes", "rate_per_piece")
    _drop_column_if_exists(inspector, "surface_finishes", "rate_per_sq_ft")
    _drop_column_if_exists(inspector, "surface_finishes", "rate_per_sq_inch")
    _drop_column_if_exists(inspector, "surface_finishes", "rate_per_kg")
    _drop_column_if_exists(inspector, "materials", "scrap_cost_per_kg")
