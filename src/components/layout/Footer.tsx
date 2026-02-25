import { Link } from 'react-router-dom';
import { UtensilsCrossed } from 'lucide-react';

const quickLinks = [
  { path: '/sales', label: 'Sales' },
  { path: '/orders', label: 'Orders' },
  { path: '/kitchen', label: 'Kitchen' },
  { path: '/inventory', label: 'Inventory' },
];

export function Footer() {
  return (
    <footer className="hidden md:block bg-muted/30 border-t">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-3 gap-8">
          {/* Brand column */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm">Frollie Pro</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Real-time recipe and product management for the Frollie team.
            </p>
          </div>

          {/* Quick links column */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Quick Links</h3>
            <nav className="flex flex-col space-y-1">
              {quickLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Info column */}
          <div className="space-y-2 text-right">
            <p className="text-sm text-muted-foreground">
              Built with love for Frollie
            </p>
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} Frollie. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
