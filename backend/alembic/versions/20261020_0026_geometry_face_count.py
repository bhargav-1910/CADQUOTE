"""Add face_count to geometry_analyses (B-rep feature-time driver in pricing).

Revision ID: 20261020_0026
Revises: 20260730_0025
Create Date: 2026-10-20
"""
import sqlalchemy as sa
from alembic import op

revision = "20261020_0026"
down_revision = "20260730_0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("geometry_analyses")}

    if "face_count" not in columns:
        op.add_column("geometry_analyses", sa.Column("face_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("geometry_analyses")}

    if "face_count" in columns:
        op.drop_column("geometry_analyses", "face_count")
