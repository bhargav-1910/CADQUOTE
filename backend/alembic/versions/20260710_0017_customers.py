"""customers table and quotes.customer_id (CRM-lite)

Revision ID: 20260710_0017
Revises: 20260710_0016
Create Date: 2026-07-10 12:00:00.000000

Schema only — linking existing quotes to customers happens in the
idempotent startup backfill (app.services.customers.backfill_customer_links)
so UUID handling stays inside the ORM's cross-database type.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260710_0017"
down_revision = "20260710_0016"
branch_labels = None
depends_on = None


def _uuid_type(bind) -> sa.types.TypeEngine:
    if bind.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import UUID as PG_UUID

        return PG_UUID(as_uuid=True)
    return sa.CHAR(32)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    uuid_type = _uuid_type(bind)

    if "customers" not in inspector.get_table_names():
        op.create_table(
            "customers",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("user_id", uuid_type, sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("email", sa.String(200), nullable=True, index=True),
            sa.Column("company", sa.String(200), nullable=True),
            sa.Column("phone", sa.String(30), nullable=True),
            sa.Column("gstin", sa.String(20), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    quote_columns = {col["name"] for col in inspector.get_columns("quotes")}
    if "customer_id" not in quote_columns:
        op.add_column(
            "quotes",
            sa.Column("customer_id", uuid_type, sa.ForeignKey("customers.id"), nullable=True),
        )
        op.create_index("ix_quotes_customer_id", "quotes", ["customer_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    quote_columns = {col["name"] for col in inspector.get_columns("quotes")}
    if "customer_id" in quote_columns:
        op.drop_index("ix_quotes_customer_id", table_name="quotes")
        op.drop_column("quotes", "customer_id")

    if "customers" in inspector.get_table_names():
        op.drop_table("customers")
