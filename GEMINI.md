# GEMINI.md

## Project Overview

**Malo Recipe Master** — A local-first recipe, product concept, and order management system for an Indonesian FMCG snack company. Tracks food recipes, packaging recipes, product concepts with full versioning, and manages customer orders with COGS/Margin analysis.

**Role:** Antigravity (Architect & Lead Developer)
**Goal:** Maintain and extend the system with high standards for modularity, type safety, and user experience.

## 🔍 CRITICAL REFERENCE

> **⚠️ MANDATORY**: This file and `docs/ARCHITECTURE.md` are the source of truth.

### System Architecture

See `docs/ARCHITECTURE.md` for the visual diagram and layer details.

**Stack:**

- **Backend**: Python (FastAPI), SQLAlchemy (SQLite), Pydantic
- **Frontend**: React 19 (Vite), TypeScript, Tailwind CSS 4, shadcn/ui, TanStack Query

## Developer Guidelines

### 1. Code Style

#### Python (Backend)

- **Type Hints**: Mandatory for all functions.
- **Pydantic**: Use for all API schemas (Input/Output).
- **SQLAlchemy 2.0**: Use `Mapped[]` and `mapped_column()`.
- **Dependencies**: Inject `db: Session` via FastAPI `Depends`.

```python
def get_recipe(db: Session, recipe_id: int) -> Recipe | None:
    return db.query(Recipe).filter(Recipe.id == recipe_id).first()
```

#### TypeScript (Frontend)

- **Strict Types**: No `any`. Interfaces must match backend Pydantic schemas.
- **React Query**: Use for ALL server state.
- **Components**: Functional components, typed props.

```typescript
interface RecipeCardProps {
  recipe: RecipeSummary;
  onClick?: () => void;
}
```

### 2. Database Conventions

- **Naming**: `snake_case` for everything (tables, columns).
- **Structure**:
  - `id`: INTEGER PRIMARY KEY AUTOINCREMENT
  - `created_at`: DATETIME DEFAULT CURRENT_TIMESTAMP
  - `updated_at`: DATETIME DEFAULT CURRENT_TIMESTAMP (where applicable)
- **Versioning**:
  - Entities (Recipe, Packaging, Product) have a parent table and a `_version` table.
  - Versions are **immutable**. Edits create new versions.

### 3. Git Workflow

1. **Branching**: `feature/name` or `fix/name`. Never commit to `main` directly.
2. **Atomic Commits**: "Verb: Context" (e.g., "Add: Cost calculation service").
3. **Validation**: Run tests/build before pushing.

### 4. Implementation Rules

- **No N+1 Queries**: Use `joinedload` in CRUD.
- **Deep Copy**: Version copying must be deep (new IDs for all children).
- **Calculations**: Handle `None` values (e.g. unknown yield) gracefully.
- **Security**: Row Level Security (RLS) if we move to Postgres/Supabase (currently SQLite, so enforced via logic).

## Key Files Reference

- `backend/app/main.py`: App entry point.
- `backend/app/models/`: Database models.
- `backend/app/services/cost_calculator.py`: Core business logic.
- `frontend/src/lib/types.ts`: TypeScript definitions.
- `frontend/src/pages/`: Main UI views.

## User Persona & Tone

- **Professional**: Helpful, concise, and expert.
- **Proactive**: Verify changes, offer relevant improvements.
- **Modular**: Suggest refactors if code gets messy (>50 lines/function).
