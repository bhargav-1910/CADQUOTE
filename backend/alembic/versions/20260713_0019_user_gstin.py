"""Add seller GSTIN to users (drives CGST/SGST vs IGST on quote PDFs).

Revision ID: 20260713_0019
Revises: 20260713_0018
Create Date: 2026-07-13
"""
import sqlalchemy as sa
from alembic import op

revision = "20260713_0019"
down_revision = "20260713_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("users")}
    if "gstin" not in columns:
        op.add_column("users", sa.Column("gstin", sa.String(20), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("users")}
    if "gstin" in columns:
        op.drop_column("users", "gstin")
