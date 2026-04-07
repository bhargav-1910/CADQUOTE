"""repair partial schema and bootstrap missing core tables

Revision ID: 20260407_0007
Revises: 20260401_0006
Create Date: 2026-04-07 13:40:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260407_0007"
down_revision = "20260401_0006"
branch_labels = None
depends_on = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _column_type_name(inspector: sa.Inspector, table_name: str, column_name: str) -> str | None:
    for col in inspector.get_columns(table_name):
        if col["name"] == column_name:
            return str(col["type"]).lower()
    return None


def _maybe_promote_vendor_ids_to_uuid(inspector: sa.Inspector) -> None:
    if not _has_table(inspector, "vendors"):
        return

    vendor_id_type = _column_type_name(inspector, "vendors", "id") or ""
    if "uuid" in vendor_id_type:
        return

    # Legacy migration created vendor IDs as character types. Normalize to UUID.
    op.execute("ALTER TABLE vendor_machine_capabilities DROP CONSTRAINT IF EXISTS vendor_machine_capabilities_vendor_id_fkey")
    op.execute("ALTER TABLE vendor_material_expertise DROP CONSTRAINT IF EXISTS vendor_material_expertise_vendor_id_fkey")
    op.execute("ALTER TABLE vendor_certifications DROP CONSTRAINT IF EXISTS vendor_certifications_vendor_id_fkey")

    if _has_table(inspector, "quotes"):
        op.execute("ALTER TABLE quotes DROP CONSTRAINT IF EXISTS fk_quotes_matched_vendor_id_vendors")
        op.execute("ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_matched_vendor_id_fkey")
        op.execute("ALTER TABLE quotes ALTER COLUMN matched_vendor_id TYPE UUID USING matched_vendor_id::uuid")

    op.execute("ALTER TABLE vendors ALTER COLUMN id TYPE UUID USING id::uuid")
    op.execute("ALTER TABLE vendor_machine_capabilities ALTER COLUMN vendor_id TYPE UUID USING vendor_id::uuid")
    op.execute("ALTER TABLE vendor_material_expertise ALTER COLUMN vendor_id TYPE UUID USING vendor_id::uuid")
    op.execute("ALTER TABLE vendor_certifications ALTER COLUMN vendor_id TYPE UUID USING vendor_id::uuid")

    op.execute(
        "ALTER TABLE vendor_machine_capabilities "
        "ADD CONSTRAINT vendor_machine_capabilities_vendor_id_fkey "
        "FOREIGN KEY (vendor_id) REFERENCES vendors(id)"
    )
    op.execute(
        "ALTER TABLE vendor_material_expertise "
        "ADD CONSTRAINT vendor_material_expertise_vendor_id_fkey "
        "FOREIGN KEY (vendor_id) REFERENCES vendors(id)"
    )
    op.execute(
        "ALTER TABLE vendor_certifications "
        "ADD CONSTRAINT vendor_certifications_vendor_id_fkey "
        "FOREIGN KEY (vendor_id) REFERENCES vendors(id)"
    )
    if _has_table(inspector, "quotes"):
        op.execute(
            "ALTER TABLE quotes "
            "ADD CONSTRAINT fk_quotes_matched_vendor_id_vendors "
            "FOREIGN KEY (matched_vendor_id) REFERENCES vendors(id)"
        )


def _create_missing_tables_from_models(bind) -> None:
    # Import models so SQLAlchemy metadata contains all tables and enums.
    from app.models import models as _models  # noqa: F401
    from app.core.database import Base

    Base.metadata.create_all(bind=bind, checkfirst=True)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    _maybe_promote_vendor_ids_to_uuid(inspector)
    _create_missing_tables_from_models(bind)


def downgrade() -> None:
    # Intentionally no-op: this is a forward-fix migration for broken environments.
    pass
