import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  ShoppingCart,
  UtensilsCrossed,
  Users,
  LogOut,
  Menu,
  MessageSquare,
  Ticket,
  Warehouse,
  Circle,
  Tag,
  TrendingUp,
  Store,
  CalendarRange,
  Settings,
  ChevronDown,
  Sun,
  Moon,
  Monitor,
  Check,
  Truck,
  MapPin,
  Leaf,
  FileText,
  Receipt,
  Landmark,
  DollarSign,
  BarChart3,
  HandCoins,
  CircleHelp,
  Building2,
  Calculator,
  BookMarked,
  FileUp,
  ClipboardCheck,
  UserCheck,
  LayoutDashboard,
  Boxes,
  Database,
  Split,
  Send,
  Contact,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ROLE_PERMISSIONS, type UserRole } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useScrollDirection } from '@/hooks/useScrollDirection';

const ROLE_COLORS: Record<UserRole, { bg: string; text: string }> = {
  admin: { bg: 'bg-[var(--color-role-admin-bg)]', text: 'text-[var(--color-role-admin)]' },
  manager: { bg: 'bg-[var(--color-role-manager-bg)]', text: 'text-[var(--color-role-manager)]' },
  order_staff: { bg: 'bg-[var(--color-role-order-staff-bg)]', text: 'text-[var(--color-role-order-staff)]' },
  kitchen: { bg: 'bg-[var(--color-role-kitchen-bg)]', text: 'text-[var(--color-role-kitchen)]' },
};

function UserInitials({ name, role, className }: { name: string; role: UserRole; className?: string }) {
  const initials = name.slice(0, 2).toUpperCase();
  const colors = ROLE_COLORS[role];
  return (
    <div className={cn('flex items-center justify-center rounded-full font-semibold', colors.bg, colors.text, className)}>
      {initials}
    </div>
  );
}

type PermissionKey = keyof (typeof ROLE_PERMISSIONS)["admin"];

type NavLink = {
  kind?: 'link';
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: PermissionKey;
  rolesAllowed?: UserRole[];
  preload?: () => void;
};

type NavSeparator = { kind: 'separator' };

type NavItem = NavLink | NavSeparator;

const isSeparator = (item: NavItem): item is NavSeparator =>
  item.kind === 'separator';

