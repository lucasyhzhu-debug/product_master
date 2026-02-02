# Frollie Recipe Master

A real-time recipe and product concept management system for an Indonesian FMCG snack company. Tracks food recipes, packaging recipes, and product concepts with full versioning, cost calculations, margin analysis, and kitchen production management.

## ⚡ Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Backend** | Convex | ^1.31.7 |
| **Database** | Convex DB | Real-time serverless |
| **Frontend** | React + TypeScript | 19.2.0 |
| **Build Tool** | Vite | 7.2.4 |
| **Styling** | Tailwind CSS | 4.1.18 |
| **UI Components** | shadcn/ui (Radix) | latest |
| **State** | Convex React Hooks | Real-time reactive |
| **Routing** | React Router | 7.13.0 |
| **Animations** | Framer Motion | 11.15.0 |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or pnpm

### Installation

```bash
# Install dependencies
npm install

# Start Convex backend (Terminal 1)
npx convex dev

# Start React frontend (Terminal 2)
npm run dev
```

### First Run Setup

1. **Convex will auto-configure** your deployment on first `npx convex dev`
2. **Seed default data** via Convex Dashboard → Functions:
   - Run: `tags:seedDefaults`
   - Run: `menuProducts:seedDefaults`
3. Open browser: http://localhost:5173

---

## 🧪 Development Database

**Single Database Setup:** Convex free tier provides one dev deployment. Production and testing share the same database.

**Clean test data when needed:**

```bash
npx convex dashboard
# Functions → Run: orders/deleteAll:deleteAllOrders
```

**For true isolation:** Create a separate Convex project or upgrade to Convex Pro. See [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) for details.

**Quick Start Guide:** [TESTING_QUICK_START.md](TESTING_QUICK_START.md)

---

## 📁 Project Structure

```
product_master/
├── convex/                    # Backend (Convex serverless)
│   ├── schema.ts             # Database schema (19 tables)
│   ├── lib/                  # Shared utilities
│   │   └── costCalculator.ts
│   ├── recipes/              # Recipe queries/mutations
│   ├── packaging/            # Packaging queries/mutations
│   ├── products/             # Product queries/mutations
│   ├── orders/               # Order management + WhatsApp
│   ├── customers/            # Customer management
│   ├── ingredients/          # Ingredient management
│   ├── materials/            # Packaging materials
│   ├── tags/                 # Tag management
│   ├── menuProducts/         # Menu product definitions
│   └── dashboard/            # Dashboard statistics
├── src/                      # Frontend (React)
│   ├── components/
│   │   ├── ui/              # shadcn/ui components
│   │   ├── layout/          # Header, Layout
│   │   ├── shared/          # Reusable components
│   │   ├── recipes/         # Recipe components
│   │   ├── packaging/       # Packaging components
│   │   ├── products/        # Product components
│   │   ├── orders/          # Order components (17 files)
│   │   └── onboarding/      # Onboarding tour
│   ├── pages/               # Page components
│   │   ├── Dashboard.tsx
│   │   ├── RecipeEditor.tsx
│   │   ├── PackagingEditor.tsx
│   │   ├── ProductEditor.tsx
│   │   ├── OrderManager.tsx
│   │   ├── OrderDetail.tsx
│   │   └── KitchenView.tsx
│   ├── hooks/
│   │   └── convex/          # Convex React hooks (11 files)
│   └── lib/
│       ├── types.ts         # TypeScript interfaces
│       └── utils.ts         # Utility functions
├── docs/                    # Documentation
│   ├── SCHEMA.md           # Database schema
│   ├── CODE_STYLE.md       # Coding conventions
│   ├── WORKFLOW.md         # Git workflow
│   ├── API_REFERENCE.md    # Backend API reference
│   ├── DEPLOYMENT.md       # Deployment guide
│   ├── TESTING_GUIDE.md    # Testing environment guide
│   ├── ENVIRONMENTS.md     # Environment configuration
│   └── CHANGELOG.md        # Version history
├── scripts/                # Utility scripts
│   └── switch-env.js       # Environment switcher
├── CLAUDE.md               # Project overview for AI
├── TESTING_QUICK_START.md  # 5-minute testing guide
└── README.md               # This file
```

