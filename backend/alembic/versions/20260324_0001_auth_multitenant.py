"""add auth + multitenant ownership columns

Revision ID: 20260324_0001
Revises:
Create Date: 2026-03-24 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260324_0001"
down_revision = None
branch_labels = None
depends_on = None


def _uuid_col_type(bind) -> sa.types.TypeEngine:
    # Keep UUID native on PostgreSQL; fall back to string for SQLite/dev portability.
    if bind.dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.String(length=32)


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    columns = [col["name"] for col in inspector.get_columns(table_name)]
    return column_name in columns


def _table_row_count(bind, table_name: str) -> int:
    return int(bind.execute(sa.text(f"SELECT COUNT(*) FROM {table_name}")).scalar() or 0)


def _column_has_nulls(bind, table_name: str, column_name: str) -> bool:
    query = sa.text(f"SELECT COUNT(*) FROM {table_name} WHERE {column_name} IS NULL")
    return int(bind.execute(query).scalar() or 0) > 0


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    uuid_col_type = _uuid_col_type(bind)

    if not _has_table(inspector, "users"):
        op.create_table(
            "users",
            sa.Column("id", uuid_col_type, primary_key=True, nullable=False),
            sa.Column("full_name", sa.String(length=200), nullable=False),
            sa.Column("email", sa.String(length=200), nullable=False),
            sa.Column("hashed_password", sa.String(length=255), nullable=False),
            sa.Column("company_name", sa.String(length=200), nullable=False),
            sa.Column("company_address", sa.Text(), nullable=False),
            sa.Column("company_logo_path", sa.String(length=500), nullable=True),
            sa.Column("refresh_token_hash", sa.String(length=128), nullable=True),
            sa.Column("refresh_token_expires_at", sa.DateTime(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.UniqueConstraint("email", name="uq_users_email"),
        )
        op.create_index("ix_users_email", "users", ["email"], unique=False)

    inspector = sa.inspect(bind)

    if _has_table(inspector, "cad_files") and not _has_column(inspector, "cad_files", "user_id"):
        op.add_column("cad_files", sa.Column("user_id", uuid_col_type, nullable=True))
        op.create_index("ix_cad_files_user_id", "cad_files", ["user_id"], unique=False)
        op.create_foreign_key("fk_cad_files_user_id_users", "cad_files", "users", ["user_id"], ["id"])

        # Tighten to NOT NULL only when it is safe to do so in-place.
        if _table_row_count(bind, "cad_files") == 0 or not _column_has_nulls(bind, "cad_files", "user_id"):
            op.alter_column("cad_files", "user_id", nullable=False)

    if _has_table(inspector, "quotes") and not _has_column(inspector, "quotes", "user_id"):
        op.add_column("quotes", sa.Column("user_id", uuid_col_type, nullable=True))
        op.create_index("ix_quotes_user_id", "quotes", ["user_id"], unique=False)
        op.create_foreign_key("fk_quotes_user_id_users", "quotes", "users", ["user_id"], ["id"])

        if _table_row_count(bind, "quotes") == 0 or not _column_has_nulls(bind, "quotes", "user_id"):
            op.alter_column("quotes", "user_id", nullable=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "quotes") and _has_column(inspector, "quotes", "user_id"):
        op.drop_constraint("fk_quotes_user_id_users", "quotes", type_="foreignkey")
        op.drop_index("ix_quotes_user_id", table_name="quotes")
        op.drop_column("quotes", "user_id")

    if _has_table(inspector, "cad_files") and _has_column(inspector, "cad_files", "user_id"):
        op.drop_constraint("fk_cad_files_user_id_users", "cad_files", type_="foreignkey")
        op.drop_index("ix_cad_files_user_id", table_name="cad_files")
        op.drop_column("cad_files", "user_id")

    if _has_table(inspector, "users"):
        try:
            op.drop_index("ix_users_email", table_name="users")
        except Exception:
            pass
        op.drop_table("users")
