"""Per-user pricing catalog: ownership columns and per-owner name uniqueness.

Every shop tunes its own rates, so materials / finishes / inspection levels /
machine rates become owned rows. NULL user_id keeps its meaning as "system
default", so all existing rows stay exactly as they are and every current
quote keeps resolving.

Revision ID: 20260730_0023
Revises: 20260730_0022
Create Date: 2026-07-30
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260730_0023"
down_revision = "20260730_0022"
branch_labels = None
depends_on = None

_TABLES = ("materials", "surface_finishes", "inspection_levels", "machine_rates")


def _uuid_col_type(bind) -> sa.types.TypeEngine:
    if bind.dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.String(length=32)


def _name_uniques(inspector, table: str) -> tuple[list[str], list[str]]:
    """Existing single-column UNIQUE(name) objects, split by kind.

    Postgres backs a unique *constraint* with an index of the same name, so it
    shows up in both inspector views. Dropping it twice aborts the migration's
    transaction, so the index list excludes anything already named as a
    constraint, and each kind is dropped with its matching operation.
    """
    constraints = [
        c["name"]
        for c in inspector.get_unique_constraints(table)
        if c.get("column_names") == ["name"] and c.get("name")
    ]
    indexes = [
        i["name"]
        for i in inspector.get_indexes(table)
        if i.get("unique")
        and i.get("column_names") == ["name"]
        and i.get("name")
        and i["name"] not in constraints
    ]
    return constraints, indexes


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    uuid_col_type = _uuid_col_type(bind)
    is_sqlite = bind.dialect.name == "sqlite"

    for table in _TABLES:
        columns = {col["name"] for col in inspector.get_columns(table)}

        if "user_id" not in columns:
            op.add_column(table, sa.Column("user_id", uuid_col_type, nullable=True))
            op.create_foreign_key(
                f"fk_{table}_user_id_users", table, "users", ["user_id"], ["id"]
            )
            op.create_index(f"ix_{table}_user_id", table, ["user_id"])
        if "source_id" not in columns:
            op.add_column(table, sa.Column("source_id", uuid_col_type, nullable=True))
            op.create_index(f"ix_{table}_source_id", table, ["source_id"])

        # Names are only unique per owner now: two shops may both keep a row
        # called "Aluminium 6061-T6" with different costs.
        constraints, indexes = _name_uniques(inspector, table)
        constraint_name = f"uq_{table}_user_name"

        if is_sqlite:
            # SQLite cannot drop an inline UNIQUE; batch mode rebuilds the
            # table, and the inline constraint simply does not survive the copy.
            with op.batch_alter_table(table, recreate="always") as batch:
                for name in constraints:
                    batch.drop_constraint(name, type_="unique")
                batch.create_unique_constraint(constraint_name, ["user_id", "name"])
            for name in indexes:
                op.drop_index(name, table_name=table)
        else:
            for name in constraints:
                op.drop_constraint(name, table, type_="unique")
            for name in indexes:
                op.drop_index(name, table_name=table)
            existing = {c["name"] for c in inspector.get_unique_constraints(table)}
            if constraint_name not in existing:
                op.create_unique_constraint(constraint_name, table, ["user_id", "name"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    is_sqlite = bind.dialect.name == "sqlite"

    for table in _TABLES:
        constraint_name = f"uq_{table}_user_name"

        if is_sqlite:
            with op.batch_alter_table(table, recreate="always") as batch:
                try:
                    batch.drop_constraint(constraint_name, type_="unique")
                except Exception:  # noqa: BLE001
                    pass
                batch.create_unique_constraint(f"uq_{table}_name", ["name"])
        else:
            op.drop_constraint(constraint_name, table, type_="unique")
            op.create_unique_constraint(f"uq_{table}_name", table, ["name"])

        indexes = {index["name"] for index in inspector.get_indexes(table)}
        if f"ix_{table}_source_id" in indexes:
            op.drop_index(f"ix_{table}_source_id", table_name=table)
        if f"ix_{table}_user_id" in indexes:
            op.drop_index(f"ix_{table}_user_id", table_name=table)

        columns = {col["name"] for col in inspector.get_columns(table)}
        if "source_id" in columns:
            op.drop_column(table, "source_id")
        if "user_id" in columns:
            try:
                op.drop_constraint(f"fk_{table}_user_id_users", table, type_="foreignkey")
            except Exception:  # noqa: BLE001 - SQLite has no named FK to drop
                pass
            op.drop_column(table, "user_id")
