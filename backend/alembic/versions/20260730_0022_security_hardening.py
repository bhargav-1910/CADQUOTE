"""Security hardening: roles, session state, lockout, password history, consent.

Revision ID: 20260730_0022
Revises: 20260716_0021
Create Date: 2026-07-30
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260730_0022"
down_revision = "20260716_0021"
branch_labels = None
depends_on = None


def _uuid_col_type(bind) -> sa.types.TypeEngine:
    if bind.dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.String(length=32)


# (column name, column factory) — added to users only when missing, so the
# migration is safe to re-run against partially upgraded databases.
_USER_COLUMNS = (
    ("role", lambda: sa.Column("role", sa.String(length=20), nullable=False, server_default="user")),
    ("session_id", lambda: sa.Column("session_id", sa.String(length=64), nullable=True)),
    ("session_started_at", lambda: sa.Column("session_started_at", sa.DateTime(), nullable=True)),
    ("last_activity_at", lambda: sa.Column("last_activity_at", sa.DateTime(), nullable=True)),
    ("failed_login_count", lambda: sa.Column("failed_login_count", sa.Integer(), nullable=False, server_default="0")),
    ("locked_until", lambda: sa.Column("locked_until", sa.DateTime(), nullable=True)),
    ("last_login_at", lambda: sa.Column("last_login_at", sa.DateTime(), nullable=True)),
    ("password_changed_at", lambda: sa.Column("password_changed_at", sa.DateTime(), nullable=True)),
    ("password_history", lambda: sa.Column("password_history", sa.JSON(), nullable=True)),
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    uuid_col_type = _uuid_col_type(bind)

    existing = {col["name"] for col in inspector.get_columns("users")}
    for name, factory in _USER_COLUMNS:
        if name not in existing:
            op.add_column("users", factory())

    tables = set(inspector.get_table_names())

    # Created by revision 0002 on databases that ran it; recreated here for
    # any database bootstrapped from a later schema snapshot.
    if "password_reset_tokens" not in tables:
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
        op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"])
        op.create_index("ix_password_reset_tokens_token_hash", "password_reset_tokens", ["token_hash"], unique=True)

    if "consent_records" not in tables:
        op.create_table(
            "consent_records",
            sa.Column("id", uuid_col_type, primary_key=True, nullable=False),
            sa.Column("user_id", uuid_col_type, nullable=True),
            sa.Column("subject_key", sa.String(length=64), nullable=False),
            sa.Column("policy_version", sa.String(length=40), nullable=False),
            sa.Column("necessary", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("preferences", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("analytics", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("marketing", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("source", sa.String(length=40), nullable=False, server_default="banner"),
            sa.Column("ip_hash", sa.String(length=64), nullable=True),
            sa.Column("user_agent", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_consent_records_user_id_users"),
        )
        op.create_index("ix_consent_records_user_id", "consent_records", ["user_id"])
        op.create_index("ix_consent_records_subject_key", "consent_records", ["subject_key"])
        op.create_index("ix_consent_records_created_at", "consent_records", ["created_at"])

    # Hot paths that were doing sequential scans: quote listing per owner and
    # customer-scoped quote aggregates.
    quote_indexes = {idx["name"] for idx in inspector.get_indexes("quotes")}
    if "ix_quotes_user_id_created_at" not in quote_indexes:
        op.create_index("ix_quotes_user_id_created_at", "quotes", ["user_id", "created_at"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    quote_indexes = {idx["name"] for idx in inspector.get_indexes("quotes")}
    if "ix_quotes_user_id_created_at" in quote_indexes:
        op.drop_index("ix_quotes_user_id_created_at", table_name="quotes")

    tables = set(inspector.get_table_names())
    if "consent_records" in tables:
        op.drop_table("consent_records")

    existing = {col["name"] for col in inspector.get_columns("users")}
    for name, _ in reversed(_USER_COLUMNS):
        if name in existing:
            op.drop_column("users", name)
