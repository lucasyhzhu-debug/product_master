# SQLite to PostgreSQL Migration Guide

This guide explains how to migrate the Malo Recipe Master database from SQLite to PostgreSQL (Supabase).

## Prerequisites

1. **SQLite Database**: Existing database at `api/data/malo_recipes.db`
2. **PostgreSQL Database**: Supabase PostgreSQL database with schema initialized
3. **DATABASE_URL**: PostgreSQL connection string from Supabase dashboard
4. **Python Dependencies**: SQLAlchemy installed (`pip install -r api/requirements.txt`)

## Migration Script Features

- Respects foreign key dependencies (migrates in correct order)
- Preserves auto-increment IDs from SQLite
- Disables constraints during bulk insert for performance
- Resets PostgreSQL sequences after migration
- Verifies row counts match between SQLite and PostgreSQL
- Supports dry-run mode for testing
- Transaction safety (rollback on error)

## Migration Order

The script migrates tables in this order to respect foreign key constraints:

1. **Base tables** (no dependencies):
   - `ingredient`
   - `packaging_material`
   - `tag`
   - `customer`
   - `menu_product`

2. **Recipe hierarchy**:
   - `recipe` → `recipe_version` → `recipe_component` → `component_ingredient`

3. **Packaging hierarchy**:
   - `packaging_recipe` → `packaging_version` → `packaging_component` → `packaging_component_material`

4. **Product hierarchy**:
   - `product` → `product_version`

5. **Order hierarchy**:
   - `order` → `order_item`

6. **Junction tables** (many-to-many):
   - `recipe_tag`
   - `packaging_tag`
   - `product_tag`

## Step-by-Step Migration

### Step 1: Backup SQLite Database

```bash
# Create backup
cp api/data/malo_recipes.db api/data/malo_recipes.db.backup
```

### Step 2: Initialize PostgreSQL Schema

Get your Supabase connection string from the Supabase dashboard:

```
Project Settings → Database → Connection String (URI)
```

Set the environment variable and initialize the schema:

```bash
# Set DATABASE_URL (Unix/Mac)
export DATABASE_URL="postgresql://postgres:[password]@[host].supabase.co:5432/postgres"

# Set DATABASE_URL (Windows PowerShell)
$env:DATABASE_URL="postgresql://postgres:[password]@[host].supabase.co:5432/postgres"

# Set DATABASE_URL (Windows CMD)
set DATABASE_URL=postgresql://postgres:[password]@[host].supabase.co:5432/postgres

# Initialize schema (creates all tables)
cd api
python -c "from app.database import init_db; init_db()"
```

This will create all tables and seed default data (tags, menu_products).

### Step 3: Dry Run (Test Migration)

Always run a dry run first to verify the migration will work:

```bash
# Dry run (no changes to PostgreSQL)
python api/scripts/migrate_sqlite_to_pg.py --dry-run
```

Expected output:
```
🔍 MIGRATION CONFIGURATION
======================================================================
SQLite path:     D:\Claude\Product Manager\product_master\api\data\malo_recipes.db
PostgreSQL URL:  postgresql://postgres:***...
Dry run:         True
======================================================================

🚀 STARTING MIGRATION
======================================================================

📋 Migrating table: ingredient
  → Found 15 rows in SQLite
  ⏭ DRY RUN: Would migrate 15 rows

...

📊 MIGRATION SUMMARY
======================================================================
Table                          SQLite       PostgreSQL   Status
----------------------------------------------------------------------
ingredient                     15           0            DRY RUN
...
----------------------------------------------------------------------
TOTAL                          342          0
======================================================================

⏭ DRY RUN COMPLETE - No changes made to PostgreSQL
```

### Step 4: Actual Migration

If dry run looks good, proceed with actual migration:

```bash
# Run actual migration
python api/scripts/migrate_sqlite_to_pg.py
```

You'll be prompted for confirmation:

```
⚠ This will INSERT data into PostgreSQL. Continue? (yes/no): yes
```

Expected output:
```
🚀 STARTING MIGRATION
======================================================================
  → Disabling foreign key constraints...

📋 Migrating table: ingredient
  → Found 15 rows in SQLite
  ✓ Inserted 15 rows into PostgreSQL
  ✓ Verified 15 rows in PostgreSQL

...

  → Re-enabling foreign key constraints...

🔧 RESETTING SEQUENCES
======================================================================
    ✓ Reset sequence for ingredient to 16
    ✓ Reset sequence for packaging_material to 12
    ...

💾 Committing transaction...
✓ Transaction committed successfully!

📊 MIGRATION SUMMARY
======================================================================
Table                          SQLite       PostgreSQL   Status
----------------------------------------------------------------------
ingredient                     15           15           ✓ OK
packaging_material             11           11           ✓ OK
tag                            5            5            ✓ OK
customer                       8            8            ✓ OK
menu_product                   4            4            ✓ OK
recipe                         12           12           ✓ OK
recipe_version                 18           18           ✓ OK
recipe_component               24           24           ✓ OK
component_ingredient           87           87           ✓ OK
packaging_recipe               6            6            ✓ OK
packaging_version              8            8            ✓ OK
packaging_component            14           14           ✓ OK
packaging_component_material   28           28           ✓ OK
product                        10           10           ✓ OK
product_version                15           15           ✓ OK
order                          22           22           ✓ OK
order_item                     64           64           ✓ OK
recipe_tag                     18           18           ✓ OK
packaging_tag                  12           12           ✓ OK
product_tag                    15           15           ✓ OK
----------------------------------------------------------------------
TOTAL                          342          342
======================================================================

✅ MIGRATION SUCCESSFUL - All data verified!
```

