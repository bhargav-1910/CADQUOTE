"""exact B-rep features on geometry analyses

Revision ID: 20260710_0016
Revises: 20260708_0015
Create Date: 2026-07-10 01:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260710_0016"
down_revision = "20260708_0015"
branch_labels = None
depends_on = None

_COLUMNS = (
    ("machining_direction_count", sa.Integer()),
    ("brep_hole_data", sa.JSON()),
)


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "geometry_analyses" in inspector.get_table_names():
        existing = {col["name"] for col in inspector.get_columns("geometry_analyses")}
        for name, col_type in _COLUMNS:
            if name not in existing:
                op.add_column("geometry_analyses", sa.Column(name, col_type, nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "geometry_analyses" in inspector.get_table_names():
        existing = {col["name"] for col in inspector.get_columns("geometry_analyses")}
        for name, _ in _COLUMNS:
            if name in existing:
                op.drop_column("geometry_analyses", name)
