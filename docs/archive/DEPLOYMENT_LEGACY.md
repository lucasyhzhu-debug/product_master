# Frollie Recipe Master - Deployment Guide

## Overview

This guide deploys **Frollie Recipe Master** to Vercel for your co-founders and production managers (5 users max, ~50 orders/week).

**Optimized for:**
- Small team (5 concurrent users)
- Low volume (~50 orders/week, ~200 API calls/day)
- Fast, reliable access from any device (phone, tablet, laptop)
- Simple maintenance with minimal DevOps overhead

**Architecture:**
```
┌─────────────────────────────────────────────────────────┐
│                    Vercel Edge Network                  │
│  (Global CDN - fast loading from anywhere in Indonesia) │
└─────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
    ┌───────────────┐              ┌───────────────┐
    │  Static Files │              │  Serverless   │
    │  (React App)  │              │  Functions    │
    │    < 50ms     │              │  (FastAPI)    │
    └───────────────┘              └───────────────┘
                                          │
                                          ▼
                               ┌───────────────────┐
                               │  Neon PostgreSQL  │
                               │  (Singapore DC)   │
                               │  Free Tier: 0.5GB │
                               └───────────────────┘
```

**What you'll have when done:**
```
https://malo-recipes.vercel.app          ← Dashboard, Orders, Kitchen View
https://malo-recipes.vercel.app/api/...  ← API endpoints
```

**Expected Performance:**
- First load (cold start): 3-8 seconds
- Subsequent loads: < 500ms
- API responses: < 200ms
- Concurrent users supported: 50+ (way more than you need)

---

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] GitHub account (free)
- [ ] Vercel account (free tier is sufficient)
- [ ] Neon account (free tier: 0.5GB storage, perfect for your scale)
- [ ] Node.js 18+ installed locally
- [ ] Python 3.11+ installed locally
- [ ] Git installed locally

**Estimated time:** 30-45 minutes for first deployment

---

## Phase 1: Prepare Your Codebase

### Step 1.1: Verify Project Structure

Your project should have this structure (monolithic layout for Vercel):

```
product_master/
├── api/                    # Backend (FastAPI)
│   ├── app/
│   │   ├── main.py
│   │   ├── database.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── crud/
│   │   ├── routers/
│   │   └── services/
│   ├── index.py            # Vercel serverless entry point
│   └── requirements.txt
├── src/                    # Frontend (React)
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   └── lib/
├── dist/                   # Build output (generated)
├── vercel.json
├── package.json
└── vite.config.ts
```

### Step 1.2: Verify Backend Configuration

**File: `api/app/database.py`**

This should already be configured for dual database support. Verify it uses `NullPool` for serverless:

```python
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool

Base = declarative_base()

# Database URL from environment (PostgreSQL in prod, SQLite in dev)
DATABASE_URL = os.getenv("DATABASE_URL")
SQLITE_PATH = os.getenv("SQLITE_PATH", "api/data/malo_recipes.db")

if DATABASE_URL and DATABASE_URL.startswith("postgresql"):
    # Production: PostgreSQL with NullPool (required for serverless)
    # NullPool creates a new connection per request - no connection leaks
    engine = create_engine(DATABASE_URL, poolclass=NullPool)
else:
    # Development: SQLite
    sqlite_url = f"sqlite:///{SQLITE_PATH}"
    engine = create_engine(
        sqlite_url,
        connect_args={"check_same_thread": False}
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """Dependency for FastAPI routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

**Why NullPool?** Serverless functions are stateless. Standard connection pools would create orphaned connections that exhaust database limits. NullPool creates fresh connections per request - slightly slower (~5ms overhead) but reliable.

### Step 1.3: Verify Vercel Entry Point

**File: `api/index.py`**

```python
"""Vercel serverless entry point for FastAPI."""
from mangum import Mangum
from app.main import app

