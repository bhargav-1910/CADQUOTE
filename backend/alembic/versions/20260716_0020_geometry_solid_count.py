"""Add solid_count to geometry_analyses (multi-body assembly detection).

Revision ID: 20260716_0020
Revises: 20260713_0019
Create Date: 2026-07-16
"""
import sqlalchemy as sa
from alembic import op

revision = "20260716_0020"
down_revision = "20260713_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("geometry_analyses")}

    if "solid_count" not in columns:
        op.add_column("geometry_analyses", sa.Column("solid_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("geometry_analyses")}

    if "solid_count" in columns:
        op.drop_column("geometry_analyses", "solid_count")
