"""grant +200 starting bonus points to all existing users

Revision ID: 20260325_0005
Revises: 20260325_0004
Create Date: 2026-03-25 02:10:00.000000

"""
from __future__ import annotations

import uuid

from alembic import op
import sqlalchemy as sa


revision = "20260325_0005"
down_revision = "20260325_0004"
branch_labels = None
depends_on = None


BONUS_POINTS = 200


def _new_id(bind) -> str | uuid.UUID:
    return uuid.uuid4() if bind.dialect.name == "postgresql" else uuid.uuid4().hex


def upgrade() -> None:
    bind = op.get_bind()

    users = bind.execute(sa.text("SELECT id FROM users")).fetchall()
    for row in users:
        user_id = row[0]

        wallet_row = bind.execute(
            sa.text("SELECT id, balance_points FROM points_wallets WHERE user_id = :user_id"),
            {"user_id": user_id},
        ).fetchone()

        if wallet_row is None:
            wallet_id = _new_id(bind)
            new_balance = BONUS_POINTS
            bind.execute(
                sa.text(
                    """
                    INSERT INTO points_wallets (id, user_id, balance_points, created_at, updated_at)
                    VALUES (:id, :user_id, :balance_points, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """
                ),
                {
                    "id": wallet_id,
                    "user_id": user_id,
                    "balance_points": new_balance,
                },
            )
        else:
            new_balance = int(wallet_row[1]) + BONUS_POINTS
            bind.execute(
                sa.text(
                    """
                    UPDATE points_wallets
                    SET balance_points = :balance_points, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = :user_id
                    """
                ),
                {
                    "balance_points": new_balance,
                    "user_id": user_id,
                },
            )

        bind.execute(
            sa.text(
                """
                INSERT INTO points_ledger_entries (
                    id,
                    user_id,
                    delta_points,
                    balance_after,
                    action,
                    description,
                    reference_type,
                    reference_id,
                    metadata_json,
                    created_at
                )
                VALUES (
                    :id,
                    :user_id,
                    :delta_points,
                    :balance_after,
                    :action,
                    :description,
                    :reference_type,
                    :reference_id,
                    :metadata_json,
                    CURRENT_TIMESTAMP
                )
                """
            ),
            {
                "id": _new_id(bind),
                "user_id": user_id,
                "delta_points": BONUS_POINTS,
                "balance_after": new_balance,
                "action": "starting_bonus",
                "description": "Starting bonus points rollout",
                "reference_type": "user",
                "reference_id": str(user_id),
                "metadata_json": '{"source":"migration_20260325_0005"}',
            },
        )


def downgrade() -> None:
    bind = op.get_bind()

    rows = bind.execute(
        sa.text(
            """
            SELECT user_id
            FROM points_ledger_entries
            WHERE action = 'starting_bonus'
              AND description = 'Starting bonus points rollout'
            """
        )
    ).fetchall()

    for row in rows:
        user_id = row[0]
        wallet_row = bind.execute(
            sa.text("SELECT balance_points FROM points_wallets WHERE user_id = :user_id"),
            {"user_id": user_id},
        ).fetchone()
        if wallet_row is not None:
            updated_balance = max(int(wallet_row[0]) - BONUS_POINTS, 0)
            bind.execute(
                sa.text(
                    """
                    UPDATE points_wallets
                    SET balance_points = :balance_points, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = :user_id
                    """
                ),
                {
                    "balance_points": updated_balance,
                    "user_id": user_id,
                },
            )

    bind.execute(
        sa.text(
            """
            DELETE FROM points_ledger_entries
            WHERE action = 'starting_bonus'
              AND description = 'Starting bonus points rollout'
            """
        )
    )
