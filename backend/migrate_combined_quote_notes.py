"""One-time migration utility to enrich legacy combined quote notes metadata.

Legacy combined quote notes used this line format inside [COMBINED_FILES] block:
    filename|qty|line_total

New format required for full bulk-edit restoration:
    cad_file_id|filename|qty|line_total|material_id|surface_finish_id|inspection_level_id

This script attempts to resolve cad_file_id by matching filename to the quote owner's CAD files.
It runs in dry-run mode by default. Use --apply to persist updates.
"""

from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Iterable
from uuid import UUID

from sqlalchemy import select

from app.core.database import async_session_maker
from app.models.models import CADFile, Quote

START_TAG = "[COMBINED_FILES]"
END_TAG = "[/COMBINED_FILES]"


@dataclass
class OldCombinedLine:
    filename: str
    quantity: int
    line_total: Decimal


@dataclass
class MigrationResult:
    scanned: int = 0
    eligible: int = 0
    updated: int = 0
    skipped_no_block: int = 0
    skipped_already_new: int = 0
    skipped_unresolved: int = 0
    skipped_invalid: int = 0


def _extract_combined_block(notes: str | None) -> tuple[int, int, list[str]] | None:
    if not notes:
        return None

    start = notes.find(START_TAG)
    end = notes.find(END_TAG)
    if start == -1 or end == -1 or end <= start:
        return None

    block = notes[start + len(START_TAG) : end].strip()
    lines = [line.strip() for line in block.splitlines() if line.strip()]
    return start, end, lines


def _parse_old_line(line: str) -> OldCombinedLine | None:
    parts = [part.strip() for part in line.split("|")]

    # New format or unknown format, not a legacy line.
    if len(parts) != 3:
        return None

    filename, qty_raw, total_raw = parts
    if not filename:
        return None

    try:
        qty = int(qty_raw)
        total = Decimal(total_raw)
    except (ValueError, InvalidOperation):
        return None

    return OldCombinedLine(filename=filename, quantity=max(qty, 1), line_total=total)


def _looks_new_format(lines: Iterable[str]) -> bool:
    line_list = list(lines)
    if not line_list:
        return False

    # New format has at least 4 parts and first part is UUID (cad_file_id).
    for line in line_list:
        parts = [part.strip() for part in line.split("|")]
        if len(parts) < 4:
            return False
        try:
            UUID(parts[0])
        except Exception:
            return False
    return True


def _build_new_block(lines: list[str]) -> str:
    return START_TAG + "\n" + "\n".join(lines) + "\n" + END_TAG


async def _resolve_file_ids_for_quote(
    quote: Quote,
    old_lines: list[OldCombinedLine],
) -> tuple[list[str] | None, list[str]]:
    warnings: list[str] = []
    filenames = sorted({line.filename for line in old_lines})

    async with async_session_maker() as db:
        stmt = (
            select(CADFile)
            .where(CADFile.user_id == quote.user_id, CADFile.original_filename.in_(filenames))
            .order_by(CADFile.created_at.desc())
        )
        result = await db.execute(stmt)
        candidates = result.scalars().all()

    by_name: dict[str, list[CADFile]] = {}
    for cad_file in candidates:
        by_name.setdefault(cad_file.original_filename, []).append(cad_file)

    used_ids: set[str] = set()
    resolved_lines: list[str] = []

    for old in old_lines:
        candidate_list = by_name.get(old.filename, [])
        if not candidate_list:
            warnings.append(f"No CAD file found for filename '{old.filename}'")
            return None, warnings

        # Prefer most recent file uploaded before quote creation and not yet used.
        selected: CADFile | None = None
        for candidate in candidate_list:
            candidate_id = str(candidate.id)
            if candidate_id in used_ids:
                continue
            if candidate.created_at <= quote.created_at:
                selected = candidate
                break

        # Fallback: any unused candidate.
        if selected is None:
            for candidate in candidate_list:
                candidate_id = str(candidate.id)
                if candidate_id not in used_ids:
                    selected = candidate
                    warnings.append(
                        f"Used CAD file '{candidate.id}' for '{old.filename}' even though it was uploaded after quote timestamp"
                    )
                    break

        # Last fallback: reuse first candidate if duplicates exceed available files.
        if selected is None:
            selected = candidate_list[0]
            warnings.append(
                f"Reused CAD file '{selected.id}' for duplicate filename '{old.filename}'"
            )

        used_ids.add(str(selected.id))

        safe_name = old.filename.replace("|", "/")
        resolved_lines.append(
            "|".join(
                [
                    str(selected.id),
                    safe_name,
                    str(old.quantity),
                    f"{old.line_total:.2f}",
                    str(quote.material_id),
                    str(quote.surface_finish_id),
                    str(quote.inspection_level_id),
                ]
            )
        )

    return resolved_lines, warnings


