import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  ShoppingCart,
  UtensilsCrossed,
  Apple,
  PackageOpen,
  BookOpen,
  Package,
  Users,
  LogOut,
  User,
  Menu,
  MessageSquare,
  Ticket
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getRoleDisplayName } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

// Define all navigation items with permission requirements
// Items with hidden: true are temporarily disabled for all users
const allNavItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'canAccessDashboard' as const },
  { path: '/kitchen', label: 'Kitchen', icon: UtensilsCrossed, permission: 'canAccessKitchen' as const },
  { path: '/orders', label: 'Orders', icon: ShoppingCart, permission: 'canAccessOrders' as const },
  { path: '/whatsapp-templates', label: 'WhatsApp', icon: MessageSquare, permission: 'canManageWhatsAppTemplates' as const },
  { path: '/vouchers', label: 'Vouchers', icon: Ticket, permission: 'canAccessVouchers' as const },
  { path: '/recipes', label: 'Recipes', icon: BookOpen, permission: 'canAccessRecipes' as const, hidden: true },
  { path: '/packaging', label: 'Packaging', icon: Package, permission: 'canAccessRecipes' as const, hidden: true },
  { path: '/products', label: 'Products', icon: Package, permission: 'canAccessProducts' as const, hidden: true },
  { path: '/ingredients', label: 'Ingredients', icon: Apple, permission: 'canAccessIngredients' as const, hidden: true },
  { path: '/materials', label: 'Materials', icon: PackageOpen, permission: 'canAccessMaterials' as const, hidden: true },
  { path: '/users', label: 'Users', icon: Users, permission: 'canAccessUsers' as const },
];

export function Header() {
  const location = useLocation();
  const { user, logout, hasPermission } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Filter navigation items based on user permissions and hidden flag
  const navItems = user
    ? allNavItems.filter(item => !item.hidden && hasPermission(item.permission))
    : [];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        {/* Logo and brand */}
        <div className="flex items-center space-x-4">
          {/* Mobile menu button - only show if user is authenticated */}
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
                <nav className="flex flex-col space-y-3 mt-6">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path ||
                      (item.path !== '/' && location.pathname.startsWith(item.path));

                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          "flex items-center space-x-3 px-3 py-2 rounded-md transition-colors hover:bg-accent",
                          isActive ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
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

          {/* Desktop Navigation - only show if user is authenticated */}
          {user && (
            <nav className="hidden md:flex items-center space-x-6 text-sm font-medium ml-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path ||
                  (item.path !== '/' && location.pathname.startsWith(item.path));

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center space-x-2 transition-colors hover:text-foreground/80",
                      isActive ? "text-foreground" : "text-foreground/60"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        {/* User info section */}
        {user && (
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* User avatar */}
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

            {/* User name and role */}
            <div className="hidden sm:flex sm:flex-col sm:items-start">
              <div className="text-sm font-medium">{user.name}</div>
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {getRoleDisplayName(user.role)}
              </Badge>
            </div>

            {/* Logout button */}
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
