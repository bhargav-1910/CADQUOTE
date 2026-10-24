"""Add security_events (persisted audit trail for the admin page).

Revision ID: 20261024_0027
Revises: 20261020_0026
Create Date: 2026-10-24
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261024_0027"
down_revision = "20261020_0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "security_events" in inspector.get_table_names():
        return

    uuid_type = postgresql.UUID(as_uuid=True) if bind.dialect.name == "postgresql" else sa.CHAR(32)
    op.create_table(
        "security_events",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("event", sa.String(80), nullable=False),
        sa.Column("outcome", sa.String(16), nullable=False),
        sa.Column("user_id", uuid_type, nullable=True),
        sa.Column("email", sa.String(200), nullable=True),
        sa.Column("ip", sa.String(64), nullable=True),
        sa.Column("path", sa.String(300), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
    )
    op.create_index("ix_security_events_created_at", "security_events", ["created_at"])
    op.create_index("ix_security_events_event", "security_events", ["event"])
    op.create_index("ix_security_events_outcome", "security_events", ["outcome"])
    op.create_index("ix_security_events_user_id", "security_events", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "security_events" in inspector.get_table_names():
        op.drop_table("security_events")