---

## 🔑 Key Features

### 📊 Recipe & Packaging Management
- Multi-component recipes with linked sub-recipes
- Version control (immutable versions, copy-from-any)
- Cost calculations per gram/unit
- Reusable component system

### 📦 Product Concepts
- Link recipe + packaging versions
- COGS breakdown (recipe cost + packaging cost)
- Contribution margin analysis
- SKU-level cost tracking

### 🛒 Order Management
- Real-time order tracking
- WhatsApp receipt generation
- Customer profiles with history
- Channel/agency attribution

### 👨‍🍳 Kitchen Production View
- Real-time ball inventory system
- Auto-allocation to pending orders
- Visual package filling with animations
- Production record tracking

### 📈 Dashboard & Analytics
- Recipe, packaging, product carousels
- Order statistics and trends
- Cost analysis
- Channel performance

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [CLAUDE.md](CLAUDE.md) | AI-friendly project overview |
| [docs/SCHEMA.md](docs/SCHEMA.md) | Database schema reference |
| [docs/CODE_STYLE.md](docs/CODE_STYLE.md) | TypeScript/Convex conventions |
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | Git workflow & code review |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Backend queries/mutations |
| [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) | Testing environment setup |
| [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md) | Environment configuration |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment |
| [TESTING_QUICK_START.md](TESTING_QUICK_START.md) | 5-minute testing guide |

---

## 🔧 Available Commands

### Development
```bash
npm run dev              # Start frontend dev server
npx convex dev           # Start Convex backend
npm run build            # Build for production
npm run preview          # Preview production build
```

### Environment Management
```bash
npm run env:prod         # Switch to production
npm run env:testing      # Switch to testing
```

### Code Quality
```bash
npm run lint             # Run ESLint
npm run type-check       # TypeScript type checking
npm test                 # Run tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate coverage report
```

### Convex
```bash
npx convex dev           # Start dev server
npx convex deploy        # Deploy to production
npx convex dashboard     # Open Convex dashboard
npx convex export        # Export database
npx convex import        # Import database
```

---

## 🎯 Business Rules

1. **Unit Conversion**: kg→g, l→ml, m→cm. 1 ml = 1 g for liquids.
2. **Version Immutability**: Saved versions cannot be edited. Create new version instead.
3. **Linked Components**: Recipes can reference other recipe versions as components.
4. **Product Pinning**: Products stay on selected recipe/packaging versions. Manual update required.
5. **Reusable Components**: Only single-component recipes marked as reusable appear in component selection.
6. **Deletion Rules**: Recipes/packaging cannot be deleted if used in products.
7. **Order Numbers**: Format `MMDD-NNN` (e.g., 0129-001) for bank transfer reference.
8. **Ball Distribution**: Kitchen tray system with auto-allocation to pending orders.

---

## 🗄️ Database Schema

**19 Tables:**
- `recipes`, `recipeVersions`, `recipeIngredients`, `recipeComponents`
- `packaging`, `packagingVersions`, `packagingMaterials`
- `products`, `productVersions`
- `ingredients`, `materials`, `tags`
- `orders`, `orderItems`, `customers`
- `menuProducts`, `menuProductComponents`
- `channels`, `shippingOptions`, `productionUnitTypes`

See [docs/SCHEMA.md](docs/SCHEMA.md) for full schema documentation.

---

## 🔐 Environment Variables

**Managed Environments:**

| File | Purpose | Committed? |
|------|---------|-----------|
| `.env.local` | Active environment (auto-generated) | ❌ No |
| `.env.local.production` | Production config | ✅ Yes |
| `.env.local.testing` | Testing config | ✅ Yes |
| `.env.example` | Template | ✅ Yes |

