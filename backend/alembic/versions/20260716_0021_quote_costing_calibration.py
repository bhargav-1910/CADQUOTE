"""Add predicted/actual costing snapshots to quotes (calibration loop).

Revision ID: 20260716_0021
Revises: 20260716_0020
Create Date: 2026-07-16
"""
import sqlalchemy as sa
from alembic import op

revision = "20260716_0021"
down_revision = "20260716_0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("quotes")}

    if "predicted_costing" not in columns:
        op.add_column("quotes", sa.Column("predicted_costing", sa.JSON(), nullable=True))
    if "actual_costing" not in columns:
        op.add_column("quotes", sa.Column("actual_costing", sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("quotes")}

    if "actual_costing" in columns:
        op.drop_column("quotes", "actual_costing")
    if "predicted_costing" in columns:
        op.drop_column("quotes", "predicted_costing")