# Mangum adapts ASGI (FastAPI) to AWS Lambda/Vercel serverless
handler = Mangum(app, lifespan="off")
```

### Step 1.4: Verify FastAPI Main Configuration

**File: `api/app/main.py`**

Ensure it has proper CORS and health check:

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.database import init_db

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    try:
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization error: {e}")
        # Don't raise - tables may already exist
    yield

app = FastAPI(
    title="Frollie Recipe Master API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS: Allow your Vercel domains
# For small team, we can be permissive
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your actual domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/api/health")
def health_check():
    """Health check for monitoring."""
    return {"status": "healthy", "service": "malo-recipe-master"}

# Import and include routers
from app.routers import (
    ingredients,
    packaging_materials,
    tags,
    recipes,
    packaging,
    products,
    dashboard,
    customers,
    orders,
)

app.include_router(ingredients.router, prefix="/api/ingredients", tags=["ingredients"])
app.include_router(packaging_materials.router, prefix="/api/packaging-materials", tags=["packaging-materials"])
app.include_router(tags.router, prefix="/api/tags", tags=["tags"])
app.include_router(recipes.router, prefix="/api/recipes", tags=["recipes"])
app.include_router(packaging.router, prefix="/api/packaging", tags=["packaging"])
app.include_router(products.router, prefix="/api/products", tags=["products"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(customers.router, prefix="/api/customers", tags=["customers"])
app.include_router(orders.router, prefix="/api/orders", tags=["orders"])
```

### Step 1.5: Verify Vercel Configuration

**File: `vercel.json`**

```json
{
  "version": 2,
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "functions": {
    "api/index.py": {
      "runtime": "python3.11",
      "maxDuration": 30,
      "memory": 1024
    }
  },
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "/api/index.py"
    },
    {
      "source": "/((?!api/).*)",
      "destination": "/index.html"
    }
  ]
}
```

**Configuration explained:**
- `maxDuration: 30` - 30 second timeout (plenty for your use case)
- `memory: 1024` - 1GB RAM (sufficient for FastAPI + SQLAlchemy)
- First rewrite: All `/api/*` requests go to FastAPI
- Second rewrite: Everything else serves the React SPA

### Step 1.6: Verify Requirements

**File: `api/requirements.txt`**

```
fastapi==0.109.0
uvicorn[standard]==0.27.0
sqlalchemy==2.0.25
pydantic==2.5.3
pydantic-settings==2.1.0
python-multipart==0.0.6
mangum==0.18.0
psycopg2-binary==2.9.9
python-dotenv==1.0.0
```

### Step 1.7: Verify Frontend API Configuration

**File: `src/lib/api.ts`**

The API client should auto-detect the environment:

```typescript
import axios from 'axios';

// In production (Vercel), use relative path
// In development, use localhost
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);
```

---

## Phase 2: Create GitHub Repository

### Step 2.1: Initialize Git (if needed)

```bash
cd product_master

# Check if already a git repo
git status

# If not initialized:
git init
```

### Step 2.2: Create .gitignore

**File: `.gitignore`**

Ensure these are excluded:

```gitignore
# Dependencies
node_modules/
.venv/
venv/
__pycache__/
*.pyc

# Build outputs
dist/
.vercel/

# Environment files (NEVER commit these)
.env
.env.local
.env.production
.env.*.local

# Database files
*.db
api/data/*.db

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
```

### Step 2.3: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `malo-recipe-master`
3. Keep it **Private** (your business data)
4. **DO NOT** initialize with README
5. Click "Create repository"

### Step 2.4: Push Code to GitHub

```bash
# Add all files
git add .

# Create initial commit
git commit -m "feat: initial commit - Frollie Recipe Master full stack

- FastAPI backend with SQLAlchemy ORM
- React frontend with TypeScript
- Recipe, Packaging, Product management
- Order management with WhatsApp integration
- Kitchen view for production tracking

Co-Authored-By: Claude <noreply@anthropic.com>"

# Add remote
git remote add origin https://github.com/YOUR_USERNAME/malo-recipe-master.git

# Push
git branch -M main
git push -u origin main
```

**Verify:** Go to your GitHub repo and confirm all files are there.

---

## Phase 3: Create PostgreSQL Database (Neon)

### Step 3.1: Create Neon Account

1. Go to https://neon.tech
2. Sign up with GitHub (same account)
3. Authorize Neon

### Step 3.2: Create Database Project

1. Click "Create Project"
2. **Project name:** `malo-recipe-master`
3. **Region:** Select closest to your users
   - For Indonesia: **Singapore** (`ap-southeast-1`)
