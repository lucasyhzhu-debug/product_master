---
name: scaffold_module
description: End-to-end creation of a new domain module (database to UI)
---

# Skill: Scaffold New Module

## Purpose
 Systematically create a new domain module (e.g., Recipes, Sales) by coordinating multiple domain personas.

## Usage
Trigger this skill when the user asks to "Create a new module" or "Add the [Name] feature".

## Steps

0. **Orchestrator**:
   - Identify the module name (e.g., "Recipes").
   - Confirm with the user if they want to proceed with the standard scaffolding process.

1. **Role: Domain Expert (`.agent/personas/1_domain_expert.md`)**
   - **Goal**: Define the data model and business logic.
   - **Action**: 
     - Create `docs/specs/[module]_LOGIC.md`.
     - Define entities, fields, and relationships.
     - Document specific business rules (validation, math, etc.).

2. **Role: Architect (`.agent/personas/2_architect.md`)**
   - **Goal**: Implement physical database schema.
   - **Action**:
     - Append new tables to `context/schema.sql`.
     - **CRITICAL**: Define RLS policies immediately.
     - Document security model.

3. **Role: Scribe (`.agent/personas/0_scribe.md`)**
   - **Goal**: Documentation consistency.
   - **Action**:
     - Update `docs/DATABASE_SCHEMA.md`.
     - Update `docs/DATA_DICTIONARY.md`.

4. **Role: Builder (`.agent/personas/3_builder.md`)**
   - **Goal**: Implementation.
   - **Action**:
     - Run `npx supabase db push` (or apply migration locally).
     - Run `npx supabase gen types typescript ...`.
     - Create `src/services/[module].ts` (Service Layer).
     - Create `src/app/(modules)/[module]/page.tsx` (UI Layer).

5. **Role: Auditor (`.agent/personas/4_auditor.md`)**
   - **Goal**: Verification.
   - **Action**:
     - Review `schema.sql` against `_LOGIC.md`.
     - Check for missing RLS.
     - Verify TypeScript compilation.

## Output
A fully functional module with:
- Documentation spec
- Database tables + RLS
- TypeScript types
- Service layer functions
- Basic UI Frame
