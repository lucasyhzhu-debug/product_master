import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  TrendingUp,
  ShoppingCart,
  UtensilsCrossed,
  Warehouse,
  MoreHorizontal,
  Circle,
  MessageSquare,
  Tag,
  Ticket,
  Users,
  Contact,
  Store,
  Receipt,
  BarChart3,
  FileText,
  HandCoins,
  Landmark,
  DollarSign,
  Building2,
  BookMarked,
  FileUp,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_PERMISSIONS } from '@/lib/types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type PermissionKey = keyof (typeof ROLE_PERMISSIONS)['admin'];

interface TabItem {
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  permission: PermissionKey;
  preload?: () => void;
}

// Prefetch factories for primary tabs
const _prefetchOrders = () => import('@/pages/OrderManager');
const _prefetchKitchen = () => import('@/pages/KitchenViewV2');
const _prefetchInventory = () => import('@/pages/InventoryManager');

const primaryTabs: TabItem[] = [
  { path: '/sales', icon: TrendingUp, label: 'Sales', permission: 'canAccessSalesAnalytics' },
  { path: '/orders', icon: ShoppingCart, label: 'Orders', permission: 'canAccessOrders', preload: _prefetchOrders },
  { path: '/kitchen', icon: UtensilsCrossed, label: 'Kitchen', permission: 'canAccessKitchen', preload: _prefetchKitchen },
  { path: '/inventory', icon: Warehouse, label: 'Inventory', permission: 'canAccessInventory', preload: _prefetchInventory },
];

const moreItems: TabItem[] = [
  { path: '/expenses', icon: Receipt, label: 'Expenses', permission: 'canSubmitExpenses' },
  { path: '/expense-analytics', icon: BarChart3, label: 'Exp. Analytics', permission: 'canAccessExpenseAnalytics' },
  { path: '/financials', icon: FileText, label: 'Income Stmt', permission: 'canAccessDashboard' },
  { path: '/reimbursements', icon: HandCoins, label: 'Reimburse', permission: 'canManageReimbursements' },
  { path: '/bank-accounts', icon: Landmark, label: 'Bank Accts', permission: 'canManageReimbursements' },
  { path: '/payroll', icon: DollarSign, label: 'Payroll', permission: 'canManageReimbursements' },
  { path: '/journal', icon: BookMarked, label: 'Journal Entry', permission: 'canManageReimbursements' },
  { path: '/accounts', icon: Landmark, label: 'Accounts', permission: 'canManageReimbursements' },
  { path: '/import', icon: FileUp, label: 'Hist. Import', permission: 'canManageReimbursements' },
  { path: '/assets', icon: Building2, label: 'Assets', permission: 'canAccessAssets' },
  { path: '/k3mart-cockpit', icon: Store, label: 'K3 Mart', permission: 'canAccessSalesAnalytics' },
  { path: '/components/production', icon: Circle, label: 'Production', permission: 'canAccessInventory' },
  { path: '/whatsapp-templates', icon: MessageSquare, label: 'WhatsApp', permission: 'canManageWhatsAppTemplates' },
  { path: '/menu-products', icon: Tag, label: 'Products', permission: 'canAccessMenuProducts' },
  { path: '/customers', icon: Contact, label: 'Customers', permission: 'canAccessOrders' },
  { path: '/vouchers', icon: Ticket, label: 'Vouchers', permission: 'canAccessVouchers' },
  { path: '/users', icon: Users, label: 'Users', permission: 'canAccessUsers' },
];

export function MobileBottomNav() {
  const { user, hasPermission } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  // Return null if no user (not logged in)
  if (!user) return null;

  const visibleTabs = primaryTabs.filter((tab) => hasPermission(tab.permission));
  const visibleMoreItems = moreItems.filter((item) => hasPermission(item.permission));

  // If user has no permitted tabs, don't render
  if (visibleTabs.length === 0) return null;

  const showMore = visibleMoreItems.length > 0;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-background border-t md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-14">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.path === '/'}
              onMouseEnter={() => tab.preload?.()}
              onFocus={() => tab.preload?.()}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center min-w-0 flex-1 h-14 transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs mt-0.5">{tab.label}</span>
            </NavLink>
          );
        })}

        {showMore && (
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className="flex flex-col items-center justify-center min-w-0 flex-1 h-14 text-muted-foreground transition-colors"
                type="button"
              >
                <MoreHorizontal className="h-5 w-5" />
                <span className="text-xs mt-0.5">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-xl">
              <SheetHeader>
                <SheetTitle>More</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col space-y-1 mt-4 pb-4">
                {visibleMoreItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMoreOpen(false)}
                      className="flex items-center space-x-3 px-3 py-3 rounded-md transition-colors hover:bg-accent text-muted-foreground hover:text-foreground"
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-sm">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
}
