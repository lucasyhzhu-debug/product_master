import { Link } from "react-router-dom";
import {
  ShoppingCart,
  UtensilsCrossed,
  Package,
  Warehouse,
  MapPin,
  CalendarRange,
  Salad,
  Truck,
  TrendingUp,
  Store,
  Circle,
  Users,
  MessageSquare,
  Tag,
  Ticket,
  UserCog,
  ChevronRight,
  Utensils,
  FileText,
  Receipt,
  BarChart3,
  HandCoins,
  Landmark,
  DollarSign,
  BookOpen,
  CreditCard,
  Calculator,
  BookMarked,
  Building2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavLink {
  label: string;
  path: string;
}

interface AreaCard {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  primaryPath: string;
  links: NavLink[];
  /** Return true if the user should see this card at all */
  visible: (hp: ReturnType<typeof useAuth>["hasPermission"]) => boolean;
}

// ---------------------------------------------------------------------------
// Hub area definitions
// ---------------------------------------------------------------------------

const HUB_AREAS: AreaCard[] = [
  {
    title: "Operations",
    description: "Day-to-day order management, kitchen production, and packaging.",
    icon: ShoppingCart,
    color: "text-blue-500",
    primaryPath: "/orders",
    links: [
      { label: "Orders", path: "/orders" },
      { label: "Kitchen", path: "/kitchen" },
      { label: "Packaging", path: "/packaging" },
    ],
    visible: (hp) => hp("canAccessOrders") || hp("canAccessKitchen"),
  },
  {
    title: "Inventory & Supply",
    description: "Track stock levels, storage locations, and plan restocking.",
    icon: Warehouse,
    color: "text-emerald-500",
    primaryPath: "/inventory",
    links: [
      { label: "Inventory", path: "/inventory" },
      { label: "Locations", path: "/inventory/locations" },
      { label: "Planner", path: "/restock-planner" },
      { label: "Ingredients", path: "/ingredients" },
      { label: "Bulk Prices", path: "/bulk-price-update" },
    ],
    visible: (hp) => hp("canAccessInventory"),
  },
  {
    title: "Sales & Distribution",
    description: "Revenue analytics, GoFood depots, GrabFood, and K3Mart cockpit.",
    icon: TrendingUp,
    color: "text-violet-500",
    primaryPath: "/gofood-depot",
    links: [
      { label: "GoFood Depot", path: "/gofood-depot" },
      { label: "GrabFood", path: "/grabfood" },
      { label: "Sales Analytics", path: "/sales" },
      { label: "K3Mart Cockpit", path: "/k3mart-cockpit" },
    ],
    visible: (hp) => hp("canAccessDashboard"),
  },
  {
    title: "Financials",
    description: "Income statement, expense tracking, reimbursements, and payroll.",
    icon: FileText,
    color: "text-amber-500",
    primaryPath: "/financials",
    links: [
      { label: "Income Statement", path: "/financials" },
      { label: "Expenses", path: "/expenses" },
      { label: "Exp. Analytics", path: "/expense-analytics" },
      { label: "Reimburse", path: "/reimbursements" },
      { label: "Payroll", path: "/payroll" },
    ],
    visible: (hp) =>
      hp("canAccessDashboard") ||
      hp("canSubmitExpenses") ||
      hp("canManageReimbursements"),
  },
  {
    title: "Accounting",
    description: "Journal entries, chart of accounts, and bank account management.",
    icon: Calculator,
    color: "text-teal-500",
    primaryPath: "/journal",
    links: [
      { label: "Journal Entry", path: "/journal" },
      { label: "Chart of Accounts", path: "/accounts" },
      { label: "Bank Accounts", path: "/bank-accounts" },
      { label: "Historical Import", path: "/import" },
      { label: "Asset Register", path: "/assets" },
    ],
    visible: (hp) => hp("canManageReimbursements") || hp("canAccessAssets"),
  },
  {
    title: "Configuration",
    description: "Production components, customers, and WhatsApp messaging.",
    icon: Circle,
    color: "text-orange-500",
    primaryPath: "/components/production",
    links: [
      { label: "Production Components", path: "/components/production" },
      { label: "Customers", path: "/customers" },
      { label: "WhatsApp Templates", path: "/whatsapp-templates" },
    ],
    visible: (hp) =>
      hp("canAccessInventory") ||
      hp("canAccessOrders") ||
      hp("canManageWhatsAppTemplates"),
  },
  {
    title: "Admin",
    description: "Menu products, vouchers, and user management.",
    icon: UserCog,
    color: "text-rose-500",
    primaryPath: "/menu-products",
    links: [
      { label: "Menu Products", path: "/menu-products" },
      { label: "Vouchers", path: "/vouchers" },
      { label: "Users", path: "/users" },
    ],
    visible: (hp) =>
      hp("canAccessMenuProducts") ||
      hp("canAccessVouchers") ||
      hp("canAccessUsers"),
  },
  {
    title: "Help & Training",
    description: "Step-by-step guides and FAQs for using Frollie.",
    icon: BookOpen,
    color: "text-sky-500",
    primaryPath: "/help",
    links: [
      { label: "All Guides", path: "/help" },
      { label: "Expenses Guide", path: "/help/expenses" },
    ],
    visible: () => true,
  },
];

// Map area titles to icon sets for the link pills (optional extra icons)
const LINK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Orders: ShoppingCart,
  Kitchen: UtensilsCrossed,
  Packaging: Package,
  Inventory: Warehouse,
  Locations: MapPin,
  "Planner": CalendarRange,
  Ingredients: Salad,
  "GoFood Depot": Truck,
  "Sales Analytics": TrendingUp,
  "GrabFood": Utensils,
  "K3Mart Cockpit": Store,
  "Production Components": Circle,
  Customers: Users,
  "WhatsApp Templates": MessageSquare,
  "Menu Products": Tag,
  Vouchers: Ticket,
  Users: UserCog,
  "Income Statement": FileText,
  Expenses: Receipt,
  "Exp. Analytics": BarChart3,
  Reimburse: HandCoins,
  "Bank Accounts": Landmark,
  Payroll: DollarSign,
  "Journal Entry": BookMarked,
  "Chart of Accounts": BookOpen,
  "Historical Import": FileText,
  "All Guides": BookOpen,
  "Expenses Guide": CreditCard,
  "Asset Register": Building2,
  "Bulk Prices": DollarSign,
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AreaNavCard({ area }: { area: AreaCard }) {
  const Icon = area.icon;

  return (
    <Card className="group flex flex-col overflow-hidden border transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg bg-muted", area.color)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">{area.title}</CardTitle>
          </div>
          <Link
            to={area.primaryPath}
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity",
              area.color
            )}
          >
            Open
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <CardDescription className="text-xs leading-relaxed mt-1">
          {area.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0 pb-4 flex-1">
        <div className="flex flex-wrap gap-1.5">
          {area.links.map((link) => {
            const LinkIcon = LINK_ICONS[link.label];
            return (
              <Link
                key={link.path}
                to={link.path}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                  "text-muted-foreground border-border",
                  "hover:border-primary/40 hover:text-foreground hover:bg-accent transition-colors"
                )}
              >
                {LinkIcon && <LinkIcon className="h-3 w-3" />}
                {link.label}
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// HubPage
// ---------------------------------------------------------------------------

export function HubPage() {
  const { user, hasPermission } = useAuth();

  const visibleAreas = HUB_AREAS.filter((area) => area.visible(hasPermission));

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="py-6 px-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <UtensilsCrossed className="h-5 w-5 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Frollie Pro
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting}
          {user?.name ? `, ${user.name}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          What would you like to work on today?
        </p>
      </div>

      {/* Navigation cards grid */}
      {visibleAreas.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No areas available for your role.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleAreas.map((area) => (
            <AreaNavCard key={area.title} area={area} />
          ))}
        </div>
      )}
    </div>
  );
}
