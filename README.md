# Frollie Recipe Master

A real-time recipe and product management system for an Indonesian FMCG snack company. Tracks recipes, packaging, and products with versioning, cost calculations, and margin analysis.

**Stack:** Convex + React 19 + TypeScript + Tailwind CSS

---

## Quick Start

```bash
npm install                    # Install dependencies
npx convex dev                 # Terminal 1: Start backend
npm run dev                    # Terminal 2: Start frontend
```

**First run:** Open [Convex Dashboard](http://localhost:5173) → Functions → Run `tags:seedDefaults` and `menuProducts:seedDefaults`

**Dev URL:** http://localhost:5173

---

## Key Features

- **Recipe Management** — Multi-component recipes with linked sub-recipes, version control, cost/gram calculations
- **Packaging Recipes** — Material tracking with cost calculations
- **Product Concepts** — COGS breakdown (recipe + packaging), contribution margin analysis
- **Order Management** — Real-time tracking, WhatsApp receipts, customer profiles
- **Kitchen View** — Ball inventory system, auto-allocation, visual package filling

---

## Documentation

| Document | Purpose |
|----------|---------|
| [CLAUDE.md](CLAUDE.md) | **Project overview** — Business rules, file locations, commands |
| [docs/SCHEMA.md](docs/SCHEMA.md) | Database schema (19 tables) |
| [docs/CODE_STYLE.md](docs/CODE_STYLE.md) | TypeScript/Convex patterns |
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | Git workflow, code review |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Convex queries/mutations |
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | New developer guide |
| [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) | Testing environment |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Version history |

---

## Commands

```bash
# Development
npm run dev              # Frontend dev server
npx convex dev           # Backend dev server
npm run build            # Production build

# Quality
npm run lint             # ESLint
npm run type-check       # TypeScript
npm test                 # Run tests

# Convex
npx convex dashboard     # Open dashboard
npx convex deploy        # Deploy to production
```

---

## Project Structure

```
product_master/
├── convex/              # Backend (Convex serverless)
│   ├── schema.ts        # Database schema
│   ├── lib/             # Shared utilities
│   └── [entity]/        # Queries/mutations per entity
├── src/                 # Frontend (React)
│   ├── components/      # UI components
│   ├── pages/           # Route components
│   ├── hooks/convex/    # Convex React hooks
│   └── lib/             # Utilities
├── docs/                # Documentation
└── CLAUDE.md            # AI agent context
```

See [CLAUDE.md](CLAUDE.md) for detailed file locations.

---

## Contributing

**All changes require:**
1. Feature branch from `main`
2. Code review
3. `npm run build` passes
4. Update `docs/CHANGELOG.md`

No direct commits to main. See [docs/WORKFLOW.md](docs/WORKFLOW.md).

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Convex ^1.31.7 |
| Frontend | React 19 + TypeScript |
| Build | Vite 7.2.4 |
| Styling | Tailwind CSS 4.1.18 |
| UI | shadcn/ui (Radix) |
| Animations | Framer Motion |

---

## License

Private — Internal use only
