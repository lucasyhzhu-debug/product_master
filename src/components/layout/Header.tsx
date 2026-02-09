import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  ShoppingCart,
  UtensilsCrossed,
  Users,
  LogOut,
  User,
  Menu,
  MessageSquare,
  Ticket,
  Warehouse,
  Circle,
  Tag,
  TrendingUp,
  Store,
  Settings,
  Shield,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getRoleDisplayName, ROLE_PERMISSIONS } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type PermissionKey = keyof (typeof ROLE_PERMISSIONS)["admin"];

type NavItem = {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: PermissionKey;
};

// Main nav items - visible based on individual permissions
const mainNavItems: NavItem[] = [
  { path: '/sales', label: 'Sales', icon: TrendingUp, permission: 'canAccessSalesAnalytics' },
  { path: '/orders', label: 'Orders', icon: ShoppingCart, permission: 'canAccessOrders' },
  { path: '/kitchen', label: 'Kitchen', icon: UtensilsCrossed, permission: 'canAccessKitchen' },
  { path: '/inventory', label: 'Inventory', icon: Warehouse, permission: 'canAccessInventory' },
  { path: '/restock', label: 'Restock', icon: Store, permission: 'canAccessSalesAnalytics' },
];

// Configurations dropdown - Manager + Admin
const configItems: NavItem[] = [
  { path: '/components/production', label: 'Production', icon: Circle, permission: 'canAccessInventory' },
  { path: '/whatsapp-templates', label: 'WhatsApp', icon: MessageSquare, permission: 'canManageWhatsAppTemplates' },
];

// Admin dropdown - Admin only
const adminItems: NavItem[] = [
  { path: '/menu-products', label: 'Products', icon: Tag, permission: 'canAccessMenuProducts' },
  { path: '/vouchers', label: 'Vouchers', icon: Ticket, permission: 'canAccessVouchers' },
  { path: '/users', label: 'Users', icon: Users, permission: 'canAccessUsers' },
];

export function Header() {
  const location = useLocation();
  const { user, logout, hasPermission } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleMainItems = user
    ? mainNavItems.filter(item => hasPermission(item.permission))
    : [];

  const visibleConfigItems = user
    ? configItems.filter(item => hasPermission(item.permission))
    : [];

  const visibleAdminItems = user
    ? adminItems.filter(item => hasPermission(item.permission))
    : [];

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  const isDropdownActive = (items: NavItem[]) =>
    items.some(item => isActive(item.path));

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
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
              <SheetContent side="left" className="w-64">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <UtensilsCrossed className="h-5 w-5 text-primary" />
                    Menu
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col space-y-1 mt-6">
                  {/* Main items */}
                  {visibleMainItems.map((item) => {
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
              </SheetContent>
            </Sheet>
          )}

          <div className="flex items-center space-x-2">
            <UtensilsCrossed className="h-6 w-6 text-primary" />
            <span className="hidden font-bold sm:inline-block">
              Frollie Recipe Master
            </span>
          </div>

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

        {/* User info section */}
        {user && (
          <div className="flex items-center space-x-2 sm:space-x-4">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
            )}

            <div className="hidden sm:flex sm:flex-col sm:items-start">
              <div className="text-sm font-medium">{user.name}</div>
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {getRoleDisplayName(user.role)}
              </Badge>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title="Sign out"
              className="h-9 w-9"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
