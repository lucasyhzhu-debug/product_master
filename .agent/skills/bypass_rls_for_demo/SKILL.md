---
name: bypass_rls_for_demo
description: Open up tables for public access to facilitate demos and testing without authentication barriers.
---

# Skill: Bypass RLS for Demo / Testing

## Purpose
Rapidly configure Row Level Security (RLS) policies to allow unrestricted access (Read/Write) to specific tables. 
**Use this ONLY for demo environments, local testing, or public-facing grids.**

## Usage
Trigger this skill when:
- The user asks to "enable demo mode".
- You need to seed data from a script without a Service Role key.
- You are debugging RLS permission errors and need a clear baseline.
- You are building a public-facing dashboard (like the "Who's Working" grid).

## Steps

1. **Identify Tables**: List the tables that need public access (e.g., `recipes`, `ingredients`).
2. **Create Migration**: Create a new `.sql` file in `supabase/migrations/`.
3. **Write Policy**: Use the `FOR ALL` policy with `USING (true)` and `WITH CHECK (true)`.

## SQL Template

```sql
-- 000XX_enable_demo_access.sql

-- repeat for each table
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY; -- Ensure RLS is on

-- Drop existing restrictive policies if necessary (optional but cleaner)
-- DROP POLICY IF EXISTS "Restrictive Policy" ON public.recipes;

-- Create the "Trust All" policy
CREATE POLICY "Allow public demo access on recipes"
ON public.recipes
FOR ALL
USING (true)
WITH CHECK (true);
```

## Security Warning ⚠️
- This effectively makes the table **publicly writable**.
- Do not deploy this migration to a Production environment unless clearly intended (e.g., for a public playground app).
- For pure "Read Only" public access, change `FOR ALL` to `FOR SELECT` and remove the `WITH CHECK` clause.
