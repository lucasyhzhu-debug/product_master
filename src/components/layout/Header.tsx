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
  Shield,
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

type NavItem = {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: PermissionKey;
  rolesAllowed?: UserRole[];
  preload?: () => void;
};

// Prefetch factories for hover prefetching — fire-and-forget dynamic imports
const _prefetchOrders = () => import('@/pages/OrderManager');
const _prefetchKitchen = () => import('@/pages/KitchenViewV2');
const _prefetchInventory = () => import('@/pages/InventoryManager');
const _prefetchRestock = () => import('@/pages/DispatchPlanner');
const _prefetchGoFood = () => import('@/pages/GoFoodDepotManager');

// Main nav items - visible based on individual permissions
const mainNavItems: NavItem[] = [
  { path: '/sales', label: 'Sales', icon: TrendingUp, permission: 'canAccessSalesAnalytics' },
  { path: '/orders', label: 'Orders', icon: ShoppingCart, permission: 'canAccessOrders', preload: _prefetchOrders },
  { path: '/kitchen', label: 'Kitchen', icon: UtensilsCrossed, permission: 'canAccessKitchen', preload: _prefetchKitchen },
  { path: '/inventory', label: 'Inventory', icon: Warehouse, permission: 'canAccessInventory', preload: _prefetchInventory },
  { path: '/restock-planner', label: 'Planner', icon: CalendarRange, permission: 'canAccessDashboard', preload: _prefetchRestock },
  { path: '/help', label: 'Help', icon: CircleHelp },
];

// Financials dropdown - grouped financial pages
const financialItems: NavItem[] = [
  { path: '/financials', label: 'Income Statement', icon: FileText, permission: 'canAccessDashboard' },
  { path: '/expenses', label: 'Expenses', icon: Receipt, permission: 'canSubmitExpenses' },
  { path: '/expenses/approve', label: 'Approvals', icon: ClipboardCheck, permission: 'canApproveExpenses' },
  { path: '/expense-analytics', label: 'Exp. Analytics', icon: BarChart3, permission: 'canAccessExpenseAnalytics' },
  { path: '/reimbursements', label: 'Reimburse', icon: HandCoins, permission: 'canManageReimbursements' },
  { path: '/payroll', label: 'Payroll', icon: DollarSign, permission: 'canManageReimbursements' },
  { path: '/staff-performance', label: 'Staff Perf.', icon: UserCheck, permission: 'canAccessDashboard' },
];

// Accounting dropdown - journal & ledger pages
const accountingItems: NavItem[] = [
  { path: '/journal', label: 'Journal Entry', icon: BookMarked, permission: 'canManageReimbursements' },
  { path: '/accounts', label: 'Chart of Accounts', icon: Landmark, permission: 'canManageReimbursements' },
  { path: '/bank-accounts', label: 'Bank Accounts', icon: Landmark, permission: 'canManageReimbursements' },
  { path: '/bank-reconciliation', label: 'Bank Reconciliation', icon: Landmark, rolesAllowed: ['manager', 'admin'] },
  { path: '/bank-rules', label: 'Bank Rules', icon: BookMarked, rolesAllowed: ['admin'] },
  { path: '/import', label: 'Historical Import', icon: FileUp, permission: 'canManageReimbursements' },
  { path: '/assets', label: 'Asset Register', icon: Building2, permission: 'canAccessAssets' },
];

// Depot Management dropdown - Manager + Admin
const depotItems: NavItem[] = [
  { path: '/k3mart-cockpit', label: 'K3 Mart', icon: Store, permission: 'canAccessSalesAnalytics' },
  { path: '/gofood-depot', label: 'GoFood Depot', icon: Truck, permission: 'canAccessDashboard', preload: _prefetchGoFood },
  { path: '/grabfood', label: 'GrabFood', icon: UtensilsCrossed, permission: 'canAccessSalesAnalytics' },
];

// Configurations dropdown - Manager + Admin
const configItems: NavItem[] = [
  { path: '/components/production', label: 'Production', icon: Circle, permission: 'canAccessInventory' },
  { path: '/ingredients', label: 'Ingredients', icon: Leaf, permission: 'canAccessIngredients' },
  { path: '/inventory/locations', label: 'Locations', icon: MapPin, permission: 'canAccessInventory' },
  { path: '/whatsapp-templates', label: 'WhatsApp', icon: MessageSquare, permission: 'canManageWhatsAppTemplates' },
  { path: '/customers', label: 'Customers', icon: Users, permission: 'canAccessOrders' },
  { path: '/bulk-price-update', label: 'Bulk Prices', icon: Calculator, permission: 'canAccessIngredients' },
];

// Admin dropdown - Admin only
const adminItems: NavItem[] = [
  { path: '/menu-products', label: 'Products', icon: Tag, permission: 'canAccessMenuProducts' },
  { path: '/vouchers', label: 'Vouchers', icon: Ticket, permission: 'canAccessVouchers' },
  { path: '/users', label: 'Users', icon: Users, permission: 'canAccessUsers' },
  { path: '/settings/business', label: 'Settings', icon: Settings, permission: 'canAccessBusinessSettings' },
];

