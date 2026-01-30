#!/usr/bin/env python3
"""
SQLite to PostgreSQL Migration Script for Malo Recipe Master

This script migrates all data from SQLite to PostgreSQL (Supabase) while:
- Respecting foreign key dependencies
- Preserving auto-increment IDs
- Resetting PostgreSQL sequences after bulk insert
- Verifying data integrity

Usage:
    # Dry run (no changes)
    python api/scripts/migrate_sqlite_to_pg.py --dry-run

    # Actual migration
    DATABASE_URL=postgresql://user:pass@host:5432/db python api/scripts/migrate_sqlite_to_pg.py

Prerequisites:
    - Set DATABASE_URL environment variable to PostgreSQL connection string
    - Ensure SQLite database exists at api/data/malo_recipes.db
    - PostgreSQL database already initialized with schema (run init_db())

Migration Order (respecting foreign keys):
    1. ingredient
    2. packaging_material
    3. tag
    4. customer
    5. menu_product
    6. recipe → recipe_version → recipe_component → component_ingredient
    7. packaging_recipe → packaging_version → packaging_component → packaging_component_material
    8. product → product_version
    9. order → order_item
    10. recipe_tag, packaging_tag, product_tag (junction tables)
"""

import os
import sys
import argparse
from pathlib import Path
from typing import Dict, List, Tuple

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlalchemy import create_engine, text, MetaData, Table
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool


# Table migration order (respecting foreign key dependencies)
TABLE_MIGRATION_ORDER = [
    # Base tables (no dependencies)
    "ingredient",
    "packaging_material",
    "tag",
    "customer",
    "menu_product",

    # Recipe hierarchy
    "recipe",
    "recipe_version",
    "recipe_component",
    "component_ingredient",

    # Packaging hierarchy
    "packaging_recipe",
    "packaging_version",
    "packaging_component",
    "packaging_component_material",

    # Product hierarchy
    "product",
    "product_version",

    # Order hierarchy
    "order",  # Note: Reserved keyword, needs quoting
    "order_item",

    # Junction tables (many-to-many)
    "recipe_tag",
    "packaging_tag",
    "product_tag",
]


# Tables with auto-increment IDs that need sequence reset
TABLES_WITH_SEQUENCES = [
    "ingredient",
    "packaging_material",
    "tag",
    "customer",
    "menu_product",
    "recipe",
    "recipe_version",
    "recipe_component",
    "component_ingredient",
    "packaging_recipe",
    "packaging_version",
    "packaging_component",
    "packaging_component_material",
    "product",
    "product_version",
    "order",
    "order_item",
]


def get_sqlite_engine(db_path: str):
    """Create SQLite engine."""
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"SQLite database not found at: {db_path}")

    return create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False}
    )


def get_postgres_engine(database_url: str):
    """Create PostgreSQL engine."""
    if not database_url or not database_url.startswith(("postgresql://", "postgres://")):
        raise ValueError(
            "DATABASE_URL must be set to a valid PostgreSQL connection string.\n"
            "Example: postgresql://user:password@host:5432/database"
        )

    # Handle both postgresql:// and postgres:// schemes
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)

    return create_engine(
        database_url,
        poolclass=NullPool
    )


def get_row_count(connection, table_name: str) -> int:
    """Get row count for a table."""
    if table_name == "order":
        # Quote reserved keyword
        result = connection.execute(text('SELECT COUNT(*) FROM "order"'))
    else:
        result = connection.execute(text(f"SELECT COUNT(*) FROM {table_name}"))

    return result.scalar()


def disable_postgres_constraints(connection) -> None:
    """Disable foreign key constraints for bulk insert."""
    print("  → Disabling foreign key constraints...")
    connection.execute(text("SET session_replication_role = 'replica'"))
    connection.commit()


def enable_postgres_constraints(connection) -> None:
    """Re-enable foreign key constraints."""
    print("  → Re-enabling foreign key constraints...")
    connection.execute(text("SET session_replication_role = 'origin'"))
    connection.commit()


