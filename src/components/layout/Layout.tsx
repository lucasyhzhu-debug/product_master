import { Outlet } from 'react-router-dom';

import { Header } from './Header';
import { Footer } from './Footer';
import { MobileBottomNav } from './MobileBottomNav';
import { PageContainer } from './PageContainer';

interface LayoutProps {
  fullWidth?: boolean;
}

export function Layout({ fullWidth = false }: LayoutProps) {
  const content = fullWidth ? <Outlet /> : <PageContainer><Outlet /></PageContainer>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-14 pb-16 md:pb-0">
        {content}
      </main>
      <Footer />
      <MobileBottomNav />
    </div>
  );
}
