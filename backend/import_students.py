#!/usr/bin/env python
"""
import_students.py — Provision student accounts from a CSV file.

Usage (from the backend/ directory):
    python import_students.py [--csv path/to/file.csv] [--dry-run]

Rules:
  - Reads roll_number and name from the CSV.
  - For each new row: hashes the roll_number as the initial password (Argon2),
    sets must_change_password = True, inserts into the students table.
  - If a roll_number already exists in DB, it is SKIPPED — no password reset.
  - Duplicate roll_numbers within the CSV itself are reported and skipped.
  - Rows missing roll_number or name are reported and skipped.
  - --dry-run prints what would be imported without writing to DB.

NEVER logs passwords or password hashes.
"""

import argparse
import asyncio
import csv
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the backend directory (parent of this script)
load_dotenv(Path(__file__).parent / ".env")

from app.auth import hash_password  # noqa: E402
from app.database import AsyncSessionLocal, create_tables  # noqa: E402
from app.models import Student  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)-8s %(message)s",
)
logger = logging.getLogger(__name__)


def load_csv(path: Path) -> list[dict]:
    """Read and validate CSV rows. Returns list of {roll_number, name} dicts."""
    rows: list[dict] = []
    seen_rolls: set[str] = set()
    errors = 0

    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None or "roll_number" not in reader.fieldnames:
            logger.error("CSV is missing the 'roll_number' column.")
            sys.exit(1)
        if "name" not in (reader.fieldnames or []):
            logger.error("CSV is missing the 'name' column.")
            sys.exit(1)

        for lineno, row in enumerate(reader, start=2):
            roll = (row.get("roll_number") or "").strip()
            name = (row.get("name") or "").strip()

            if not roll:
                logger.warning("Line %d: empty roll_number — skipped.", lineno)
                errors += 1
                continue

            if not name:
                logger.warning("Line %d: empty name for roll=%r — skipped.", lineno, roll)
                errors += 1
                continue

            if len(roll) > 50:
                logger.warning("Line %d: roll_number too long (>50 chars) — skipped.", lineno)
                errors += 1
                continue

            if len(name) > 200:
                logger.warning("Line %d: name too long (>200 chars) — truncated.", lineno)
                name = name[:200]

            if roll in seen_rolls:
                logger.warning("Line %d: duplicate roll_number %r in CSV — skipped.", lineno, roll)
                errors += 1
                continue

            seen_rolls.add(roll)
            rows.append({"roll_number": roll, "name": name})

    logger.info("CSV loaded: %d valid rows, %d skipped/errored.", len(rows), errors)
    return rows


async def import_students(rows: list[dict], dry_run: bool = False) -> None:
    from sqlalchemy import select

    await create_tables()

    inserted = 0
    skipped = 0

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Student.roll_number))
        existing_rolls = set(result.scalars().all())

        for row in rows:
            roll = row["roll_number"]
            name = row["name"]

            if roll in existing_rolls:
                logger.info("SKIP  roll=%-20s (already exists, password preserved)", roll)
                skipped += 1
                continue

            if dry_run:
                logger.info("DRY   roll=%-20s name=%r — would insert", roll, name)
                inserted += 1
                continue

            # Hash the roll_number as the initial password — NEVER log the hash
            student = Student(
                roll_number=roll,
                name=name,
                password_hash=hash_password(roll),   # initial password = roll number
                must_change_password=True,
            )
            db.add(student)
            inserted += 1
            logger.info("INSERT roll=%-20s name=%r", roll, name)

        if not dry_run and inserted > 0:
            await db.commit()

    action = "Would insert" if dry_run else "Inserted"
    logger.info(
        "Done. %s: %d  |  Skipped (already existed): %d",
        action,
        inserted,
        skipped,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Import students from CSV into Neon PostgreSQL.")
    parser.add_argument(
        "--csv",
        type=Path,
        default=Path(__file__).parent / "data" / "students.csv",
        help="Path to students CSV (default: data/students.csv)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and report without writing to the database.",
    )
    args = parser.parse_args()

    if not args.csv.exists():
        logger.error("CSV file not found: %s", args.csv)
        sys.exit(1)

    rows = load_csv(args.csv)

    if not rows:
        logger.warning("No valid rows to import.")
        sys.exit(0)

    if args.dry_run:
        logger.info("Dry-run mode — no data will be written.")

    asyncio.run(import_students(rows, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