export function Header() {
  const location = useLocation();
  const { user, logout, hasPermission } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isVisible = useScrollDirection();

  const visibleMainItems = user
    ? mainNavItems.filter(item => !item.permission || hasPermission(item.permission))
    : [];

  const visibleDepotItems = user
    ? depotItems.filter(item => !item.permission || hasPermission(item.permission))
    : [];

  const visibleFinancialItems = user
    ? financialItems.filter(item => !item.permission || hasPermission(item.permission))
    : [];

  const visibleAccountingItems = user
    ? accountingItems.filter(item => {
        if (item.permission && !hasPermission(item.permission)) return false;
        if (item.rolesAllowed && !item.rolesAllowed.includes(user.role)) return false;
        return true;
      })
    : [];

  const visibleConfigItems = user
    ? configItems.filter(item => !item.permission || hasPermission(item.permission))
    : [];

  const visibleAdminItems = user
    ? adminItems.filter(item => !item.permission || hasPermission(item.permission))
    : [];

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  const isDropdownActive = (items: NavItem[]) =>
    items.some(item => isActive(item.path));

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
                  {/* Main items */}
                  {visibleMainItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
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
                  })}

                  {/* Financials section */}
                  {visibleFinancialItems.length > 0 && (
                    <>
                      <div className="pt-3 pb-1 px-3 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                        Financials
                      </div>
                      {visibleFinancialItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn(
                              "flex items-center space-x-3 px-3 py-2 rounded-md transition-colors hover:bg-accent",
                              isActive(item.path) ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground"
                            )}
                          >
                            <Icon className="h-5 w-5" />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </>
                  )}

                  {/* Accounting section */}
                  {visibleAccountingItems.length > 0 && (
                    <>
                      <div className="pt-3 pb-1 px-3 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                        Accounting
                      </div>
                      {visibleAccountingItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn(
                              "flex items-center space-x-3 px-3 py-2 rounded-md transition-colors hover:bg-accent",
                              isActive(item.path) ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground"
                            )}
                          >
                            <Icon className="h-5 w-5" />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </>
                  )}

                  {/* Depot Management section */}
                  {visibleDepotItems.length > 0 && (
                    <>
                      <div className="pt-3 pb-1 px-3 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                        Depot Management
                      </div>
                      {visibleDepotItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setMobileMenuOpen(false)}
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
                      })}
                    </>
                  )}

                  {/* Configurations section */}
                  {visibleConfigItems.length > 0 && (
                    <>
                      <div className="pt-3 pb-1 px-3 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                        Configurations
                      </div>
                      {visibleConfigItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn(
                              "flex items-center space-x-3 px-3 py-2 rounded-md transition-colors hover:bg-accent",
                              isActive(item.path) ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground"
                            )}
                          >
                            <Icon className="h-5 w-5" />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </>
                  )}

                  {/* Admin section */}
                  {visibleAdminItems.length > 0 && (
                    <>
                      <div className="pt-3 pb-1 px-3 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                        Admin
                      </div>
                      {visibleAdminItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn(
                              "flex items-center space-x-3 px-3 py-2 rounded-md transition-colors hover:bg-accent",
                              isActive(item.path) ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground"
                            )}
                          >
                            <Icon className="h-5 w-5" />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </>
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
              {/* Main nav items */}
              {visibleMainItems.map((item) => {
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

              {/* Financials dropdown */}
              {visibleFinancialItems.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center space-x-1.5 transition-colors hover:text-foreground/80 outline-none",
                        isDropdownActive(visibleFinancialItems) ? "text-foreground" : "text-foreground/60"
                      )}
                    >
                      <FileText className="h-4 w-4" />
                      <span>Financials</span>
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {visibleFinancialItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <DropdownMenuItem key={item.path} asChild>
                          <Link
                            to={item.path}
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
              )}

              {/* Accounting dropdown */}
              {visibleAccountingItems.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center space-x-1.5 transition-colors hover:text-foreground/80 outline-none",
                        isDropdownActive(visibleAccountingItems) ? "text-foreground" : "text-foreground/60"
                      )}
                    >
                      <Calculator className="h-4 w-4" />
                      <span>Accounting</span>
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {visibleAccountingItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <DropdownMenuItem key={item.path} asChild>
                          <Link
                            to={item.path}
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
              )}

              {/* Depot Management dropdown */}
              {visibleDepotItems.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center space-x-1.5 transition-colors hover:text-foreground/80 outline-none",
                        isDropdownActive(visibleDepotItems) ? "text-foreground" : "text-foreground/60"
                      )}
                    >
                      <Truck className="h-4 w-4" />
                      <span>Depots</span>
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {visibleDepotItems.map((item) => {
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
              )}

              {/* Configurations dropdown */}
              {visibleConfigItems.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center space-x-1.5 transition-colors hover:text-foreground/80 outline-none",
                        isDropdownActive(visibleConfigItems) ? "text-foreground" : "text-foreground/60"
                      )}
                    >
                      <Settings className="h-4 w-4" />
                      <span>Config</span>
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {visibleConfigItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <DropdownMenuItem key={item.path} asChild>
                          <Link
                            to={item.path}
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
              )}

              {/* Admin dropdown */}
              {visibleAdminItems.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center space-x-1.5 transition-colors hover:text-foreground/80 outline-none",
                        isDropdownActive(visibleAdminItems) ? "text-foreground" : "text-foreground/60"
                      )}
                    >
                      <Shield className="h-4 w-4" />
                      <span>Admin</span>
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {visibleAdminItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <DropdownMenuItem key={item.path} asChild>
                          <Link
                            to={item.path}
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