### Step 5: Verify Migration

1. **Check row counts in PostgreSQL**:

```sql
-- Connect to Supabase SQL Editor and run:
SELECT 'ingredient' AS table_name, COUNT(*) AS count FROM ingredient
UNION ALL
SELECT 'recipe', COUNT(*) FROM recipe
UNION ALL
SELECT 'product', COUNT(*) FROM product
UNION ALL
SELECT 'order', COUNT(*) FROM "order";  -- Note: quoted because it's a reserved keyword
```

2. **Test a few queries**:

```sql
-- Get recipes with costs
SELECT r.name, rv.version_name, rv.estimated_yield_grams
FROM recipe r
JOIN recipe_version rv ON rv.recipe_id = r.id
ORDER BY r.name, rv.version_number;

-- Get orders with items
SELECT o.order_number, o.status, oi.product_name, oi.quantity
FROM "order" o
JOIN order_item oi ON oi.order_id = o.id
ORDER BY o.order_date DESC
LIMIT 10;
```

3. **Test the API**:

```bash
# Update .env to use PostgreSQL
DATABASE_URL=postgresql://postgres:[password]@[host].supabase.co:5432/postgres

# Start backend
cd api
uvicorn app.main:app --reload --port 8000

# Test endpoints
curl http://localhost:8000/api/ingredients
curl http://localhost:8000/api/recipes
curl http://localhost:8000/api/orders
```

## Common Issues & Solutions

### Issue: Row Count Mismatch

**Symptom**: Migration shows "⚠ MISMATCH" for some tables

**Solution**:
1. Check for foreign key constraint violations
2. Verify that all parent tables migrated successfully
3. Check PostgreSQL logs for errors
4. Re-run migration after fixing issues

### Issue: Sequence Not Reset

**Symptom**: New records fail with "duplicate key value violates unique constraint"

**Solution**: Manually reset sequences:

```sql
-- For each table with auto-increment ID:
SELECT setval(pg_get_serial_sequence('ingredient', 'id'),
              COALESCE((SELECT MAX(id) FROM ingredient), 1));

SELECT setval(pg_get_serial_sequence('recipe', 'id'),
              COALESCE((SELECT MAX(id) FROM recipe), 1));

-- For the order table (reserved keyword):
SELECT setval(pg_get_serial_sequence('order', 'id'),
              COALESCE((SELECT MAX(id) FROM "order"), 1));
```

### Issue: Permission Denied

**Symptom**: `permission denied for table X`

**Solution**: Ensure the PostgreSQL user has INSERT permissions:

```sql
-- Grant permissions (run as postgres superuser)
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
```

### Issue: Connection Timeout

**Symptom**: `connection timed out` or `could not connect`

**Solution**:
1. Check if Supabase project is paused (free tier)
2. Verify connection string is correct
3. Check firewall/network settings
4. Try using Transaction Pooler (port 6543) instead of Direct (port 5432)

## Command Reference

```bash
# Help
python api/scripts/migrate_sqlite_to_pg.py --help

# Dry run (default SQLite path)
python api/scripts/migrate_sqlite_to_pg.py --dry-run

# Dry run (custom SQLite path)
python api/scripts/migrate_sqlite_to_pg.py --dry-run --sqlite-path path/to/db.db

# Actual migration
DATABASE_URL=postgresql://... python api/scripts/migrate_sqlite_to_pg.py

# With custom SQLite path
DATABASE_URL=postgresql://... python api/scripts/migrate_sqlite_to_pg.py --sqlite-path path/to/db.db
```

## Post-Migration Checklist

- [ ] All row counts match between SQLite and PostgreSQL
- [ ] All sequences reset successfully
- [ ] Foreign key relationships intact
- [ ] API endpoints return correct data
- [ ] New records can be created (test POST endpoints)
- [ ] Update production environment variables to use PostgreSQL
- [ ] Update Vercel environment variables
- [ ] Keep SQLite backup for rollback if needed

## Rolling Back

If migration fails or you need to start over:

1. **Drop all PostgreSQL tables**:

```sql
-- Connect to Supabase SQL Editor
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

2. **Re-initialize schema**:

```bash
DATABASE_URL=postgresql://... python -c "from app.database import init_db; init_db()"
```

3. **Re-run migration**:

```bash
DATABASE_URL=postgresql://... python api/scripts/migrate_sqlite_to_pg.py
```

## Performance Notes

- Migration typically takes 1-5 seconds for small datasets (<1000 rows total)
- For large datasets (>10,000 rows), consider batch size adjustments
- Disabling constraints during bulk insert improves performance significantly
- Transaction pooler (port 6543) recommended for serverless environments

## Security Notes

- Never commit `DATABASE_URL` with credentials to git
- Use `.env` file for local development (already in `.gitignore`)
- Use Vercel environment variables for production
- Rotate Supabase credentials if accidentally exposed
