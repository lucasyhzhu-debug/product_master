# Migration Feasibility Analysis

## One-Line Summary

**Feasibility: VERY HIGH | Effort: LOW-MODERATE (approx. 15-20 developer hours)**

Moving to a monolithic Next.js + Supabase architecture is the **ideal path forward**. With the decision to **start fresh on the database**, the complexity drops significantly. We eliminate the riskiest part of any migration: data integrity during transfer.

---

## 1. Project Status Check

- [x] **Gitignore**: Correctly configured.
- [x] **Secrets**: `backend/.env` has valid Supabase keys.
- [x] **Greenfield DB**: **CONFIRMED**. No legacy data migration required.

## 2. Architecture Shift

| Layer | Current (Local) | Target (Vercel + Supabase) | Effort | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend** | React 19 (Vite) | Next.js 15 (App Router) | Medium | Copy components, update routing. |
| **Backend** | Python (FastAPI) | Next.js Server Actions | Medium | Port logic to TS. |
| **Database** | SQLite | Supabase PostgreSQL | **Low** | **Create fresh tables via SQL.** |
| **Logic** | Python (`cost_calculator`) | TypeScript (`lib/calculator.ts`) | Low | 1:1 translation. |
| **Deployment** | Local / Custom | Vercel (Zero Config) | Low | Push to git -> Live. |

## 3. "How Hard Is It?" - Revised Breakdown

### A. The Database (Supabase) - **EASY**

**Status**: Fresh Start.

- **Task**: We define the database schema (tables) using Supabase's SQL Editor or Table Editor.
- **Advantage**: We can optimize the schema for Postgres (using hugeints, proper relation types, JSONB if needed) without worrying about fitting old SQLite data into it.
- **Zero Baggage**: No data pump scripts, no ID mapping issues, no "bad data" cleanup.

### B. Porting Logic (The "Core" Work)

**Status**: Must be ported.

- **Task**: Rewrite `backend/app/services/cost_calculator.py` (~200 lines) into TypeScript.
- **Impact**: This logic becomes a standard TypeScript function usable by both the Client (for optimistic UI updates) and Server (for saving data).
- **Effort**: 2-4 hours to rewrite and verify calculation accuracy.

### C. The Frontend (Next.js)

**Status**: Standard Refactor.

- **Components**: Reuse existing UI components (`shadcn/ui`, `tailwind`).
- **Pages**: Move from `react-router-dom` to Next.js App Router folders.
- **Fetching**: Remove `useQuery` calls that hit `localhost:8000`. Replace with direct Server Actions or client-side Supabase SDK calls.

## 4. Simplified Action Plan

1. **Repo Setup**: Initialize a clean Next.js app (`npx create-next-app`) in a new branch or root folder.
2. **Schema Init**: Run a single SQL script to create Tables in Supabase (Users, Recipes, Products, etc.) + Enable RLS.
3. **Port Logic**: Translate the calculator logic to TypeScript.
4. **UI Migration**: Copy components, recreate pages structure.
5. **Go Live**: Connect Vercel to the repo.

## 5. Verdict

**Proceed immediately.**
Removing the requirement to migrate data removes the biggest bottleneck. You get a clean slate, a modern stack, and a fully "serverless" monolithic app hosted for free/cheap on Vercel.