async def migrate(*, apply_changes: bool, quote_id: str | None, limit: int | None) -> MigrationResult:
    summary = MigrationResult()

    async with async_session_maker() as db:
        stmt = select(Quote).where(Quote.notes.is_not(None)).order_by(Quote.created_at.asc())
        if quote_id:
            stmt = stmt.where(Quote.id == UUID(quote_id))
        if limit and limit > 0:
            stmt = stmt.limit(limit)

        result = await db.execute(stmt)
        quotes = result.scalars().all()

        for quote in quotes:
            summary.scanned += 1
            extracted = _extract_combined_block(quote.notes)
            if not extracted:
                summary.skipped_no_block += 1
                continue

            start, end, block_lines = extracted
            summary.eligible += 1

            if _looks_new_format(block_lines):
                summary.skipped_already_new += 1
                continue

            parsed_old_lines: list[OldCombinedLine] = []
            invalid_line = False
            for line in block_lines:
                parsed = _parse_old_line(line)
                if not parsed:
                    invalid_line = True
                    break
                parsed_old_lines.append(parsed)

            if invalid_line or not parsed_old_lines:
                summary.skipped_invalid += 1
                print(f"SKIP {quote.quote_number}: unsupported/invalid combined block format")
                continue

            new_lines, warnings = await _resolve_file_ids_for_quote(quote, parsed_old_lines)
            if new_lines is None:
                summary.skipped_unresolved += 1
                print(f"SKIP {quote.quote_number}: could not resolve all CAD files")
                for warning in warnings:
                    print(f"  - {warning}")
                continue

            new_block = _build_new_block(new_lines)
            old_notes = quote.notes or ""
            replacement = old_notes[:start] + new_block + old_notes[end + len(END_TAG) :]

            print(f"{'APPLY' if apply_changes else 'DRY-RUN'} {quote.quote_number}: migrated {len(parsed_old_lines)} line item(s)")
            for warning in warnings:
                print(f"  - {warning}")

            if apply_changes:
                quote.notes = replacement
                summary.updated += 1

        if apply_changes:
            await db.commit()
        else:
            await db.rollback()

    return summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Migrate legacy combined quote notes to include CAD/config metadata for bulk-edit restore"
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist changes. Without this flag, script runs as dry-run only.",
    )
    parser.add_argument(
        "--quote-id",
        help="Optional specific quote UUID to migrate",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional max number of quotes to scan",
    )
    return parser


async def _main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    summary = await migrate(
        apply_changes=args.apply,
        quote_id=args.quote_id,
        limit=args.limit,
    )

    print("\nMigration Summary")
    print("-----------------")
    print(f"Scanned quotes: {summary.scanned}")
    print(f"Eligible (has combined block): {summary.eligible}")
    print(f"Updated: {summary.updated}")
    print(f"Skipped (no combined block): {summary.skipped_no_block}")
    print(f"Skipped (already new format): {summary.skipped_already_new}")
    print(f"Skipped (unresolved files): {summary.skipped_unresolved}")
    print(f"Skipped (invalid format): {summary.skipped_invalid}")
    print(f"Mode: {'APPLY' if args.apply else 'DRY-RUN'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
