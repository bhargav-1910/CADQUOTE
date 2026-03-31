"""add points wallet, points ledger, stripe checkout credits

Revision ID: 20260325_0004
Revises: 20260325_0003
Create Date: 2026-03-25 01:15:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260325_0004"
down_revision = "20260325_0003"
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
        "points_packages",
        sa.Column("id", uuid_col_type, primary_key=True, nullable=False),
        sa.Column("package_code", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("price_minor", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="inr"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("package_code", name="uq_points_packages_package_code"),
    )
    op.create_index("ix_points_packages_package_code", "points_packages", ["package_code"], unique=False)

    points_packages = sa.table(
        "points_packages",
        sa.column("id", uuid_col_type),
        sa.column("package_code", sa.String()),
        sa.column("name", sa.String()),
        sa.column("points", sa.Integer()),
        sa.column("price_minor", sa.Integer()),
        sa.column("currency", sa.String()),
        sa.column("is_active", sa.Boolean()),
        sa.column("display_order", sa.Integer()),
    )
    import uuid as _uuid
    op.bulk_insert(
        points_packages,
        [
            {
                "id": _uuid.uuid4().hex if bind.dialect.name != "postgresql" else _uuid.uuid4(),
                "package_code": "starter_250",
                "name": "Starter 250",
                "points": 250,
                "price_minor": 99900,
                "currency": "inr",
                "is_active": True,
                "display_order": 10,
            },
            {
                "id": _uuid.uuid4().hex if bind.dialect.name != "postgresql" else _uuid.uuid4(),
                "package_code": "growth_1000",
                "name": "Growth 1000",
                "points": 1000,
                "price_minor": 349900,
                "currency": "inr",
                "is_active": True,
                "display_order": 20,
            },
            {
                "id": _uuid.uuid4().hex if bind.dialect.name != "postgresql" else _uuid.uuid4(),
                "package_code": "pro_5000",
                "name": "Pro 5000",
                "points": 5000,
                "price_minor": 1499900,
                "currency": "inr",
                "is_active": True,
                "display_order": 30,
            },
        ],
    )

    op.create_table(
        "points_wallets",
        sa.Column("id", uuid_col_type, primary_key=True, nullable=False),
        sa.Column("user_id", uuid_col_type, nullable=False),
        sa.Column("balance_points", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_points_wallets_user_id_users"),
        sa.UniqueConstraint("user_id", name="uq_points_wallets_user_id"),
    )
    op.create_index("ix_points_wallets_user_id", "points_wallets", ["user_id"], unique=False)

    op.create_table(
        "points_ledger_entries",
        sa.Column("id", uuid_col_type, primary_key=True, nullable=False),
        sa.Column("user_id", uuid_col_type, nullable=False),
        sa.Column("delta_points", sa.Integer(), nullable=False),
        sa.Column("balance_after", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("reference_type", sa.String(length=100), nullable=True),
        sa.Column("reference_id", sa.String(length=100), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_points_ledger_entries_user_id_users"),
    )
    op.create_index("ix_points_ledger_entries_user_id", "points_ledger_entries", ["user_id"], unique=False)
    op.create_index("ix_points_ledger_entries_created_at", "points_ledger_entries", ["created_at"], unique=False)

    op.create_table(
        "stripe_checkout_credits",
        sa.Column("id", uuid_col_type, primary_key=True, nullable=False),
        sa.Column("stripe_session_id", sa.String(length=255), nullable=False),
        sa.Column("user_id", uuid_col_type, nullable=False),
        sa.Column("package_id", sa.String(length=100), nullable=False),
        sa.Column("points_credited", sa.Integer(), nullable=False),
        sa.Column("amount_paid_minor", sa.Integer(), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_stripe_checkout_credits_user_id_users"),
        sa.UniqueConstraint("stripe_session_id", name="uq_stripe_checkout_credits_session"),
    )
    op.create_index("ix_stripe_checkout_credits_session", "stripe_checkout_credits", ["stripe_session_id"], unique=False)
    op.create_index("ix_stripe_checkout_credits_user_id", "stripe_checkout_credits", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_points_packages_package_code", table_name="points_packages")
    op.drop_table("points_packages")

    op.drop_index("ix_stripe_checkout_credits_user_id", table_name="stripe_checkout_credits")
    op.drop_index("ix_stripe_checkout_credits_session", table_name="stripe_checkout_credits")
    op.drop_table("stripe_checkout_credits")

    op.drop_index("ix_points_ledger_entries_created_at", table_name="points_ledger_entries")
    op.drop_index("ix_points_ledger_entries_user_id", table_name="points_ledger_entries")
    op.drop_table("points_ledger_entries")

    op.drop_index("ix_points_wallets_user_id", table_name="points_wallets")
    op.drop_table("points_wallets")
