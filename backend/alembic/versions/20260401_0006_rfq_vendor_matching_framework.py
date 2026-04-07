"""add rfq-commercial schema and vendor matching tables

Revision ID: 20260401_0006
Revises: 20260325_0005
Create Date: 2026-04-01 12:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260401_0006"
down_revision = "20260325_0005"
branch_labels = None
depends_on = None



def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    columns = [col["name"] for col in inspector.get_columns(table_name)]
    return column_name in columns


def _uuid_col_type(bind) -> sa.types.TypeEngine:
    if bind.dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.String(length=32)


def _add_column_if_missing(inspector: sa.Inspector, table_name: str, column: sa.Column) -> None:
    if _has_table(inspector, table_name) and not _has_column(inspector, table_name, column.name):
        op.add_column(table_name, column)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    uuid_col_type = _uuid_col_type(bind)

    if not _has_table(inspector, "vendors"):
        op.create_table(
            "vendors",
            sa.Column("id", uuid_col_type, nullable=False),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("quality_rating", sa.Float(), nullable=False, server_default=sa.text("4.0")),
            sa.Column("on_time_rating", sa.Float(), nullable=False, server_default=sa.text("4.0")),
            sa.Column("current_load_pct", sa.Float(), nullable=False, server_default=sa.text("50.0")),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name"),
        )

    inspector = sa.inspect(bind)
    if not _has_table(inspector, "vendor_machine_capabilities"):
        op.create_table(
            "vendor_machine_capabilities",
            sa.Column("id", uuid_col_type, nullable=False),
            sa.Column("vendor_id", uuid_col_type, nullable=False),
            sa.Column("machine_type", sa.String(length=50), nullable=False),
            sa.Column("envelope_x_mm", sa.Float(), nullable=False),
            sa.Column("envelope_y_mm", sa.Float(), nullable=False),
            sa.Column("envelope_z_mm", sa.Float(), nullable=False),
            sa.Column("machine_rate_override", sa.Numeric(10, 2), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_vendor_machine_capabilities_vendor_id"), "vendor_machine_capabilities", ["vendor_id"], unique=False)

    inspector = sa.inspect(bind)
    if not _has_table(inspector, "vendor_material_expertise"):
        op.create_table(
            "vendor_material_expertise",
            sa.Column("id", uuid_col_type, nullable=False),
            sa.Column("vendor_id", uuid_col_type, nullable=False),
            sa.Column("material_category", sa.String(length=50), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_vendor_material_expertise_vendor_id"), "vendor_material_expertise", ["vendor_id"], unique=False)

    inspector = sa.inspect(bind)
    if not _has_table(inspector, "vendor_certifications"):
        op.create_table(
            "vendor_certifications",
            sa.Column("id", uuid_col_type, nullable=False),
            sa.Column("vendor_id", uuid_col_type, nullable=False),
            sa.Column("certification_code", sa.String(length=50), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_vendor_certifications_vendor_id"), "vendor_certifications", ["vendor_id"], unique=False)

    inspector = sa.inspect(bind)
    _add_column_if_missing(inspector, "quotes", sa.Column("rfq_number", sa.String(length=100), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("part_name", sa.String(length=200), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("part_number", sa.String(length=100), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("revision", sa.String(length=50), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("rfq_date", sa.DateTime(), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("quote_due_date", sa.DateTime(), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("annual_volume", sa.Integer(), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("batch_size", sa.Integer(), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("target_price", sa.Numeric(12, 2), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("application", sa.Text(), nullable=True))

    _add_column_if_missing(inspector, "quotes", sa.Column("raw_form", sa.String(length=100), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("raw_size", sa.String(length=100), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("net_weight_kg", sa.Float(), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("raw_weight_kg", sa.Float(), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("buy_to_fly_ratio", sa.Float(), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("requested_surface_finish", sa.String(length=100), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("tolerance_notes", sa.String(length=100), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("complexity_level", sa.String(length=50), nullable=True))

    _add_column_if_missing(inspector, "quotes", sa.Column("process_routing", sa.JSON(), nullable=True))

    _add_column_if_missing(inspector, "quotes", sa.Column("matched_vendor_id", uuid_col_type, nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("vendor_match_details", sa.JSON(), nullable=True))
    if _has_table(inspector, "quotes") and _has_column(inspector, "quotes", "matched_vendor_id"):
        op.create_foreign_key(
            "fk_quotes_matched_vendor_id_vendors",
            "quotes",
            "vendors",
            ["matched_vendor_id"],
            ["id"],
        )

    _add_column_if_missing(inspector, "quotes", sa.Column("price_validity", sa.String(length=100), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("gst", sa.String(length=50), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("delivery", sa.String(length=200), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("payment_terms", sa.String(length=200), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("incoterms", sa.String(length=50), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("tooling_ownership", sa.String(length=200), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("packaging", sa.String(length=200), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("terms_and_conditions", sa.Text(), nullable=True))
    _add_column_if_missing(inspector, "quotes", sa.Column("dfm_exceptions", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "quotes"):
        if _has_column(inspector, "quotes", "matched_vendor_id"):
            try:
                op.drop_constraint("fk_quotes_matched_vendor_id_vendors", "quotes", type_="foreignkey")
            except Exception:
                pass

        for col_name in [
            "dfm_exceptions",
            "terms_and_conditions",
            "packaging",
            "tooling_ownership",
            "incoterms",
            "payment_terms",
            "delivery",
            "gst",
            "price_validity",
            "vendor_match_details",
            "matched_vendor_id",
            "process_routing",
            "complexity_level",
            "tolerance_notes",
            "requested_surface_finish",
            "buy_to_fly_ratio",
            "raw_weight_kg",
            "net_weight_kg",
            "raw_size",
            "raw_form",
            "application",
            "target_price",
            "batch_size",
            "annual_volume",
            "quote_due_date",
            "rfq_date",
            "revision",
            "part_number",
            "part_name",
            "rfq_number",
        ]:
            if _has_column(inspector, "quotes", col_name):
                op.drop_column("quotes", col_name)

    inspector = sa.inspect(bind)
    if _has_table(inspector, "vendor_certifications"):
        try:
            op.drop_index(op.f("ix_vendor_certifications_vendor_id"), table_name="vendor_certifications")
        except Exception:
            pass
        op.drop_table("vendor_certifications")

    if _has_table(inspector, "vendor_material_expertise"):
        try:
            op.drop_index(op.f("ix_vendor_material_expertise_vendor_id"), table_name="vendor_material_expertise")
        except Exception:
            pass
        op.drop_table("vendor_material_expertise")

    if _has_table(inspector, "vendor_machine_capabilities"):
        try:
            op.drop_index(op.f("ix_vendor_machine_capabilities_vendor_id"), table_name="vendor_machine_capabilities")
        except Exception:
            pass
        op.drop_table("vendor_machine_capabilities")

    if _has_table(inspector, "vendors"):
        op.drop_table("vendors")
