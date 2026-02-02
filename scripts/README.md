# Scripts

## Environment Switching

### switch-env.js

Switches between testing and production Convex deployments.

**Usage:**
```bash
# Switch to testing environment
npm run env:testing

# Switch to production environment
npm run env:prod
```

**What it does:**
1. Copies the appropriate `.env.local.{environment}` file to `.env.local`
2. Displays the active deployment name
3. Shows next steps

**Files:**
- Source: `.env.local.testing` or `.env.local.production`
- Target: `.env.local` (auto-generated, gitignored)

**After switching:**
```bash
npx convex dev   # Start backend with new environment
npm run dev      # Start frontend
```

---

## Adding New Environments

To add a new environment (e.g., staging):

1. Create `.env.local.staging`:
   ```bash
   CONVEX_DEPLOYMENT=dev:exciting-fennec-671:staging
   VITE_CONVEX_URL=https://exciting-fennec-671.convex.cloud
   VITE_CONVEX_SITE_URL=https://exciting-fennec-671.convex.site
   ```

2. Add to `scripts/switch-env.js`:
   ```js
   const envMap = {
     testing: '.env.local.testing',
     production: '.env.local.production',
     staging: '.env.local.staging',  // Add this
     // ...
   };
   ```

3. Add to `.gitignore` (if safe to commit):
   ```
   !.env.local.staging
   ```

4. Add npm script to `package.json`:
   ```json
   "env:staging": "node scripts/switch-env.js staging"
   ```

---

## See Also

- [TESTING_GUIDE.md](../docs/TESTING_GUIDE.md) - Full testing environment documentation
- [DEPLOYMENT.md](../docs/DEPLOYMENT.md) - Production deployment guide
