"""Add subscription plan fields to users.

Revision ID: 20260713_0018
Revises: 20260710_0017
Create Date: 2026-07-13
"""
import sqlalchemy as sa
from alembic import op

revision = "20260713_0018"
down_revision = "20260710_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("users")}

    if "plan" not in columns:
        op.add_column(
            "users",
            sa.Column("plan", sa.String(20), nullable=False, server_default="free"),
        )
    if "plan_expires_at" not in columns:
        op.add_column("users", sa.Column("plan_expires_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("users")}

    if "plan_expires_at" in columns:
        op.drop_column("users", "plan_expires_at")
    if "plan" in columns:
        op.drop_column("users", "plan")