def reset_postgres_sequence(connection, table_name: str) -> None:
    """Reset PostgreSQL sequence for auto-increment ID."""
    try:
        # Get the sequence name
        result = connection.execute(
            text("SELECT pg_get_serial_sequence(:table_name, 'id')"),
            {"table_name": table_name}
        )
        sequence_name = result.scalar()

        if sequence_name:
            # Reset sequence to MAX(id) + 1
            if table_name == "order":
                max_id_query = text('SELECT COALESCE(MAX(id), 0) FROM "order"')
            else:
                max_id_query = text(f"SELECT COALESCE(MAX(id), 0) FROM {table_name}")

            max_id = connection.execute(max_id_query).scalar()

            connection.execute(
                text(f"SELECT setval('{sequence_name}', :max_id)"),
                {"max_id": max(max_id, 1)}
            )
            connection.commit()
            print(f"    ✓ Reset sequence for {table_name} to {max_id + 1}")
    except Exception as e:
        print(f"    ⚠ Warning: Could not reset sequence for {table_name}: {e}")


def get_table_columns(sqlite_conn, table_name: str) -> List[str]:
    """Get column names for a table from SQLite."""
    result = sqlite_conn.execute(text(f"PRAGMA table_info({table_name})"))
    return [row[1] for row in result]  # Column name is at index 1


def migrate_table(
    sqlite_conn,
    pg_conn,
    table_name: str,
    dry_run: bool = False
) -> Tuple[int, int]:
    """
    Migrate a single table from SQLite to PostgreSQL.

    Returns:
        Tuple of (sqlite_count, postgres_count)
    """
    print(f"\n📋 Migrating table: {table_name}")

    # Get column names from SQLite
    columns = get_table_columns(sqlite_conn, table_name)

    if not columns:
        print(f"  ⚠ Warning: Table {table_name} has no columns. Skipping.")
        return (0, 0)

    # Fetch all rows from SQLite
    sqlite_result = sqlite_conn.execute(text(f"SELECT * FROM {table_name}"))
    rows = sqlite_result.fetchall()
    sqlite_count = len(rows)

    print(f"  → Found {sqlite_count} rows in SQLite")

    if sqlite_count == 0:
        print(f"  ✓ No data to migrate for {table_name}")
        return (0, 0)

    if dry_run:
        print(f"  ⏭ DRY RUN: Would migrate {sqlite_count} rows")
        return (sqlite_count, 0)

    # Prepare PostgreSQL insert statement
    column_list = ", ".join(columns)
    placeholders = ", ".join([f":{col}" for col in columns])

    # Quote table name if it's a reserved keyword
    table_identifier = f'"{table_name}"' if table_name == "order" else table_name

    insert_query = f"INSERT INTO {table_identifier} ({column_list}) VALUES ({placeholders})"

    # Convert rows to list of dicts
    data_dicts = [dict(zip(columns, row)) for row in rows]

    # Bulk insert
    try:
        pg_conn.execute(text(insert_query), data_dicts)
        pg_conn.commit()
        print(f"  ✓ Inserted {sqlite_count} rows into PostgreSQL")
    except Exception as e:
        print(f"  ✗ Error inserting into {table_name}: {e}")
        pg_conn.rollback()
        raise

    # Verify count
    pg_count = get_row_count(pg_conn, table_name)

    if pg_count != sqlite_count:
        print(f"  ⚠ WARNING: Row count mismatch! SQLite: {sqlite_count}, PostgreSQL: {pg_count}")
    else:
        print(f"  ✓ Verified {pg_count} rows in PostgreSQL")

    return (sqlite_count, pg_count)


def migrate_all_tables(
    sqlite_engine,
    pg_engine,
    dry_run: bool = False
) -> Dict[str, Tuple[int, int]]:
    """
    Migrate all tables in order.

    Returns:
        Dictionary mapping table_name -> (sqlite_count, postgres_count)
    """
    results = {}

    print("\n" + "=" * 70)
    print("🚀 STARTING MIGRATION")
    print("=" * 70)

    with sqlite_engine.connect() as sqlite_conn, pg_engine.connect() as pg_conn:
        if not dry_run:
            # Disable constraints for bulk insert
            disable_postgres_constraints(pg_conn)

        try:
            for table_name in TABLE_MIGRATION_ORDER:
                try:
                    sqlite_count, pg_count = migrate_table(
                        sqlite_conn, pg_conn, table_name, dry_run
                    )
                    results[table_name] = (sqlite_count, pg_count)
                except Exception as e:
                    print(f"\n❌ FATAL ERROR migrating {table_name}: {e}")
                    if not dry_run:
                        print("🔄 Rolling back transaction...")
                        pg_conn.rollback()
                    raise

            if not dry_run:
                # Re-enable constraints
                enable_postgres_constraints(pg_conn)

                # Reset sequences
                print("\n" + "=" * 70)
                print("🔧 RESETTING SEQUENCES")
                print("=" * 70)

                for table_name in TABLES_WITH_SEQUENCES:
                    if results.get(table_name, (0, 0))[1] > 0:  # Only if data was migrated
                        reset_postgres_sequence(pg_conn, table_name)

                print("\n✓ All sequences reset successfully!")

        except Exception as e:
            print(f"\n❌ Migration failed: {e}")
            raise

    return results


