"""Quote title: a user-editable name shown next to the quote number.

Revision ID: 20261025_0029
Revises: 20261025_0028
Create Date: 2026-10-25
"""
import sqlalchemy as sa
from alembic import op

revision = "20261025_0029"
down_revision = "20261025_0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {col["name"] for col in sa.inspect(op.get_bind()).get_columns("quotes")}
    if "title" not in columns:
        op.add_column("quotes", sa.Column("title", sa.String(200), nullable=True))


def downgrade() -> None:
    columns = {col["name"] for col in sa.inspect(op.get_bind()).get_columns("quotes")}
    if "title" in columns:
        op.drop_column("quotes", "title")
