"""Email verification and TOTP second factor.

Existing accounts land as unverified. That is deliberate and safe: verification
gates the admin role, not everyday use, so nobody is locked out — but an
operator holding the admin role must confirm their address before it takes
effect again.

Revision ID: 20260730_0025
Revises: 20260730_0024
Create Date: 2026-07-30
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260730_0025"
down_revision = "20260730_0024"
branch_labels = None
depends_on = None


def _uuid_col_type(bind) -> sa.types.TypeEngine:
    if bind.dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.String(length=32)


_USER_COLUMNS = (
    ("email_verified", lambda: sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false())),
    ("email_verified_at", lambda: sa.Column("email_verified_at", sa.DateTime(), nullable=True)),
    ("totp_secret", lambda: sa.Column("totp_secret", sa.String(length=255), nullable=True)),
    ("totp_enabled", lambda: sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.false())),
    ("totp_confirmed_at", lambda: sa.Column("totp_confirmed_at", sa.DateTime(), nullable=True)),
    ("totp_backup_codes", lambda: sa.Column("totp_backup_codes", sa.JSON(), nullable=True)),
    ("totp_last_used_step", lambda: sa.Column("totp_last_used_step", sa.Integer(), nullable=True)),
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    uuid_col_type = _uuid_col_type(bind)

    existing = {col["name"] for col in inspector.get_columns("users")}
    for name, factory in _USER_COLUMNS:
        if name not in existing:
            op.add_column("users", factory())

    if "email_verification_tokens" not in set(inspector.get_table_names()):
        op.create_table(
            "email_verification_tokens",
            sa.Column("id", uuid_col_type, primary_key=True, nullable=False),
            sa.Column("user_id", uuid_col_type, nullable=False),
            sa.Column("token_hash", sa.String(length=128), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_email_verification_tokens_user_id_users"),
        )
        op.create_index("ix_email_verification_tokens_user_id", "email_verification_tokens", ["user_id"])
        op.create_index(
            "ix_email_verification_tokens_token_hash",
            "email_verification_tokens", ["token_hash"], unique=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "email_verification_tokens" in set(inspector.get_table_names()):
        op.drop_table("email_verification_tokens")

    existing = {col["name"] for col in inspector.get_columns("users")}
    for name, _ in reversed(_USER_COLUMNS):
        if name in existing:
            op.drop_column("users", name)
