"""add signup otp and password reset token tables

Revision ID: 20260325_0002
Revises: 20260324_0001
Create Date: 2026-03-25 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260325_0002"
down_revision = "20260324_0001"
branch_labels = None
depends_on = None


def _uuid_col_type(bind) -> sa.types.TypeEngine:
    if bind.dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.String(length=32)


def upgrade() -> None:
    bind = op.get_bind()
    uuid_col_type = _uuid_col_type(bind)

    op.create_table(
        "signup_otps",
        sa.Column("id", uuid_col_type, primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=200), nullable=False),
        sa.Column("user_id", uuid_col_type, nullable=True),
        sa.Column("otp_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_signup_otps_user_id_users"),
    )
    op.create_index("ix_signup_otps_email", "signup_otps", ["email"], unique=False)
    op.create_index("ix_signup_otps_user_id", "signup_otps", ["user_id"], unique=False)

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", uuid_col_type, primary_key=True, nullable=False),
        sa.Column("user_id", uuid_col_type, nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_password_reset_tokens_user_id_users"),
    )
    op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"], unique=False)
    op.create_index("ix_password_reset_tokens_token_hash", "password_reset_tokens", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_password_reset_tokens_token_hash", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_user_id", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")

    op.drop_index("ix_signup_otps_user_id", table_name="signup_otps")
    op.drop_index("ix_signup_otps_email", table_name="signup_otps")
    op.drop_table("signup_otps")