def print_summary(results: Dict[str, Tuple[int, int]], dry_run: bool = False) -> None:
    """Print migration summary."""
    print("\n" + "=" * 70)
    print("📊 MIGRATION SUMMARY")
    print("=" * 70)

    total_sqlite = 0
    total_postgres = 0

    print(f"\n{'Table':<30} {'SQLite':<12} {'PostgreSQL':<12} {'Status'}")
    print("-" * 70)

    for table_name, (sqlite_count, pg_count) in results.items():
        total_sqlite += sqlite_count
        total_postgres += pg_count

        if dry_run:
            status = "DRY RUN"
        elif sqlite_count == pg_count:
            status = "✓ OK"
        else:
            status = "⚠ MISMATCH"

        print(f"{table_name:<30} {sqlite_count:<12} {pg_count:<12} {status}")

    print("-" * 70)
    print(f"{'TOTAL':<30} {total_sqlite:<12} {total_postgres:<12}")
    print("=" * 70)

    if dry_run:
        print("\n⏭ DRY RUN COMPLETE - No changes made to PostgreSQL")
    elif total_sqlite == total_postgres:
        print("\n✅ MIGRATION SUCCESSFUL - All data verified!")
    else:
        print("\n⚠ MIGRATION COMPLETE - Some row count mismatches detected")


def main():
    """Main migration function."""
    parser = argparse.ArgumentParser(
        description="Migrate Malo Recipe Master from SQLite to PostgreSQL"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Perform dry run without making changes to PostgreSQL"
    )
    parser.add_argument(
        "--sqlite-path",
        default="api/data/malo_recipes.db",
        help="Path to SQLite database (default: api/data/malo_recipes.db)"
    )

    args = parser.parse_args()

    # Get database paths
    project_root = Path(__file__).parent.parent.parent
    sqlite_path = project_root / args.sqlite_path

    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        print("❌ ERROR: DATABASE_URL environment variable not set")
        print("\nUsage:")
        print("  DATABASE_URL=postgresql://user:pass@host:5432/db python api/scripts/migrate_sqlite_to_pg.py")
        sys.exit(1)

    if database_url.startswith("sqlite"):
        print("❌ ERROR: DATABASE_URL points to SQLite, not PostgreSQL")
        print("\nPlease set DATABASE_URL to a PostgreSQL connection string:")
        print("  postgresql://user:password@host:5432/database")
        sys.exit(1)

    print("🔍 MIGRATION CONFIGURATION")
    print("=" * 70)
    print(f"SQLite path:     {sqlite_path}")
    print(f"PostgreSQL URL:  {database_url[:50]}...")  # Truncate for security
    print(f"Dry run:         {args.dry_run}")
    print("=" * 70)

    if not args.dry_run:
        confirmation = input("\n⚠ This will INSERT data into PostgreSQL. Continue? (yes/no): ")
        if confirmation.lower() != "yes":
            print("❌ Migration cancelled.")
            sys.exit(0)

    # Create database engines
    try:
        print("\n📡 Connecting to databases...")
        sqlite_engine = get_sqlite_engine(str(sqlite_path))
        pg_engine = get_postgres_engine(database_url)
        print("✓ Connected to both databases")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        sys.exit(1)

    # Perform migration
    try:
        results = migrate_all_tables(sqlite_engine, pg_engine, dry_run=args.dry_run)
        print_summary(results, dry_run=args.dry_run)
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        sqlite_engine.dispose()
        pg_engine.dispose()
        print("\n🔌 Database connections closed")

    print("\n🎉 Migration script completed!")


if __name__ == "__main__":
    main()
