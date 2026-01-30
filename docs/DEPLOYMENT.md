# Deployment Guide

> **Purpose:** Production deployment guide for Malo Recipe Master.
> **When to read:** When deploying to production or modifying deployment configuration.

## Table of Contents
- [Current Production Setup (Vercel)](#current-production-setup-vercel)
- [Deployment Steps](#deployment-steps)
- [Configuration](#configuration)
- [Future Enhancements](#future-enhancements)

---

## Current Production Setup (Vercel)

### Architecture
- Monolithic deployment on Vercel
- Frontend: Static files served from `dist/`
- Backend: Serverless functions in `api/`
- Database: PostgreSQL with NullPool (serverless-optimized)

### Request Flow
```
Vercel Edge Network
    ↓
Static Assets (dist/) - Served directly
    ↓
SPA Routes (/*) → index.html
    ↓
API Routes (/api/*) → Vercel Serverless Functions
    ↓
api/index.py (Mangum ASGI Adapter)
    ↓
FastAPI Application (api/app/main.py)
    ↓
PostgreSQL Database (NullPool for serverless)
```

---

## Deployment Steps

### 1. Prepare PostgreSQL Database

```bash
# Provision PostgreSQL (e.g., Supabase, Neon, Railway)
# Note the connection string: postgresql://user:pass@host:5432/dbname
```

### 2. Migrate Data (if coming from SQLite)

```bash
cd api/scripts
python migrate_sqlite_to_pg.py \
  --sqlite-path ../data/malo_recipes.db \
  --postgres-url "postgresql://user:pass@host:5432/dbname"
```

### 3. Configure Environment Variables in Vercel

Set these in Vercel Dashboard → Project Settings → Environment Variables:

- `DATABASE_URL` - PostgreSQL connection string
- `VITE_API_URL` - Set to `/api` (relative path for same domain)

### 4. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Preview deployment
vercel

# Production deployment
vercel --prod
```

### 5. Verify Deployment

- Check frontend loads: `https://your-app.vercel.app`
- Check API health: `https://your-app.vercel.app/api/dashboard/stats`
- Test CRUD operations via UI

---

## Configuration

### vercel.json
```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" },
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

### Environment Variables

**Production (.env in Vercel dashboard)**
```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
VITE_API_URL=/api
```

**Development (local .env)**
```bash
SQLITE_PATH=api/data/malo_recipes.db
VITE_API_URL=http://localhost:8000/api
```

### Database Configuration

The application auto-detects the database type:

- If `DATABASE_URL` starts with `postgresql://` → PostgreSQL with NullPool
- Otherwise → SQLite at `SQLITE_PATH` (default: `api/data/malo_recipes.db`)

---

## Future Enhancements

### Security
- [ ] Add authentication (consider Clerk or Auth.js)
- [ ] Implement role-based access control (RBAC)
- [ ] Add rate limiting for API endpoints
- [ ] Enable HTTPS-only cookies

### Monitoring
- [ ] Add Sentry for error tracking
- [ ] Implement structured logging
- [ ] Add performance monitoring (Vercel Analytics)
- [ ] Database query performance monitoring

### Scalability
- [ ] Consider read replicas for database
- [ ] Add Redis for caching (e.g., Upstash)
- [ ] Implement database connection pooling (if moving off serverless)
- [ ] CDN for static assets (Vercel Edge Network already provides this)

### Backup & Recovery
- [ ] Automated daily PostgreSQL backups
- [ ] Point-in-time recovery setup
- [ ] Disaster recovery plan documentation
