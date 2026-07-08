"""widen quote money columns so large combined quotes cannot overflow

Numeric(10,2) caps totals at 99,999,999.99 — a large multi-part combined
quote in INR can exceed that. Widen to Numeric(14,2).

Revision ID: 20260708_0015
Revises: 20260708_0014
Create Date: 2026-07-08 16:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260708_0015"
down_revision = "20260708_0014"
branch_labels = None
depends_on = None

MONEY_COLUMNS = [
    "material_cost",
    "machining_cost",
    "finish_cost",
    "inspection_cost",
    "subtotal",
    "total_price",
    "unit_price",
]


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "quotes" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("quotes")}
    for column in MONEY_COLUMNS:
        if column in existing:
            op.alter_column(
                "quotes",
                column,
                type_=sa.Numeric(14, 2),
                existing_type=sa.Numeric(10, 2),
                existing_nullable=False,
            )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "quotes" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("quotes")}
    for column in MONEY_COLUMNS:
        if column in existing:
            op.alter_column(
                "quotes",
                column,
                type_=sa.Numeric(10, 2),
                existing_type=sa.Numeric(14, 2),
                existing_nullable=False,
            )
