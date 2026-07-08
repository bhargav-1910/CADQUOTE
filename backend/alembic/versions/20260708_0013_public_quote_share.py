"""customer-facing quote share links and accept/decline statuses

Revision ID: 20260708_0013
Revises: 20260706_0012
Create Date: 2026-07-08 12:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260708_0013"
down_revision = "20260706_0012"
branch_labels = None
depends_on = None


def _add_column_if_missing(inspector: sa.Inspector, table_name: str, column: sa.Column) -> None:
    if table_name not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns(table_name)}
    if column.name not in existing:
        op.add_column(table_name, column)


def _drop_column_if_exists(inspector: sa.Inspector, table_name: str, column_name: str) -> None:
    if table_name not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns(table_name)}
    if column_name in existing:
        op.drop_column(table_name, column_name)


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE must run outside the migration transaction.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE quotestatus ADD VALUE IF NOT EXISTS 'ACCEPTED'")
        op.execute("ALTER TYPE quotestatus ADD VALUE IF NOT EXISTS 'DECLINED'")

    inspector = sa.inspect(op.get_bind())
    _add_column_if_missing(
        inspector,
        "quotes",
        sa.Column("share_token", sa.String(64), nullable=True),
    )
    _add_column_if_missing(
        inspector,
        "quotes",
        sa.Column("customer_response_note", sa.Text(), nullable=True),
    )
    _add_column_if_missing(
        inspector,
        "quotes",
        sa.Column("responded_at", sa.DateTime(), nullable=True),
    )

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("quotes")}
    if "ix_quotes_share_token" not in existing_indexes:
        op.create_index("ix_quotes_share_token", "quotes", ["share_token"], unique=True)


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("quotes")}
    if "ix_quotes_share_token" in existing_indexes:
        op.drop_index("ix_quotes_share_token", table_name="quotes")

    _drop_column_if_exists(inspector, "quotes", "responded_at")
    _drop_column_if_exists(inspector, "quotes", "customer_response_note")
    _drop_column_if_exists(inspector, "quotes", "share_token")
    # Enum values are intentionally left in place; PostgreSQL cannot drop them safely.
