"""Widen columns that now hold AES-GCM ciphertext.

Encryption is opt-in (FIELD_ENCRYPTION_KEY): with no key set the columns keep
holding plaintext and only the width changes, so this is safe to apply ahead
of enabling it. Existing plaintext rows stay readable either way — the
decrypt path passes through anything lacking the "enc:v1:" marker.

Revision ID: 20260730_0024
Revises: 20260730_0023
Create Date: 2026-07-30
"""
import sqlalchemy as sa
from alembic import op

revision = "20260730_0024"
down_revision = "20260730_0023"
branch_labels = None
depends_on = None

# (table, column, encrypted width, original width)
_COLUMNS = (
    ("users", "gstin", 255, 20),
    ("customers", "gstin", 255, 20),
    ("customers", "phone", 255, 30),
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        # SQLite ignores VARCHAR length, so there is nothing to widen.
        return
    for table, column, width, _original in _COLUMNS:
        op.alter_column(
            table, column,
            existing_type=sa.String(length=_original),
            type_=sa.String(length=width),
            existing_nullable=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        return
    # Narrowing truncates ciphertext irrecoverably, so refuse when any row
    # still holds an encrypted value.
    for table, column, width, original in _COLUMNS:
        encrypted = bind.execute(
            sa.text(f"SELECT count(*) FROM {table} WHERE {column} LIKE 'enc:v1:%'")
        ).scalar()
        if encrypted:
            raise RuntimeError(
                f"{table}.{column} holds {encrypted} encrypted value(s). Decrypt them "
                "before downgrading or they will be truncated and lost."
            )
        op.alter_column(
            table, column,
            existing_type=sa.String(length=width),
            type_=sa.String(length=original),
            existing_nullable=True,
        )