**Switch environments:**
```bash
npm run env:prod        # Production
npm run env:testing     # Testing
```

**Configuration:**
```bash
CONVEX_DEPLOYMENT=dev:exciting-fennec-671          # Production
CONVEX_DEPLOYMENT=dev:exciting-fennec-671:testing  # Testing
VITE_CONVEX_URL=https://exciting-fennec-671.convex.cloud
```

See [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md) for detailed configuration.

---

## 🧪 Testing

### Unit Tests
```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:ui          # Open UI
npm run test:coverage    # Generate coverage
```

### Testing Environment
```bash
npm run env:testing      # Switch to test database
npx convex dev           # Start backend
npm run dev              # Start frontend

# Test without affecting production data!
```

See [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) for workflows.

---

## 🚀 Deployment

### Production Deployment

```bash
# 1. Build frontend
npm run build

# 2. Deploy to Convex
npm run env:prod
npx convex deploy

# 3. Deploy to Vercel (frontend)
vercel --prod
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full deployment guide.

---

## 📖 Architecture

### Backend (Convex)
- **Serverless functions** for queries/mutations
- **Real-time database** with reactive queries
- **Automatic scaling** and caching
- **Schema validation** via TypeScript

### Frontend (React)
- **Real-time updates** via Convex hooks
- **Optimistic updates** for instant UX
- **Component-based architecture**
- **Type-safe** with TypeScript

### Data Flow
```
User Action
    ↓
React Component
    ↓
Convex Mutation (useMutation hook)
    ↓
Convex Backend (mutation function)
    ↓
Database Write
    ↓
Real-time Update
    ↓
Convex Query (useQuery hook)
    ↓
React Component Re-render
```

---

## 🛠️ Common Tasks

### Add a New Field to Recipe
1. Edit `convex/schema.ts` (add field to `recipes` table)
2. Edit `convex/recipes/mutations.ts` (update create/update)
3. Edit `src/hooks/convex/useRecipes.ts` (update TypeScript types)
4. Edit `src/pages/RecipeEditor.tsx` (add UI field)
5. Test in testing environment first!

### Create a New Page
1. Create `src/pages/NewPage.tsx`
2. Add route in `src/App.tsx`
3. Create components in `src/components/newpage/`
4. Create Convex hooks if needed

### Add a Dashboard Widget
1. Create query in `convex/dashboard/queries.ts`
2. Add hook in `src/hooks/convex/useDashboard.ts`
3. Create component in `src/components/dashboard/`
4. Add to `src/pages/Dashboard.tsx`

---

## 🤝 Contributing

### Git Workflow

**Mandatory workflow for ALL changes:**

1. Create new branch from `main`
2. Make changes & commit
3. Test in testing environment
4. Code review & audit
5. Merge to `main`
6. Update `docs/CHANGELOG.md`

**NO direct commits to main.**

See [docs/WORKFLOW.md](docs/WORKFLOW.md) for full workflow.

---

## 📝 Version History

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for detailed version history.

**Latest:** Kitchen View with ball distribution system, Order management, WhatsApp receipts

---

## 🆘 Troubleshooting

### "Wrong deployment" Error
```bash
# Check active environment
cat .env.local | grep CONVEX_DEPLOYMENT

# Restart Convex dev server
npx convex dev
```

### Port Already in Use
```bash
# Use different port
PORT=5174 npm run dev
```

### Schema Mismatch
```bash
# Redeploy schema
npx convex deploy
```

### Build Errors
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
npm run build
```

See [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md#troubleshooting) for more.

---

## 📞 Support

- **Documentation**: See `docs/` folder
- **Issues**: GitHub Issues
- **Questions**: Team chat

---

## 📄 License

Private - Internal use only

---

## 🎉 Quick Links

- [Start Development](#quick-start)
- [Testing Guide](docs/TESTING_GUIDE.md)
- [API Reference](docs/API_REFERENCE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Schema Documentation](docs/SCHEMA.md)
- [Code Style Guide](docs/CODE_STYLE.md)
