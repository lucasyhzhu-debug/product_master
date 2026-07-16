# Developer Onboarding Guide

> **Welcome to Frollie Pro!** This is your starting point as a new developer.
> **Last Updated:** 2026-02-03

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- Convex account (free tier for development)

### Setup Steps

```bash
# Clone and install
git clone <repo-url>
cd product_master
npm install

# Configure Convex
cp .env.example .env.local
# Edit .env.local with your Convex deployment URL

# Start development servers (in separate terminals)
npx convex dev        # Terminal 1: Backend
npm run dev           # Terminal 2: Frontend
```

### First-Time Database Setup

```bash
# Access Convex dashboard
npx convex dashboard

# Run seed functions in Functions tab:
tags:seedDefaults          # Creates default tags
menuProducts:seedDefaults  # Creates menu products
```

**Development URL:** `http://localhost:5173`

---

## Where to Find Information

This project has modular documentation. Use this guide to find what you need:

| I need to... | Read this file |
|--------------|---------------|
| **Understand the database schema** | [SCHEMA.md](SCHEMA.md) |
| **Write code following project patterns** | [CODE_STYLE.md](CODE_STYLE.md) |
| **Use Convex queries and mutations** | [API_REFERENCE.md](API_REFERENCE.md) |
| **Create a PR or commit code** | [WORKFLOW.md](WORKFLOW.md) |
| **Test or debug my code** | [TESTING_GUIDE.md](TESTING_GUIDE.md) |
| **Deploy to production** | [DEPLOYMENT.md](DEPLOYMENT.md) |
| **See what changed recently** | [CHANGELOG.md](CHANGELOG.md) |
| **Get the full project overview** | [CLAUDE.md](../CLAUDE.md) |

### Key Architecture Decisions

The project uses a **two-tier helper architecture** for the orders module:

| Tier | Location | Purpose |
|------|----------|---------|
| **Pure helpers** | `convex/orders/helpers.ts` | Calculations (no database access) |
| **Ctx helpers** | `convex/orders/helpers/*.ts` | Database operations |

See [CODE_STYLE.md](CODE_STYLE.md#two-tier-helper-architecture-orders-module) for details.

---

## First Task Checklist

Before starting your first task, complete these steps:

- [ ] **Read CLAUDE.md** - Full project overview and business rules
- [ ] **Run the dev environment** - Verify both `npx convex dev` and `npm run dev` work
- [ ] **Open Convex dashboard** - `npx convex dashboard` to see the database
- [ ] **Create a test order** - Use the UI to create and process an order
- [ ] **Review one mutation** - Read `convex/orders/mutations.ts` to understand the pattern
- [ ] **Check the schema** - Read `convex/schema.ts` and compare to [SCHEMA.md](SCHEMA.md)

---

## Common First-Day Questions

### How do I add a new field to a table?

1. Update `convex/schema.ts`
2. Update relevant `mutations.ts` and `queries.ts`
3. Frontend types auto-generate from schema
4. See [CODE_STYLE.md](CODE_STYLE.md#adding-a-new-order-field) for detailed example

### How do I test my changes?

```bash
npm run type-check    # TypeScript errors
npm run build         # Full build verification
npx convex dashboard  # View database, run functions
```

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for more.

### How do I commit my changes?

1. Create a feature branch from main
2. Make atomic commits with proper messages
3. Run `npm run build` before pushing
4. Update documentation (CHANGELOG.md required)

See [WORKFLOW.md](WORKFLOW.md) for the full process.

### Where are the business rules documented?

All 10 business rules are in [CLAUDE.md](../CLAUDE.md#key-business-rules). Key ones:

- **Unit conversion**: kg→g, l→ml, m→cm
- **Version immutability**: Saved versions cannot be edited
- **Order numbers**: Format `MMDD-NNN` (e.g., 0129-001)
- **Ball colors**: Pistachio green (#93C572), chocolate brown (#7B3F00) stroke

---

## Getting Help

1. **Check documentation first** (see table above)
2. **Search codebase** for similar patterns
3. **External resources:**
   - [Convex docs](https://docs.convex.dev)
   - [shadcn/ui docs](https://ui.shadcn.com)
   - [Tailwind CSS docs](https://tailwindcss.com/docs)

---

## Tech Stack Quick Reference

| Layer | Technology |
|-------|------------|
| **Backend** | Convex (serverless + real-time database) |
| **Frontend** | React 19 + TypeScript |
| **Build** | Vite |
| **Styling** | Tailwind CSS |
| **Components** | shadcn/ui (Radix) |
| **Animations** | Framer Motion |

For the complete tech stack with versions, see [CLAUDE.md](../CLAUDE.md#tech-stack).

---

**Welcome aboard! Happy coding!**