4. **Database name:** `malo_recipes`
5. Click "Create Project"

### Step 3.3: Get Connection String

After creation, Neon shows your connection string:

```
postgresql://neondb_owner:AbCdEf123456@ep-cool-darkness-123456.ap-southeast-1.aws.neon.tech/malo_recipes?sslmode=require
```

**Save this securely!** You'll need it in Phase 4.

### Step 3.4: Test Connection (Optional)

```bash
# If you have psql installed:
psql "postgresql://neondb_owner:AbCdEf123456@ep-cool-darkness-123456.ap-southeast-1.aws.neon.tech/malo_recipes?sslmode=require" -c "SELECT 1 AS test;"

# Expected output:
#  test
# ------
#     1
```

**Neon Free Tier Limits (more than enough for your use):**
- 0.5 GB storage (you'll use maybe 10MB)
- 3 GB data transfer/month (you'll use maybe 100MB)
- 100 hours compute/month (always-on for free tier)

---

## Phase 4: Deploy to Vercel

### Step 4.1: Create Vercel Account

1. Go to https://vercel.com/signup
2. Sign up with GitHub (same account)
3. Authorize Vercel to access your repositories

### Step 4.2: Import Project

1. Go to https://vercel.com/dashboard
2. Click **"Add New..."** → **"Project"**
3. Find `malo-recipe-master` in the repository list
4. Click **"Import"**

### Step 4.3: Configure Project Settings

On the configuration screen:

**Framework Preset:** Vite (should auto-detect)

**Root Directory:** `.` (leave as is)

**Build & Output Settings:**
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

### Step 4.4: Add Environment Variables

Click **"Environment Variables"** and add:

| Name | Value | Environments |
|------|-------|--------------|
| `DATABASE_URL` | `postgresql://neondb_owner:...` (your Neon connection string) | Production, Preview, Development |

**Important:** Include the full connection string with `?sslmode=require`

### Step 4.5: Deploy

Click **"Deploy"**

Vercel will:
1. Clone your repository
2. Install npm dependencies
3. Build the React frontend (`npm run build`)
4. Package the Python backend
5. Deploy to global edge network

**First deployment takes 2-5 minutes.**

### Step 4.6: Verify Deployment

Once complete, you'll see:

```
✓ Production: https://malo-recipe-master.vercel.app
```

Click the URL to open your app.

---

## Phase 5: Post-Deployment Verification

### Step 5.1: Test Frontend

1. Open `https://your-project.vercel.app`
2. Dashboard should load with empty carousels
3. No console errors (check browser DevTools)

### Step 5.2: Test API

```bash
# Health check
curl https://your-project.vercel.app/api/health
# Expected: {"status":"healthy","service":"malo-recipe-master"}

# Dashboard stats
curl https://your-project.vercel.app/api/dashboard/stats
# Expected: {"total_recipes":0,"total_products":0,...}
```

### Step 5.3: Test Core Workflows

**As a co-founder, test these flows:**

1. **Create an Ingredient**
   - Go to Ingredients page
   - Add "Tepung Terigu" with price and volume
   - Verify it saves and shows cost per gram

2. **Create a Recipe**
   - Go to Dashboard → "New Recipe"
   - Add ingredients to a component
   - Save and verify cost calculation

3. **Create an Order**
   - Go to Orders
   - Create a new order with line items
   - Copy WhatsApp message
   - Verify status workflow (Draft → AwaitingPayment → Confirmed)

4. **Kitchen View**
   - Go to Kitchen View
   - Verify orders appear in correct status groups

### Step 5.4: Test on Mobile

1. Open the same URL on your phone
2. Test creating an order
3. Verify responsive design works
4. Test WhatsApp copy button (should open WhatsApp)

### Step 5.5: Share with Team

Send your team the URL:
```
https://malo-recipe-master.vercel.app
```

**Bookmark suggestion:** Add to home screen on mobile for app-like experience.

---

## Phase 6: Migrate Existing Data (If Applicable)

If you have existing data in SQLite from local development:

### Step 6.1: Run Migration Script

```bash
cd api/scripts

# Set your Neon connection string
export POSTGRES_URL="postgresql://neondb_owner:...@ep-xxx.neon.tech/malo_recipes?sslmode=require"

# Run migration
python migrate_sqlite_to_pg.py \
  --sqlite-path ../data/malo_recipes.db \
  --postgres-url "$POSTGRES_URL"
```

### Step 6.2: Verify Migration

```bash
# Connect to Neon and check data
psql "$POSTGRES_URL" -c "SELECT COUNT(*) FROM recipe;"
psql "$POSTGRES_URL" -c "SELECT COUNT(*) FROM ingredient;"
psql "$POSTGRES_URL" -c "SELECT COUNT(*) FROM \"order\";"
```

---

## Phase 7: Ongoing Operations

### Deploying Updates

Every push to `main` triggers automatic deployment:

```bash
# Make changes
git add .
git commit -m "feat: add new feature"
git push origin main

# Vercel deploys automatically in ~1-2 minutes
```

### Monitoring

**Vercel Dashboard:**
- **Deployments:** See all deployment history and logs
- **Analytics:** View request volume (upgrade to Pro for detailed analytics)
- **Functions:** Monitor serverless function performance

**Neon Dashboard:**
- **Monitoring:** Database connections, queries
- **Storage:** See how much space you're using

### Database Backups

Neon provides automatic point-in-time recovery. For manual backups:

```bash
# Export to SQL file
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d).sql

# Keep backups in a safe place (Google Drive, etc.)
```

**Recommended:** Weekly manual backup before major changes.

### Rollback Procedure

If a deployment breaks something:

**Option 1: Vercel Dashboard (Recommended)**
1. Go to Deployments
2. Find the last working deployment
3. Click "..." → "Promote to Production"

**Option 2: Git Revert**
```bash
git revert HEAD
git push origin main
```

**Option 3: Vercel CLI**
```bash
vercel rollback
```

---

## Troubleshooting

### "502 Bad Gateway" on API Calls

**Cause:** Usually a Python error in serverless function.

**Fix:**
1. Go to Vercel Dashboard → Deployments → Latest
2. Click "Functions" tab
3. Find `api/index.py` logs
4. Look for Python traceback
5. Common issues:
   - Missing environment variable
   - Import error
   - Database connection failed

### "CORS Error" in Browser

**Cause:** API rejecting requests from frontend.

**Fix:** Verify `api/app/main.py` has CORS middleware configured.

### Slow First Load (5-10 seconds)

**Cause:** Cold start - serverless function spinning up.

**This is normal.** Subsequent requests are fast. Vercel keeps functions warm for ~10 minutes after last request.

**For your team of 5:** During active use, cold starts are rare since someone is usually using the app.

### Database Connection Errors

**Cause:** Wrong connection string or Neon sleeping.

**Fix:**
1. Verify `DATABASE_URL` in Vercel environment variables
2. Ensure `?sslmode=require` is in the connection string
3. Neon free tier doesn't sleep - should always be available

### Build Failed

**Cause:** TypeScript errors or missing dependencies.

**Fix:**
1. Run locally: `npm run build`
2. Fix any TypeScript errors
3. Commit and push again

---

## Git Workflow & Code Review Checkpoints

For a small team, keep it simple but disciplined.

### Branch Strategy

```
main (production)
  ↑
  └── feature/xyz (development work)
```

**Rule:** Never commit directly to `main`. Always use feature branches.

### Development Workflow

```bash
# 1. Start from main
git checkout main
git pull origin main

# 2. Create feature branch
git checkout -b feature/add-inventory-tracking

# 3. Make changes and commit atomically
git add api/app/models/inventory.py
git commit -m "feat: add Inventory model with stock tracking"

git add api/app/routers/inventory.py
git commit -m "feat: add inventory CRUD endpoints"

git add src/pages/InventoryManager.tsx
git commit -m "feat: add inventory management UI"

# 4. Push and create PR
git push origin feature/add-inventory-tracking
# Go to GitHub → Create Pull Request

# 5. After review, merge to main
# GitHub will auto-deploy to Vercel
```

### Commit Message Format

```
<type>: <short description>

<optional body explaining why>

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Types:**
| Type | Use For |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructure (no behavior change) |
| `docs` | Documentation |
| `chore` | Dependencies, config |
| `perf` | Performance improvement |

**Examples:**
```bash
# Good: Clear, atomic commits
git commit -m "feat: add stock quantity field to ingredients"
git commit -m "fix: prevent negative order quantities"
git commit -m "refactor: extract WhatsApp formatting to service"
git commit -m "docs: update API endpoint documentation"
```

### Code Review Checkpoints

Before merging any PR, verify:

**Checkpoint 1: Local Verification**
```bash
# Does it build?
npm run build

# Does it lint?
npm run lint

# Does backend start?
cd api && python -m uvicorn app.main:app --reload
```

**Checkpoint 2: Code Quality**
- [ ] No hardcoded values (use environment variables)
- [ ] No `console.log` or `print()` debugging left in code
- [ ] Error handling for API calls
- [ ] TypeScript types are correct (no `any`)
- [ ] Database queries use proper relationships (no N+1)

**Checkpoint 3: User Experience**
- [ ] Tested the actual user flow in browser
- [ ] Mobile responsive (tested on phone or DevTools)
- [ ] Loading states shown during API calls
- [ ] Error messages are user-friendly

**Checkpoint 4: Database Safety**
- [ ] New columns have sensible defaults
- [ ] Foreign keys have proper ON DELETE behavior
- [ ] No data loss on schema changes
- [ ] Migration tested with existing data

### Deployment Commits for This Project

When making deployment-related changes, commit in logical groups:

```bash
# Group 1: Backend configuration
git add api/app/database.py api/app/main.py
git commit -m "feat: configure FastAPI for Vercel serverless deployment

- Use NullPool for PostgreSQL connections (serverless requirement)
- Add lifespan handler for database initialization
- Add health check endpoint

Co-Authored-By: Claude <noreply@anthropic.com>"

# Group 2: Vercel configuration
git add vercel.json api/index.py api/requirements.txt
git commit -m "chore: add Vercel deployment configuration

- Configure serverless function settings
- Add Mangum ASGI adapter
- Add psycopg2-binary for PostgreSQL

Co-Authored-By: Claude <noreply@anthropic.com>"

# Group 3: Frontend configuration
git add src/lib/api.ts vite.config.ts
git commit -m "feat: configure frontend for production API

- Use relative API path in production
- Configure Vite build settings

Co-Authored-By: Claude <noreply@anthropic.com>"

# Group 4: Documentation
git add DEPLOYMENT.md
git commit -m "docs: add comprehensive deployment guide

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push all at once
git push origin main
```

---

## Cost Summary

**For your use case (5 users, 50 orders/week):**

| Service | Tier | Monthly Cost |
|---------|------|--------------|
| Vercel | Hobby (free) | $0 |
| Neon PostgreSQL | Free | $0 |
| GitHub | Free | $0 |
| **Total** | | **$0** |

**When to upgrade:**
- Vercel Pro ($20/mo): If you need custom domains with SSL, team features, or more bandwidth
- Neon Pro ($19/mo): If you exceed 0.5GB storage (unlikely for years)

---

## Quick Reference

### URLs

```
Production App:     https://malo-recipe-master.vercel.app
Vercel Dashboard:   https://vercel.com/your-username/malo-recipe-master
Neon Dashboard:     https://console.neon.tech/app/projects/your-project-id
GitHub Repo:        https://github.com/your-username/malo-recipe-master
```

### Commands

```bash
# Local development
npm run dev                              # Frontend on :5173
cd api && uvicorn app.main:app --reload  # Backend on :8000

# Deploy to production
git add .
git commit -m "feat: description"
git push origin main                     # Auto-deploys

# Check deployment
vercel logs                              # View function logs
curl https://your-app.vercel.app/api/health

# Database backup
pg_dump "$DATABASE_URL" > backup.sql
```

### Environment Variables

| Variable | Development | Production |
|----------|-------------|------------|
| `DATABASE_URL` | (not set - uses SQLite) | `postgresql://...` |
| `VITE_API_URL` | `http://localhost:8000/api` | `/api` |

---

## Support

**Issues with deployment?**
1. Check Vercel function logs
2. Check Neon database connection
3. Review this guide's Troubleshooting section

**Feature requests or bugs?**
- Track in GitHub Issues
- Or update the TODO list in CLAUDE.md

---

*Last updated: 2026-01-30*
*For Frollie Recipe Master v1.0*
