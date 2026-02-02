# Development Quick Start

## ⚠️ Important Note

**You currently have ONE database** for both development and production. Convex's free tier doesn't support multiple deployments per project. This is fine for development!

---

## 🚀 Start Development (2 minutes)

### Step 1: Start Backend
```bash
npx convex dev
```
Wait for: "Convex functions ready!"

### Step 2: Start Frontend
```bash
npm run dev
```

### Step 3: Open Browser
```
http://localhost:5173
```

---

## 🗑️ Clean Test Data

When your database gets cluttered:

```bash
npx convex dashboard
# Functions tab → Run: orders/deleteAll:deleteAllOrders
```

**This deletes:**
- All orders
- All customers
- Kitchen inventory
- Production records

**This keeps:**
- Recipes
- Products
- Ingredients
- Materials
- Tags

---

## 📊 Quick Commands

| Command | What It Does |
|---------|-------------|
| `npx convex dev` | Start Convex backend |
| `npm run dev` | Start React frontend |
| `npx convex dashboard` | Open database dashboard |
| `npx convex export` | Backup database |

---

## ✅ Current Environment

You have one deployment:
- **Name:** `dev:exciting-fennec-671`
- **Database:** Shared for all development
- **Status:** Clean (orders/customers deleted)

---

## 🔄 Future: Separate Testing

When you have real users, you'll want a separate testing environment. See [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) for options:

1. **Free:** Create second Convex project
2. **Paid:** Upgrade to Convex Pro

For now, the shared database is perfect for development!

---

## 🗄️ Backup & Restore

### Backup Before Risky Changes
```bash
npx convex export --output backup-$(date +%Y%m%d).zip
```

### Restore from Backup
```bash
npx convex import backup.zip
```

---

## 🆘 Troubleshooting

### "Wrong deployment" errors
```bash
# Check current environment
cat .env.local | grep CONVEX_DEPLOYMENT

# Should show: dev:exciting-fennec-671
```

### Port already in use
```bash
# Use different port
PORT=5174 npm run dev
```

### Need fresh database
```bash
npx convex dashboard
# Run: orders/deleteAll:deleteAllOrders
```

---

## 📚 Full Documentation

- [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) - Complete testing guide
- [CLAUDE.md](CLAUDE.md) - Project overview
- [README.md](README.md) - Full README

---

**Questions?** Check [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) for detailed information.
