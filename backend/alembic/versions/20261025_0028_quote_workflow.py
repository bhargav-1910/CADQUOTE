"""Quote workflow: versions, manual line items, templates, drawing attachments.

Revision ID: 20261025_0028
Revises: 20261024_0027
Create Date: 2026-10-25
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261025_0028"
down_revision = "20261024_0027"
branch_labels = None
depends_on = None


def _uuid(bind):
    return postgresql.UUID(as_uuid=True) if bind.dialect.name == "postgresql" else sa.CHAR(32)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    uuid_type = _uuid(bind)

    columns = {col["name"] for col in inspector.get_columns("quotes")}
    new_columns = [
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("root_quote_id", uuid_type, nullable=True),
        sa.Column("superseded_at", sa.DateTime(), nullable=True),
        sa.Column("customer_viewed_at", sa.DateTime(), nullable=True),
        sa.Column("line_items", sa.JSON(), nullable=True),
        sa.Column("engine_total", sa.Numeric(14, 2), nullable=True),
    ]
    for column in new_columns:
        if column.name not in columns:
            op.add_column("quotes", column)
    indexes = {ix["name"] for ix in inspector.get_indexes("quotes")}
    if "ix_quotes_root_quote_id" not in indexes:
        op.create_index("ix_quotes_root_quote_id", "quotes", ["root_quote_id"])
    # Versions append "-v2" etc. to the original number.
    with op.batch_alter_table("quotes") as batch:
        batch.alter_column("quote_number", type_=sa.String(32), existing_type=sa.String(20), existing_nullable=False)

    tables = set(inspector.get_table_names())
    if "quote_templates" not in tables:
        op.create_table(
            "quote_templates",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("user_id", uuid_type, sa.ForeignKey("users.id"), nullable=False),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("payload", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_quote_templates_user_id", "quote_templates", ["user_id"])
    if "quote_attachments" not in tables:
        op.create_table(
            "quote_attachments",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("user_id", uuid_type, sa.ForeignKey("users.id"), nullable=False),
            sa.Column("quote_root_id", uuid_type, nullable=False),
            sa.Column("original_filename", sa.String(255), nullable=False),
            sa.Column("file_path", sa.String(500), nullable=False),
            sa.Column("content_type", sa.String(100), nullable=False),
            sa.Column("file_size", sa.Integer(), nullable=False),
            sa.Column("share_with_customer", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_quote_attachments_user_id", "quote_attachments", ["user_id"])
        op.create_index("ix_quote_attachments_quote_root_id", "quote_attachments", ["quote_root_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    for table in ("quote_attachments", "quote_templates"):
        if table in tables:
            op.drop_table(table)
    columns = {col["name"] for col in inspector.get_columns("quotes")}
    indexes = {ix["name"] for ix in inspector.get_indexes("quotes")}
    if "ix_quotes_root_quote_id" in indexes:
        op.drop_index("ix_quotes_root_quote_id", table_name="quotes")
    for name in ("engine_total", "line_items", "customer_viewed_at", "superseded_at", "root_quote_id", "version"):
        if name in columns:
            op.drop_column("quotes", name)
