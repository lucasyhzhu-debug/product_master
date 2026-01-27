# Claude Code Prompt: Build Recipe & Product Concept Master

## Context

Read the PRD at `malo_recipe_master_prd.md` in this directory. This document contains the full specification for a local-first recipe management system for an Indonesian FMCG snack company.

## What to Build

A full-stack web application with:

**Backend:** Python FastAPI with SQLite database
**Frontend:** React + TypeScript with Tailwind CSS

## Core Requirements

1. **Database**: Initialize SQLite with the schema from PRD Section 2. Seed the default tags.

2. **Three main modules**:
   - Recipe Master (food recipes with versioned components)
   - Packaging Master (same structure as recipes but for packaging materials)
   - Product Concept Master (combines recipe + packaging with margin calculations)

3. **Versioning system**:
   - Versions are immutable once saved
   - Linear version chain with copy-from-any capability
   - Arrow navigation between versions
   - Right arrow becomes "+ New Version" button at latest version
   - Version metadata displayed as subtitle (created date/time, copied from)

4. **Component system**:
   - Recipes have 1+ components
   - Components have 1+ ingredients (rows with reorder capability)
   - Single-component recipes can be marked as reusable
   - Reusable components can be linked into other recipes
   - Editing linked component inline creates new version of source (with warning modal showing impacted recipes)

5. **Ingredient/Material management**:
   - Combobox search to select existing or create new
   - Fields: name, brand, procurement_source, unit_type, volume_purchased, price_excl_shipping, shipping_cost
   - Separate tables for food ingredients vs packaging materials

6. **Cost calculations** (real-time):
   - Ingredient cost per base unit
   - Component subtotals
   - Recipe total cost and cost-per-gram
   - Product COGS (recipe + packaging)
   - Contribution margin (retail price - COGS)

7. **Dashboard**:
   - Three horizontal carousels: Products, Recipes, Packaging
   - First item in each carousel is "+ New" button
   - Quick stats: total counts, most used recipe, most used packaging, avg COGS

8. **UX details**:
   - Tooltips on (i) icons showing full details (cost breakdown, description, version info)
   - Tags for filtering (shared tag system)
   - Delete warnings before destructive actions
   - Required description field when creating new versions

## File Structure

```
malo-recipe-master/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── database.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── crud/
│   │   └── routers/
│   ├── data/
│   │   └── malo_recipes.db
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── lib/
│   └── package.json
└── README.md
```

## Build Order

1. Backend database setup and models
2. CRUD operations for ingredients and packaging materials
3. Recipe/Packaging versioning logic
4. Cost calculation service
5. API routes
6. Frontend dashboard
7. Frontend recipe editor with component management
8. Frontend packaging editor (reuse recipe patterns)
9. Frontend product concept editor
10. Polish: tooltips, validation, warnings

## Key Business Rules (from PRD Section 5)

- 1 ml = 1 g for liquid ingredient calculations
- Versions cannot be edited after save
- Products stay pinned to selected recipe/packaging versions
- Linked component edits auto-update only the current recipe
- Tags are shared across recipes and packaging

## Run Instructions

The app should run locally with:
```bash
# Backend
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload

# Frontend
cd frontend && npm install && npm run dev
```

Start building. Begin with the backend database initialization and models.
