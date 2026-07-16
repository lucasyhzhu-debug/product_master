# Deployment Guide

> **Purpose:** Convex deployment guide for Frollie Pro.
> **When to read:** When deploying to production or modifying deployment configuration.

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Development Setup](#development-setup)
- [Production Deployment](#production-deployment)
- [Environment Configuration](#environment-configuration)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Future Enhancements](#future-enhancements)

---

## Architecture Overview

### Convex Architecture
```
User Browser
    ↓
Vercel (Frontend Hosting)
    ├── Static Assets (dist/)
    └── SPA Routes → index.html
    ↓
Convex Cloud (Backend)
    ├── WebSocket connection (real-time)
    ├── Queries (reactive reads)
    ├── Mutations (transactional writes)
    └── Convex Database (automatic)
```

**Key Benefits:**
- Real-time data sync across all connected clients
- Automatic scaling (no server management)
- Built-in database with ACID transactions
- Type-safe API (TypeScript throughout)
- No CORS configuration needed (same origin)

### Components
- **Frontend:** React SPA hosted on Vercel (or any static host)
- **Backend:** Convex Cloud (serverless functions + database)
- **Database:** Convex DB (integrated, no separate setup)

---

## Development Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Convex account (free tier available)

### Initial Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd product_master
npm install

# 2. Login to Convex
npx convex login

# 3. Initialize Convex project (first time only)
npx convex dev --init

# 4. Start development servers (in separate terminals)
# Terminal 1: Convex dev server
npx convex dev

# Terminal 2: Vite dev server
npm run dev
```

### Development Workflow

```bash
# Start both servers
npx convex dev      # Watches convex/ for changes, syncs to dev deployment
npm run dev         # Starts Vite at http://localhost:5173

# Access Convex Dashboard
npx convex dashboard

# Seed default data (run in Convex dashboard or via code)
# Go to Dashboard → Functions → tags:seedDefaults → Run
# Go to Dashboard → Functions → menuProducts:seedDefaults → Run
```

---

## Production Deployment

### Step 1: Deploy Convex Backend

```bash
# Deploy to production
npx convex deploy

# This will:
# - Create production deployment (if first time)
# - Sync schema and functions
# - Run any migrations
# - Return production URL
```

### Step 2: Configure Environment

After `convex deploy`, note the production URL:
```
✔ Deployed to https://your-deployment.convex.cloud
```

Create `.env.production`:
```bash
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

### Step 3: Build Frontend

```bash
npm run build
# Creates dist/ folder with static assets
```

### Step 4: Deploy Frontend to Vercel

**Option A: Vercel CLI**
```bash
npm i -g vercel
vercel --prod
```

**Option B: GitHub Integration**
1. Connect GitHub repo to Vercel
2. Set environment variable: `VITE_CONVEX_URL`
3. Deploy automatically on push to main

**Option C: Manual Upload**
- Upload `dist/` folder to any static hosting

### Vercel Configuration

Create `vercel.json` (if not exists):
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Step 5: Seed Production Data

After deployment, seed default data:

1. Open Convex Dashboard: `npx convex dashboard`
2. Switch to production deployment
3. Go to **Functions** tab
4. Run `tags:seedDefaults`
5. Run `menuProducts:seedDefaults`

### Step 6: Verify Deployment

- Frontend loads: `https://your-app.vercel.app`
- Data syncs in real-time
- CRUD operations work

---

## Environment Configuration

### Development (.env.local)
```bash
# Convex automatically manages this in development
# No manual configuration needed
```

### Production (.env.production)
```bash
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

### Vercel Environment Variables
Set in Vercel Dashboard → Project Settings → Environment Variables:

| Variable | Value | Environment |
|----------|-------|-------------|
| `VITE_CONVEX_URL` | `https://your-deployment.convex.cloud` | Production |

---

## Monitoring & Maintenance

### Convex Dashboard

Access via `npx convex dashboard` or https://dashboard.convex.dev

**Available Tools:**
- **Functions:** View and run queries/mutations manually
- **Data:** Browse and edit database tables
- **Logs:** Real-time function execution logs
- **Metrics:** Request counts, latency, errors
- **Deployments:** View deployment history

### Common Maintenance Tasks

**View Logs:**
```bash
npx convex logs
# or
npx convex logs --follow  # Real-time logs
```

**Reset Development Database:**
```bash
npx convex dev --reset
```

**Export Data (via Dashboard):**
1. Go to Data tab
2. Select table
3. Export as JSON

**Run Seed Functions:**
```bash
# Via CLI
npx convex run tags:seedDefaults
npx convex run menuProducts:seedDefaults
```

---

## Future Enhancements

### Security
- [ ] Add authentication (Convex Auth or Clerk integration)
- [ ] Implement role-based access control (RBAC)
- [ ] Add rate limiting (Convex built-in)

### Monitoring
- [ ] Set up error alerting (Convex → Slack/Email)
- [ ] Add custom metrics tracking
- [ ] Performance monitoring dashboard

### Scalability
- [ ] Review index usage for large datasets
- [ ] Implement pagination for large lists
- [ ] Consider data archival strategy

### Backup & Recovery
- [ ] Convex handles automatic backups
- [ ] Set up point-in-time recovery (Convex Pro)
- [ ] Document disaster recovery plan

---

## Troubleshooting

### Common Issues

**"Convex deployment not found"**
```bash
# Re-initialize
npx convex dev --init
```

**"Schema validation failed"**
- Check `convex/schema.ts` for errors
- Run `npx convex dev` to see detailed errors

**"Function not found"**
- Ensure file exports the function
- Check function path matches `api.folder.function`

**Real-time updates not working**
- Check WebSocket connection in browser DevTools
- Verify `VITE_CONVEX_URL` is set correctly

**Slow queries**
- Add indexes to `schema.ts` for filtered fields
- Use `.withIndex()` in queries

### Getting Help

- Convex Docs: https://docs.convex.dev
- Convex Discord: https://convex.dev/community
- GitHub Issues: Report project-specific issues
