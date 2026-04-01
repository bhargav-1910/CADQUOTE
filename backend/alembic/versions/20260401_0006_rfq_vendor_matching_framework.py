"""add rfq-commercial schema and vendor matching tables

Revision ID: 20260401_0006
Revises: 20260325_0005
Create Date: 2026-04-01 12:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260401_0006"
down_revision = "20260325_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vendors",
        sa.Column("id", sa.CHAR(length=32), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("quality_rating", sa.Float(), nullable=False, server_default=sa.text("4.0")),
        sa.Column("on_time_rating", sa.Float(), nullable=False, server_default=sa.text("4.0")),
        sa.Column("current_load_pct", sa.Float(), nullable=False, server_default=sa.text("50.0")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "vendor_machine_capabilities",
        sa.Column("id", sa.CHAR(length=32), nullable=False),
        sa.Column("vendor_id", sa.CHAR(length=32), nullable=False),
        sa.Column("machine_type", sa.String(length=50), nullable=False),
        sa.Column("envelope_x_mm", sa.Float(), nullable=False),
        sa.Column("envelope_y_mm", sa.Float(), nullable=False),
        sa.Column("envelope_z_mm", sa.Float(), nullable=False),
        sa.Column("machine_rate_override", sa.Numeric(10, 2), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_vendor_machine_capabilities_vendor_id"), "vendor_machine_capabilities", ["vendor_id"], unique=False)

    op.create_table(
        "vendor_material_expertise",
        sa.Column("id", sa.CHAR(length=32), nullable=False),
        sa.Column("vendor_id", sa.CHAR(length=32), nullable=False),
        sa.Column("material_category", sa.String(length=50), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_vendor_material_expertise_vendor_id"), "vendor_material_expertise", ["vendor_id"], unique=False)

    op.create_table(
        "vendor_certifications",
        sa.Column("id", sa.CHAR(length=32), nullable=False),
        sa.Column("vendor_id", sa.CHAR(length=32), nullable=False),
        sa.Column("certification_code", sa.String(length=50), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_vendor_certifications_vendor_id"), "vendor_certifications", ["vendor_id"], unique=False)

    op.add_column("quotes", sa.Column("rfq_number", sa.String(length=100), nullable=True))
    op.add_column("quotes", sa.Column("part_name", sa.String(length=200), nullable=True))
    op.add_column("quotes", sa.Column("part_number", sa.String(length=100), nullable=True))
    op.add_column("quotes", sa.Column("revision", sa.String(length=50), nullable=True))
    op.add_column("quotes", sa.Column("rfq_date", sa.DateTime(), nullable=True))
    op.add_column("quotes", sa.Column("quote_due_date", sa.DateTime(), nullable=True))
    op.add_column("quotes", sa.Column("annual_volume", sa.Integer(), nullable=True))
    op.add_column("quotes", sa.Column("batch_size", sa.Integer(), nullable=True))
    op.add_column("quotes", sa.Column("target_price", sa.Numeric(12, 2), nullable=True))
    op.add_column("quotes", sa.Column("application", sa.Text(), nullable=True))

    op.add_column("quotes", sa.Column("raw_form", sa.String(length=100), nullable=True))
    op.add_column("quotes", sa.Column("raw_size", sa.String(length=100), nullable=True))
    op.add_column("quotes", sa.Column("net_weight_kg", sa.Float(), nullable=True))
    op.add_column("quotes", sa.Column("raw_weight_kg", sa.Float(), nullable=True))
    op.add_column("quotes", sa.Column("buy_to_fly_ratio", sa.Float(), nullable=True))
    op.add_column("quotes", sa.Column("requested_surface_finish", sa.String(length=100), nullable=True))
    op.add_column("quotes", sa.Column("tolerance_notes", sa.String(length=100), nullable=True))
    op.add_column("quotes", sa.Column("complexity_level", sa.String(length=50), nullable=True))

    op.add_column("quotes", sa.Column("process_routing", sa.JSON(), nullable=True))

    op.add_column("quotes", sa.Column("matched_vendor_id", sa.CHAR(length=32), nullable=True))
    op.add_column("quotes", sa.Column("vendor_match_details", sa.JSON(), nullable=True))
    op.create_foreign_key(
        "fk_quotes_matched_vendor_id_vendors",
        "quotes",
        "vendors",
        ["matched_vendor_id"],
        ["id"],
    )

    op.add_column("quotes", sa.Column("price_validity", sa.String(length=100), nullable=True))
    op.add_column("quotes", sa.Column("gst", sa.String(length=50), nullable=True))
    op.add_column("quotes", sa.Column("delivery", sa.String(length=200), nullable=True))
    op.add_column("quotes", sa.Column("payment_terms", sa.String(length=200), nullable=True))
    op.add_column("quotes", sa.Column("incoterms", sa.String(length=50), nullable=True))
    op.add_column("quotes", sa.Column("tooling_ownership", sa.String(length=200), nullable=True))
    op.add_column("quotes", sa.Column("packaging", sa.String(length=200), nullable=True))
    op.add_column("quotes", sa.Column("terms_and_conditions", sa.Text(), nullable=True))
    op.add_column("quotes", sa.Column("dfm_exceptions", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("quotes", "dfm_exceptions")
    op.drop_column("quotes", "terms_and_conditions")
    op.drop_column("quotes", "packaging")
    op.drop_column("quotes", "tooling_ownership")
    op.drop_column("quotes", "incoterms")
    op.drop_column("quotes", "payment_terms")
    op.drop_column("quotes", "delivery")
    op.drop_column("quotes", "gst")
    op.drop_column("quotes", "price_validity")

    op.drop_constraint("fk_quotes_matched_vendor_id_vendors", "quotes", type_="foreignkey")
    op.drop_column("quotes", "vendor_match_details")
    op.drop_column("quotes", "matched_vendor_id")

    op.drop_column("quotes", "process_routing")

    op.drop_column("quotes", "complexity_level")
    op.drop_column("quotes", "tolerance_notes")
    op.drop_column("quotes", "requested_surface_finish")
    op.drop_column("quotes", "buy_to_fly_ratio")
    op.drop_column("quotes", "raw_weight_kg")
    op.drop_column("quotes", "net_weight_kg")
    op.drop_column("quotes", "raw_size")
    op.drop_column("quotes", "raw_form")

    op.drop_column("quotes", "application")
    op.drop_column("quotes", "target_price")
    op.drop_column("quotes", "batch_size")
    op.drop_column("quotes", "annual_volume")
    op.drop_column("quotes", "quote_due_date")
    op.drop_column("quotes", "rfq_date")
    op.drop_column("quotes", "revision")
    op.drop_column("quotes", "part_number")
    op.drop_column("quotes", "part_name")
    op.drop_column("quotes", "rfq_number")

    op.drop_index(op.f("ix_vendor_certifications_vendor_id"), table_name="vendor_certifications")
    op.drop_table("vendor_certifications")

    op.drop_index(op.f("ix_vendor_material_expertise_vendor_id"), table_name="vendor_material_expertise")
    op.drop_table("vendor_material_expertise")

    op.drop_index(op.f("ix_vendor_machine_capabilities_vendor_id"), table_name="vendor_machine_capabilities")
    op.drop_table("vendor_machine_capabilities")

    op.drop_table("vendors")
