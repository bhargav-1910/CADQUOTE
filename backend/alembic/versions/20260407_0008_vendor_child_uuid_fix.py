"""normalize vendor child primary keys to uuid

Revision ID: 20260407_0008
Revises: 20260407_0007
Create Date: 2026-04-07 13:55:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260407_0008"
down_revision = "20260407_0007"
branch_labels = None
depends_on = None


def _column_type_name(inspector: sa.Inspector, table_name: str, column_name: str) -> str | None:
    for col in inspector.get_columns(table_name):
        if col["name"] == column_name:
            return str(col["type"]).lower()
    return None


def _promote_column_to_uuid_if_needed(inspector: sa.Inspector, table_name: str, column_name: str) -> None:
    col_type = _column_type_name(inspector, table_name, column_name) or ""
    if "uuid" in col_type:
        return
    op.execute(
        f"ALTER TABLE {table_name} ALTER COLUMN {column_name} TYPE UUID USING {column_name}::uuid"
    )


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    _promote_column_to_uuid_if_needed(inspector, "vendors", "id")
    _promote_column_to_uuid_if_needed(inspector, "vendor_machine_capabilities", "id")
    _promote_column_to_uuid_if_needed(inspector, "vendor_machine_capabilities", "vendor_id")
    _promote_column_to_uuid_if_needed(inspector, "vendor_material_expertise", "id")
    _promote_column_to_uuid_if_needed(inspector, "vendor_material_expertise", "vendor_id")
    _promote_column_to_uuid_if_needed(inspector, "vendor_certifications", "id")
    _promote_column_to_uuid_if_needed(inspector, "vendor_certifications", "vendor_id")

    if "quotes" in inspector.get_table_names():
        _promote_column_to_uuid_if_needed(inspector, "quotes", "matched_vendor_id")


def downgrade() -> None:
    pass