type NavGroup = {
  label: string;
  mobileTitle?: string;  // Override the label for the mobile section heading (used when desktop needs a compact alias)
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

// Prefetch factories for hover prefetching — fire-and-forget dynamic imports
const _prefetchOrders = () => import('@/pages/OrderManager');
const _prefetchKitchen = () => import('@/pages/KitchenViewV2');
const _prefetchInventory = () => import('@/pages/InventoryManager');
const _prefetchRestock = () => import('@/pages/DispatchPlanner');
const _prefetchGoFood = () => import('@/pages/GoFoodDepotManager');

// Main nav items - top-level tabs (Orders + CRM)
const mainNavItems: NavItem[] = [
  { path: '/orders', label: 'Orders', icon: ShoppingCart, permission: 'canAccessOrders', preload: _prefetchOrders },
  { path: '/crm', label: 'CRM', icon: Contact, permission: 'canAccessCrm' },
];

// Dashboards dropdown - sales & analytics
const dashboardItems: NavItem[] = [
  { path: '/sales', label: 'Sales', icon: TrendingUp, permission: 'canAccessSalesAnalytics' },
  { path: '/analytics', label: 'Analytics', icon: BarChart3, permission: 'canAccessDashboard' },
];

// Ops dropdown - kitchen, inventory, planner, my-performance, depot surfaces
const opsItems: NavItem[] = [
  { path: '/kitchen', label: 'Kitchen', icon: UtensilsCrossed, permission: 'canAccessKitchen', preload: _prefetchKitchen },
  { path: '/my-performance', label: 'My Performance', icon: UserCheck, permission: 'canAccessKitchen', rolesAllowed: ['kitchen', 'order_staff'] },
  { path: '/inventory', label: 'Inventory', icon: Warehouse, permission: 'canAccessInventory', preload: _prefetchInventory },
  { path: '/restock-planner', label: 'Planner', icon: CalendarRange, permission: 'canAccessDashboard', preload: _prefetchRestock },
  { path: '/k3mart-cockpit', label: 'K3Mart', icon: Store, permission: 'canAccessSalesAnalytics' },
  { path: '/gofood-depot', label: 'GoFood Depot', icon: Truck, permission: 'canAccessDashboard', preload: _prefetchGoFood },
  { path: '/grabfood', label: 'GrabFood', icon: UtensilsCrossed, permission: 'canAccessSalesAnalytics' },
];

// Finances & Accounting dropdown - merged financial + accounting pages
const financeItems: NavItem[] = [
  { path: '/financials', label: 'Income Statement', icon: FileText, permission: 'canAccessDashboard' },
  { path: '/expenses', label: 'Expenses', icon: Receipt, permission: 'canSubmitExpenses' },
  { path: '/expenses/approve', label: 'Approvals', icon: ClipboardCheck, permission: 'canApproveExpenses' },
  { path: '/expense-analytics', label: 'Exp. Analytics', icon: BarChart3, permission: 'canAccessExpenseAnalytics' },
  { path: '/reimbursements', label: 'Reimburse', icon: HandCoins, permission: 'canManageReimbursements' },
  { path: '/payroll', label: 'Payroll', icon: DollarSign, permission: 'canManageReimbursements' },
  { path: '/staff-performance', label: 'Staff Perf.', icon: UserCheck, permission: 'canAccessDashboard' },
  { kind: 'separator' },
  { path: '/journal', label: 'Journal Entry', icon: BookMarked, permission: 'canManageReimbursements' },
  { path: '/accounts', label: 'Chart of Accounts', icon: Landmark, permission: 'canManageReimbursements' },
  { path: '/bank-accounts', label: 'Bank Accounts', icon: Landmark, permission: 'canManageReimbursements' },
  { path: '/bank-reconciliation', label: 'Bank Reconciliation', icon: Landmark, rolesAllowed: ['manager', 'admin'] },
  { path: '/bank-rules', label: 'Bank Rules', icon: BookMarked, rolesAllowed: ['admin'] },
  { path: '/import', label: 'Historical Import', icon: FileUp, permission: 'canManageReimbursements' },
  { path: '/assets', label: 'Asset Register', icon: Building2, permission: 'canAccessAssets' },
];

// Config dropdown - Help + configuration + admin items (separators between groups)
const configItems: NavItem[] = [
  { path: '/help', label: 'Help', icon: CircleHelp },
  { kind: 'separator' },
  { path: '/components/production', label: 'Production', icon: Circle, permission: 'canAccessInventory' },
  { path: '/ingredients', label: 'Ingredients', icon: Leaf, permission: 'canAccessIngredients' },
  { path: '/inventory/locations', label: 'Locations', icon: MapPin, permission: 'canAccessInventory' },
  { path: '/whatsapp-templates', label: 'WhatsApp', icon: MessageSquare, permission: 'canManageWhatsAppTemplates' },
  { path: '/customers', label: 'Customers', icon: Users, permission: 'canAccessOrders' },
  { path: '/bulk-price-update', label: 'Bulk Prices', icon: Calculator, permission: 'canAccessIngredients' },
  { kind: 'separator' },
  { path: '/menu-products', label: 'Products', icon: Tag, permission: 'canAccessMenuProducts' },
  { path: '/vouchers', label: 'Vouchers', icon: Ticket, permission: 'canAccessVouchers' },
  { path: '/users', label: 'Users', icon: Users, permission: 'canAccessUsers' },
  { path: '/settings/business', label: 'Settings', icon: Settings, permission: 'canAccessBusinessSettings' },
  { path: '/admin/telegram-chats', label: 'Telegram Chats', icon: Send, permission: 'canAccessTelegramChats' },
  { path: '/admin/channel-routing', label: 'Channel Routing', icon: Split, rolesAllowed: ['admin'] },
  { path: '/admin/unlinked-products-backfill', label: 'Unlinked Products Backfill', icon: Database, rolesAllowed: ['admin'] },
];

// Collapse adjacent separators and strip leading/trailing ones after permission filtering
function trimSeparators(items: NavItem[]): NavItem[] {
  const out: NavItem[] = [];
  for (const it of items) {
    if (isSeparator(it)) {
      const prev = out[out.length - 1];
      if (!prev || isSeparator(prev)) continue;
    }
    out.push(it);
  }
  while (out.length && isSeparator(out[out.length - 1])) out.pop();
  return out;
}

export function Header() {
  const location = useLocation();
  const { user, logout, hasPermission } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isVisible = useScrollDirection();

  const filterItems = (items: NavItem[]): NavItem[] => {
    if (!user) return [];
    return trimSeparators(
      items.filter(item => {
        if (isSeparator(item)) return true;
        if (item.permission && !hasPermission(item.permission)) return false;
        if (item.rolesAllowed && !item.rolesAllowed.includes(user.role)) return false;
        return true;
      }),
    );
  };

  const visibleMainItems = filterItems(mainNavItems);

  // Dropdown groups - rendered in this order on desktop (Orders link is interleaved after Dashboards)
  // and as vertical sections on mobile.
  const navGroups: NavGroup[] = [
    { label: 'Dashboards', icon: LayoutDashboard, items: filterItems(dashboardItems) },
    { label: 'Ops', icon: Boxes, items: filterItems(opsItems) },
    { label: 'Finance', mobileTitle: 'Finances & Accounting', icon: Landmark, items: filterItems(financeItems) },
    { label: 'Config', icon: Settings, items: filterItems(configItems) },
  ];

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  const isDropdownActive = (items: NavItem[]) =>
    items.some(item => !isSeparator(item) && isActive(item.path));

  // Count non-separator items for "should we render this dropdown?" decisions
  const hasRealItems = (items: NavItem[]) => items.some(item => !isSeparator(item));

  return (
    <motion.header
      initial={{ y: 0 }}
      animate={{ y: isVisible ? 0 : '-100%' }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="fixed top-0 left-0 right-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 flex h-14 items-center justify-between">
        {/* Logo and brand */}
        <div className="flex items-center space-x-4">
          {/* Mobile menu button */}
          {user && (
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 flex flex-col">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <UtensilsCrossed className="h-5 w-5 text-primary" />
                    Menu
                  </SheetTitle>
                </SheetHeader>

                {/* User info at top of mobile sheet */}
                {user && (
                  <div className="flex items-center gap-3 px-3 py-3 mt-2 rounded-lg bg-muted/50">
                    <UserInitials name={user.name} role={user.role} className="w-9 h-9 text-sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{user.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">{user.role.replace('_', ' ')}</div>
                    </div>
                  </div>
                )}

                <nav className="flex flex-col space-y-1 mt-4 flex-1 overflow-y-auto">
                  {/* Dashboards first, then Orders (top-level), then Ops / Finance / Config */}
                  {hasRealItems(navGroups[0].items) && (
                    <MobileSection
                      title={navGroups[0].mobileTitle ?? navGroups[0].label}
                      items={navGroups[0].items}
                      isActive={isActive}
                      onNavigate={() => setMobileMenuOpen(false)}
                    />
                  )}

                  {hasRealItems(visibleMainItems) && (
                    <div className="pt-3">
                      {visibleMainItems.map((item) =>
                        isSeparator(item) ? null : renderMobileItem(item, isActive, () => setMobileMenuOpen(false))
                      )}
                    </div>
                  )}

                  {navGroups.slice(1).map(group =>
                    hasRealItems(group.items) && (
                      <MobileSection
                        key={group.label}
                        title={group.mobileTitle ?? group.label}
                        items={group.items}
                        isActive={isActive}
                        onNavigate={() => setMobileMenuOpen(false)}
                      />
                    )
                  )}
                </nav>

                {/* Theme + Logout at bottom of mobile sheet */}
                <div className="border-t pt-3 mt-3 space-y-1">
                  <div className="flex items-center gap-1 px-3 py-1.5">
                    <span className="text-xs font-medium text-muted-foreground mr-auto">Theme</span>
                    {([
                      { value: 'light' as const, icon: Sun, label: 'Light' },
                      { value: 'dark' as const, icon: Moon, label: 'Dark' },
                      { value: 'system' as const, icon: Monitor, label: 'System' },
                    ]).map(({ value, icon: Icon, label }) => (
                      <Button
                        key={value}
                        variant={theme === value ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setTheme(value)}
                        title={label}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {theme === value && <Check className="h-3 w-3 ml-1" />}
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      logout();
                    }}
                  >
                    <LogOut className="h-5 w-5 mr-3" />
                    Sign Out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          )}

          <Link to="/home" className="flex items-center space-x-2">
            <UtensilsCrossed className="h-6 w-6 text-primary" />
            <span className="hidden font-bold sm:inline-block">
              Frollie Pro
            </span>
          </Link>

          {/* Desktop Navigation */}
          {user && (
            <nav className="hidden md:flex items-center space-x-5 text-sm font-medium ml-4">
              {/* Dashboards first, then Orders top-level link, then remaining dropdowns */}
              {hasRealItems(navGroups[0].items) && (
                <DesktopDropdown
                  label={navGroups[0].label}
                  triggerIcon={navGroups[0].icon}
                  items={navGroups[0].items}
                  isActive={isActive}
                  isDropdownActive={isDropdownActive}
                />
              )}

              {visibleMainItems.map((item) => {
                if (isSeparator(item)) return null;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onMouseEnter={() => item.preload?.()}
                    onFocus={() => item.preload?.()}
                    className={cn(
                      "flex items-center space-x-1.5 transition-colors hover:text-foreground/80",
                      isActive(item.path) ? "text-foreground" : "text-foreground/60"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              {navGroups.slice(1).map(group =>
                hasRealItems(group.items) && (
                  <DesktopDropdown
                    key={group.label}
                    label={group.label}
                    triggerIcon={group.icon}
                    items={group.items}
                    isActive={isActive}
                    isDropdownActive={isDropdownActive}
                  />
                )
              )}
            </nav>
          )}
        </div>

        {/* User menu */}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                'rounded-full font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                ROLE_COLORS[user.role].bg, ROLE_COLORS[user.role].text,
              )}>
                {/* Narrow: initials only */}
                <span className="sm:hidden flex items-center justify-center w-8 h-8 text-xs font-semibold">
                  {user.name.slice(0, 2).toUpperCase()}
                </span>
                {/* Wide: full name pill */}
                <span className="hidden sm:inline-block px-3 py-1 text-sm">
                  {user.name}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                className="cursor-pointer"
              >
                {resolvedTheme === 'dark' ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
                {resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={logout}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </motion.header>
  );
}

// ---- Local presentational helpers ---------------------------------------

type DesktopDropdownProps = {
  label: string;
  triggerIcon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  isActive: (path: string) => boolean;
  isDropdownActive: (items: NavItem[]) => boolean;
};

function DesktopDropdown({ label, triggerIcon: TriggerIcon, items, isActive, isDropdownActive }: DesktopDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center space-x-1.5 transition-colors hover:text-foreground/80 outline-none",
            isDropdownActive(items) ? "text-foreground" : "text-foreground/60"
          )}
        >
          <TriggerIcon className="h-4 w-4" />
          <span>{label}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {items.map((item, idx) => {
          if (isSeparator(item)) {
            return <DropdownMenuSeparator key={`sep-${idx}`} />;
          }
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.path} asChild>
              <Link
                to={item.path}
                onMouseEnter={() => item.preload?.()}
                onFocus={() => item.preload?.()}
                className={cn(
                  "flex items-center space-x-2 w-full",
                  isActive(item.path) && "font-medium"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type MobileSectionProps = {
  title: string;
  items: NavItem[];
  isActive: (path: string) => boolean;
  onNavigate: () => void;
};

function MobileSection({ title, items, isActive, onNavigate }: MobileSectionProps) {
  return (
    <>
      <div className="pt-3 pb-1 px-3 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
        {title}
      </div>
      {items.map((item, idx) => {
        if (isSeparator(item)) {
          return <div key={`sep-${idx}`} className="h-px bg-border my-1 mx-3" />;
        }
        return renderMobileItem(item, isActive, onNavigate);
      })}
    </>
  );
}

function renderMobileItem(item: NavLink, isActive: (path: string) => boolean, onNavigate: () => void) {
  const Icon = item.icon;
  return (
    <Link
      key={item.path}
      to={item.path}
      onClick={onNavigate}
      onMouseEnter={() => item.preload?.()}
      onFocus={() => item.preload?.()}
      className={cn(
        "flex items-center space-x-3 px-3 py-2 rounded-md transition-colors hover:bg-accent",
        isActive(item.path) ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground"
      )}
    >
      <Icon className="h-5 w-5" />
      <span>{item.label}</span>
    </Link>
  );
}
